@AGENTS.md

# @trinity/ui — CLAUDE.md

Next.js 16 app that is the whole Trinity Guardian demo in one process: the dashboard, the x402 demo sellers, the paying agent, and the Guardian that screens every payment before it is signed. See `README.md` for the pitch, demo script and env var sources.

## Commands (run from `packages/ui`)

```bash
pnpm dev                      # http://localhost:3000
pnpm typecheck && pnpm lint   # the checks to run before committing (typecheck runs `next typegen` first)
pnpm build
pnpm mandate status|revoke|grant|renew <days>|set <key> <value>|setup   # owner CLI for the on-chain mandate
```

Install from the monorepo root (`pnpm install`, pnpm 9, Node 22+). There is no test suite; verify behaviour end to end:

```bash
curl -X POST localhost:3000/api/agent/run -H 'content-type: application/json' -d '{"scenario":"weather","wait":true}'
curl localhost:3000/api/state | jq '.events[] | {kind, title, detail}'
```

Scenario ids: `weather`, `scam-payto`, `over-cap`, `lookalike-token`, `kill-switch` (`lib/agent/scenarios.ts`).

## Architecture

- **Self-contained.** Although `package.json` depends on `@trinity/agent|guardian|seller`, nothing under `app/`, `lib/` or `scripts/` imports them; the UI carries its own Guardian in `lib/guardian/`. Don't assume a change in `packages/guardian` affects this app.
- **Payment flow:** `app/api/agent/run` → `lib/agent/client.ts` (stock `@x402/fetch` client) → seller returns 402 → `onBeforePaymentCreation` hook → `lib/guardian/evaluate.ts` → allow (sign EIP-3009), deny (`{ abort: true }`, no signature ever exists), or ask_human (park on World ID approval).
- **Check order is the product** (documented at the top of `evaluate.ts`): ENS gate (spend role, expiry) → asset → allowlist → Intercepta → per-tx max → daily cap. Hard fails have no per-transaction override; soft fails go to World ID. Keep this order and the hard/soft split when editing.
- **Fail closed.** Missing key, timeout, non-200 or malformed response from Intercepta = "no verdict" → escalate to the owner, never pass.
- **Sellers** are real x402 endpoints in `app/api/services/*/route.ts`, wrapped with `withX402` via `lib/seller/server.ts`.
- **State** lives in `lib/store.ts`: hoisted on `globalThis` (survives HMR) and mirrored to `data/state.json` (gitignored). Live feed is SSE at `app/api/events`.
- **Chains:** payments on Base Sepolia USDC (`eip155:84532`, public facilitator); mandate on Ethereum Sepolia ENSv2 (`payguard.eth` / `momo.payguard.eth`).
- **Config** comes only from env via `lib/config.ts`; copy `.env.example` to `.env.local`.

## Gotchas

- ENSv2: key everything by **labelhash**, never token id (grant/revoke burns and re-mints). Check expiry on the registry, not the resolver (wildcard resolution still returns the parent's records). Resolver roles use `grantSetterRoles`, not `grantRoles`. We use raw viem ABI fragments in `lib/ens/constants.ts` because the published `@ensdomains/ensjs` targets an older ABI.
- The x402 client must keep `.setSpendControls(false)`, otherwise the SDK's $1 cap swallows the over-cap scenario before the Guardian sees it.
- Intercepta risk data is mainnet-only: payTo is screened as-is and Base Sepolia USDC is mapped to its mainnet twin for the token check.
- World ID: the device code and client secret never reach the browser; the dashboard can cancel an approval but never approve it (except with `WORLD_DEV_BYPASS=true` locally).
- Owner routes (`app/api/admin/*`, approval resolution) must call `requireAdmin` from `lib/admin-auth.ts`; open only when `ADMIN_TOKEN` is unset.
- Never commit `.env.local` or private keys. The agent key and the ENS owner key must stay different.
