import { NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { resourceServer, priced } from "@/lib/seller/server";
import { SELLER_ADDRESS } from "@/lib/config";

/** Scenario 3 — an allowlisted seller, but the price is above the per-tx mandate. */
const handler = async () => {
  return NextResponse.json({
    dataset: "tokyo-transit-2026-q3.parquet",
    rows: 1_284_311,
    downloadUrl: "https://example.com/datasets/tokyo-transit-2026-q3.parquet?token=demo",
  });
};

export const GET = withX402(handler, priced("$8", SELLER_ADDRESS, "Bulk dataset download"), resourceServer);
