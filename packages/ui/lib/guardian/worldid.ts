import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  WORLD_CLIENT_ID,
  WORLD_CLIENT_SECRET,
  WORLD_DEV_BYPASS,
  WORLD_ISSUER,
  WORLD_OWNER_SUB,
} from "../config";

/**
 * World ID for Agents — OAuth 2.0 Device Authorization Grant (RFC 8628) against
 * the World ID OpenID Connect provider.
 *
 *   discovery: {WORLD_ISSUER}/.well-known/openid-configuration
 *   start:     POST {WORLD_ISSUER}/api/v1/device_authorization   scope=openid
 *   poll:      POST {WORLD_ISSUER}/api/v1/token                  grant_type=urn:ietf:params:oauth:grant-type:device_code
 *   keys:      GET  {WORLD_ISSUER}/.well-known/jwks.json
 *
 * Flow: the backend (a confidential client) creates a device authorization and
 * shows the human `user_code` + `verification_uri_complete`. The human proves
 * with the sandbox World App and explicitly approves or denies. The backend
 * polls the token endpoint: `authorization_pending` → keep waiting,
 * `access_denied` → denied, `expired_token` → expired, 200 → an RS256 ID token
 * we validate locally (issuer, audience, signature, expiry, acr, auth_time).
 *
 * The device_code and client secret never leave this module.
 */

export const ACR_ORB = "https://world.org/oidc/acr/orb-v3";

export type DeviceAuthorization = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

export type DevicePoll =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" | "expired" | "invalid" | "unavailable"; error?: string }
  | {
      status: "approved";
      sub: string;
      authTime: number;
      acr?: string;
      amr?: string[];
      idToken: string;
    };

const jwks = createRemoteJWKSet(new URL(`${WORLD_ISSUER}/.well-known/jwks.json`));

function basicAuth() {
  return "Basic " + Buffer.from(`${WORLD_CLIENT_ID}:${WORLD_CLIENT_SECRET}`).toString("base64");
}

export function worldIdConfigured(): boolean {
  return Boolean(WORLD_CLIENT_ID && WORLD_CLIENT_SECRET);
}

export function worldIdDevBypass(): boolean {
  return WORLD_DEV_BYPASS && !worldIdConfigured();
}

export async function startDeviceApproval(): Promise<DeviceAuthorization> {
  const res = await fetch(`${WORLD_ISSUER}/api/v1/device_authorization`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams({ scope: "openid" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`device_authorization ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as DeviceAuthorization;
}

export async function pollDeviceApproval(deviceCode: string): Promise<DevicePoll> {
  const res = await fetch(`${WORLD_ISSUER}/api/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 503 || res.status === 429) return { status: "unavailable" };

  const body = (await res.json().catch(() => ({}))) as { error?: string; id_token?: string };
  if (!res.ok) {
    switch (body.error) {
      case "authorization_pending":
        return { status: "pending" };
      case "slow_down":
        return { status: "slow_down" };
      case "access_denied":
        return { status: "denied", error: body.error };
      case "expired_token":
        return { status: "expired", error: body.error };
      default:
        return { status: "invalid", error: body.error ?? `HTTP ${res.status}` };
    }
  }
  if (!body.id_token) return { status: "invalid", error: "token response without id_token" };

  const claims = await verifyIdToken(body.id_token);
  return {
    status: "approved",
    sub: claims.sub!,
    authTime: Number(claims.auth_time),
    acr: claims.acr as string | undefined,
    amr: claims.amr as string[] | undefined,
    idToken: body.id_token,
  };
}

/**
 * Local validation of the ID token. "Merely decoding a JWT is not validation."
 * Throws on any failure so callers cannot accidentally treat a bad token as approval.
 */
export async function verifyIdToken(idToken: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: WORLD_ISSUER,
    audience: WORLD_CLIENT_ID,
    algorithms: ["RS256"],
    clockTolerance: 30,
  });
  if (!payload.sub) throw new Error("id_token missing sub");
  if (typeof payload.auth_time !== "number") throw new Error("id_token missing auth_time");
  if (payload.acr !== ACR_ORB) throw new Error(`unexpected acr ${String(payload.acr)}`);
  if (WORLD_OWNER_SUB && payload.sub !== WORLD_OWNER_SUB) {
    throw new Error("identity mismatch: proof came from a human who is not the registered owner");
  }
  return payload;
}
