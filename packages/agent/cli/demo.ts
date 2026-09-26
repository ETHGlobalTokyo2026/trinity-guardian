// CLI demo runner — 4 demo acts (AG-006)
import readline from "node:readline/promises";
import { createAgent } from "../src/index.js";
import type { AskHuman, PaymentEvent } from "../src/types.js";

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
const usdc = (u?: string) => `$${(Number(u ?? 0) / 1e6).toFixed(2)}`;

const banner = (t: string) => console.log(`\n${C.bold(C.cyan(`── ${t}`))}${C.dim("─".repeat(Math.max(1, 60 - t.length)))}`);

// World ID [mock] — Layer 3 until @trinity/guardian lands
const askOwner: AskHuman = async (reqs, reasons) => {
  console.log(`\n${C.yellow("┌── human approval required (World ID [mock]) ──")}`);
  console.log(`│  ${usdc(reqs.amount)} → ${reqs.payTo}`);
  reasons.forEach((r) => console.log(`│  why: ${r}`));
  console.log(C.yellow("└───────────────────────────────────────────────"));
  if (!process.stdin.isTTY) {
    console.log(C.red("  owner (auto, non-interactive): DENY"));
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(C.yellow("  approve / deny > "))).trim().toLowerCase();
  rl.close();
  return a.startsWith("a") || a.startsWith("y");
};

const key = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) {
  console.error("EVM_PRIVATE_KEY required (burner EOA funded with USDC on Base Sepolia)");
  process.exit(1);
}

const agent = await createAgent("momo.agents.trinityguard.eth", key);
agent.onPaymentEvent((e: PaymentEvent) => {
  const t = new Date(e.timestamp).toISOString().slice(11, 23);
  const color = e.type === "paid" ? "green" : e.type === "refused" ? "red" : e.type === "guardian_verdict" ? "cyan" : "dim";
  console.log(`${C.dim(t)} ${C.bold(`[${e.agentName}]`)} ${C[color](e.type)}${e.reason ? C.dim(` — ${e.reason}`) : ""}`);
});

const results = [];

banner("Act 1 — clean payment (auto-pay)");
results.push(await agent.buy("/weather?city=tokyo"));

banner("Act 2 — flagged payTo (hard block)");
results.push(await agent.buy("/data"));

banner("Act 3 — over per-tx cap (human approval)");
results.push(await agent.buy("/compute", { askHuman: askOwner }));

banner("Act 4 — kill switch (rogue agent, spend role revoked [demo policy])");
const rogue = await createAgent("rogue.agents.trinityguard.eth", key);
rogue.onPaymentEvent((e: PaymentEvent) => {
  const t = new Date(e.timestamp).toISOString().slice(11, 23);
  console.log(`${C.dim(t)} ${C.bold(`[${e.agentName}]`)} ${C.red(e.type)}${e.reason ? C.dim(` — ${e.reason}`) : ""}`);
});
results.push(await rogue.buy("/weather?city=tokyo"));

banner("Summary");
results.forEach((r, i) => {
  const tag = r.status === "paid" ? C.green("PAID   ") : r.status === "refused" ? C.red("REFUSED") : C.yellow(r.status);
  console.log(`  #${i + 1} ${tag} ${usdc(r.amount).padEnd(14)} ${C.dim(r.reason?.slice(0, 80) ?? "")}`);
});
const s = agent.getSpendState();
console.log(`\n  spend today: ${C.bold(usdc(s.spendToday.toString()))} across ${s.txCount} tx — dailyCap $50\n`);
