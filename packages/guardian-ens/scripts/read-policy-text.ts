import { namehash } from "viem";
import { createEnsClient } from "../src/client.ts";
import {
  POLICY_NAMES,
  POLICY_TEXT_KEYS,
  POLICY_WRITES,
  RESOLVER,
  decodeTextResult,
  dnsEncode,
  policyFromRecords,
  resolveAbi,
  textAbi,
  textCalldata,
  type PolicyRecords,
} from "../src/policy-text.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[rpc]").split("\n")[0]?.slice(0, 240) ?? "reverted";
}

const client = createEnsClient(rpcUrl);

console.log("PermissionedResolver policy text read");
console.log("Resolver:", RESOLVER);
console.log("Read only. No transaction will be sent.");
console.log();

let unexpected = 0;

for (const name of POLICY_NAMES) {
  const records = {} as PolicyRecords;
  console.log(name);
  for (const key of POLICY_TEXT_KEYS) {
    try {
      const data = await client.readContract({
        address: RESOLVER,
        abi: resolveAbi,
        functionName: "resolve",
        args: [dnsEncode(name), textCalldata(name, key)],
      });
      const value = decodeTextResult(data);
      records[key] = value;
      const expected = POLICY_WRITES.find((write) => write.name === name && write.key === key)?.value;
      console.log(`  ${key}=${value === "" ? "(empty)" : value}`);
      if (value !== expected) unexpected += 1;
    } catch (error) {
      unexpected += 1;
      console.log(`  ${key} REVERT ${safeError(error)}`);
    }
  }
  if (unexpected === 0) {
    const policy = policyFromRecords(records);
    const roleActive = name.startsWith("momo.");
    if (!policy || policy.roleActive !== roleActive) unexpected += 1;
  }

  try {
    await client.readContract({
      address: RESOLVER,
      abi: textAbi,
      functionName: "text",
      args: [namehash(name), "com.trinityguard.perTxMax"],
    });
    unexpected += 1;
    console.log("  HIT direct text(bytes32,string)");
  } catch (error) {
    console.log(`  REVERT direct text(bytes32,string) ${safeError(error)}`);
  }
  console.log();
}

if (unexpected > 0) {
  throw new Error(`${unexpected} policy read(s) did not match the stored mandate`);
}

console.log("Stored mandates match. Direct text() still reverts.");
