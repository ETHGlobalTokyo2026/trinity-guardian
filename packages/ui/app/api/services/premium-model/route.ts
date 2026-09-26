import { NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { resourceServer, priced } from "@/lib/seller/server";
import { SCAM_PAYTO_ADDRESS } from "@/lib/config";

/**
 * Scenario 2 — a "too good to be true" hosted model whose payTo is a real
 * mainnet address with a scam / phishing flag in Intercepta's dataset.
 * The Guardian must refuse before signing.
 */
const handler = async () => {
  return NextResponse.json({ model: "gpt-9000-turbo", output: "you should never see this" });
};

export const GET = withX402(handler, priced("$0.05", SCAM_PAYTO_ADDRESS, "Premium hosted model inference"), resourceServer);
