"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitDebugReport, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import type { PublicApproval } from "@/lib/guardian/approval";
import { CopyText } from "./primitives";
import { fmt } from "./utils";

const POLL_MS = 2000;

const STATUS_TEXT: Record<PublicApproval["status"], string> = {
  pending: "waiting for a World ID proof",
  approved: "approved — the agent pays next",
  denied: "cancelled by the owner",
  expired: "request expired",
  invalid: "the proof did not match this payment",
};

/** POST an approval action and return the updated approval, or the backend's error message. */
async function approvalAction(id: string, body: object): Promise<{ ok: true; approval: PublicApproval } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api/approvals/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as PublicApproval & { error?: string };
  if (!res.ok) return { ok: false, status: res.status, error: payload.error ?? `request failed (${res.status})` };
  return { ok: true, approval: payload };
}

/**
 * Layer 3 on the dashboard. Same flow as the reference VerifyPanel: on click,
 * ask the server for a freshly signed RP context (action "launch"), mount the
 * IDKit widget only once that config exists, then hand the raw result back.
 * The backend verifies the proof and releases the payment; this component
 * never approves or consumes.
 */
export function WorldIdConnect({ approvalId, configured }: { approvalId: string; configured: boolean }) {
  const [approval, setApproval] = useState<PublicApproval | null>(null);
  const [launch, setLaunch] = useState<PublicApproval["world"] | null>(null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  // a 409 "already approved" from handleVerify is a finished approval, not a failure
  const alreadySettled = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/approvals/${approvalId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "approval not found" : `could not load the approval (${res.status})`);
      return;
    }
    setApproval((await res.json()) as PublicApproval);
  }, [approvalId]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/approvals/${approvalId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PublicApproval>) : null))
      .then((body) => {
        if (!cancelled && body) setApproval(body);
      });
    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  // after a proof is sent, poll until the backend settles it
  useEffect(() => {
    if (!submitted || approval?.status !== "pending") return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [submitted, approval?.status, refresh]);

  async function startVerification() {
    setError(null);
    setRequestId(null);
    setLaunch(null);
    alreadySettled.current = false;
    setStarting(true);
    try {
      const res = await approvalAction(approvalId, { action: "launch" });
      if (!res.ok) {
        setError(res.error);
        void refresh();
        return;
      }
      setApproval(res.approval);
      setLaunch(res.approval.world);
      setOpen(true);
    } finally {
      setStarting(false);
    }
  }

  async function handleVerify(result: IDKitResult) {
    const res = await approvalAction(approvalId, { action: "proof", idkitResponse: result });
    if (!res.ok && res.error === "approval already approved") {
      alreadySettled.current = true;
      setOpen(false);
      await refresh();
      return;
    }
    if (!res.ok) {
      setError(res.error);
      void refresh();
      // throwing keeps the widget from calling onSuccess
      throw new Error(res.error);
    }
    setApproval(res.approval);
    setSubmitted(true);
  }

  function handleError(errorCode: string, debugReport?: IDKitDebugReport) {
    // the owner closed the World App prompt: not an error, they can try again
    if (errorCode === "user_rejected") {
      setError(null);
      return;
    }
    setError(`World ID: ${errorCode.replaceAll("_", " ")}`);
    setRequestId(debugReport?.request_id ?? null);
  }

  if (!configured) return <p className="py-6 text-sm text-deny">✕ World ID is not configured on this server</p>;
  if (!approval) return <p className="py-6 text-sm text-ink-2">{error ? `✕ ${error}` : "Loading the World ID request…"}</p>;

  const pending = approval.status === "pending";
  const rpContext: RpContext | null = launch ? launch.rpContext : null;
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <p className="text-[15px] font-medium">You approve exactly this payment</p>
      {/* shown before the World App opens: the signal binds these values */}
      <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-left text-sm [&>dt]:text-ink-2">
        <dt>Amount</dt>
        <dd className="mono font-semibold">{fmt(approval.amount)} USDC</dd>
        <dt>To</dt>
        <dd>
          <CopyText value={approval.payTo} className="bg-sheet text-[13px]" />
        </dd>
        <dt>Expires</dt>
        <dd className="mono">{new Date(approval.expiresAt).toLocaleTimeString([], { hour12: false })}</dd>
      </dl>

      <button
        type="button"
        onClick={() => void startVerification()}
        disabled={!pending || starting}
        className="mt-1 min-h-11 w-full rounded-[10px] bg-guard px-4 text-[15px] font-bold text-sheet disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting ? "Signing the request…" : "Verify with World ID"}
      </button>
      <p className={`text-sm ${approval.status === "invalid" || approval.status === "denied" ? "text-deny" : "text-ink-2"}`}>
        {submitted && pending ? "proof sent — waiting for the backend to verify…" : STATUS_TEXT[approval.status]}
      </p>
      {error && (
        <p className="break-words text-sm font-bold text-deny">
          ✕ {error}
          {requestId && <span className="mono block text-xs font-normal text-ink-3">request_id {requestId}</span>}
        </p>
      )}

      {/* mounted only once the server has signed a fresh RP context */}
      {launch && rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={launch.appId as `app_${string}`}
          action={launch.action}
          rp_context={rpContext}
          environment={launch.environment}
          allow_legacy_proofs
          preset={proofOfHuman({ signal: launch.signal })}
          handleVerify={handleVerify}
          onSuccess={() => {
            if (alreadySettled.current) return;
            setError(null);
            void refresh();
          }}
          onError={(code, debugReport) => handleError(String(code), debugReport)}
        />
      )}
    </div>
  );
}
