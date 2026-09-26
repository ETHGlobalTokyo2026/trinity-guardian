import { ENS_ROGUE_LABEL, ENS_ROGUE_NAME } from "../ens/names";

/**
 * The three (plus one) demo paths from the pitch. Each is a real x402
 * endpoint served by this same Next.js app under /api/services/*.
 */
export type ScenarioId = "weather" | "scam-payto" | "over-cap" | "lookalike-token" | "kill-switch";

export type Scenario = {
  id: ScenarioId;
  title: string;
  description: string;
  path: string;
  expected: "allow" | "deny" | "ask_human";
  /** When set, this run reads that agent's mandate instead of the dashboard agent. */
  agentLabel?: string;
};

export const scenarios: Scenario[] = [
  {
    id: "weather",
    title: "1 · Buy weather data",
    description: "Normal purchase from an allowlisted API. Intercepta green → Guardian auto-signs.",
    path: "/api/services/weather?city=Tokyo",
    expected: "allow",
  },
  {
    id: "scam-payto",
    title: "2 · payTo is a flagged address",
    description: "Quote from a new endpoint whose payTo carries a scam flag on mainnet. Intercepta red → hard stop, no override.",
    path: "/api/services/premium-model",
    expected: "deny",
  },
  {
    id: "over-cap",
    title: "3 · Amount over per-tx max",
    description: "A $8 bulk-data quote exceeds the 5 USDC per-tx mandate. Guardian pauses and asks the owner via World ID.",
    path: "/api/services/bulk-data",
    expected: "ask_human",
  },
  {
    id: "lookalike-token",
    title: "4 · Lookalike USDC token",
    description: "The seller asks to be paid in a token that is not the policy asset. Asset check + Intercepta scan-token → hard stop.",
    path: "/api/services/lookalike",
    expected: "deny",
  },
  {
    id: "kill-switch",
    title: "5 · Kill switch on ENS",
    description: `Same weather purchase, under every cap — but ${ENS_ROGUE_NAME} has authority revoked on chain. Layer 1 refuses before anyone else gets a say.`,
    path: "/api/services/weather?city=Osaka",
    expected: "deny",
    agentLabel: ENS_ROGUE_LABEL,
  },
];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}
