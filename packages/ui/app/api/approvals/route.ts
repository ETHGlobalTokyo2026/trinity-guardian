import { NextResponse } from "next/server";
import { createSoftFailApproval, publicApproval, type ApprovalBinding } from "@/lib/guardian/approval";
import { newId } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<ApprovalBinding> & { approved?: unknown };
  if (body.approved === true) {
    return NextResponse.json({ error: "client approval flags are not accepted" }, { status: 400 });
  }
  if (body.decision !== "soft_fail") {
    return NextResponse.json({ error: "approval is only for soft_fail" }, { status: 400 });
  }
  const required = [body.agent, body.amount, body.asset, body.payTo, body.network, body.reason] as const;
  if (required.some((value) => typeof value !== "string" || value === "")) {
    return NextResponse.json({ error: "agent, amount, asset, payTo, network, and reason are required" }, { status: 400 });
  }
  try {
    const approval = createSoftFailApproval({
      runId: body.runId || newId("run"),
      agent: body.agent!,
      amount: body.amount!,
      asset: body.asset!,
      payTo: body.payTo!,
      network: body.network!,
      reason: body.reason!,
      resource: body.resource || "",
      decision: "soft_fail",
    });
    return NextResponse.json(publicApproval(approval), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refused";
    const status = message === "World ID is not configured" ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
