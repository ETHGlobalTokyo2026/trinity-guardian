import {
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const ETH_REGISTRY =
  "0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E";

const label = process.argv[2];
const userRegistryArg = process.argv[3];

if (!label) {
  throw new Error(
    "Usage: pnpm ens:attach-subregistry <label> <user-registry-address>",
  );
}

if (!userRegistryArg) {
  throw new Error(
    "Usage: pnpm ens:attach-subregistry <label> <user-registry-address>",
  );
}

const USER_REGISTRY = getAddress(userRegistryArg);

//
// ENSv2 LibLabel.id(label) = uint256(keccak256(bytes(label)))
//
const LABEL_ID = BigInt(keccak256(stringToHex(label)));

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

console.log(`Attaching subregistry for: ${label}.eth`);
console.log("ETHRegistry:", ETH_REGISTRY);
console.log("UserRegistry:", USER_REGISTRY);
console.log("Label ID:", `0x${LABEL_ID.toString(16).padStart(64, "0")}`);
console.log("Account:", account.address);

const { request } = await publicClient.simulateContract({
  account,
  address: ETH_REGISTRY,
  abi,
  functionName: "setSubregistry",
  args: [LABEL_ID, USER_REGISTRY],
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
  throw new Error("setSubregistry transaction failed");
}

const attachedRegistry = await publicClient.readContract({
  address: ETH_REGISTRY,
  abi,
  functionName: "getSubregistry",
  args: [label],
});

console.log("Attached registry:", attachedRegistry);

if (attachedRegistry.toLowerCase() !== USER_REGISTRY.toLowerCase()) {
  throw new Error(
    `Verification failed: expected ${USER_REGISTRY}, got ${attachedRegistry}`,
  );
}

console.log(`Subregistry attached successfully for ${label}.eth`);
