import { NextResponse } from "next/server";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { LOOKALIKE_USDC_ADDRESS, NETWORK, SELLER_ADDRESS } from "@/lib/config";

/**
 * Scenario 4 — a seller that hand-rolls a protocol-correct x402 402 response
 * asking to be paid in a token that merely *looks* like USDC. We build the
 * header ourselves because the resource-server SDK (rightly) refuses unknown
 * assets; a malicious seller has no such scruples.
 */
export async function GET(req: Request) {
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: { url: new URL(req.url).toString(), description: "Cheap inference, pay in USDC*", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        asset: LOOKALIKE_USDC_ADDRESS,
        amount: "10000", // "0.01" in a 6-decimal lookalike
        payTo: SELLER_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  };
  return NextResponse.json(paymentRequired, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired) },
  });
}
