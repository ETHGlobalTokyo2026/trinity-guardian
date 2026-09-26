import { NextResponse } from "next/server";
import { snapshot } from "@/lib/store";
import { loadMandate, policyHash } from "@/lib/policy";
import { scenarios } from "@/lib/agent/scenarios";
import { agentAccount, agentKeyIsEphemeral } from "@/lib/agent/wallet";
import { interceptaConfigured } from "@/lib/guardian/intercepta";
import { worldIdConfigured, worldIdDevBypass } from "@/lib/guardian/worldid";
import { WORLD_ISSUER } from "@/lib/config";
import { ownerConfigured } from "@/lib/ens/client";
import { ensConfigured } from "@/lib/ens/names";
import { adminTokenRequired, isOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const mandate = await loadMandate(agentAccount.address);
  return NextResponse.json({
    ...snapshot({ owner: isOwner(req) }),
    policy: mandate,
    policyHash: policyHash(mandate),
    scenarios,
    agent: { address: agentAccount.address, ephemeralKey: agentKeyIsEphemeral },
    integrations: {
      intercepta: interceptaConfigured(),
      worldId: worldIdConfigured(),
      worldIssuer: WORLD_ISSUER,
      worldDevBypass: worldIdDevBypass(),
      ens: ensConfigured(),
      ensOwnerKey: ownerConfigured(),
      adminTokenRequired: adminTokenRequired(),
    },
  });
}
