import { encodeFunctionData, labelhash, toHex } from "viem";
import { packetToBytes } from "viem/ens";
import { ensPublic, ownerWallet } from "./client";
import { ROLE_SPEND, registryAbi, resolverAbi } from "./constants";
import { ENS_AGENT_LABEL, ENS_AGENT_NAME, ENS_RESOLVER, ENS_USER_REGISTRY } from "./names";

/**
 * Owner-side writes to the on-chain mandate. Used by `pnpm mandate …` and by
 * the dashboard's demo controls. All of them need ENS_OWNER_PRIVATE_KEY.
 */

function need<T>(v: T | undefined, what: string): T {
  if (!v) throw new Error(`${what} not set — run \`pnpm mandate setup\` first`);
  return v;
}

async function send(hash: `0x${string}`) {
  const receipt = await ensPublic.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx ${hash} reverted`);
  return receipt;
}

/** Kill switch: the agent keeps its name, loses the right to spend. */
export async function revokeSpendRole(agent: `0x${string}`) {
  const wallet = ownerWallet();
  const hash = await wallet.writeContract({
    address: need(ENS_USER_REGISTRY, "ENS_USER_REGISTRY"),
    abi: registryAbi,
    functionName: "revokeRoles",
    args: [BigInt(labelhash(ENS_AGENT_LABEL)), ROLE_SPEND, agent],
  });
  await send(hash);
  return hash;
}

export async function grantSpendRole(agent: `0x${string}`) {
  const wallet = ownerWallet();
  const hash = await wallet.writeContract({
    address: need(ENS_USER_REGISTRY, "ENS_USER_REGISTRY"),
    abi: registryAbi,
    functionName: "grantRoles",
    args: [BigInt(labelhash(ENS_AGENT_LABEL)), ROLE_SPEND, agent],
  });
  await send(hash);
  return hash;
}

/** Extend (or shorten is impossible: CannotReduceExpiry) the agent's subname. */
export async function renewAgentName(newExpirySec: number) {
  const wallet = ownerWallet();
  const hash = await wallet.writeContract({
    address: need(ENS_USER_REGISTRY, "ENS_USER_REGISTRY"),
    abi: registryAbi,
    functionName: "renew",
    args: [BigInt(labelhash(ENS_AGENT_LABEL)), BigInt(newExpirySec)],
  });
  await send(hash);
  return hash;
}

export function dnsName(name: string): `0x${string}` {
  return toHex(packetToBytes(name));
}

export function encodeSetText(name: string, key: string, value: string) {
  return encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(name), key, value] });
}

export function encodeSetAddress(name: string, address: `0x${string}`) {
  return encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dnsName(name), 60n, address] });
}

/** Write several records in one transaction. */
export async function setRecords(calls: `0x${string}`[]) {
  const wallet = ownerWallet();
  const hash = await wallet.writeContract({
    address: need(ENS_RESOLVER, "ENS_RESOLVER"),
    abi: resolverAbi,
    functionName: "multicall",
    args: [calls],
  });
  await send(hash);
  return hash;
}

export async function setPolicyRecord(key: string, value: string, name = ENS_AGENT_NAME) {
  return setRecords([encodeSetText(name, key, value)]);
}
