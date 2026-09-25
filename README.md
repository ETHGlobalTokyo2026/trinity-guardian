# Trinity Guardian

3-layer trust stack for AI agent payments — **ENS gate → Intercepta checkpoint → World ID approver**
ETHGlobal Tokyo 2026 · specs in [`plan/`](plan/srs.md)

## Workspace layout (pnpm monorepo)

```
packages/
├── agent/       # @trinity/agent — x402 buyer + Guardian gate + events (task-agent)
├── seller/      # @trinity/seller — x402 metered API + /merchants (task-seller)
├── guardian/    # @trinity/guardian — ENS + Intercepta + World ID layers (task-guardian)
└── ui/          # @trinity/ui — Next.js 15 dashboard (task-ui)
contracts/ens/   # ENSv2 deployment for Sepolia (separate infra task)
scripts/         # shared scripts (faucet, deploy helpers)
docs/            # team notes
plan/            # SRS + task files (read-only during build)
```

## Tasks & ownership

| Package | Task file | Branch |
|---|---|---|
| `packages/agent` | `plan/task-agent.md` + `.json` | `feature/agent` |
| `packages/seller` | `plan/task-seller.md` + `.json` | `feature/seller` |
| `packages/guardian` | `plan/task-guardian.md` + `.json` | `feature/guardian` |
| `packages/ui` | `plan/task-ui.md` + `.json` | `feature/ui` |

Git flow: branch from `dev` → PR back into `dev` (never main directly).

## Cross-package contracts

Type contracts live in each package's `src/types.ts` and are the **only** cross-package imports:
- agent → guardian: `checkPolicy()`, `requestApproval()` (`@trinity/guardian`)
- ui → all: `PaymentEvent`, `GuardianVerdict`, `MerchantInfo` (type-only imports)

If you need to change a shared type: coordinate in the PR, update the task file's interface section.
