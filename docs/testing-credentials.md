# Testing credentials (local demo only)

Use these accounts on **http://localhost:3000**. They are seeded demo passwords, **not** production credentials. Do not reuse them on a public host.

Canonical password source for the LIVE Nexa seed: `src/fixtures/ruchir.ts`. Environment keys (not logins): [env-keys.md](env-keys.md).

---

## How to run

See README **Quick start**. Short version:

1. Copy `.env.example` to `.env`. `DATABASE_URL` port must match `DEALFLOW_DB_PORT` (`5432` default, or `5434` if 5432 is taken).
2. Start Postgres: `npm run db:up` or `docker start dealflow-postgres`.
3. `npm run db:deploy` then `npm run db:seed` (first time).
4. `npm run dev`. Do **not** set `DEALFLOW_ADAPTER=development` for the LIVE demo.
5. Sign in at `/login`.

Local Docker Postgres (from `docker-compose.yml`): user `dealflow`, password `dealflow`, database `dealflow`.

---

## LIVE database — Nexa demo (`pnpm db:seed`)

| Role | Name | Email | Password | Lands on |
| --- | --- | --- | --- | --- |
| ADMIN | Dev Sharma | `dev@nexa.example` | `admin-nexa-2026!` | `/home` |
| SALES_REP | Arjun Mehta | `arjun@nexa.example` | `arjun-nexa-2026!` | `/home` |
| SALES_REP | Priya Nair | `priya@nexa.example` | `priya-nexa-2026!` | `/home` |
| SALES_MANAGER | Sana Iyer | `sana@nexa.example` | `sana-nexa-2026!` | `/home` |
| FINANCE | Farah Khan | `farah@nexa.example` | `farah-nexa-2026!` | `/home` |
| CUSTOMER (Acme, Gold) | Neha Rao | `neha@acme.example` | `neha-acme-2026!` | `/portal` |
| CUSTOMER (Beta, Standard) | Rohan Das | `rohan@beta.example` | `rohan-beta-2026!` | `/portal` |
| CUSTOMER (Gamma, Silver) | Meera Joshi | `meera@gamma.example` | `meera-gamma-2026!` | `/portal` |
| SALES_REP (pending) | Vikram Singh | `vikram@nexa.example` | `vikram-nexa-2026!` | Cannot sign in until an admin activates |
| ADMIN (Contoso tenant) | Contoso Admin | `admin@contoso.example` | `contoso-admin-2026!` | `/home` (only after a seed that includes Contoso) |

Login page demo-fill buttons provide one-click login for Admin (`dev@nexa.example`), staff roles (Arjun, Sana, Farah), and 3 distinct customers: Acme (`neha@acme.example`), Beta (`rohan@beta.example`), and Gamma (`meera@gamma.example`).

---

## LIVE database — synthetic dataset (`npm run synthetic:seed`)

Present only after the synthetic importer has been run (add-only; does not wipe Nexa). Password for every synthetic user is:

`Synthetic-<user.id>-2026!`

Examples:

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin01@example.test` | `Synthetic-user-0001-2026!` |
| SALES_REP | `sales_rep02@example.test` | `Synthetic-user-0002-2026!` |
| SALES_MANAGER | `sales_manager10@example.test` | `Synthetic-user-0010-2026!` |
| FINANCE | `finance13@example.test` | `Synthetic-user-0013-2026!` |
| CUSTOMER | `customer16@example.test` | `Synthetic-user-0016-2026!` |

Disabled synthetic users cannot sign in. IDs and emails are in `src/fixtures/dealflow360_synthetic_dataset.json`.

---

## DEV FIXTURE (`pnpm dev:fixture` / `DEALFLOW_ADAPTER=development`)

JSON store under `.dealflow-development/`. Passwords are in `src/development/seed.ts` (`userPasswords`). Emails are `*@dealflow.test`, not the Nexa addresses.

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@dealflow.test` | `admin-dealflow-2026!` |
| SALES_REP | `sales@dealflow.test` | `arjun-dealflow-2026!` |
| SALES_MANAGER | `manager@dealflow.test` | `sana-dealflow-2026!` |
| FINANCE_OPS | `finance@dealflow.test` | `farah-dealflow-2026!` |
| CUSTOMER (Acme) | `acme@dealflow.test` | `neha-dealflow-2026!` |
| CUSTOMER (Beta) | `beta@dealflow.test` | `riya-dealflow-2026!` |

Forbidden when `NODE_ENV=production`.

---

## What is not a login

| Item | Notes |
| --- | --- |
| `password123` | Not used for seeded accounts. |
| Google SSO | Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; otherwise the login page hides Google. Password login always works. |
| Stripe / Resend / carrier | Without keys, those APIs return **503** `INTEGRATION_REQUIRED`. Core quote, confirm, bank payment, and reports still work. |
| `SESSION_SECRET=change-me` | Local cookie signing only. Rotate on any shared host. |
| Impersonation | `DEALFLOW_DEV_IMPERSONATION=1` plus `x-dev-actor` skips real login. Never in production. |

---

## Tester dummy dataset (`pnpm tester:seed`)

Add-only import of [data/tester-dataset.json](../data/tester-dataset.json) (298 records). Does not replace the Nexa seed. Passwords are `Synthetic-<user.id>-2026!`. Full table and load steps: [data/README.md](../data/README.md).

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin.tester@example.test` | `Synthetic-tester-user-admin-2026!` |
| SALES_REP | `rep01.tester@example.test` | `Synthetic-tester-user-rep-01-2026!` |
| CUSTOMER | `buyer01.tester@example.test` | `Synthetic-tester-user-portal-01-2026!` |
