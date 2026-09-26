import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is not configured");
}

const client = createEnsClient(rpcUrl);

const EXPECTED_ADDRESS =
  "0x9A8F6F3fc819BEE96f0a76bAA4afa424c10c4B11";

const AGENT_NAMES = [
  "shopping.agents.trinityguard.eth",
  "research.agents.trinityguard.eth",
  "travel.agents.trinityguard.eth",
  "momo.agents.trinityguard.eth",
  "rogue.agents.trinityguard.eth",
] as const;

console.log("Trinity Guardian — ENSv2 Resolution Check");
console.log("─────────────────────────────────────────");
console.log("Network: Ethereum Sepolia");
console.log("Expected address:", EXPECTED_ADDRESS);
console.log();

for (const name of AGENT_NAMES) {
  console.log(`Resolving: ${name}`);

  const address = await client.getEnsAddress({
    name,
  });

  console.log("  Resolved:", address);

  if (!address) {
    throw new Error(`Failed to resolve ${name}`);
  }

  if (address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
    throw new Error(
      `Unexpected address for ${name}: expected ${EXPECTED_ADDRESS}, got ${address}`,
    );
  }

  console.log("  Resolution OK ✓");
  console.log();
}

console.log("All Trinity Guardian ENSv2 agent names resolved successfully.");