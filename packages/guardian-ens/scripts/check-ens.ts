import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is not configured");
}

const client = createEnsClient(rpcUrl);

const name = "ur.integration-tests.eth";

console.log("Resolving ENSv2 test name:", name);

const address = await client.getEnsAddress({
  name,
});

console.log("Resolved address:", address);

if (!address) {
  throw new Error(`Failed to resolve ${name}`);
}

console.log("ENSv2 resolution OK");
