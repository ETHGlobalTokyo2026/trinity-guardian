import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  cancelApproval,
  consumeApproval,
  createSoftFailApproval,
  publicApproval,
  rejectClientApprovalFlag,
  relaunchApproval,
  requestApproval,
  submitProof,
  type ApprovalBinding,
} from "../lib/guardian/approval";
import type { GuardianDecision } from "../lib/guardian/types";
import type { IdKitResult } from "../lib/guardian/worldid";
import { getApproval, resetAll, updateApproval } from "../lib/store";

const SIGNING_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

process.env.NEXT_PUBLIC_WORLD_APP_ID = "app_test";
process.env.NEXT_PUBLIC_WORLD_RP_ID = "rp_test";
process.env.WORLD_ACTION = "payment-approval";
process.env.RP_SIGNING_KEY = SIGNING_KEY;

const binding: ApprovalBinding = {
  runId: "run_1",
  agent: "momo.agents.trinityguard.eth",
  amount: "7000000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x1111111111111111111111111111111111111111",
  network: "eip155:84532",
  reason: "amount exceeds perTxMax $5.00",
  resource: "/compute",
  decision: "soft_fail",
};

function proofFor(nonce: string, action: string, signalHash: string, nullifier = "0x04e5"): IdKitResult {
  return {
    protocol_version: "4.0",
    nonce,
    action,
    environment: "sandbox",
    responses: [{ signal_hash: signalHash, nullifier }],
  };
}

let verifyCalls = 0;
let verifyStatus = 200;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetAll();
  verifyCalls = 0;
  verifyStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/api/v4/verify/")) throw new Error(`unexpected fetch ${url}`);
    verifyCalls += 1;
    return new Response("{}", { status: verifyStatus });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("World ID approval", () => {
  it("approves a soft_fail proof and allows one consume", async () => {
    const created = createSoftFailApproval(binding);
    const proof = proofFor(created.launch.rpContext.nonce, created.launch.action, created.launch.signalHash);
    const approved = await submitProof(created.id, proof);
    assert.equal(approved.status, "approved");
    assert.equal(approved.nullifier, "0x04e5");
    const consumed = consumeApproval(created.id);
    assert.ok(consumed.consumedAt);
    assert.throws(() => consumeApproval(created.id), /already consumed/);
    await assert.rejects(() => submitProof(created.id, proof), /already/);
  });

  it("refuses a second proof on the same approval before consume", async () => {
    const created = createSoftFailApproval(binding);
    const proof = proofFor(created.launch.rpContext.nonce, created.launch.action, created.launch.signalHash);
    await submitProof(created.id, proof);
    await assert.rejects(() => submitProof(created.id, proof), /already/);
  });

  it("relaunch re-signs the RP context and the proof must use the new nonce", async () => {
    const created = createSoftFailApproval(binding);
    const oldNonce = created.launch.rpContext.nonce;
    const relaunched = relaunchApproval(created.id);
    assert.notEqual(relaunched.launch.rpContext.nonce, oldNonce);
    // the payment binding does not move
    assert.equal(relaunched.launch.signal, created.launch.signal);
    assert.equal(relaunched.launch.signalHash, created.launch.signalHash);
    // the RP window never outlives the approval
    assert.ok(relaunched.launch.rpContext.expires_at * 1000 <= Date.parse(relaunched.expiresAt) + 1000);
    await assert.rejects(() => submitProof(created.id, proofFor(oldNonce, created.launch.action, created.launch.signalHash)), /nonce mismatch/);
  });

  it("accepts a proof for the relaunched nonce", async () => {
    const created = createSoftFailApproval(binding);
    const relaunched = relaunchApproval(created.id);
    const approved = await submitProof(created.id, proofFor(relaunched.launch.rpContext.nonce, relaunched.launch.action, relaunched.launch.signalHash));
    assert.equal(approved.status, "approved");
    assert.throws(() => relaunchApproval(created.id), /already approved/);
  });

  it("marks a cancelled approval denied", () => {
    const created = createSoftFailApproval(binding);
    const denied = cancelApproval(created.id);
    assert.equal(denied.status, "denied");
    assert.throws(() => consumeApproval(created.id), /denied|expired/);
  });

  it("rejects an invalid World ID verify response", async () => {
    verifyStatus = 400;
    const created = createSoftFailApproval(binding);
    const proof = proofFor(created.launch.rpContext.nonce, created.launch.action, created.launch.signalHash);
    await assert.rejects(() => submitProof(created.id, proof), /verify failed/);
    assert.equal(getApproval(created.id)?.status, "invalid");
    assert.equal(verifyCalls, 1);
  });

  it("rejects a proof whose signal does not match this payment", async () => {
    const created = createSoftFailApproval(binding);
    const proof = proofFor(created.launch.rpContext.nonce, created.launch.action, "0xdead");
    await assert.rejects(() => submitProof(created.id, proof), /signal mismatch/);
    assert.equal(getApproval(created.id)?.status, "invalid");
    assert.equal(verifyCalls, 0);
  });

  it("rejects an expired approval", async () => {
    const created = createSoftFailApproval(binding);
    updateApproval(created.id, { expiresAt: new Date(Date.now() - 1_000).toISOString() });
    const current = getApproval(created.id);
    const proof = proofFor(created.launch.rpContext.nonce, created.launch.action, created.launch.signalHash);
    await assert.rejects(() => submitProof(created.id, proof), /expired/);
    assert.throws(() => consumeApproval(created.id), /expired/);
    assert.equal(current?.status, "expired");
    assert.equal(verifyCalls, 0);
  });

  it("does not let a client boolean approve a payment", () => {
    const created = createSoftFailApproval(binding);
    assert.throws(() => rejectClientApprovalFlag({ approved: true }), /not accepted/);
    assert.throws(() => rejectClientApprovalFlag({ action: "dev-approve" }), /not accepted/);
    assert.equal(getApproval(created.id)?.status, "pending");
  });

  it("does not start World ID for a hard_fail", () => {
    assert.throws(() => createSoftFailApproval({ ...binding, decision: "hard_fail" } as never), /soft_fail/);
    const decision: GuardianDecision = {
      verdict: "deny",
      reason: "authority revoked",
      checks: [{ name: "authority", status: "hard_fail", detail: "authority revoked" }],
      quote: {
        resource: "/weather",
        payTo: binding.payTo,
        amountAtomic: "10000",
        amountDisplay: "0.01",
        asset: binding.asset,
        network: binding.network,
      },
      policyHash: "",
      mandateSource: "ens",
      evaluatedAt: new Date().toISOString(),
    };
    assert.throws(() => requestApproval("run_rogue", decision, "rogue.agents.trinityguard.eth"), /soft_fail|hard_fail/);
    assert.equal(verifyCalls, 0);
  });

  it("keeps the signing key out of the approval payload", () => {
    const created = createSoftFailApproval(binding);
    const encoded = JSON.stringify(publicApproval(created));
    assert.equal(encoded.includes(SIGNING_KEY), false);
    assert.equal(JSON.stringify(created).includes(SIGNING_KEY), false);
    assert.equal(encoded.includes("RP_SIGNING_KEY"), false);
    assert.match(encoded, /payment-approval/);
    assert.match(encoded, /rp_test/);
  });
});
