// /merchants endpoint — metadata for the UI seller picker (SE-003)
import type { MerchantInfo } from "./types.js";
import { SAFE_MERCHANT, SCAM_MERCHANT } from "./config.js";

const SAFE = SAFE_MERCHANT!;
const SCAM = SCAM_MERCHANT!;

export const merchants: MerchantInfo[] = [
  {
    id: "merchant-safe",
    name: "Weather API",
    description: "Real-time weather data provider",
    address: SAFE,
    isSpam: false,
    endpoints: [
      { path: "/weather", method: "GET", price: "$0.01", priceUnits: "10000", description: "Weather forecast" },
      { path: "/compute", method: "GET", price: "$7.00", priceUnits: "7000000", description: "GPU inference" },
    ],
  },
  {
    id: "merchant-spam",
    name: "Premium Data (FLAGGED)",
    description: "Dataset provider — reported as scam",
    address: SCAM,
    isSpam: true,
    spamReason: "Reported rugpull / scam entity",
    endpoints: [
      { path: "/data", method: "GET", price: "$0.25", priceUnits: "250000", description: "Premium dataset" },
    ],
  },
];
