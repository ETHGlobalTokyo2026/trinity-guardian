import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export function createEnsClient(rpcUrl: string) {
  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL is required");
  }

  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
}
