# How to deploy DealFlow360

Ruchir owns this runbook. No credentials belong in Git. Put secrets in the host's env, GitHub Actions secrets, or a local `.env` that stays untracked.

## What you deploy

One Next.js app. One PostgreSQL 16 database. Prisma migrations run against that database before or during release. Package pins: Prisma 7.10.0, `pg` 8.23.0, Next 16.3.4, Node 24, pnpm 11.3.0.

One deployment serves many customer companies (workspaces). Every business row carries its `companyId`; the tenant-scoped Prisma client filters every query by the signed-in user's company, and database triggers reject any row that points at another company's records. See [SECURITY.md](SECURITY.md#tenant-isolation).

## Onboarding a customer company

A production database starts with no demo data. Create each customer workspace in one of two ways:

1. **Operator-provisioned (default).** Run the CLI against the production database:

   ```bash
   pnpm workspace:create --company "Acme Office Supply" --name "Jane Doe" --email jane@acme.example --currency USD
   ```

   It creates the company, Jane as its ADMIN, and the starter configuration (four catalog categories, a standard price list, a starter approval policy, deal-health settings). It prints a one-time link (valid 7 days) for Jane to set her password, and emails it when an email provider is configured.

2. **Self-serve.** Set `DEALFLOW_PUBLIC_SIGNUP=1`. Then `/signup` asks for a company name and creates the same workspace with the person signing up as its admin. Sign-ups are limited to 5 per hour per client address (in-memory, per instance).

After that, the workspace admin invites staff and customer-portal users from **Settings → Users & roles**. Each invitee gets a one-time set-password link. Login emails are unique across the whole platform, so one email belongs to exactly one workspace.

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
- `NODE_ENV=production` on the deployed app. The `x-dev-actor` header is only
  honored when `DEALFLOW_DEV_IMPERSONATION=1` in a non-production environment;
  production always ignores it. Seeded demo accounts each have their own
  password (see `src/fixtures/ruchir.ts`); there is no shared password.
- `APP_URL` — the public https origin. Required in production.

The production server checks its configuration when it starts and exits with a list of problems if anything required is missing. The full list of checks is in [env-keys.md](env-keys.md#product-switches-production-hosts).

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

Never seed a production database: the seed truncates every table. A demo host (seeded, `DEALFLOW_DEMO_MODE=1`) and a production host (customer data, demo mode off) should be separate deployments with separate databases.

`pnpm db:reset` drops the database. Never run it against the shared integration or production URL.

Teammates propose schema changes with a PR that adds a new migration. Do not edit a merged migration. Ruchir reviews and deploys to `public` the same day when possible so other lanes do not drift.

## App host

Any Node 24 host that can run `pnpm build` and `pnpm start` works (Vercel, Fly, Railway, a VPS). The build command is `pnpm build` (`prisma generate && next build`). Start command is `pnpm start`.

### Container image

The repository's `Dockerfile` builds a Node 24 image that runs `pnpm start` as the unprivileged `node` user, with a container health check on `/api/livez`. Apply migrations as a separate release step before starting new containers:

```bash
docker build -t dealflow .
docker run --rm --env-file .env.production dealflow node_modules/.bin/prisma migrate deploy
docker run -d --env-file .env.production -p 3000:3000 dealflow
```

For a local production-style run with the compose database: `docker compose --profile app up --build` (it migrates, then starts).

### Health probes

| Path | Auth | Use |
|---|---|---|
| `GET /api/livez` | none | Liveness: the process is serving. |
| `GET /api/readyz` | none | Readiness: 200 when the database answers, 503 otherwise. |
| `GET /api/health` | signed in | The deal-health dashboard. Not a probe. |

Set `DATABASE_URL` and `SESSION_SECRET` on that host. Confirm `/api/auth/login` against a seed account after the first deploy.

## First-run check

Demo host (seeded):

1. `pnpm db:deploy` exits 0.
2. `pnpm db:seed` twice exits 0.
3. Log in as `dev@nexa.example` (password in [testing-credentials.md](testing-credentials.md)) and as each role in the README seed table.
4. `node scripts/full-cycle-check.mjs` and `node scripts/tenant-isolation-check.mjs` (set `BASE_URL`) both pass.

Production host (no seed):

1. `pnpm db:deploy` exits 0, and the server starts without `[config]` errors.
2. `GET /api/readyz` returns 200.
3. `pnpm workspace:create …` prints an invite link; setting the password and signing in lands on an empty workspace.
4. The sign-in page shows no demo logins.

## Production checklist (industry)

Use this as a gate before calling a host “production.”

- [ ] PostgreSQL **16** only (confirm `SHOW server_version`).
- [ ] `DATABASE_URL` uses TLS (`sslmode=require` or equivalent) on public networks.
- [ ] `SESSION_SECRET` is ≥32 random bytes, unique per environment, not in Git.
- [ ] `NODE_ENV=production`.
- [ ] `DEALFLOW_ADAPTER` is **not** set.
- [ ] The database was never seeded, `DEALFLOW_DEMO_MODE` is unset, and the sign-in page shows no demo logins.
- [ ] `APP_URL` is the https origin; `MAIL_FROM` and an email provider are set so invites are delivered.
- [ ] `DEALFLOW_PUBLIC_SIGNUP` is set only if anyone may create a workspace.
- [ ] Backups / PITR enabled; restore tested once.
- [ ] Release runs `pnpm db:deploy` then `pnpm build` / `pnpm start` on Node **24**.
- [ ] CI green on the commit you deploy (`.github/workflows/ci.yml`).
- [ ] Smoke: Origin-checked POST login; staff home; one portal user isolated.
- [ ] Load balancer probes use `/api/livez` and `/api/readyz`, not `/api/health` (deal health, needs auth). See [OPERATIONS.md](OPERATIONS.md).

## Example Node 24 VPS

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
git clone <repo> && cd dealflow
# export DATABASE_URL SESSION_SECRET NODE_ENV=production
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm build
pnpm start
```

Put a reverse proxy (Caddy/nginx) in front for HTTPS. Set `PORT` if the proxy expects a non-3000 upstream.

## Vercel / similar

Set the same env vars. Build: `pnpm build`. Install: `pnpm install --frozen-lockfile`. Provide a Postgres 16 URL the serverless region can reach. Prisma generate runs as part of `pnpm build`. Confirm the host’s Node version is **24**.

## Compose (app + db) note

`docker compose up -d` (`pnpm db:up`) starts **Postgres only**; the app runs on the host with `pnpm dev`. The `app` service is behind the `app` profile and uses the internal Docker DNS name `db` in `DATABASE_URL`.

## Rollback

1. Redeploy the previous Git SHA / image.
2. If the failed release applied a migration you cannot reverse in code, restore the pre-release database snapshot, then start the old app.
3. Never `pnpm db:reset` on integration or production.

Full incident playbooks: [OPERATIONS.md](OPERATIONS.md). API/security: [API.md](API.md), [SECURITY.md](SECURITY.md).
