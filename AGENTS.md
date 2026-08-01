# Repository guidance

## Sources of truth

Read these before changing behavior:

1. `docs/product-spec.md` for product rules.
2. `docs/architecture.md` for system boundaries.
3. `docs/plans/luna-incremental-plan.md` for task IDs and dependency order.

Product and architecture documents win over implementation plans when wording conflicts.

## Workspace boundaries

- `packages/poker-core`: pure deterministic poker logic; no network, database, UI, system clock, or global randomness.
- `packages/protocol`: runtime schemas and inferred transport types; no application imports.
- `packages/lan-discovery`: UDP discovery protocol and Node adapters; no Electron dependency.
- `packages/ui`: reusable responsive React components.
- `packages/test-support`: test-only builders and deterministic fixtures.
- `apps/host`: authoritative room service, transports, scheduling, and persistence.
- `apps/client`: shared browser and Electron renderer UI.
- `apps/desktop`: Electron main process and narrow preload bridge only.

Shared packages must not import from `apps/*`. Domain modules must not import Electron, Fastify, Socket.IO, React, or SQLite.

## Commands

Run from the repository root on Windows PowerShell:

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Change rules

- Execute only one Luna task ID per small-module implementation request.
- Inspect Git status first and preserve unrelated changes.
- Do not commit or push unless the user explicitly authorizes it.
- Do not weaken types, schemas, lint rules, or tests to make a task pass.
- Finish each module with its focused tests plus root `typecheck` and `lint`.
- If product wording is ambiguous enough to change an outcome, stop and update the approved documents before coding.
