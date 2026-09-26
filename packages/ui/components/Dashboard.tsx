"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { Mandate } from "@/lib/policy";
import type { Scenario } from "@/lib/agent/scenarios";
import { ApprovalCard } from "./dashboard/ApprovalCard";
import { CheckpointLog } from "./dashboard/RunLog";
import { Header } from "./dashboard/Header";
import { MandatePanel } from "./dashboard/MandatePanel";
import { ScenarioPanel } from "./dashboard/ScenarioPanel";
import { groupRuns, type Ledger } from "./dashboard/utils";

type State = {
  events: FeedEvent[];
  ledger: Ledger;
  approvals: ApprovalRequest[];
  policy: Mandate;
  policyHash: string;
  scenarios: Scenario[];
  agent: { address: string; ephemeralKey: boolean };
  integrations: { intercepta: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean; ens: boolean; ensOwnerKey: boolean; adminTokenRequired: boolean };
};

export default function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [ownerToken, setOwnerToken] = useState<string>(() => {
    try {
      return localStorage.getItem("ownerToken") ?? "";
    } catch {
      return "";
    }
  });
  const [unauthorized, setUnauthorized] = useState(false);
  // load() is created once, so it reads the token through a ref
  const ownerTokenRef = useRef(ownerToken);
  useEffect(() => {
    ownerTokenRef.current = ownerToken;
  }, [ownerToken]);

  const saveOwnerToken = (t: string) => {
    setOwnerToken(t);
    ownerTokenRef.current = t;
    setUnauthorized(false);
    try {
      if (t) localStorage.setItem("ownerToken", t);
      else localStorage.removeItem("ownerToken");
    } catch {
      /* private mode */
    }
    void load();
  };

  /** POST to an owner-only route with the owner token attached. */
  const ownerPost = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}) },
      body: JSON.stringify(body),
    });
    if (res.status === 401) setUnauthorized(true);
    return res;
  };
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const t = ownerTokenRef.current;
      // the owner token unlocks the World ID code and QR link on pending approvals
      const res = await fetch("/api/state", { cache: "no-store", headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      setState(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "could not load the dashboard state");
    }
  }, []);

  useEffect(() => {
    // The stream emits a full snapshot on connect, so no separate initial fetch is needed.
    const es = new EventSource("/api/events");
    es.onopen = () => {
      setConnected(true);
      setEverConnected(true);
    };
    es.onerror = () => setConnected(false);
    es.addEventListener("snapshot", () => void load());
    es.addEventListener("event", (m) => {
      const ev = JSON.parse((m as MessageEvent).data) as FeedEvent;
      setState((s) => (s ? { ...s, events: [...s.events.filter((e) => e.id !== ev.id), ev] } : s));
    });
    es.addEventListener("ledger", (m) => {
      const ledger = JSON.parse((m as MessageEvent).data) as Ledger;
      setState((s) => (s ? { ...s, ledger } : s));
    });
    es.addEventListener("approval", (m) => {
      const a = JSON.parse((m as MessageEvent).data) as ApprovalRequest;
      // SSE cannot carry the owner token: fetch the unredacted approval over an authorized request
      if (a.worldId?.redacted && ownerTokenRef.current) void load();
      setState((s) => {
        if (!s) return s;
        const rest = s.approvals.filter((x) => x.id !== a.id);
        return { ...s, approvals: [a, ...rest] };
      });
    });
    return () => es.close();
  }, [load]);

  const run = async (id: string) => {
    setRunning(id);
    try {
      await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: id }) });
    } finally {
      // the run streams in over SSE; release the buttons after a beat so the click registers
      setTimeout(() => setRunning(null), 800);
    }
  };

  const reset = async () => {
    await ownerPost("/api/admin/reset", { action: "reset" });
    await load();
  };

  const mandateAction = async (action: "revoke" | "grant" | "renew") => {
    await ownerPost("/api/admin/mandate", { action });
    await load();
  };

  const setSpent = async (spent: string) => {
    await ownerPost("/api/admin/reset", { action: "set-spent", spent });
  };

  const approvalAction = async (id: string, action: string) => {
    await ownerPost(`/api/approvals/${id}`, { action });
  };

  const runs = useMemo(() => groupRuns(state?.events ?? []), [state?.events]);
  const pending = state?.approvals.find((a) => a.status === "pending");

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [runs.length]);

  if (!state) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b border-line bg-sheet h-[73px]" />
        <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[320px_1fr] flex-1">
          {loadError ? (
            <div className="lg:col-span-2 bg-sheet border border-deny/40 rounded-lg p-6 text-center">
              <p className="text-deny font-medium">Could not load the dashboard</p>
              <p className="text-sm text-ink-2 mt-1">{loadError}</p>
              <button onClick={() => void load()} className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm hover:border-guard hover:text-guard">
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="skeleton h-40 rounded-lg" />
                <div className="skeleton h-64 rounded-lg" />
              </div>
              <div className="skeleton h-72 rounded-lg" />
            </>
          )}
        </main>
      </div>
    );
  }

  const showDisconnectedBanner = everConnected && !connected;

  return (
    <div className="flex-1 flex flex-col">
      <Header connected={connected} integrations={state.integrations} ownerToken={ownerToken} unauthorized={unauthorized} onOwnerToken={saveOwnerToken} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[320px_1fr] flex-1">
        <aside className="space-y-6">
          <ScenarioPanel scenarios={state.scenarios} agent={state.agent} running={running} onRun={run} />
          <MandatePanel
            policy={state.policy}
            policyHash={state.policyHash}
            ledger={state.ledger}
            integrations={state.integrations}
            onSetSpent={setSpent}
            onReset={reset}
            onMandate={mandateAction}
          />
        </aside>

        <section className="min-w-0 space-y-6">
          {showDisconnectedBanner && (
            <div className="rounded-lg border border-hold/50 bg-hold-soft text-hold text-sm px-4 py-2.5">
              Live feed disconnected — reconnecting automatically. New steps may be delayed until it comes back.
            </div>
          )}
          {loadError && (
            <div className="rounded-lg border border-deny/50 bg-deny-soft text-deny text-sm px-4 py-2.5 flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <button onClick={() => void load()} className="underline shrink-0">
                Retry
              </button>
            </div>
          )}

          {pending && <ApprovalCard a={pending} integrations={state.integrations} onAction={approvalAction} />}

          <div ref={feedRef}>
            <CheckpointLog runs={runs} approvals={state.approvals} />
          </div>
        </section>
      </main>
    </div>
  );
}
