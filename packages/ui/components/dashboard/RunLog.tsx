"use client";

import { useState, type ReactNode } from "react";
import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { Check, GuardianDecision, Screening } from "@/lib/guardian/types";
import { Caret, StatusChip } from "./primitives";
import { CHECK_LABEL, approvalForRun, chipClass, runSummary, shortAddr, time, worldPollLabel, type Run, reasonParts } from "./utils";

export function CheckpointLog({ runs, approvals }: { runs: Run[]; approvals: ApprovalRequest[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold">Checkpoint log</h2>
        <span className="text-sm text-ink-2">every payment the agent tried, newest first</span>
      </div>
      <div className="space-y-3">
        {runs.length === 0 && (
          <div className="bg-sheet border border-dashed border-line rounded-lg p-8 text-center text-ink-2">
            Nothing screened yet. Pick a purchase on the left to send the agent shopping.
          </div>
        )}
        {runs.map((r, i) => (
          <RunTicket key={r.runId} run={r} approval={approvalForRun(approvals, r.runId)} variant={i === 0 ? "latest" : "compact"} />
        ))}
      </div>
    </div>
  );
}

const STAMP_TEXT: Record<Run["verdict"], string> = {
  allow: "PAID",
  hold: "HOLD",
  deny: "REFUSED",
  failed: "NOT SETTLED",
  pending: "SCREENING",
};

type PhaseKey = "quote" | "ens" | "policy" | "screen" | "decision" | "approval" | "settle";
const PHASE_DEFS: { key: PhaseKey; label: string; kinds: FeedEvent["kind"][] }[] = [
  { key: "quote", label: "Quote", kinds: ["run.start", "quote"] },
  { key: "ens", label: "Layer 1 · ENS gate", kinds: ["ens"] },
  { key: "policy", label: "Layer 2 · Policy checks", kinds: ["policy"] },
  { key: "screen", label: "Layer 2 · Intercepta screening", kinds: ["screen.address", "screen.token", "screen.message"] },
  { key: "decision", label: "Verdict", kinds: ["decision"] },
  { key: "approval", label: "Layer 3 · Owner approval (World ID)", kinds: ["approval.requested", "approval.resolved"] },
  { key: "settle", label: "Sign & settle", kinds: ["sign", "settled", "blocked", "error", "run.end"] },
];

function phaseLevel(events: FeedEvent[]): FeedEvent["level"] {
  if (events.some((e) => e.level === "danger")) return "danger";
  if (events.some((e) => e.level === "warn")) return "warn";
  if (events.some((e) => e.level === "ok")) return "ok";
  return "info";
}

function levelDot(level: FeedEvent["level"]) {
  return { info: "bg-ink-3", ok: "bg-allow", warn: "bg-hold", danger: "bg-deny" }[level];
}

function phasesFor(run: Run) {
  return PHASE_DEFS.map((def) => ({ ...def, events: run.events.filter((e) => def.kinds.includes(e.kind)) })).filter((p) => p.events.length > 0);
}

function RunTicket({ run, approval, variant }: { run: Run; approval: ApprovalRequest | undefined; variant: "latest" | "compact" }) {
  const [open, setOpen] = useState(variant === "latest");
  const stampText = STAMP_TEXT[run.verdict];
  const settled = run.events.find((e) => e.kind === "settled");
  const phases = phasesFor(run);
  const summary = runSummary(run);

  return (
    <article className={`bg-sheet border rounded-lg overflow-hidden ${variant === "latest" ? "border-2 border-line shadow-sm" : "border-line"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 text-left hover:bg-paper/40 transition-colors"
      >
        <span className={`stamp stamp-${run.verdict} ${variant === "latest" ? "stamp-lg" : "stamp-sm"} ${run.verdict !== "pending" ? "stamp-live" : ""}`}>
          {stampText}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold truncate ${variant === "latest" ? "text-base" : "text-sm"}`}>{run.title}</span>
          <span className={`block text-ink-2 ${variant === "latest" ? "text-sm mt-0.5 line-clamp-2" : "text-xs truncate"}`}>{summary}</span>
          {variant === "latest" && (
            <span className="block text-xs text-ink-3 mt-1">
              {time(run.started)} · {run.events.length} steps
              {approval && ` · owner ${approval.status}`}
              {settled && (
                <>
                  {" "}
                  · tx{" "}
                  <a
                    className="underline mono"
                    href={`https://sepolia.basescan.org/tx/${(settled.data?.settleResponse as { transaction?: string })?.transaction}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {shortAddr((settled.data?.settleResponse as { transaction?: string })?.transaction ?? "")}
                  </a>
                </>
              )}
            </span>
          )}
        </span>
        {variant === "compact" && <span className="hidden sm:block text-xs text-ink-3 shrink-0">{time(run.started)}</span>}
        <Caret open={open} />
      </button>
      {open && (
        <div className="border-t border-line divide-y divide-line">
          {phases.map((p) => (
            <Phase key={p.key} phaseKey={p.key} label={p.label} events={p.events} defaultOpen={variant === "latest"}>
              <PhaseBody phaseKey={p.key} events={p.events} />
            </Phase>
          ))}
        </div>
      )}
    </article>
  );
}

function Phase({
  phaseKey,
  label,
  events,
  defaultOpen,
  children,
}: {
  phaseKey: PhaseKey;
  label: string;
  events: FeedEvent[];
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const level = phaseLevel(events);
  const open = defaultOpen || level === "warn" || level === "danger" || phaseKey === "approval";
  return (
    <details className="group" open={open}>
      <summary className="flex items-center gap-2 px-4 py-2 text-sm select-none">
        <Caret open={open} />
        <span className={`size-1.5 rounded-full shrink-0 ${levelDot(level)}`} aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="text-ink-3 text-xs ml-auto">
          {events.length} step{events.length > 1 ? "s" : ""}
        </span>
      </summary>
      <div className="px-4 pb-3 pt-0.5">{children}</div>
    </details>
  );
}

function PhaseBody({ phaseKey, events }: { phaseKey: PhaseKey; events: FeedEvent[] }) {
  if (phaseKey === "policy") return <PolicyChips events={events} />;
  if (phaseKey === "screen") return <ScreeningRows events={events} />;
  if (phaseKey === "decision") return <DecisionLine events={events} />;
  return (
    <ol className="space-y-1.5">
      {events.map((e) => (
        <CompactEventRow key={e.id} e={e} />
      ))}
    </ol>
  );
}

function PolicyChips({ events }: { events: FeedEvent[] }) {
  const checks = events.map((e) => e.data?.check as Check | undefined).filter((c): c is Check => Boolean(c));
  return (
    <div className="flex flex-wrap gap-1.5">
      {checks.map((c) => (
        <StatusChip key={c.name} tone={chipClass(c.status)} title={c.detail}>
          {CHECK_LABEL[c.name] ?? c.name}
        </StatusChip>
      ))}
    </div>
  );
}

function screeningTone(verdict: Screening["verdict"]): "pass" | "fail" | "soft" {
  if (verdict === "clear") return "pass";
  if (verdict === "flagged") return "fail";
  return "soft";
}

function ScreeningRows({ events }: { events: FeedEvent[] }) {
  const subjectLabel: Partial<Record<FeedEvent["kind"], string>> = {
    "screen.address": "payTo address",
    "screen.token": "token",
    "screen.message": "authorization message",
  };
  return (
    <div className="space-y-2">
      {events.map((e) => {
        const s = e.data?.screening as Screening | undefined;
        if (!s) return null;
        return (
          <div key={e.id} className="flex items-start gap-2">
            <StatusChip tone={screeningTone(s.verdict)} title={e.detail}>
              {subjectLabel[e.kind] ?? e.kind}: {s.verdict}
            </StatusChip>
            <div className="min-w-0 flex-1">
              {e.detail && <p className="text-xs text-ink-2 break-words">{e.detail}</p>}
              {s.raw !== undefined && (
                <details className="mt-0.5">
                  <summary className="text-xs text-guard inline-block">show evidence</summary>
                  <pre className="mono text-xs bg-paper rounded p-2 mt-1 overflow-x-auto max-h-64">{JSON.stringify(s.raw, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DecisionLine({ events }: { events: FeedEvent[] }) {
  return (
    <div className="space-y-1">
      {events.map((e) => {
        const d = e.data?.decision as GuardianDecision | undefined;
        return (
          <div key={e.id} className="text-sm">
            <span className="text-xs text-ink-3 mr-2">{time(e.ts)}</span>
            <span className="font-medium">{e.title}</span>
            <ul className="mt-1 space-y-0.5 list-disc pl-5">
              {reasonParts(d?.reason ?? e.detail).map((r) => (
                <li key={r} className="break-words">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function CompactEventRow({ e }: { e: FeedEvent }) {
  const dot = levelDot(e.level);
  const worldIdMeta = e.kind === "approval.requested" || e.kind === "approval.resolved" ? (e.data?.lastPoll as string | undefined) : undefined;
  return (
    <li className="flex gap-2.5">
      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{e.title}</span>
          <span className="text-xs text-ink-3">{time(e.ts)}</span>
        </div>
        {e.detail && <p className="text-xs text-ink-2 break-words" title={e.detail}>{e.detail}</p>}
        {worldIdMeta && <p className="text-xs text-ink-3">{worldPollLabel(worldIdMeta)}</p>}
      </div>
    </li>
  );
}
