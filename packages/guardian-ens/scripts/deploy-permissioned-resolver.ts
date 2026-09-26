import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { createEnsClient } from "../src/client.ts";

/**
 * ENSv2 Sepolia Beta
 */
const FACTORY =
  "0x9e726eb570beb6bceb495ab8cda7df517d4e841c" as Address;

const PERMISSIONED_RESOLVER_IMPL =
  "0x14f09fd05d4585759e54844dc9b00147131cf243" as Address;

/**
 * PermissionedResolver role bitmap.
 *
 * This is the bitmap recovered from a successful PermissionedResolver
 * deployment on the same ENSv2 Sepolia deployment generation.
 */
const RESOLVER_ROLES =
  0x1000000000000000000000000100011110000000000000000000000001000111n;

/**
 * Increment this intentionally if we ever want a new resolver proxy.
 *
 * Version 0 is the currently deployed Trinity Guardian resolver.
 */
const RESOLVER_VERSION = 0;

const factoryAbi = parseAbi([
  "function deployProxy(address implementation,uint256 salt,bytes data) returns (address)",
  "function verifyContract(address proxy) view returns (address)",
]);

const resolverAbi = parseAbi([
  "function initialize((address account,uint256 roles)[] grants,bytes[] setters)",
]);

/**
 * Environment
 */
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

if (!privateKey) {
  throw new Error("PRIVATE_KEY is required");
}

const normalizedPrivateKey = (
  privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
) as Hex;

const account = privateKeyToAccount(normalizedPrivateKey);

const publicClient = createEnsClient(rpcUrl);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

/**
 * Build PermissionedResolver initializer.
 *
 * Exact deployed ABI:
 *
 * initialize(
 *   (address account, uint256 roles)[] grants,
 *   bytes[] setters
 * )
 *
 * selector = 0x33cc44a0
 */
const initData = encodeFunctionData({
  abi: resolverAbi,
  functionName: "initialize",
  args: [
    [
      {
        account: account.address,
        roles: RESOLVER_ROLES,
      },
    ],
    [],
  ],
});

if (initData.slice(0, 10).toLowerCase() !== "0x33cc44a0") {
  throw new Error(
    `Unexpected PermissionedResolver initializer selector: ${initData.slice(
      0,
      10,
    )}`,
  );
}

/**
 * Trinity Guardian deterministic salt.
 *
 * IMPORTANT:
 * Do not change this formula for the already deployed resolver.
 * Changing it creates a different proxy.
 */
const saltHex = keccak256(
  stringToHex(
    `TrinityGuardianPermissionedResolver:${account.address.toLowerCase()}:${RESOLVER_VERSION}`,
  ),
);

const salt = BigInt(saltHex);

console.log("Permissioned Resolver Deployment");
console.log("────────────────────────────────");
console.log("Network:", sepolia.name);
console.log("Chain ID:", sepolia.id);
console.log("Account:", account.address);
console.log("Factory:", FACTORY);
console.log("Implementation:", PERMISSIONED_RESOLVER_IMPL);
console.log("Role bitmap:", `0x${RESOLVER_ROLES.toString(16)}`);
console.log("Salt:", saltHex);
console.log("Initializer selector:", initData.slice(0, 10));

/**
 * Simulate deployProxy().
 *
 * This also gives us the deterministic proxy address returned by the factory.
 *
 * NOTE:
 * If the proxy already exists, some factory implementations may reject
 * another deploy simulation. For Trinity Guardian version 0 we already know
 * the deployed address, so we first try to discover it using the known
 * deployment when applicable.
 */
const KNOWN_V0_RESOLVER =
  "0xf23345070E24cb42E0A87323F75b84a34d9D33f6" as Address;

let resolverAddress: Address | undefined;

/**
 * Version 0 has already been deployed.
 *
 * Check it before attempting another deployment.
 */
if (RESOLVER_VERSION === 0) {
  const existingCode = await publicClient.getCode({
    address: KNOWN_V0_RESOLVER,
  });

  if (existingCode && existingCode !== "0x") {
    resolverAddress = KNOWN_V0_RESOLVER;

    console.log();
    console.log("Existing resolver detected:", resolverAddress);

    /**
     * IMPORTANT:
     * verifyContract() belongs to VerifiableFactory.
     *
     * Do NOT call verifyContract() on resolverAddress.
     */
    const verifiedImplementation = await publicClient.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [resolverAddress],
    });

    console.log("Verified implementation:", verifiedImplementation);

    if (
      verifiedImplementation.toLowerCase() !==
      PERMISSIONED_RESOLVER_IMPL.toLowerCase()
    ) {
      throw new Error(
        [
          "Existing resolver has unexpected implementation.",
          `Expected: ${PERMISSIONED_RESOLVER_IMPL}`,
          `Actual:   ${verifiedImplementation}`,
        ].join("\n"),
      );
    }

    console.log("Permissioned Resolver already deployed and verified.");
    process.exit(0);
  }
}

/**
 * Resolver does not exist yet.
 *
 * Simulate before broadcasting.
 */
const simulation = await publicClient.simulateContract({
  account,
  address: FACTORY,
  abi: factoryAbi,
  functionName: "deployProxy",
  args: [PERMISSIONED_RESOLVER_IMPL, salt, initData],
});

resolverAddress = simulation.result;

console.log();
console.log("Simulation OK");
console.log("Predicted proxy:", resolverAddress);

/**
 * Extra safety check:
 * The predicted address may already contain code even when we're using
 * a different resolver version.
 */
const predictedCode = await publicClient.getCode({
  address: resolverAddress,
});

if (predictedCode && predictedCode !== "0x") {
  console.log("Predicted proxy already contains code.");

  const verifiedImplementation = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [resolverAddress],
  });

  console.log("Verified implementation:", verifiedImplementation);

  if (
    verifiedImplementation.toLowerCase() !==
    PERMISSIONED_RESOLVER_IMPL.toLowerCase()
  ) {
    throw new Error(
      [
        "Existing proxy has unexpected implementation.",
        `Expected: ${PERMISSIONED_RESOLVER_IMPL}`,
        `Actual:   ${verifiedImplementation}`,
      ].join("\n"),
    );
  }

  console.log("Permissioned Resolver already deployed and verified.");
  process.exit(0);
}

/**
 * Dry run
 */
if (process.env.DRY_RUN === "true") {
  console.log("DRY_RUN=true — transaction not sent");
  process.exit(0);
}

/**
 * Broadcast deployment.
 */
const txHash = await walletClient.writeContract(simulation.request);

console.log();
console.log("Transaction:", txHash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash,
});

if (receipt.status !== "success") {
  throw new Error(`Resolver deployment failed: ${txHash}`);
}

console.log("Deployment confirmed");

/**
 * Make sure code exists at the proxy address.
 */
const deployedCode = await publicClient.getCode({
  address: resolverAddress,
});

if (!deployedCode || deployedCode === "0x") {
  throw new Error(`No bytecode found at resolver proxy ${resolverAddress}`);
}

/**
 * Verify proxy → implementation relationship.
 *
 * IMPORTANT:
 *
 * address: FACTORY       <-- correct
 * args: [resolverAddress]
 */
const verifiedImplementation = await publicClient.readContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: "verifyContract",
  args: [resolverAddress],
});

console.log("Proxy:", resolverAddress);
console.log("Verified implementation:", verifiedImplementation);

if (
  verifiedImplementation.toLowerCase() !==
  PERMISSIONED_RESOLVER_IMPL.toLowerCase()
) {
  throw new Error(
    [
      "Unexpected PermissionedResolver implementation.",
      `Expected: ${PERMISSIONED_RESOLVER_IMPL}`,
      `Actual:   ${verifiedImplementation}`,
    ].join("\n"),
  );
}

console.log();
console.log("Permissioned Resolver ready.");