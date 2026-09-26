"use client";

import { useState } from "react";
import type { Mandate } from "@/lib/policy";
import { CopyText, StatusChip } from "./primitives";
import { fmt, shortAddr, type Ledger } from "./utils";

type Integrations = { ens: boolean; ensOwnerKey: boolean };

export function MandatePanel({
  policy,
  policyHash,
  ledger,
  integrations,
  onSetSpent,
  onReset,
  onMandate,
}: {
  policy: Mandate;
  policyHash: string;
  ledger: Ledger;
  integrations: Integrations;
  onSetSpent: (spent: string) => void;
  onReset: () => void;
  onMandate: (action: "revoke" | "grant" | "renew") => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const oc = policy.onChain;
  const gateOn = Boolean(oc && !oc.error && oc.status === "registered" && oc.spendRole && !oc.expired);

  const act = async (action: "revoke" | "grant" | "renew") => {
    setBusy(action);
    try {
      await onMandate(action);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-sheet border border-line rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold">Owner&apos;s mandate</h2>
        <span className={`text-xs ${policy.source === "ens" ? "text-allow" : "text-hold"}`}>
          {policy.source === "ens" ? "read from ENSv2 on Sepolia" : "off-chain fallback"}
        </span>
      </div>

      {policy.source === "ens" && oc && (
        <div className={`rounded-md border p-3 mb-3 ${gateOn ? "border-allow/50 bg-allow-soft/40" : "border-deny/50 bg-deny-soft/40"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-sm font-medium">{oc.name}</span>
            <StatusChip tone={gateOn ? "pass" : "fail"}>{gateOn ? "spend role active" : oc.error ? "unreadable" : oc.expired ? "expired" : oc.status !== "registered" ? oc.status : "spend role revoked"}</StatusChip>
          </div>
          <dl className="mt-2 text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 [&>dt]:text-ink-2 [&>dt]:whitespace-nowrap">
            <dt>Registry</dt>
            <dd>
              <a className="underline" href={`https://sepolia.etherscan.io/address/${oc.registry}`} target="_blank" rel="noreferrer">
                <span className="mono">{shortAddr(oc.registry)}</span>
              </a>{" "}
              <span className="text-ink-3">(our UserRegistry, EAC role bitmap)</span>
            </dd>
            <dt>Resolver</dt>
            <dd>
              <a className="underline" href={`https://sepolia.etherscan.io/address/${oc.resolver}`} target="_blank" rel="noreferrer">
                <span className="mono">{shortAddr(oc.resolver)}</span>
              </a>{" "}
              <span className="text-ink-3">(PermissionedResolver, text records)</span>
            </dd>
            <dt>Subname expires</dt>
            <dd>{oc.expiry ? new Date(oc.expiry * 1000).toLocaleString([], { hour12: false }) : "—"}</dd>
            {oc.records.agentEndpointWeb && (
              <>
                <dt>agent-endpoint[web]</dt>
                <dd className="break-all">{oc.records.agentEndpointWeb}</dd>
              </>
            )}
            <dt>Read in</dt>
            <dd>{oc.latencyMs} ms{oc.error ? ` · ${oc.error.slice(0, 80)}` : ""}</dd>
          </dl>
        </div>
      )}

      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 [&>dt]:whitespace-nowrap">
        <dt className="text-ink-2">Agent</dt>
        <dd>{policy.agent}</dd>
        <dt className="text-ink-2">Asset</dt>
        <dd>
          {policy.assetSymbol} on {policy.network}
        </dd>
        <dt className="text-ink-2">Per payment</dt>
        <dd className="mono">
          &le; {policy.perTxMax} {policy.assetSymbol}
        </dd>
        <dt className="text-ink-2">Per day</dt>
        <dd className="mono">
          &le; {policy.dailyCap} {policy.assetSymbol}
        </dd>
        <dt className="text-ink-2 self-start">Allowlist</dt>
        <dd className="flex flex-wrap gap-1.5">
          {policy.onChain?.counterparties.length
            ? policy.onChain.counterparties.map((c) => (
                <span key={c.name} title={`${c.address ?? "unresolved"}${c.endpoint ? `\n${c.endpoint}` : ""}${c.agentContext ? `\n${c.agentContext}` : ""}`} className="text-xs border border-line rounded px-1.5 py-0.5 mono">
                  {c.name}
                  {!c.address && <span className="text-deny"> (no address)</span>}
                </span>
              ))
            : policy.allowlist.map((a) => <CopyText key={a} value={a} className="text-xs border border-line rounded px-1.5 py-0.5" />)}
        </dd>
        <dt className="text-ink-2">Ask a human if</dt>
        <dd className="text-ink-2">{policy.requireHumanIf.join("; ")}</dd>
        {policy.source === "fallback" && (
          <>
            <dt className="text-ink-2">Expires</dt>
            <dd>{policy.expires.slice(0, 10)}</dd>
          </>
        )}
      </dl>

      <SpendMeter ledger={ledger} policy={policy} />

      <p className="text-xs text-ink-3 mt-3">
        mandate hash <CopyText value={policyHash} display={`${policyHash.slice(0, 10)}…${policyHash.slice(-6)}`} />
      </p>

      <div className="mt-4 pt-3 border-t border-dashed border-line">
        <p className="text-xs text-ink-3 mb-1.5">Owner&apos;s hand on the chain</p>
        {integrations.ens && integrations.ensOwnerKey ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => act("revoke")}
              disabled={busy !== null || !gateOn}
              className="rounded border border-deny text-deny px-2 py-1 hover:bg-deny-soft disabled:opacity-40 transition-colors"
            >
              {busy === "revoke" ? "revoking…" : "Revoke spend role"}
            </button>
            <button
              onClick={() => act("grant")}
              disabled={busy !== null || gateOn}
              className="rounded border border-allow text-allow px-2 py-1 hover:bg-allow-soft disabled:opacity-40 transition-colors"
            >
              {busy === "grant" ? "restoring…" : "Restore spend role"}
            </button>
            <button onClick={() => act("renew")} disabled={busy !== null} className="rounded border border-line px-2 py-1 text-ink-2 hover:border-guard hover:text-guard disabled:opacity-40 transition-colors">
              {busy === "renew" ? "renewing…" : "Renew name 7 days"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-3">
            {integrations.ens ? "Set ENS_OWNER_PRIVATE_KEY to flip the spend role from here, or use `pnpm mandate revoke`." : "Run `pnpm mandate setup` to put this mandate on Sepolia."}
          </p>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-dashed border-line">
        <p className="text-xs text-ink-3 mb-1.5">Demo controls</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => onSetSpent("47")} className="rounded border border-line px-2 py-1 text-ink-2 hover:border-guard hover:text-guard transition-colors">
            Pretend 47 spent today
          </button>
          <button onClick={() => onSetSpent("0")} className="rounded border border-line px-2 py-1 text-ink-2 hover:border-guard hover:text-guard transition-colors">
            Clear today&apos;s spend
          </button>
          <button onClick={onReset} className="rounded border border-line px-2 py-1 text-ink-2 hover:border-deny hover:text-deny transition-colors">
            Clear log
          </button>
        </div>
      </div>
    </section>
  );
}

function SpendMeter({ ledger, policy }: { ledger: Ledger; policy: Mandate }) {
  const spent = BigInt(ledger.spentAtomic);
  const cap = BigInt(Math.round(Number(policy.dailyCap) * 10 ** policy.decimals));
  const pct = cap > 0n ? Math.min(100, Number((spent * 100n) / cap)) : 0;
  const barColor = pct >= 90 ? "bg-deny" : pct >= 60 ? "bg-hold" : "bg-guard";
  return (
    <div className="mt-4">
      <div className="flex justify-between text-sm">
        <span className="text-ink-2">Spent today ({ledger.day})</span>
        <span className="mono">
          {fmt(spent, policy.decimals)} / {policy.dailyCap} {policy.assetSymbol}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded bg-line overflow-hidden">
        <div className={`h-full transition-[width] ${barColor}`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 left-[60%] w-px bg-sheet/70" aria-hidden />
        <span className="absolute inset-y-0 left-[90%] w-px bg-sheet/70" aria-hidden />
      </div>
    </div>
  );
}
