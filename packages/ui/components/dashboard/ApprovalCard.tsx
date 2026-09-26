"use client";

import QRCode from "react-qr-code";
import type { ApprovalRequest } from "@/lib/store";
import { CopyText, Stamp, StatusChip, useCountdown } from "./primitives";
import { CHECK_LABEL, chipClass, worldPollLabel, reasonParts } from "./utils";

type Integrations = { intercepta: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean };

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
  const w = a.worldId;
  const link = w?.verificationUriComplete;
  const failedChecks = a.decision.checks.filter((c) => c.status === "soft_fail" || c.status === "hard_fail");
  const deadline = w?.expiresAt ?? a.expiresAt;
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
            Only a World ID proof validated by the backend can release this payment. Approving on this screen is not possible.
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

          {integrations.worldDevBypass && (
            <div className="flex flex-col gap-2.5 rounded-xl border-2 border-dashed border-hold bg-paper px-4 py-3.5">
              <p className="text-sm font-bold text-hold">Dev bypass — resolves without a World ID proof</p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onAction(a.id, "dev-approve")}
                  className="min-h-11 rounded-[10px] border-[1.5px] border-allow bg-sheet px-4 text-[15px] font-bold text-allow hover:bg-allow-soft"
                >
                  ✓ Approve (dev)
                </button>
                <button
                  type="button"
                  onClick={() => onAction(a.id, "dev-deny")}
                  className="min-h-11 rounded-[10px] border-[1.5px] border-deny bg-sheet px-4 text-[15px] font-bold text-deny hover:bg-deny-soft"
                >
                  ✕ Deny (dev)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto flex min-w-[260px] flex-[0_1_300px] flex-col items-center self-start gap-2.5 rounded-[14px] border border-line bg-paper p-5 text-center">
          {link ? (
            <>
              <div className="rounded-[10px] bg-white p-3.5">
                <QRCode value={link} size={168} aria-label="QR code for the World ID verification link" />
              </div>
              <p className="mt-1 text-[15px] font-medium">Scan with the sandbox World App</p>
              <p className="mono text-3xl font-semibold tracking-[.12em]">{w?.userCode}</p>
              <a href={link} target="_blank" rel="noreferrer" className="text-sm font-medium text-guard underline">
                or open the approval link
              </a>
              <Countdown lastPoll={w?.lastPoll} pct={timePct} label={countdown.label} expired={countdown.expired} near={nearExpiry} />
            </>
          ) : w?.redacted ? (
            <div className="flex flex-col items-center gap-3.5 px-2 py-9">
              <svg width="44" height="52" viewBox="0 0 44 52" fill="none" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" aria-hidden>
                <rect x="4" y="22" width="36" height="26" rx="5" />
                <path d="M12 22v-7a10 10 0 0 1 20 0v7" />
              </svg>
              <p className="max-w-[22ch] text-base leading-snug text-ink-2">Enter the owner token to show the World ID QR.</p>
              <p className="text-sm text-ink-3">{countdown.expired ? "request expired" : `expires in ${countdown.label}`}</p>
            </div>
          ) : (
            <div className="py-6 text-sm text-ink-2">{w?.error ?? "Contacting World ID…"}</div>
          )}
        </div>
      </div>
    </section>
  );
}

function Countdown({ lastPoll, pct, label, expired, near }: { lastPoll?: string; pct: number; label: string; expired: boolean; near: boolean }) {
  return (
    <div className="mt-1.5 flex w-full flex-col gap-2 border-t border-dashed border-line pt-3">
      <p className="text-sm text-ink-2">{worldPollLabel(lastPoll)}</p>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full transition-[width] ${near ? "bg-deny" : "bg-ink-2"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[15px] ${near ? "font-black text-deny" : "font-medium text-ink-2"}`}>
        {expired ? "request expired" : `${near ? "⚠ " : ""}expires in ${label}`}
      </p>
    </div>
  );
}
