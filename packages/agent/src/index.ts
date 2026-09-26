// Agent = x402 buyer (real @x402/fetch) + Guardian gate before signing.
//
// Flow per purchase (AG-003):
//   1. plain fetch → 402 → decode quote
//   2. Guardian.checkPolicy
//   3. pass → fetchWithPayment (EIP-3009) → facilitator settle → 200
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createEnsClient, readPolicyText } from "@trinity-guardian/ens";
import { createGuardian } from "@trinity/guardian";
import { privateKeyToAccount } from "viem/accounts";
import { resumeAfterVerdict } from "./approval-gate.js";
import { decodeQuote, pickAccept } from "./quote.js";
import { SpendAccumulator } from "./spend.js";
import type {
  BuyOptions,
  BuyResult,
  PaymentEvent,
  PaymentEventHandler,
  SpendState,
} from "./types.js";

export interface Agent {
  name: string;
  address: string;
  buy(resource: string, opts?: BuyOptions): Promise<BuyResult>;
  getSpendState(): SpendState;
  onPaymentEvent(handler: PaymentEventHandler): () => void;
}

const FLAGGED = new Set<string>(
  (process.env.SELLER_ADDRESS_B ? [process.env.SELLER_ADDRESS_B.toLowerCase()] : [])
);

async function readOnchainPolicy(subname: string) {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
  return readPolicyText(createEnsClient(rpcUrl), subname);
}

export async function createAgent(name: string, privateKey: `0x${string}`): Promise<Agent> {
  const signer = privateKeyToAccount(privateKey);

  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(signer) }],
    spendControls: {
      maxAmountPerPayment: "$50", // SDK ceiling = dailyCap; Guardian's $5 perTxMax is the soft-fail line
    },
  });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const guardian = createGuardian({
    agentSubname: name,
    readPolicy: readOnchainPolicy,
    isFlagged: (payTo) => FLAGGED.has(payTo.toLowerCase()),
  });

  const accumulator = new SpendAccumulator();
  const handlers = new Set<PaymentEventHandler>();
  const emit = (event: Omit<PaymentEvent, "timestamp" | "agentName">) => {
    const full: PaymentEvent = { ...event, timestamp: new Date(), agentName: name };
    handlers.forEach((h) => h(full));
  };

  return {
    name,
    address: signer.address,

    onPaymentEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    getSpendState() {
      return accumulator.get();
    },

    async buy(resource, opts = {}) {
      const url = `http://127.0.0.1:${process.env.SELLER_PORT || 4020}${resource}`;
      emit({ type: "quote_received", resource });

      const q = await fetch(url);
      if (q.status !== 402)
        return { status: "unexpected", reason: `http ${q.status}`, spendState: accumulator.get() };

      const quote = decodeQuote(q.headers.get("payment-required")!);
      const reqs = pickAccept(quote);
      emit({ type: "quote_received", resource, payTo: reqs.payTo, amount: reqs.amount, asset: reqs.asset, network: reqs.network });

      emit({ type: "guardian_checking", resource });
      const verdict = await guardian.checkPolicy(reqs, accumulator.dailySpend());
      emit({ type: "guardian_verdict", resource, verdict, payTo: reqs.payTo, amount: reqs.amount });

      if (verdict.decision === "hard_fail") {
        emit({ type: "refused", resource, reason: verdict.reasons.join("; ") });
        return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason: verdict.reasons.join("; "), spendState: accumulator.get() };
      }

      if (verdict.decision === "soft_fail") {
        emit({ type: "approval_requested", resource, approvalRequested: true, reason: verdict.reasons.join("; ") });
        if (!opts.approval) {
          emit({ type: "refused", resource, reason: "World ID approval is not configured" });
          return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason: "World ID approval is not configured", spendState: accumulator.get() };
        }
        const gate = await resumeAfterVerdict(verdict, reqs, name, resource, opts.approval);
        emit({ type: "approval_response", resource, approved: gate.resume });
        if (!gate.resume) {
          const reason = gate.reason ?? "owner denied";
          emit({ type: "refused", resource, reason });
          return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason, spendState: accumulator.get() };
        }
      }

      emit({ type: "signing", resource });
      const p = await fetchWithPayment(url, { method: "GET" }).catch((e: Error) => {
        emit({ type: "refused", resource, reason: `sign/settle failed: ${e.message}` });
        return null;
      });
      if (!p)
        return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason: "sign/settle failed", spendState: accumulator.get() };

      const settled = p.headers.get("payment-response");
      if (!p.ok || !settled) {
        emit({ type: "refused", resource, reason: `http ${p.status} — payment not settled` });
        return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason: `http ${p.status} — payment not settled`, spendState: accumulator.get() };
      }

      const body = await p.json().catch(() => ({}));
      const parsed = JSON.parse(Buffer.from(settled, "base64").toString()) as { txHash?: string };
      const spendState = accumulator.record(BigInt(reqs.amount));
      emit({ type: "paid", resource, txHash: parsed.txHash, payTo: reqs.payTo, amount: reqs.amount });

      return { status: "paid", payTo: reqs.payTo, amount: reqs.amount, txHash: parsed.txHash, reason: JSON.stringify(body), spendState };
    },
  };
}
