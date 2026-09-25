import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is not configured");
}

const client = createEnsClient(rpcUrl);

const [chainId, blockNumber] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
]);

console.log("Network: Ethereum Sepolia");
console.log("Chain ID:", chainId);
console.log("Latest block:", blockNumber.toString());

if (chainId !== 11155111) {
  throw new Error(
    `Wrong network: expected Sepolia (11155111), received ${chainId}`,
  );
}

console.log("Sepolia RPC connection OK");
