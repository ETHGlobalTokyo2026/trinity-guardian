# Task: Agent Runtime — x402 buyer with Guardian gate

## Owner / Branch / PR target

- **Owner:** Person 1 (Agent Runtime)
- **Branch:** `feature/agent`
- **PR target:** `dev` (NOT main)

## Scope

### In scope

- x402 buyer via `@x402/fetch` + `ExactEvmScheme` (port from POC `agent.ts`)
- Quote decode from `Payment-Required` header (v2 format: `{ x402Version, resource, accepts[] }`)
- Spend controls SDK ceiling via `spendControls.maxAmountPerPayment`
- `buy()` orchestration: fetch → decode → call Guardian → sign if approved
- Spend accumulator (daily spend tracking, reset at UTC 00:00)
- CLI demo runner (port from POC `demo.ts`)
- Event emission for UI subscription

### Out of scope

- Guardian policy logic (task-guardian)
- Seller/metered API (task-seller)
- UI rendering (task-ui)
- ENS contract deployment
- World ID SDK integration (handled in Guardian)

## Public interface you expose to others

```typescript
// src/agent/types.ts

export interface PaymentRequirements {
  scheme: string;
  network: string;       // CAIP-2, e.g. "eip155:84532"
  amount: string;        // atomic units (USDC 6 decimals)
  asset: string;         // token contract address
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, string>;
}

export interface X402Quote {
  x402Version: number;
  error: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
}

export interface SpendState {
  spendToday: bigint;    // atomic units
  txCount: number;
  window: string;        // ISO date "2026-09-26"
  lastUpdated: Date;
}

export type PaymentEventType =
  | "quote_received"
  | "guardian_checking"
  | "guardian_verdict"
  | "approval_requested"
  | "approval_response"
  | "signing"
  | "paid"
  | "refused";

export interface PaymentEvent {
  type: PaymentEventType;
  timestamp: Date;
  agentName: string;
  resource: string;
  payTo?: string;
  amount?: string;
  asset?: string;
  network?: string;
  verdict?: import("./guardian-types").GuardianVerdict;
  approvalRequested?: boolean;
  approved?: boolean;
  txHash?: string;
  reason?: string;
}

export type PaymentEventHandler = (event: PaymentEvent) => void;

export interface BuyOptions {
  onEvent?: PaymentEventHandler;
}

export interface BuyResult {
  status: "paid" | "refused" | "unexpected";
  payTo?: string;
  amount?: string;
  txHash?: string;
  reason?: string;
  spendState: SpendState;
}
```

```typescript
// src/agent/index.ts

export interface Agent {
  name: string;
  address: string;

  /** Execute a purchase against an x402 resource. Calls Guardian before signing. */
  buy(resource: string, opts?: BuyOptions): Promise<BuyResult>;

  /** Current spend accumulator state. */
  getSpendState(): SpendState;

  /** Subscribe to all payment events from this agent. */
  onPaymentEvent(handler: PaymentEventHandler): () => void;
}

/** Create an agent with the given name and private key. */
export function createAgent(name: string, privateKey: `0x${string}`): Agent;
```

## Dependencies on other tasks

| Dependency | From task | Interface needed | Mock until landed |
|------------|-----------|------------------|-------------------|
| `checkPolicy(reqs, dailySpend): GuardianVerdict` | task-guardian | `GuardianVerdict` with decision + per-layer detail | Hard-code mock: amount > 5M → soft_fail, scam address → hard_fail, else pass |
| `requestApproval(reqs, reasons): Promise<boolean>` | task-guardian | World ID approval flow | Resolve to `false` (auto-deny) |
| Seller endpoint `http://127.0.0.1:4020/*` | task-seller | 402 response with payment header | Port POC seller.ts locally |

## Concrete deliverables

| # | Deliverable | SRS FR |
|---|-------------|--------|
| 1 | `src/agent/index.ts` — `createAgent()` factory | FR-1 |
| 2 | `src/agent/quote.ts` — decode `Payment-Required` header, pick best accept (prefer Base Sepolia) | FR-2, FR-3 |
| 3 | `src/agent/buy.ts` — orchestration: fetch → decode → Guardian → sign | FR-4 |
| 4 | x402 client setup with `ExactEvmScheme` for EIP-3009 signing | FR-5 |
| 5 | `spendControls.maxAmountPerPayment` SDK ceiling ($50) | FR-6 |
| 6 | Spend accumulator with daily reset | FR-15, FR-16 |
| 7 | Event emission (`onPaymentEvent`) for UI to subscribe | FR-50 |
| 8 | `src/cli/demo.ts` — runner for 4 demo scenarios. Act 4 uses `rogue.agents.trinityguard.eth` once Guardian can read its on-chain payment authority | FR-60–FR-63 |
| 9 | Types in `src/agent/types.ts` | — |

## Acceptance criteria

1. **E2E clean payment:** `agent.buy("/weather")` returns `{ status: "paid", txHash: "0x..." }` and spend accumulator increments
2. **E2E block:** `agent.buy("/data")` where payTo is flagged returns `{ status: "refused", reason: "..." }`
3. **Soft fail event:** when amount > perTxMax, emits `guardian_verdict` with `decision: "soft_fail"` before `approval_requested`
4. **Event stream:** UI mock can console.log all events via `onPaymentEvent`
5. **Quote decode:** handles v2 format `{ x402Version, resource, accepts[] }` correctly (no crash on missing fields)
6. **Daily reset:** spend accumulator resets when `window !== today` (ISO UTC date)
7. **Network preference:** picks `eip155:84532` from accepts array when multiple networks offered
8. **Act 4:** waits on Guardian reading the on-chain payment authority for `rogue.agents.trinityguard.eth`. It does not wait on an ENS text record or a built-in `spend` role. Until that read exists, the CLI skips Act 4.

## Git workflow

### Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/agent
```

### Commits

- Atomic commits per deliverable
- Format: `agent: <what changed>`
- Examples:
  - `agent: add createAgent factory with x402 client setup`
  - `agent: implement quote decoder for v2 format`
  - `agent: add spend accumulator with daily reset`

### PR

```bash
git push -u origin feature/agent
gh pr create --base dev --title "feat(agent): x402 buyer with Guardian gate" --body "..."
```

- PR into `dev`, NOT main
- Request review from Guardian owner (to verify interface compatibility)
- Merge after Guardian interface is stable

### Merge rules

- Squash merge preferred
- Delete branch after merge
- Guardian task must agree on `GuardianVerdict` type before merging

---

## Quick start

```bash
# 1. Set up env
export EVM_PRIVATE_KEY="0x..."  # Burner EOA funded with USDC on Base Sepolia
export SELLER_ADDRESS_A="0x..."
export SELLER_ADDRESS_B="0x..."

# 2. Install deps
pnpm install

# 3. Run seller (in separate terminal)
pnpm run seller

# 4. Run demo
pnpm run demo
```

## Reference

- POC: `/Users/coachaek/workspace/momo-assistant/src/ethglobal/japan2026/poc/x402/agent.ts`
- x402 docs: `@x402/fetch`, `@x402/evm`, `@x402/core`
- Network: Base Sepolia (`eip155:84532`)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Facilitator: `https://x402.org/facilitator`
