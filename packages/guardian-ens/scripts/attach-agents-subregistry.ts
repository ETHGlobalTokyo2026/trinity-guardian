import {
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const parentRegistryArg = process.argv[2];
const label = process.argv[3];
const childRegistryArg = process.argv[4];

if (!parentRegistryArg || !label || !childRegistryArg) {
  throw new Error(
    "Usage: pnpm ens:attach-agents <parent-registry> <label> <child-registry>",
  );
}

const PARENT_REGISTRY = getAddress(parentRegistryArg);
const CHILD_REGISTRY = getAddress(childRegistryArg);

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

const account = privateKeyToAccount(
  (privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`) as `0x${string}`,
);

const publicClient = createEnsClient(rpcUrl);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

const abi = parseAbi([
  "function setSubregistry(uint256 anyId,address registry)",
  "function getSubregistry(string label) view returns (address)",
]);

// ENSv2 LibLabel.id(label)
const labelId = BigInt(keccak256(stringToHex(label)));

console.log("Attaching child UserRegistry...");
console.log("Parent Registry:", PARENT_REGISTRY);
console.log("Label:", label);
console.log(
  "Label ID:",
  `0x${labelId.toString(16).padStart(64, "0")}`,
);
console.log("Subregistry:", CHILD_REGISTRY);
console.log("Account:", account.address);

const { request } = await publicClient.simulateContract({
  account,
  address: PARENT_REGISTRY,
  abi,
  functionName: "setSubregistry",
  args: [labelId, CHILD_REGISTRY],
});

console.log("Simulation OK");

if (process.env.DRY_RUN === "true") {
  console.log("DRY_RUN=true — transaction not submitted");
  process.exit(0);
}

const hash = await walletClient.writeContract(request);

console.log("Transaction:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  throw new Error("Failed to attach child UserRegistry");
}

const attached = await publicClient.readContract({
  address: PARENT_REGISTRY,
  abi,
  functionName: "getSubregistry",
  args: [label],
});

console.log("Attached registry:", attached);

if (attached.toLowerCase() !== CHILD_REGISTRY.toLowerCase()) {
  throw new Error(
    `Subregistry verification failed: expected ${CHILD_REGISTRY}, got ${attached}`,
  );
}

console.log(`${label} UserRegistry attached successfully`);
