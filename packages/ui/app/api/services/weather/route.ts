import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { resourceServer, priced } from "@/lib/seller/server";
import { SELLER_ADDRESS } from "@/lib/config";

/** Scenario 1 — a legitimate, allowlisted metered API. $0.01 per call. */
const handler = async (req: NextRequest) => {
  const city = req.nextUrl.searchParams.get("city") ?? "Tokyo";
  return NextResponse.json({
    city,
    tempC: 24 + Math.round(Math.random() * 4),
    condition: ["clear", "cloudy", "light rain"][Math.floor(Math.random() * 3)],
    observedAt: new Date().toISOString(),
    provider: "AgentPay Weather (x402 demo seller)",
  });
};

export const GET = withX402(handler, priced("$0.01", SELLER_ADDRESS, "Current weather for a city"), resourceServer);
