import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { AGENT_PRIVATE_KEY } from "../config";

/**
 * The agent's burner EOA. Set AGENT_PRIVATE_KEY in .env.local and fund it with
 * Base Sepolia USDC (https://faucet.circle.com). If unset, a throwaway key is
 * generated per process so the app still boots (payments will fail to settle).
 */
const g = globalThis as unknown as { __agentKey?: `0x${string}` };
if (!g.__agentKey) g.__agentKey = AGENT_PRIVATE_KEY ?? generatePrivateKey();

export const agentAccount = privateKeyToAccount(g.__agentKey);
export const agentKeyIsEphemeral = !AGENT_PRIVATE_KEY;
