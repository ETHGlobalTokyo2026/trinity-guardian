import type { Network } from "@x402/core/types";
import { envOr } from "./env";

/**
 * Central runtime configuration for AgentPay Guardian.
 * Everything comes from env so the demo can be pointed at real keys
 * without touching code.
 */
export const NETWORK = envOr("X402_NETWORK", "eip155:84532") as Network; // Base Sepolia
if (!/^eip155:\d+$/.test(NETWORK)) throw new Error(`X402_NETWORK must be a CAIP-2 id like eip155:84532, got "${NETWORK}"`);
export const CHAIN_ID = Number(NETWORK.split(":")[1]);

/** Circle USDC on Base Sepolia (EIP-3009 capable, the x402 default asset). */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export const FACILITATOR_URL = envOr("X402_FACILITATOR_URL", "https://x402.org/facilitator");

/** Address the legitimate services are paid to (the "merchant"). */
export const SELLER_ADDRESS = envOr("SELLER_ADDRESS", "0x209693Bc6afc0C5328bA36FaF03C514EF312287C") as `0x${string}`;

/**
 * A real mainnet address carrying a scam / phishing flag in Intercepta's dataset.
 * Intercepta screens by address string, so a mainnet-flagged address is still
 * flagged when it shows up as the payTo of a Base Sepolia quote.
 */
export const SCAM_PAYTO_ADDRESS = envOr("SCAM_PAYTO_ADDRESS", "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** A token that is *not* USDC but tries to look like it (used by the lookalike scenario). */
export const LOOKALIKE_USDC_ADDRESS = envOr("LOOKALIKE_USDC_ADDRESS", "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const AGENT_PRIVATE_KEY = (process.env.AGENT_PRIVATE_KEY?.trim() || undefined) as `0x${string}` | undefined;

export const INTERCEPTA_API_KEY = process.env.INTERCEPTA_API_KEY;
export const INTERCEPTA_BASE_URL = envOr("INTERCEPTA_BASE_URL", "https://api.intercepta.io");

/** IDKit sandbox. The signing key is read only inside lib/guardian/worldid.ts. */
export const WORLD_ENVIRONMENT = "sandbox" as const;

/** How long the agent waits for the human owner before giving up. */
export const APPROVAL_TIMEOUT_MS = Number(envOr("APPROVAL_TIMEOUT_MS", String(5 * 60_000)));

export function appBaseUrl(): string {
  return envOr("APP_BASE_URL", `http://localhost:${envOr("PORT", "3000")}`);
}
