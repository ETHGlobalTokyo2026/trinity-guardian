# Recheck — plan vs code on `dev`

**Date:** 2026-09-26  
**Code compared:** `dev` application tree at `87424e3`, which this branch does not change  
**Plan:** hybrid PRD on `docs/hybrid-ens-prd`

This file records the chosen plan and what the merged code still does. It does not change contracts.

## Decision

Hybrid policy, written into `plan/srs.md` and the guardian, UI, and agent task files:

- Agent names are `<agent>.agents.trinityguard.eth`.
- `perTxMax`, `dailyCap`, `asset`, destination allowlist, World ID, and Intercepta stay in Guardian application state. FR-20–FR-22 and FR-70–FR-72 no longer require ENS text records.
- FR-24 and FR-63 still require an on-chain revoke. Guardian hard-denies before Intercepta and before x402 signing.
- That revoke is not a built-in ENSv2 role named `spend`. The encoding must be verified on the deployed UserRegistry and PermissionedResolver before any contract call is written.
- `rogue.agents.trinityguard.eth` is the revoked demo identity in the PRD. The shared demo wallet is not the kill switch.

## Result

The parent name and the `<agent>.agents.trinityguard.eth` shape now match the plan and the code. The on-chain kill switch does not exist yet. Limits in the running agent are still mock constants, not Guardian state.

`momo.agents.trinityguard.eth` and `rogue.agents.trinityguard.eth` are both expected to resolve to the same demo wallet as `shopping`, `research`, and `travel`. Nothing in the ENS scripts marks `rogue` as revoked.

Payments stay on Base Sepolia (`eip155:84532`). ENS stays on Ethereum Sepolia (chain ID `11155111`). The ENS package is not a Base Sepolia deployment.

`packages/guardian` is still a stub. The agent gates payments with an in-memory mock. Demo Act 4 is skipped.

## Deployed ENS namespace

`packages/guardian-ens/scripts/check-ens.ts` resolves these names and requires each one to equal `0x9A8F6F3fc819BEE96f0a76bAA4afa424c10c4B11`:

```text
trinityguard.eth
└── agents.trinityguard.eth
    ├── shopping.agents.trinityguard.eth
    ├── research.agents.trinityguard.eth
    ├── travel.agents.trinityguard.eth
    ├── momo.agents.trinityguard.eth
    └── rogue.agents.trinityguard.eth
```

| Contract | Address |
| --- | --- |
| ENSv2 ETHRegistry | `0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E` |
| Root UserRegistry | `0xa92262dFC37E9D855b5ffeCe34284ceb998C3EA7` |
| `agents` UserRegistry | `0x5B115dAFCeEcBe5d77506b1Ec8B0A017B7357174` |
| PermissionedResolver | `0xf23345070E24cb42E0A87323F75b84a34d9D33f6` |
| Demo/test wallet on all five address records | `0x9A8F6F3fc819BEE96f0a76bAA4afa424c10c4B11` |

The last row is one shared demo wallet. `rogue` is not a separate revoked identity on chain.

Leaf registration sets the ENS role bitmap to `0`. The resolver record is an ETH address (coin type `60`) via `setAddress`. No script writes `com.trinityguard.*` text records or an EAC role named `spend`.

`ens:setup-resolution` defaults to `shopping`, `research`, and `travel`. Extra labels are CLI arguments (`pnpm ens:setup-resolution momo rogue`). That command still only attaches the PermissionedResolver and writes the signer address. It does not write a payment-authority bit.

`trinityguardian.eth` remains only in `scripts/register-shopping.ts` and one usage string in `scripts/deploy-user-registry.ts`. It is not the live namespace.

## Plan vs code

| Topic | Chosen plan | Code (unchanged on this branch) |
| --- | --- | --- |
| Agent name | `momo.agents.trinityguard.eth`, `rogue.agents.trinityguard.eth` (FR-23) | Same five names, including shopping, research, and travel |
| What ENS stores | Name, address record, and a revocable payment authority whose encoding is still unverified (FR-70) | ETH address record only. Leaf role bitmap `0` |
| Kill switch (Act 4, FR-24, FR-63) | On-chain revoke → Guardian hard-fail before Intercepta. Not a role named `spend` | Not implemented. `packages/agent/cli/demo.ts` skips Act 4. `rogue` resolves to the same address as `momo` |
| Limits | Guardian application state (FR-22, FR-71, FR-72) | Agent mock constants: per-tx `$5` (`5_000_000n`), daily `$50` (`50_000_000n`) |
| Flagged merchant | Live Intercepta `quick-scan-address` | `SELLER_ADDRESS_B` set membership in `packages/agent/src/index.ts`. Seller marks that address `isSpam: true` in `/merchants` |
| World ID | `sandbox.auth.world.org`, server-side proof | CLI prompt labeled `World ID [mock]` |
| Guardian package | `createGuardian`, `checkPolicy`, `readAuthority`, `readAppPolicy`, `requestApproval` | `packages/guardian/src/index.ts` and `types.ts` are comments only. GU-001–GU-006 stay `passes: false` |
| UI | Agent picker shows authority and Guardian limits | `packages/ui` has `package.json` only. UI-001–UI-007 stay `passes: false` |
| ENS registration network | `trinityguard.eth` is already on the ENSv2 Sepolia registrar | Matches |
| Name expiry | SHOULD support expiring mandates (FR-25) | Child expiry is copied from the parent name. There is no per-agent mandate expiry API |

## Story status already on `dev`

From `plan/task-*.json` at `0ab2fe0`, still accurate against the tree at `87424e3`:

| Track | Branch in the plan | Status |
| --- | --- | --- |
| Seller | `feature/seller` | SE-001–SE-004 `passes: true`. Express seller on Base Sepolia: `/weather` $0.01, `/data` $0.25, `/compute` $7.00, plus `GET /merchants` |
| Agent | `feature/agent` | AG-001–AG-005 `passes: true`. AG-006 `passes: false` because Act 4 is skipped |
| ENS package | `feat/guardian-ens` | Merged through PR #6. `ens:check` covers five names. Policy reads do not exist |
| Guardian | `feature/guardian` | Not started. GU-001–GU-006 `passes: false` |
| UI | `feature/ui` | Not started. UI-001–UI-007 `passes: false` |

`packages/agent` does not import `@trinity-guardian/ens` or `@trinity/guardian`. `mockCheckPolicy` is the gate inside `createAgent`. The agent name passed to `createAgent("momo", key)` is a local string. It is not resolved from ENS.

## ENS calls the plan sketches, and what the deployment accepts

`plan/task-guardian.md` no longer sketches `hasRole(subname, "spend")` or `text(namehash, key)`. Those calls are explicitly not the plan. They are also not in this repo.

The deployed scripts use:

| Action | Call that works in this deployment |
| --- | --- |
| Label id | `uint256(keccak256(bytes(label)))` |
| Current token id | `getTokenId(rawLabelId)` on the UserRegistry |
| Attach resolver | `setResolver(tokenId, resolver)` — the token id, not the raw label id |
| Read resolver | `getResolver(string label)` |
| Write ETH address | `setAddress(dnsEncodedName, 60, raw20ByteAddress)` on the PermissionedResolver |
| Resolve | viem `getEnsAddress({ name })` on Ethereum Sepolia |

`setSubregistry` in the attach scripts passes the raw label id. `setResolver` does not.

PermissionedResolver initializer selector in `scripts/deploy-permissioned-resolver.ts` is `0x33cc44a0` for `initialize((address,uint256)[], bytes[])`.

## Working tree note

HEAD `packages/guardian-ens/README.md` (commit `78684b6`) documents five names, including `momo` and `rogue`, and the `ens:setup-resolution <label...>` arguments.

The uncommitted README in the working tree describes only `shopping`, `research`, and `travel`, and says setup takes no arguments. That does not match `scripts/check-ens.ts` or `scripts/setup-agent-resolution.ts` on this same tree. This recheck follows the scripts.

## What can be reused without another deploy

- Resolve `<label>.agents.trinityguard.eth` with `createEnsClient` / `getEnsAddress`.
- Register another leaf with `pnpm ens:register-agent <label>` on the agents UserRegistry. Role bitmap stays `0`.
- Publish an address for that label with `pnpm ens:setup-resolution <label>`. The value written is the `PRIVATE_KEY` address, coin type `60`.
- Treat the five current address records as one shared demo wallet. `rogue` does not encode a revoked agent.

## What the chosen plan still needs from the chain

1. A verified read and revoke for on-chain payment authority. Not a role named `spend`, and not the shared demo address.
2. A difference between `momo` and `rogue`. Both names currently share the demo address and a zero role bitmap.
3. Guardian application state for `perTxMax`, `dailyCap`, `asset`, and the destination allowlist. That state is not on ENS and is not implemented yet.

Until the authority read exists, Act 4 cannot run against this deployment. `readAppPolicy()` is an application read, not an ENS text-record read.

## Closed choice

The open choice in the earlier recheck is closed. The PRD on this branch is the hybrid above. Guardian implementation should follow that PRD and should not invent the revoke ABI. The agent mock can stay until `checkPolicy` exists.
