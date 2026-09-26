import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ensGateLabel, pipelineFor } from "../components/dashboard/Pipeline";
import type { Run } from "../components/dashboard/utils";
import { getScenario } from "../lib/agent/scenarios";
import { agentIdentity, ENS_AGENT_LABEL, ENS_AGENT_NAME, ENS_ROGUE_LABEL, ENS_ROGUE_NAME } from "../lib/ens/names";
import type { OnChainMandate } from "../lib/guardian/ens";
import { ensSpendCheck, openingDenial } from "../lib/guardian/evaluate";
import type { Check } from "../lib/guardian/types";
import type { Mandate } from "../lib/policy";
import type { FeedEvent } from "../lib/store";

const PAYER = "0x1111111111111111111111111111111111111111";

function onChain(name: string, authority: "active" | "revoked", spendRole: boolean): OnChainMandate {
  return {
    chainId: 11155111,
    name,
    parent: name.split(".").slice(1).join("."),
    registry: "0x5B115dAFCeEcBe5d77506b1Ec8B0A017B7357174",
    resolver: "0xf23345070E24cb42E0A87323F75b84a34d9D33f6",
    status: "registered",
    spendRole,
    authority,
    expiry: Math.floor(Date.now() / 1000) + 86_400,
    expired: false,
    records: {},
    counterparties: [],
    latencyMs: 1,
    fetchedAt: new Date().toISOString(),
  };
}

function mandate(agent: string, chain: OnChainMandate): Mandate {
  return {
    agent,
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    assetSymbol: "USDC",
    decimals: 6,
    perTxMax: "5",
    dailyCap: "50",
    allowlist: [],
    allowlistNames: [],
    requireHumanIf: [],
    expires: "2026-09-28T00:00:00Z",
    source: "ens",
    onChain: chain,
  };
}

describe("kill switch reads rogue", () => {
  it("points case 5 at rogue and leaves weather on momo", () => {
    const kill = getScenario("kill-switch");
    const weather = getScenario("weather");
    assert.ok(kill);
    assert.ok(weather);
    assert.equal(kill.agentLabel, ENS_ROGUE_LABEL);
    assert.equal(kill.path, "/api/services/weather?city=Osaka");
    assert.match(kill.description, new RegExp(ENS_ROGUE_NAME.replaceAll(".", "\\.")));
    assert.equal(weather.agentLabel, undefined);
    assert.deepEqual(agentIdentity(kill.agentLabel), { label: ENS_ROGUE_LABEL, name: ENS_ROGUE_NAME });
    assert.equal(agentIdentity(weather.agentLabel).label, ENS_AGENT_LABEL);
    assert.equal(agentIdentity(weather.agentLabel).name, ENS_AGENT_NAME);
    assert.equal(ENS_ROGUE_NAME, `${ENS_ROGUE_LABEL}.${ENS_AGENT_NAME.slice(ENS_AGENT_LABEL.length + 1)}`);
  });

  it("hard-fails rogue before Intercepta and does not revoke a spend role", () => {
    const gate = ensSpendCheck(mandate(ENS_ROGUE_LABEL, onChain(ENS_ROGUE_NAME, "revoked", false)), PAYER);
    assert.equal(gate.status, "hard_fail");
    assert.equal(gate.name, "ens.spendRole");
    assert.match(gate.detail, new RegExp(`authority revoked on chain for ${ENS_ROGUE_NAME.replaceAll(".", "\\.")}`));
    const later: Check = { name: "intercepta", status: "hard_fail", detail: "flagged" };
    const denial = openingDenial([gate, later]);
    assert.equal(denial.verdict, "deny");
    assert.match(denial.reason, /^ens\.spendRole:/);
    assert.doesNotMatch(denial.reason, /intercepta/);

    const momo = ensSpendCheck(mandate(ENS_AGENT_LABEL, onChain(ENS_AGENT_NAME, "active", true)), PAYER);
    assert.equal(momo.status, "pass");
    assert.match(momo.detail, new RegExp(ENS_AGENT_NAME.replaceAll(".", "\\.")));

    const client = readFileSync(new URL("../lib/agent/client.ts", import.meta.url), "utf8");
    assert.equal(client.includes("revokeSpendRole"), false);
    assert.match(client, /createGuardedClient\(runId, scenario\.agentLabel\)/);
  });

  it("shows the on-chain name and text records on the ENS gate", () => {
    const idle = pipelineFor(undefined, undefined, { name: ENS_AGENT_NAME, authority: "active", perTxMax: "5", dailyCap: "50" });
    assert.equal(idle.ensView?.name, ENS_AGENT_NAME);
    assert.equal(ensGateLabel(idle.ensView), `${ENS_AGENT_NAME} mandate · authority active · ≤ 5/tx · ≤ 50/day`);

    const rogueChain = onChain(ENS_ROGUE_NAME, "revoked", false);
    rogueChain.records = { perTxMax: "5000000", dailyCap: "50000000" };
    const decision = {
      verdict: "deny" as const,
      reason: `ens.spendRole: authority revoked on chain for ${ENS_ROGUE_NAME}`,
      checks: [ensSpendCheck(mandate(ENS_ROGUE_LABEL, rogueChain), PAYER)],
      quote: {
        resource: "/api/services/weather?city=Osaka",
        payTo: PAYER,
        amountAtomic: "10000",
        amountDisplay: "0.01 USDC",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        network: "eip155:84532",
      },
      policyHash: "0x",
      mandateSource: "ens" as const,
      evaluatedAt: new Date().toISOString(),
    };
    const event = (kind: FeedEvent["kind"], level: FeedEvent["level"]): FeedEvent => ({
      id: kind,
      ts: new Date().toISOString(),
      runId: "run_rogue",
      kind,
      level,
      title: kind,
      data:
        kind === "decision"
          ? { decision }
          : kind === "ens"
            ? { onChain: rogueChain, mandate: { perTxMax: "5", dailyCap: "50" } }
            : undefined,
    });
    const run: Run = {
      runId: "run_rogue",
      title: "5 · Kill switch on ENS",
      started: new Date().toISOString(),
      verdict: "deny",
      events: [event("ens", "danger"), event("decision", "danger"), event("blocked", "danger")],
    };
    const model = pipelineFor(run, undefined, { name: ENS_AGENT_NAME, authority: "active", perTxMax: "5", dailyCap: "50" });
    assert.equal(model.ensView?.name, ENS_ROGUE_NAME);
    assert.equal(model.ensView?.authority, "revoked");
    assert.equal(ensGateLabel(model.ensView), `${ENS_ROGUE_NAME} mandate · authority revoked · ≤ 5/tx · ≤ 50/day`);
    assert.equal(model.gates[0].tone, "fail");
    assert.equal(model.gates[0].status, "authority revoked");
  });
});
