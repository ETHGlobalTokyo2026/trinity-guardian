import {
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const ETH_REGISTRY =
  "0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E";

const parentLabel = process.argv[2];
const userRegistryArg = process.argv[3];

if (!parentLabel || !userRegistryArg) {
  throw new Error(
    "Usage: pnpm ens:register-agents <parent-label> <user-registry-address>",
  );
}

const USER_REGISTRY = getAddress(userRegistryArg);

const AGENTS_ROLES =
  0x110000100000000000000000000000001100001n;

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

const ethRegistryAbi = parseAbi([
  "function getExpiry(uint256 anyId) view returns (uint64)",
]);

const registryAbi = parseAbi([
  "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
]);

// LibLabel.id(parentLabel)
const parentLabelId = BigInt(
  keccak256(stringToHex(parentLabel)),
);

// Child must not outlive its parent.
// For this hierarchy we use the parent's expiry.
const parentExpiry = await publicClient.readContract({
  address: ETH_REGISTRY,
  abi: ethRegistryAbi,
  functionName: "getExpiry",
  args: [parentLabelId],
});

if (parentExpiry === 0n) {
  throw new Error(`${parentLabel}.eth has no expiry / is not registered`);
}

const args = [
  "agents",
  account.address,
  zeroAddress,
  zeroAddress,
  AGENTS_ROLES,
  parentExpiry,
] as const;

console.log(`Registering: agents.${parentLabel}.eth`);
console.log("Parent registry:", USER_REGISTRY);
console.log("Owner:", account.address);
console.log("Role bitmap:", `0x${AGENTS_ROLES.toString(16)}`);
console.log("Parent expiry:", parentExpiry.toString());

const simulation = await publicClient.simulateContract({
  account,
  address: USER_REGISTRY,
  abi: registryAbi,
  functionName: "register",
  args,
});

console.log("Simulation OK");
console.log("Expected token ID:", simulation.result.toString());

if (process.env.DRY_RUN === "true") {
  console.log("DRY_RUN=true — transaction not submitted");
  process.exit(0);
}

const hash = await walletClient.writeContract({
  account,
  chain: sepolia,
  address: USER_REGISTRY,
  abi: registryAbi,
  functionName: "register",
  args,
});

console.log("Transaction:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  throw new Error("agents registration failed");
}

console.log(`agents.${parentLabel}.eth registered successfully`);
