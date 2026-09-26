"use client";

import { useState } from "react";
import { Pill } from "./primitives";

type Integrations = { intercepta: boolean; worldId: boolean; worldIssuer: string; worldDevBypass: boolean; ens: boolean; ensOwnerKey: boolean; adminTokenRequired: boolean };

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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="seal" aria-hidden>
            TG
          </span>
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Trinity Guardian</h1>
            <span className="text-ink-2 text-xs sm:text-sm">ENS gate · Intercepta checkpoint · World ID approver — before every agent payment</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm sm:ml-auto">
          <Pill on={connected} label={connected ? "live feed" : "feed disconnected"} />
          <Pill on={integrations.ens} label={integrations.ens ? "ENS mandate on Sepolia" : "ENS mandate: off-chain fallback"} />
          <Pill on={integrations.intercepta} label={integrations.intercepta ? "Intercepta key loaded" : "Intercepta key missing"} />
          <Pill
            on={integrations.worldId}
            warn={integrations.worldDevBypass}
            label={integrations.worldId ? "World ID sandbox client" : integrations.worldDevBypass ? "World ID dev bypass" : "World ID not configured"}
          />
          {integrations.adminTokenRequired && !needsToken && (
            <button onClick={() => onOwnerToken("")} className="text-xs text-ink-3 underline" title="Forget the owner token in this browser">
              owner unlocked
            </button>
          )}
        </div>
        {needsToken && (
          <form
            className="w-full flex flex-wrap items-center gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerToken(draft.trim());
              setDraft("");
            }}
          >
            <label htmlFor="owner-token" className="text-ink-2">
              {unauthorized ? "That owner token was rejected. " : ""}Owner controls are locked on this deployment. Enter the owner token to revoke, restore, or reset:
            </label>
            <input
              id="owner-token"
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="rounded border border-line bg-paper px-2 py-1 mono text-xs w-56"
              autoComplete="off"
            />
            <button type="submit" className="rounded border border-guard text-guard px-2 py-1 text-xs hover:bg-guard-soft">
              Unlock
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
