"use client";

import { useState } from "react";
import { Pill } from "./primitives";

type Integrations = { intercepta: boolean; interceptaEnabled: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean; ens: boolean; ensOwnerKey: boolean; adminTokenRequired: boolean };

export function Header({
  connected,
  integrations,
  ownerToken,
  unauthorized,
  onOwnerToken,
}: {
  connected: boolean;
  integrations: Integrations;
  ownerToken: string;
  unauthorized: boolean;
  onOwnerToken: (t: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const needsToken = integrations.adminTokenRequired && (!ownerToken || unauthorized);
  return (
    <header className="border-b border-line bg-sheet">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3.5 px-4 py-3.5 sm:px-10 sm:py-[18px]">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* the owner's hanko seal */}
          <span
            aria-hidden
            className="grid size-[46px] flex-none -rotate-[4deg] place-items-center rounded-[10px] border-[3px] border-deny text-[17px] font-black tracking-[.02em] text-deny shadow-[inset_0_0_0_2px_var(--sheet),inset_0_0_0_3.5px_var(--deny)]"
          >
            TG
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-xl font-black leading-tight sm:text-2xl">Trinity Guardian</h1>
            <span className="text-sm leading-snug text-ink-2">ENS gate · Intercepta checkpoint · World ID approver — before every agent payment</span>
          </div>
        </div>
        <ul aria-label="Integration status" className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Pill on={connected} live label={connected ? "live feed" : "feed disconnected"} />
          <Pill on={integrations.ens} warn={!integrations.ens} label={integrations.ens ? "ENS mandate on Sepolia" : "ENS mandate: off-chain fallback"} />
          {integrations.interceptaEnabled ? (
            <Pill on={integrations.intercepta} label={integrations.intercepta ? "Intercepta key loaded" : "Intercepta key missing"} />
          ) : (
            <Pill on off label="Intercepta off" />
          )}
          <Pill
            on={integrations.worldId}
            warn={!integrations.worldId && integrations.worldDevBypass}
            label={integrations.worldId ? "World ID sandbox client" : integrations.worldDevBypass ? "World ID dev bypass" : "World ID not configured"}
          />
          {integrations.adminTokenRequired && !needsToken && (
            <li>
              <button
                type="button"
                onClick={() => onOwnerToken("")}
                title="Forget the owner token in this browser"
                className="inline-flex items-center gap-[7px] rounded-full border border-guard bg-guard-soft px-3 py-[5px] text-sm font-bold text-guard"
              >
                <span aria-hidden>◉</span>owner unlocked
              </button>
            </li>
          )}
        </ul>
        {needsToken && (
          <form
            className={`flex w-full flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[10px] border px-3.5 py-3 ${unauthorized ? "border-deny bg-deny-soft" : "border-line bg-paper"}`}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerToken(draft.trim());
              setDraft("");
            }}
          >
            <label htmlFor="owner-token" className="flex-[1_1_320px] text-[15px] leading-snug text-ink-2">
              {unauthorized && <strong className="text-deny">✕ That owner token was rejected. </strong>}
              Owner controls are locked on this deployment. Enter the owner token to revoke, restore, or reset:
            </label>
            <div className="flex max-w-[420px] flex-[1_1_280px] gap-2">
              <input
                id="owner-token"
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="owner token"
                autoComplete="off"
                className={`mono h-11 min-w-0 flex-1 rounded-lg border bg-paper px-3 text-sm text-ink ${unauthorized ? "border-deny" : "border-line"}`}
              />
              <button type="submit" className="h-11 rounded-lg bg-guard px-[18px] text-[15px] font-bold text-sheet">
                Unlock
              </button>
            </div>
          </form>
        )}
      </div>
    </header>
  );
}
