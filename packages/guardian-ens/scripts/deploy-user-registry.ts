import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  parseEventLogs,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const FACTORY = "0x9e726eb570beb6bceb495ab8cda7df517d4e841c";
const USER_REGISTRY_IMPL = "0xa80338aaa8d23831cea25e858d1774534abb0263";

const factoryAbi = parseAbi([
  "function deployProxy(address implementation,uint256 salt,bytes data)",
  "function verifyContract(address proxy) view returns (address)",
  "event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)",
]);

const userRegistryAbi = parseAbi([
  "function initialize((address account,uint256 roles)[] grants)",
]);

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

const account = privateKeyToAccount(privateKey as `0x${string}`);

const publicClient = createEnsClient(rpcUrl);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

// Minimum roles for Trinity Guardian UserRegistry.
const REGISTRAR = 1n << 0n;
const REGISTRAR_ADMIN = REGISTRAR << 128n;

const SET_SUBREGISTRY = 1n << 20n;
const SET_SUBREGISTRY_ADMIN = SET_SUBREGISTRY << 128n;

const SET_RESOLVER = 1n << 24n;
const SET_RESOLVER_ADMIN = SET_RESOLVER << 128n;

const roles =
  REGISTRAR |
  REGISTRAR_ADMIN |
  SET_SUBREGISTRY |
  SET_SUBREGISTRY_ADMIN |
  SET_RESOLVER |
  SET_RESOLVER_ADMIN;

// Same deterministic salt scheme used by ENSv2 setup.ts.
const registryName = process.argv[2];

if (!registryName) {
  throw new Error(
    "Registry namespace is required. Example: pnpm ens:deploy-registry agents.trinityguardian.eth",
  );
}

const version = 0n;

const salt = BigInt(
  keccak256(
    encodeAbiParameters(
      [
        { name: "id", type: "bytes32" },
        { name: "node", type: "bytes32" },
        { name: "version", type: "uint256" },
      ],
      [
        keccak256(stringToHex("UserRegistry")),
        namehash(registryName),
        version,
      ],
    ),
  ),
);

const initData = encodeFunctionData({
  abi: userRegistryAbi,
  functionName: "initialize",
  args: [
    [
      {
        account: account.address,
        roles,
      },
    ],
  ],
});

console.log("Network: Ethereum Sepolia");
console.log("Registry namespace:", registryName);
console.log("Admin:", account.address);
console.log("Factory:", FACTORY);
console.log("Implementation:", USER_REGISTRY_IMPL);
console.log("Role bitmap:", `0x${roles.toString(16)}`);
console.log("Salt:", `0x${salt.toString(16)}`);

console.log("Simulating deployment...");

await publicClient.simulateContract({
  account,
  address: FACTORY,
  abi: factoryAbi,
  functionName: "deployProxy",
  args: [USER_REGISTRY_IMPL, salt, initData],
});

console.log("Simulation OK");

if (process.env.DRY_RUN === "true") {
  console.log("DRY_RUN=true — stopping before transaction.");
  process.exit(0);
}

const hash = await walletClient.writeContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: "deployProxy",
  args: [USER_REGISTRY_IMPL, salt, initData],
});

console.log("Deploy tx:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  throw new Error("UserRegistry deployment failed");
}

const logs = parseEventLogs({
  abi: factoryAbi,
  eventName: "ProxyDeployed",
  logs: receipt.logs,
});

if (logs.length === 0) {
  throw new Error("ProxyDeployed event not found");
}

const proxy = logs[0].args.proxyAddress;

console.log("UserRegistry proxy:", proxy);

const verifiedImplementation = await publicClient.readContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: "verifyContract",
  args: [proxy],
});

console.log("Verified implementation:", verifiedImplementation);

if (
  verifiedImplementation.toLowerCase() !==
  USER_REGISTRY_IMPL.toLowerCase()
) {
  throw new Error(
    `Unexpected implementation: ${verifiedImplementation}`,
  );
}

console.log("Factory verification OK");

console.log("UserRegistry deployment OK");
