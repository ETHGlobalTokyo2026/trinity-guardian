import { NextResponse } from "next/server";
import { agentAccount } from "@/lib/agent/wallet";
import { grantSpendRole, revokeSpendRole, renewAgentName, setPolicyRecord } from "@/lib/ens/admin";
import { ownerConfigured } from "@/lib/ens/client";
import { ensConfigured } from "@/lib/ens/names";
import { loadMandate } from "@/lib/policy";
import { emit, newId } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

/** The owner's hand on the on-chain mandate (demo controls). Needs ENS_OWNER_PRIVATE_KEY server-side. */
export async function GET() {
  return NextResponse.json(await loadMandate(agentAccount.address));
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!ensConfigured() || !ownerConfigured()) {
    return NextResponse.json({ error: "ENS registry or owner key not configured" }, { status: 409 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; key?: string; value?: string; days?: number };
  const runId = newId("owner");
  try {
    let tx: `0x${string}`;
    let title: string;
    switch (body.action) {
      case "revoke":
        tx = await revokeSpendRole(agentAccount.address);
        title = "Owner revoked the spend role on chain";
        break;
      case "grant":
        tx = await grantSpendRole(agentAccount.address);
        title = "Owner restored the spend role on chain";
        break;
      case "renew":
        tx = await renewAgentName(Math.floor(Date.now() / 1000) + (body.days ?? 7) * 86400);
        title = `Owner renewed the agent's name for ${body.days ?? 7} days`;
        break;
      case "set-text":
        if (!body.key || body.value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });
        tx = await setPolicyRecord(body.key, body.value);
        title = `Owner set ${body.key} = ${body.value} on chain`;
        break;
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    emit({ runId, kind: "ens", level: body.action === "revoke" ? "danger" : "ok", title, detail: `tx ${tx}`, data: { tx } });
    return NextResponse.json({ ok: true, tx, mandate: await loadMandate(agentAccount.address) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emit({ runId, kind: "error", level: "danger", title: "On-chain mandate update failed", detail: msg.slice(0, 300) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 120;
