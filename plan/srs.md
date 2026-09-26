# Trinity Guardian — Software Requirement Specification

**Project:** Trinity Guardian  
**Event:** ETHGlobal Tokyo 2026 (36-hour hackathon)  
**Version:** 1.0  
**Date:** 2026-09-26  

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for **Trinity Guardian**, a 3-layer trust stack that protects AI agent payments before any transaction is signed. The system ensures that agents operating with on-chain wallets cannot spend funds without passing through identity verification, risk screening, and human approval gates.

### 1.2 Scope

Trinity Guardian intercepts x402 payment requests at the Guardian middleware layer and enforces:
1. **ENS identity gate** — on-chain payment authority for `<agent>.agents.trinityguard.eth`. Revoking it stops payment before later layers. The storage mechanism is not a presumed built-in `spend` role and must be verified against the deployed UserRegistry and PermissionedResolver before implementation.
2. **Intercepta checkpoint** — real-time address/token/message screening
3. **World ID human approver** — owner verification for risky or high-value payments

The system targets 4 sponsor prizes totaling $16,500: World ($7,500), ENS ($6,000), Intercepta ($2,000), and Curvegrid ($1,000).

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **x402** | HTTP payment protocol using status 402; agent pays via EIP-3009 signed authorization |
| **Guardian** | Middleware that validates payments against policy before signing |
| **EAC** | ENS Access Control — ENSv2's on-chain role bitmap. This SRS does not assume a built-in role named `spend`. |
| **Mandate** | Payment limits, asset, and destination allowlist stored in Guardian application state, plus a separate on-chain payment authority |
| **Soft fail** | Payment exceeds limits but may proceed with human approval |
| **Hard fail** | Payment rejected outright; no override available |
| **Facilitator** | x402 settlement service that executes EIP-3009 transfers on-chain |
| **Quick-scan** | Intercepta's fast address risk assessment API |

### 1.4 References

| Reference | URL/Location |
|-----------|--------------|
| x402 v2 Protocol | `@x402/fetch`, `@x402/express`, `@x402/evm`, `@x402/core` |
| x402 Facilitator | `https://x402.org/facilitator` |
| ENSv2 Contracts | `ens-contracts` v2 (Permissioned Registry, Resolver, EAC) |
| World ID for Agents | `https://sandbox.auth.world.org` |
| Intercepta API | Base URL TBD — use endpoint paths from the key onboarding docs (quick-scan-address, scan-token, scan-message) |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Working POC | `/src/ethglobal/japan2026/poc/x402/` |
| Idea Document | `/src/ethglobal/japan2026/06-trinity-guardian.md` |

---

## 2. Overall Description

### 2.1 Product Perspective

Trinity Guardian keeps detailed payment policy in Guardian application state and keeps a revocable payment authority on ENSv2. This split enables:
- Trustless kill switch (owner can revoke on chain without middleware cooperation)
- A stop that happens before Intercepta and before signing, even when screening would pass
- Spend limits, asset checks, and destination allowlists that can change without an ENS text-record write

The system wraps the x402 payment flow: when an agent receives a 402 response, Guardian intercepts the signing step to enforce the 3-layer stack.

### 2.2 User Classes

| User Class | Description |
|------------|-------------|
| **Agent Owner** | Human who sets up the agent, defines policy, holds kill switch authority; identified via World ID |
| **Agent Runtime** | TypeScript process executing tasks; holds burner EOA wallet; cannot override Guardian |
| **Merchants** | x402 endpoints receiving payments; may have ENS names with ENSIP-26 records |
| **Judges** | ETHGlobal/sponsor evaluators reviewing integration depth and demo paths |

### 2.3 Constraints

| Constraint | Impact |
|------------|--------|
| 36-hour hackathon | MVP scope; polish limited to demo paths |
| Testnet only | Base Sepolia (eip155:84532) for payments; Sepolia for ENS |
| Sandbox auth | World ID sandbox mode (`sandbox.auth.world.org`) |
| Intercepta API key lead time | Must request key on day 0; may arrive hours later |
| ENSv2 beta | May require fallback to simpler wildcard resolution |

### 2.4 Assumptions

1. Agent burner wallet is pre-funded with USDC on Base Sepolia (faucet available)
2. Intercepta API key will be issued within 6 hours of request
3. World ID sandbox accepts simulator device for demo
4. ENSv2 testnet contracts are deployed and functional on Sepolia
5. Team has 2-3 members with contract/TypeScript coverage

---

## 3. System Architecture

### 3.1 Three-Layer Trust Stack

```
Layer 1 — ENS    : The Gate       (on-chain payment authority)
Layer 2 — Intercepta : The Checkpoint  (real-time screening)
Layer 3 — World ID  : The Approver   (human approval when risky)
```

**Iron rule:** If any layer fails, payment stops. No layer can override another.

### 3.2 Components Diagram

```
┌─────────────┐     buy API call      ┌──────────────────┐
│ AI Agent    │ ────────────────────▶ │ x402 endpoint    │
│ (TS runtime)│ ◀──────────────────── │ (metered service)│
└──────┬──────┘   402 Payment Required└──────────────────┘
       │
       │  before sign — Trinity Guardian (3 layers, sequential)
       ▼
┌──────────────────────────────┐     eth_call     ┌───────────────────┐
│ LAYER 1 · ENS — the gate     │ ◀─────────────── │ ENSv2 on Sepolia  │
│ read payment authority       │                  │ - agents registry │
│ momo.agents.trinityguard.eth │                  │ - address record  │
│ kill switch lives here       │                  │ - revoke TBD      │
└───────┬──────────────────────┘                  └───────────────────┘
        │
        ├─ missing / revoked ─────────▶ REFUSE (kill switch)
        │
        │ authority active
        ▼
┌──────────────────────────────┐   REST API   ┌───────────────────┐
│ LAYER 2 · Intercepta —       │ ◀─────────── │ Intercepta API    │
│ the checkpoint               │              │ - quick-scan-addr │
│ 1. screen payTo address      │              │ - scan-token      │
│ 2. screen token (asset)      │              │ - scan-message    │
│ 3. check caps & allowlist    │              └───────────────────┘
└───────┬──────────────────────┘
        │
        ├─ green + under cap ─▶ agent signs x402 payment ─▶ done
        │
        │ red verdict / over cap
        ▼
┌──────────────────────────────┐  approval   ┌────────────────────┐
│ LAYER 3 · World ID —         │ ◀────────── │ Owner (World App)  │
│ the human approver           │             │ verify on phone    │
│ (sandbox.auth.world.org)     │             │ approve / deny     │
└───────┬──────────────────────┘             └────────────────────┘
        │
        ├─ approve ─▶ agent signs x402 payment (single use)
        │
        └─ deny ─▶ refuse payment + log reason
```

### 3.3 Data Flow — Payment Before Sign

1. Agent makes plain `fetch(url)` → receives 402 with `Payment-Required` header
2. Decode header → extract `payTo`, `amount`, `asset`, `network`
3. **Layer 1 (ENS):** read the on-chain payment authority for `momo.agents.trinityguard.eth`
   - Missing or revoked → REFUSE immediately, before Intercepta or signing
   - Do not read spending limits from ENS
   - The on-chain setter is not specified yet. Do not call a built-in role named `spend` until that call is verified on the deployed contracts
4. **Layer 2 (Intercepta and Guardian policy):**
   - Read `perTxMax`, `dailyCap`, `asset`, and the destination allowlist from Guardian application state
   - `quick-scan-address` on `payTo`
   - `scan-token` on `asset` (detect USDC lookalikes)
   - Compare verdict: green → continue, red → HARD_FAIL
   - Check caps: `amount ≤ perTxMax`, `dailySpend + amount ≤ dailyCap`
   - Out of allowlist or over perTxMax → SOFT_FAIL
5. **Layer 3 (World ID):** On SOFT_FAIL:
   - Request human approval via World ID for Agents
   - Owner verifies identity and sees payment details
   - Approve → proceed once; Deny → REFUSE
6. **Sign:** If all layers pass, call `wrapFetchWithPayment` → EIP-3009 signature → facilitator settles
7. **Log:** Update spend accumulator, record verdict chain in payment log

---

## 4. Functional Requirements

### 4.1 Agent Runtime & x402 Payment

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-1** | Agent MUST use `@x402/fetch` with `wrapFetchWithPayment` for all paid API calls | MUST |
| **FR-2** | Agent MUST decode 402 `Payment-Required` header to extract `payTo`, `amount`, `asset`, `network` | MUST |
| **FR-3** | Agent MUST prefer network `eip155:84532` (Base Sepolia) when multiple options exist | MUST |
| **FR-4** | Agent MUST pass payment requirements to Guardian before signing | MUST |
| **FR-5** | Agent MUST use `@x402/evm` `ExactEvmScheme` for EIP-3009 signing | MUST |
| **FR-6** | Agent SHOULD support `spendControls.maxAmountPerPayment` as SDK-level ceiling | SHOULD |

### 4.2 Guardian Middleware

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-10** | Guardian MUST execute layers in order: ENS → Intercepta → World ID | MUST |
| **FR-11** | Guardian MUST stop at first hard failure; no subsequent layers execute | MUST |
| **FR-12** | Guardian MUST return `{ decision, reasons[] }` for each check | MUST |
| **FR-13** | Guardian MUST implement soft fail → World ID escalation path | MUST |
| **FR-14** | Guardian MUST implement hard fail → immediate refusal with logged reason | MUST |
| **FR-15** | Guardian MUST update spend accumulator after successful payment | MUST |
| **FR-16** | Guardian SHOULD reset spend accumulator daily (UTC 00:00) | SHOULD |

### 4.3 ENS Identity Layer (Layer 1)

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-20** | Guardian MUST read the on-chain payment authority for `[agent].agents.trinityguard.eth` before Intercepta or signing | MUST |
| **FR-21** | Guardian MUST hard-fail when that authority is missing or revoked, and MUST NOT call later layers | MUST |
| **FR-22** | Guardian MUST read `perTxMax`, `dailyCap`, `asset`, and the destination allowlist from Guardian application state, not from ENS text records | MUST |
| **FR-23** | Agent subname MUST be registered under the agents registry: `[agent].agents.trinityguard.eth` (e.g., `momo.agents.trinityguard.eth`) on the ENSv2 Permissioned Registry | MUST |
| **FR-24** | Owner MUST be able to revoke the agent's on-chain payment authority (kill switch — powers Demo Act 4). The transaction is unverified and MUST NOT be assumed to be an ENSv2 role named `spend` | MUST |
| **FR-25** | Subnames SHOULD support expiry dates for time-limited mandates | SHOULD |
| **FR-26** | Guardian SHOULD check counterparty ENS resolution for risk scoring | COULD |
| **FR-27** | Storing a policy contract address in `com.trinityguard.policy` is out of scope | — |

### 4.4 Intercepta Screening (Layer 2)

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-30** | Guardian MUST call Intercepta `quick-scan-address` API for `payTo` | MUST |
| **FR-31** | Guardian MUST call Intercepta `scan-token` API for `asset` address | MUST |
| **FR-32** | Guardian SHOULD call Intercepta `scan-message` API for payment authorization data | SHOULD |
| **FR-33** | Guardian MUST treat Intercepta `red` verdict as hard fail | MUST |
| **FR-34** | Guardian SHOULD treat Intercepta `yellow` verdict as soft fail | SHOULD |
| **FR-35** | Guardian MUST display Intercepta's `reason` in UI and logs | MUST |
| **FR-36** | Guardian MUST NOT use mocked Intercepta data in demo (live API required for prize) | MUST |

**Note:** POC currently mocks Intercepta via `guardian.ts:screen()`. Real build MUST replace with live API calls.

### 4.5 World ID Human Approval (Layer 3)

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-40** | Guardian MUST request World ID verification on soft fail conditions | MUST |
| **FR-41** | Verification request MUST include: payment amount, payTo address, reason for escalation | MUST |
| **FR-42** | Owner MUST be able to approve or deny the request | MUST |
| **FR-43** | Approval MUST be single-use (does not blanket-approve future payments) | MUST |
| **FR-44** | Denial MUST result in hard refusal with logged reason | MUST |
| **FR-45** | Guardian MUST validate World ID proof server-side (backend, not client) | MUST |
| **FR-46** | Guardian MUST demonstrate denied/cancelled path in demo | MUST |
| **FR-47** | Integration MUST use World ID for Agents sandbox (`sandbox.auth.world.org`) | MUST |

**Note:** POC currently mocks World ID via terminal prompt (`demo.ts:askOwner()`). Real build MUST integrate with World sandbox.

### 4.6 Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-50** | Dashboard MUST display live payment feed with status (paid/refused) | MUST |
| **FR-51** | Dashboard MUST show verdict color (green/yellow/red) for each check | MUST |
| **FR-52** | Dashboard MUST show current spend accumulator vs daily cap | SHOULD |
| **FR-53** | Dashboard SHOULD show on-chain payment authority (active/revoked) | SHOULD |
| **FR-54** | Dashboard SHOULD show pending World ID approval requests | SHOULD |
| **FR-55** | Dashboard COULD provide a kill switch button that submits the on-chain revoke once that transaction is specified | COULD |

### 4.7 Demo Scenarios (4 Acts)

| ID | Scenario | Expected Outcome | Priority |
|----|----------|------------------|----------|
| **FR-60** | **Act 1 (Pass):** Agent buys weather API ($0.01), payTo in allowlist | ENS pass → Intercepta green → auto-sign → 200 OK | MUST |
| **FR-61** | **Act 2 (Block):** Agent tries to buy from flagged payTo (scam address) | ENS pass → Intercepta red → HARD_FAIL → refused | MUST |
| **FR-62** | **Act 3 (Cap):** Agent buys compute service ($7.00, exceeds perTxMax $5) | ENS pass → Intercepta green → over cap → World ID request → owner approves/denies | MUST |
| **FR-63** | **Act 4 (Kill Switch):** Owner revokes the agent's on-chain payment authority mid-session; the agent retries | ENS hard-fail before Intercepta, even if screening would have been green | MUST |

### 4.8 Policy split

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-70** | The revocable payment authority MUST live on chain for `[agent].agents.trinityguard.eth`. Its encoding MUST be verified against the deployed UserRegistry and PermissionedResolver before implementation. A shared demo wallet address is not the kill switch | MUST |
| **FR-71** | `perTxMax` and `dailyCap` MUST be stored in Guardian application state | MUST |
| **FR-72** | Allowed asset and destination allowlist MUST be stored in Guardian application state | MUST |
| **FR-73** | Spend accumulator MUST be stored off-chain in middleware (gas constraint) | MUST |
| **FR-74** | An on-chain authority change MUST be visible to Guardian after one confirmation. Guardian-state policy changes apply on the next check | SHOULD |

---

## 5. Non-Functional Requirements

### 5.1 Security

| ID | Requirement | Priority |
|----|-------------|----------|
| **NFR-1** | All verdicts MUST be validated server-side; client data is untrusted | MUST |
| **NFR-2** | Private key MUST be stored in environment variable, never committed | MUST |
| **NFR-3** | World ID proof MUST be verified backend-side before proceeding | MUST |
| **NFR-4** | Intercepta API key MUST be stored server-side only | MUST |
| **NFR-5** | On-chain payment-authority reads MUST query Ethereum Sepolia directly and MUST NOT be served from cache | MUST |

### 5.2 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| **NFR-10** | Layer 1 (ENS check) | < 500ms (single eth_call) |
| **NFR-11** | Layer 2 (Intercepta scan) | < 2s (3 API calls parallel) |
| **NFR-12** | Layer 3 (World ID) | < 60s (human interaction) |
| **NFR-13** | Total pre-sign latency (auto-pass) | < 3s |

### 5.3 Reliability

| ID | Requirement | Priority |
|----|-------------|----------|
| **NFR-20** | System MUST fail closed: no layer failure or timeout may result in an automatic payment (worst case: soft fail → human decides) | MUST |
| **NFR-21** | Intercepta timeout MUST result in soft fail, not pass | SHOULD |
| **NFR-22** | ENS read failure MUST result in hard fail | MUST |

### 5.4 Testability

| ID | Requirement | Priority |
|----|-------------|----------|
| **NFR-30** | All 4 demo scenarios MUST be reproducible on demand | MUST |
| **NFR-31** | Guardian logic MUST be testable without live blockchain (mock providers) | SHOULD |
| **NFR-32** | Each layer MUST have isolated test coverage | SHOULD |

### 5.5 Portability

| ID | Requirement | Priority |
|----|-------------|----------|
| **NFR-40** | System MUST work with any EVM-compatible network supporting EIP-3009 | SHOULD |
| **NFR-41** | ENS layer SHOULD abstract to support future identity systems | COULD |

---

## 6. External Interfaces

### 6.1 x402 Facilitator

| Property | Value |
|----------|-------|
| URL | `https://x402.org/facilitator` |
| Protocol | HTTP REST |
| Purpose | Settle EIP-3009 payment authorizations on-chain |
| Network | `eip155:84532` (Base Sepolia) |

### 6.2 Intercepta REST API

| Endpoint | Purpose |
|----------|---------|
| `POST quick-scan-address` | Fast address risk assessment |
| `POST scan-token` | Token contract verification (detect fakes) |
| `POST scan-message` | Signed message content analysis |

**Headers:** `Authorization: Bearer $INTERCEPTA_API_KEY`

**Note:** Base URL and exact paths TBD — confirm from the key onboarding docs when the key arrives (do not assume).

### 6.3 World ID Sandbox

| Property | Value |
|----------|-------|
| URL | `https://sandbox.auth.world.org` |
| Mode | World ID for Agents (sandbox) |
| Flow | Request → owner verifies → callback → Guardian proceeds |

### 6.4 ENS on Sepolia

| Property | Value |
|----------|-------|
| Network | Sepolia (eip155:11155111) |
| Contracts | ENSv2 Permissioned Registry, Permissioned Resolver |
| Features | Hierarchical names, PermissionedResolver address records, on-chain payment authority (mechanism unverified) |
| Parent domain | `trinityguard.eth` (registered on ENSv2 Sepolia) — agent names follow `[agent].agents.trinityguard.eth` |

**Note:** `trinityguard.eth` is already registered on the ENSv2 Sepolia registrar. The `agents` UserRegistry sits under that name. Demo agent names are `<agent>.agents.trinityguard.eth` (for example `momo.agents.trinityguard.eth`).

### 6.5 USDC on Base Sepolia

| Property | Value |
|----------|-------|
| Address | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Network | Base Sepolia (`eip155:84532`) |
| Faucet | `https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet` |

### 6.6 Environment Variables

| Variable | Description |
|----------|-------------|
| `EVM_PRIVATE_KEY` | Agent burner EOA private key (hex, 0x-prefixed) |
| `INTERCEPTA_API_KEY` | Intercepta API key (request via intercepta.io/ethglobal) |
| `WORLD_APP_ID` | World ID application ID for sandbox |
| `WORLD_ACTION` | World ID action identifier |
| `ENS_SUBNAME` | Agent subname (e.g., `momo.agents.trinityguard.eth`) |
| `SELLER_ADDRESS_A` | Safe merchant address (allowlisted) |
| `SELLER_ADDRESS_B` | Flagged merchant address (for demo block scenario) |
| `PORT` | Seller server port (default: 4020) |

---

## 7. Data Requirements

### 7.1 Policy/Mandate Structure

**On-chain (ENS) — payment authority only:**

| Location | Value |
|----------|-------|
| Name | `<agent>.agents.trinityguard.eth` |
| Payment authority | active or revoked. Encoding is unverified. Not a role named `spend` |
| Address record | ETH address, coin type `60`. Not a kill switch, even when several names share one demo wallet |
| Subname expiry | Unix timestamp copied from the parent name today |

**Guardian application state:**

| Field | Example |
|-------|---------|
| `perTxMax` | `5000000` ($5.00 in USDC base units) |
| `dailyCap` | `50000000` ($50.00) |
| `asset` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Destination allowlist | merchant addresses that may be paid without escalation |

### 7.2 Spend Accumulator (Off-chain)

```typescript
interface SpendAccumulator {
  agent: string;           // agent name/subname
  window: string;          // "2026-09-26" (UTC date)
  totalSpent: bigint;      // sum of successful payments in base units
  txCount: number;         // number of transactions
  lastUpdated: Date;
}
```

### 7.3 Payment Log Entry

```typescript
interface PaymentLog {
  id: string;              // unique payment attempt ID
  timestamp: Date;
  agent: string;
  payTo: string;           // recipient address
  amount: bigint;
  asset: string;           // token contract address
  network: string;         // e.g., "eip155:84532"
  layers: {
    ens: { decision: "pass" | "fail"; roleActive: boolean };
    intercepta: { decision: "pass" | "soft_fail" | "hard_fail"; verdict: string; reason: string };
    worldId: { requested: boolean; approved: boolean | null };
  };
  finalDecision: "paid" | "refused";
  reason?: string;
  txHash?: string;         // if paid
}
```

### 7.4 Verdict Structure

```typescript
interface GuardianVerdict {
  decision: "pass" | "soft_fail" | "hard_fail";
  reasons: string[];
  layer: "ens" | "intercepta" | "worldId";
}
```

---

## 8. Milestones

### 8.1 Timeline (36 hours)

| Hours | Person A (Agent + Screening) | Person B (Contracts/ENS) | Person C (Frontend/Polish) |
|-------|------------------------------|--------------------------|---------------------------|
| 0–2 | Request Intercepta key, register World sandbox, x402 hello world | Set up ENSv2 dev environment | Set up Next.js 15 project |
| 2–10 | x402 buyer loop + Guardian skeleton + cap logic | Deploy Permissioned Registry + Resolver + EAC on Sepolia | Dashboard layout + payment feed component |
| 10–18 | Intercepta live API integration (quick-scan, scan-token) | Read on-chain payment authority; keep limits in Guardian state | Verdict display + spend meter |
| 18–24 | **Integration:** World ID for Agents (request → approval → sign/deny) | **Integration:** Guardian reads on-chain payment authority before sign | **Integration:** Live payment-authority display |
| 24–32 | Demo paths 1-4 end-to-end | Kill switch demo (revoke role, verify block) | Dashboard polish + demo recording prep |
| 32–36 | Buffer + submission | README + debrief (ENS) | Video + debrief (World, Intercepta) |

### 8.2 Integration Milestones

| Milestone | Target Hour | Criteria |
|-----------|-------------|----------|
| M1: x402 E2E | Hour 6 | Agent can buy from seller, payment settles on Base Sepolia |
| M2: Guardian skeleton | Hour 10 | Guardian blocks flagged address (hard-coded), passes clean |
| M3: ENS authority read | Hour 18 | Guardian reads on-chain payment authority before sign |
| M4: Intercepta live | Hour 20 | Guardian calls live Intercepta API, demo shows reason |
| M5: World ID flow | Hour 24 | Soft fail triggers World ID, owner can approve/deny |
| M6: Kill switch | Hour 28 | Owner revokes on-chain payment authority; immediate block before Intercepta |
| M7: Dashboard live | Hour 30 | All 4 scenarios visible in dashboard |
| M8: Submission ready | Hour 36 | Video recorded, README complete, repo public |

---

## 9. Acceptance Criteria per Prize

### 9.1 World ID ($7,500 — Best Use of World ID for Agents)

| Criterion | How Addressed | FRs |
|-----------|---------------|-----|
| "Meaningful action that needs human approval, not simply a login" | Payment authorization is the meaningful action | FR-40, FR-41 |
| "Demonstrate complete journey: request → user completion → validated → protected action" | Soft fail → World request → owner verifies → sign/deny | FR-40–FR-45 |
| "Demonstrate denied/expired/cancelled path" | Demo Act 3 shows deny path; Act 2 shows cancelled | FR-46 |
| "Validate results in secure backend, not client" | World proof verified server-side before signing | FR-45, NFR-1, NFR-3 |
| "Integration debrief" | Prepared from day 1, delivered with submission | N/A |

### 9.2 ENS ($6,000 — Best Use of ENSv2)

| Criterion | How Addressed | FRs |
|-----------|---------------|-----|
| "Central, not cosmetic" | Guardian reads on-chain payment authority before every sign | FR-20, FR-21 |
| Hierarchical names | `<agent>.agents.trinityguard.eth` under the agents UserRegistry | FR-23 |
| Permissioned Registry | Agent subname registration | FR-23 |
| Resolver address records | ETH address for the agent name. Not the spend policy | — |
| On-chain revoke | Kill switch. Mechanism verified before implementation, not a presumed `spend` role | FR-24, FR-70 |
| Use expiring subnames | Agent names can carry the parent expiry | FR-25 |
| Kill switch demo | Demo Act 4: revoke authority → hard-fail before Intercepta | FR-63 |

### 9.3 Intercepta ($2,000 — Safe A2A Payments)

| Criterion | How Addressed | FRs |
|-----------|---------------|-----|
| Live API call before sign | Guardian calls `quick-scan-address`, `scan-token` | FR-30, FR-31, FR-36 |
| Screen mainnet addresses | Use flagged addresses from Intercepta Discord | FR-30 |
| Demo: one pass + one blocked with reason | Demo Act 1 (pass) + Act 2 (blocked, reason shown) | FR-60, FR-61, FR-35 |
| Public repo + README | Delivered with submission | N/A |
| 3-5 lines feedback | Delivered with submission | N/A |

### 9.4 Curvegrid ($1,000 — Best AI Agent Project)

| Criterion | How Addressed | FRs |
|-----------|---------------|-----|
| "Policy-Aware Transaction Agent" | Guardian enforces application policy and the on-chain kill switch | FR-22, FR-70–FR-74 |
| "Spending limits" | perTxMax and dailyCap in Guardian state | FR-22, FR-71 |
| "Approved counterparties" | Allowlist in policy; ENS resolution for trust scoring | FR-26 |
| "Required human approvals" | World ID for soft fail conditions | FR-40–FR-46 |
| "Agent-to-Agent Payments" | x402 flow with EIP-3009 | FR-1–FR-5 |
| Repo + README with 5 headings | 1-sentence summary, MultiBaas (optional), team intro, setup+test, feedback | N/A |

---

## 10. Risks & Fallbacks

| Risk | Likelihood | Impact | Fallback |
|------|------------|--------|----------|
| Scope creep (3 layers vs 2) | Medium | Incomplete demo | Hour 18 checkpoint: if integration not working, cut World ID (fall back to ENS+Intercepta = 2 sponsors) or cut ENS (fall back to idea #1 = World+Intercepta) |
| ENSv2 beta instability | Medium | Can't encode the kill switch | Keep the deployed hierarchy. Block Act 4 until the revoke call is verified on the deployed contracts. Do not invent a `spend` role |
| World sandbox setup difficulty | Medium | No human approval demo | Fall back to IDKit mini app (still eligible for $7,500 IDKit prize) |
| Intercepta key arrives late | Medium | Can't demo screening | Start with x402 + ENS first; plug in screening when key arrives |
| x402 facilitator instability | Low | Payments don't settle | Self-host facilitator on anvil fork |
| Demo day nerves / network issues | Medium | Live demo fails | Pre-record video backup; have local testnet fallback |

---

## 11. Out of Scope

| Item | Reason |
|------|--------|
| Mainnet deployment | Testnet-only for hackathon |
| Production-grade key management | Burner EOA sufficient for demo |
| Multi-agent coordination | Single agent demo scope |
| Mobile app for owner | World App provides approval UX |
| Custom policy contract | Limits live in Guardian state. A policy contract is a stretch goal. The on-chain kill-switch encoding is still to be verified |
| Gas sponsorship | EIP-3009 through facilitator handles gas |
| Real merchant integration | Mock endpoints sufficient for demo |
| Spend accumulator on-chain | Gas cost prohibitive; middleware state acceptable |
| Multi-asset support | USDC on Base Sepolia only |
| Cross-chain payments | Single network (Base Sepolia) |

---

## Appendix A: POC File Mapping

| POC File | Real Build Location | Changes Required |
|----------|---------------------|------------------|
| `agent.ts` | `src/agent/` | Extract Guardian call to separate module |
| `guardian.ts` | `src/guardian/` | Replace mock screen() with Intercepta API; add ENS layer |
| `seller.ts` | `src/seller/` | No changes (demo endpoint) |
| `config.ts` | `src/config/` | Add ENS, World, Intercepta config |
| `types.ts` | `src/types/` | Extend as interfaces grow (payment log, spend accumulator) |
| `demo.ts` | `src/cli/` | Replace terminal prompt with World ID SDK |
| `ui.ts` | `src/dashboard/` | Convert to React components |

## Appendix B: Package Dependencies

```json
{
  "dependencies": {
    "@x402/fetch": "^2.27.0",
    "@x402/express": "^2.27.0",
    "@x402/evm": "^2.27.0",
    "@x402/core": "^2.27.0",
    "viem": "^2.42.0",
    "@ensdomains/ensjs": "verify ENSv2-compatible version at event (v2 beta vs v4)",
    "@worldcoin/idkit": "latest",
    "next": "^15.x",
    "tailwindcss": "^4.x",
    "express": "^5.1.0"
  }
}
```

> x402 versions match the verified POC (`poc/x402/package.json`). ENS SDK version must be confirmed against ENSv2 docs at the event.

---

*End of Software Requirement Specification*
