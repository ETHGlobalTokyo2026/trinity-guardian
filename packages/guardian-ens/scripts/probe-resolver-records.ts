import { createEnsClient } from "../src/client.ts";
import { formatProbeReport, probeRecords } from "./probe-records.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

const outcomes = await probeRecords(createEnsClient(rpcUrl));
console.log(formatProbeReport(outcomes));
