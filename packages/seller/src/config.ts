// Env config for @trinity/seller (SE-004)
import { privateKeyToAccount } from "viem/accounts";

const AGENT_KEY = process.env.EVM_PRIVATE_KEY;
const AGENT_ADDRESS: string | undefined = AGENT_KEY
  ? privateKeyToAccount(AGENT_KEY as `0x${string}`).address
  : undefined;

/** SELLER_ADDRESS_A empty → recycle mode (payTo = agent wallet). */
export const SAFE_MERCHANT: string | undefined = process.env.SELLER_ADDRESS_A || AGENT_ADDRESS;
export const SCAM_MERCHANT: string | undefined = process.env.SELLER_ADDRESS_B;
export const PORT = process.env.SELLER_PORT || process.env.PORT || 4020;

if (!SAFE_MERCHANT)
  throw new Error("Set SELLER_ADDRESS_A in .env, or leave it empty with EVM_PRIVATE_KEY set (recycle mode)");
if (!SCAM_MERCHANT) throw new Error("Set SELLER_ADDRESS_B in .env (flagged payTo for the block scenario)");
