import {
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const AGENTS_REGISTRY =
  "0x5B115dAFCeEcBe5d77506b1Ec8B0A017B7357174";

const PARENT_REGISTRY =
  "0xa92262dFC37E9D855b5ffeCe34284ceb998C3EA7";

const agentLabel = process.argv[2];

if (!agentLabel) {
  throw new Error(
    "Usage: pnpm ens:register-agent <agent-label>",
  );
}

if (!/^[a-z0-9-]+$/.test(agentLabel)) {
  throw new Error(
    "Agent label must contain only lowercase letters, numbers, and hyphens",
  );
}

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
  "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
  "function findOwner(string label) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
]);

//
// agents.trinityguard.eth lives in PARENT_REGISTRY.
// Its expiry becomes the maximum expiry for child agent identities.
//
const agentsId = BigInt(
  keccak256(stringToHex("agents")),
);

const parentExpiry = await publicClient.readContract({
  address: PARENT_REGISTRY,
  abi,
  functionName: "getExpiry",
  args: [agentsId],
});

if (parentExpiry === 0n) {
  throw new Error(
    "agents.trinityguard.eth does not exist or has no expiry",
  );
}

//
// Leaf agent.
//
// Spend permission is the text record com.trinityguard.authority.
// REGISTRAR, SET_RESOLVER, and SET_SUBREGISTRY are name-admin bits, so they
// stay unset. Bitmap 0 is not a payment decision.
//
const AGENT_ROLES = 0n;

const args = [
  agentLabel,
  account.address,
  zeroAddress,
  zeroAddress,
  AGENT_ROLES,
  parentExpiry,
] as const;

const fullName =
  `${agentLabel}.agents.trinityguard.eth`;

console.log("");
console.log("Registering agent:", fullName);
console.log("Registry:", AGENTS_REGISTRY);
console.log("Owner:", account.address);
console.log("ENS role bitmap:", "0x0");
console.log("Expiry:", parentExpiry.toString());
console.log(
  "Expiry UTC:",
  new Date(Number(parentExpiry) * 1000).toISOString(),
);

const simulation =
  await publicClient.simulateContract({
    account,
    address: AGENTS_REGISTRY,
    abi,
    functionName: "register",
    args,
  });

console.log("Simulation OK");
console.log(
  "Expected token ID:",
  simulation.result.toString(),
);

if (process.env.DRY_RUN === "true") {
  console.log(
    "DRY_RUN=true — transaction not submitted",
  );
  process.exit(0);
}

const hash = await walletClient.writeContract(
  simulation.request,
);

console.log("Transaction:", hash);

const receipt =
  await publicClient.waitForTransactionReceipt({
    hash,
  });

if (receipt.status !== "success") {
  throw new Error(
    `${fullName} registration failed`,
  );
}

const owner = await publicClient.readContract({
  address: AGENTS_REGISTRY,
  abi,
  functionName: "findOwner",
  args: [agentLabel],
});

if (
  getAddress(owner) !== getAddress(account.address)
) {
  throw new Error(
    `Owner verification failed: ${owner}`,
  );
}

const resolver = await publicClient.readContract({
  address: AGENTS_REGISTRY,
  abi,
  functionName: "getResolver",
  args: [agentLabel],
});

const subregistry =
  await publicClient.readContract({
    address: AGENTS_REGISTRY,
    abi,
    functionName: "getSubregistry",
    args: [agentLabel],
  });

console.log("");
console.log("Registration verified");
console.log("Name:", fullName);
console.log("Owner:", owner);
console.log("Resolver:", resolver);
console.log("Subregistry:", subregistry);
