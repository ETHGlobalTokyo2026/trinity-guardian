import {
  getAddress,
  keccak256,
  parseAbi,
  stringToHex,
} from "viem";
import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

const account = getAddress(
  process.argv[2] ??
    "0x9A8F6F3fc819BEE96f0a76bAA4afa424c10c4B11",
);

const ETH_REGISTRY =
  "0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E";

const TRINITY_REGISTRY =
  "0xa92262dFC37E9D855b5ffeCe34284ceb998C3EA7";

const AGENTS_REGISTRY =
  "0x5B115dAFCeEcBe5d77506b1Ec8B0A017B7357174";

const abi = parseAbi([
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function findOwner(string label) view returns (address)",
  "function roles(uint256 anyId,address account) view returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
]);

const client = createEnsClient(rpcUrl);

const ROLES = [
  ["REGISTRAR", 1n << 0n],
  ["REGISTRAR_ADMIN", (1n << 0n) << 128n],

  ["REGISTER_RESERVED", 1n << 4n],
  ["REGISTER_RESERVED_ADMIN", (1n << 4n) << 128n],

  ["SET_PARENT", 1n << 8n],
  ["SET_PARENT_ADMIN", (1n << 8n) << 128n],

  ["UNREGISTER", 1n << 12n],
  ["UNREGISTER_ADMIN", (1n << 12n) << 128n],

  ["RENEW", 1n << 16n],
  ["RENEW_ADMIN", (1n << 16n) << 128n],

  ["SET_SUBREGISTRY", 1n << 20n],
  ["SET_SUBREGISTRY_ADMIN", (1n << 20n) << 128n],

  ["SET_RESOLVER", 1n << 24n],
  ["SET_RESOLVER_ADMIN", (1n << 24n) << 128n],

  ["CAN_TRANSFER_ADMIN", (1n << 28n) << 128n],

  ["SET_URI", 1n << 36n],
  ["SET_URI_ADMIN", (1n << 36n) << 128n],

  ["CAN_NAME", 1n << 120n],
  ["CAN_NAME_ADMIN", (1n << 120n) << 128n],

  ["UPGRADE", 1n << 124n],
  ["UPGRADE_ADMIN", (1n << 124n) << 128n],
] as const;

function labelId(label: string) {
  return BigInt(keccak256(stringToHex(label)));
}

function shortAddress(address: string) {
  if (address === "0x0000000000000000000000000000000000000000") {
    return "none";
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function printRoles(bitmap: bigint) {
  let found = false;

  for (const [name, role] of ROLES) {
    if ((bitmap & role) === role) {
      console.log(`      ✓ ${name}`);
      found = true;
    }
  }

  if (!found) {
    console.log("      none");
  }
}

async function inspectName(
  registry: `0x${string}`,
  label: string,
  fullName: string,
) {
  const id = labelId(label);

  const [owner, expiry, tokenId, resolver, subregistry, roleBitmap] =
    await Promise.all([
      client.readContract({
        address: registry,
        abi,
        functionName: "findOwner",
        args: [label],
      }),

      client.readContract({
        address: registry,
        abi,
        functionName: "getExpiry",
        args: [id],
      }),

      client.readContract({
        address: registry,
        abi,
        functionName: "getTokenId",
        args: [id],
      }),

      client.readContract({
        address: registry,
        abi,
        functionName: "getResolver",
        args: [label],
      }),

      client.readContract({
        address: registry,
        abi,
        functionName: "getSubregistry",
        args: [label],
      }),

      client.readContract({
        address: registry,
        abi,
        functionName: "roles",
        args: [id, account],
      }),
    ]);

  console.log("");
  console.log(fullName);
  console.log("─".repeat(fullName.length));
  console.log("  Registry:   ", registry);
  console.log("  Owner:      ", owner);
  console.log("  Expiry:     ", expiry.toString());

  if (expiry > 0n) {
    console.log(
      "  Expiry UTC: ",
      new Date(Number(expiry) * 1000).toISOString(),
    );
  }

  console.log("  Token ID:   ", tokenId.toString());
  console.log("  Resolver:   ", shortAddress(resolver));
  console.log("  Subregistry:", shortAddress(subregistry));

  console.log(`  Roles for ${shortAddress(account)}:`);
  console.log(`      bitmap: 0x${roleBitmap.toString(16)}`);
  printRoles(roleBitmap);

  return {
    owner,
    expiry,
    tokenId,
    resolver,
    subregistry,
    roleBitmap,
  };
}

async function inspectRootRoles(
  registry: `0x${string}`,
  title: string,
) {
  console.log("");
  console.log(`${title} — ROOT_RESOURCE roles`);
  console.log("─".repeat(50));

  for (const [name, role] of ROLES) {
    const has = await client.readContract({
      address: registry,
      abi,
      functionName: "hasRootRoles",
      args: [role, account],
    });

    if (has) {
      console.log(`  ✓ ${name}`);
    }
  }
}

console.log("");
console.log("Trinity Guardian — ENSv2 Inspector");
console.log("Network: Ethereum Sepolia");
console.log("Inspect account:", account);

await inspectName(
  ETH_REGISTRY,
  "trinityguard",
  "trinityguard.eth",
);

await inspectRootRoles(
  TRINITY_REGISTRY,
  "trinityguard.eth UserRegistry",
);

await inspectName(
  TRINITY_REGISTRY,
  "agents",
  "agents.trinityguard.eth",
);

await inspectRootRoles(
  AGENTS_REGISTRY,
  "agents.trinityguard.eth UserRegistry",
);

console.log("");
console.log("Expected hierarchy");
console.log("────────────────────────────────────────────────────");
console.log("trinityguard.eth");
console.log(`  └─ ${TRINITY_REGISTRY}`);
console.log("      └─ agents.trinityguard.eth");
console.log(`          └─ ${AGENTS_REGISTRY}`);
console.log("");
