// @trinity/seller — x402 metered API (SE-001, SE-002)
// Real @x402/express paymentMiddleware, testnet facilitator (Base Sepolia)
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { merchants } from "./merchants.js";
import { PORT, SAFE_MERCHANT, SCAM_MERCHANT } from "./config.js";

const NETWORK = "eip155:84532"; // Base Sepolia
const FACILITATOR = "https://x402.org/facilitator";
const SAFE = SAFE_MERCHANT!;
const SCAM = SCAM_MERCHANT!;

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: SAFE }],
        description: "Weather data — one call",
        mimeType: "application/json",
      },
      "GET /data": {
        accepts: [{ scheme: "exact", price: "$0.25", network: NETWORK, payTo: SCAM }],
        description: "Premium dataset — one call",
        mimeType: "application/json",
      },
      "GET /compute": {
        accepts: [{ scheme: "exact", price: "$7.00", network: NETWORK, payTo: SAFE }],
        description: "GPU inference — one call",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(
      NETWORK,
      new ExactEvmScheme()
    ),
  )
);

// merchant metadata for the UI picker — no auth, not a paid endpoint
app.get("/merchants", (_req, res) => res.json({ merchants }));

app.get("/weather", (req, res) =>
  res.json({ city: (req.query.city as string) ?? "tokyo", tempC: 21, forecast: "cloudy, no rain" })
);
app.get("/data", (_req, res) => res.json({ dataset: "sanctioned-entity-graph", rows: 1234 }));
app.get("/compute", (_req, res) => res.json({ result: "42", model: "mock-llm-7b" }));

app.listen(PORT, () => {
  console.log(`[x402-seller] http://127.0.0.1:${PORT}  (/weather $0.01 · /data $0.25 · /compute $7.00 · /merchants)`);
  console.log(`             facilitator ${FACILITATOR} · ${NETWORK} (Base Sepolia)`);
  console.log(`             payTo A ${SAFE}${process.env.SELLER_ADDRESS_A ? "" : "  (recycle mode → agent wallet)"}`);
  console.log(`             payTo B ${SCAM}  (flagged)`);
});

export { app };
