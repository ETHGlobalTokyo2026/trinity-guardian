import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resumeAfterVerdict } from "../src/approval-gate.js";
import type { ApprovalClient, GuardianVerdict, PaymentRequirements } from "../src/types.js";

const reqs: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "7000000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x1111111111111111111111111111111111111111",
};

function client(status = "approved"): ApprovalClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async create() {
      calls.push("create");
      return { id: "apr_1" };
    },
    async wait() {
      calls.push("wait");
      return { status };
    },
    async consume() {
      calls.push("consume");
      return { ok: true };
    },
  };
}

async function gate(verdict: GuardianVerdict, approval = client(), agent = "momo.agents.trinityguard.eth") {
  return { approval, result: await resumeAfterVerdict(verdict, reqs, agent, "/compute", approval) };
}

describe("resumeAfterVerdict", () => {
  it("resumes a soft_fail only after the approval is consumed", async () => {
    const { approval, result } = await gate({ decision: "soft_fail", reasons: ["amount exceeds perTxMax $5.00"] });
    assert.equal(result.resume, true);
    assert.deepEqual(approval.calls, ["create", "wait", "consume"]);
  });

  it("refuses when the owner denies", async () => {
    const approval = client("denied");
    const { result } = await gate({ decision: "soft_fail", reasons: ["amount exceeds perTxMax $5.00"] }, approval);
    assert.equal(result.resume, false);
    assert.match(result.reason ?? "", /denied/);
    assert.deepEqual(approval.calls, ["create", "wait"]);
  });

  it("does not call World ID for a hard_fail", async () => {
    const approval = client();
    const { result } = await gate({ decision: "hard_fail", reasons: ["asset is not allowed"] }, approval);
    assert.equal(result.resume, false);
    assert.deepEqual(approval.calls, []);
  });

  it("does not call World ID when authority is revoked", async () => {
    const approval = client();
    const { result } = await gate(
      { decision: "hard_fail", reasons: ["authority revoked"] },
      approval,
      "rogue.agents.trinityguard.eth",
    );
    assert.equal(result.resume, false);
    assert.match(result.reason ?? "", /authority revoked/);
    assert.deepEqual(approval.calls, []);
  });

  it("does not call World ID for a flagged destination", async () => {
    const approval = client();
    const { result } = await gate(
      { decision: "hard_fail", reasons: ["Intercepta [mock]: address flagged — reported rugpull / scam entity"] },
      approval,
    );
    assert.equal(result.resume, false);
    assert.match(result.reason ?? "", /flagged/);
    assert.deepEqual(approval.calls, []);
  });
});
