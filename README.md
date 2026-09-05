# DealFlow360

B2B quote-to-cash workflow for Nexa Office Solutions. Every deal change triggers the required checks before the business commits.

- Team plan: [`DealFlow360_Team_Execution_Blueprint-krishna.md`](./DealFlow360_Team_Execution_Blueprint-krishna.md)
- Team work log: [`memory.md`](./memory.md)
- Architecture and data model: [`docs/architecture.md`](./docs/architecture.md)
- Demo walkthrough: [`docs/demo-walkthrough.md`](./docs/demo-walkthrough.md)
- Deploy and migrate: [`docs/deploy.md`](./docs/deploy.md)

Stack: Next.js 16, TypeScript, Tailwind 4, Prisma 7.10, PostgreSQL 16, and Vitest. One app, one database, one deployment.

## First run

Requirements: Node 24, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

Run `pnpm test` for the feature engine and service tests. `pnpm db:reset` drops the local database, applies all migrations, and seeds it again. Never run that command against the shared integration database.

### Port already in use

`docker-compose.yml` maps `${DEALFLOW_DB_PORT:-5432}` on the host. If port 5432 is taken, set `DEALFLOW_DB_PORT=5434` in `.env` and change the port in `DATABASE_URL` to match.

## Seed accounts

All seed passwords are `password123`.

| Role | Email | Fixture symbol |
|---|---|---|
| Admin | dev@nexa.example | `admin-dev` |
| Sales rep | arjun@nexa.example | `rep-arjun` |
| Sales manager | sana@nexa.example | `manager-sana` |
| Finance / operations | farah@nexa.example | `finance-farah` |
| Customer (Acme Studio) | neha@acme.example | `customer-neha` |
| Customer (Beta Corp) | rohan@beta.example | `customer-rohan` |
| Customer (Gamma Labs) | meera@gamma.example | `customer-meera` |
| Sales rep (second rep) | priya@nexa.example | `rep-priya` |
| Pending internal signup | vikram@nexa.example | `pending-vikram` |

Fixture symbols are stable IDs shared by all lanes. `prisma/seed.ts` maps them to generated database IDs. Harsh's UI and service prototypes use separate in-memory data from `src/fixtures/harsh-dev.ts` until their repositories are connected to Prisma.

## Ownership

| Owner | Lane |
|---|---|
| Krishna | UI shell, login/home, quote builder, recommendations, customer portal |
| Ruchir | Schema, auth, deploy, billing, payments, approval, invoice, and subscription screens |
| Atharva | Quotes, pricing, orders, governance, deal health, and audit |
| Harsh | Catalog, customers, fulfillment, reports, exports, architecture, and demo docs |

Ruchir owns `prisma/schema.prisma`, `prisma/migrations/`, `src/server/lib/db/`, and seed assembly. Feature owners write repositories and queries against the generated client.

- Keep schema changes additive. Ask Ruchir for a model or field change.
- Never edit a merged migration. Add a new migration.
- Seed records for each lane live in `src/fixtures/<lane>.ts`.
- Money uses `Decimal(14,2)`. Percentages use `Decimal(5,2)` in the range 0–100. Billing dates are date-only and audit timestamps are UTC.

### Per-developer schemas

Each developer can use a private PostgreSQL schema on a shared database:

```text
DATABASE_URL="postgresql://user:pass@host:5432/dealflow?schema=dev_<yourname>"
```

The Prisma CLI and `src/server/lib/db/index.ts` both read the `schema` query parameter. Only Ruchir uses `schema=public` on the integration database.

## Scripts

| Script | What it does |
|---|---|
| `pnpm test` | Run Vitest once |
| `pnpm typecheck` | Generate Next route types and run TypeScript |
| `pnpm lint` | Run ESLint |
| `pnpm build` | Generate Prisma Client and build Next.js |
| `pnpm db:up` / `pnpm db:down` | Start or stop local PostgreSQL |
| `pnpm db:migrate` | Create and apply a development migration, then seed |
| `pnpm db:deploy` | Apply existing migrations |
| `pnpm db:reset` | Drop, migrate, and seed the local database |
| `pnpm db:seed` | Run the seed |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:studio` | Open Prisma Studio |

## Layout

```text
prisma/                    schema, migrations, and seed assembly
src/server/lib/db/         Prisma client singleton
src/server/<area>/         backend services, repositories, and engines
src/features/<area>/ui/    feature UI modules
src/features/<area>/api.ts request/body/query schemas and API helpers
src/fixtures/<lane>.ts     canonical database seed data
src/fixtures/harsh-dev.ts  temporary in-memory feature data
src/contracts/<lane>.ts    feature contracts
src/generated/prisma/      generated Prisma Client, gitignored
```
