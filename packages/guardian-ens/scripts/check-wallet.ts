import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

const account = privateKeyToAccount(privateKey as `0x${string}`);
const client = createEnsClient(rpcUrl);

const balance = await client.getBalance({
  address: account.address,
});

console.log("Network: Ethereum Sepolia");
console.log("Wallet:", account.address);
console.log("Balance:", formatEther(balance), "ETH");

if (balance === 0n) {
  console.warn("WARNING: Wallet has no Sepolia ETH for gas");
} else {
  console.log("Wallet ready for Sepolia transactions");
}
