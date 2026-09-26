"use client";

import type { ApprovalRequest } from "@/lib/store";
import { CopyText, StatusChip, useCountdown } from "./primitives";
import { CHECK_LABEL, chipClass, reasonParts } from "./utils";

type Integrations = { intercepta: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean };

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

  return (
    <section className="bg-sheet border-2 border-hold rounded-lg p-4 sm:p-5 shadow-sm" aria-live="polite">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <span className="stamp stamp-hold stamp-live shrink-0">HOLD</span>
        <div className="min-w-0">
          <h2 className="font-semibold text-lg leading-snug">
            The agent wants to pay <span className="mono">{a.quote.amountDisplay}</span> — waiting for the owner
          </h2>
          <p className="text-sm text-ink-2 mt-0.5">
            to <CopyText value={a.quote.payTo} /> for <span className="break-words">{a.quote.resource}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-sm font-medium text-hold">Held because</p>
            <ul className="mt-1 text-sm space-y-0.5 list-disc pl-5 marker:text-hold">
              {reasonParts(a.reason).map((r) => (
                <li key={r} className="break-words">
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {failedChecks.map((c) => (
                <StatusChip key={c.name} tone={chipClass(c.status)} title={c.detail}>
                  {CHECK_LABEL[c.name] ?? c.name}
                </StatusChip>
              ))}
            </div>
          </div>

          <p className="text-xs text-ink-3">
            Only a World ID proof validated by the backend can release this payment. Approving on this screen is not possible.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => onAction(a.id, "cancel")}
              className="rounded-md border border-line text-ink-2 px-3 py-1.5 text-sm hover:border-deny hover:text-deny transition-colors"
            >
              Cancel request
            </button>
          </div>

        </div>

        <div className="w-full rounded-md border border-line p-3 bg-paper/40">
          <p className="text-sm">World ID proof required</p>
          <p className="mono text-xs break-all mt-2">{a.id}</p>
          <p className="text-xs text-ink-2 mt-2">action {a.launch.action}</p>
          <p className={`text-xs mt-2 ${countdown.expired ? "text-deny" : "text-ink-3"}`}>
            {countdown.expired ? "request expired" : `expires in ${countdown.label}`}
          </p>
          {integrations.worldId ? null : <p className="text-xs text-deny mt-2">World ID is not configured</p>}
        </div>
      </div>
    </section>
  );
}
