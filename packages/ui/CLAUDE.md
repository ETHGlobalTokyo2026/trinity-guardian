@AGENTS.md

# @trinity/ui — CLAUDE.md

Next.js 16 app that is the whole Trinity Guardian demo in one process: the dashboard, the x402 demo sellers, the paying agent, and the Guardian that screens every payment before it is signed. See `README.md` for the pitch, demo script and env var sources.

## Commands (run from `packages/ui`)

```bash
pnpm dev                      # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test   # run before committing (typecheck runs `next typegen` first)
pnpm build
pnpm mandate status|revoke|grant|renew <days>|set <key> <value>|setup   # owner CLI for the on-chain mandate
```

Install from the monorepo root (`pnpm install`, **pnpm 11** via corepack, Node 22+). Never use yarn: the pinned `packageManager` makes yarn refuse to run. pnpm 11 enforces `minimumReleaseAge` and `allowBuilds` (see `pnpm-workspace.yaml`); a new dependency younger than a day fails install.

`pnpm test` covers the World ID approval backend (`test/approval.test.ts`). Everything else is verified end to end:

```bash
curl -X POST localhost:3000/api/agent/run -H 'content-type: application/json' -d '{"scenario":"weather","wait":true}'
curl localhost:3000/api/state | jq '.events[] | {kind, title, detail}'
```

Scenario ids: `weather`, `scam-payto`, `over-cap`, `lookalike-token`, `kill-switch` (`lib/agent/scenarios.ts`).

## Architecture

- **Self-contained.** Although `package.json` depends on `@trinity/agent|guardian|seller`, nothing under `app/`, `lib/` or `scripts/` imports them; the UI carries its own Guardian in `lib/guardian/`. Don't assume a change in `packages/guardian` affects this app.
- **Payment flow:** `app/api/agent/run` → `lib/agent/client.ts` (stock `@x402/fetch` client) → seller returns 402 → `onBeforePaymentCreation` hook → `lib/guardian/evaluate.ts` → allow (sign EIP-3009), deny (`{ abort: true }`, no signature ever exists), or ask_human (park on World ID approval).
- **Check order is the product** (documented at the top of `evaluate.ts`): ENS gate (spend role, expiry) → asset → allowlist → Intercepta → per-tx max → daily cap. Hard fails have no per-transaction override; soft fails go to World ID. Keep this order and the hard/soft split when editing.
- **Intercepta is opt-in.** Only `INTERCEPTA_ENABLED=true` runs Layer 2 screening; otherwise it is recorded as a `skipped` check and never escalates.
- **Fail closed (when enabled).** Missing key, timeout, non-200 or malformed response from Intercepta = "no verdict" → escalate to the owner, never pass.
- **Sellers** are real x402 endpoints in `app/api/services/*/route.ts`, wrapped with `withX402` via `lib/seller/server.ts`.
- **State** lives in `lib/store.ts`: hoisted on `globalThis` (survives HMR) and mirrored to `data/state.json` (gitignored). Live feed is SSE at `app/api/events`.
- **Chains:** payments on Base Sepolia USDC (`eip155:84532`, public facilitator); mandate on Ethereum Sepolia ENSv2 (`payguard.eth` / `momo.payguard.eth`).
- **Config** comes only from env via `lib/config.ts`; copy `.env.example` to `.env.local`. Read env with `envOr(name, fallback)` from `lib/env.ts`, never `process.env.X ?? fallback`: a blank value on the host would slip through `??` (this broke a build once with x402 network `""`). `X402_NETWORK` must be CAIP-2 (`eip155:<id>`) and `WORLD_ENVIRONMENT` one of `production|staging|sandbox`; both fail fast otherwise.
- **Display:** show chain names via `networkName()` from `lib/chains.ts`, never a raw CAIP-2 id; amounts always carry their unit (`8 USDC`).

## Gotchas

- ENSv2: key everything by **labelhash**, never token id (grant/revoke burns and re-mints). Check expiry on the registry, not the resolver (wildcard resolution still returns the parent's records). Resolver roles use `grantSetterRoles`, not `grantRoles`. We use raw viem ABI fragments in `lib/ens/constants.ts` because the published `@ensdomains/ensjs` targets an older ABI.
- The x402 client must keep `.setSpendControls(false)`, otherwise the SDK's $1 cap swallows the over-cap scenario before the Guardian sees it.
- Intercepta risk data is mainnet-only: payTo is screened as-is and Base Sepolia USDC is mapped to its mainnet twin for the token check.
- World ID (IDKit, `docs/worldid-connect.md`): needs `NEXT_PUBLIC_WORLD_APP_ID`, `NEXT_PUBLIC_WORLD_RP_ID`, `WORLD_ACTION` and `RP_SIGNING_KEY` (server only, never `NEXT_PUBLIC_`); `WORLD_ENVIRONMENT` defaults to `production` and must match the app. The widget calls `POST /api/approvals/:id {action:"launch"}` on click for a freshly signed RP context, then sends the raw IDKit result as `{action:"proof"}`. The `signal` binds the proof to that exact payment: never drop it from `proofOfHuman({ signal })`. The browser can cancel but never approve or consume; there is no dev bypass.
- Known gaps in the approval API: any orb-verified human can approve (no owner nullifier check), and `cancel` / `consume` / bad proofs on `POST /api/approvals/:id` need no owner token. Don't widen these; fix them if you touch that route.
- Owner routes (`app/api/admin/*`) must call `requireAdmin` from `lib/admin-auth.ts`; open only when `ADMIN_TOKEN` is unset.
- Never commit `.env.local` or private keys. The agent key and the ENS owner key must stay different.

## Deployment (EC2)

Deployed on our own EC2 instance, **not Vercel / serverless**. `lib/store.ts` keeps the event feed, spend ledger and pending approvals in process memory (mirrored to `data/state.json`), so the app must run as **one long-lived process**:

- `pnpm build && pnpm start` (or PM2 with a single instance). No PM2 cluster mode / `-i max`: separate processes don't share state, the SSE feed misses runs, and World ID proofs hit "approval not found".
- Behind nginx, `/api/events` is SSE: `proxy_buffering off`, `proxy_http_version 1.1`, `proxy_set_header Connection ""`, a long `proxy_read_timeout`.
- Set `ADMIN_TOKEN` on the public host. `APP_BASE_URL=http://localhost:3000` is enough for the in-app agent to reach its own sellers.
- `data/state.json` lives in `packages/ui/data/` (gitignored); it survives `git pull` + restart, not a wiped checkout.
- Don't reach for Vercel KV / Redis fixes unless the deployment target changes.

