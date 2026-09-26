import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { RouteConfig } from "@x402/core/server";
import { FACILITATOR_URL, NETWORK } from "../config";

/**
 * The x402 *seller* side. These are the metered services the agent buys from.
 * They live in the same Next.js app purely for demo convenience; the agent
 * talks to them over plain HTTP exactly as it would to a third party.
 */
const g = globalThis as unknown as { __x402Server?: x402ResourceServer };
if (!g.__x402Server) {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  g.__x402Server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
}
export const resourceServer = g.__x402Server;

export function priced(price: string, payTo: `0x${string}`, description: string): RouteConfig {
  return {
    accepts: { scheme: "exact", price, network: NETWORK, payTo, maxTimeoutSeconds: 300 },
    description,
    mimeType: "application/json",
  };
}
