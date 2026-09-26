"use client";

import type { Scenario } from "@/lib/agent/scenarios";
import { CopyText, Expect } from "./primitives";
import { splitScenarioTitle } from "./utils";

export function ScenarioPanel({
  scenarios,
  interceptaEnabled,
  agent,
  running,
  onRun,
}: {
  scenarios: Scenario[];
  interceptaEnabled: boolean;
  agent: { address: string; ephemeralKey: boolean };
  running: string | null;
  onRun: (id: string) => void;
}) {
  return (
    <section aria-labelledby="scn-h" className="flex flex-col gap-4 rounded-[14px] border border-line bg-sheet p-[22px]">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[.14em] text-ink-3">
          Demo · <span aria-hidden>実演</span>
        </span>
        <h2 id="scn-h" className="text-[22px] font-bold">
          Agent buys something
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2">
          Agent <CopyText value={agent.address} className="bg-paper text-sm" />
          {agent.ephemeralKey && <span className="font-medium text-hold">(unfunded throwaway key)</span>}
        </p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {scenarios.map((s) => {
          const { index, name } = splitScenarioTitle(s.title);
          // with Intercepta off nothing flags the scam payTo: it is only "not on the allowlist", a soft fail
          const offline = s.id === "scam-payto" && !interceptaEnabled;
          const expected = offline ? "ask_human" : s.expected;
          const description = offline ? "Quote from a new endpoint whose payTo is not on the allowlist. Intercepta is off, so nothing flags it: the Guardian asks the owner." : s.description;
          const isRunning = running === s.id;
          const disabled = running !== null;
          return (
            <li key={s.id} className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onRun(s.id)}
                disabled={disabled}
                aria-busy={isRunning}
                className={`group flex w-full flex-col gap-2 rounded-[10px] p-3.5 text-left transition-colors ${
                  isRunning
                    ? "border-2 border-guard bg-guard-soft"
                    : disabled
                      ? "cursor-not-allowed border border-line bg-sheet opacity-50"
                      : "border border-line bg-sheet hover:border-guard hover:bg-guard-soft"
                }`}
              >
                <span className="flex w-full items-start gap-3">
                  {index && (
                    <span
                      className={`mono grid size-8 flex-none place-items-center rounded-lg border-[1.5px] text-base font-semibold ${
                        isRunning ? "border-guard text-guard" : "border-line text-ink-2 group-hover:border-guard group-hover:text-guard"
                      }`}
                    >
                      {index}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 pt-1 text-[17px] font-bold leading-snug">{name}</span>
                  <span className="mt-[3px]">
                    <Expect verdict={expected} />
                  </span>
                </span>
                <span className="pl-11 text-sm leading-relaxed text-ink-2 text-pretty">{description}</span>
                {isRunning && (
                  <span className="flex items-center gap-2 pl-11 text-sm font-bold text-guard">
                    <span aria-hidden className="size-2 animate-pulse rounded-full bg-guard" />
                    running the agent now{"…"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
