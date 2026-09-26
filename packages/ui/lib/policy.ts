import { createHash } from "node:crypto";
import { INTERCEPTA_ENABLED, NETWORK, SELLER_ADDRESS, USDC_BASE_SEPOLIA } from "./config";
import { ensGateConfigured, readOnChainMandate, type OnChainMandate } from "./guardian/ens";
import { agentIdentity, ENS_AGENT_LABEL } from "./ens/names";
import { envOr } from "./env";

/**
 * The owner-authored spending mandate the Guardian enforces before every signature.
 *
 * In Trinity Guardian the mandate lives ON CHAIN: the `spend` role and the
 * subname expiry sit in our ENSv2 registry, the numbers sit in ENS text records,
 * and the allowlist is a list of ENS names. `loadMandate()` reads all of that
 * fresh from Sepolia. The static values below are only the off-chain fallback
 * used when no registry is configured (and the dashboard says so loudly).
 */
export type Policy = {
  agent: string;
  network: string;
  asset: `0x${string}`;
  assetSymbol: string;
  decimals: number;
  /** Max amount per single payment, in whole units (e.g. "5" = 5 USDC). */
  perTxMax: string;
  /** Max total spend per UTC day, in whole units. */
  dailyCap: string;
  /** Counterparties the agent may pay without asking a human (resolved addresses). */
  allowlist: `0x${string}`[];
  /** The same counterparties as ENS names (empty in fallback mode). */
  allowlistNames: string[];
  requireHumanIf: string[];
  /** ISO date after which the mandate is void. */
  expires: string;
};

export type Mandate = Policy & {
  source: "ens" | "fallback";
  onChain?: OnChainMandate;
};

export const fallbackPolicy: Policy = {
  agent: ENS_AGENT_LABEL,
  network: NETWORK,
  asset: USDC_BASE_SEPOLIA,
  assetSymbol: "USDC",
  decimals: 6,
  perTxMax: envOr("POLICY_PER_TX_MAX", "5"),
  dailyCap: envOr("POLICY_DAILY_CAP", "50"),
  allowlist: [SELLER_ADDRESS],
  allowlistNames: [],
  requireHumanIf: [
    "the amount is above the per-payment max",
    "the payee is not on the allowlist",
    ...(INTERCEPTA_ENABLED ? ["Intercepta gives no verdict"] : []),
  ],
  expires: envOr("POLICY_EXPIRES", "2026-09-28T00:00:00Z"),
};

/** Kept for code that only needs static shape info (decimals, symbol). Prefer loadMandate(). */
export const policy = fallbackPolicy;

/** Read the mandate from ENS (fresh, no cache), falling back to the static policy. */
export async function loadMandate(agentAddress: `0x${string}`, agentLabel?: string): Promise<Mandate> {
  const who = agentIdentity(agentLabel);
  if (!ensGateConfigured()) return { ...fallbackPolicy, agent: who.label, source: "fallback" };
  const onChain = await readOnChainMandate(agentAddress, who.label);
  const r = onChain.records;
  const chainAllow = onChain.counterparties.map((c) => c.address).filter((a): a is `0x${string}` => Boolean(a));
  return {
    ...fallbackPolicy,
    agent: who.label,
    source: "ens",
    onChain,
    perTxMax: chainAmount(r.perTxMax, fallbackPolicy.perTxMax),
    dailyCap: chainAmount(r.dailyCap, fallbackPolicy.dailyCap),
    asset: (r.asset as `0x${string}`) ?? fallbackPolicy.asset,
    network: r.network ?? fallbackPolicy.network,
    allowlist: chainAllow.length ? chainAllow : fallbackPolicy.allowlist,
    allowlistNames: chainAllow.length ? onChain.counterparties.map((c) => c.name) : fallbackPolicy.allowlistNames,
    expires: onChain.expiry ? new Date(onChain.expiry * 1000).toISOString() : fallbackPolicy.expires,
  };
}

/** Stable hash of the mandate as enforced, shown on the dashboard as a transparency log. */
export function policyHash(p: Policy): string {
  const { agent, network, asset, perTxMax, dailyCap, allowlist, allowlistNames, expires } = p;
  const canonical = JSON.stringify({ agent, network, asset, perTxMax, dailyCap, allowlist, allowlistNames, expires });
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}

/** Chain amounts are base units (5000000 = 5 USDC). Short values are already whole units. */
function chainAmount(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  if (!v) return fallback;
  if (/^\d+$/.test(v) && v.length > 6) return fromAtomic(v);
  return v;
}

export function toAtomic(whole: string, decimals = fallbackPolicy.decimals): bigint {
  const [int, frac = ""] = whole.split(".");
  return BigInt((int || "0") + frac.padEnd(decimals, "0").slice(0, decimals));
}

export function fromAtomic(atomic: bigint | string, decimals = fallbackPolicy.decimals): string {
  const n = BigInt(atomic);
  const s = n.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}
