# Tester dummy dataset

Synthetic rows for **reviewers and testers**. They follow `prisma/schema.prisma` (same JSON shape as `scripts/seed-synthetic-dataset.ts`). **298 records**. No real people, phones, or production secrets.

| File | What |
| --- | --- |
| [tester-dataset.json](./tester-dataset.json) | Full fixture (IDs prefixed `tester-`) |
| `pnpm tester:generate` | Rebuild this JSON from `scripts/generate-tester-dataset.ts` |
| `pnpm tester:seed` | Import **add-only** into Postgres (does **not** wipe the Nexa demo) |

## Load (LIVE database)

1. Postgres up, `.env` `DATABASE_URL` correct.
2. `pnpm db:deploy` then `pnpm db:seed` (Nexa demo).
3. `pnpm tester:seed`

Missing `DATABASE_URL` → do not invent a fallback. Re-running `tester:seed` skips duplicate ids.

Do **not** use `pnpm db:reset` on a shared database.

## Logins (this dataset only)

The importer hashes `Synthetic-<user.id>-2026!` for every user in the file.

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin.tester@example.test` | `Synthetic-tester-user-admin-2026!` |
| SALES_MANAGER | `manager.tester@example.test` | `Synthetic-tester-user-manager-2026!` |
| FINANCE | `finance.tester@example.test` | `Synthetic-tester-user-finance-2026!` |
| SALES_REP | `rep01.tester@example.test` | `Synthetic-tester-user-rep-01-2026!` |
| CUSTOMER (portal) | `buyer01.tester@example.test` | `Synthetic-tester-user-portal-01-2026!` |

Nexa demo passwords stay in [docs/testing-credentials.md](../docs/testing-credentials.md).

## What to exercise

| Surface | Rows in this file |
| --- | --- |
| Catalog | 10 products, 20 variants, 2 warehouses, stock on Mumbai for tracked SKUs |
| Commercial | 10 customers, 12 quotes (draft / pending / approved / negotiation / rejected / confirmed) |
| Governance | Tester policy + ceilings; pending and reject paths |
| Portal | Memberships; one open counter-proposal |
| Commit | 4 confirmed orders (pending / allocated / shipped / delivered) |
| Billing | Invoices UNPAID / PARTIAL / PAID, books payments, one goodwill credit |
| Recs / health | 6 recommendation rules; stalled + discount flags and tasks |

Money fields are **decimal strings**. Customer Bronze in product language is Prisma `STANDARD`.
