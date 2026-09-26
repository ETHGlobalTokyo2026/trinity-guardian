"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequest, FeedEvent } from "@/lib/store";
import type { Mandate } from "@/lib/policy";
import type { Scenario } from "@/lib/agent/scenarios";
import { ApprovalCard } from "./dashboard/ApprovalCard";
import { CheckpointLog } from "./dashboard/RunLog";
import { Header } from "./dashboard/Header";
import { MandatePanel } from "./dashboard/MandatePanel";
import { Pipeline, pipelineFor } from "./dashboard/Pipeline";
import { ScenarioPanel } from "./dashboard/ScenarioPanel";
import { approvalForRun, groupRuns, type Ledger } from "./dashboard/utils";

type State = {
  events: FeedEvent[];
  ledger: Ledger;
  approvals: ApprovalRequest[];
  policy: Mandate;
  policyHash: string;
  scenarios: Scenario[];
  agent: { address: string; ephemeralKey: boolean };
  integrations: { intercepta: boolean; interceptaEnabled: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean; ens: boolean; ensOwnerKey: boolean; adminTokenRequired: boolean };
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
        <div className="h-[83px] border-b border-line bg-sheet" />
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 py-6 sm:px-10 sm:py-9">
          {loadError ? (
            <div role="alert" className="flex flex-col items-center gap-2 rounded-[14px] border-2 border-deny bg-sheet p-7 text-center">
              <p className="text-[19px] font-bold text-deny">✕ Could not load the dashboard</p>
              <p className="mono text-[15px] text-ink-2">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 min-h-11 rounded-[10px] border-[1.5px] border-ink-2 bg-sheet px-5 text-[15px] font-bold text-ink hover:border-guard hover:text-guard"
              >
                ↻ Retry
              </button>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Loading the dashboard" className="flex flex-col gap-4">
              <div className="skeleton h-[180px]" />
              <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_380px]">
                <div className="skeleton h-64" />
                <div className="skeleton h-96" />
                <div className="skeleton hidden h-80 xl:block" />
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  const showDisconnectedBanner = everConnected && !connected;
  const latest = runs[0];
  const flow = pipelineFor(latest, latest ? approvalForRun(state.approvals, latest.runId) : undefined, {
    name: state.policy.onChain?.name,
    authority: state.policy.onChain?.authority,
    perTxMax: state.policy.perTxMax,
    dailyCap: state.policy.dailyCap,
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header connected={connected} integrations={state.integrations} ownerToken={ownerToken} unauthorized={unauthorized} onOwnerToken={saveOwnerToken} />

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-3.5 pb-10 pt-4 sm:gap-8 sm:px-10 sm:pb-14 sm:pt-9">
        {showDisconnectedBanner && (
          <div role="status" className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-hold bg-hold-soft px-4 py-3 text-[15px] font-medium leading-snug text-hold">
            <span aria-hidden className="font-black">
              !
            </span>
            Live feed disconnected — reconnecting automatically. New steps may be delayed until it comes back.
          </div>
        )}
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-[10px] border-[1.5px] border-deny bg-deny-soft py-2.5 pl-4 pr-3 text-[15px] font-medium text-deny">
            <span>✕ {loadError}</span>
            <button type="button" onClick={() => void load()} className="min-h-10 flex-none rounded-lg border-[1.5px] border-deny bg-sheet px-3.5 text-sm font-bold text-deny">
              Retry
            </button>
          </div>
        )}

        {/* 関所 band: the latest payment travelling through the three layers */}
        <section aria-labelledby="flow-h" className="flex flex-col gap-[18px] rounded-[14px] border border-line bg-sheet px-4 pb-5 pt-[18px] sm:gap-[30px] sm:rounded-[18px] sm:px-10 sm:pb-[34px] sm:pt-[30px]">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1 sm:gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[.14em] text-ink-3 sm:text-[13px]">
                Latest payment · <span aria-hidden>関所</span>
              </span>
              <h2 id="flow-h" className="text-[21px] font-black leading-tight sm:text-[28px]">
                {flow.title}
              </h2>
            </div>
            <p className="hidden text-[17px] text-ink-2 sm:block">If any layer says no, the money does not move.</p>
          </div>
          <Pipeline model={flow} />
          <p className="border-t border-dashed border-line pt-3 text-[15px] text-ink-2 sm:hidden">If any layer says no, the money does not move.</p>
        </section>

        {pending && <ApprovalCard a={pending} integrations={state.integrations} onAction={approvalAction} />}

        {/* mobile order: scenarios, log, mandate. lg: log beside a stacked left column. xl: three columns */}
        <div className="grid items-start gap-4 sm:gap-7 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_380px]">
          <div className="lg:col-start-1 lg:row-start-1">
            <ScenarioPanel scenarios={state.scenarios} interceptaEnabled={state.integrations.interceptaEnabled} agent={state.agent} running={running} onRun={run} />
          </div>
          <div ref={feedRef} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:row-span-1">
            <CheckpointLog runs={runs} approvals={state.approvals} />
          </div>
          <div className="lg:col-start-1 lg:row-start-2 xl:col-start-3 xl:row-start-1">
            <MandatePanel
              policy={state.policy}
              policyHash={state.policyHash}
              ledger={state.ledger}
              integrations={state.integrations}
              onSetSpent={setSpent}
              onReset={reset}
              onMandate={mandateAction}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
