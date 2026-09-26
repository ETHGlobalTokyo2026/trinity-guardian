# Trinity Guardian 🛡️🧬

**Three layers between an AI agent and its wallet: an ENS gate that holds the mandate on chain, an Intercepta checkpoint that screens every x402 payment before it is signed, and a World ID human approver for anything risky. If any layer says no, the money does not move.**

AI agents that pay with x402 sign whatever 402 quote they receive. Nobody checks the destination, nobody can pull the plug, and the "policy" is a config file the agent can talk its way around. Trinity Guardian closes that trust gap, so an owner can hand an agent a wallet and actually sleep.

Built at ETHGlobal Tokyo 2026 for the ENSv2, World ID for Agents, Intercepta, and Curvegrid AI Agent tracks.

## The three layers

```
┌─────────────┐   GET /api/services/…     ┌──────────────────────┐
│  AI agent   │ ────────────────────────▶ │  x402 seller (Next)  │
│ @x402/fetch │ ◀──────────────────────── │  withX402 + facilit. │
└──────┬──────┘   402 Payment Required    └──────────────────────┘
       │ onBeforePaymentCreation  (before any signature exists)
       ▼
┌──────────────────────────────┐  eth_call   ┌─────────────────────────────┐
│ LAYER 1 · ENS — the gate     │ ◀─────────▶ │ ENSv2 on Sepolia            │
│ momo.payguard.eth            │             │ our UserRegistry (EAC)      │
│  spend role held?  (kill sw) │             │   hasRoles(momo, SPEND, ag) │
│  subname expired?            │             │   getExpiry / getStatus     │
│  policy text records         │             │ our PermissionedResolver    │
│  allowlist = ENS names       │             │   com.payguard.*            │
│  counterparty ENSIP-26 recs  │             │   agent-context, endpoint   │
└──────┬───────────────────────┘             └─────────────────────────────┘
       │ no spend role / expired ─▶ REFUSE. No other layer can override this.
       ▼
┌──────────────────────────────┐  live REST  ┌─────────────────────────────┐
│ LAYER 2 · Intercepta —       │ ◀─────────▶ │ quick-scan-address (payTo)  │
│ the checkpoint               │             │ scan-token (real USDC?)     │
│ + mandate numbers            │             │ scan-message (EIP-712 auth) │
└──────┬───────────────────────┘             └─────────────────────────────┘
       ├─ flagged / over daily cap ─▶ REFUSE
       ├─ all green, under caps ────▶ sign EIP-3009 ─▶ facilitator settles
       ▼ unknown payTo / over per-tx max / no verdict
┌──────────────────────────────┐  device     ┌─────────────────────────────┐
│ LAYER 3 · World ID —         │  grant      │ owner in sandbox World App  │
│ the human approver           │ ◀─────────▶ │ proves + approves / denies  │
└──────┬───────────────────────┘             └─────────────────────────────┘
       ├─ approved (ID token validated in backend) ─▶ sign, one-time limit
       └─ denied / expired / cancelled / wrong human ─▶ REFUSE
```

### The mandate lives on chain (ENSv2)

| Part of the mandate | Where | How the Guardian reads it |
|---|---|---|
| Right to spend | EAC role `spend` (nybble 10, a free application bit) on `momo.payguard.eth` in our own `UserRegistry` | `hasRoles(labelhash("momo"), ROLE_SPEND, agent)` before every signature. Revoke = kill switch. |
| Mandate lifetime | Expiring subname | `getExpiry`; ENSv2 bumps the resource version on expiry, so the role vanishes by itself |
| Numbers | Text records `com.payguard.perTxMax`, `dailyCap`, `asset`, `network` on our `PermissionedResolver` | Universal Resolver, wildcard resolution |
| Approved counterparties | `com.payguard.allowlist` = ENS names such as `weather.payguard.eth` | each name is forward-resolved and its ENSIP-26 `agent-context` / `agent-endpoint[web]` read; payTo is matched against names, not bare hex |
| The agent's own identity | ENSIP-26 records on `momo.payguard.eth` | shown on the dashboard, discoverable by other agents |

The spend accumulator (today's total) stays off chain in the middleware: writing every micropayment to Sepolia is not worth the gas. The rules are on chain, the counter is the Guardian's.

### Check order

| # | Layer | Check | Fail type |
|---|---|---|---|
| 1 | ENS | agent name registered, unexpired, holds `spend` | hard: refuse, kill switch |
| 2 | policy | asset and network match the mandate | hard |
| 3 | policy | payTo resolves to an allowlisted ENS name | soft: ask the owner |
| 4 | Intercepta | payTo, token, and the exact EIP-712 authorization | hard if flagged, soft if no verdict |
| 5 | policy | amount ≤ per-tx max | soft |
| 6 | policy | today's spend + amount ≤ daily cap | hard |

A soft fail parks the agent on a promise until the owner answers through World ID. An approval is bound to that one quote. Hard fails have no per-transaction override: the owner edits the mandate on chain.

## Demo (4 minutes, 5 chapters)

Every button on the dashboard is a real x402 endpoint served by this app.

1. **Buy weather data** — `weather.payguard.eth` is in the allowlist, $0.01, Intercepta green, spend role active. Auto-signed, settled on Base Sepolia. Stamp: **PAID**.
2. **payTo is a flagged address** — a real mainnet scam address. Intercepta red, refused before any signature, evidence shown. **REFUSED**.
3. **Amount over per-tx max** — $8 from an allowlisted seller. Held; the owner scans the World ID QR and approves or denies. Deny, cancel, expire, or the wrong human all leave it unsigned.
4. **Lookalike USDC token** — the seller asks to be paid in a token that only looks like USDC. Asset check plus Intercepta scan-token. **REFUSED**.
5. **Kill switch on ENS** — the same weather purchase, everything green, but the owner just revoked the `spend` role on Sepolia (the run does it live and links the tx). Layer 1 refuses before anyone else gets a say. **REFUSED**. "Restore spend role" brings the agent back.

The mandate panel shows the on-chain state live: name, role, expiry, registry and resolver links, allowlist names, and buttons for revoke / restore / renew.

## Setup and test

This package is `@trinity/ui` inside the pnpm monorepo. Requirements: Node 22+, pnpm 9.

```bash
pnpm install                      # at the monorepo root
cd packages/ui
cp .env.example .env.local        # fill in the keys below
pnpm mandate setup                # ~8 Sepolia txs, prints ENS_USER_REGISTRY / ENS_RESOLVER
pnpm dev                          # http://localhost:3000
```

| Variable | Where to get it |
|---|---|
| `AGENT_PRIVATE_KEY` | any burner key; fund it with Base Sepolia USDC at https://faucet.circle.com |
| `ENS_OWNER_PRIVATE_KEY` | any key with a little Sepolia ETH; it registers `payguard.eth` (paid in the free MockUSDC), deploys our registry and resolver, and flips the spend role |
| `ENS_USER_REGISTRY`, `ENS_RESOLVER` | printed by `pnpm mandate setup` |
| `SELLER_ADDRESS` | any address you control; `setup` publishes it as `weather.payguard.eth` |
| `SCAM_PAYTO_ADDRESS` | a flagged mainnet address pinned in the Intercepta Discord channel |
| `LOOKALIKE_USDC_ADDRESS` | any mainnet scam token address |
| `INTERCEPTA_API_KEY` | https://intercepta.io/ethglobal |
| `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET` | register a confidential OIDC client at https://sandbox.auth.world.org/portal |
| `WORLD_OWNER_SUB` | optional: the owner's pairwise `sub`; proofs from anyone else are rejected |
| `WORLD_DEV_BYPASS` | `true` only while you have no sandbox client |
| `ADMIN_TOKEN` | required on any public deployment; the dashboard asks for it before owner actions (revoke, restore, reset, dev bypass) |

Owner CLI for the on-chain mandate:

```bash
pnpm mandate status              # everything the Guardian reads, as JSON
pnpm mandate revoke              # kill switch
pnpm mandate grant               # restore
pnpm mandate renew 7             # extend momo.payguard.eth by 7 days
pnpm mandate set com.payguard.perTxMax 2
```

Terminal run without the UI:

```bash
curl -X POST localhost:3000/api/agent/run -H 'content-type: application/json' -d '{"scenario":"kill-switch","wait":true}'
curl localhost:3000/api/state | jq '.events[] | {kind, title, detail}'
```

Checks: `pnpm typecheck && pnpm lint`

## Where the integrations live

| Concern | File |
|---|---|
| ENSv2 addresses, EAC role bits, ABI fragments | `lib/ens/constants.ts` |
| On-chain mandate reader (role, expiry, text records, ENSIP-26 counterparties) | `lib/guardian/ens.ts` |
| Mandate loader (chain first, static fallback) and hash | `lib/policy.ts` |
| Owner writes: revoke / grant / renew / set records | `lib/ens/admin.ts`, `scripts/ens/mandate.ts`, `app/api/admin/mandate/route.ts` |
| Guardian check order and verdict (all three layers) | `lib/guardian/evaluate.ts` |
| The "before sign" hook on the x402 client, kill-switch pre-step | `lib/agent/client.ts` |
| Intercepta calls (quick-scan-address, scan-token, scan-message) | `lib/guardian/intercepta.ts` |
| World ID for Agents device grant + ID token validation | `lib/guardian/worldid.ts`, `lib/guardian/approval.ts` |
| x402 sellers (weather, premium-model, bulk-data, lookalike) | `app/api/services/*/route.ts` |
| Live feed (SSE) and dashboard | `app/api/events/route.ts`, `components/` |

Stack: Next.js 16, `@x402/*` 2.27, viem 2.56 (ENSv2-aware Universal Resolver on Sepolia), jose, Tailwind 4. Payments run on Base Sepolia USDC through the public x402 facilitator; identity and mandate on Ethereum Sepolia (ENSv2 beta, `sepolia-deployment-2026-09-15`).

## ENSv2: what we used and what we learned

Used: the public ETHRegistrar for `payguard.eth` (commit / reveal, paid in MockUSDC), a `UserRegistry` proxy from the VerifiableFactory as the subname registry (expiring, non-transferable subnames: no `ROLE_CAN_TRANSFER_ADMIN`), a custom application role in the free EAC nybble range, a `PermissionedResolver` proxy with name-based setters for the mandate and ENSIP-26 records, and wildcard resolution through the Universal Resolver.

Notes for the judges and the ENS team:

- Mutable token ids (every grant or revoke burns and mints) mean the Guardian keys everything by labelhash, never by token id. Worth a bold line in the docs.
- Expiry bumping the resource version is elegant: an expired subname loses its roles with no extra transaction. But wildcard fall-through still resolves its text records off the parent, so an expiry check must hit the registry, not the resolver.
- `grantRoles` reverting on the resolver in favour of `grantSetterRoles(setterCalldata, account)` took a while to discover; a one-line hint in the revert message would save every team an hour.
- The npm `@ensdomains/ensjs` is behind the September redeploy (write actions target the May ABI), so we used raw viem ABI fragments. Publishing a tag-aligned ensjs with the deployment would remove most of the friction.
- Registry and resolver EAC bitmaps are numbered independently; a shared enum export would prevent copy-paste mistakes.

## Intercepta: integration notes and feedback

Three live calls run before every signature, in parallel: Quick Scan Address on `payTo`, Scan Token on the quoted asset, and Scan Message on the exact EIP-712 `TransferWithAuthorization` the agent is about to sign. Fail-closed: no key, timeout, non-200 or malformed JSON is "no verdict", which escalates to the owner rather than passing. Because the risk data is mainnet-only, the payTo is screened as-is and Base Sepolia USDC is mapped to its mainnet twin for the token check.

- Time to first call: _fill in once the key arrives_ (the client was written against the OpenAPI JSON embedded in each docs page).
- What confused us: `docs.intercepta.io` does not resolve and `api.intercepta.io` only redirects; the real host is `api.web3antivirus.io`.
- What was missing: a published threshold for `toxicScore` / `traits`; an official allow / warn / block like Scan Token's `action` would be better.
- Scan Message's `messageType` only lists Permit variants; a first-class EIP-3009 `TransferWithAuthorization` type would fit x402 exactly.
- A testnet mode for Scan Token, or a documented testnet-to-mainnet mapping, would remove the twin-address hack.

## World ID for Agents: integration debrief

We use the sandbox IdP's OAuth device-authorization grant. The backend is the confidential client: it POSTs to `/api/v1/device_authorization`, shows the owner `user_code` and a QR of `verification_uri_complete`, and polls `/api/v1/token` honoring `interval`, `slow_down`, and expiry. On 200 it validates the RS256 ID token against the issuer's JWKS (issuer, audience, signature, expiry, `acr` = orb-v3, `auth_time`), optionally checks `sub` against the registered owner, and only then releases the one bound payment. `access_denied`, `expired_token`, `invalid_grant`, a 503, a cancelled request, or a validation failure all leave the payment unsigned. Neither the device code nor the client secret reaches the browser; the dashboard can cancel but never approve.

- Time to first success: _fill in once the sandbox client is registered_. The discovery document, endpoint list and error codes were clear enough to write and probe the whole flow before having credentials.
- Friction: the portal requires an HTTPS redirect URI even for a device-only client, so local development needs a tunnel. The consent screen shows requester and code but not what is being approved, so the payment details live in our UI next to the QR.
- Missing capability: a short human-readable context on a device authorization so the World App shows it, and a webhook or long-poll instead of polling.
- One improvement with the greatest impact: a transaction-context field on the device grant, so the human approves "this exact payment" rather than "this requester".

## Curvegrid: policy-aware transaction agent

Spending limits, approved counterparties, and required human approvals are all enforced before signature and logged with reasons, and in this project they live on chain (ENSv2 role, expiry, and text records) rather than in a config file. MultiBaas was not used.

## Team

Built by manjiro (sc.sivakorn@gmail.com) at ETHGlobal Tokyo 2026.

## Feedback on the tooling

- The x402 v2 client hook `onBeforePaymentCreation` returning `{ abort, reason }` is exactly the seam a firewall needs.
- The x402 SDK's default $1 per-payment cap silently swallowed our over-cap scenario until we disabled `spendControls`; a log line when a requirement is filtered would help.
