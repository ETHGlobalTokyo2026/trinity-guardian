# Task: UI — Dashboard for Trinity Guardian demo

## Owner / Branch / PR target

- **Owner:** Person 4 (UX/UI)
- **Branch:** `feature/ui`
- **PR target:** `dev` (NOT main)

## Scope

### In scope

**The product story the UI must tell:**

1. **Screen 1 — Agent Picker:**
   - Choose which agent acts
   - Agents differ by on-chain payment authority (active vs revoked)
   - Display perTxMax and dailyCap from Guardian application policy, not from ENS text records
   - Selecting agent with revoked role visibly affects later outcomes

2. **Screen 2 — Seller Picker:**
   - Choose merchant to buy from
   - Show metadata: name, description, price
   - **Critical:** spam/scam flagged sellers must be visually distinct BEFORE paying
   - Risk is legible before commitment

3. **Screen 3 — Payment Flow:**
   - Live feed of 3-layer journey
   - ENS gate → Intercepta verdict → caps check
   - Verdict chips: green (pass), yellow (soft_fail), red (hard_fail)
   - Success: paid, tx hash, "settled onchain" badge
   - Failure: refused + reason

4. **Screen 4 — World ID Moment:**
   - Appears when soft_fail occurs
   - Interactive approve/deny panel
   - Shows: amount, payTo, why escalated
   - Deny path is a first-class demo outcome (not an error)
   - Mock UI until World sandbox wired

5. **Persistent Elements:**
   - Spend accumulator meter vs dailyCap
   - Current on-chain payment-authority badge (active/revoked)
   - Payment log history

**Stack:** Next.js 15 + TailwindCSS

### Out of scope

- Agent runtime logic (task-agent)
- Guardian policy logic (task-guardian)
- Seller API logic (task-seller)
- On-chain transactions / wallet signing
- Mobile app

## Public interface you expose to others

The UI **consumes** interfaces from other tasks. It does not expose APIs.

### Types consumed from Agent (task-agent)

```typescript
import type {
  PaymentEvent,
  PaymentEventHandler,
  SpendState,
  BuyResult,
} from "../agent/types";
```

### Types consumed from Guardian (task-guardian)

```typescript
import type {
  GuardianVerdict,
  LayerResult,
  ENSLayerDetails,
  InterceptaLayerDetails,
  CapsLayerDetails,
  WorldIdLayerDetails,
  Decision,
} from "../guardian/types";
```

### Types consumed from Seller (task-seller)

```typescript
import type {
  MerchantInfo,
  EndpointInfo,
  MerchantsResponse,
} from "../seller/types";
```

### Mock fixtures (use until dev branches land)

```typescript
// src/ui/mocks/agent-events.ts
export const mockPaymentEvents: PaymentEvent[] = [
  { type: "quote_received", timestamp: new Date(), agentName: "momo", resource: "/weather", amount: "10000", payTo: "0x..." },
  { type: "guardian_verdict", timestamp: new Date(), agentName: "momo", resource: "/weather", verdict: { decision: "pass", reasons: [], layers: [...] } },
  { type: "paid", timestamp: new Date(), agentName: "momo", resource: "/weather", txHash: "0x..." },
];

// src/ui/mocks/merchants.ts
export const mockMerchants: MerchantInfo[] = [
  { id: "safe", name: "Weather API", address: "0x...", isSpam: false, endpoints: [...] },
  { id: "spam", name: "Premium Data (FLAGGED)", address: "0x...", isSpam: true, spamReason: "Reported rugpull" },
];

// src/ui/mocks/agents.ts
export const mockAgents = [
  { name: "momo", subname: "momo.agents.trinityguard.eth", authorityActive: true, perTxMax: 5000000n, dailyCap: 50000000n },
  { name: "rogue", subname: "rogue.agents.trinityguard.eth", authorityActive: false, perTxMax: 5000000n, dailyCap: 50000000n },
];
```

## Dependencies on other tasks

| Dependency | From task | Interface needed | Mock until landed |
|------------|-----------|------------------|-------------------|
| `PaymentEvent` stream | task-agent | `onPaymentEvent(handler)` | Use mock event fixtures |
| `GuardianVerdict` type | task-guardian | Layer detail types | Use mock verdict fixtures |
| `GET /merchants` | task-seller | `MerchantsResponse` | Use mock merchants array |
| `Agent.buy()` | task-agent | Trigger purchase | Button calls mock handler |
| `guardian.readAuthority()` / `readAppPolicy()` | task-guardian | On-chain authority and Guardian limits | Use mock agents array |

**Key dependency:** dev branch must be mergeable early so UI can build on real data from landed features.

## Concrete deliverables

| # | Deliverable | SRS FR |
|---|-------------|--------|
| 1 | `src/ui/app/page.tsx` — Main dashboard layout | FR-50 |
| 2 | `src/ui/components/AgentPicker.tsx` — Screen 1 | — |
| 3 | `src/ui/components/SellerPicker.tsx` — Screen 2 with spam indication | FR-50 |
| 4 | `src/ui/components/PaymentFlow.tsx` — Screen 3 live feed | FR-50, FR-51 |
| 5 | `src/ui/components/VerdictChip.tsx` — Green/yellow/red verdict display | FR-51 |
| 6 | `src/ui/components/LayerCard.tsx` — Per-layer detail card | FR-51 |
| 7 | `src/ui/components/WorldIdPanel.tsx` — Screen 4 approve/deny | FR-54 |
| 8 | `src/ui/components/SpendMeter.tsx` — Accumulator vs cap | FR-52 |
| 9 | `src/ui/components/RoleBadge.tsx` — Active/revoked indicator | FR-53 |
| 10 | `src/ui/components/PaymentLog.tsx` — History list | FR-50 |
| 11 | `src/ui/hooks/usePaymentEvents.ts` — Subscribe to agent events | — |
| 12 | `src/ui/hooks/useMerchants.ts` — Fetch merchants | — |
| 13 | `src/ui/mocks/*.ts` — Mock fixtures | — |
| 14 | Demo scenario walkthrough works | FR-60, FR-61, FR-62, FR-63 |

## Acceptance criteria

### Screen 1 — Agent Picker

1. Displays 2+ agents with different role states
2. Shows perTxMax and dailyCap from Guardian policy
3. Revoked agent shows a red "REVOKED" payment-authority badge
4. Selecting revoked agent visibly affects payment outcome later

### Screen 2 — Seller Picker

1. Lists all merchants from `/merchants` endpoint
2. Spam-flagged merchant has visual warning (red border, icon, label)
3. Spam reason tooltip shows "Reported rugpull / scam entity"
4. User can see risk BEFORE clicking buy

### Screen 3 — Payment Flow

1. Shows live event feed as payment progresses
2. Each layer has its own card with verdict chip
3. Green chip = pass, yellow = soft_fail, red = hard_fail
4. Success shows tx hash with "Settled onchain" badge
5. Failure shows reason prominently

### Screen 4 — World ID Moment

1. Panel appears when soft_fail occurs
2. Shows: amount, payTo address, escalation reason
3. "Approve" button → payment proceeds
4. "Deny" button → payment refused (this is a valid demo outcome)
5. Works with mock handler until World SDK wired

### Persistent Elements

1. Spend meter shows `$X.XX / $50.00` with progress bar
2. Authority badge shows "ACTIVE" (green) or "REVOKED" (red)
3. Payment log shows history with timestamp, status, amount

### Demo Acts

| Act | User action | Expected UI |
|-----|-------------|-------------|
| 1 | Agent momo → Seller weather → Buy | ENS pass → Intercepta green → paid ✓ |
| 2 | Agent momo → Seller data (spam) → Buy | ENS pass → Intercepta RED → refused |
| 3 | Agent momo → Seller compute ($7) → Buy | soft_fail → World ID panel → approve/deny |
| 4 | Agent rogue (authority revoked) → Any → Buy | ENS hard-fail immediately, before Intercepta |

## Git workflow

### Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/ui
```

### Commits

- Atomic commits per component
- Format: `ui: <what changed>`
- Examples:
  - `ui: add AgentPicker with role state display`
  - `ui: add SellerPicker with spam warning`
  - `ui: add PaymentFlow with verdict chips`

### PR

```bash
git push -u origin feature/ui
gh pr create --base dev --title "feat(ui): Trinity Guardian dashboard" --body "..."
```

- PR into `dev`, NOT main
- Can start with mock fixtures before other branches land
- Update to real imports as features merge to dev

### Merge rules

- Squash merge preferred
- Delete branch after merge
- Should be last to merge (depends on all other tasks for full integration)

---

## Quick start

```bash
# 1. Set up
cd src/ui
pnpm install

# 2. Run dev server
pnpm dev

# 3. Open browser
open http://localhost:3000
```

## Implementation notes

### Project structure

```
src/ui/
├── app/
│   ├── layout.tsx
│   ├── page.tsx           # Main dashboard
│   └── globals.css
├── components/
│   ├── AgentPicker.tsx
│   ├── SellerPicker.tsx
│   ├── PaymentFlow.tsx
│   ├── VerdictChip.tsx
│   ├── LayerCard.tsx
│   ├── WorldIdPanel.tsx
│   ├── SpendMeter.tsx
│   ├── RoleBadge.tsx
│   └── PaymentLog.tsx
├── hooks/
│   ├── usePaymentEvents.ts
│   └── useMerchants.ts
├── mocks/
│   ├── agent-events.ts
│   ├── merchants.ts
│   └── agents.ts
└── types/
    └── index.ts           # Re-export from agent/guardian/seller
```

### VerdictChip component

```tsx
// src/ui/components/VerdictChip.tsx
type VerdictColor = "green" | "yellow" | "red";

const colorMap: Record<Decision, VerdictColor> = {
  pass: "green",
  soft_fail: "yellow",
  hard_fail: "red",
};

const bgMap: Record<VerdictColor, string> = {
  green: "bg-green-100 text-green-800 border-green-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  red: "bg-red-100 text-red-800 border-red-300",
};

export function VerdictChip({ decision }: { decision: Decision }) {
  const color = colorMap[decision];
  return (
    <span className={`px-2 py-1 text-sm font-medium rounded border ${bgMap[color]}`}>
      {decision.toUpperCase().replace("_", " ")}
    </span>
  );
}
```

### SpendMeter component

```tsx
// src/ui/components/SpendMeter.tsx
export function SpendMeter({ spent, cap }: { spent: bigint; cap: bigint }) {
  const pct = Number((spent * 100n) / cap);
  const spentUsd = (Number(spent) / 1e6).toFixed(2);
  const capUsd = (Number(cap) / 1e6).toFixed(2);
  
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span>${spentUsd}</span>
        <span className="text-gray-500">/ ${capUsd}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

### Integration with real events

```tsx
// src/ui/hooks/usePaymentEvents.ts
import { useEffect, useState } from "react";
import type { PaymentEvent } from "../../agent/types";

export function usePaymentEvents(agent: Agent | null) {
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  
  useEffect(() => {
    if (!agent) return;
    const unsub = agent.onPaymentEvent((event) => {
      setEvents((prev) => [...prev, event]);
    });
    return unsub;
  }, [agent]);
  
  return events;
}
```

## Reference

- POC UI: `/Users/coachaek/workspace/momo-assistant/src/ethglobal/japan2026/poc/x402/ui.ts` (CLI, convert to React)
- Next.js 15: `https://nextjs.org/docs`
- TailwindCSS: `https://tailwindcss.com/docs`
- Demo acts: SRS FR-60 through FR-63
