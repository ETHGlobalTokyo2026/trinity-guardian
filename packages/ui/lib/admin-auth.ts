import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Owner-only routes (flip the on-chain mandate, reset demo state, dev-bypass
 * approvals) are guarded by a shared secret when ADMIN_TOKEN is set. Locally,
 * with no token configured, they stay open so the demo needs no setup; any
 * public deployment must set ADMIN_TOKEN.
 */
export function adminTokenRequired(): boolean {
  return Boolean(process.env.ADMIN_TOKEN?.trim());
}

export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header);
  const want = Buffer.from(`Bearer ${expected}`);
  const ok = given.length === want.length && timingSafeEqual(given, want);
  return ok ? null : NextResponse.json({ error: "owner token required" }, { status: 401 });
}

/** True when the request may see owner-only data (always, while ADMIN_TOKEN is unset). */
export function isOwner(req: Request): boolean {
  return requireAdmin(req) === null;
}
