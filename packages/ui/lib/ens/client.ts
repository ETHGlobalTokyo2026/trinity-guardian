import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { envOr } from "../env";

export const SEPOLIA_RPC_URL = envOr("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");

const g = globalThis as unknown as { __ensPublic?: ReturnType<typeof createPublicClient> };
if (!g.__ensPublic) {
  g.__ensPublic = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
}
/** Read-only Sepolia client. viem's sepolia chain already points at the ENSv2 Universal Resolver. */
export const ensPublic = g.__ensPublic;

/** The owner's key: registers names, grants and revokes the spend role, edits policy records. Never the agent's key. */
export function ownerAccount() {
  const key = process.env.ENS_OWNER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("ENS_OWNER_PRIVATE_KEY not set");
  return privateKeyToAccount(key as `0x${string}`);
}

export function ownerWallet() {
  return createWalletClient({ account: ownerAccount(), chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
}

export function ownerConfigured(): boolean {
  return Boolean(process.env.ENS_OWNER_PRIVATE_KEY?.trim());
}
