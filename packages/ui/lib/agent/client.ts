import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { NETWORK, appBaseUrl } from "../config";
import { policy, toAtomic, fromAtomic } from "../policy";
import { emit, newId, recordSpend } from "../store";
import { evaluate } from "../guardian/evaluate";
import { consumeApproval, requestApproval, waitForApproval } from "../guardian/approval";
import { agentAccount } from "./wallet";
import type { Scenario } from "./scenarios";
import { revokeSpendRole } from "../ens/admin";
import { ownerConfigured } from "../ens/client";
import { ensConfigured } from "../ens/names";

/**
 * The paying agent. It uses the stock x402 client, but every payment goes
 * through the Guardian in `onBeforePaymentCreation` — the hook the SDK fires
 * after the 402 is parsed and *before* the EIP-3009 authorization is signed.
 *
 * Returning `{ abort: true, reason }` from that hook means no signature is ever
 * produced, so a blocked payment is not "a payment that failed", it is a
 * payment that never existed.
 */
export function createGuardedClient(runId: string) {
  const client = new x402Client()
    .register(NETWORK, new ExactEvmScheme(agentAccount))
    // The Guardian owns spend limits; disable the SDK's own $1 default cap so
    // the over-cap scenario reaches the policy engine instead of the SDK.
    .setSpendControls(false);

  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements: req }) => {
    emit({
      runId,
      kind: "quote",
      level: "info",
      title: `402 Payment Required — ${fromAtomic(req.amount)} ${policy.assetSymbol}`,
      detail: `payTo ${req.payTo} · asset ${req.asset} · ${req.network}`,
      data: { paymentRequired, selected: req },
    });

    const decision = await evaluate(runId, agentAccount.address, paymentRequired, req);

    if (decision.verdict === "allow") return;

    if (decision.verdict === "deny") {
      emit({
        runId,
        kind: "blocked",
        level: "danger",
        title: "Payment refused before signing",
        detail: decision.reason,
        data: { decision },
      });
      return { abort: true, reason: decision.reason };
    }

    const approval = requestApproval(runId, decision, policy.agent);
    const resolved = await waitForApproval(approval.id);

    if (resolved.status !== "approved") {
      emit({
        runId,
        kind: "blocked",
        level: "danger",
        title: `Approval ${resolved.status} — payment refused`,
        detail: decision.reason,
        data: { approvalId: approval.id, status: resolved.status },
      });
      return { abort: true, reason: `owner ${resolved.status}: ${decision.reason}` };
    }
    try {
      consumeApproval(approval.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "approval could not be consumed";
      emit({ runId, kind: "blocked", level: "danger", title: "Approval could not be consumed — payment refused", detail: reason });
      return { abort: true, reason };
    }

    const limit = toAtomic(resolved.approvedLimit ?? fromAtomic(req.amount));
    if (BigInt(req.amount) > limit) {
      const reason = `approved one-time limit ${fromAtomic(limit)} ${policy.assetSymbol} < quote ${fromAtomic(req.amount)}`;
      emit({ runId, kind: "blocked", level: "danger", title: "Approved limit too low — payment refused", detail: reason });
      return { abort: true, reason };
    }
    return;
  });

  client.onAfterPaymentCreation(async ({ paymentPayload, selectedRequirements: req }) => {
    const auth = (paymentPayload.payload as { authorization?: Record<string, string>; signature?: string }) ?? {};
    emit({
      runId,
      kind: "sign",
      level: "ok",
      title: `Signed TransferWithAuthorization for ${fromAtomic(req.amount)} ${policy.assetSymbol}`,
      detail: `nonce ${auth.authorization?.nonce ?? "?"} · sig ${(auth.signature ?? "").slice(0, 18)}…`,
      data: { authorization: auth.authorization, signature: auth.signature },
    });
  });

  client.onPaymentResponse(async ({ settleResponse, requirements, paymentRequired, error }) => {
    if (settleResponse?.success) {
      recordSpend({
        runId,
        resource: paymentRequired?.resource?.url ?? "",
        payTo: requirements.payTo,
        amountAtomic: requirements.amount,
        txHash: settleResponse.transaction,
      });
      emit({
        runId,
        kind: "settled",
        level: "ok",
        title: `Settled on ${settleResponse.network}`,
        detail: `tx ${settleResponse.transaction}`,
        data: { settleResponse },
      });
    } else {
      emit({
        runId,
        kind: "error",
        level: "danger",
        title: "Payment not settled",
        detail:
          settleResponse?.errorReason ??
          paymentRequired?.error ??
          error?.message ??
          "facilitator rejected the payment",
        data: { settleResponse, paymentRequired },
      });
    }
  });

  return client;
}

export type RunResult = {
  runId: string;
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
};

export async function runScenario(scenario: Scenario): Promise<RunResult> {
  const runId = newId("run");
  const url = `${appBaseUrl()}${scenario.path}`;
  emit({
    runId,
    kind: "run.start",
    level: "info",
    title: scenario.title,
    detail: `agent ${agentAccount.address} → GET ${scenario.path}`,
    data: { scenario: scenario.id },
  });

  if (scenario.preStep === "revoke-spend") {
    if (!ensConfigured() || !ownerConfigured()) {
      emit({ runId, kind: "ens", level: "warn", title: "Kill switch skipped — ENS owner key or registry not configured", detail: "set ENS_OWNER_PRIVATE_KEY, ENS_USER_REGISTRY, ENS_RESOLVER" });
    } else {
      emit({ runId, kind: "ens", level: "warn", title: "Owner is revoking the spend role on Sepolia…", detail: `revokeRoles(labelhash(agent), ROLE_SPEND, ${agentAccount.address})` });
      try {
        const tx = await revokeSpendRole(agentAccount.address);
        emit({ runId, kind: "ens", level: "danger", title: "Spend role revoked on chain", detail: `tx ${tx}`, data: { tx } });
      } catch (e) {
        emit({ runId, kind: "error", level: "danger", title: "Revoke failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const client = createGuardedClient(runId);
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  try {
    const res = await fetchWithPayment(url, { method: "GET", headers: { Accept: "application/json" } });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    emit({
      runId,
      kind: "run.end",
      level: res.ok ? "ok" : "warn",
      title: `Resource responded ${res.status}`,
      detail: res.ok ? "agent received the paid content" : String(text).slice(0, 200),
      data: { status: res.status, body },
    });
    return { runId, ok: res.ok, status: res.status, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emit({
      runId,
      kind: "run.end",
      level: "danger",
      title: msg.includes("Payment creation aborted") ? "Run ended: payment aborted by Guardian" : "Run ended with error",
      detail: msg,
    });
    return { runId, ok: false, error: msg };
  }
}
