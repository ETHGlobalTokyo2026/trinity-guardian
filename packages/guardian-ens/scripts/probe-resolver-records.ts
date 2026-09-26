import { namehash, parseAbi, type Hex } from "viem";
import { createEnsClient } from "../src/client.ts";

const RESOLVER = "0xf23345070E24cb42E0A87323F75b84a34d9D33f6" as const;
const NAME = "momo.agents.trinityguard.eth";
const TEXT_KEY = "com.trinityguard.perTxMax";
const COIN_TYPE_ETH = 60n;

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

function dnsEncode(name: string): Hex {
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

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[rpc]").split("\n")[0]?.slice(0, 240) ?? "reverted";
}

const dnsName = dnsEncode(NAME);
const node = namehash(NAME);
const client = createEnsClient(rpcUrl);

const candidates = [
  {
    label: "text(bytes,string)",
    abi: parseAbi(["function text(bytes name, string key) view returns (string)"]),
    functionName: "text",
    args: [dnsName, TEXT_KEY],
  },
  {
    label: "text(bytes32,string)",
    abi: parseAbi(["function text(bytes32 node, string key) view returns (string)"]),
    functionName: "text",
    args: [node, TEXT_KEY],
  },
  {
    label: "addr(bytes,uint256)",
    abi: parseAbi(["function addr(bytes name, uint256 coinType) view returns (bytes)"]),
    functionName: "addr",
    args: [dnsName, COIN_TYPE_ETH],
  },
  {
    label: "addr(bytes32)",
    abi: parseAbi(["function addr(bytes32 node) view returns (address)"]),
    functionName: "addr",
    args: [node],
  },
] as const;

console.log("PermissionedResolver record probe");
console.log("Resolver:", RESOLVER);
console.log("Name:", NAME);
console.log("Text key:", TEXT_KEY);
console.log("Read only. No transaction will be sent.");
console.log();

let hits = 0;

for (const candidate of candidates) {
  try {
    const result = await client.readContract({
      address: RESOLVER,
      abi: candidate.abi,
      functionName: candidate.functionName,
      args: candidate.args as never,
    });
    hits += 1;
    console.log(`HIT  ${candidate.label}`);
    console.log(`     result: ${String(result)}`);
  } catch (error) {
    console.log(`REVERT  ${candidate.label}`);
    console.log(`        ${safeError(error)}`);
  }
}

console.log();
console.log(hits === 0 ? "No candidate getter succeeded." : `Succeeded: ${hits}`);
