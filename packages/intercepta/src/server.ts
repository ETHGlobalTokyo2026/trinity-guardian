import express from "express";
import { apiKey, interceptaRouter, scamAccount } from "./index.js";

const port = Number(process.env.PORT || process.env.INTERCEPTA_PORT || 4021);
const app = express();
app.use(interceptaRouter());
app.listen(port, "0.0.0.0", () => {
  console.log(`[intercepta-mock] http://0.0.0.0:${port}`);
  console.log(`             X-API-KEY ${apiKey()}`);
  console.log(`             scam account ${scamAccount() || "(set SELLER_ADDRESS_B)"}`);
});
