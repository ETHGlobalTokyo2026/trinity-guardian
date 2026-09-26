import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuardian } from "../src/index.js";
import type { PaymentRequirements, Policy } from "../src/types.js";

const MOMO = "momo.agents.trinityguard.eth";
const ROGUE = "rogue.agents.trinityguard.eth";

const active: Policy = {
  roleActive: true,
  perTxMax: 5_000_000n,
  dailyCap: 50_000_000n,
  allowedAsset: "",
};

function reqs(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x1111111111111111111111111111111111111111",
    ...overrides,
  };
}

function guardianFor(
  readPolicy: (subname: string) => Promise<Policy | null>,
  isFlagged: (payTo: string) => boolean = () => false,
  agentSubname = MOMO,
) {
  return createGuardian({ agentSubname, readPolicy, isFlagged });
}

describe("checkPolicy", () => {
  it("hard-fails a revoked authority before the flag check", async () => {
    let flagged = 0;
    const guardian = guardianFor(
      async () => ({ ...active, roleActive: false }),
      () => {
        flagged += 1;
        return true;
      },
      ROGUE,
    );

    const verdict = await guardian.checkPolicy(reqs(), 0n);

    assert.equal(verdict.decision, "hard_fail");
    assert.deepEqual(verdict.reasons, ["authority revoked"]);
    assert.equal(flagged, 0);
  });

  it("hard-fails a missing policy before the flag check", async () => {
    let flagged = 0;
    const guardian = guardianFor(
      async () => null,
      () => {
        flagged += 1;
        return true;
      },
    );

    const verdict = await guardian.checkPolicy(reqs(), 0n);

    assert.equal(verdict.decision, "hard_fail");
    assert.deepEqual(verdict.reasons, ["authority missing"]);
    assert.equal(flagged, 0);
  });

  it("hard-fails when the policy read throws", async () => {
    let flagged = 0;
    const guardian = guardianFor(
      async () => {
        throw new Error("rpc down");
      },
      () => {
        flagged += 1;
        return true;
      },
    );

    const verdict = await guardian.checkPolicy(reqs(), 0n);

    assert.equal(verdict.decision, "hard_fail");
    assert.deepEqual(verdict.reasons, ["policy read failed"]);
    assert.equal(flagged, 0);
  });

  it("flags a blocked payTo only after authority is active", async () => {
    const seen: string[] = [];
    const guardian = guardianFor(
      async (subname) => {
        seen.push(subname);
        return active;
      },
      (payTo) => payTo === "0xbad",
    );

    const verdict = await guardian.checkPolicy(reqs({ payTo: "0xbad" }), 0n);

    assert.deepEqual(seen, [MOMO]);
    assert.equal(verdict.decision, "hard_fail");
    assert.match(verdict.reasons[0] ?? "", /flagged/);
  });

  it("soft-fails an amount over perTxMax", async () => {
    const guardian = guardianFor(async () => active);
    const verdict = await guardian.checkPolicy(reqs({ amount: "5000001" }), 0n);
    assert.equal(verdict.decision, "soft_fail");
    assert.match(verdict.reasons[0] ?? "", /perTxMax/);
  });

  it("hard-fails when an allowed asset does not match", async () => {
    const guardian = guardianFor(async () => ({ ...active, allowedAsset: "0xaaaa" }));
    const verdict = await guardian.checkPolicy(reqs({ asset: "0xbbbb" }), 0n);
    assert.equal(verdict.decision, "hard_fail");
    assert.match(verdict.reasons[0] ?? "", /not allowed/);
  });

  it("passes when allowedAsset is empty", async () => {
    const guardian = guardianFor(async () => active);
    const verdict = await guardian.checkPolicy(reqs(), 0n);
    assert.equal(verdict.decision, "pass");
  });
});

describe("requestApproval", () => {
  it("returns false until World ID is wired", async () => {
    const guardian = guardianFor(async () => active);
    assert.equal(await guardian.requestApproval(reqs(), ["over cap"]), false);
  });
});
