"use client";

import { useState } from "react";
import type { Mandate } from "@/lib/policy";
import { networkName } from "@/lib/chains";
import { CopyText, GateGlyph } from "./primitives";
import { fmt, shortAddr, spendGateOpen, type Ledger } from "./utils";

type Integrations = { ens: boolean; ensOwnerKey: boolean };

const OWNER_BTN = "min-h-11 rounded-[10px] border-[1.5px] px-3.5 text-[15px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const DEMO_BTN = "min-h-10 rounded-lg border border-line bg-sheet px-3 text-sm font-medium text-ink-2 transition-colors";

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
  const gateOn = spendGateOpen(policy);

  const act = async (action: "revoke" | "grant" | "renew") => {
    setBusy(action);
    try {
      await onMandate(action);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="md-h" className="flex flex-col gap-5 rounded-[14px] border border-line bg-sheet p-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[.14em] text-ink-3">
            Layer 1 · <span aria-hidden>一 — 委任</span>
          </span>
          <h2 id="md-h" className="text-[22px] font-bold">
            Owner&apos;s mandate
          </h2>
        </div>
        <span className={`text-sm font-bold ${policy.source === "ens" ? "text-allow" : "text-hold"}`}>
          {policy.source === "ens" ? "✓ read from ENSv2 on Sepolia" : "! off-chain fallback"}
        </span>
      </div>

      {policy.source === "ens" && oc && (
        <div className={`flex flex-col gap-3 rounded-xl border-2 p-4 ${gateOn ? "border-allow bg-allow-soft" : "border-deny bg-deny-soft"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <GateGlyph size={30} closed={!gateOn} className={`flex-none ${gateOn ? "text-allow" : "text-deny"}`} />
              <span className="mono break-all text-[17px] font-semibold">{oc.name}</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-sheet px-3 py-1 text-sm font-bold ${gateOn ? "border-allow text-allow" : "border-deny text-deny"}`}>
              <span aria-hidden>{gateOn ? "✓" : "✕"}</span>
              {gateOn ? (oc.authority === "active" ? "authority active" : "spend role active") : oc.error ? "unreadable" : oc.expired ? "expired" : oc.status !== "registered" ? oc.status : oc.authority === "revoked" ? "authority revoked" : "spend role revoked"}
            </span>
          </div>
          {!gateOn && !oc.error && (
            <p className="text-[15px] font-bold leading-snug text-deny">
              {oc.authority === "revoked"
                ? "Gate closed. Layer 1 refuses every payment while authority is revoked on chain."
                : "Gate closed. Layer 1 refuses every payment until the spend role is restored."}
            </p>
          )}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-sm leading-snug [&>dt]:whitespace-nowrap [&>dt]:text-ink-2">
            <dt>Registry</dt>
            <dd>
              <a className="mono text-guard underline" href={`https://sepolia.etherscan.io/address/${oc.registry}`} target="_blank" rel="noreferrer">
                {shortAddr(oc.registry)}
              </a>{" "}
              <span className="text-ink-3">(our UserRegistry, EAC role bitmap)</span>
            </dd>
            <dt>Resolver</dt>
            <dd>
              <a className="mono text-guard underline" href={`https://sepolia.etherscan.io/address/${oc.resolver}`} target="_blank" rel="noreferrer">
                {shortAddr(oc.resolver)}
              </a>{" "}
              <span className="text-ink-3">(PermissionedResolver, text records)</span>
            </dd>
            {oc.authority && (
              <>
                <dt>Authority</dt>
                <dd className="mono">{oc.authority}</dd>
              </>
            )}
            <dt>Subname expires</dt>
            <dd className="mono">{oc.expiry ? new Date(oc.expiry * 1000).toLocaleString([], { hour12: false }) : "—"}</dd>
            {oc.records.agentEndpointWeb && (
              <>
                <dt>agent-endpoint[web]</dt>
                <dd className="mono break-all">{oc.records.agentEndpointWeb}</dd>
              </>
            )}
            <dt>Read in</dt>
            <dd className="mono">
              {oc.latencyMs} ms{oc.error ? ` · ${oc.error.slice(0, 80)}` : ""}
            </dd>
          </dl>
        </div>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px] leading-snug [&>dt]:whitespace-nowrap [&>dt]:text-ink-2">
        <dt>Agent</dt>
        <dd>{policy.agent}</dd>
        <dt>Asset</dt>
        <dd>
          {policy.assetSymbol} on <span title={policy.network}>{networkName(policy.network)}</span>
        </dd>
        <dt>Per payment</dt>
        <dd className="mono">
          &le; {policy.perTxMax} {policy.assetSymbol}
        </dd>
        <dt>Per day</dt>
        <dd className="mono">
          &le; {policy.dailyCap} {policy.assetSymbol}
        </dd>
        <dt className="self-start">Allowlist</dt>
        <dd className="flex flex-wrap gap-1.5">
          {policy.onChain?.counterparties.length
            ? policy.onChain.counterparties.map((c) => (
                <span
                  key={c.name}
                  title={`${c.address ?? "unresolved"}${c.endpoint ? `\n${c.endpoint}` : ""}${c.agentContext ? `\n${c.agentContext}` : ""}`}
                  className="mono rounded-md border border-line bg-paper px-2 py-[3px] text-[13px] font-medium"
                >
                  {c.name}
                  {!c.address && <span className="text-deny"> (no address)</span>}
                </span>
              ))
            : policy.allowlist.map((a) => <CopyText key={a} value={a} className="bg-paper text-[13px]" />)}
        </dd>
        <dt>Ask a human if</dt>
        <dd className="text-ink-2">{policy.requireHumanIf.join("; ")}</dd>
        {policy.source === "fallback" && (
          <>
            <dt>Expires</dt>
            <dd>{policy.expires.slice(0, 10)}</dd>
          </>
        )}
      </dl>

      <SpendMeter ledger={ledger} policy={policy} />

      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        mandate hash <CopyText value={policyHash} display={`${policyHash.slice(0, 10)}…${policyHash.slice(-6)}`} className="bg-paper text-[13px] text-ink-2" />
      </p>

      <div className="flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
        <span className="text-[13px] font-bold text-ink-3">Owner&apos;s hand on the chain</span>
        {integrations.ens && integrations.ensOwnerKey ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => act("revoke")} disabled={busy !== null || !gateOn} className={`${OWNER_BTN} border-deny bg-sheet text-deny hover:bg-deny-soft`}>
              {busy === "revoke" ? "revoking…" : "✕ Revoke spend role"}
            </button>
            <button
              type="button"
              onClick={() => act("grant")}
              disabled={busy !== null || gateOn}
              className={`${OWNER_BTN} border-allow ${gateOn ? "bg-sheet text-allow" : "bg-allow text-sheet"}`}
            >
              {busy === "grant" ? "restoring…" : "↺ Restore spend role"}
            </button>
            <button type="button" onClick={() => act("renew")} disabled={busy !== null} className={`${OWNER_BTN} border-line bg-sheet text-ink-2 hover:border-guard hover:text-guard`}>
              {busy === "renew" ? "renewing…" : "↻ Renew name 7 days"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            {integrations.ens ? (
              <>
                Set <code className="mono">ENS_OWNER_PRIVATE_KEY</code> to flip the spend role from here, or use <code className="mono">pnpm mandate revoke</code>.
              </>
            ) : (
              <>
                Run <code className="mono">pnpm mandate setup</code> to put this mandate on Sepolia.
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
        <span className="text-[13px] font-bold text-ink-3">Demo controls</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onSetSpent("47")} className={`${DEMO_BTN} hover:border-guard hover:text-guard`}>
            Pretend 47 spent today
          </button>
          <button type="button" onClick={() => onSetSpent("0")} className={`${DEMO_BTN} hover:border-guard hover:text-guard`}>
            Clear today&apos;s spend
          </button>
          <button type="button" onClick={onReset} className={`${DEMO_BTN} hover:border-deny hover:text-deny`}>
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
  const barColor = pct >= 90 ? "bg-deny" : pct >= 60 ? "bg-hold" : "bg-allow";
  const spentDisplay = fmt(spent, policy.decimals);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[15px]">
        <span className="text-ink-2">Spent today ({ledger.day})</span>
        <span className="mono font-semibold">
          {spentDisplay} / {policy.dailyCap} {policy.assetSymbol}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Spent today"
        aria-valuemin={0}
        aria-valuemax={Number(policy.dailyCap)}
        aria-valuenow={Number(spentDisplay)}
        className="relative h-3 overflow-hidden rounded-full bg-line"
      >
        <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${pct}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-[60%] w-0.5 bg-sheet" />
        <span aria-hidden className="absolute inset-y-0 left-[90%] w-0.5 bg-sheet" />
      </div>
      <div aria-hidden className="mono relative h-4 text-xs font-medium text-ink-3">
        <span className="absolute left-[60%] -translate-x-1/2">60%</span>
        <span className="absolute left-[90%] -translate-x-1/2">90%</span>
      </div>
      {pct >= 90 && <p className="text-sm font-bold text-deny">✕ {pct}% of today&apos;s cap used</p>}
    </div>
  );
}
