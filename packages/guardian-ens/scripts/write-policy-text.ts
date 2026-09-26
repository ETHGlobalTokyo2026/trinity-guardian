import { createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";
import {
  POLICY_NAMES,
  POLICY_TEXT_KEYS,
  POLICY_WRITES,
  RESOLVER,
  SET_TEXT_FROM,
  decodeTextResult,
  dnsEncode,
  policyFromRecords,
  resolveAbi,
  setTextAbi,
  textCalldata,
  type PolicyRecords,
} from "../src/policy-text.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[rpc]").split("\n")[0]?.slice(0, 240) ?? "reverted";
}

const account = privateKeyToAccount(
  (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`,
);

if (getAddress(account.address) !== getAddress(SET_TEXT_FROM)) {
  throw new Error(`signer ${account.address} cannot setText on this resolver`);
}

const publicClient = createEnsClient(rpcUrl);
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

console.log("setText policy records");
console.log("Resolver:", RESOLVER);
console.log("From:", account.address);
console.log();

const requests = [];
for (const write of POLICY_WRITES) {
  const label = `${write.name} ${write.key}`;
  try {
    const simulation = await publicClient.simulateContract({
      account,
      address: RESOLVER,
      abi: setTextAbi,
      functionName: "setText",
      args: [dnsEncode(write.name), write.key, write.value],
    });
    requests.push({ label, request: simulation.request });
    console.log(`PASS ${label}`);
  } catch (error) {
    console.log(`REVERT ${label} ${safeError(error)}`);
    throw new Error(`setText simulation reverted for ${label}`);
  }
}

if (process.env.DRY_RUN === "true") {
  console.log("DRY_RUN=true — transaction not submitted");
  process.exit(0);
}

for (const { label, request } of requests) {
  const hash = await walletClient.writeContract(request);
  console.log(`TX ${label} ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`setText failed for ${label}`);
  }
}

console.log();
console.log("Read-back");

for (const name of POLICY_NAMES) {
  const records = {} as PolicyRecords;
  console.log(name);
  for (const key of POLICY_TEXT_KEYS) {
    const data = await publicClient.readContract({
      address: RESOLVER,
      abi: resolveAbi,
      functionName: "resolve",
      args: [dnsEncode(name), textCalldata(name, key)],
    });
    const value = decodeTextResult(data);
    records[key] = value;
    const expected = POLICY_WRITES.find((write) => write.name === name && write.key === key)?.value;
    console.log(`  ${key}=${value === "" ? "(empty)" : value}`);
    if (value !== expected) {
      throw new Error(`${name} ${key} read back ${value === "" ? "(empty)" : value}`);
    }
  }
  const policy = policyFromRecords(records);
  const roleActive = name.startsWith("momo.");
  if (!policy || policy.roleActive !== roleActive) {
    throw new Error(`${name} authority did not decode`);
  }
}

console.log("All eight records match.");
