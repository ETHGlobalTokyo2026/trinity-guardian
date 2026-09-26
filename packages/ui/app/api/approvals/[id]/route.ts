import { NextResponse } from "next/server";
import { getApproval, redactApproval } from "@/lib/store";
import { cancelApproval, devResolveApproval } from "@/lib/guardian/approval";
import { isOwner, requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const a = getApproval(id);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(isOwner(req) ? a : redactApproval(a));
}

/**
 * Owner actions from the dashboard. Approval itself never comes through here:
 * it only happens when the backend validates a World ID token from the device
 * grant. The browser can cancel (deny), nothing more.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "cancel") return NextResponse.json(cancelApproval(id));
    if (body.action === "dev-approve") return NextResponse.json(devResolveApproval(id, "approved"));
    if (body.action === "dev-deny") return NextResponse.json(devResolveApproval(id, "denied"));
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
