import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { loadMandate, policyHash, toAtomic, fromAtomic, type Mandate } from "../policy";
import { getLedger, emit } from "../store";
import { interceptaEnabled, screenAddress, screenToken, screenMessage } from "./intercepta";
import type { Check, GuardianDecision, Screening } from "./types";

/**
 * Trinity Guardian. Runs *before* the agent signs anything. Three layers, in
 * order; no layer can override another.
 *
 *   LAYER 1 · ENS — the gate (read fresh from Sepolia)
 *     1. agent name holds the `spend` role   -> hard fail (kill switch)
 *     2. subname not expired                  -> hard fail (mandate lapsed on chain)
 *   LAYER 2 · policy + Intercepta — the checkpoint
 *     3. asset matches the mandate            -> hard fail
 *     4. payTo resolves to an allowlisted ENS name (ENSIP-26 identity) -> soft fail
 *     5. Intercepta: payTo, token, authorization -> hard fail if flagged, soft if no verdict
 *        (skipped entirely unless INTERCEPTA_ENABLED=true)
 *     6. amount <= perTxMax                   -> soft fail
 *     7. dailySpend + amount <= dailyCap      -> hard fail
 *   LAYER 3 · World ID — the human approver (soft fails end up here)
 *
 * Hard fails are refused outright: the owner edits the mandate on chain, there
 * is no per-transaction override.
 */
export async function evaluate(
  runId: string,
  payer: `0x${string}`,
  paymentRequired: PaymentRequired,
  req: PaymentRequirements,
): Promise<GuardianDecision> {
  const checks: Check[] = [];
  const amountAtomic = BigInt(req.amount);
  const policy: Mandate = await loadMandate(payer);
  emitGate(runId, policy);
  const quote = {
    resource: paymentRequired.resource?.url ?? "",
    payTo: req.payTo,
    amountAtomic: req.amount,
    amountDisplay: `${fromAtomic(amountAtomic, policy.decimals)} ${policy.assetSymbol}`,
    asset: req.asset,
    network: req.network,
  };

  const finish = (verdict: GuardianDecision["verdict"], reason: string): GuardianDecision => {
    const d: GuardianDecision = {
      verdict,
      reason,
      checks,
      quote,
      policyHash: policyHash(policy),
      mandateSource: policy.source,
      evaluatedAt: new Date().toISOString(),
    };
    emit({
      runId,
      kind: "decision",
      level: verdict === "allow" ? "ok" : verdict === "ask_human" ? "warn" : "danger",
      title:
        verdict === "allow"
          ? "Guardian verdict: ALLOW"
          : verdict === "ask_human"
            ? "Guardian verdict: NEEDS HUMAN APPROVAL"
            : "Guardian verdict: DENY",
      detail: reason,
      data: { decision: d },
    });
    return d;
  };

  /* LAYER 1 · ENS gate */
  const oc = policy.onChain;
  if (policy.source === "ens" && oc) {
    const gateOk = !oc.error && oc.status === "registered" && oc.spendRole && !oc.expired;
    checks.push({
      name: "ens.spendRole",
      status: oc.error ? "soft_fail" : gateOk ? "pass" : "hard_fail",
      detail: oc.error
        ? `could not read ${oc.name} from Sepolia (${oc.error}); escalating to the owner`
        : oc.status !== "registered"
          ? `${oc.name} is ${oc.status} in registry ${oc.registry}`
          : oc.expired
            ? `${oc.name} expired ${new Date(oc.expiry * 1000).toISOString()} — mandate lapsed on chain`
            : oc.spendRole
              ? `${oc.name} holds the spend role for ${payer} (registry ${oc.registry})`
              : `spend role revoked on chain for ${payer} — kill switch is on`,
      data: { onChain: oc },
    });
  } else {
    checks.push({
      name: "ens.spendRole",
      status: "skipped",
      detail: "no ENS registry configured — running on the off-chain fallback mandate",
    });
  }
  emitCheck(runId, checks.at(-1)!);
  const gateFailed = checks.at(-1)!.status === "hard_fail";

  /* 1. asset + network */
  const assetOk =
    req.asset.toLowerCase() === policy.asset.toLowerCase() && req.network === policy.network;
  checks.push({
    name: "asset",
    status: assetOk ? "pass" : "hard_fail",
    detail: assetOk
      ? `${policy.assetSymbol} on ${policy.network}`
      : `quote asks for ${req.asset} on ${req.network}, policy only allows ${policy.assetSymbol} (${policy.asset}) on ${policy.network}`,
  });
  emitCheck(runId, checks.at(-1)!);

  /* 2. allowlist — matched by ENS name when the mandate is on chain */
  const counterparty = policy.onChain?.counterparties.find((c) => c.address?.toLowerCase() === req.payTo.toLowerCase());
  const inAllowlist = counterparty ? true : policy.allowlist.some((a) => a.toLowerCase() === req.payTo.toLowerCase());
  checks.push({
    name: "allowlist",
    status: inAllowlist ? "pass" : "soft_fail",
    detail: counterparty
      ? `payTo is ${counterparty.name}${counterparty.endpoint ? ` (${counterparty.endpoint})` : ""}${counterparty.agentContext ? ` — ${counterparty.agentContext.slice(0, 80)}` : ""}`
      : inAllowlist
        ? "payTo is an approved counterparty"
        : policy.source === "ens"
          ? `payTo has no ENS identity among the mandate's allowlist (${policy.allowlistNames.join(", ") || "empty"})`
          : "payTo is not in the owner's allowlist",
    data: counterparty ? { counterparty } : undefined,
  });
  emitCheck(runId, checks.at(-1)!);

  /* 3. Intercepta: address, token, authorization message (always run so the
        dashboard shows the evidence even when a cheaper check already failed).
        Opt-in: when disabled it is recorded as skipped and never escalates. */
  if (!interceptaEnabled()) {
    checks.push({ name: "intercepta", status: "skipped", detail: "Intercepta screening is off (INTERCEPTA_ENABLED is not true)" });
    emit({ runId, kind: "policy", level: "info", title: "policy.intercepta: skipped", detail: checks.at(-1)!.detail, data: { check: checks.at(-1) } });
  } else {
    await screenWithIntercepta(runId, checks, payer, req);
  }

  /* 4. per-tx max */
  const perTxMax = toAtomic(policy.perTxMax);
  const perTxOk = amountAtomic <= perTxMax;
  checks.push({
    name: "perTxMax",
    status: perTxOk ? "pass" : "soft_fail",
    detail: `${quote.amountDisplay} ${perTxOk ? "≤" : ">"} per-tx max ${policy.perTxMax} ${policy.assetSymbol}`,
  });
  emitCheck(runId, checks.at(-1)!);

  /* 5. daily cap */
  const ledger = getLedger();
  const spent = BigInt(ledger.spentAtomic);
  const dailyCap = toAtomic(policy.dailyCap);
  const dailyOk = spent + amountAtomic <= dailyCap;
  checks.push({
    name: "dailyCap",
    status: dailyOk ? "pass" : "hard_fail",
    detail: `spent today ${fromAtomic(spent)} + ${fromAtomic(amountAtomic)} ${dailyOk ? "≤" : ">"} daily cap ${policy.dailyCap} ${policy.assetSymbol}`,
    data: { spentAtomic: ledger.spentAtomic, dailyCapAtomic: dailyCap.toString() },
  });
  emitCheck(runId, checks.at(-1)!);

  /* 6. mandate expiry (on chain this is the subname expiry, already covered by the gate) */
  if (policy.source === "fallback") {
    const expired = Date.parse(policy.expires) < Date.now();
    checks.push({
      name: "mandate",
      status: expired ? "hard_fail" : "pass",
      detail: expired ? `fallback mandate expired ${policy.expires}` : `fallback mandate valid until ${policy.expires}`,
    });
    emitCheck(runId, checks.at(-1)!);
  }
  void gateFailed;

  /* verdict */
  const hard = checks.find((c) => c.status === "hard_fail");
  if (hard) return finish("deny", `${hard.name}: ${hard.detail}`);
  const soft = checks.filter((c) => c.status === "soft_fail");
  if (soft.length) return finish("ask_human", soft.map((c) => `${c.name}: ${c.detail}`).join(" | "));
  return finish("allow", "all checks passed");
}

function emitGate(runId: string, m: Mandate) {
  const oc = m.onChain;
  if (m.source === "fallback" || !oc) {
    emit({ runId, kind: "ens", level: "warn", title: "ENS gate skipped — off-chain fallback mandate", detail: "set ENS_USER_REGISTRY / ENS_RESOLVER to read the mandate from Sepolia" });
    return;
  }
  const ok = !oc.error && oc.status === "registered" && oc.spendRole && !oc.expired;
  emit({
    runId,
    kind: "ens",
    level: oc.error ? "warn" : ok ? "ok" : "danger",
    title: oc.error
      ? `ENS gate: could not read ${oc.name}`
      : ok
        ? `ENS gate: ${oc.name} holds spend role`
        : `ENS gate: ${oc.name} ${oc.status !== "registered" ? oc.status : oc.expired ? "expired" : "spend role revoked"}`,
    detail: oc.error
      ? oc.error
      : `registry ${oc.registry} · expires ${new Date(oc.expiry * 1000).toISOString()} · perTxMax ${m.perTxMax} · dailyCap ${m.dailyCap} · allowlist ${m.allowlistNames.join(", ") || "—"} · ${oc.latencyMs}ms`,
    data: { onChain: oc, mandate: { perTxMax: m.perTxMax, dailyCap: m.dailyCap, asset: m.asset, network: m.network, allowlistNames: m.allowlistNames, policyHash: policyHash(m) } },
  });
}

function emitCheck(runId: string, c: Check) {
  emit({
    runId,
    kind: "policy",
    level: c.status === "pass" ? "ok" : c.status === "hard_fail" ? "danger" : "warn",
    title: `policy.${c.name}: ${c.status.replace("_", " ")}`,
    detail: c.detail,
    data: { check: c },
  });
}

function levelFor(s: Screening) {
  return s.verdict === "clear" ? "ok" : s.verdict === "flagged" ? "danger" : "warn";
}

/** Layer 2 live screening: payTo, token and the exact authorization, in parallel. */
async function screenWithIntercepta(runId: string, checks: Check[], payer: `0x${string}`, req: PaymentRequirements) {
  const [addr, token, msg] = await Promise.all([
    screenAddress(req.payTo),
    screenToken(req.asset, req.network),
    screenMessage(buildAuthorizationTypedData(payer, req), payer),
  ]);
  checks.push(screeningToCheck("intercepta.address", addr, req.payTo));
  emit({
    runId,
    kind: "screen.address",
    level: levelFor(addr),
    title: `Intercepta ${addr.endpoint}: ${addr.verdict.toUpperCase()}`,
    detail: addr.reasons.join("; ") || `${req.payTo} in ${addr.latencyMs}ms`,
    data: { screening: addr },
  });
  checks.push(screeningToCheck("intercepta.token", token, req.asset));
  emit({
    runId,
    kind: "screen.token",
    level: levelFor(token),
    title: `Intercepta ${token.endpoint}: ${token.verdict.toUpperCase()}`,
    detail: token.reasons.join("; ") || `${req.asset} in ${token.latencyMs}ms`,
    data: { screening: token },
  });
  checks.push(screeningToCheck("intercepta.message", msg, "authorization"));
  emit({
    runId,
    kind: "screen.message",
    level: levelFor(msg),
    title: `Intercepta ${msg.endpoint}: ${msg.verdict.toUpperCase()}`,
    detail: msg.reasons.join("; ") || `payment authorization in ${msg.latencyMs}ms`,
    data: { screening: msg },
  });
}

function screeningToCheck(name: string, s: Screening, subject: string): Check {
  // fail closed: no verdict is not a pass — a human has to look at it
  const status = s.verdict === "flagged" ? "hard_fail" : s.verdict === "clear" ? "pass" : "soft_fail";
  return {
    name,
    status,
    detail:
      s.verdict === "flagged"
        ? `Intercepta flagged ${subject}: ${s.reasons.join("; ") || s.riskLevel || "high risk"}`
        : s.verdict === "clear"
          ? `Intercepta cleared ${subject}${s.riskLevel ? ` (${s.riskLevel})` : ""}`
          : `Intercepta gave no verdict for ${subject} (${s.reasons.join("; ") || "no data"}); escalating to the owner`,
    data: { screening: s },
  };
}

/**
 * The exact EIP-712 TransferWithAuthorization (EIP-3009) the agent is about to
 * sign, mirrored from @x402/evm so Intercepta's Scan Message sees the real thing.
 */
export function buildAuthorizationTypedData(payer: `0x${string}`, req: PaymentRequirements) {
  const now = Math.floor(Date.now() / 1000);
  const chainId = Number(req.network.split(":")[1]);
  return {
    domain: {
      name: String(req.extra?.name ?? "USD Coin"),
      version: String(req.extra?.version ?? "2"),
      chainId,
      verifyingContract: req.asset,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: payer,
      to: req.payTo,
      value: req.amount,
      validAfter: "0",
      validBefore: String(now + req.maxTimeoutSeconds),
      nonce: "0x" + "00".repeat(32),
    },
  };
}
