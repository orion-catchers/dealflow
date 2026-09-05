# How to deploy DealFlow360

Ruchir owns this runbook. No credentials belong in Git. Put secrets in the host's env, GitHub Actions secrets, or a local `.env` that stays untracked.

## What you deploy

One Next.js app. One PostgreSQL 16 database. Prisma migrations run against that database before or during release. Package pins: Prisma 7.10.0, `pg` 8.23.0, Next 16.3.4, Node 24, pnpm 11.3.0.

## Postgres host

Use PostgreSQL 16. Do not use a different major version.

**Local and CI.** Docker Compose (`pnpm db:up`) and the GitHub Actions `postgres:16-alpine` service.

**Shared integration and demo.** Neon (Postgres 16). Create one project, copy the pooled `DATABASE_URL`, and add `?schema=public` for the integration database. Teammates use the same host with `?schema=dev_<name>` so only Ruchir migrates `public`. Neon is the demo host because it does not depend on a cafe Wi-Fi box running Docker.

Railway or a VPS with Postgres 16 is a fallback if Neon is unreachable. The app only needs `DATABASE_URL`. It does not use Supabase Auth.

**Hotspot backup.** Keep a laptop Docker Postgres plus `pnpm db:reset` so the demo can run locally if the hosted database or venue network fails. Do not treat a recording as the live demo.

## Environment

Copy `.env.example` to `.env` locally. On the host, set at least:

- `DATABASE_URL` — Postgres 16 URL. Include `schema=public` on integration.
- `SESSION_SECRET` — `openssl rand -hex 32`. Cookie signing/session hashing. Never commit it.
- `NODE_ENV=production` on the deployed app. Production rejects the `x-dev-actor` header.

## Migrate and seed

Only Ruchir runs migrations against `schema=public`.

```bash
pnpm install --frozen-lockfile
pnpm db:deploy
```

Seed the integration database when you want a clean demo dataset:

```bash
pnpm db:seed
```

`pnpm db:reset` drops the database. Never run it against the shared integration or production URL.

Teammates propose schema changes with a PR that adds a new migration. Do not edit a merged migration. Ruchir reviews and deploys to `public` the same day when possible so other lanes do not drift.

## App host

Any Node 24 host that can run `pnpm build` and `pnpm start` works (Vercel, Fly, Railway, a VPS). The build command is `pnpm build` (`prisma generate && next build`). Start command is `pnpm start`.

Set `DATABASE_URL` and `SESSION_SECRET` on that host. Confirm `/api/auth/login` against a seed account after the first deploy.

## First-run check

1. `pnpm db:deploy` exits 0.
2. `pnpm db:seed` twice exits 0.
3. Log in as `dev@nexa.example` / `password123`.
4. Log in as each of the five roles listed in the README seed table.
5. `GET /api/auth/me` returns the actor.
6. Finance can open invoices after billing routes land.

If login works and invoices 404, auth is up and billing is not. Do not call that a full deploy.
