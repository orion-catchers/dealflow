<div align="center">

<h1 align="center" style="margin:0 0 12px;background:#9CAF88;color:#ffffff;font-family:'Segoe Script','Apple Chancery','Snell Roundhand',cursive;font-size:64px;font-weight:700;padding:28px 20px;border-radius:14px;">
  DealFlow360
</h1>

<p align="center">
  <img src="docs/assets/dealflow-title-sage.png" alt="DealFlow360" width="720"/>
</p>

**B2B quote-to-cash for connected sales operations**

Price, approve, negotiate, confirm, allocate, bill, and report on every deal — one Next.js app, one PostgreSQL database, one canonical revision. Previews never commit. Stock is reserved only on explicit allocation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

Built by **Team Orion Catchers**. Demo tenant: **Nexa Office Solutions**.

<br/>

<img src="docs/assets/landing.png" alt="DealFlow360 landing page: Every deal. Every detail. In sync. with Product, How it works, Access, Sign in, and Get started." width="920"/>

<p><em>Public landing at <code>/</code> — marble workspace photography, teal CTAs, Configure → Agree → Deliver.</em></p>

</div>

---

## Table of contents

1. [What a reviewer or agent must verify first](#what-a-reviewer-or-agent-must-verify-first)
2. [What is DealFlow360?](#what-is-dealflow360)
3. [Non-goals](#non-goals)
4. [Design principles (acceptance criteria)](#design-principles-acceptance-criteria)
5. [Live feature demos](#live-feature-demos)
6. [Tech stack](#tech-stack)
7. [Architecture at a glance](#architecture-at-a-glance)
8. [Prerequisites](#prerequisites)
9. [Quick start](#quick-start)
10. [Seed accounts](#seed-accounts)
11. [Repository layout](#repository-layout)
12. [Feature matrix](#feature-matrix)
13. [Roles and permissions](#roles-and-permissions)
14. [Data model](#data-model)
15. [API surface](#api-surface)
16. [Environment variables](#environment-variables)
17. [Adapters (live vs development fixture)](#adapters-live-vs-development-fixture)
18. [Common commands](#common-commands)
19. [Testing](#testing)
20. [Security model](#security-model)
21. [Deployment](#deployment)
22. [Operations and incident response](#operations-and-incident-response)
23. [Documentation index](#documentation-index)
24. [Ownership and team](#ownership-and-team)
25. [Known limitations](#known-limitations)
26. [Roadmap (optional vendors)](#roadmap-optional-vendors-not-required-for-demo)

---

## What a reviewer or agent must verify first

Use this section as a checklist. If an item fails, do not treat the system as production-ready.

| # | Requirement | How to verify | Pass looks like |
|---|---|---|---|
| 1 | One app, one database | `package.json`, `prisma/schema.prisma`, no second service compose file | Next.js + Postgres 16 only |
| 2 | Live path has no silent fixture fallback | `src/server/adapters.ts` | `DEALFLOW_ADAPTER=development` only when `NODE_ENV !== production`; missing `DATABASE_URL` → **503 INTEGRATION_REQUIRED** |
| 3 | Money and percentages | Contracts + API payloads | Money is decimal **strings**; percentages **0..100** |
| 4 | Quote mutations are revision-safe | POST bodies on quote/portal actions | `expectedRevision` required; stale → **409 STALE_REVISION** |
| 5 | Commitment rule | Confirm + allocate code paths | Confirm creates Order + billing/fulfillment **init**; **no stock reservation** until explicit allocate |
| 6 | Portal isolation | Two customer accounts | Acme cannot read Beta quotes (**404**); portal JSON has no cost/margin/rep internals |
| 7 | Signup is not privileged | POST `/api/auth/signup` | Creates **PENDING**; cannot sign in until an admin activates |
| 8 | CSRF on mutations | POST with `Origin: http://evil.example` | **403 ORIGIN** |
| 9 | Session is httpOnly | Login `Set-Cookie` | `dealflow_session` httpOnly, `SameSite=Strict`, not readable from JS |
| 10 | CI is the source of truth | `.github/workflows/ci.yml` | validate → migrate → seed twice → typecheck → lint → test → build |
| 11 | Demo credentials never in production | This README + `.env.example` | Seed passwords in [docs/env-keys.md](docs/env-keys.md); `SESSION_SECRET=change-me` is local-only |

Canonical docs for deeper checks: [docs/architecture.md](docs/architecture.md), [docs/API.md](docs/API.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/deploy.md](docs/deploy.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

---

## What is DealFlow360?

DealFlow360 is a **quote-to-cash workspace** for a B2B seller (demo: Nexa Office Solutions). Sales builds a quotation from the **canonical catalog and customer price list**. Policy evaluation decides whether manager and/or finance approval is required. The customer reviews terms in a **restricted portal**, may propose changes (new revision), and may accept **only the current revision**. Acceptance plus valid approval (or approval not required) creates an **immutable order**. Warehouse split and billing totals may be shown as **Preview** before that moment. After confirmation, Finance allocates stock, ships, invoices, records payments, and runs recurring billing. Deal health and reports read the same committed records.

It is **not** a CRM, ERP purchasing module, or card-acquiring gateway. Those belong elsewhere.

### Product surfaces

| Surface | Who | Routes |
|---|---|---|
| Public entry | Anyone | `/`, `/login`, `/signup` |
| Staff workspace | ADMIN, SALES_REP, SALES_MANAGER, FINANCE | `/home`, `/quotes`, `/pipeline`, `/approvals`, `/fulfillment`, `/subscriptions`, `/invoices`, `/health`, `/reports`, `/products`, `/settings/*` |
| Customer portal | CUSTOMER | `/portal`, `/portal/quotes/:id`, `/portal/orders/:id`, `/portal/invoices/:id` |

---

## Non-goals

Do **not** grade the product against hosted vendor accounts you have not configured.

- **No deploy required.** Local Docker + `.env` is the intended demo. Keys live in [docs/env-keys.md](docs/env-keys.md).
- Card **collection** needs `STRIPE_SECRET_KEY`. Without it, payments are **recorded** in the books only (still correct for the core demo).
- Outbound email needs Resend or `MAIL_WEBHOOK_URL`; otherwise non-production **logs** the message.
- Google SSO needs client id/secret; password login always works.
- Display currency is **INR**; `/api/fx` is a labeled Preview, not a second ledger.
- Microservices, message queues, or a second database
- Deleting products (archive only)
- Letting the browser compute totals, tax, or approval outcomes

---

## Design principles (acceptance criteria)

| Principle | How it shows up in code | Fail if |
|---|---|---|
| **Canonical engines, not UI math** | Pricing, policy evaluation, confirmation, fulfillment split, billing calendars live under `src/server/*` and `src/features/{quotes,recommendations,portal}` | A React component writes `total = qty * price` as the system of record |
| **Revision is the unit of truth** | Quote mutations carry `expectedRevision`; material change → new revision; stale approval/acceptance never commits | Confirm succeeds on an old revision |
| **Preview ≠ commit** | Fulfillment preview and billing previews are labeled Preview and must not reserve stock or create invoices | GET preview changes `reserved` |
| **Confirm then allocate** | `confirm` → Order + `initializeBilling` + `initializeFulfillment` (PENDING, **zero** reservations). `allocate` is a separate finance/admin action | Confirm increments `Stock.reserved` |
| **Idempotent money writes** | `requestKey` on payments, receipts, allocation accept, due billing | Same key + different payload → **409 KEY_REUSE**; same key + same payload → replay |
| **Customer allowlist** | Portal reconstructs responses; no cost, profit, margin, internal notes, other customers | Portal JSON contains `marginPct` / `unitCost` / another customer’s quote |
| **Fail closed** | Production never loads `src/development/*`. Missing live DB → 503, not fixtures | `NODE_ENV=production` and `DEALFLOW_ADAPTER=development` serving JSON store |
| **RBAC on the server** | Route handlers and `runLiveCommand` `roles()` checks | Hiding a nav link is treated as security |

Shared commitment rule (team): before final customer acceptance, warehouse split suggestions and billing previews are allowed and must be labeled **Preview**. Create an order only when the **same current revision** has valid required approvals (or approval is not required) **and** final customer acceptance. Material changes create a new revision and require re-evaluation.

---

## Live feature demos

These are the moments a reviewer should watch. Numbers in [docs/demo-walkthrough.md](docs/demo-walkthrough.md) are the Nexa gold-tier scenario (laptops, docks, support seats).

### 1. Policy within ceiling → confirm without a manager chain

Arjun (sales) quotes Acme (Gold) inside hardware/service ceilings. Evaluation is `NOT_REQUIRED` or `APPROVED`. Neha accepts **that revision** in the portal. One `Order` is created. Repeat confirm with the same `requestKey` returns the same order.

### 2. Exception discount → Manager then Finance

A line discount that exceeds category ceiling sets `evaluation.status = PENDING` with chain `SALES_MANAGER` then `FINANCE`. Sana cannot be skipped. Farah cannot act while the manager step is open. After both approve, Neha may accept. Stale tab with an old `expectedRevision` gets **409**.

### 3. Preview split does not reserve; allocate does

Farah opens fulfillment **Preview**: deterministic warehouse split (Main then East in the demo), backorder explicit, shipping estimate shown. Stock `reserved` is unchanged. **Allocate available stock** writes reservations once. Repeat with the same `requestKey` does not double-reserve.

### 4. Customer isolation and proposal

Neha cannot open Rohan’s portal quote (**404**). A proposal with financial changes creates a **new revision** and re-evaluates policy. A proposal with only a delivery date sets `dateReviewPending`; it is **not** a promise and **blocks** acceptance until staff reviews.

---

## Tech stack

### Application

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js **24** | CI and `package.json` engines/workflow |
| App | Next.js **16.3.4** App Router | One deployable: UI + Route Handlers |
| UI | React **19.2**, Tailwind **4**, lucide-react | Compact light workspace (slate, white, teal) |
| Language | TypeScript **5** (strict project) | Shared contracts in `src/contracts/` |
| Validation | Zod **4.5** | Lane API bodies (`src/features/*/api.ts`) |
| Money | `Decimal(14,2)` in Postgres; decimal **strings** on the wire | No IEEE float in API money |
| ORM | Prisma **7.10.0** + `@prisma/adapter-pg` + `pg` **8.23** | PostgreSQL 16, generated client in `src/generated/prisma` (gitignored) |
| Auth | Server session cookie `dealflow_session` | httpOnly, hashed token in `Session` table |
| Exports | exceljs, pdf-lib, xlsx | Reports and invoice PDF |
| Tests | Vitest **5** + node:test (`tests/*.test.mjs`) | Engines are unit-tested without the browser |

### Infrastructure

| Component | Choice |
|---|---|
| Local DB | Docker Compose `postgres:16-alpine`, volume `dealflow-pgdata` |
| Package manager | **pnpm 11.3.0** (`packageManager` field). npm may be used locally; CI uses `pnpm install --frozen-lockfile` |
| CI | GitHub Actions: Postgres service, migrate, seed **twice**, typecheck, lint, test, build |
| Hosted DB (integration/demo) | Neon Postgres 16, or any Postgres 16 URL |

**Explicitly avoided:** Firebase/Supabase Auth, a second app server, browser-trusted `x-dev-actor` in production.

---

## Architecture at a glance

<p align="center">
  <img src="docs/assets/architecture.svg" alt="DealFlow360 layered architecture: browser shells, Next.js APIs and six engines, PostgreSQL 16" width="1100"/>
</p>

<p align="center">
  <img src="docs/assets/architecture.png" alt="DealFlow360 architecture poster: browser, Next.js 16, engines, PostgreSQL 16" width="1100"/>
</p>

Six engines (pure logic + services + repositories):

| Engine | Owner | Responsibility |
|---|---|---|
| E1 Governance | Atharva | Policy evaluation, approval chain, confirmOrder |
| E2 Fulfillment | Harsh | Preview split, allocate, ship, deliver, receipt, backorder |
| E3 Billing | Ruchir | Invoices, subscriptions, proration, payments, credits |
| E4 Recommendations | Krishna | Rank add-ons from rules + canonical candidate prices |
| E5 Health | Atharva | Stalled quotes, discount anomaly, delivery risk, tasks |
| E6 Negotiation | Krishna | Portal proposals, messages, date review, customer confirm |

Deep dive: [docs/architecture.md](docs/architecture.md).

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | **24** |
| pnpm | **11.3.0** (`corepack enable` then `corepack prepare pnpm@11.3.0 --activate`) |
| Docker Desktop | Compose v2 (for local Postgres) |
| Git | 2.x |
| Optional | OpenSSL (to generate `SESSION_SECRET`) |

Tested on Windows 10/11 (PowerShell) and typical Linux CI (`ubuntu-latest`). If host port **5432** is busy, use **5434** (see Quick start).

---

## Quick start

```bash
git clone https://github.com/orion-catchers/dealflow.git
cd dealflow
pnpm install
cp .env.example .env
# If 5432 is taken: set DEALFLOW_DB_PORT=5434 and the same port inside DATABASE_URL
pnpm db:up
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Open **http://localhost:3000**. Sign in with a [seed account](#seed-accounts).

**Live UI (default):** do **not** set `DEALFLOW_ADAPTER=development`. Requires `DATABASE_URL`.

**Krishna fixture harness only:** `pnpm dev:fixture` (JSON store under `.dealflow-development/`). Forbidden when `NODE_ENV=production`.

Native Postgres instead of Docker: point `DATABASE_URL` at your instance and skip `pnpm db:up`. Major version must be **16**.

---

## Seed accounts

Passwords are **per user** (not `password123`). Full table: [docs/env-keys.md](docs/env-keys.md). Never use these in production.

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `dev@nexa.example` | `admin-nexa-2026!` | `/home` |
| Sales rep | `arjun@nexa.example` | `arjun-nexa-2026!` | `/home` |
| Sales rep | `priya@nexa.example` | `priya-nexa-2026!` | `/home` |
| Sales manager | `sana@nexa.example` | `sana-nexa-2026!` | `/home` |
| Finance | `farah@nexa.example` | `farah-nexa-2026!` | `/home` |
| Customer (Acme) | `neha@acme.example` | `neha-acme-2026!` | `/portal` |
| Customer (Beta) | `rohan@beta.example` | `rohan-beta-2026!` | `/portal` |
| Customer (Gamma) | `meera@gamma.example` | `meera-gamma-2026!` | `/portal` |
| Pending rep | `vikram@nexa.example` | `vikram-nexa-2026!` | **Cannot sign in** until activated |

Fixture symbols are stable team IDs. Prisma generates row IDs; `src/server/lib/db/map.ts` and `src/server/live/ids.ts` map symbols ↔ emails/SKUs/warehouse codes for live commands.

---

## Repository layout

```text
dealflow/
├── prisma/                      schema, migrations, seed assembly
├── src/
│   ├── app/                     Next.js App Router (pages + api)
│   │   ├── (internal)/          Staff routes; layout is a passthrough
│   │   ├── api/                 Route handlers (lane REST + catch-all)
│   │   ├── login|signup|portal  Auth + customer
│   │   └── layout.tsx           Mounts Application shell once
│   ├── components/application/  Krishna shared workspace UI
│   ├── components/ui|shell      Shared primitives
│   ├── contracts/               Lane TypeScript contracts
│   ├── development/             Fixture adapter (dev-only)
│   ├── features/                Builder, portal, catalog, inventory, reports UIs + zod
│   ├── fixtures/                Seed data per owner
│   ├── generated/prisma/        Generated client (gitignored)
│   ├── middleware.ts            Origin check for /api/*
│   └── server/                  Engines, live adapter, auth, db
├── docs/                        Architecture, API, security, deploy, operations
├── tests/                       Krishna node:test suites
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

---

## Feature matrix

| Module | Screen | Key business rule |
|---|---|---|
| Auth | Login, signup | Signup → PENDING; no client-chosen privileged role |
| Overview | `/home` | Pipeline counts from scoped workspace |
| Quotations | List, pipeline, builder | Canonical price; save reprices; `expectedRevision` |
| Recommendations | Quote panel | Server-ranked; add creates a new revision |
| Approvals | Inbox, decision | Assigned role only; reason required; no self-approve as rep on own quote |
| Portal | Deals, propose, confirm | Customer-scoped allowlist; confirm = current revision + approval OK |
| Fulfillment | Orders, preview, allocate, ship, deliver | Preview read-only; allocate reserves; ship deducts on-hand |
| Catalog | Products, variants, price lists, customers | Admin writes; products archived not deleted |
| Warehouses | Stock, receipt, thresholds | Receipt idempotent by `requestKey`; fixture ids resolve to Prisma |
| Billing | Invoices, payments, subscriptions, due run | No double pay; proration per plan; cancel policy |
| Health | Flags, tasks | Manual refresh; tasks assigned to reps |
| Reports | Filters, Excel, PDF | Same filter as on-screen rows; customer may export own invoice PDF |
| Setup | Users, policy, recommendation rules, health settings | Role-gated mutations |

---

## Roles and permissions

Prisma `Role`: `ADMIN`, `SALES_REP`, `SALES_MANAGER`, `FINANCE`, `CUSTOMER`. The staff UI may label finance as `FINANCE_OPS`.

| Capability | Rep | Manager | Finance | Admin | Customer |
|---|:---:|:---:|:---:|:---:|:---:|
| Own / scoped quotes | ✅ | ✅ | ✅ (read) | ✅ | Own via portal |
| Create/edit quote, add line | ✅ | ❌ | ❌ | ✅ | Propose only |
| Approval decision (when assigned) | ❌ | ✅ | ✅ | ✅ | ❌ |
| Allocate / ship / receive stock | ❌ | ❌ | ✅ | ✅ | ❌ |
| Record payment / run due billing | ❌ | ❌ | ✅ | ✅ | ❌ |
| Catalog / customers / price lists | ❌ | ❌ | ❌ | ✅ | ❌ |
| Policy / health settings | ❌ | ✅ | ❌ | ✅ | ❌ |
| Portal confirm / proposal | ❌ | ❌ | ❌ | ❌ | ✅ |
| Development fixture reset | ❌ | ❌ | ❌ | Fixture only | ❌ |

Sales reps are scoped to their quotes (`repId`). Portal reads require membership for that customer.

---

## Data model

**Source of truth:** `prisma/schema.prisma` (do not invent columns in docs). Human overview: [docs/DATA_MODEL.md](docs/DATA_MODEL.md) and [docs/architecture.md](docs/architecture.md).

Critical uniqueness (reviewers should grep the schema):

- One **Order** per accepted quote revision
- **RequestKey** unique on `(scope, key)` with a coherence check on result fields
- **Stock** unique `(warehouseId, variantId)`; invariant `onHand ≥ reserved ≥ 0`
- Products are **archived**, not deleted
- Portal messages and proposals keyed by quote + operation key

Money: `Decimal(14, 2)`. Percentages: `Decimal(5, 2)` in range 0–100. Billing periods are date-only. Audit timestamps are UTC.

---

## API surface

Envelope: success `{ data, mode }` where `mode` is `LIVE` or `DEV FIXTURE`. Error `{ error: { code, message, details? } }` with HTTP **401 / 403 / 404 / 409 / 422 / 503**.

There are **two** HTTP layers (both must stay consistent):

1. **Workspace catch-all** `src/app/api/[...path]/route.ts` — Krishna `Application` uses `/api/workspace`, `/api/actions`, `/api/portal`, `/api/recommendations`, `/api/export`.
2. **Lane REST** under `src/app/api/{auth,products,quotes,fulfillment,invoices,...}` — Harsh/Atharva/Ruchir screens and services.

### Catch-all (staff cookie required except login/signup)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ actor }` + cookies |
| POST | `/api/auth/signup` | Pending account |
| GET | `/api/auth/me` | Current actor |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/workspace` | Scoped staff snapshot |
| POST | `/api/actions` | `{ action, requestKey, ... }` command bus |
| GET | `/api/portal` | Customer snapshot |
| GET | `/api/portal/{quotes\|orders\|invoices}/:id` | Customer record |
| POST | `/api/portal/quotes/:id/proposals` | Negotiation |
| POST | `/api/portal/quotes/:id/confirm` | Customer acceptance |
| GET/POST | `/api/recommendations/:quoteId` | List / add candidate |
| POST | `/api/recommendations/rules` | Replace rules |
| GET | `/api/export` | `format=xlsx\|pdf` |
| GET | `/api/fulfillment/:orderId/preview` | Read-only split |

**Actions** (non-exhaustive): `newQuote`, `addLine`, `saveQuote`, `submitQuote`, `sendQuote`, `decision`, `reply`, `reviewDate`, `allocate`, `ship`, `deliver`, `cancelOrder`, `stockReceipt`, `stockThreshold`, `saveRecord`, `variant`, `policy`, `healthSettings`, `refreshHealth`, `task`, `payment`, `runBilling`, `subscription`. Live `reset` is **403**.

Full contract: [docs/API.md](docs/API.md).

---

## Environment variables

Copy `.env.example` → `.env`. Never commit `.env`.

**Canonical list (required vs optional vendors):** [docs/env-keys.md](docs/env-keys.md). You do not need to deploy or buy Stripe/Resend/Google for the Nexa browser demo.

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Live yes | Must match Docker host port (`DEALFLOW_DB_PORT`; **5434** on some machines) |
| `DEALFLOW_DB_PORT` | Compose | Host port mapped to container 5432 |
| `SESSION_SECRET` | Auth | `openssl rand -hex 32`. Default `change-me` is local-only |
| `APP_URL` | Optional | OAuth redirect + email links; `http://localhost:3000` locally |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_WEBHOOK_URL` | Optional | Email; otherwise log in non-production |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional | Card checkout; 503 without secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | SSO; user email must already exist |
| `CRON_SECRET` / `JOBS_ACTOR_EMAIL` | Optional | `POST /api/jobs/run`; or run `npm run jobs` |
| `DEALFLOW_FX_JSON` | Optional | Display FX Preview |
| `CARRIER_QUOTE_URL` / `CARRIER_API_KEY` | Optional | Live courier HTTP; rate card still works |
| `NODE_ENV` | Host | `production` rejects `x-dev-actor` and development adapter |
| `DEALFLOW_ADAPTER` | Optional | `development` only with non-production Node — **not** the live demo |

Per-developer schema on a shared host:

```text
DATABASE_URL="postgresql://user:pass@host:5432/dealflow?schema=dev_<name>"
```

Only the integration owner migrates `schema=public`.

---

## Adapters (live vs development fixture)

```text
getAdapter()
  ├─ NODE_ENV !== production AND DEALFLOW_ADAPTER=development
  │     → src/development/adapter.ts   mode: DEV FIXTURE
  ├─ DATABASE_URL set
  │     → src/server/live/adapter.ts   mode: LIVE
  └─ else
        → 503 INTEGRATION_REQUIRED
```

Reviewer trap: running `pnpm dev:fixture` is **not** a database proof. Label UI connection `LIVE` vs `DEV FIXTURE` vs error. Production must show live or fail.

---

## Common commands

Run from repo root.

| Command | Purpose |
|---|---|
| `pnpm install` | Install + `prisma generate` (postinstall) |
| `pnpm dev` | Next dev (default port 3000) |
| `pnpm dev:fixture` | Fixture adapter |
| `pnpm build` | `prisma generate && next build` |
| `pnpm start` | Production Next server |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest once |
| `pnpm test:krishna` | `tests/*.test.mjs` |
| `pnpm db:up` / `db:down` | Compose Postgres |
| `pnpm db:deploy` | `prisma migrate deploy` (safe for shared DB) |
| `pnpm db:migrate` | `prisma migrate dev` (creates migrations) |
| `pnpm db:seed` | Seed (idempotent in CI: run twice) |
| `pnpm db:reset` | **Drop** database, migrate, seed — **never** on integration/prod |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:generate` | Generate client only |

---

## Testing

| Layer | How | What it proves |
|---|---|---|
| Engine + services | `pnpm test` (Vitest) | Governance, fulfillment split/invariants, billing calendar/proration, reports filter=export, auth password/session, catalog price resolve, health, audit writer |
| Krishna fixture | `pnpm test:krishna` | Portal allowlist, recommendation add+replay, origin helper, fixture exports |
| Type + lint + build | CI | Schema validate, migrate, seed twice, `tsc`, eslint, `next build` |
| Manual / HTTP | [docs/krishna-manual-qa.md](docs/krishna-manual-qa.md), this README demos | Browser + live cookie; **not** implied by Vitest |

Isolated Vitest **does not** prove Postgres, cookies, or browser behavior. Say so in any status report.

---

## Security model

Summary; full text in [docs/SECURITY.md](docs/SECURITY.md).

- Passwords hashed (auth lane). Sessions stored as **SHA-256 of token**, cookie httpOnly + SameSite=Strict.
- `x-dev-actor` honored **only** when `DEALFLOW_ADAPTER=development`.
- POST Origin / Referer / `Sec-Fetch-Site` checked (`src/middleware.ts`, `src/server/origin.ts`). Production requires Origin or Referer.
- Portal: server-verified customer actor; repository reads customer-scoped; nested JSON allowlisted.
- Quote/portal writes: `expectedRevision` + `requestKey`.
- Signup cannot select ADMIN. Pending users cannot login.
- SQL via Prisma parameterization. No production import of `src/development/*`.

---

## Deployment

Industrial runbook: **[docs/deploy.md](docs/deploy.md)** and **[docs/OPERATIONS.md](docs/OPERATIONS.md)**.

Minimum production shape:

1. PostgreSQL **16** with backups enabled.
2. `DATABASE_URL` + `SESSION_SECRET` from a secret manager (not Git).
3. `NODE_ENV=production`. Do not set `DEALFLOW_ADAPTER=development`.
4. Release: `pnpm install --frozen-lockfile` → `pnpm db:deploy` → `pnpm build` → `pnpm start` (or a Node 24 host / Vercel with the same env).
5. Smoke: login `dev@nexa.example` only on **demo** hosts; production must use real users and a rotated secret.
6. Health: process up, `GET /api/auth/me` without cookie → 401, migrate status 0.

`pnpm db:reset` is forbidden against shared and production URLs.

---

## Operations and incident response

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for backup/restore, rollback, log triage, and “login works but invoices 404” diagnosis.

---

## Documentation index

| Document | Audience |
|---|---|
| [README.md](./README.md) | Humans, reviewers, coding agents (this file) |
| [docs/assets/](docs/assets/) | Landing screenshot + architecture SVG/PNG |
| [docs/architecture.md](docs/architecture.md) | Engines, confirmation handoff, ER sketch |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, enums, invariants |
| [docs/API.md](docs/API.md) | HTTP contract, errors, actions |
| [docs/SECURITY.md](docs/SECURITY.md) | Threats, session, CSRF, RBAC |
| [docs/deploy.md](docs/deploy.md) | Environments, migrate, host |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbooks, backup, incidents |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Branches, migrations, review |
| [docs/detailed-project-understanding.md](docs/detailed-project-understanding.md) | Stack fundamentals, workflows, vendor keys |
| [docs/env-keys.md](docs/env-keys.md) | Required `.env` + optional vendor keys (no deploy) |
| [docs/team-integration-handoff.md](docs/team-integration-handoff.md) | Krishna UI + adapter seams |
| [docs/krishna-manual-qa.md](docs/krishna-manual-qa.md) | Manual UI checklist (fixture-oriented) |
| [DealFlow360_Team_Execution_Blueprint-krishna.md](./DealFlow360_Team_Execution_Blueprint-krishna.md) | Original team plan |
| [memory.md](./memory.md) | Dated work log (do not treat as spec) |
| [AGENTS.md](./AGENTS.md) | Implementation constraints for agents |
| `.env.example` | Env template |
| `prisma/schema.prisma` | Schema source of truth |

---

## Ownership and team

**Team Orion Catchers.** One lane branch per owner. Ruchir owns schema, migrations, `src/server/lib/db/`, package/lockfile/CI.

| Owner | Lane | Paths |
|---|---|---|
| Krishna | Shell, login, builder, recommendations, portal | `src/components/application`, `src/features/{builder,recommendations,portal}`, `src/contracts/krishna.ts` |
| Ruchir | Prisma, auth, billing, payments, CI | `prisma/`, `src/server/lib/auth`, billing services |
| Atharva | Quotes, pricing, approval, confirm, health, audit | `src/server/quotes`, `src/server/governance`, `src/server/health` |
| Harsh | Catalog, customers, inventory, reports, architecture docs | `src/server/{catalog,inventory,reports}`, `src/contracts/harsh.ts` |

Schema changes are **additive**. Never edit a merged migration. Ask Ruchir before model changes.

---

## Known limitations

- Live command idempotency for some actions still uses an in-process map; receipts/payments use durable `RequestKey` where wired. Restarting Node can change replay behavior for the in-memory map.
- Due billing and health refresh: staff buttons **and** `npm run jobs` / `POST /api/jobs/run`.
- Card checkout is optional (`STRIPE_SECRET_KEY`). Books payments always work.
- Demo walkthrough status cells may lag code; trust CI + this README’s verify table.
- `package-lock.json` may exist beside `pnpm-lock.yaml`; **CI uses pnpm**.
- Catch-all login cookie `maxAge` is 8 hours; `SESSION_MAX_AGE_SECONDS` in session helper is 7 days — treat 8 hours as the catch-all login TTL unless unified.

---

## Roadmap (optional vendors, not required for demo)

Paste keys from [docs/env-keys.md](docs/env-keys.md) when you want live email, Stripe cards, Google SSO, or a carrier HTTP overlay. Core fulfillment and reports already run locally. Hosted deploy is optional.

---

<div align="center">

*Review this repository on: **data model, canonical engines, revision safety, RBAC, fail-closed adapters, and demo integrity** — in that order.*

</div>
