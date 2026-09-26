import { INTERCEPTA_API_KEY, INTERCEPTA_BASE_URL, USDC_BASE_SEPOLIA } from "../config";
import type { Screening } from "./types";

/**
 * Intercepta (formerly Web3 Antivirus) REST client.
 *
 * Docs:   https://docs.web3antivirus.io/reference/api-overview
 * Host:   https://api.web3antivirus.io
 * Auth:   header `X-API-KEY`
 *
 * Every call here is a *live* API call made before the agent signs. The client
 * is fail-closed: a missing key, timeout, non-200 or malformed body yields
 * verdict "unknown", which the Guardian never treats as a pass.
 *
 * Intercepta's risk data covers mainnet only. The payment itself runs on Base
 * Sepolia, but an address is the same hex on every EVM chain, so we screen the
 * payTo against mainnet intel. For the token check we map testnet USDC to its
 * mainnet twin (Base USDC) because the testnet contract has no intel.
 */

const TIMEOUT_MS = 10_000;

/** Base mainnet USDC — the "real" twin of the Base Sepolia test USDC. */
const USDC_BASE_MAINNET = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TESTNET_TO_MAINNET_TOKEN: Record<string, { address: string; chainId: string }> = {
  [USDC_BASE_SEPOLIA.toLowerCase()]: { address: USDC_BASE_MAINNET, chainId: "8453" },
};

/** CAIP-2 -> Intercepta chainId query value (mainnet ids only). */
function interceptaChainId(network: string): string {
  const id = network.split(":")[1];
  if (id === "84532") return "8453"; // Base Sepolia -> Base
  if (id === "11155111") return "1"; // Sepolia -> Ethereum
  return id ?? "1";
}

type QuickScanResponse = {
  toxicScore: number;
  traits: { risk: number; name: string; txsCount: number; description: string }[];
};

type TokenRiskResponse = {
  riskScore: number;
  riskLevel: "neutral" | "low" | "medium" | "high";
  category: string;
  trust: "whitelist" | "blocklist" | "neutral";
  action: "block" | "warn" | "info";
  detectors: { code: string; description: string }[];
  token: { chainId: string; address: string; symbol: string };
};

type SignatureAnalysisResponse = {
  messageType?: string;
  riskGroup: "Low" | "Medium" | "High";
  detectors: { code: string; description: string }[];
  addresses: { address: string; type: string; detectors: string[] }[];
  assetsMovement?: unknown;
};

async function call<T>(
  endpoint: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T; latencyMs: number } | { ok: false; error: string; latencyMs: number; raw?: unknown }> {
  const started = Date.now();
  if (!INTERCEPTA_API_KEY) {
    return { ok: false, error: "INTERCEPTA_API_KEY not set", latencyMs: 0 };
  }
  try {
    const res = await fetch(`${INTERCEPTA_BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-API-KEY": INTERCEPTA_API_KEY,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" && body && "response" in body
          ? String((body as { response: unknown }).response)
          : `${endpoint} HTTP ${res.status}`;
      return { ok: false, error: msg, latencyMs, raw: body };
    }
    return { ok: true, data: body as T, latencyMs };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - started,
    };
  }
}

/* Trait names that are always a hard block, regardless of score. */
const BLOCKING_TRAITS = new Set([
  "known_scammer",
  "initiator_scam_transactions",
  "sanction_address",
  "sanction_address_communication",
  "blacklist",
  "fake_phishing_transfer",
  "fake_phishing_contract_communication",
  "attack_money_target",
  "mixer_transfers",
  "rug_pull",
  "suspicious_deployer",
  "suspicious_dex_pair_deployer",
]);

/**
 * Quick Scan Address — "fast check on payTo or payer".
 * GET /api/public/v2/extension/account/{address}/quick-scan
 */
export async function screenAddress(address: string): Promise<Screening> {
  const endpoint = "quick-scan-address";
  const r = await call<QuickScanResponse>(
    endpoint,
    `/api/public/v2/extension/account/${address}/quick-scan`,
  );
  if (!r.ok) return { verdict: "unknown", reasons: [r.error], raw: r.raw, endpoint, latencyMs: r.latencyMs };

  const { toxicScore, traits = [] } = r.data;
  const reasons = traits.map((t) => `${t.name}${t.description ? ` — ${t.description}` : ""}${t.txsCount ? ` (${t.txsCount} txs)` : ""}`);
  const hardTrait = traits.some((t) => BLOCKING_TRAITS.has(t.name));
  // Intercepta does not publish a threshold; this is Guardian policy:
  // any trait or a non-zero toxic score is a red flag for an autonomous payer.
  const flagged = hardTrait || traits.length > 0 || toxicScore > 0;
  if (flagged && reasons.length === 0) reasons.push(`toxicScore ${toxicScore}`);
  return {
    verdict: flagged ? "flagged" : "clear",
    riskLevel: `toxicScore ${toxicScore}`,
    score: toxicScore,
    reasons,
    raw: r.data,
    endpoint,
    latencyMs: r.latencyMs,
  };
}

/**
 * Scan Token — "real USDC or a lookalike".
 * GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=
 */
export async function screenToken(asset: string, network: string): Promise<Screening> {
  const endpoint = "scan-token";
  const mapped = TESTNET_TO_MAINNET_TOKEN[asset.toLowerCase()];
  const address = mapped?.address ?? asset;
  const chainId = mapped?.chainId ?? interceptaChainId(network);
  const r = await call<TokenRiskResponse>(
    endpoint,
    `/api/public/v2/extension/token-intelligence/token/${address}/risks?chainId=${chainId}`,
  );
  if (!r.ok) return { verdict: "unknown", reasons: [r.error], raw: r.raw, endpoint, latencyMs: r.latencyMs };

  const d = r.data;
  const reasons = (d.detectors ?? []).map((x) => `${x.code}${x.description ? ` — ${x.description}` : ""}`);
  const flagged =
    d.action === "block" ||
    d.trust === "blocklist" ||
    d.riskLevel === "high" ||
    ["malicious", "sanctioned"].includes(d.category);
  const clear = !flagged && d.action === "info";
  if (mapped) reasons.unshift(`screened mainnet twin ${d.token?.symbol ?? ""} ${address} on chain ${chainId}`);
  return {
    verdict: flagged ? "flagged" : clear ? "clear" : "unknown",
    riskLevel: `${d.riskLevel} / ${d.trust} / action=${d.action}`,
    score: d.riskScore,
    reasons,
    raw: d,
    endpoint,
    latencyMs: r.latencyMs,
  };
}

/**
 * Scan Message — "check the payment authorization".
 * POST /api/public/v2/extension/analysis/signature
 *
 * @param typedData the EIP-712 TransferWithAuthorization the agent is about to sign
 */
export async function screenMessage(
  typedData: { domain: { chainId?: number | string } & Record<string, unknown>; message: Record<string, unknown> } & Record<string, unknown>,
  from: string,
): Promise<Screening> {
  const endpoint = "scan-message";
  const chainId = interceptaChainId(`eip155:${typedData.domain.chainId ?? 1}`);
  const r = await call<SignatureAnalysisResponse>(endpoint, `/api/public/v2/extension/analysis/signature`, {
    method: "POST",
    body: JSON.stringify({ from, message: JSON.stringify(typedData), chainId }),
  });
  if (!r.ok) return { verdict: "unknown", reasons: [r.error], raw: r.raw, endpoint, latencyMs: r.latencyMs };

  const d = r.data;
  const reasons = [
    ...(d.detectors ?? []).map((x) => `${x.code}${x.description ? ` — ${x.description}` : ""}`),
    ...(d.addresses ?? [])
      .filter((a) => a.detectors?.length)
      .map((a) => `${a.address}: ${a.detectors.join(", ")}`),
  ];
  const flagged = d.riskGroup === "High" || reasons.length > 0;
  return {
    verdict: flagged ? "flagged" : d.riskGroup === "Low" ? "clear" : "unknown",
    riskLevel: `riskGroup ${d.riskGroup}${d.messageType ? ` / ${d.messageType}` : ""}`,
    reasons,
    raw: d,
    endpoint,
    latencyMs: r.latencyMs,
  };
}

export function interceptaConfigured(): boolean {
  return Boolean(INTERCEPTA_API_KEY);
}
