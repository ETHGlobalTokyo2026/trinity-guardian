import { labelhash, getAddress } from "viem";
import { ensPublic } from "../ens/client";
import { MANDATE_KEYS, NAME_STATUS, ROLE_SPEND, registryAbi } from "../ens/constants";
import { ENS_AGENT_LABEL, ENS_AGENT_NAME, ENS_PARENT_NAME, ENS_RESOLVER, ENS_USER_REGISTRY, ensConfigured } from "../ens/names";

/**
 * Layer 1 — the ENS gate. Everything the Guardian needs to know about the
 * agent's mandate is read fresh from Sepolia before each signature:
 *
 *   - registry (our UserRegistry proxy, ENSv2 PermissionedRegistry):
 *       hasRoles(labelhash(agent), ROLE_SPEND, agentAddress)  -> the kill switch
 *       getExpiry / getStatus                                  -> expiring subname
 *   - resolver (our PermissionedResolver proxy), via the Universal Resolver:
 *       com.payguard.*  text records                           -> the policy numbers
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

export async function readOnChainMandate(agentAddress: `0x${string}`): Promise<OnChainMandate> {
  const started = Date.now();
  const registry = ENS_USER_REGISTRY!;
  const resolver = ENS_RESOLVER!;
  const base = {
    chainId: 11155111,
    name: ENS_AGENT_NAME,
    parent: ENS_PARENT_NAME,
    registry,
    resolver,
    fetchedAt: new Date(started).toISOString(),
  };
  try {
    const id = BigInt(labelhash(ENS_AGENT_LABEL));
    const [spendRole, expiry, status] = await Promise.all([
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "hasRoles", args: [id, ROLE_SPEND, agentAddress] }),
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "getExpiry", args: [id] }),
      ensPublic.readContract({ address: registry, abi: registryAbi, functionName: "getStatus", args: [id] }),
    ]);
    const keys = Object.entries(MANDATE_KEYS) as [keyof typeof MANDATE_KEYS, string][];
    const values = await Promise.all(keys.map(([, k]) => text(ENS_AGENT_NAME, k)));
    const records = Object.fromEntries(keys.map(([k], i) => [k, values[i]])) as OnChainMandate["records"];
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
