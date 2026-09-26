"use client";

import { useCallback, useEffect, useState } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit";
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

/**
 * Layer 3 on the dashboard (docs/worldid-connect.md): read the signed launch
 * data from GET /api/approvals/:id, open IDKit with it untouched, and hand the
 * raw result back to POST /api/approvals/:id. The backend verifies the proof
 * and releases the payment; this component never approves or consumes.
 */
export function WorldIdConnect({ approvalId, configured }: { approvalId: string; configured: boolean }) {
  const [approval, setApproval] = useState<PublicApproval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/approvals/${approvalId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "approval not found" : `could not load the approval (${res.status})`);
      return null;
    }
    const next = (await res.json()) as PublicApproval;
    setApproval(next);
    return next;
  }, [approvalId]);

  useEffect(() => {
    // initial load; state is set once the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // after a proof is sent, poll until the backend settles it
  useEffect(() => {
    if (!submitted || approval?.status !== "pending") return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [submitted, approval?.status, refresh]);

  const handleVerify = async (result: IDKitResult) => {
    const res = await fetch(`/api/approvals/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "proof", idkitResponse: result }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? `proof rejected (${res.status})`;
      setError(message);
      void refresh();
      // throwing keeps the widget from calling onSuccess
      throw new Error(message);
    }
    setError(null);
    setSubmitted(true);
  };

  if (!configured) return <p className="py-6 text-sm text-deny">✕ World ID is not configured on this server</p>;
  if (!approval) return <p className="py-6 text-sm text-ink-2">{error ? `✕ ${error}` : "Loading the World ID request…"}</p>;

  const { world } = approval;
  const pending = approval.status === "pending";
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
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={!pending}
        className="mt-1 min-h-11 w-full rounded-[10px] bg-guard px-4 text-[15px] font-bold text-sheet disabled:cursor-not-allowed disabled:opacity-40"
      >
        Verify with World ID
      </button>
      <p className={`text-sm ${approval.status === "invalid" || approval.status === "denied" ? "text-deny" : "text-ink-2"}`}>
        {submitted && pending ? "proof sent — waiting for the backend to verify…" : STATUS_TEXT[approval.status]}
      </p>
      {error && <p className="break-words text-sm font-bold text-deny">✕ {error}</p>}

      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id={world.appId as `app_${string}`}
        action={world.action}
        rp_context={world.rpContext}
        environment={world.environment}
        allow_legacy_proofs
        preset={proofOfHuman({ signal: world.signal })}
        handleVerify={handleVerify}
        onSuccess={() => void refresh()}
        onError={(code) => setError(`World ID: ${String(code).replaceAll("_", " ")}`)}
      />
    </div>
  );
}
