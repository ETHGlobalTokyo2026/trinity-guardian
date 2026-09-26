import {
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  type Hex,
} from "viem";

export const RESOLVER = "0xf23345070E24cb42E0A87323F75b84a34d9D33f6" as const;

export const POLICY_TEXT_KEYS = [
  "com.trinityguard.perTxMax",
  "com.trinityguard.dailyCap",
  "com.trinityguard.asset",
  "com.trinityguard.authority",
] as const;

export type PolicyTextKey = (typeof POLICY_TEXT_KEYS)[number];

export const POLICY_NAMES = [
  "momo.agents.trinityguard.eth",
  "rogue.agents.trinityguard.eth",
] as const;

const resolveAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes)",
]);

const textAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
]);

export const setTextAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
]);

export const SET_TEXT_FROM = "0x9A8F6F3fc819BEE96f0a76bAA4afa424c10c4B11" as const;

export const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const POLICY_WRITES = [
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.authority", value: "active" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.perTxMax", value: "5000000" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.dailyCap", value: "50000000" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.asset", value: USDC_SEPOLIA },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.authority", value: "revoked" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.perTxMax", value: "5000000" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.dailyCap", value: "50000000" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.asset", value: USDC_SEPOLIA },
] as const;

export const DRY_RUN_TEXT_WRITES = [
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.authority", value: "active" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.perTxMax", value: "5000000" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.dailyCap", value: "50000000" },
  { name: "momo.agents.trinityguard.eth", key: "com.trinityguard.asset", value: "USDC" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.authority", value: "revoked" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.perTxMax", value: "5000000" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.dailyCap", value: "50000000" },
  { name: "rogue.agents.trinityguard.eth", key: "com.trinityguard.asset", value: "USDC" },
] as const;

export function dnsEncode(name: string): Hex {
  let encoded = "0x";
  for (const label of name.split(".")) {
    const labelBytes = new TextEncoder().encode(label);
    if (labelBytes.length === 0 || labelBytes.length > 63) {
      throw new Error(`Invalid DNS label in "${name}"`);
    }
    encoded += labelBytes.length.toString(16).padStart(2, "0");
    for (const byte of labelBytes) {
      encoded += byte.toString(16).padStart(2, "0");
    }
  }
  return `${encoded}00` as Hex;
}

export function textCalldata(name: string, key: string): Hex {
  return encodeFunctionData({
    abi: textAbi,
    functionName: "text",
    args: [namehash(name), key],
  });
}

export function resolveCalldata(name: string, key: string): Hex {
  return encodeFunctionData({
    abi: resolveAbi,
    functionName: "resolve",
    args: [dnsEncode(name), textCalldata(name, key)],
  });
}

export function setTextCalldata(name: string, key: string, value: string): Hex {
  return encodeFunctionData({
    abi: setTextAbi,
    functionName: "setText",
    args: [dnsEncode(name), key, value],
  });
}

export function decodeTextResult(data: Hex): string {
  return decodeFunctionResult({
    abi: textAbi,
    functionName: "text",
    data,
  });
}

export interface OnchainPolicy {
  roleActive: boolean;
  perTxMax: bigint;
  dailyCap: bigint;
  allowedAsset: string;
}

export type PolicyRecords = Record<PolicyTextKey, string>;

export function policyFromRecords(records: PolicyRecords): OnchainPolicy | null {
  const authority = records["com.trinityguard.authority"].trim();
  if (authority !== "active" && authority !== "revoked") return null;
  const perTxMax = records["com.trinityguard.perTxMax"].trim();
  const dailyCap = records["com.trinityguard.dailyCap"].trim();
  const asset = records["com.trinityguard.asset"].trim();
  if (!/^\d+$/.test(perTxMax) || !/^\d+$/.test(dailyCap) || asset === "") {
    throw new Error("policy text is not a complete mandate");
  }
  return {
    roleActive: authority === "active",
    perTxMax: BigInt(perTxMax),
    dailyCap: BigInt(dailyCap),
    allowedAsset: asset,
  };
}

type ResolveReader = {
  readContract(args: {
    address: typeof RESOLVER;
    abi: typeof resolveAbi;
    functionName: "resolve";
    args: readonly [Hex, Hex];
  }): Promise<Hex>;
};

export async function readPolicyText(client: ResolveReader, name: string): Promise<OnchainPolicy | null> {
  const records = {} as PolicyRecords;
  for (const key of POLICY_TEXT_KEYS) {
    const data = await client.readContract({
      address: RESOLVER,
      abi: resolveAbi,
      functionName: "resolve",
      args: [dnsEncode(name), textCalldata(name, key)],
    });
    records[key] = decodeTextResult(data);
  }
  return policyFromRecords(records);
}

export { resolveAbi, textAbi };
