export type CheckStatus = "pass" | "soft_fail" | "hard_fail" | "skipped";

export type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
  data?: Record<string, unknown>;
};

export type Verdict = "allow" | "ask_human" | "deny";

export type GuardianDecision = {
  verdict: Verdict;
  reason: string;
  checks: Check[];
  quote: {
    resource: string;
    payTo: string;
    amountAtomic: string;
    amountDisplay: string;
    asset: string;
    network: string;
  };
  policyHash: string;
  mandateSource: "ens" | "fallback";
  evaluatedAt: string;
};

/** Normalised output of an Intercepta screening call. */
export type Screening = {
  /** "clear" = safe to proceed, "flagged" = block, "unknown" = API unavailable / no data */
  verdict: "clear" | "flagged" | "unknown";
  riskLevel?: string;
  score?: number;
  reasons: string[];
  /** Raw API response for the dashboard "show me the evidence" panel. */
  raw?: unknown;
  endpoint: string;
  latencyMs: number;
};
