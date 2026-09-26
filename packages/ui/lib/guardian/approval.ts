import { APPROVAL_TIMEOUT_MS } from "../config";
import { addApproval, bus, emit, getApproval, newId, updateApproval, type ApprovalRequest } from "../store";
import type { GuardianDecision } from "./types";
import { pollDeviceApproval, startDeviceApproval, worldIdConfigured, worldIdDevBypass } from "./worldid";
import { fromAtomic } from "../policy";

/** device_code is secret: kept only in process memory, keyed by approval id. */
const g = globalThis as unknown as { __deviceCodes?: Map<string, string> };
if (!g.__deviceCodes) g.__deviceCodes = new Map();
const deviceCodes = g.__deviceCodes;

/**
 * Human-in-the-loop escalation. The Guardian creates a pending request, the
 * owner sees it on the dashboard, proves they are a real human with World ID,
 * and approves (with a one-time limit) or denies. The agent's payment thread
 * is parked on a promise until then.
 */
export function requestApproval(runId: string, decision: GuardianDecision): ApprovalRequest {
  const now = Date.now();
  const a: ApprovalRequest = {
    id: newId("apr"),
    runId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + APPROVAL_TIMEOUT_MS).toISOString(),
    status: "pending",
    reason: decision.reason,
    decision,
    quote: decision.quote,
  };
  addApproval(a);
  emit({
    runId,
    kind: "approval.requested",
    level: "warn",
    title: "Waiting for owner — World ID approval requested",
    detail: `${a.quote.amountDisplay} → ${a.quote.payTo}. ${decision.reason}`,
    data: { approvalId: a.id, expiresAt: a.expiresAt },
  });
  void attachWorldId(a);
  return a;
}

/**
 * Start the World ID device-authorization grant for this approval and poll it
 * until the human approves, denies, or it expires.
 */
async function attachWorldId(a: ApprovalRequest) {
  if (!worldIdConfigured()) {
    updateApproval(a.id, {
      worldId: {
        userCode: "—",
        verificationUri: "",
        verificationUriComplete: "",
        expiresAt: a.expiresAt,
        intervalSec: 0,
        mode: worldIdDevBypass() ? "dev-bypass" : "unconfigured",
        error: worldIdDevBypass()
          ? "WORLD_CLIENT_ID/SECRET not set — dev bypass active"
          : "WORLD_CLIENT_ID/SECRET not set — cannot ask the owner; request will expire",
      },
    });
    return;
  }
  let device;
  try {
    device = await startDeviceApproval();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    updateApproval(a.id, {
      worldId: { userCode: "—", verificationUri: "", verificationUriComplete: "", expiresAt: a.expiresAt, intervalSec: 0, mode: "world-id", error },
    });
    emit({ runId: a.runId, kind: "error", level: "danger", title: "World ID device authorization failed", detail: error });
    return;
  }
  deviceCodes.set(a.id, device.device_code);
  const expiresAt = new Date(Date.now() + device.expires_in * 1000).toISOString();
  updateApproval(a.id, {
    worldId: {
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      verificationUriComplete: device.verification_uri_complete,
      expiresAt,
      intervalSec: device.interval,
      mode: "world-id",
      lastPoll: "authorization_pending",
    },
  });
  emit({
    runId: a.runId,
    kind: "approval.requested",
    level: "info",
    title: "World ID device code issued",
    detail: "owner scans the QR on the dashboard with the sandbox World App",
    data: { approvalId: a.id },
  });

  let intervalMs = Math.max(device.interval, 1) * 1000;
  const deadline = Math.min(Date.parse(expiresAt), Date.parse(a.expiresAt));
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const current = getApproval(a.id);
    if (!current || current.status !== "pending") return; // cancelled / expired elsewhere
    let poll;
    try {
      poll = await pollDeviceApproval(device.device_code);
    } catch (e) {
      // signature / claim validation failure: treat as denied, never as approval
      const error = e instanceof Error ? e.message : String(e);
      finishWorldId(a, "denied", { error, lastPoll: "invalid_id_token" });
      return;
    }
    switch (poll.status) {
      case "pending":
        updateApproval(a.id, { worldId: { ...current.worldId!, lastPoll: "authorization_pending" } });
        continue;
      case "slow_down":
        intervalMs += 5000;
        updateApproval(a.id, { worldId: { ...current.worldId!, lastPoll: "slow_down" } });
        continue;
      case "unavailable":
        updateApproval(a.id, { worldId: { ...current.worldId!, lastPoll: "unavailable (503/429)" } });
        continue;
      case "approved":
        finishWorldId(a, "approved", { sub: poll.sub, authTime: poll.authTime, acr: poll.acr, lastPoll: "approved" });
        return;
      case "denied":
        finishWorldId(a, "denied", { lastPoll: "access_denied" });
        return;
      case "expired":
        finishWorldId(a, "expired", { lastPoll: "expired_token" });
        return;
      case "invalid":
        finishWorldId(a, "denied", { lastPoll: poll.error ?? "invalid_grant", error: poll.error });
        return;
    }
  }
  finishWorldId(a, "expired", { lastPoll: "deadline reached" });
}

function finishWorldId(
  a: ApprovalRequest,
  status: "approved" | "denied" | "expired",
  extra: Partial<NonNullable<ApprovalRequest["worldId"]>>,
) {
  deviceCodes.delete(a.id);
  const current = getApproval(a.id);
  if (!current || current.status !== "pending") return;
  updateApproval(a.id, {
    status,
    resolvedAt: new Date().toISOString(),
    // one-time limit = exactly the quoted amount; the owner approved *this* payment, not a budget
    approvedLimit: status === "approved" ? fromAtomic(a.quote.amountAtomic) : undefined,
    worldId: { ...current.worldId!, ...extra },
  });
  emit({
    runId: a.runId,
    kind: "approval.resolved",
    level: status === "approved" ? "ok" : "danger",
    title:
      status === "approved"
        ? "Owner APPROVED — World ID proof validated in backend"
        : status === "denied"
          ? `Owner DENIED via World ID${extra.error ? " (validation failed)" : ""}`
          : "World ID request EXPIRED — payment refused",
    detail:
      status === "approved"
        ? `sub ${short(extra.sub ?? "")} · acr ${extra.acr ?? "?"} · auth_time ${extra.authTime ? new Date(extra.authTime * 1000).toISOString() : "?"}`
        : extra.error ?? extra.lastPoll ?? "",
    data: { approvalId: a.id, status, ...extra },
  });
}

/** Owner cancels from the dashboard: the protected action must not occur. */
export function cancelApproval(id: string): ApprovalRequest {
  const a = getApproval(id);
  if (!a) throw new Error("approval not found");
  if (a.status !== "pending") throw new Error(`approval already ${a.status}`);
  deviceCodes.delete(id);
  const updated = updateApproval(id, {
    status: "denied",
    resolvedAt: new Date().toISOString(),
    worldId: { ...(a.worldId ?? { userCode: "—", verificationUri: "", verificationUriComplete: "", expiresAt: a.expiresAt, intervalSec: 0 }), mode: "cancelled", lastPoll: "cancelled" },
  })!;
  emit({ runId: a.runId, kind: "approval.resolved", level: "danger", title: "Owner CANCELLED the request — payment refused", data: { approvalId: id } });
  return updated;
}

/** Dev-only: resolve without a proof. Refuses to run when a real World ID client is configured. */
export function devResolveApproval(id: string, decision: "approved" | "denied"): ApprovalRequest {
  if (!worldIdDevBypass()) throw new Error("dev bypass is disabled");
  const a = getApproval(id);
  if (!a) throw new Error("approval not found");
  if (a.status !== "pending") throw new Error(`approval already ${a.status}`);
  const updated = updateApproval(id, {
    status: decision,
    resolvedAt: new Date().toISOString(),
    approvedLimit: decision === "approved" ? fromAtomic(a.quote.amountAtomic) : undefined,
    worldId: { ...(a.worldId ?? { userCode: "—", verificationUri: "", verificationUriComplete: "", expiresAt: a.expiresAt, intervalSec: 0 }), mode: "dev-bypass", lastPoll: decision },
  })!;
  emit({
    runId: a.runId,
    kind: "approval.resolved",
    level: decision === "approved" ? "warn" : "danger",
    title: `DEV BYPASS: owner ${decision} (no World ID proof)`,
    data: { approvalId: id },
  });
  return updated;
}

export function waitForApproval(id: string): Promise<ApprovalRequest> {
  return new Promise((resolve) => {
    const existing = getApproval(id);
    if (existing && existing.status !== "pending") return resolve(existing);

    const timeout = setTimeout(() => {
      bus.off("approval", onApproval);
      const a = updateApproval(id, { status: "expired", resolvedAt: new Date().toISOString() });
      if (a) resolve(a);
    }, APPROVAL_TIMEOUT_MS + 1000);

    function onApproval(a: ApprovalRequest) {
      if (a.id !== id || a.status === "pending") return;
      clearTimeout(timeout);
      bus.off("approval", onApproval);
      resolve(a);
    }
    bus.on("approval", onApproval);
  });
}

function short(s: string) {
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}
