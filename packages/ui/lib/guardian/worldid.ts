import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { APPROVAL_TIMEOUT_MS, WORLD_ENVIRONMENT } from "../config";
import { recordVerifiedPerson } from "./worldid-db";

const VERIFY_URL = "https://developer.world.org/api/v4/verify";

export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export type WorldLaunch = {
  appId: string;
  rpId: string;
  action: string;
  signal: string;
  signalHash: string;
  environment: typeof WORLD_ENVIRONMENT;
  rpContext: RpContext;
};

export type IdKitResult = {
  protocol_version?: string;
  nonce?: string;
  action?: string;
  environment?: string;
  responses?: Array<{ signal_hash?: string; nullifier?: string }>;
};

function appId() {
  return process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "";
}

function rpId() {
  return process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "";
}

function action() {
  return process.env.WORLD_ACTION ?? "";
}

function signingKey() {
  return process.env.RP_SIGNING_KEY ?? "";
}

export function worldIdConfigured(): boolean {
  return Boolean(appId() && rpId() && action() && signingKey());
}

export function worldIdDevBypass(): boolean {
  return false;
}

export function approvalSignal(parts: {
  id: string;
  agent: string;
  amount: string;
  asset: string;
  payTo: string;
  reason: string;
}): string {
  return [parts.id, parts.agent, parts.amount, parts.asset.toLowerCase(), parts.payTo.toLowerCase(), parts.reason].join("|");
}

function redact(message: string): string {
  const key = signingKey();
  return key ? message.split(key).join("[redacted]") : message;
}

export function signApproval(signal: string, ttlSec = Math.floor(APPROVAL_TIMEOUT_MS / 1000)): WorldLaunch {
  if (!worldIdConfigured()) throw new Error("World ID is not configured");
  const ttl = Math.max(1, Math.floor(ttlSec));
  let signed;
  try {
    signed = signRequest({ signingKeyHex: signingKey(), action: action(), ttl });
  } catch (error) {
    throw new Error(redact(error instanceof Error ? error.message : "could not sign World ID request"));
  }
  return {
    appId: appId(),
    rpId: rpId(),
    action: action(),
    signal,
    signalHash: hashSignal(signal),
    environment: WORLD_ENVIRONMENT,
    rpContext: {
      rp_id: rpId(),
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      signature: signed.sig,
    },
  };
}

export function proofMatches(launch: WorldLaunch, proof: IdKitResult): string | null {
  if (proof.action !== launch.action) return "action mismatch";
  if (proof.nonce !== launch.rpContext.nonce) return "nonce mismatch";
  const responses = proof.responses ?? [];
  if (responses.length === 0) return "proof has no responses";
  if (responses.some((response) => (response.signal_hash ?? "").toLowerCase() !== launch.signalHash.toLowerCase())) {
    return "signal mismatch";
  }
  if (!responses[0]?.nullifier) return "proof missing nullifier";
  return null;
}

export async function verifyWorldId(proof: IdKitResult, meta?: { approvalId?: string }): Promise<{ nullifier: string }> {
  const res = await fetch(`${VERIFY_URL}/${rpId()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(proof),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`world id verify failed (${res.status})`);
  const nullifier = proof.responses?.[0]?.nullifier;
  if (!nullifier) throw new Error("world id verify response missing nullifier");
  recordVerifiedPerson({
    nullifier,
    appId: appId(),
    rpId: rpId(),
    action: proof.action || action(),
    approvalId: meta?.approvalId,
  });
  return { nullifier };
}
