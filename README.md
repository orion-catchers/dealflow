<div align="center">

# ***DealFlow360***

**Live path:** catalog → quote → approval → portal → confirm → fulfillment → billing → reports, on one PostgreSQL database.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)

**Academic team project** · Team Orion Catchers (4 owners) · Demo tenant Nexa Office Solutions  
**Phase:** core live path implemented; this README prepared for external review as of 6 September 2026. Optional Stripe / Resend / Google / live carrier HTTP stay **503** until keys are set.

</div>

DealFlow360 is a B2B quote-to-cash workspace for a seller (demo: Nexa Office Solutions): sales configures a quotation from the catalog and customer price list, policy decides whether manager and/or finance must approve, the customer accepts **one current revision** in a restricted portal, then finance allocates stock and bills from the same database. Previews do not reserve stock or create invoices.

**How to read this file:** start with the [verification checklist](#what-a-reviewer-must-verify-first), then [Known limitations](#known-limitations), then [Architecture](#architecture-at-a-glance) and [API](#api-surface). Do not treat the opening summary as evidence. Claims are what the checklist and `docs/` can falsify.

**Documentation policy:** this README is for reviewers. `docs/` holds the full reference. Where a table appears in both, **`docs/` is authoritative.** Academic project — see [LICENSE](./LICENSE) (not licensed for reuse).

---

## Table of contents

1. [What a reviewer must verify first](#what-a-reviewer-must-verify-first)
2. [Known limitations](#known-limitations)
3. [Implemented capabilities](#implemented-capabilities)
4. [What is DealFlow360?](#what-is-dealflow360)
5. [Non-goals](#non-goals)
6. [Design principles](#design-principles-acceptance-criteria)
7. [Live feature demos](#live-feature-demos)
8. [Tech stack](#tech-stack)
9. [Architecture at a glance](#architecture-at-a-glance)
10. [Prerequisites](#prerequisites)
11. [Quick start](#quick-start)
12. [Seed accounts](#seed-accounts)
13. [Repository layout](#repository-layout)
14. [Capabilities by role and module](#capabilities-by-role-and-module)
15. [Data model](#data-model)
16. [API surface](#api-surface)
17. [API versioning and compatibility](#api-versioning-and-compatibility)
18. [Environment variables](#environment-variables)
19. [Adapters](#adapters-live-vs-development-fixture)
20. [Concurrency and scale](#concurrency-and-scale)
21. [Common commands](#common-commands)
22. [Testing](#testing)
23. [Security model](#security-model)
24. [Deployment](#deployment)
25. [Operations and incident response](#operations-and-incident-response)
26. [Documentation index](#documentation-index)
27. [Ownership and team](#ownership-and-team)
28. [Optional vendors](#optional-vendors)
29. [License](#license)

---

## What a reviewer must verify first

If an item fails, do not treat the corresponding claim as demonstrated.

| # | Requirement | How to verify | Pass looks like |
| --- | --- | --- | --- |
| 1 | One app, one database | `package.json`, `prisma/schema.prisma`, compose file | Next.js + Postgres 16 only |
| 2 | Live path has no silent fixture fallback | `src/server/adapters.ts` | `DEALFLOW_ADAPTER=development` only when `NODE_ENV !== production`; missing `DATABASE_URL` → **503 INTEGRATION_REQUIRED** |
| 3 | Money and percentages | Contracts + API payloads | Money is decimal **strings**; percentages **0..100** |
| 4 | Quote mutations are revision-safe | POST bodies on quote/portal actions | `expectedRevision` required; stale → **409 STALE_REVISION** |
| 5 | Commitment rule | Confirm + allocate (sequence under [Design principles](#design-principles-acceptance-criteria)) | Confirm creates Order + billing/fulfillment **init**; **no** `Stock.reserved` increment until allocate |
| 6 | Portal isolation | Two customer accounts | Acme cannot read Beta quotes (**404**); portal JSON has no cost/margin/rep internals |
| 7 | Signup is not privileged | POST `/api/auth/signup` | Creates **PENDING**; cannot sign in until an admin activates |
| 8 | CSRF on mutations | POST with `Origin: http://evil.example` | **403 ORIGIN** when Origin is present and mismatched |
| 9 | Session is httpOnly | Login `Set-Cookie` | `dealflow_session` / `dealflow-session` httpOnly, not readable from JS |
| 10 | CI is the source of type/lint/test/build | `.github/workflows/ci.yml` | validate → migrate → seed twice → typecheck → lint → test → build |
| 11 | Demo credentials never in production | This README + `.env.example` | Passwords in [docs/testing-credentials.md](docs/testing-credentials.md); `SESSION_SECRET=change-me` is local-only |

Deeper contracts: [docs/architecture.md](docs/architecture.md), [docs/API.md](docs/API.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

---

## Known limitations

Gaps the authors are aware of. Absence from this table is not a guarantee.

| Area | Current behavior | Not yet handled |
| --- | --- | --- |
| Concurrent stock allocate | Accept/allocate runs inside `prisma.$transaction` (default Postgres **Read Committed**). The unique key is `(warehouseId, variantId)`. Available stock is re-read then `reserved` is incremented in application code (`commitAllocations`). There is **no** `SELECT … FOR UPDATE` and **no** DB `CHECK (onHand >= reserved)`. | Two concurrent allocate transactions can both observe the same available qty (lost update / oversell window). Not load-tested. |
| Interrupted `prisma migrate deploy` | Prisma records applied migrations in `_prisma_migrations`. Rollback is restore-from-backup if a migration is not backward-compatible ([docs/OPERATIONS.md](docs/OPERATIONS.md)). | No automated mid-deploy recovery or expand/contract playbook beyond “restore snapshot taken before migrate.” |
| Action bus / `runLiveCommand` | Failures return the API error envelope. Some commands replay via durable `RequestKey`; others use an **in-process** map. | No retry/backoff. Process restart loses in-memory idempotency. Same `requestKey` + different payload → **409 KEY_REUSE** where wired. |
| Reports / export | Filters then aggregates **stored** quote/order totals in process (`src/server/reports`). Export uses the same filtered row set. | Not proven free of N+1 at the Prisma layer under large tenants. Unsuitable as a warehouse-scale BI extract. |
| Approval chain | Policy chain steps may be stored with unique `stepIndex`, but allowed roles are **`SALES_MANAGER` then `FINANCE` only**. Seeded Gold/hardware/services ceilings drive 0–2 steps. | Arbitrary N-level chains, extra roles, or parallel approvers are not implemented. |
| Timezones | Billing periods and many dates are **date-only**. Audit timestamps are UTC. Display uses the browser locale (e.g. `en-IN`). | No per-user timezone; a period that is “today” in IST vs UTC is not modeled. |
| Login rate limit | Dedicated LIVE login: **5 failures / 10 minutes per email**, in-memory on that Node process (`src/server/lib/auth/rate-limit.ts`). | Not shared across instances. Catch-all login path does not use the same limiter. Signup is **not** rate-limited. Email-keyed lockout can be used as a targeted denial of sign-in. |
| CSRF / Origin | Catch-all POST: if `Origin` is **present** and mismatches → **403**. If `Origin` is **absent**, catch-all does **not** reject. Dedicated lane routes differ; production scripts should send Origin/Referer. | Legacy or non-browser clients with no Origin on the catch-all are not origin-bound. |
| Session cookies | LIVE dedicated login sets `dealflow_session` (`SameSite=Lax`, **7 days**) and `dealflow-session` (`SameSite=Strict`, **8 hours**). Catch-all login sets **both** to Strict / 8 hours. Stored value is SHA-256 of the token. | No idle timeout, no rotation on each request, two max-age policies. |
| Validation | Lane REST auth bodies use **Zod**. Catch-all login/signup coerce `String(body.email)` without Zod. | Not every mutation on the catch-all is Zod-validated. |
| API versioning | Unversioned `/api/*`. Compatibility for open quote tabs is **`expectedRevision`**, not URL versions. | No deprecation window or `/v1` prefix. |
| Optional vendors | Stripe / Resend / Google / `CARRIER_QUOTE_URL` return **503 INTEGRATION_REQUIRED** without keys. Books payment and password login work. | Not a substitute for a card-acquiring or ESP production integration. |
| Scale | Single Next.js process + one Postgres. `PrismaPg` uses the `pg` Pool **defaults** (typically max 10). | **Not load-tested.** Intended for demo / mentor-review traffic, not a published SLA. |

---

## Implemented capabilities

What the live path implements when `DATABASE_URL` is set and `DEALFLOW_ADAPTER` is unset. This table is a map, not a completeness certificate. Gaps: [Known limitations](#known-limitations).

| Stage | Implemented |
| --- | --- |
| Catalog & customers | Products, variants, price lists, companies, warehouses, tax snapshots |
| Quote | Canonical price, line discounts persisted on save, revision + `expectedRevision` |
| Policy & approval | Bronze / Silver / Gold ceilings; manager then finance when required |
| Send & portal | Customer-scoped terms, proposals, date review, accept current revision |
| Confirm | Order + billing init + fulfillment header; **no** stock reserve |
| Fulfillment | Preview split → allocate → ship → deliver |
| Billing | Invoices, recorded payments, subscriptions, due run |
| Health & reports | Flags/tasks after refresh; on-screen rows intended to match XLSX/PDF |

UI walk order: [docs/recording-script.md](docs/recording-script.md). HTTP probe notes: [docs/full-cycle-audit.md](docs/full-cycle-audit.md). Logins: [docs/testing-credentials.md](docs/testing-credentials.md).

---

## What is DealFlow360?

Sales builds a quotation from the **canonical catalog and customer price list**. Policy evaluation decides whether manager and/or finance approval is required. The customer reviews terms in a **restricted portal**, may propose changes (new revision), and may accept **only the current revision**. Acceptance plus valid approval (or approval not required) creates an **immutable order**. Warehouse split and billing totals may be shown as **Preview** before that moment. After confirmation, Finance allocates stock, ships, invoices, records payments, and runs recurring billing. Deal health and reports read stored records; they do not re-price.

It is not a CRM, ERP purchasing module, or card-acquiring gateway.

| Surface | Who | Routes |
| --- | --- | --- |
| Public entry | Anyone | `/`, `/login`, `/signup` |
| Staff workspace | ADMIN, SALES_REP, SALES_MANAGER, FINANCE | `/home`, `/quotes`, `/pipeline`, `/approvals`, `/fulfillment`, `/subscriptions`, `/invoices`, `/health`, `/reports`, `/products`, `/settings/*` |
| Customer portal | CUSTOMER | `/portal`, `/portal/quotes/:id`, `/portal/orders/:id`, `/portal/invoices/:id` |

![Public landing route (/), unauthenticated](docs/assets/landing-public.png)

*Public landing route (`/`), unauthenticated.*

---

## Non-goals

Do not grade the product against hosted vendor accounts you have not configured.

- Local Docker + `.env` is the intended demo. Keys: [docs/env-keys.md](docs/env-keys.md).
- Card **collection** needs `STRIPE_SECRET_KEY`. Without it, payments are **recorded** in the books.
- Outbound email needs Resend or `MAIL_WEBHOOK_URL`; otherwise non-production **logs** the message.
- Google SSO needs client id/secret; password login is the demo path.
- Display currency is **INR**; `/api/fx` is a labeled Preview, not a second ledger.
- No microservices, message queues, or second database
- Products are archived, not deleted
- The browser is not the system of record for totals, tax, or approval outcomes

---

## Design principles (acceptance criteria)

| Principle | How it shows up | Fail if |
| --- | --- | --- |
| Canonical engines, not UI math | Pricing, policy, confirmation, split, billing calendars under `src/server/` and `src/features/{quotes,recommendations,portal}` | A React component is treated as the ledger |
| Revision is the unit of truth | Mutations carry `expectedRevision`; material change → new revision | Confirm succeeds on an old revision |
| Preview ≠ commit | Fulfillment/billing previews labeled Preview | GET preview changes `reserved` |
| Confirm then allocate | `confirm` → Order + init with **zero** reservations; `allocate` is separate | Confirm increments `Stock.reserved` |
| Idempotent money writes | `requestKey` on payments, receipts, allocation accept, due billing (where wired) | Same key + different payload succeeds |
| Customer allowlist | Portal reconstructs responses | Portal JSON contains `marginPct` / `unitCost` / another customer’s quote |
| Fail closed | Production never loads `src/development/*` | `NODE_ENV=production` + development adapter serving JSON |
| RBAC on the server | Route handlers and `runLiveCommand` `roles()` | Hiding a nav link is treated as security |

Team rule: create an order only when the **same current revision** has valid required approvals (or none required) **and** customer acceptance.

### Quote revision lifecycle

Maps to **Revision is the unit of truth**. UI stage names differ (`UNDER_NEGOTIATION`, `PENDING_APPROVAL`); this diagram uses the reviewer vocabulary from the rules below.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Sent: sales sends quote to customer
  Sent --> Proposed: customer proposal (financial or date-only)
  Proposed --> Approved: financial change, new revision, eval NOT_REQUIRED or APPROVED
  Proposed --> PendingApproval: financial change, new revision, eval PENDING
  Proposed --> Sent: date-only: dateReviewPending=true, no revision increment
  PendingApproval --> Approved: SALES_MANAGER then FINANCE approve
  PendingApproval --> Rejected: either step rejects
  Rejected --> Draft: sales revises
  Rejected --> Sent: sales revises and resends
  Approved --> Accepted: customer accepts SAME current revision
  Accepted --> Order: immutable Order created
  Order --> [*]

  note right of Proposed
    Stale expectedRevision on Draft/Sent
    while a customer is mid-review of an
    old revision → 409 STALE_REVISION
    (not a separate state).
  end note

  note right of PendingApproval
    Manager must act first; finance
    cannot skip. Date-only proposals
    block Accepted until staff clears
    dateReviewPending.
  end note

  note right of Order
    Order creation requires: same current revision
    + valid approval (or none required)
    + customer acceptance.
    Material change always creates a new revision.
  end note
```

### Confirm → allocate sequence

Maps to **Confirm then allocate** and checklist row 5.

```mermaid
sequenceDiagram
  actor Customer as Customer (Portal)
  participant PortalAPI
  participant GovernanceEngine
  participant BillingEngine
  participant FulfillmentEngine
  participant Database
  actor FinanceUser

  Customer->>PortalAPI: confirm current quote revision
  PortalAPI->>Database: current revision == expectedRevision?
  alt stale expectedRevision
    Database-->>PortalAPI: mismatch
    PortalAPI-->>Customer: 409 STALE_REVISION
  else current revision
    PortalAPI->>GovernanceEngine: approval valid or NOT_REQUIRED?
    alt approval invalid
      GovernanceEngine-->>PortalAPI: reject
      PortalAPI-->>Customer: reject
    else approval OK
      PortalAPI->>Database: create immutable Order
      PortalAPI->>BillingEngine: initializeBilling
      Note right of BillingEngine: PENDING/init billing record<br/>no invoice created yet
      BillingEngine->>Database: persist billing init
      PortalAPI->>FulfillmentEngine: initializeFulfillment
      Note right of FulfillmentEngine: fulfillment header only<br/>Stock.reserved is NOT incremented here
      FulfillmentEngine->>Database: persist fulfillment header
      PortalAPI-->>Customer: Order confirmed
    end
  end

  Note over Customer,Database: PREVIEW/CONFIRM DOES NOT RESERVE STOCK — ALLOCATE IS A SEPARATE, EXPLICIT ACTION.

  FinanceUser->>FulfillmentEngine: allocate (later, separate action)
  FulfillmentEngine->>Database: re-check available stock
  FulfillmentEngine->>Database: increment Stock.reserved (warehouse, variant)
  Note over FinanceUser,Database: Same requestKey replay does not double-reserve
```

---

## Live feature demos

Shoot order: [docs/recording-script.md](docs/recording-script.md). Seeded Gold numbers: [docs/demo-walkthrough.md](docs/demo-walkthrough.md).

1. **Within ceiling** — Arjun quotes Acme (Gold) inside hardware/service ceilings. Neha accepts that revision. One Order. Replay with the same `requestKey` returns the same order.
2. **Exception discount** — Discount above ceiling → `PENDING` with `SALES_MANAGER` then `FINANCE`. Sana cannot be skipped. Farah cannot act while the manager step is open. Stale `expectedRevision` → **409**.
3. **Preview vs allocate** — Fulfillment Preview does not change `reserved`. Allocate writes reservations. Repeat same `requestKey` must not double-reserve (where RequestKey is wired).
4. **Isolation** — Neha cannot open Rohan’s quote (**404**). Financial proposals create a new revision. A delivery-date-only proposal sets `dateReviewPending` and blocks acceptance until staff reviews.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime / app | Node.js **24**, Next.js **16.3.4** App Router, React **19.2**, Tailwind **4** |
| Data | PostgreSQL **16**, Prisma **7.10** + `@prisma/adapter-pg` + `pg` **8.23** |
| Money on the wire | Decimal **strings**; `Decimal(14,2)` in Postgres |
| Auth | Server session; token hashed SHA-256 in `Session` |
| Validation | Zod **4.5** on lane REST auth (and other lane bodies); catch-all is mixed |
| Tests | Vitest **5**; Krishna `tests/*.test.mjs` (node:test) |

CI: GitHub Actions, Postgres service, `pnpm install --frozen-lockfile`. Package manager field: **pnpm 11.3.0**. `npm run` works locally for the same scripts.

---

## Architecture at a glance

![DealFlow360 layered architecture: browser shells, Next.js APIs and six engines, PostgreSQL 16](docs/assets/architecture.svg)

*Trust boundary: Layer 1 (staff UI, customer portal, landing) is **untrusted input**. Layers 2–3 (route handlers, engines, PostgreSQL) are **trusted**. The arrow between them is the only place cookies and JSON enter the server.*

| Engine | Owner | Responsibility |
| --- | --- | --- |
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
| --- | --- |
| Node.js | **24** |
| pnpm | **11.3.0** (`corepack enable` then `corepack prepare pnpm@11.3.0 --activate`) |
| Docker Desktop | Compose v2 (local Postgres) |
| Git | 2.x |

Windows 10/11 (PowerShell) and Linux CI (`ubuntu-latest`). If host **5432** is busy, use **5434** in **both** `DEALFLOW_DB_PORT` and `DATABASE_URL`.

---

## Quick start

Scripts work with **pnpm** (CI) or **npm**. Do **not** set `DEALFLOW_ADAPTER=development` for the live Nexa demo.

### 1. Install

```bash
git clone https://github.com/orion-catchers/dealflow.git
cd dealflow
pnpm install
# or: npm install
```

### 2. Environment

```bash
cp .env.example .env
```

PowerShell: `Copy-Item .env.example .env`

`DATABASE_URL` host port must match `DEALFLOW_DB_PORT`:

```text
DEALFLOW_DB_PORT=5432
DATABASE_URL="postgresql://dealflow:dealflow@localhost:5432/dealflow?schema=public"
SESSION_SECRET="change-me"
```

### 3. Postgres 16

```bash
pnpm db:up
# existing container: docker start dealflow-postgres
```

Login **ECONNREFUSED** means Postgres is stopped.

### 4. Schema + seed

```bash
pnpm db:deploy
pnpm db:seed
```

Do **not** run `pnpm db:reset` on a shared or production database.

### 5. Run

```bash
pnpm dev
# or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Login **Demo fill**: Rep, Manager, Finance, Customer.

**Reviewer trap:** `pnpm dev:fixture` is a JSON harness. It does not prove Postgres. Label the UI `LIVE` vs `DEV FIXTURE`.

---

## Seed accounts

Full table (authoritative): [docs/testing-credentials.md](docs/testing-credentials.md). Demo-only; never production.

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Admin | `dev@nexa.example` | `admin-nexa-2026!` | `/home` |
| Sales rep | `arjun@nexa.example` | `arjun-nexa-2026!` | `/home` |

Prisma row IDs are generated; `src/server/lib/db/map.ts` maps fixture symbols to emails/SKUs.

---

## Repository layout

```text
dealflow/
├── prisma/                      schema, migrations, seed
├── src/
│   ├── app/                     App Router (pages + api)
│   ├── components/application/  Workspace UI
│   ├── development/             Fixture adapter (dev-only)
│   ├── features/                Lane UIs + zod
│   ├── fixtures/                Seed data + optional synthetic JSON
│   ├── proxy.ts                 Cookie presence redirect (Next.js 16)
│   └── server/                  Engines, live adapter, auth, db
├── public/                      Landing background bg-image.png
├── docs/                        Reference (authoritative tables)
├── tests/                       Krishna node:test suites
├── docker-compose.yml
└── README.md
```

---

## Capabilities by role and module

Prisma `Role`: `ADMIN`, `SALES_REP`, `SALES_MANAGER`, `FINANCE`, `CUSTOMER`. The staff UI may label finance as `FINANCE_OPS`. Nav hiding is not authorization.

| Module | Capability | Rep | Manager | Finance | Admin | Customer |
| --- | --- | --- | --- | --- | --- | --- |
| Quotes | Create/edit lines, save, submit, send | ✅ scoped | ❌ | ❌ | ✅ | Propose only |
| Quotes | Read scoped / assigned | ✅ | ✅ | ✅ read | ✅ | Own via portal |
| Approvals | Decision when assigned | ❌ | ✅ | ✅ | ✅ | ❌ |
| Portal | Confirm current revision / proposal | ❌ | ❌ | ❌ | ❌ | ✅ |
| Fulfillment | Preview | — | — | ✅ | ✅ | ❌ |
| Fulfillment | Allocate / ship / receive | ❌ | ❌ | ✅ | ✅ | ❌ |
| Billing | Record payment / run due | ❌ | ❌ | ✅ | ✅ | Own invoice PDF |
| Catalog | Products, customers, price lists | ❌ | ❌ | ❌ | ✅ | ❌ |
| Policy / health settings | Mutate | ❌ | ✅ | ❌ | ✅ | ❌ |
| Reports | Filtered export | staff | staff | staff | staff | Own invoice PDF |
| Fixture reset | Dev adapter only | ❌ | ❌ | ❌ | Fixture only | ❌ |

Sales reps are scoped by `repId`. Portal reads require membership for that customer.

---

## Data model

**Source of truth:** `prisma/schema.prisma`. Overview: [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

- One **Order** per accepted quote revision
- **RequestKey** unique on `(scope, key)`
- **Stock** unique `(warehouseId, variantId)`; `onHand ≥ reserved ≥ 0` is **application-enforced**, not a SQL CHECK
- Products archived, not deleted

Money: `Decimal(14, 2)`. Percentages: `Decimal(5, 2)`, range 0–100. Billing periods are date-only. Audit timestamps are UTC.

### Core data model (partial)

Selected tables only — full schema in `prisma/schema.prisma`. Prisma `Stock.onHand` / `reserved` are **Int** unit counts (not money decimals). `Quote.revision` in this sketch is `DealRevision.revisionNumber` / current revision in the live schema.

```mermaid
erDiagram
  Quote {
    string id PK
    string customerId
    string repId
    int revision
    string status
    datetime createdAt
  }
  Order {
    string id PK
    string quoteId FK "one Order per accepted quote revision"
    datetime createdAt
  }
  Stock {
    string id PK
    string warehouseId
    string variantId
    int onHand
    int reserved
  }
  RequestKey {
    string id PK
    string scope
    string key
    json resultPayload
  }
  Warehouse {
    string id PK
    string code
  }
  ProductVariant {
    string id PK
    string sku
  }
  Quote ||--o| Order : "accepted revision becomes"
  Warehouse ||--o{ Stock : "holds"
  ProductVariant ||--o{ Stock : "tracked as"
  Order ||--o{ RequestKey : "idempotency scope includes"
```

*Stock unique `(warehouseId, variantId)`. `onHand >= reserved` enforced in application code, **not** a DB CHECK constraint (see Known Limitations). RequestKey unique `(scope, key)`.*

---

## API surface

Envelope: success `{ data, mode }` where `mode` is `LIVE` or `DEV FIXTURE`. Error `{ error: { code, message, details? } }` with HTTP **401 / 403 / 404 / 409 / 422 / 503**.

Two HTTP layers (both must stay consistent):

1. **Catch-all** `src/app/api/[...path]/route.ts` — `/api/workspace`, `/api/actions`, `/api/portal`, `/api/recommendations`, `/api/export`
2. **Lane REST** — `src/app/api/{auth,products,quotes,fulfillment,invoices,...}`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ email, password }` → `{ actor }` + cookies |
| GET | `/api/workspace` | Scoped staff snapshot |
| POST | `/api/actions` | `{ action, requestKey, … }` |
| GET/POST | `/api/portal…` | Customer snapshot / proposal / confirm |
| GET | `/api/fulfillment/:orderId/preview` | Read-only split |

Actions include `saveQuote`, `removeLine`, `submitQuote`, `sendQuote`, `setCustomerTier`, `allocate`, `refreshHealth`, `payment`. Live `reset` is **403**. Full contract: [docs/API.md](docs/API.md).

---

## API versioning and compatibility

`/api/*` has **no** version prefix (`/v1`) and **no** published deprecation policy.

An open browser tab that still holds an old quote revision is handled at the **data** layer: mutations require `expectedRevision`. A stale tab receives **409 STALE_REVISION** and must reload. That is the compatibility mechanism, not API versioning.

Breaking JSON field changes would not be gated by a URL version today.

---

## Environment variables

Copy `.env.example` → `.env`. Never commit `.env`. Authoritative list: [docs/env-keys.md](docs/env-keys.md).

| Name | Required to boot live | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Must match Docker host port (`DEALFLOW_DB_PORT`) |
| `SESSION_SECRET` | Auth | `openssl rand -hex 32`; `change-me` is local-only |
| `NODE_ENV` | Host | `production` rejects development adapter and `x-dev-actor` |

`DEALFLOW_ADAPTER=development` is the fixture harness, not the live demo.

---

## Adapters (live vs development fixture)

### Adapter selection (fail-closed)

```mermaid
flowchart TD
  start["Request arrives, getAdapter() called"]
  d1{"NODE_ENV !== production AND DEALFLOW_ADAPTER === development?"}
  fixture["Load src/development/adapter.ts<br/>mode: DEV FIXTURE<br/>Never in production"]
  failClosed["Blocked entirely when NODE_ENV=production<br/>this is the fail-closed guarantee"]
  d2{"DATABASE_URL set?"}
  live["Load src/server/live/adapter.ts<br/>mode: LIVE"]
  fail["Return 503 INTEGRATION_REQUIRED"]

  start --> d1
  d1 -->|Yes| fixture
  fixture --- failClosed
  d1 -->|No| d2
  d2 -->|Yes| live
  d2 -->|No| fail

  classDef warn fill:#f4e3b2,stroke:#98621b,color:#3d2e0a
  classDef ok fill:#d8efe6,stroke:#217653,color:#0d3d2c
  classDef bad fill:#f8d4d0,stroke:#aa382d,color:#5c1510
  classDef note fill:#fff8e8,stroke:#c4a35a,color:#3d2e0a
  class fixture warn
  class live ok
  class fail bad
  class failClosed note
```

**Reviewer trap:** `pnpm dev:fixture` is not a database proof.

---

## Concurrency and scale

**Target:** one Node process, mentor/demo traffic, on the order of a handful of concurrent UI users. **Not load-tested.**

Stock uniqueness is a unique index on `(warehouseId, variantId)`. Allocation increments `reserved` after an availability read inside `prisma.$transaction` (Read Committed). That does **not** serialize two concurrent allocates on the same row the way `SELECT FOR UPDATE` would. Treat oversell under concurrent finance clicks as an open risk (see Known limitations).

Prisma uses `@prisma/adapter-pg` with a `pg` `Pool` constructed from `DATABASE_URL` only — **no custom `connection_limit`**. Default `pg` pool size applies (commonly 10).

---

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install + `prisma generate` |
| `pnpm dev` | Next.js :3000 (needs Postgres for LIVE) |
| `pnpm dev:fixture` | JSON adapter |
| `pnpm db:up` / `docker start dealflow-postgres` | Postgres |
| `pnpm db:deploy` / `pnpm db:seed` | Migrate / Nexa seed |
| `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` | Checks |
| `pnpm synthetic:seed` | Add-only `src/fixtures/dealflow360_synthetic_dataset.json` |
| `pnpm db:reset` | **Drop** DB — never on shared/prod |
| `pnpm jobs` | Due billing / health (`JOBS_ACTOR_EMAIL`) |

---

## Testing

| Layer | How | What it proves |
| --- | --- | --- |
| Engine + services | `pnpm test` (Vitest) | Pure engines and services in-process |
| Krishna fixture | `pnpm test:krishna` | Fixture allowlist / replay, not LIVE DB |
| CI | workflow | migrate, seed twice, tsc, eslint, next build |
| Browser / HTTP | [docs/recording-script.md](docs/recording-script.md), [docs/krishna-manual-qa.md](docs/krishna-manual-qa.md) | Not implied by Vitest |

Isolated Vitest **does not** prove Postgres, cookies, or browser behavior.

---

## Security model

Summary. Threat model: [docs/SECURITY.md](docs/SECURITY.md).

**Passwords:** Node `crypto.scrypt` (promisified). 16-byte random salt, 64-byte derived key, stored as `scrypt$<saltHex>$<hashHex>`. Options object is omitted, so Node defaults apply (**N=16384, r=8, p=1**). Verify uses `timingSafeEqual`. This is not bcrypt or Argon2.

**Session token:** `crypto.randomBytes(32)` encoded as hex (64 characters). Database stores **SHA-256** of the token (`tokenHash`). Cookie is httpOnly. `dealflow_session` max-age **7 days**, SameSite **Lax** (dedicated login helper). `dealflow-session` max-age **8 hours**, SameSite **Strict** on several paths. Expiry is absolute (`expiresAt`); **no idle timeout**; **no per-request rotation**. Expired rows are deleted on a sampled login (every 20th `createSession`), not by a dedicated job.

**Login throttling:** LIVE dedicated login only — 5 failures / 10 minutes / email, in-memory. Signup: no limiter. See Known limitations.

**CSRF:** Catch-all POST rejects a **present, mismatched** Origin. Missing Origin on catch-all is allowed. Production scripts should send Origin or Referer matching the app host.

**Input:** Zod on lane auth schemas (`loginSchema`, `signupSchema`, …). Catch-all auth uses string coercion. Money/quote lane bodies: see [docs/API.md](docs/API.md).

**Other:** `x-dev-actor` only with development adapter. Signup cannot select ADMIN. Portal JSON is allowlisted. SQL via Prisma parameterization.

### Request validation pipeline (mutating routes)

Verified against `src/app/api/[...path]/route.ts` and `runLiveCommand` for **POST `/api/actions`**. `src/proxy.ts` **does not** run on `/api/*` (matcher excludes it). Origin is enforced in the catch-all **after** `getAdapter()` and **before** JSON parse. Body is parsed **before** session. Zod is **not** on this catch-all path.

```mermaid
flowchart TD
  arrive["1. POST /api/actions hits Next.js route handler"]
  adapter["getAdapter() — see Adapter selection"]
  origin{"2. Origin present?"}
  originBad["403 ORIGIN if present and mismatched"]
  originGap["Missing Origin: catch-all proceeds<br/>known gap"]
  parse["3. JSON body parse — not Zod on catch-all"]
  session{"4. Session cookie → SHA-256 lookup"}
  unauth["401 invalid or expired"]
  rbac{"5. roles() for requested action"}
  forbid["403 unauthorized role"]
  rev{"6. expectedRevision vs current quote<br/>quote/portal mutations"}
  stale["409 STALE_REVISION"]
  rkey{"7. requestKey where wired"}
  reuse["409 KEY_REUSE if same key + different payload"]
  replay["Replay cached result if same key + same payload"]
  run["8. Handler / engine / DB transaction"]
  out["9. Envelope { data, mode }"]

  arrive --> adapter
  adapter --> origin
  origin -->|yes, mismatch| originBad
  origin -->|yes, match| parse
  origin -->|no| originGap
  originGap --> parse
  parse --> session
  session -->|fail| unauth
  session -->|ok| rbac
  rbac -->|fail| forbid
  rbac -->|ok| rev
  rev -.->|order not fully verified vs requestKey<br/>both live inside runLiveCommand| rkey
  rev -->|stale| stale
  rev -->|ok or N/A| rkey
  rkey -->|conflict| reuse
  rkey -->|replay| replay
  rkey -->|new| run
  replay --> out
  run --> out

  classDef bad fill:#f8d4d0,stroke:#aa382d
  classDef gap fill:#f4e3b2,stroke:#98621b
  class originBad,unauth,forbid,stale,reuse bad
  class originGap gap
```

Lane REST (auth, catalog, invoices) may run **Zod before** a handler-local RBAC check; that order is **not** the catch-all order above.

---

## Deployment

Runbook: [docs/deploy.md](docs/deploy.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

1. PostgreSQL **16** with backups you actually test.
2. `DATABASE_URL` + `SESSION_SECRET` from a secret manager (not Git).
3. `NODE_ENV=production`. Do not set `DEALFLOW_ADAPTER=development`.
4. `pnpm install --frozen-lockfile` → `pnpm db:deploy` → `pnpm build` → `pnpm start`.
5. Smoke with real users on production; seed emails only on labeled demo hosts.
6. Process up; `GET /api/auth/me` without cookie → 401. Do not use `/api/health` (deal flags) as a k8s liveness probe.

`pnpm db:reset` is forbidden against shared and production URLs.

---

## Operations and incident response

Full text: [docs/OPERATIONS.md](docs/OPERATIONS.md).

- **Backups:** not implemented inside this repo. Plan is managed-Postgres PITR/snapshots or `pg_dump` as documented in OPERATIONS.md. Restore is untested in CI.
- **Rollback:** redeploy the previous commit/image. If a migration is irreversible, restore the snapshot taken **before** `db:deploy`.
- **No worker queue:** due billing and health refresh are staff buttons or `pnpm jobs` / `POST /api/jobs/run`.
- **Example diagnosis — login works, invoices 404:** session is fine; check migrations, billing initialize, FINANCE/ADMIN role, and `/api/invoices` path.
- **503 INTEGRATION_REQUIRED:** missing `DATABASE_URL` (and fixture not enabled).
- **403 ORIGIN:** send a matching `Origin` header.

---

## Documentation index

| Document | Audience |
| --- | --- |
| [README.md](./README.md) | Reviewers (this file) |
| [docs/testing-credentials.md](docs/testing-credentials.md) | Demo logins |
| [data/](./data/) | Tester dummy dataset (298 Prisma-shaped rows; `pnpm tester:seed`) |
| [docs/env-keys.md](docs/env-keys.md) | Full env list |
| [docs/recording-script.md](docs/recording-script.md) | UI walk order |
| [docs/assets/](docs/assets/) | Architecture SVG + public landing screenshot |
| [docs/API.md](docs/API.md) | HTTP contract |
| [docs/SECURITY.md](docs/SECURITY.md) | Threats |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables |
| [docs/architecture.md](docs/architecture.md) | Engines |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbooks |
| [docs/deploy.md](docs/deploy.md) | Host |
| [docs/full-cycle-audit.md](docs/full-cycle-audit.md) | Probe notes |
| [docs/MENTOR_REVIEW.md](docs/MENTOR_REVIEW.md) | Oral map |
| [LICENSE](./LICENSE) | Academic; not for reuse |
| `prisma/schema.prisma` | Schema source of truth |

---

## Ownership and team

**Team Orion Catchers.** One lane branch per owner. Schema/migrations/lockfile/CI: Ruchir.

| Owner | Lane | Paths |
| --- | --- | --- |
| Krishna | Shell, login, builder, recommendations, portal | `src/components/application`, `src/features/{builder,recommendations,portal}` |
| Ruchir | Prisma, auth, billing, payments, CI | `prisma/`, `src/server/lib/auth`, billing |
| Atharva | Quotes, pricing, approval, confirm, health | `src/server/quotes`, `src/server/governance`, `src/server/health` |
| Harsh | Catalog, inventory, reports, architecture docs | `src/server/{catalog,inventory,reports}` |

Schema changes are additive. Do not edit a merged migration.

---

## Optional vendors

Keys: [docs/env-keys.md](docs/env-keys.md). Without them, those adapters return **503 / NOT CONNECTED**. Books payments, rate-card shipping, and password login do not require those keys.

---

## License

[LICENSE](./LICENSE): academic team project, all rights reserved, **not licensed for reuse**.

---

This system implements the live quote-to-cash path described above; known gaps are listed in [Known limitations](#known-limitations). Verify claims against the [checklist](#what-a-reviewer-must-verify-first), not against this sentence.
