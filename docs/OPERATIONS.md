# DealFlow360 operations runbook

_For production or shared demo hosts. Complements [deploy.md](deploy.md)._

## Process model

One Node 24 process serving Next.js (`pnpm start` after `pnpm build`). One PostgreSQL 16. No worker queue in this repo. Due billing and health refresh are **HTTP-triggered**, not cron.

## Health vs deal Health

| Endpoint | Meaning |
|---|---|
| Process listen on `PORT` (default 3000) | Process is up |
| `GET /api/auth/me` without cookie | **401** means auth route is alive |
| `GET /api/health` | **Deal health flags** (Atharva). Requires a session. **Not** a Kubernetes liveness probe |

Do not configure a load balancer to hit `/api/health` without a cookie expecting 200.

Suggested liveness: TCP or HTTP GET `/login` → 200 HTML. Suggested readiness: Postgres `SELECT 1` from a sidecar or a dedicated probe you add later.

## Environment matrix

| Variable | Local | CI | Demo | Production |
|---|---|---|---|---|
| `NODE_ENV` | development | (Actions default) | production | production |
| `DATABASE_URL` | Docker | Service Postgres | Neon/RDS | Managed Postgres TLS |
| `SESSION_SECRET` | `.env` | `ci-only-secret` | Unique secret | Unique, rotated |
| `DEALFLOW_ADAPTER` | unset (live) | unset | **unset** | **must be unset** |
| Seed passwords | allowed | allowed | labeled demo only | **forbidden** |

## Release sequence

1. Merge PR (green CI).
2. Backup database (snapshot or `pg_dump`).
3. Deploy app **or** migrate first if migrations are backward-compatible (preferred: migrate, then app).
4. `pnpm db:deploy` against the target URL.
5. `pnpm build` / host build with same Node 24.
6. Restart `pnpm start`.
7. Smoke: login (demo) or real user (prod); open one quote; finance invoices if billing is in the release.

Rollback: redeploy previous image/commit. If a migration is irreversible, restore the snapshot taken in step 2 **before** migrating. Do not `db:reset` on shared URLs.

## Backups

- Managed Postgres: enable PITR / daily snapshots (Neon, RDS, Cloud SQL).
- Self-hosted:

```bash
pg_dump --format=custom --file=dealflow-$(date -u +%Y%m%dT%H%M%SZ).dump "$DATABASE_URL"
```

Restore:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" dealflow-YYYYMMDD.dump
```

Test restore on a **copy** database before relying on it.

## Logs

Log HTTP status, `error.code`, actor id, request path. Do not log `Set-Cookie`, `Authorization`, passwords, or full payment PAN (this app has none).

Prisma `P2025` / not found → 404. Other driver errors → 422 with a safe message (`wrapError`).

## Incident: login works, invoices 404

Auth and session are up. Billing routes or data missing. Check: migrations applied, seed/billing initialize ran, user role is FINANCE/ADMIN, URL path matches `src/app/api/invoices`.

## Incident: 503 INTEGRATION_REQUIRED

`DATABASE_URL` missing and fixture not enabled. Set URL or (local only) `DEALFLOW_ADAPTER=development`.

## Incident: 403 ORIGIN on login

Missing/mismatched Origin. Browser same-origin is fine. Scripts must send `Origin` matching the app URL in production.

## Incident: stock receipt 404 for `warehouse-main`

Live path must resolve fixture symbols via `ids.ts` / `map.ts`. Confirm warehouse **code** exists after seed.

## Capacity (honest)

No published SLO. Demo-scale catalog and quote volume. Indexes exist on hot FKs in Prisma; load-test before enterprise volume.

## Scheduled jobs (not shipped)

If you add cron later: due billing (`/api/billing/run-due` or `runBilling` action) and health refresh. Until then, operators click the UI or POST with a session.
