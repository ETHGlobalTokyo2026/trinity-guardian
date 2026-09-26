// Quote decode from x402 v2 Payment-Required header (AG-002)

import type { PaymentRequirements, X402Quote } from "./types.js";

export function decodeQuote(header: string): X402Quote {
  return JSON.parse(Buffer.from(header, "base64").toString());
}

/** Prefer Base Sepolia, then any EVM, then first option. */
export function pickAccept(quote: X402Quote): PaymentRequirements {
  const opts = quote.accepts ?? [];
  return (
    opts.find((o) => o.network?.startsWith("eip155:84532")) ??
    opts.find((o) => o.network?.startsWith("eip155:")) ??
    opts[0]
  );
}
