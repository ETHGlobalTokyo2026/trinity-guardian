import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { GuardianDecision } from "@/lib/guardian/types";

export type Ledger = {
  day: string;
  spentAtomic: string;
  entries: { id: string; ts: string; resource: string; amountAtomic: string; txHash?: string }[];
};

/** Format an atomic (base-unit) amount as a decimal string. */
export function fmt(atomic: string | bigint, decimals = 6) {
  const n = BigInt(atomic);
  const s = n.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Truncate a long string (address, hash) to `front…back`, keeping the whole value available via title. */
export function shortAddr(a: string, front = 6, back = 4) {
  return a && a.length > front + back + 1 ? `${a.slice(0, front)}…${a.slice(-back)}` : a;
}

export function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

/** "1 · Buy weather data" -> { index: "1", name: "Buy weather data" } */
export function splitScenarioTitle(title: string): { index: string; name: string } {
  const m = /^(\d+)\s*(?:·|\.|:)?\s*(.+)$/.exec(title);
  if (m) return { index: m[1], name: m[2] };
  return { index: "", name: title };
}

export const CHECK_LABEL: Record<string, string> = {
  "ens.spendRole": "ENS: spend role",
  asset: "asset",
  allowlist: "allowlist",
  "intercepta.address": "Intercepta: payTo",
  "intercepta.token": "Intercepta: token",
  "intercepta.message": "Intercepta: message",
  perTxMax: "per-tx max",
  dailyCap: "daily cap",
  mandate: "mandate valid",
};

export function chipClass(status: "pass" | "soft_fail" | "hard_fail" | "skipped"): "pass" | "fail" | "soft" | "skip" {
  if (status === "pass") return "pass";
  if (status === "hard_fail") return "fail";
  if (status === "soft_fail") return "soft";
  return "skip";
}

const WORLD_POLL_LABEL: Record<string, string> = {
  authorization_pending: "waiting for the owner to scan and approve",
  slow_down: "still waiting — checking less often now",
  "unavailable (503/429)": "World ID is briefly unavailable, retrying",
  approved: "approved",
  access_denied: "denied by the owner",
  expired_token: "request expired",
  cancelled: "cancelled by the owner",
  invalid_id_token: "the proof failed validation",
  "deadline reached": "request expired",
};

export function worldPollLabel(lastPoll?: string): string {
  if (!lastPoll) return "starting the World ID request…";
  return WORLD_POLL_LABEL[lastPoll] ?? lastPoll.replaceAll("_", " ");
}

export type RunVerdict = "allow" | "hold" | "deny" | "failed" | "pending";

export type Run = {
  runId: string;
  events: FeedEvent[];
  verdict: RunVerdict;
  title: string;
  started: string;
};

export function groupRuns(events: FeedEvent[]): Run[] {
  const map = new Map<string, Run>();
  for (const e of events) {
    let r = map.get(e.runId);
    if (!r) {
      r = { runId: e.runId, events: [], verdict: "pending", title: e.title, started: e.ts };
      map.set(e.runId, r);
    }
    r.events.push(e);
    if (e.kind === "run.start") r.title = e.title;
  }
  for (const r of map.values()) {
    const has = (kind: FeedEvent["kind"]) => r.events.some((e) => e.kind === kind);
    const decision = r.events.find((e) => e.kind === "decision")?.data?.decision as GuardianDecision | undefined;
    const ended = has("run.end");
    if (has("blocked")) r.verdict = "deny";
    else if (has("settled")) r.verdict = "allow";
    else if (has("sign")) r.verdict = ended ? "failed" : "pending";
    else if (decision?.verdict === "ask_human") r.verdict = ended ? "deny" : "hold";
    else if (ended) r.verdict = decision?.verdict === "deny" ? "deny" : "failed";
  }
  return [...map.values()].sort((a, b) => b.started.localeCompare(a.started));
}

/**
 * The Guardian joins several failed checks with " | " and prefixes each with the
 * check name. Split that into short human-readable items for the UI.
 */
export function reasonParts(reason: string | undefined): string[] {
  if (!reason) return [];
  return reason
    .split(" | ")
    .map((part) => {
      const m = part.match(/^([a-zA-Z.]+):\s*(.*)$/s);
      if (!m) return part.trim();
      const label = CHECK_LABEL[m[1]] ?? m[1];
      return `${label}: ${m[2].trim()}`;
    })
    .filter(Boolean);
}

/** First reason plus a count of the rest, for one-line summaries. */
export function reasonHeadline(reason: string | undefined): string {
  const parts = reasonParts(reason);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]} (+${parts.length - 1} more)`;
}

/** One plain-English sentence describing where a run ended up, for the collapsed / headline view. */
export function runSummary(run: Run): string {
  const decision = run.events.find((e) => e.kind === "decision")?.data?.decision as GuardianDecision | undefined;
  const settled = run.events.find((e) => e.kind === "settled");
  const blocked = run.events.find((e) => e.kind === "blocked");
  const errored = run.events.find((e) => e.kind === "error");
  const quote = decision?.quote;
  const amount = quote?.amountDisplay;
  const payTo = quote?.payTo ? shortAddr(quote.payTo) : undefined;

  switch (run.verdict) {
    case "allow":
      return settled ? `Paid ${amount ?? "the quote"} to ${payTo ?? "the seller"}.` : `Allowed — signing ${amount ?? "the payment"}…`;
    case "hold":
      return `Paused for the owner — ${reasonHeadline(decision?.reason) || "needs approval"}.`;
    case "deny":
      return `Refused — ${reasonHeadline(blocked?.detail ?? decision?.reason) || "the Guardian stopped this payment"}.`;
    case "failed":
      return errored?.detail ?? "Ended without settling.";
    default:
      return "Screening the quote…";
  }
}

export function approvalForRun(approvals: ApprovalRequest[], runId: string) {
  return approvals.find((a) => a.runId === runId);
}
