import { NextResponse } from "next/server";
import { resetAll, setSpent } from "@/lib/store";
import { toAtomic } from "@/lib/policy";
import { requireAdmin } from "@/lib/admin-auth";

/** Demo controls: wipe the feed, or pretend the agent already spent X today. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { action?: string; spent?: string };
  if (body.action === "set-spent" && body.spent !== undefined) {
    setSpent(toAtomic(body.spent).toString());
    return NextResponse.json({ ok: true });
  }
  resetAll();
  return NextResponse.json({ ok: true });
}
