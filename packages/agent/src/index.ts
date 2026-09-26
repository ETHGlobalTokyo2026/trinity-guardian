// Agent = x402 buyer (real @x402/fetch) + Guardian gate before signing.
//
// Flow per purchase (AG-003):
//   1. plain fetch → 402 → decode quote
//   2. Guardian.checkPolicy
//   3. pass → fetchWithPayment (EIP-3009) → facilitator settle → 200
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createGuardian } from "@trinity/guardian";
import { privateKeyToAccount } from "viem/accounts";
import { decodeQuote, pickAccept } from "./quote.js";
import { SpendAccumulator } from "./spend.js";
import type {
  AskHuman,
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

// per-agent demo policies — momo: spend role active, rogue: revoked (kill switch, Act 4)
// keyed by subname (full name from createAgent); swap point: chain reader per
// migration/onchain-policy.md
const DEMO_POLICIES: Record<string, { roleActive: boolean; perTxMax: bigint; dailyCap: bigint; allowedAsset: string }> = {
  "momo.agents.trinityguard.eth": { roleActive: true, perTxMax: 5_000_000n, dailyCap: 50_000_000n, allowedAsset: "" },
  "rogue.agents.trinityguard.eth": { roleActive: false, perTxMax: 0n, dailyCap: 0n, allowedAsset: "" },
};

const FLAGGED = new Set<string>(
  (process.env.SELLER_ADDRESS_B ? [process.env.SELLER_ADDRESS_B.toLowerCase()] : [])
);

function readDemoPolicy(subname: string) {
  return Promise.resolve(DEMO_POLICIES[subname] ?? null); // null = authority missing → guardian hard_fails
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
    readPolicy: readDemoPolicy,
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
        const askHuman: AskHuman | undefined = opts.askHuman;
        const approved = (await askHuman?.(reqs, verdict.reasons)) ?? false;
        emit({ type: "approval_response", resource, approved });
        if (!approved) {
          emit({ type: "refused", resource, reason: "owner denied via World ID [mock]" });
          return { status: "refused", payTo: reqs.payTo, amount: reqs.amount, reason: "owner denied via World ID [mock]", spendState: accumulator.get() };
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
