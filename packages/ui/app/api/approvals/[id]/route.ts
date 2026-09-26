import { NextResponse } from "next/server";
import {
  cancelApproval,
  consumeApproval,
  publicApproval,
  rejectClientApprovalFlag,
  submitProof,
} from "@/lib/guardian/approval";
import { getApproval } from "@/lib/store";
import type { IdKitResult } from "@/lib/guardian/worldid";

export async function GET(_req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const approval = getApproval(id);
  if (!approval) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicApproval(approval));
}

export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    approved?: unknown;
    idkitResponse?: IdKitResult;
  };
  try {
    rejectClientApprovalFlag(body);
    if (body.action === "cancel") return NextResponse.json(publicApproval(cancelApproval(id)));
    if (body.action === "proof") {
      if (!body.idkitResponse) return NextResponse.json({ error: "idkitResponse is required" }, { status: 400 });
      return NextResponse.json(publicApproval(await submitProof(id, body.idkitResponse)));
    }
    if (body.action === "consume") return NextResponse.json(publicApproval(consumeApproval(id)));
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refused";
    const status = message === "approval not found" ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
