# DealFlow360 — Detailed project understanding

This file is the long-form map of **what the product is**, **why this stack**, **the computer-science ideas you need**, and **how each live workflow actually runs**. Pair it with `prisma/schema.prisma` (columns), `docs/env-keys.md` (keys), and `docs/MENTOR_REVIEW.md` (oral exam). Isolated unit tests do **not** prove the browser or Postgres.

**Honesty labels**

| Label | Meaning |
|---|---|
| **LIVE** | Request hits PostgreSQL through Prisma (typical `npm run dev` with `DATABASE_URL`) |
| **DEV FIXTURE** | `DEALFLOW_ADAPTER=development` JSON store — not the Nexa demo |
| **NOT CONNECTED / 503** | Optional vendor path; paste the env key and the **same code path** talks to the vendor |

Local demo does **not** need Stripe, Google, Resend, or a public deploy.

---

## 1. What the product is

DealFlow360 is a **single Next.js application** (UI + API in one Node process) for **Nexa Office Solutions**: B2B quotes for laptops, docks, and support subscriptions.

**Governing promise:** the business does not create an order, invoices, subscriptions, or stock reservations until **the current quote revision** has valid approvals (or approval is not required) **and** the customer has accepted **that same revision**. Warehouse splits and billing calendars shown before that are **Preview**.

**The demo company story**

1. Arjun (sales) quotes **Acme** (Gold). Catalog resolve gives ProBook Standard **₹50,000.00** (cost 40,000).
2. Policy engine may require Sana (manager) and/or Farah (finance) if discounts exceed ceilings.
3. Neha (Acme) accepts in the portal.
4. Confirm creates an **Order**. Fulfillment starts **PENDING** with **zero reserved**. Confirm **blocks** if tracked qty > available; it still does not reserve.
5. Farah opens **Preview**: Main 6 laptops + docks, East 3 laptops, **1 laptop backorder**. **Accept** reserves. Later **receipt + consolidate** covers the leftover.
6. Ruchir’s billing: one-time invoice + subscription records. Payment is **books** unless Stripe keys are set.
7. Reports add up **stored** quote numbers; XLSX uses the same filters as the screen.

---

## 2. Why this stack (and what each piece is)

| Piece | Choice | Why here |
|---|---|---|
| **Next.js 16 App Router** | UI routes + `src/app/api/**` Route Handlers | One deployable, TypeScript end-to-end, no second “backend repo” |
| **React 19** | Client components for the staff shell | Interactive tables, forms, session-backed workspace |
| **TypeScript** | Strict types on contracts | Money, roles, and revision fields cannot silently become the wrong shape |
| **PostgreSQL 16** | One relational database | ACID transactions for confirm (order + billing init + fulfillment init) |
| **Prisma 7** | Schema + migrations + typed client | Team-owned additive migrations; engines stay DB-free |
| **Tailwind + shared tokens** | Compact light workspace | One visual language (Krishna); no second theme |
| **Zod** | Request parsing | Invalid JSON becomes `422 INVALID_INPUT`, not a 500 |
| **Vitest** | Engine tests | Pure functions without a browser |
| **Docker Compose** | Local Postgres | Same major version as production (16) |
| **exceljs / pdf-lib** | Report export | Same filtered dataset as the dashboard |

**What we deliberately did not use**

- Microservices or a message queue — one process, one DB.
- A second SPA on another port — the shell is `src/components/application/Application.tsx` mounted from `src/app/layout.tsx`.
- Browser-computed tax/totals as source of truth — the server reprices.
- Confirm-time stock reservation — reservation is Accept/Allocate only.

---

## 3. Fundamentals you need (computer science, applied)

### 3.1 HTTP request/response

The browser sends **HTTP** (method, URL, headers, optional JSON body). Next.js Route Handlers return JSON `{ data }` on success or `{ error: { code, message, details? } }` with 401/403/404/409/422/503.

**Idempotency:** mutating business writes carry a **`requestKey`**. The same key twice must not double-reserve or double-pay. Quote edits also carry **`expectedRevision`**: if someone else saved first, the server returns **409** so the UI reloads.

### 3.2 Cookies and sessions (not JWTs in the browser)

After password or Google login the server creates a **Session** row: it stores **SHA-256(token)**, not the token. The browser gets an **httpOnly** cookie (`dealflow_session`). JavaScript cannot read it; XSS cannot steal it as easily as `localStorage`. Each API call sends the cookie automatically (`credentials: "include"` / same-origin fetch).

**CSRF:** middleware checks Origin / Referer / `Sec-Fetch-Site` on mutating requests so a hostile site cannot ride the cookie.

### 3.3 RBAC (role-based access control)

`getAuthorizedActor` loads the user from the session, then `permissions.ts` matches the longest URL prefix:

| Role | Typical access |
|---|---|
| `SALES_REP` | Quotes, own reports, catalog read |
| `SALES_MANAGER` | Approvals, team reports |
| `FINANCE` | Fulfillment mutations, invoices, payments, receipts |
| `ADMIN` | Setup (products, warehouses, users) + everything finance needs |
| `CUSTOMER` | `/api/portal/*` only, scoped to their company |

A customer token on `/api/quotes` is **403**, not “empty list.”

### 3.4 ACID transactions

**Confirm** is one Postgres transaction: insert Order + lines, `initializeBilling`, `initializeFulfillment`. If any step throws, **nothing** commits. That is why we use PostgreSQL instead of “save three JSON files.”

### 3.5 ORM vs SQL

**Prisma** generates a client from `schema.prisma`. You write `prisma.quote.findUnique` instead of concatenating SQL. Migrations in `prisma/migrations/` are the history of the schema. **Never edit a merged migration.** Engines (`src/server/*/engine`) must **not** import Prisma so Vitest can run them on fixture objects.

### 3.6 Money and percentages

API money is a **decimal string** with two places (`"50000.00"`), never a float in JSON if we can avoid IEEE rounding. Percentages are **0..100** (12 means 12%, not 0.12). Currency on the demo ledger is **INR**. Reports may show USD/EUR as a labeled **Preview** via `GET /api/fx`.

### 3.7 Pure functions vs services

```
Browser
  → Route Handler (auth + Zod)
    → Service (roles, Prisma transaction, RequestKey, audit)
      → Engine (pure: same inputs ⇒ same outputs)
      → Repository (in-memory in tests; Prisma live)
        → PostgreSQL
```

If a React component writes `total = qty * price` as the system of record, that is a **fail**. Display may format; the server prices.

### 3.8 App Router vs the staff shell

`src/app/layout.tsx` mounts **`WorkspaceRoot` / `Application`**. Nested `src/app/(internal)/...` pages are **not** what staff see unless the shell renders them. Harsh fulfillment and reports are mounted **inside** `Application.tsx` for `/fulfillment` and `/reports`.

Client components (`"use client"`) run in the browser. Route Handlers run on the server. Secrets (`STRIPE_SECRET_KEY`) stay on the server.

### 3.9 Fail closed

Missing `DATABASE_URL` → workspace **503**. Missing Stripe key → checkout **503**. Production missing email → send **fails**, it does not silently pretend. Development without email **logs** the message so you can still reset passwords.

---

## 4. Runtime shape

```
Browser (staff shell or customer portal)
        │
        ▼
Next.js (one process)
  /api/auth/*          session login, signup, reset, Google SSO
  /api/workspace       Krishna shell snapshot (LIVE adapter if DATABASE_URL)
  /api/actions         shell mutations (quotes, allocate, payment, …)
  /api/quotes/*        Atharva canonical quote REST
  /api/catalog/resolve Harsh unit price
  /api/fulfillment/*   Engine 2
  /api/stock/receipts  receipts
  /api/reports*        aggregates + XLSX/PDF
  /api/invoices/*      billing
  /api/payments/*      books + Stripe checkout
  /api/jobs/run        cron (CRON_SECRET)
        │
        ▼
PostgreSQL 16  (Prisma)
```

`getAdapter()` (`src/server/adapters.ts`):

1. Non-production **and** `DEALFLOW_ADAPTER=development` → JSON fixture (**DEV FIXTURE**).
2. Else if `DATABASE_URL` → `src/server/live/adapter.ts` (**LIVE**).
3. Else → 503.

**Do not set `DEALFLOW_ADAPTER=development` for the Nexa demo.**

---

## 5. Team lanes (who owns what)

| Owner | Owns | Typical paths |
|---|---|---|
| **Krishna** | Shell, login look, home, quote UI, recommendations, portal | `src/components/application`, `src/features/{builder,recommendations,portal}` |
| **Ruchir** | Prisma, auth, billing, CI/package | `prisma/`, `src/server/lib/auth`, `src/server/billing` |
| **Atharva** | Quotes, policy, confirm, health, audit | `src/server/quotes`, `src/server/governance`, `src/server/health` |
| **Harsh** | Catalog, customers, warehouses, fulfillment, reports, this class of docs | `src/server/{catalog,inventory,reports}` |

Confirm is Atharva’s transaction; it **calls** Ruchir `initializeBilling` and Harsh `initializeFulfillment`.

---

## 6. Data model (mental ER)

You do not need every column. You need these **identities**:

- **Company** — tenancy (Nexa vs Contoso). Users, customers, products, warehouses belong to a company. Workspace queries filter by it.
- **User** + **Session** + **CustomerMembership** — who is logged in; customers map to a company card.
- **Customer** — tier (Bronze/Silver/Gold in the app; Prisma maps Bronze→STANDARD), currency, assigned rep, optional price list.
- **Product / Variant / TaxRate / PriceList / PriceRule** — catalog. `taxPct` is also snapshotted on quote lines so old quotes do not move when tax tables change.
- **Deal** — shared commercial identity (one per sales cycle). Quote is the compatibility-facing sales head; Order is the confirmed operational record. Revisions/lines are Prisma `DealRevision` / `DealLine` mapped to existing `QuoteRevision` / `QuoteLine` tables.
- **Quote** — mutable deal head used by `/api/quotes` and the UI. Creating a quote creates a `Deal` and sets `dealId` on each revision.
- **Approval** records — per revision; stale approvals die when the revision changes.
- **Order / OrderLine** — immutable commercial commitment after confirm.
- **Warehouse / StockLevel / Reservation / Backorder / Shipment** — Engine 2. Available = onHand − reserved.
- **Invoice / InvoiceLine / Payment / Credit / Subscription** — Engine 3. First recurring invoice comes from **due run**, not confirm.
- **RecommendationRule** — ranked suggestions; jobs can update `copurchaseScore`.
- **HealthFlag / Task** — stalled deals.
- **RequestKey** — durable idempotency where wired (payments, receipts).
- **PasswordResetToken** — hashed token, 30 minutes.
- **Audit** events — who did what.

---

## 7. How a line of business logic actually runs

### 7.1 Catalog unit price (Acme ₹50,000)

**UI:** quote builder, product + variant + qty → `POST /api/catalog/resolve` `{ customerId, productId, variantId, quantity }`.

**Engine:** `src/server/catalog/engine/resolve-price.ts`

1. Choose **price list**: customer’s list if active, else active list for **tier + currency**.
2. Find the **most specific rule** for that product (and variant if present).
3. Basis `BASE` | `FIXED` | `DISCOUNT`, then add variant extra price/cost.
4. Attach tax from `TaxRate` (and denormalized `taxPct`).

Gold Acme + ProBook Standard is seeded to **50000.00** / cost **40000.00**. Adding the line calls Atharva `addLine`, which uses live `resolvedPrice` in the workspace adapter so the saved line matches.

### 7.2 Quote save, discount, policy

Atharva **prices** the revision (line discounts, order discount, tax, margin). Then **policy evaluation** compares discounts to ceilings (e.g. Gold 15, Hardware 15, Services 10). Output: `NOT_REQUIRED` | manager | finance chain, `worstExcess`, reasons.

Submit stores the evaluation. Approvers call `decision` with `expectedRevision`. **Material change → new revision**; old approvals do not apply.

### 7.3 Send + negotiate + accept

Send marks the quote sent, may set customer tier, emails Neha if mail is configured (`notifyQuoteSent`). Portal is **customer-scoped** and **allowlisted** (no cost, no other customers). Proposals create a **new revision**. Customer **confirm** is allowed only on the current revision with valid approvals.

### 7.4 Confirm (the commitment line)

`LiveQuoteService.confirm` / canonical persist:

1. Re-check revision, approvals, acceptance.
2. **Confirm-time stock cap:** tracked qty must be ≤ available (no reserve yet).
3. In one transaction: Order, `initializeBilling` (one-time invoice + subscription **records**, first recurring invoice later), `initializeFulfillment` (PENDING header).
4. Replay same `requestKey` → same order ids.

### 7.5 Fulfillment 6+3+1

**Preview** (`previewSplit`, GET detail includes `preview`): **writes nothing**.

Heuristic (not a solver): prefer one warehouse that covers all remaining demand; else greedy “covers most units,” then shipping **estimate** (rate card, optional live carrier overlay if `CARRIER_QUOTE_URL` is set). Leftover → **backorder**. Support/subscription lines are not stock-tracked.

Seeded stock: Main 6 laptops + 10 docks, East 3 laptops → Preview **1** laptop backorder.

**Accept** writes reservations (RESERVED) and planned shipments. Status often **PARTIAL** if a backorder remains.

**Receipt** `POST /api/stock/receipts`: on-hand up; returns eligible backorders. **Consolidate** allocates those without rewriting old shipments.

**Ship** decrements on-hand for reserved qty. **Deliver** marks shipment delivered.

UI: `/fulfillment` list + Stock receipt form; `/fulfillment/:id` Preview / Accept / Consolidate (Finance/Admin for mutations).

### 7.6 Billing and payment

Confirm → one-time invoice (UNPAID) + subscription row. `npm run jobs` or **Generate due invoices** creates the next recurring invoice.

**Record payment** posts a Payment with `requestKey`; cannot exceed outstanding after credits.

**Pay with card** (only if `STRIPE_SECRET_KEY`): see §9.

### 7.7 Recommendations

Krishna ranks `RecommendationRule` (margin, affinity, `copurchaseScore`). Add-to-quote is a quote mutation (new revision). Jobs learn co-purchase from **confirmed** quotes; this is counts/lift, **not** a neural net.

### 7.8 Deal health

Flags (stalled, missing follow-up, …) from stored quote/order state vs thresholds. Refresh is a button or job. Nudges email the assignee if mail is configured.

### 7.9 Reports (XLSX vs screen)

`GET /api/reports?period=THIS_MONTH&teamId=…` aggregates **stored** quote snapshots. `GET /api/reports/export&format=XLSX` uses the **same query**. Sales reps only see their quotes. Display currency Preview does not rewrite the database.

---

## 8. Auth workflows

**Password login:** email + password, lockout after failures, pending users cannot sign in. Seed passwords are per user (`arjun-nexa-2026!`, not `password123`) — see `docs/env-keys.md`.

**Signup:** creates PENDING user; Admin activates and assigns role.

**Password reset:** hashed token 30 minutes. `sendMail` → Resend or webhook if keys exist; otherwise **log** in non-production.

**Google SSO** (both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`):

1. `/api/auth/sso/google` sets a short-lived `state` cookie and redirects to Google.
2. Callback checks `state`, exchanges `code` for tokens, reads email from userinfo.
3. Email must match an **existing ACTIVE** user. Then session cookie, redirect `/home` or `/portal`.

Login shows “Sign in with Google” only when `/api/integrations/public` reports `googleSso: true`.

---

## 9. Optional vendor workflows (keys in `.env` → they run)

All of these are **implemented**. Without keys they **503** (or log email in dev). With keys they use the vendor HTTP API. You do **not** need them for the Nexa local demo.

### 9.1 Email — `RESEND_API_KEY` or `MAIL_WEBHOOK_URL`

`sendMail` in `src/server/integrations/mail.ts`:

- Resend: `POST https://api.resend.com/emails` with Bearer key, `MAIL_FROM` optional.
- Else webhook: POST JSON `{ to, subject, text }`.
- Else non-production: `console.log`.
- Else production: fail.

Used by: password reset, quote send, health nudge.

### 9.2 Stripe — `STRIPE_SECRET_KEY` (webhook secret optional)

1. Finance clicks **Pay with card**.
2. `POST /api/payments/checkout` creates a Stripe **Checkout Session** (hosted page) with invoice metadata and amount in minor units (paise for INR).
3. Browser redirects to `checkoutUrl`.
4. Success hits `GET /api/payments/stripe/complete?session_id=…`, which **retrieves** the session from Stripe with the secret key and `recordPayment` (CARD, `requestKey` `stripe:{payment_intent}`).
5. Optional: `STRIPE_WEBHOOK_SECRET` — Stripe (or `stripe listen`) POSTs to `/api/payments/stripe/webhook`. Signature is HMAC-SHA256 (`t=` timestamp, `v1=` hex). Handles `checkout.session.completed` and `payment_intent.succeeded`. Duplicate keys replay safely.

Without the secret key the button’s API returns **503**; **Record payment** (bank transfer) still works.

Google Cloud / Stripe Dashboard: set success/cancel via `APP_URL` (default request origin). Checkout `success_url` is `{APP_URL}/api/payments/stripe/complete?session_id={CHECKOUT_SESSION_ID}`.

### 9.3 Jobs — `CRON_SECRET` or `npm run jobs`

`runScheduledJobs`: due billing, health refresh, learn recommendation weights.

- CLI: `npm run jobs` (no cron secret).
- HTTP: `POST /api/jobs/run` with `Authorization: Bearer $CRON_SECRET` (503 if unset).

### 9.4 FX — optional `DEALFLOW_FX_JSON`

Defaults INR=1, USD≈83.5, EUR≈90 units of INR per 1 foreign unit. Reports display-currency is Preview.

### 9.5 Carrier — `CARRIER_QUOTE_URL` (+ optional `CARRIER_API_KEY`)

Our `GET /api/carrier/quote?warehouseCode=&weightKg=` **POSTs JSON** to that URL: `{ warehouseCode, weightKg, destination }`. Response `{ amount, currency }` (or `price`/`total`). Bearer key if set.

Without URL: **503** on that route; fulfillment Preview still uses the **warehouse rate card**. If the URL is set but the vendor errors, Preview **falls back** to the card (does not crash).

---

## 10. Staff vs portal UI map

| URL | Who | What |
|---|---|---|
| `/`, `/login`, `/signup` | Public | Entry, Google link if configured |
| `/home` | Staff | Pipeline snapshot from workspace |
| `/quotes`, `/quotes/:id` | Sales | Builder, catalog price hint, send, submit |
| `/approvals` | Manager/Finance | Decisions |
| `/fulfillment` | Staff read; Finance write | Orders, stock, receipts |
| `/fulfillment/:id` | Same | Preview 6+3+1, Accept, consolidate, ship |
| `/invoices`, `/invoices/:id` | Finance | Books payment + Stripe |
| `/subscriptions`, `/health` | Staff | Recurring, flags |
| `/reports` | Staff (rep-scoped) | Dashboard + XLSX/PDF |
| `/products`, `/settings/*` | Admin (mostly) | Catalog, customers, warehouses, integrations flags |
| `/portal` | Customer | Allowlisted quotes/orders/invoices |

---

## 11. Local run (what “demo complete” means)

1. Docker Postgres; `DATABASE_URL` port matches `DEALFLOW_DB_PORT` (this machine often **5434**).
2. `SESSION_SECRET` set.
3. `npx prisma migrate deploy` (or compose first-run) and seed if the DB is empty.
4. `npm run dev` — **do not** set `DEALFLOW_ADAPTER=development`.
5. Log in as Arjun / Farah / Neha using `docs/env-keys.md`.

Then Flow A/B in `docs/demo-walkthrough.md`. Vendor keys are optional. The remaining human task after this document is **your recorded demo video** after manual clicks.

---

## 12. Known limits (say these in a review)

- Some shell `/api/actions` replay maps are **in-process**; Node restart can change replay for those actions. Payments/receipts with DB `RequestKey` are durable.
- Login cookie max-age vs session helper TTL may differ (hours vs days).
- FX and live carrier overlays are **Preview / estimate**, not a second legal ledger.
- Google SSO does not create users.
- Co-purchase learning is association counts, not ML training of a neural network.
- Confirm does not reserve stock.

---

## 13. Where to read next

| File | Use |
|---|---|
| `docs/deal-schema-migration.md` | Deal identity vs Quote vs Order |
| `docs/demo-walkthrough.md` | Click script Flow A/B |
| `docs/harsh-lane-explained.md` | Catalog/split/reports in plain English |
| `docs/MENTOR_REVIEW.md` | Oral exam |
| `docs/API.md` | HTTP contract |
| `docs/DATA_MODEL.md` | Table groups |
| `docs/SECURITY.md` | Threats |
| `prisma/schema.prisma` | Exact columns |
| `memory.md` | Dated work log (not a spec) |
