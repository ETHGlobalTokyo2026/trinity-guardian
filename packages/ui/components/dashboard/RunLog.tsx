"use client";

import { useState, type ReactNode } from "react";
import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { Check, GuardianDecision, Screening } from "@/lib/guardian/types";
import { Caret, GateGlyph, STAMP_FOR_RUN, Stamp, StatusChip, TONE_GLYPH, type Tone } from "./primitives";
import { pipelineFor } from "./Pipeline";
import { CHECK_LABEL, approvalForRun, chipClass, runSummary, shortAddr, time, worldPollLabel, type Run, reasonParts } from "./utils";

export function CheckpointLog({ runs, approvals }: { runs: Run[]; approvals: ApprovalRequest[] }) {
  return (
    <section aria-labelledby="log-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 id="log-h" className="text-[22px] font-bold">
            Checkpoint log
          </h2>
          <span aria-hidden className="text-sm tracking-[.2em] text-ink-3">
            検問記録
          </span>
        </div>
        <span className="text-[15px] text-ink-2">every payment the agent tried, newest first</span>
      </div>
      {runs.length === 0 && (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border-2 border-dashed border-line bg-sheet px-6 py-14 text-center text-ink-3">
          <GateGlyph size={54} strokeWidth={2.4} />
          <p className="max-w-[36ch] text-lg text-ink-2">Nothing screened yet. Pick a purchase on the left to send the agent shopping.</p>
        </div>
      )}
      {runs.map((r, i) => (
        <RunTicket key={r.runId} run={r} approval={approvalForRun(approvals, r.runId)} variant={i === 0 ? "latest" : "compact"} />
      ))}
    </section>
  );
}

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

/** Timeline disc per level: colour + glyph + screen-reader word, never colour alone. */
const LEVEL: Record<FeedEvent["level"], { cls: string; icon: string; sr: string }> = {
  ok: { cls: "border-allow bg-allow-soft text-allow", icon: "✓", sr: "ok" },
  warn: { cls: "border-hold bg-hold-soft text-hold", icon: "!", sr: "warning" },
  danger: { cls: "border-deny bg-deny-soft text-deny", icon: "✕", sr: "danger" },
  info: { cls: "border-ink-3 bg-paper text-ink-3", icon: "·", sr: "info" },
};

function phasesFor(run: Run) {
  return PHASE_DEFS.map((def) => ({ ...def, events: run.events.filter((e) => def.kinds.includes(e.kind)) })).filter((p) => p.events.length > 0);
}

/** ENS / Intercepta / World ID mini-trail, from the same model the pipeline band uses. */
function GateTrail({ run, approval, small }: { run: Run; approval: ApprovalRequest | undefined; small?: boolean }) {
  const { gates } = pipelineFor(run, approval);
  const tones: Record<string, Tone | "none"> = { pass: "pass", soft: "soft", wait: "soft", fail: "fail", skip: "none", idle: "none", guard: "none" };
  const color: Record<Tone | "none", string> = { pass: "border-allow text-allow", soft: "border-hold text-hold", fail: "border-deny text-deny", skip: "border-ink-3 text-ink-3", none: "border-dashed border-ink-3 text-ink-3" };
  return (
    <span className={`mt-1 flex flex-wrap ${small ? "gap-[5px]" : "gap-1.5"}`}>
      {(["ENS", "Intercepta", "World ID"] as const).map((label, i) => {
        const t = tones[gates[i].tone];
        return (
          <span
            key={label}
            title={gates[i].status}
            className={`inline-flex items-center gap-1 border font-bold ${color[t]} ${small ? "rounded-[5px] px-[7px] py-px text-xs" : "rounded-md px-[9px] py-0.5 text-[13px]"}`}
          >
            <span aria-hidden>{t === "none" ? "–" : TONE_GLYPH[t]}</span>
            {label}
          </span>
        );
      })}
    </span>
  );
}

function RunTicket({ run, approval, variant }: { run: Run; approval: ApprovalRequest | undefined; variant: "latest" | "compact" }) {
  const [open, setOpen] = useState(variant === "latest");
  const settled = run.events.find((e) => e.kind === "settled");
  const txHash = (settled?.data?.settleResponse as { transaction?: string } | undefined)?.transaction;
  const phases = phasesFor(run);
  const summary = runSummary(run);
  const verdict = STAMP_FOR_RUN[run.verdict];
  const latest = variant === "latest";

  return (
    <article className={`overflow-hidden bg-sheet ${latest ? "rounded-[14px] border-2 border-line shadow-[0_6px_24px_-16px_rgba(0,0,0,.25)]" : "rounded-xl border border-line"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center text-left transition-colors ${latest ? "flex-wrap gap-x-[22px] gap-y-4 px-4 py-[18px] sm:px-6 sm:py-[22px]" : "gap-4 px-[18px] py-3.5 hover:bg-paper"}`}
      >
        {latest ? (
          <Stamp verdict={verdict} size="lg" live={run.verdict !== "pending"} />
        ) : (
          <span className="flex w-[72px] flex-none justify-center sm:w-28">
            <Stamp verdict={verdict} size="sm" />
          </span>
        )}
        <span className={`flex min-w-0 flex-col ${latest ? "flex-[1_1_280px] gap-1.5" : "flex-1 gap-[3px]"}`}>
          <span className={latest ? "text-[19px] font-black leading-tight sm:text-[22px]" : "text-base font-bold leading-snug"}>{run.title}</span>
          <span className={`[overflow-wrap:anywhere] ${latest ? "text-base leading-relaxed text-ink-2 text-pretty" : "line-clamp-2 text-sm leading-snug text-ink-2"}`}>{summary}</span>
          {latest && (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-3">
              <span className="mono">{time(run.started)}</span>
              <span aria-hidden>·</span>
              <span>{run.events.length} steps</span>
              {approval && (
                <>
                  <span aria-hidden>·</span>
                  <span>owner {approval.status}</span>
                </>
              )}
              {txHash && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    tx{" "}
                    <a className="mono text-guard underline" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      {shortAddr(txHash)}
                    </a>
                  </span>
                </>
              )}
            </span>
          )}
          <GateTrail run={run} approval={approval} small={!latest} />
        </span>
        {!latest && <span className="mono hidden flex-none text-[13px] text-ink-3 sm:block">{time(run.started)}</span>}
        <Caret open={open} />
      </button>
      {open && (
        <ol className={`flex flex-col border-t border-line ${latest ? "px-4 pb-2.5 pt-1 sm:px-6 sm:pb-3.5 sm:pt-1.5" : "px-[18px] pb-2.5 pt-1"}`}>
          {phases.map((p) => (
            <Phase key={p.key} phaseKey={p.key} label={p.label} events={p.events} defaultOpen={latest}>
              <PhaseBody phaseKey={p.key} events={p.events} />
            </Phase>
          ))}
        </ol>
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
  const l = LEVEL[level];
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5">
      {/* timeline rail */}
      <div aria-hidden className="flex flex-col items-center">
        <span className={`mt-3.5 grid size-[26px] flex-none place-items-center rounded-full border-[1.5px] text-[13px] font-black ${l.cls}`}>{l.icon}</span>
        <span className="w-0.5 flex-1 bg-line" />
      </div>
      <details className="min-w-0 py-3.5" open={open}>
        <summary className="flex min-h-[26px] select-none items-center gap-2.5">
          <span className="text-base font-bold">{label}</span>
          <span className="sr-only">{l.sr}</span>
          <span className="ml-auto whitespace-nowrap text-[13px] text-ink-3">
            {events.length} step{events.length > 1 ? "s" : ""}
          </span>
        </summary>
        <div className="flex flex-col gap-2.5 pt-2.5">{children}</div>
      </details>
    </li>
  );
}

function PhaseBody({ phaseKey, events }: { phaseKey: PhaseKey; events: FeedEvent[] }) {
  if (phaseKey === "policy") return <PolicyChips events={events} />;
  if (phaseKey === "screen") return <ScreeningRows events={events} />;
  if (phaseKey === "decision") return <DecisionLine events={events} />;
  return (
    <>
      {events.map((e) => (
        <CompactEventRow key={e.id} e={e} />
      ))}
    </>
  );
}

function PolicyChips({ events }: { events: FeedEvent[] }) {
  const checks = events.map((e) => e.data?.check as Check | undefined).filter((c): c is Check => Boolean(c));
  return (
    <div className="flex flex-wrap gap-2">
      {checks.map((c) => (
        <StatusChip key={c.name} tone={chipClass(c.status)} title={c.detail}>
          {CHECK_LABEL[c.name] ?? c.name}
        </StatusChip>
      ))}
    </div>
  );
}

function screeningTone(verdict: Screening["verdict"]): Tone {
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
    <>
      {events.map((e) => {
        const s = e.data?.screening as Screening | undefined;
        if (!s) return null;
        return (
          <div key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <StatusChip tone={screeningTone(s.verdict)} title={e.detail}>
              {subjectLabel[e.kind] ?? e.kind}: {s.verdict}
            </StatusChip>
            <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
              {e.detail && <p className="break-words text-sm leading-snug text-ink-2">{e.detail}</p>}
              {s.raw !== undefined && (
                <details>
                  <summary className="text-sm font-medium text-guard">› show evidence</summary>
                  <pre className="mono mt-1.5 max-h-64 overflow-x-auto rounded-lg bg-paper px-3 py-2.5 text-[12.5px] leading-normal text-ink-2">{JSON.stringify(s.raw, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function DecisionLine({ events }: { events: FeedEvent[] }) {
  return (
    <>
      {events.map((e) => {
        const d = e.data?.decision as GuardianDecision | undefined;
        const color = { ok: "text-allow", warn: "text-hold", danger: "text-deny", info: "text-ink" }[e.level];
        return (
          <div key={e.id} className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="mono text-[13px] text-ink-3">{time(e.ts)}</span>
              <span className={`text-base font-bold ${color}`}>{e.title}</span>
            </span>
            <ul className="flex list-disc flex-col gap-[3px] pl-5 text-[15px] leading-snug">
              {reasonParts(d?.reason ?? e.detail).map((r) => (
                <li key={r} className="break-words">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function CompactEventRow({ e }: { e: FeedEvent }) {
  const worldIdMeta = e.kind === "approval.requested" || e.kind === "approval.resolved" ? (e.data?.lastPoll as string | undefined) : undefined;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[15px] font-medium">{e.title}</span>
        <span className="mono text-[13px] text-ink-3">{time(e.ts)}</span>
      </span>
      {e.detail && (
        <span className="break-words text-sm leading-snug text-ink-2" title={e.detail}>
          {e.detail}
        </span>
      )}
      {worldIdMeta && <span className="text-sm text-ink-3">{worldPollLabel(worldIdMeta)}</span>}
    </div>
  );
}
