import { labelhash, namehash, getAddress, encodeFunctionData, decodeFunctionResult, parseAbi, type Hex } from "viem";
import { ensPublic } from "../ens/client";
import { MANDATE_KEYS, NAME_STATUS, ROLE_SPEND, registryAbi, resolverAbi } from "../ens/constants";
import { agentIdentity, ENS_PARENT_NAME, ENS_RESOLVER, ENS_USER_REGISTRY, ensConfigured } from "../ens/names";

/**
 * Layer 1 — the ENS gate. Everything the Guardian needs to know about the
 * agent's mandate is read fresh from Sepolia before each signature:
 *
 *   - registry (our UserRegistry proxy, ENSv2 PermissionedRegistry):
 *       getExpiry / getStatus                                  -> expiring subname
 *       hasRoles(labelhash(agent), ROLE_SPEND, agentAddress)  -> kill switch, if granted
 *   - resolver (PermissionedResolver.resolve):
 *       com.trinityguard.authority                             -> the kill switch on the deployed names
 *       com.trinityguard.perTxMax / dailyCap / asset           -> the policy numbers
 *       com.payguard.*                                         -> the same numbers, when written that way
 *       agent-context / agent-endpoint[web]                    -> ENSIP-26 identity
 *   - counterparties: every name in com.payguard.allowlist is forward-resolved
 *     and its ENSIP-26 records fetched, so payTo is matched against *names*.
 *
 * Nothing here is cached: the whole point is that the owner can flip the role
 * on chain and the very next payment sees it.
 */

export type Counterparty = {
  name: string;
  address?: `0x${string}`;
  agentContext?: string;
  endpoint?: string;
};

export type OnChainMandate = {
  chainId: number;
  name: string;
  parent: string;
  registry: `0x${string}`;
  resolver: `0x${string}`;
  status: (typeof NAME_STATUS)[number];
  spendRole: boolean;
  /** com.trinityguard.authority, when the resolver has that record. */
  authority?: "active" | "revoked";
  expiry: number;
  expired: boolean;
  records: Partial<Record<keyof typeof MANDATE_KEYS, string>>;
  counterparties: Counterparty[];
  latencyMs: number;
  fetchedAt: string;
  error?: string;
};

export function ensGateConfigured(): boolean {
  return ensConfigured();
}

const textAbi = parseAbi(["function text(bytes32 node, string key) view returns (string)"]);

const TRINITY_KEYS = {
  authority: "com.trinityguard.authority",
  perTxMax: "com.trinityguard.perTxMax",
  dailyCap: "com.trinityguard.dailyCap",
  asset: "com.trinityguard.asset",
} as const;

function dnsEncode(name: string): Hex {
  let encoded = "0x";
  for (const label of name.split(".")) {
    const bytes = new TextEncoder().encode(label);
    encoded += bytes.length.toString(16).padStart(2, "0");
    for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  }
  return `${encoded}00` as Hex;
}

/** PermissionedResolver stores text behind resolve(); a direct text() call reverts. */
async function resolverText(name: string, key: string): Promise<string | undefined> {
  if (!ENS_RESOLVER) return undefined;
  try {
    const data = encodeFunctionData({ abi: textAbi, functionName: "text", args: [namehash(name), key] });
    const raw = await ensPublic.readContract({
      address: ENS_RESOLVER,
      abi: resolverAbi,
      functionName: "resolve",
      args: [dnsEncode(name), data],
    });
    const value = decodeFunctionResult({ abi: textAbi, functionName: "text", data: raw });
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function text(name: string, key: string): Promise<string | undefined> {
  try {
    const v = await ensPublic.getEnsText({ name, key });
    return v ?? undefined;
  } catch {
    return undefined;
  }
}

async function resolveCounterparty(name: string): Promise<Counterparty> {
  const [addr, agentContext, endpoint] = await Promise.all([
    ensPublic.getEnsAddress({ name }).catch(() => null),
    text(name, MANDATE_KEYS.agentContext),
    text(name, MANDATE_KEYS.agentEndpointWeb),
  ]);
  return { name, address: addr ? getAddress(addr) : undefined, agentContext, endpoint };
}

export async function readOnChainMandate(agentAddress: `0x${string}`, agentLabel?: string): Promise<OnChainMandate> {
  const started = Date.now();
  const who = agentIdentity(agentLabel);
  const registry = ENS_USER_REGISTRY!;
  const resolver = ENS_RESOLVER!;
  const base = {
    chainId: 11155111,
    name: who.name,
    parent: ENS_PARENT_NAME,
    registry,
    resolver,
    fetchedAt: new Date(started).toISOString(),
  };
  try {
    const id = BigInt(labelhash(who.label));
    const [roleHeld, expiry, status, authority, chainPerTx, chainDaily, chainAsset] = await Promise.all([
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "hasRoles", args: [id, ROLE_SPEND, agentAddress] }),
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "getExpiry", args: [id] }),
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "getStatus", args: [id] }),
      resolverText(who.name, TRINITY_KEYS.authority),
      resolverText(who.name, TRINITY_KEYS.perTxMax),
      resolverText(who.name, TRINITY_KEYS.dailyCap),
      resolverText(who.name, TRINITY_KEYS.asset),
    ]);
    const spendRole = authority === "revoked" ? false : authority === "active" ? true : roleHeld;
    const keys = Object.entries(MANDATE_KEYS) as [keyof typeof MANDATE_KEYS, string][];
    const values = await Promise.all(keys.map(([, k]) => text(who.name, k)));
    const records = Object.fromEntries(keys.map(([k], i) => [k, values[i]])) as OnChainMandate["records"];
    if (chainPerTx) records.perTxMax = chainPerTx;
    if (chainDaily) records.dailyCap = chainDaily;
    if (chainAsset) records.asset = chainAsset;
    const names = (records.allowlist ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const counterparties = await Promise.all(names.map(resolveCounterparty));
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      ...base,
      status: NAME_STATUS[Number(status)] ?? "available",
      spendRole,
      authority: authority === "active" || authority === "revoked" ? authority : undefined,
      expiry: Number(expiry),
      expired: nowSec >= Number(expiry),
      records,
      counterparties,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ...base,
      status: "available",
      spendRole: false,
      expiry: 0,
      expired: true,
      records: {},
      counterparties: [],
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
