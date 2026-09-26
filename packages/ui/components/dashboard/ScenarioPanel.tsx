"use client";

import type { Scenario } from "@/lib/agent/scenarios";
import { CopyText, Expect } from "./primitives";
import { splitScenarioTitle } from "./utils";

export function ScenarioPanel({
  scenarios,
  agent,
  running,
  onRun,
}: {
  scenarios: Scenario[];
  agent: { address: string; ephemeralKey: boolean };
  running: string | null;
  onRun: (id: string) => void;
}) {
  return (
    <section className="bg-sheet border border-line rounded-lg p-4">
      <h2 className="font-semibold mb-1">Agent buys something</h2>
      <p className="text-sm text-ink-2 mb-3">
        Agent <CopyText value={agent.address} />
        {agent.ephemeralKey && <span className="text-hold"> (unfunded throwaway key)</span>}
      </p>
      <div className="space-y-2">
        {scenarios.map((s) => {
          const { index, name } = splitScenarioTitle(s.title);
          const isRunning = running === s.id;
          const disabled = running !== null;
          return (
            <button
              key={s.id}
              onClick={() => onRun(s.id)}
              disabled={disabled}
              aria-busy={isRunning}
              className={`group w-full text-left rounded-md border px-3 py-2 transition-colors ${
                isRunning
                  ? "border-guard bg-guard-soft"
                  : disabled
                    ? "border-line opacity-50 cursor-not-allowed"
                    : "border-line hover:border-guard hover:bg-guard-soft"
              }`}
            >
              <div className="flex items-center gap-2">
                {index && (
                  <span className="mono shrink-0 grid place-items-center size-6 rounded border border-line text-xs font-semibold text-ink-2 group-hover:border-guard group-hover:text-guard">
                    {index}
                  </span>
                )}
                <span className="font-medium flex-1 min-w-0 leading-snug">{name}</span>
                <Expect verdict={s.expected} />
              </div>
              <p className="text-xs text-ink-2 mt-1">{s.description}</p>
              {isRunning && (
                <p className="text-xs text-guard mt-1.5 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-guard animate-pulse" aria-hidden />
                  running the agent now{"…"}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
