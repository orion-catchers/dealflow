# DealFlow360

B2B quote-to-cash workflow for Nexa Office Solutions. Every change to a deal triggers the right checks before the business commits. The team plan is `DealFlow360_Team_Execution_Blueprint-krishna.md`; read your lane there first.

Stack: Next.js 16, TypeScript, Tailwind 4, Prisma 7.10, PostgreSQL 16. One app, one database, one deployment.

## First run

Requirements: Node 24, pnpm 11, Docker.

```bash
pnpm install                 # also runs prisma generate
cp .env.example .env         # edit if port 5432 is taken (see below)
pnpm db:up                   # Postgres 16 in Docker
pnpm db:migrate              # applies prisma/migrations, then seeds
pnpm dev
```

`pnpm db:reset` drops everything, re-applies all migrations, and re-seeds. Use it freely on your local database. Never run it against the shared integration database.

### Port already in use

`docker-compose.yml` maps `${DEALFLOW_DB_PORT:-5432}` on the host. If 5432 is taken on your machine, set `DEALFLOW_DB_PORT=5434` in `.env` and change the port in `DATABASE_URL` to match. Both values live in `.env` so they stay in sync.

## Seed accounts

All seed passwords are `password123`.

| Role | Email | Fixture symbol |
|---|---|---|
| Admin | dev@nexa.example | `admin-dev` |
| Sales rep | arjun@nexa.example | `rep-arjun` |
| Sales manager | sana@nexa.example | `manager-sana` |
| Finance / operations | farah@nexa.example | `finance-farah` |
| Customer (Acme Studio) | neha@acme.example | `customer-neha` |
| Customer (Beta Corp, isolation checks) | rohan@beta.example | `customer-rohan` |

Fixture symbols are the stable IDs every lane uses in `src/fixtures/<lane>.ts`. The seed maps them to generated database IDs; domain code never branches on a symbol.

## Database ownership and rules

Ruchir owns `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/db/`, and the seed assembly. Feature owners write their own repositories and queries against the generated client.

- Schema changes are additive during the build. Ask Ruchir for a column or model; do not hand-edit `schema.prisma` on another lane's branch. If you must unblock yourself, put the change in a separate commit titled `schema: <what>` so it can be reconciled.
- Only Ruchir runs `prisma migrate dev` (creates a migration) and `prisma migrate deploy` against the shared integration database. Locally, everyone can run `pnpm db:migrate` and `pnpm db:reset`.
- Never delete or edit a migration that has been merged. Add a new one.
- Fixture data for your lane lives in `src/fixtures/<lane>.ts`. Add records there; `prisma/seed.ts` assembles all four files. Keep symbol names stable.
- Money is `Decimal(14,2)`, percentages are `Decimal(5,2)` in 0–100, billing dates are date-only, audit timestamps are UTC.

### Per-developer schemas on a shared database

If the team uses one hosted Postgres for integration, each developer uses a private PostgreSQL schema so migrations and resets never collide:

```
DATABASE_URL="postgresql://user:pass@host:5432/dealflow?schema=dev_<yourname>"
```

The `schema` query parameter is read by both the Prisma CLI and the runtime client (`src/lib/db/index.ts`). `schema=public` on the integration database is Ruchir's only.

## Scripts

| Script | What it does |
|---|---|
| `pnpm db:up` / `pnpm db:down` | Start / stop the Docker Postgres |
| `pnpm db:migrate` | `prisma migrate dev` (create + apply migrations, then seed) |
| `pnpm db:deploy` | `prisma migrate deploy` (apply only; CI and integration) |
| `pnpm db:reset` | Drop, re-migrate, re-seed |
| `pnpm db:seed` | Re-run the seed only |
| `pnpm db:generate` | Regenerate the Prisma client into `src/generated/prisma` |
| `pnpm db:studio` | Prisma Studio |
| `pnpm typecheck` | `tsc --noEmit` |

## Layout

```
prisma/                 schema, migrations, seed.ts (Ruchir)
src/lib/db/             Prisma client singleton, Tx type
src/fixtures/<lane>.ts  seed data per owner (harsh, atharva, krishna, ruchir)
src/contracts/<lane>.ts API contracts per owner
src/features/<area>/    feature services and UI per lane
src/generated/prisma/   generated client (gitignored)
```
