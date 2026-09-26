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

const setTextAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
]);

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

export { resolveAbi, textAbi };
