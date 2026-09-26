import type { ApprovalClient, GuardianVerdict, PaymentRequirements } from "./types.js";

export type { ApprovalClient };

export async function resumeAfterVerdict(
  verdict: GuardianVerdict,
  reqs: PaymentRequirements,
  agentName: string,
  resource: string,
  approval: ApprovalClient,
): Promise<{ resume: boolean; reason?: string; approvalId?: string }> {
  if (verdict.decision === "hard_fail") {
    return { resume: false, reason: verdict.reasons.join("; ") };
  }
  if (verdict.decision === "pass") return { resume: true };

  const created = await approval.create({
    agent: agentName,
    amount: reqs.amount,
    asset: reqs.asset,
    payTo: reqs.payTo,
    network: reqs.network,
    reason: verdict.reasons.join("; "),
    resource,
    decision: "soft_fail",
  });
  const waited = await approval.wait(created.id);
  if (waited.status !== "approved") {
    return { resume: false, reason: `owner ${waited.status}`, approvalId: created.id };
  }
  try {
    await approval.consume(created.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "approval could not be consumed";
    return { resume: false, reason, approvalId: created.id };
  }
  return { resume: true, approvalId: created.id };
}
