# Contributing to DealFlow360

## Who owns what

See README ownership table and `AGENTS.md`. Do not overwrite another lane’s screens on `main` while merging. Krishna owns shared UI; Ruchir owns Prisma, lockfile, CI, auth, billing; Atharva owns quotes/governance/health; Harsh owns catalog/fulfillment/reports.

## Branches

- One **lane branch** per owner (example: `harsh/catalog-fulfillment-reports`).
- Feature work that spans the live shell may use a dedicated branch and PR **onto the lane branch**, not necessarily `main`, when the team agrees.
- `main` is integration. Open PRs. Do not force-push `main`.

Commit style: `feat(area): …`, `fix(area): …`, `chore: …`.

## Package manager

CI: **pnpm 11.3.0**, `pnpm install --frozen-lockfile`. Prefer `pnpm-lock.yaml` as the lock of record. Avoid mixing npm/pnpm without team agreement.

## Schema

1. Discuss model changes with Ruchir.
2. Add a **new** Prisma migration (`pnpm db:migrate`).
3. Never rewrite a merged migration.
4. Additive columns/indexes preferred; breaking changes need a data backfill plan.

## Engines

- Do not duplicate pricing, evaluation, or confirmation.
- Quote mutations include `expectedRevision`.
- Money as decimal strings on the API.
- Development adapter: `src/development/` only; never import from production paths.
- Label connection mode LIVE / DEV FIXTURE / error. No silent fallback.

## UI

- Compact light workspace: slate text, white surfaces, restrained teal.
- Use shared tokens/components. Do not add a second theme.
- Root `layout.tsx` mounts `Application` once. Internal routes should not remount a second shell.

## Checks before PR

```bash
pnpm typecheck
pnpm lint
pnpm test
```

CI also: `prisma validate`, `db:deploy`, seed twice, `pnpm build`.

## Docs and memory

- Incomplete Krishna items: `docs/krishna-handoff.md`.
- Dated progress: append to `memory.md` only your entry; never overwrite teammates.
- Architecture/API changes: update the matching `docs/*.md`.

## Secrets

No `.env`, credentials, or production `DATABASE_URL` in Git or screenshots.
