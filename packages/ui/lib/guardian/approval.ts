import { APPROVAL_TIMEOUT_MS } from "../config";
import { fromAtomic } from "../policy";
import { addApproval, bus, emit, getApproval, newId, updateApproval, type ApprovalRequest, type ApprovalStatus } from "../store";
import type { GuardianDecision } from "./types";
import {
  approvalSignal,
  proofMatches,
  signApproval,
  verifyWorldId,
  type IdKitResult,
  type WorldLaunch,
} from "./worldid";

export type ApprovalBinding = {
  runId: string;
  agent: string;
  amount: string;
  asset: string;
  payTo: string;
  network: string;
  reason: string;
  resource: string;
  decision: "soft_fail";
};

export type PublicWorld = {
  appId: string;
  rpId: string;
  action: string;
  signal: string;
  environment: WorldLaunch["environment"];
  rpContext: WorldLaunch["rpContext"];
};

export type PublicApproval = {
  id: string;
  status: ApprovalStatus;
  agent: string;
  amount: string;
  asset: string;
  payTo: string;
  network: string;
  reason: string;
  resource: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
  nullifier?: string;
  world: PublicWorld;
};

export function publicApproval(a: ApprovalRequest): PublicApproval {
  return {
    id: a.id,
    status: a.status,
    agent: a.agent,
    amount: a.quote.amountAtomic,
    asset: a.quote.asset,
    payTo: a.quote.payTo,
    network: a.quote.network,
    reason: a.reason,
    resource: a.quote.resource,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
    consumed: Boolean(a.consumedAt),
    nullifier: a.nullifier,
    world: {
      appId: a.launch.appId,
      rpId: a.launch.rpId,
      action: a.launch.action,
      signal: a.launch.signal,
      environment: a.launch.environment,
      rpContext: a.launch.rpContext,
    },
  };
}

export function rejectClientApprovalFlag(body: { approved?: unknown; action?: string }) {
  if (body.approved === true || body.action === "dev-approve" || body.action === "dev-deny") {
    throw new Error("client approval flags are not accepted");
  }
}

export function createSoftFailApproval(input: ApprovalBinding): ApprovalRequest {
  if (input.decision !== "soft_fail") throw new Error("approval is only for soft_fail");
  const now = Date.now();
  const id = newId("apr");
  const reason = input.reason;
  const signal = approvalSignal({
    id,
    agent: input.agent,
    amount: input.amount,
    asset: input.asset,
    payTo: input.payTo,
    reason,
  });
  const launch = signApproval(signal);
  const signatureExpiry = launch.rpContext.expires_at * 1000;
  const expiresAt = new Date(Math.min(now + APPROVAL_TIMEOUT_MS, signatureExpiry)).toISOString();
  const decision: GuardianDecision = {
    verdict: "ask_human",
    reason,
    checks: [{ name: "perTxMax", status: "soft_fail", detail: reason }],
    quote: {
      resource: input.resource,
      payTo: input.payTo,
      amountAtomic: input.amount,
      amountDisplay: fromAtomic(input.amount),
      asset: input.asset,
      network: input.network,
    },
    policyHash: "",
    mandateSource: "ens",
    evaluatedAt: new Date(now).toISOString(),
  };
  const approval: ApprovalRequest = {
    id,
    runId: input.runId,
    agent: input.agent,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    status: "pending",
    reason,
    decision,
    quote: decision.quote,
    launch,
  };
  addApproval(approval);
  emit({
    runId: input.runId,
    kind: "approval.requested",
    level: "warn",
    title: "Waiting for owner — World ID approval requested",
    detail: `${decision.quote.amountDisplay} → ${input.payTo}. ${reason}`,
    data: { approvalId: id, expiresAt },
  });
  return approval;
}

export function requestApproval(runId: string, decision: GuardianDecision, agentName: string): ApprovalRequest {
  if (decision.verdict !== "ask_human") throw new Error("approval is only for soft_fail");
  if (decision.checks.some((check) => check.status === "hard_fail")) {
    throw new Error("hard_fail cannot request approval");
  }
  return createSoftFailApproval({
    runId,
    agent: agentName,
    amount: decision.quote.amountAtomic,
    asset: decision.quote.asset,
    payTo: decision.quote.payTo,
    network: decision.quote.network,
    reason: decision.reason,
    resource: decision.quote.resource,
    decision: "soft_fail",
  });
}

function settle(id: string, status: ApprovalStatus, error?: string, extra: Partial<ApprovalRequest> = {}) {
  const current = getApproval(id);
  if (!current || current.status !== "pending") return current;
  const updated = updateApproval(id, {
    status,
    resolvedAt: new Date().toISOString(),
    error,
    approvedLimit: status === "approved" ? fromAtomic(current.quote.amountAtomic) : undefined,
    ...extra,
  });
  if (!updated) return updated;
  emit({
    runId: updated.runId,
    kind: "approval.resolved",
    level: status === "approved" ? "ok" : "danger",
    title:
      status === "approved"
        ? "Owner APPROVED — World ID proof validated in backend"
        : status === "denied"
          ? "Owner DENIED — payment refused"
          : status === "expired"
            ? "World ID request EXPIRED — payment refused"
            : "World ID proof INVALID — payment refused",
    detail: error ?? "",
    data: { approvalId: id, status },
  });
  return updated;
}

export async function submitProof(id: string, proof: IdKitResult): Promise<ApprovalRequest> {
  const current = getApproval(id);
  if (!current) throw new Error("approval not found");
  if (current.status !== "pending") throw new Error(`approval already ${current.status}`);
  const mismatch = proofMatches(current.launch, proof);
  if (mismatch) {
    settle(id, "invalid", mismatch);
    throw new Error(mismatch);
  }
  try {
    const verified = await verifyWorldId(proof);
    const updated = settle(id, "approved", undefined, { nullifier: verified.nullifier });
    if (!updated || updated.status !== "approved") throw new Error("approval was not approved");
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "world id verify failed";
    if (message.startsWith("approval")) throw error;
    settle(id, "invalid", message);
    throw new Error(message);
  }
}

export function cancelApproval(id: string): ApprovalRequest {
  const current = getApproval(id);
  if (!current) throw new Error("approval not found");
  if (current.status !== "pending") throw new Error(`approval already ${current.status}`);
  const updated = settle(id, "denied", "cancelled");
  if (!updated) throw new Error("approval not found");
  return updated;
}

export function consumeApproval(id: string): ApprovalRequest {
  const current = getApproval(id);
  if (!current) throw new Error("approval not found");
  if (Date.parse(current.expiresAt) < Date.now()) throw new Error("approval expired");
  if (current.consumedAt) throw new Error("approval already consumed");
  if (current.status !== "approved") throw new Error(`approval ${current.status}`);
  const updated = updateApproval(id, { consumedAt: new Date().toISOString() });
  if (!updated) throw new Error("approval not found");
  return updated;
}

export function waitForApproval(id: string): Promise<ApprovalRequest> {
  return new Promise((resolve) => {
    const existing = getApproval(id);
    if (existing && existing.status !== "pending") return resolve(existing);

    const timeout = setTimeout(() => {
      bus.off("approval", onApproval);
      const current = getApproval(id);
      if (current && current.status !== "pending") return resolve(current);
      const expired = updateApproval(id, { status: "expired", resolvedAt: new Date().toISOString() });
      if (expired) resolve(expired);
    }, APPROVAL_TIMEOUT_MS + 1000);

    function onApproval(approval: ApprovalRequest) {
      if (approval.id !== id || approval.status === "pending") return;
      clearTimeout(timeout);
      bus.off("approval", onApproval);
      resolve(approval);
    }
    bus.on("approval", onApproval);
  });
}
