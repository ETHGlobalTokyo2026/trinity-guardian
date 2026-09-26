"use client";

import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { Check, GuardianDecision } from "@/lib/guardian/types";
import { GateGlyph, STAMP_FOR_RUN, Stamp, type StampVerdict } from "./primitives";
import { CHECK_LABEL, fmt, type Run } from "./utils";

type GateTone = "pass" | "soft" | "wait" | "fail" | "skip" | "idle" | "guard";

const TONE: Record<GateTone, { color: string; soft: string; icon: string; dashed: boolean }> = {
  pass: { color: "var(--allow)", soft: "var(--allow-soft)", icon: "✓", dashed: false },
  soft: { color: "var(--hold)", soft: "var(--hold-soft)", icon: "!", dashed: false },
  wait: { color: "var(--hold)", soft: "var(--hold-soft)", icon: "‖", dashed: false },
  fail: { color: "var(--deny)", soft: "var(--deny-soft)", icon: "✕", dashed: false },
  skip: { color: "var(--ink-3)", soft: "transparent", icon: "–", dashed: true },
  idle: { color: "var(--ink-3)", soft: "transparent", icon: "–", dashed: true },
  guard: { color: "var(--guard)", soft: "var(--guard-soft)", icon: "…", dashed: false },
};

const GATES = [
  { eyebrow: "Layer 1 · 一", name: "ENS gate", sub: "momo.payguard.eth mandate" },
  { eyebrow: "Layer 2 · 二", name: "Intercepta", sub: "risk scans + policy checks" },
  { eyebrow: "Layer 3 · 三", name: "World ID", sub: "a verified human approves" },
] as const;

const OUTCOME: Record<StampVerdict, { name: string; sub: string; tone: GateTone }> = {
  paid: { name: "Paid", sub: "signed & settled on Base Sepolia", tone: "pass" },
  hold: { name: "Held", sub: "until the owner approves", tone: "wait" },
  refused: { name: "Refused", sub: "nothing signed — the money did not move", tone: "fail" },
  failed: { name: "Not settled", sub: "approved, but settlement failed", tone: "skip" },
  screening: { name: "Screening", sub: "screening in progress", tone: "idle" },
};

type Gate = { tone: GateTone; status: string };

export type PipelineModel = {
  gates: [Gate, Gate, Gate];
  verdict: StampVerdict;
  /** index of the node the coin sits on: 0 quote, 1–3 gates, 4 outcome */
  stopAt: number;
  amount: string;
  resource: string;
  title: string;
  /** no run yet: every node idle, no stamp */
  empty?: boolean;
};

function worst(events: FeedEvent[]): FeedEvent["level"] | null {
  if (events.length === 0) return null;
  if (events.some((e) => e.level === "danger")) return "danger";
  if (events.some((e) => e.level === "warn")) return "warn";
  return "ok";
}

const isLayer1Check = (c: Check) => c.name.startsWith("ens.") || c.name === "mandate";

/** "/api/services/bulk-data?x=1" -> "Bulk data" */
function resourceName(url: string | undefined): string {
  const slug = url?.split("?")[0].split("/").filter(Boolean).pop();
  if (!slug) return "Quote";
  const words = slug.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where the latest run stands at each of the three layers, derived from its feed events. */
export function pipelineFor(run: Run | undefined, approval: ApprovalRequest | undefined): PipelineModel {
  if (!run) {
    const idle: Gate = { tone: "idle", status: "waiting" };
    return { gates: [idle, idle, idle], verdict: "screening", stopAt: 0, amount: "—", resource: "Quote", title: "No payment yet — pick a purchase to start", empty: true };
  }
  const of = (...kinds: FeedEvent["kind"][]) => run.events.filter((e) => kinds.includes(e.kind));
  const decision = of("decision")[0]?.data?.decision as GuardianDecision | undefined;
  const quoteEv = of("quote")[0]?.data?.selected as { amount?: string; payTo?: string } | undefined;
  const quoteReq = of("quote")[0]?.data?.paymentRequired as { resource?: { url?: string } } | undefined;
  const amountAtomic = decision?.quote.amountAtomic ?? quoteEv?.amount;
  const amount = amountAtomic ? `$${fmt(amountAtomic)}` : "—";
  const resource = resourceName(decision?.quote.resource ?? quoteReq?.resource?.url);
  const verdict = STAMP_FOR_RUN[run.verdict];

  const l1Level = worst(of("ens"));
  const l1: Gate =
    l1Level === "danger" ? { tone: "fail", status: "gate closed" } : l1Level === "warn" ? { tone: "soft", status: "off-chain fallback" } : l1Level === "ok" ? { tone: "pass", status: "role held" } : { tone: "idle", status: "never ran" };

  // Layer 1 checks (ENS role, mandate) are emitted as policy events too; keep them out of Layer 2
  const l2Events = of("policy", "screen.address", "screen.token", "screen.message").filter((e) => {
    const c = e.data?.check as Check | undefined;
    return !c || !isLayer1Check(c);
  });
  const l2Checks = (decision?.checks ?? []).filter((c) => !isLayer1Check(c));
  const firstLabel = (status: Check["status"]) => {
    const c = l2Checks.find((x) => x.status === status);
    if (!c) return undefined;
    const label = (CHECK_LABEL[c.name] ?? c.name).replace(/^Intercepta: /, "");
    // Intercepta hard fail = flagged; soft fail = it gave no verdict (fail-closed), never "flagged"
    if (!c.name.startsWith("intercepta.")) return label;
    return status === "hard_fail" ? `${label} flagged` : `${label}: no verdict`;
  };
  const l2Level = worst(l2Events);
  let l2: Gate;
  if (l1.tone === "fail" || l2Events.length === 0) l2 = run.verdict === "pending" && l1.tone !== "fail" && l1.tone !== "idle" ? { tone: "guard", status: "scanning…" } : { tone: "idle", status: "never ran" };
  else if (!decision && run.verdict === "pending") l2 = { tone: "guard", status: "scanning…" };
  else if (l2Level === "danger") l2 = { tone: "fail", status: firstLabel("hard_fail") ?? "refused" };
  else if (l2Level === "warn") l2 = { tone: "soft", status: firstLabel("soft_fail") ?? "needs a human" };
  // with INTERCEPTA_ENABLED off only the policy half of Layer 2 ran: say so rather than "all clear"
  else l2 = { tone: "pass", status: l2Checks.some((c) => c.name === "intercepta" && c.status === "skipped") ? "policy ok · scans off" : "all clear" };

  let l3: Gate;
  if (approval) {
    l3 =
      approval.status === "pending"
        ? { tone: "wait", status: "waiting for owner" }
        : approval.status === "approved"
          ? { tone: "pass", status: "owner approved" }
          : { tone: "fail", status: approval.status === "expired" ? "request expired" : "owner denied" };
  } else if (run.verdict === "allow" || decision?.verdict === "allow") l3 = { tone: "skip", status: "not needed" };
  else l3 = { tone: "idle", status: "never ran" };

  const gates: [Gate, Gate, Gate] = [l1, l2, l3];
  let stopAt = 4;
  if (verdict === "hold") stopAt = 3;
  else if (verdict === "refused" || verdict === "screening") {
    const i = gates.findIndex((g) => g.tone === "fail" || g.tone === "guard" || g.tone === "wait");
    stopAt = i >= 0 ? i + 1 : verdict === "screening" ? (l1.tone === "idle" ? 1 : 2) : 4;
  }

  const where = stopAt >= 1 && stopAt <= 3 ? ` at Layer ${stopAt}` : "";
  const outcomeText = { paid: "paid", hold: `held${where}`, refused: `refused${where}`, failed: "not settled", screening: "screening…" }[verdict];
  const name = run.title.replace(/^\d+\s*·\s*/, "");
  const amountText = amountAtomic ? ` · ${fmt(amountAtomic)} ${decision?.quote.amountDisplay.split(" ").pop() ?? "USDC"}` : "";
  return { gates, verdict, stopAt, amount, resource, title: `${name}${amountText} — ${outcomeText}` };
}

/**
 * The 関所 band: the payment (indigo coin) travels Quote → ENS → Intercepta →
 * World ID → outcome seal, and stops at the gate that decided it. Row on wide
 * screens (xl), column below.
 */
export function Pipeline({ model }: { model: PipelineModel }) {
  const outcome = model.empty ? { name: "Waiting", sub: "no payment has been tried yet", tone: "idle" as GateTone } : OUTCOME[model.verdict];
  const nodes = [
    { kind: "quote" as const, eyebrow: "Payment", name: model.resource, sub: "the agent asks to pay", tone: "guard" as GateTone, status: undefined as string | undefined },
    ...GATES.map((g, i) => ({ kind: "gate" as const, ...g, tone: model.gates[i].tone, status: model.gates[i].status })),
    { kind: "outcome" as const, eyebrow: "Outcome", name: outcome.name, sub: outcome.sub, tone: outcome.tone, status: undefined },
  ];
  const connectorTone = (i: number): GateTone => {
    if (i >= model.stopAt) return "idle";
    if (i + 1 === model.stopAt && model.verdict !== "paid") return ({ hold: "wait", refused: "fail", screening: "guard", failed: "pass" } as const)[model.verdict];
    return "pass";
  };
  const summary = `${GATES.map((g, i) => `${g.name} ${model.gates[i].status}`).join(", ")}; outcome ${outcome.name}`;

  return (
    <div role="group" aria-label={`Payment pipeline: ${summary}`}>
      {/* row ≥ xl: five 172px nodes need ~1050px */}
      <ol className="hidden xl:flex items-start">
        {nodes.map((n, i) => (
          <PipelineStep key={n.kind + i} index={i} node={n} model={model} connector={i < 4 ? connectorTone(i) : undefined} layout="row" />
        ))}
      </ol>
      {/* column below xl */}
      <ol className="flex flex-col xl:hidden">
        {nodes.map((n, i) => (
          <PipelineStep key={n.kind + i} index={i} node={n} model={model} connector={i < 4 ? connectorTone(i) : undefined} layout="column" />
        ))}
      </ol>
    </div>
  );
}

function PipelineStep({
  index,
  node,
  model,
  connector,
  layout,
}: {
  index: number;
  node: { kind: "quote" | "gate" | "outcome"; eyebrow: string; name: string; sub: string; tone: GateTone; status?: string };
  model: PipelineModel;
  connector?: GateTone;
  layout: "row" | "column";
}) {
  const t = TONE[node.tone];
  const hasCoin = index === model.stopAt && model.amount !== "—";
  const pulse = index === model.stopAt && node.tone === "wait";
  const row = layout === "row";
  const box = (
    <div
      className={`relative grid flex-none place-items-center ${row ? (node.kind === "outcome" ? "h-24 min-w-24 rounded-[18px] px-3" : "size-24 rounded-[18px]") : "size-14 rounded-xl"}`}
      style={{ border: `2px ${t.dashed ? "dashed" : "solid"} ${t.color}`, background: t.soft, color: t.color }}
    >
      {pulse && <span aria-hidden className={`tg-pulse pointer-events-none absolute border-2 border-hold ${row ? "-inset-[9px] rounded-[22px]" : "-inset-1.5 rounded-2xl"}`} />}
      {node.kind === "gate" && <GateGlyph size={row ? 54 : 32} strokeWidth={row ? 2.6 : 3} closed={node.tone === "fail"} />}
      {node.kind === "quote" && <span className={`mono font-semibold tracking-[.04em] text-ink-2 ${row ? "text-[13px]" : "text-[11px]"}`}>x402</span>}
      {node.kind === "outcome" &&
        (model.empty ? (
          <span className="text-[22px] font-black">–</span>
        ) : row ? (
          <Stamp verdict={model.verdict} size={model.verdict === "screening" || model.verdict === "failed" ? "sm" : "md"} />
        ) : (
          <span className="text-[22px] font-black">{model.verdict === "screening" ? "…" : t.icon}</span>
        ))}
      {hasCoin && (
        <span
          className={`mono absolute grid place-items-center rounded-full bg-guard font-semibold text-sheet ${row ? "-top-3.5 -right-[18px] h-10 min-w-10 px-2 text-[15px] shadow-[0_0_0_4px_var(--sheet)]" : "-top-2.5 -right-3.5 h-[30px] min-w-[30px] px-1.5 text-xs shadow-[0_0_0_3px_var(--sheet)]"}`}
        >
          {model.amount}
        </span>
      )}
    </div>
  );
  const statusChip = node.status && (
    <span
      className={`inline-flex flex-none items-center gap-1.5 rounded-full font-bold ${row ? "mt-1 px-[11px] py-1 text-sm" : "px-[9px] py-[3px] text-[13px]"}`}
      style={{ background: t.soft, color: t.color, border: `1px ${t.dashed ? "dashed" : "solid"} ${t.color}` }}
    >
      <span aria-hidden>{t.icon}</span>
      {node.status}
    </span>
  );
  const c = connector && TONE[connector];

  if (row) {
    return (
      <>
        <li className="flex w-[172px] flex-none flex-col items-center gap-1.5 text-center">
          {box}
          <span className="mt-1.5 text-xs font-bold uppercase tracking-[.14em] text-ink-3">{node.eyebrow}</span>
          <span className="text-[19px] font-bold leading-tight">{node.name}</span>
          <span className="text-sm leading-snug text-ink-2 text-pretty">{node.sub}</span>
          {statusChip}
        </li>
        {c && (
          <li aria-hidden className="mt-[47px] flex min-w-7 flex-1 items-center" style={{ color: c.color }}>
            <span className="flex-1" style={{ borderTop: `3px ${c.dashed ? "dashed" : "solid"} ${c.color}` }} />
            <svg width="10" height="14" viewBox="0 0 10 14" className="flex-none">
              <path d="M1 1l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </li>
        )}
      </>
    );
  }
  return (
    <>
      <li className="flex items-center gap-3.5">
        {box}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[.14em] text-ink-3">{node.eyebrow}</span>
          <span className="text-[17px] font-bold leading-tight">{node.name}</span>
        </div>
        {statusChip}
        {node.kind === "outcome" && !model.empty && <Stamp verdict={model.verdict} size="sm" />}
      </li>
      {c && <li aria-hidden className="ml-[27px] h-[18px]" style={{ borderLeft: `3px ${c.dashed ? "dashed" : "solid"} ${c.color}` }} />}
    </>
  );
}
