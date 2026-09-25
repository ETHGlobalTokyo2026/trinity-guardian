# Task: Seller — x402 metered API with merchant metadata

## Owner / Branch / PR target

- **Owner:** Person 2 (Seller)
- **Branch:** `feature/seller`
- **PR target:** `dev` (NOT main)

## Scope

### In scope

- Port POC `seller.ts` to real build
- `@x402/express` `paymentMiddleware` setup
- 3 demo endpoints with different pricing and payTo:
  - `/weather` — $0.01, safe merchant (clean demo)
  - `/data` — $0.25, flagged merchant (block demo)
  - `/compute` — $7.00, safe merchant (over-cap demo)
- Facilitator: `https://x402.org/facilitator`
- **New:** `/merchants` endpoint listing available sellers with metadata for UI picker
- Config via env (`SELLER_ADDRESS_A`, `SELLER_ADDRESS_B`, `PORT`)

### Out of scope

- Guardian logic (task-guardian)
- Agent buyer (task-agent)
- UI rendering (task-ui)

## Public interface you expose to others

```typescript
// src/seller/types.ts

export interface MerchantInfo {
  id: string;
  name: string;
  description: string;
  address: string;
  isSpam: boolean;
  spamReason?: string;
  endpoints: EndpointInfo[];
}

export interface EndpointInfo {
  path: string;
  method: "GET" | "POST";
  price: string;           // "$0.01"
  priceUnits: string;      // "10000" (atomic)
  description: string;
}

export interface MerchantsResponse {
  merchants: MerchantInfo[];
}
```

### HTTP Endpoints

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/merchants` | None | `MerchantsResponse` |
| GET | `/weather?city=<city>` | x402 ($0.01) | `{ city, tempC, forecast }` |
| GET | `/data` | x402 ($0.25) | `{ dataset, rows }` |
| GET | `/compute` | x402 ($7.00) | `{ result, model }` |

### x402 402 Response Format

All paid endpoints return HTTP 402 with header:

```
Payment-Required: base64({ x402Version, resource, accepts[] })
```

where `accepts` contains:

```typescript
{
  scheme: "exact",
  price: "$X.XX",
  network: "eip155:84532",
  payTo: "<SELLER_ADDRESS_A or B>"
}
```

## Dependencies on other tasks

| Dependency | From task | Interface needed | Mock until landed |
|------------|-----------|------------------|-------------------|
| None | — | Seller is standalone | — |

The seller is a standalone service. Other tasks depend on it:
- Agent uses `/weather`, `/data`, `/compute` to trigger payments
- UI uses `/merchants` to render seller picker

## Concrete deliverables

| # | Deliverable | SRS FR |
|---|-------------|--------|
| 1 | `src/seller/index.ts` — Express server with paymentMiddleware | — |
| 2 | `src/seller/endpoints.ts` — `/weather`, `/data`, `/compute` handlers | FR-60, FR-61, FR-62 |
| 3 | `src/seller/merchants.ts` — `/merchants` endpoint with metadata | FR-50 (UI needs) |
| 4 | `src/seller/config.ts` — env-based merchant addresses | — |
| 5 | `src/seller/types.ts` — `MerchantInfo`, `EndpointInfo` types | — |
| 6 | Dockerfile / start script | — |

## Acceptance criteria

1. **402 on unpaid:** `curl http://localhost:4020/weather` returns 402 with `Payment-Required` header
2. **Valid header:** decoded header matches x402 v2 schema: `{ x402Version: 2, resource: {...}, accepts: [...] }`
3. **Merchants endpoint:** `GET /merchants` returns JSON with 2 merchants (safe + spam flagged)
4. **Spam flag visible:** spam merchant has `isSpam: true` and `spamReason` set
5. **Prices correct:** weather=$0.01, data=$0.25, compute=$7.00
6. **PayTo correct:** weather/compute → `SELLER_ADDRESS_A`, data → `SELLER_ADDRESS_B`
7. **Network:** all accepts use `eip155:84532` (Base Sepolia)

## Git workflow

### Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/seller
```

### Commits

- Atomic commits per deliverable
- Format: `seller: <what changed>`
- Examples:
  - `seller: port POC seller with paymentMiddleware`
  - `seller: add /merchants endpoint with spam metadata`

### PR

```bash
git push -u origin feature/seller
gh pr create --base dev --title "feat(seller): x402 metered API with merchant metadata" --body "..."
```

- PR into `dev`, NOT main
- This is a dependency for Agent and UI — merge early
- No blocking dependencies

### Merge rules

- Squash merge preferred
- Delete branch after merge
- Should be first to merge (no dependencies)

---

## Quick start

```bash
# 1. Set up env
export SELLER_ADDRESS_A="0x..."   # Safe merchant
export SELLER_ADDRESS_B="0x..."   # Flagged merchant (for block demo)
export PORT=4020

# 2. Run seller
pnpm run seller
```

## Implementation notes

### Merchant metadata structure

```typescript
const merchants: MerchantInfo[] = [
  {
    id: "merchant-safe",
    name: "Weather API",
    description: "Real-time weather data provider",
    address: process.env.SELLER_ADDRESS_A!,
    isSpam: false,
    endpoints: [
      { path: "/weather", method: "GET", price: "$0.01", priceUnits: "10000", description: "Weather forecast" },
      { path: "/compute", method: "GET", price: "$7.00", priceUnits: "7000000", description: "GPU inference" },
    ],
  },
  {
    id: "merchant-spam",
    name: "Premium Data (FLAGGED)",
    description: "Dataset provider — reported as scam",
    address: process.env.SELLER_ADDRESS_B!,
    isSpam: true,
    spamReason: "Reported rugpull / scam entity",
    endpoints: [
      { path: "/data", method: "GET", price: "$0.25", priceUnits: "250000", description: "Premium dataset" },
    ],
  },
];
```

### paymentMiddleware setup

```typescript
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const NETWORK = "eip155:84532";
const FACILITATOR = "https://x402.org/facilitator";

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo: SAFE }],
        description: "Weather data — one call",
        mimeType: "application/json",
      },
      // ... other endpoints
    },
    new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR }))
      .register(NETWORK, new ExactEvmScheme())
  )
);
```

## Reference

- POC: `/Users/coachaek/workspace/momo-assistant/src/ethglobal/japan2026/poc/x402/seller.ts`
- x402 docs: `@x402/express`
- Network: Base Sepolia (`eip155:84532`)
- Facilitator: `https://x402.org/facilitator`
