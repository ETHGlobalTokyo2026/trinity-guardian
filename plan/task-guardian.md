# Task: Guardian — 3-layer middleware (ENS → Intercepta → World ID)

## Owner / Branch / PR target

- **Owner:** Person 3 (Guardian)
- **Branch:** `feature/guardian`
- **PR target:** `dev` (NOT main)

## Scope

### In scope

- **Layer 1 — ENS (The Gate):**
  - Read EAC `spend` role via `eth_call` (Sepolia)
  - Read text records: `com.trinityguard.perTxMax`, `com.trinityguard.dailyCap`, `com.trinityguard.asset`
  - Kill switch: revoked role → hard fail immediately
  - Agent subname pattern: `[agent].trinityguard.eth`

- **Layer 2 — Intercepta (The Checkpoint):**
  - `quick-scan-address` on payTo (live API)
  - `scan-token` on asset (live API)
  - Verdict mapping: green → pass, red → hard_fail, yellow → soft_fail
  - Display reason in verdict

- **Layer 3 — World ID (The Approver):**
  - Request approval on soft_fail via `sandbox.auth.world.org`
  - Include: amount, payTo, escalation reason
  - Single-use approval (does not blanket-approve)
  - Server-side proof validation
  - Deny path must work (Demo Act 3)

- **Cross-cutting:**
  - Ordered checks: ENS → Intercepta → (caps) → World ID
  - Stop at first hard failure
  - Fail-closed: any error/timeout → soft_fail (never auto-pass)
  - Port POC `guardian.ts` skeleton with pluggable `screen()` providers

### Out of scope

- x402 buyer logic (task-agent)
- Seller endpoints (task-seller)
- UI rendering (task-ui)
- ENS contract deployment (separate infra task)
- Spend accumulator storage (owned by Agent, passed as param)

## Public interface you expose to others

```typescript
// src/guardian/types.ts

export type Decision = "pass" | "soft_fail" | "hard_fail";

export interface LayerResult {
  layer: "ens" | "intercepta" | "caps" | "worldId";
  decision: Decision;
  reason: string;
  details?: Record<string, unknown>;
}

export interface ENSLayerDetails {
  roleActive: boolean;
  perTxMax: bigint;
  dailyCap: bigint;
  allowedAsset: string;
  subname: string;
}

export interface InterceptaLayerDetails {
  addressVerdict: "green" | "yellow" | "red";
  addressReason: string;
  tokenVerdict: "green" | "yellow" | "red";
  tokenReason: string;
}

export interface CapsLayerDetails {
  amount: bigint;
  perTxMax: bigint;
  dailySpend: bigint;
  dailyCap: bigint;
  overPerTx: boolean;
  overDaily: boolean;
}

export interface WorldIdLayerDetails {
  requested: boolean;
  approved: boolean | null;
  proofValidated: boolean;
}

export interface GuardianVerdict {
  decision: Decision;
  reasons: string[];
  layers: LayerResult[];
  ens?: ENSLayerDetails;
  intercepta?: InterceptaLayerDetails;
  caps?: CapsLayerDetails;
  worldId?: WorldIdLayerDetails;
}

export interface PolicyFromENS {
  roleActive: boolean;
  perTxMax: bigint;
  dailyCap: bigint;
  allowedAsset: string;
}
```

```typescript
// src/guardian/index.ts

import type { PaymentRequirements } from "../agent/types";
import type { GuardianVerdict, PolicyFromENS } from "./types";

export interface Guardian {
  /**
   * Check policy against 3 layers. Returns verdict with per-layer detail.
   * Agent passes dailySpend so Guardian can check caps.
   */
  checkPolicy(
    reqs: PaymentRequirements,
    dailySpend: bigint
  ): Promise<GuardianVerdict>;

  /**
   * Request World ID approval for soft_fail. Returns true if approved.
   * Called by Agent when checkPolicy returns soft_fail.
   */
  requestApproval(
    reqs: PaymentRequirements,
    reasons: string[]
  ): Promise<boolean>;

  /**
   * Read policy from ENS without running full check.
   * Useful for UI to display current limits.
   */
  readPolicy(agentSubname: string): Promise<PolicyFromENS>;
}

export function createGuardian(config: GuardianConfig): Guardian;

export interface GuardianConfig {
  ensRpcUrl: string;          // Sepolia RPC
  interceptaApiKey: string;
  interceptaBaseUrl: string;
  worldAppId: string;
  worldAction: string;
  agentSubname: string;       // e.g., "momo.trinityguard.eth"
}
```

## Dependencies on other tasks

| Dependency | From task | Interface needed | Mock until landed |
|------------|-----------|------------------|-------------------|
| `PaymentRequirements` type | task-agent | Import type | Copy type locally |
| ENS contracts deployed | infra | Contract addresses on Sepolia | Use hardcoded test subname with mock read |
| Intercepta API key | external | Bearer token | Request on day 0; mock with POC blocklist until arrives |
| World ID app | external | App ID + action | Register on sandbox.auth.world.org day 0 |

## Concrete deliverables

| # | Deliverable | SRS FR |
|---|-------------|--------|
| 1 | `src/guardian/index.ts` — `createGuardian()` factory | FR-10 |
| 2 | `src/guardian/ens.ts` — Layer 1: EAC role + text record reader | FR-20, FR-21, FR-22, FR-23 |
| 3 | `src/guardian/intercepta.ts` — Layer 2: `quick-scan-address`, `scan-token` | FR-30, FR-31, FR-32 |
| 4 | `src/guardian/caps.ts` — Cap checks (perTxMax, dailyCap) | FR-22, FR-71 |
| 5 | `src/guardian/worldid.ts` — Layer 3: approval request + proof validation | FR-40, FR-41, FR-42, FR-43, FR-44, FR-45 |
| 6 | `src/guardian/check.ts` — Ordered pipeline: ENS → Intercepta → caps → WorldID | FR-10, FR-11, FR-12 |
| 7 | `src/guardian/types.ts` — All verdict/layer types | FR-12 |
| 8 | Hard fail on red verdict | FR-33 |
| 9 | Soft fail on yellow verdict | FR-34 |
| 10 | Fail-closed on error/timeout | NFR-20, NFR-21, NFR-22 |
| 11 | Display Intercepta reason | FR-35 |
| 12 | No mocked Intercepta in demo | FR-36 |
| 13 | Denied/cancelled path works | FR-46 |

## Acceptance criteria

1. **Layer 1 — ENS gate:**
   - `checkPolicy()` returns `hard_fail` immediately when `spend` role is revoked
   - Reads `perTxMax`, `dailyCap`, `asset` from text records
   - Demo Act 4: kill switch blocks payment that would otherwise pass

2. **Layer 2 — Intercepta:**
   - Calls live `quick-scan-address` API (no mock in final build)
   - Red verdict → `hard_fail` with reason visible
   - Demo Act 2: flagged address is blocked

3. **Layer 2 — Caps:**
   - Amount > perTxMax → `soft_fail`
   - dailySpend + amount > dailyCap → `hard_fail`
   - Demo Act 3: $7.00 triggers soft_fail (perTxMax $5)

4. **Layer 3 — World ID:**
   - Soft_fail triggers `requestApproval()`
   - Owner can approve or deny
   - Denial returns false, payment refused
   - Approval returns true, single-use

5. **Ordered execution:**
   - Layers run in order: ENS → Intercepta → caps → WorldID
   - Stop at first hard_fail (subsequent layers don't run)

6. **Fail-closed:**
   - Intercepta timeout → `soft_fail` (not pass)
   - ENS read failure → `hard_fail`

## Git workflow

### Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/guardian
```

### Commits

- Atomic commits per deliverable
- Format: `guardian: <what changed>`
- Examples:
  - `guardian: add ENS layer with EAC role check`
  - `guardian: integrate live Intercepta API`
  - `guardian: add World ID approval flow`

### PR

```bash
git push -u origin feature/guardian
gh pr create --base dev --title "feat(guardian): 3-layer trust stack (ENS → Intercepta → World ID)" --body "..."
```

- PR into `dev`, NOT main
- Coordinate with Agent owner on `GuardianVerdict` type stability
- Coordinate with UI owner on layer detail types for rendering

### Merge rules

- Squash merge preferred
- Delete branch after merge
- `GuardianVerdict` type must be stable before Agent merges

---

## Environment variables

```bash
# ENS (Layer 1)
ENS_RPC_URL="https://rpc.sepolia.org"
ENS_SUBNAME="momo.trinityguard.eth"

# Intercepta (Layer 2)
INTERCEPTA_API_KEY="..."
INTERCEPTA_BASE_URL="..."  # TBD from key onboarding docs

# World ID (Layer 3)
WORLD_APP_ID="..."
WORLD_ACTION="..."
```

## Implementation notes

### ENS Layer

```typescript
// src/guardian/ens.ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

async function readEACRole(subname: string): Promise<boolean> {
  // eth_call to EAC contract: hasRole(subname, "spend")
}

async function readTextRecord(subname: string, key: string): Promise<string> {
  // eth_call to resolver: text(namehash(subname), key)
}
```

### Intercepta Layer

```typescript
// src/guardian/intercepta.ts
async function quickScanAddress(address: string): Promise<{ verdict: string; reason: string }> {
  const res = await fetch(`${baseUrl}/quick-scan-address`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res.json();
}
```

### World ID Layer

```typescript
// src/guardian/worldid.ts
// Use @worldcoin/idkit for sandbox flow
// Server-side proof validation via sandbox.auth.world.org/verify
```

### Ordered pipeline

```typescript
// src/guardian/check.ts
async function checkPolicy(reqs: PaymentRequirements, dailySpend: bigint): Promise<GuardianVerdict> {
  const layers: LayerResult[] = [];
  
  // Layer 1: ENS
  const ens = await checkENS(reqs);
  layers.push(ens);
  if (ens.decision === "hard_fail") return finalize("hard_fail", layers);
  
  // Layer 2: Intercepta
  const intercepta = await checkIntercepta(reqs);
  layers.push(intercepta);
  if (intercepta.decision === "hard_fail") return finalize("hard_fail", layers);
  
  // Layer 2b: Caps
  const caps = checkCaps(reqs, dailySpend, policy);
  layers.push(caps);
  if (caps.decision === "hard_fail") return finalize("hard_fail", layers);
  if (caps.decision === "soft_fail" || intercepta.decision === "soft_fail") {
    return finalize("soft_fail", layers);
  }
  
  return finalize("pass", layers);
}
```

## Reference

- POC: `/Users/coachaek/workspace/momo-assistant/src/ethglobal/japan2026/poc/x402/guardian.ts`
- ENS Sepolia: `eip155:11155111`
- World ID sandbox: `https://sandbox.auth.world.org`
- Intercepta: Base URL TBD (check onboarding docs when key arrives)
