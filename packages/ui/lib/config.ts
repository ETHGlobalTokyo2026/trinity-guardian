import type { Network } from "@x402/core/types";

/**
 * Central runtime configuration for AgentPay Guardian.
 * Everything comes from env so the demo can be pointed at real keys
 * without touching code.
 */
export const NETWORK: Network = (process.env.X402_NETWORK as Network) ?? "eip155:84532"; // Base Sepolia
export const CHAIN_ID = Number(NETWORK.split(":")[1]);

/** Circle USDC on Base Sepolia (EIP-3009 capable, the x402 default asset). */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

/** Address the legitimate services are paid to (the "merchant"). */
export const SELLER_ADDRESS = (process.env.SELLER_ADDRESS ??
  "0x209693Bc6afc0C5328bA36FaF03C514EF312287C") as `0x${string}`;

/**
 * A real mainnet address carrying a scam / phishing flag in Intercepta's dataset.
 * Intercepta screens by address string, so a mainnet-flagged address is still
 * flagged when it shows up as the payTo of a Base Sepolia quote.
 */
export const SCAM_PAYTO_ADDRESS = (process.env.SCAM_PAYTO_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** A token that is *not* USDC but tries to look like it (used by the lookalike scenario). */
export const LOOKALIKE_USDC_ADDRESS = (process.env.LOOKALIKE_USDC_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const AGENT_PRIVATE_KEY = (process.env.AGENT_PRIVATE_KEY?.trim() || undefined) as `0x${string}` | undefined;

export const INTERCEPTA_API_KEY = process.env.INTERCEPTA_API_KEY;
export const INTERCEPTA_BASE_URL = process.env.INTERCEPTA_BASE_URL ?? "https://api.intercepta.io";

/**
 * World ID for Agents — the World ID OpenID Connect provider.
 * Sandbox for the hackathon: https://sandbox.auth.world.org (portal at /portal).
 * The device-authorization grant is what lets a headless agent ask its human
 * owner for a fresh World ID proof + explicit approval.
 */
export const WORLD_ISSUER = process.env.WORLD_ISSUER ?? "https://sandbox.auth.world.org";
export const WORLD_CLIENT_ID = process.env.WORLD_CLIENT_ID ?? "";
export const WORLD_CLIENT_SECRET = process.env.WORLD_CLIENT_SECRET ?? "";
/** Optional: pairwise `sub` of the owner. If set, approvals from any other human are rejected. */
export const WORLD_OWNER_SUB = process.env.WORLD_OWNER_SUB ?? "";
/** Dev-only escape hatch so the pipeline can be exercised before a sandbox client exists. */
export const WORLD_DEV_BYPASS = process.env.WORLD_DEV_BYPASS === "true";

/** How long the agent waits for the human owner before giving up. */
export const APPROVAL_TIMEOUT_MS = Number(process.env.APPROVAL_TIMEOUT_MS ?? 5 * 60_000);

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
}
