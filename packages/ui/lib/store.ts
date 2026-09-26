import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { GuardianDecision } from "./guardian/types";

/**
 * Tiny in-process store: event feed, daily spend ledger, and pending human
 * approvals. It is hoisted onto globalThis so Next.js dev HMR does not wipe
 * state between reloads, and mirrored to data/state.json so a restart during
 * the demo keeps the day's spend.
 */

export type FeedEvent = {
  id: string;
  ts: string;
  runId: string;
  kind:
    | "run.start"
    | "quote"
    | "ens"
    | "screen.address"
    | "screen.token"
    | "screen.message"
    | "policy"
    | "decision"
    | "approval.requested"
    | "approval.resolved"
    | "sign"
    | "settled"
    | "blocked"
    | "error"
    | "run.end";
  title: string;
  detail?: string;
  level: "info" | "ok" | "warn" | "danger";
  data?: Record<string, unknown>;
};

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type ApprovalRequest = {
  id: string;
  runId: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  /** Why the Guardian stopped and asked a human. */
  reason: string;
  decision: GuardianDecision;
  quote: {
    resource: string;
    payTo: string;
    amountAtomic: string;
    amountDisplay: string;
    asset: string;
    network: string;
  };
  /** One-time limit (whole units) the owner granted when approving. */
  approvedLimit?: string;
  resolvedAt?: string;
  /** What the human is shown to complete the World ID device flow. Never contains device_code. */
  worldId?: {
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresAt: string;
    intervalSec: number;
    /** last poll outcome, for the dashboard */
    lastPoll?: string;
    /** filled once an ID token was validated */
    sub?: string;
    authTime?: number;
    acr?: string;
    /** "world-id" | "dev-bypass" | "cancelled" */
    mode?: string;
    error?: string;
    /** true when userCode / verification URIs were stripped for a viewer without the owner token */
    redacted?: boolean;
  };
};

export type LedgerEntry = {
  id: string;
  ts: string;
  runId: string;
  resource: string;
  payTo: string;
  amountAtomic: string;
  txHash?: string;
};

type Ledger = {
  /** UTC day (YYYY-MM-DD) the totals below belong to. */
  day: string;
  spentAtomic: string;
  entries: LedgerEntry[];
};

type State = {
  events: FeedEvent[];
  ledger: Ledger;
  approvals: ApprovalRequest[];
};

type Store = {
  state: State;
  bus: EventEmitter;
};

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "state.json");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): State {
  try {
    if (existsSync(FILE)) {
      const parsed = JSON.parse(readFileSync(FILE, "utf8")) as State;
      if (parsed.ledger?.day !== today()) parsed.ledger = { day: today(), spentAtomic: "0", entries: [] };
      return parsed;
    }
  } catch {
    /* fall through to fresh state */
  }
  return { events: [], ledger: { day: today(), spentAtomic: "0", entries: [] }, approvals: [] };
}

function persist(state: State) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch {
    /* best effort */
  }
}

const g = globalThis as unknown as { __agentpayStore?: Store };
if (!g.__agentpayStore) {
  const bus = new EventEmitter();
  bus.setMaxListeners(100);
  g.__agentpayStore = { state: load(), bus };
}
const store = g.__agentpayStore;

export const bus = store.bus;

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/* ---------- events ---------- */

export function emit(e: Omit<FeedEvent, "id" | "ts">): FeedEvent {
  const ev: FeedEvent = { id: newId("ev"), ts: new Date().toISOString(), ...e };
  store.state.events.push(ev);
  if (store.state.events.length > 500) store.state.events.splice(0, store.state.events.length - 500);
  persist(store.state);
  bus.emit("event", ev);
  return ev;
}

export function listEvents(): FeedEvent[] {
  return store.state.events;
}

/* ---------- ledger ---------- */

function rollLedger() {
  if (store.state.ledger.day !== today()) {
    store.state.ledger = { day: today(), spentAtomic: "0", entries: [] };
  }
}

export function getLedger(): Ledger {
  rollLedger();
  return store.state.ledger;
}

export function recordSpend(entry: Omit<LedgerEntry, "id" | "ts">): Ledger {
  rollLedger();
  const l = store.state.ledger;
  l.entries.push({ id: newId("sp"), ts: new Date().toISOString(), ...entry });
  l.spentAtomic = (BigInt(l.spentAtomic) + BigInt(entry.amountAtomic)).toString();
  persist(store.state);
  bus.emit("ledger", l);
  return l;
}

/** Demo helper: pretend the agent already spent some amount today. */
export function setSpent(amountAtomic: string) {
  rollLedger();
  store.state.ledger.spentAtomic = amountAtomic;
  persist(store.state);
  bus.emit("ledger", store.state.ledger);
}

/* ---------- approvals ---------- */

export function listApprovals(): ApprovalRequest[] {
  const now = Date.now();
  for (const a of store.state.approvals) {
    if (a.status === "pending" && Date.parse(a.expiresAt) < now) {
      a.status = "expired";
      a.resolvedAt = new Date().toISOString();
      bus.emit("approval", a);
    }
  }
  return store.state.approvals;
}

export function getApproval(id: string): ApprovalRequest | undefined {
  return listApprovals().find((a) => a.id === id);
}

export function addApproval(a: ApprovalRequest) {
  store.state.approvals.unshift(a);
  persist(store.state);
  bus.emit("approval", a);
}

export function updateApproval(id: string, patch: Partial<ApprovalRequest>): ApprovalRequest | undefined {
  const a = store.state.approvals.find((x) => x.id === id);
  if (!a) return undefined;
  Object.assign(a, patch);
  persist(store.state);
  bus.emit("approval", a);
  return a;
}

export function resetAll() {
  store.state = { events: [], ledger: { day: today(), spentAtomic: "0", entries: [] }, approvals: [] };
  persist(store.state);
  bus.emit("reset", null);
}

/**
 * The World ID user code and verification link let whoever opens them answer
 * the device grant, so only the owner may see them. Everyone else gets the
 * approval with those fields blanked.
 */
export function redactApproval(a: ApprovalRequest): ApprovalRequest {
  if (!a.worldId?.verificationUriComplete && !a.worldId?.userCode) return a;
  return { ...a, worldId: { ...a.worldId, userCode: "", verificationUri: "", verificationUriComplete: "", redacted: true } };
}

export function snapshot({ owner }: { owner: boolean }) {
  const approvals = listApprovals();
  return {
    events: listEvents(),
    ledger: getLedger(),
    approvals: owner ? approvals : approvals.map(redactApproval),
  };
}
