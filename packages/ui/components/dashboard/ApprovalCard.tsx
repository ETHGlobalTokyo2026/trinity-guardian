"use client";

import dynamic from "next/dynamic";
import type { ApprovalRequest } from "@/lib/store";
import { CopyText, Stamp, StatusChip, useCountdown } from "./primitives";
import { CHECK_LABEL, chipClass, reasonParts } from "./utils";

type Integrations = { intercepta: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean };

// IDKit touches window at import time, so it only loads in the browser
const WorldIdConnect = dynamic(() => import("./WorldIdConnect").then((m) => m.WorldIdConnect), {
  ssr: false,
  loading: () => <p className="py-6 text-sm text-ink-2">Loading World ID…</p>,
});

/** Under this many seconds the countdown turns shu and gains a ⚠. */
const NEAR_EXPIRY_MS = 30_000;

export function ApprovalCard({
  a,
  integrations,
  onAction,
}: {
  a: ApprovalRequest;
  integrations: Integrations;
  onAction: (id: string, action: string) => Promise<void>;
}) {
  const failedChecks = a.decision.checks.filter((c) => c.status === "soft_fail" || c.status === "hard_fail");
  const deadline = a.expiresAt;
  const countdown = useCountdown(deadline);
  const totalMs = Math.max(1, Date.parse(deadline) - Date.parse(a.createdAt));
  const timePct = Math.max(0, Math.min(100, (countdown.remainingMs / totalMs) * 100));
  const nearExpiry = countdown.expired || countdown.remainingMs < NEAR_EXPIRY_MS;

  return (
    <section aria-live="polite" aria-labelledby="ap-h" className="overflow-hidden rounded-2xl border-[3px] border-hold bg-sheet shadow-[0_12px_40px_-18px_rgba(60,40,0,.35)]">
      <div className="flex flex-wrap items-center gap-x-[26px] gap-y-[18px] border-b border-hold bg-hold-soft p-[18px] sm:px-7 sm:py-6">
        <span className="sm:hidden">
          <Stamp verdict="hold" size="md" live />
        </span>
        <span className="hidden sm:inline-flex">
          <Stamp verdict="hold" size="lg" live />
        </span>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <span className="text-[13px] font-bold uppercase tracking-[.14em] text-hold">
            Layer 3 · <span aria-hidden>三</span> — World ID approver
          </span>
          <h2 id="ap-h" className="text-[22px] font-black leading-tight text-pretty sm:text-3xl">
            The agent wants to pay <span className="mono font-semibold">{a.quote.amountDisplay}</span> — waiting for the owner
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-2">
            to <CopyText value={a.quote.payTo} className="bg-sheet text-[15px]" /> for <span className="mono break-all text-[15px] text-ink">{a.quote.resource}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-6 p-[18px] sm:px-7 sm:pb-7 sm:pt-6">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px]">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-[17px] font-bold text-hold">Held because</h3>
            <ul className="flex flex-col gap-2 text-[17px] leading-relaxed">
              {reasonParts(a.reason).map((r) => (
                <li key={r} className="flex gap-2.5 break-words">
                  <span aria-hidden className="font-black text-hold">
                    !
                  </span>
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {failedChecks.map((c) => (
                <StatusChip key={c.name} tone={chipClass(c.status)} title={c.detail} outlined>
                  {CHECK_LABEL[c.name] ?? c.name} · {c.status === "hard_fail" ? "hard fail" : "soft fail"}
                </StatusChip>
              ))}
            </div>
          </div>

          <p className="max-w-[52ch] text-sm leading-normal text-ink-3">
            Only a World ID proof validated by the backend can release this payment. This screen can open World ID or cancel, never approve.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onAction(a.id, "cancel")}
              className="min-h-11 rounded-[10px] border-[1.5px] border-line bg-sheet px-[18px] text-[15px] font-bold text-ink-2 transition-colors hover:border-deny hover:text-deny"
            >
              ✕ Cancel request
            </button>
          </div>
        </div>

        <div className="mx-auto flex min-w-[260px] flex-[0_1_300px] flex-col items-center self-start gap-2.5 rounded-[14px] border border-line bg-paper p-5 text-center">
          <WorldIdConnect approvalId={a.id} configured={integrations.worldId} />
          {a.error ? <p className="text-sm text-deny">{a.error}</p> : null}
          <Countdown pct={timePct} label={countdown.label} expired={countdown.expired} near={nearExpiry} />
        </div>
      </div>
    </section>
  );
}

function Countdown({ pct, label, expired, near }: { pct: number; label: string; expired: boolean; near: boolean }) {
  return (
    <div className="mt-1.5 flex w-full flex-col gap-2 border-t border-dashed border-line pt-3">
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full transition-[width] ${near ? "bg-deny" : "bg-ink-2"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[15px] ${near ? "font-black text-deny" : "font-medium text-ink-2"}`}>
        {expired ? "request expired" : `${near ? "⚠ " : ""}expires in ${label}`}
      </p>
    </div>
  );
}
