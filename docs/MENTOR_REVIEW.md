# DealFlow360 — Mentor review briefing

Use this document as the oral-exam map: **what the product is**, **what is actually built**, **how each process works**, and **how the database encodes it**. Prefer this file plus `prisma/schema.prisma` over older walkthrough status columns (some still say NOT CONNECTED after live code landed).

| Companion docs | Use for |
|---|---|
| `README.md` | Quick start, seed emails, feature matrix |
| `docs/architecture.md` | Runtime diagram (some names are older than Prisma) |
| `docs/API.md` | HTTP conventions |
| `docs/DATA_MODEL.md` | Table groups and invariants |
| `docs/SECURITY.md` | Auth threats |
| `docs/deploy.md` | Hosted Postgres / env |
| `prisma/schema.prisma` | **Column-level source of truth** |

**Honesty rule for the review:** say **LIVE** only when a request hits PostgreSQL through Prisma. Say **DEV FIXTURE** when `DEALFLOW_ADAPTER=development` (JSON store). Say **NOT CONNECTED** when production would 503. Do not claim isolated Vitest tests prove the browser or the database.

---

## 1. One-sentence product

DealFlow360 is a **single Next.js application** (UI + API) for **Nexa Office Solutions** B2B sales: configure catalog and customers, build **versioned quotes**, run **discount policy / approvals**, let the **customer negotiate and accept one exact revision**, then **commit an immutable order**, **preview then allocate warehouse stock**, **bill one-time vs recurring**, **record payments**, and **flag stalled / risky deals**.

The governing promise: **the business does not commit (order, invoices, subscriptions, stock) until the current revision is approved (or needs no approval) and the customer has accepted that same revision.** Warehouse splits and billing screens before that are **Preview**.

---

## 2. What the mentor should understand first

### 2.1 One app, not two servers

There is no separate “backend process.” `pnpm dev` / `npm run dev` starts Next.js. React pages and `src/app/api/**` Route Handlers share the same Node process. PostgreSQL 16 is the only extra process (Docker Compose or a native instance).

### 2.2 Two HTTP surfaces (this is a frequent exam question)

| Surface | Where | When used |
|---|---|---|
| **Lane REST** | Dedicated files, e.g. `src/app/api/quotes/route.ts`, `src/app/api/auth/login/route.ts` | Default live path. Prisma + session cookie `dealflow_session`. **Wins** over the catch-all for the same URL. |
| **Workspace catch-all** | `src/app/api/[...path]/route.ts` | Krishna’s shell: `/api/workspace`, `/api/actions`, fixture portal/recommendations. Calls `getAdapter()`. |

`getAdapter()` (`src/server/adapters.ts`):

- If `NODE_ENV !== production` **and** `DEALFLOW_ADAPTER=development` → JSON fixture adapter (`src/development/adapter.ts`), response `mode: "DEV FIXTURE"`.
- Otherwise → **throws 503** `INTEGRATION_REQUIRED`.

So: staff **catalog/quotes/fulfillment/billing REST** can be LIVE while **`GET /api/workspace` is 503** unless the fixture adapter is on. The shell (`Application.tsx`) loads `/api/auth/me` then `/api/workspace`. Live login can succeed and Overview still fail if workspace is unbound.

Fixture catch-all cookie name is `dealflow-session` (hyphen). Live auth cookie is `dealflow_session` (underscore). Dedicated login routes set the underscore cookie.

### 2.3 Layering (how “engines” work)

```
Browser (role-filtered shell)
  → Route Handler (auth + Zod)
    → Service (roles, transactions, audit, RequestKey)
      → Pure engine (no Prisma import)
      → Repository (in-memory in tests; Prisma in live)
        → PostgreSQL
```

Pure engines: pricing (`src/features/quotes/engine/pricing.ts`), policy (`src/server/governance/policy-evaluation.ts`), catalog resolve (`src/server/catalog/engine/resolve-price.ts`), warehouse split (`src/server/inventory/engine/split.ts`), billing calendar/money (`src/server/billing/engine/*`), recommendations (`src/features/recommendations/rank.ts`), deal health (`src/server/health/deal-health.ts`).

### 2.4 Team ownership (who built what)

| Owner | Owns | Typical paths |
|---|---|---|
| **Krishna** | Shell, landing/login presentation, sales home, quote builder UI, recommendations, customer portal UI | `src/components/application`, `src/features/{builder,recommendations,portal}`, `src/styles` |
| **Ruchir** | Prisma schema/migrations, auth, billing, users, package/CI | `prisma/`, `src/server/lib/auth`, `src/server/billing`, `src/app/api/auth` |
| **Atharva** | Quotes, pricing, revisions, approvals, confirmation, health, audit | `src/server/quotes`, `src/server/governance`, `src/server/health`, `src/lib` pricing if present |
| **Harsh** | Customers, catalog, price lists, warehouses, fulfillment, reports, demo/architecture docs | `src/server/{catalog,inventory,reports}`, `src/features/{catalog,inventory,reports}` |

Cross-engine **confirm** is Atharva’s transaction; it **calls** Ruchir `initializeBilling` and Harsh `initializeFulfillment`.

---

## 3. Runtime, stack, local run

| Piece | Choice |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript |
| CSS | Tailwind 4 + Krishna tokens in `src/app/globals.css` (+ landing CSS if present) |
| DB | PostgreSQL 16, Prisma 7 (`provider = "postgresql"`; URL from env, not in schema file) |
| Client output | `src/generated/prisma` (generated, gitignored) |
| Package manager | **pnpm 11.3.0** in CI; `npm run` works for the same scripts |
| Node | **24** (README) |
| Compose | `docker-compose.yml` — user `dealflow` / password `dealflow` / db `dealflow`, host port `DEALFLOW_DB_PORT` default 5432 |

**First clone:** `pnpm install` → copy `.env.example` → `.env` → `pnpm db:up` → `pnpm db:deploy` → `pnpm db:seed` → `pnpm dev`.

**Env (never commit `.env`):**

- `DATABASE_URL` — Postgres + `?schema=public` locally.
- `SESSION_SECRET` — cookie signing (placeholder in example).
- `DEALFLOW_ADAPTER=development` — **opt-in fixture only**; forbidden in production.
- `DEALFLOW_DEV_IMPERSONATION=1` — allows `x-dev-actor` header **outside production**. Default: no header bypass.

Production: missing live DB/services → **503**, never silent fixture fallback.

---

## 4. Identity, roles, auth, pages

### 4.1 Roles (`enum Role`)

| Role | Job |
|---|---|
| `ADMIN` | Catalog, users, warehouses, plans, reports, health actions, impersonation-free config |
| `SALES_REP` | Build/submit quotes; sees scoped pipeline |
| `SALES_MANAGER` | Approvals (manager step), policies, dashboard, reports |
| `FINANCE` | Second approval step, fulfillment mutations, stock receipts, billing, payments |
| `CUSTOMER` | Portal only |

UI may label finance `FINANCE_OPS`. Prisma remains `FINANCE`.

`AccountStatus`: `PENDING` (signup), `ACTIVE` (can sign in), `DISABLED`.

A user belongs to **at most one** `SalesTeam`. Customer users reach data only through `CustomerMembership` (user ↔ customer). Portal isolation is **404** if the quote is not theirs (do not leak that another customer’s quote exists).

### 4.2 Seeded demo people

Passwords are **per account** in `src/fixtures/ruchir.ts` (README still saying `password123` is **stale**). Examples:

| Email | Role | Password (demo) |
|---|---|---|
| `dev@nexa.example` | ADMIN | `admin-nexa-2026!` |
| `arjun@nexa.example` | SALES_REP | `arjun-nexa-2026!` |
| `priya@nexa.example` | SALES_REP | `priya-nexa-2026!` |
| `sana@nexa.example` | SALES_MANAGER | `sana-nexa-2026!` |
| `farah@nexa.example` | FINANCE | `farah-nexa-2026!` |
| `neha@acme.example` | CUSTOMER (Acme) | `neha-acme-2026!` |
| `rohan@beta.example` | CUSTOMER (Beta) | `rohan-beta-2026!` |
| `meera@gamma.example` | CUSTOMER (Gamma) | `meera-gamma-2026!` |
| `vikram@nexa.example` | SALES_REP PENDING | cannot sign in until admin activates |

Memberships: Neha→Acme, Rohan→Beta, Meera→Gamma.

### 4.3 Login / signup / session

1. `POST /api/auth/login` `{ email, password }` — verifies hash, **ACTIVE** only, creates `Session` row with **SHA-256 of random token**; browser gets **httpOnly** cookie `dealflow_session` (max age 7 days; `sameSite: lax`; `secure` in production).
2. Session table stores **hash only**, not the token. Expiry is `expiresAt`. Occasional login **purges expired sessions**.
3. `GET /api/auth/me` — current actor.
4. `POST /api/auth/logout` — delete session + clear cookie.
5. `POST /api/auth/signup` — creates **PENDING** user; **cannot pick Admin/Finance**. Admin activates via `/api/admin/users`.
6. Password reset: `POST /api/auth/password-reset` always `{ accepted: true }` (no email enumeration). If user is ACTIVE, stores hashed token (30 min TTL). **No email sender**; in non-production the **plain token is logged** on the server. Confirm: `POST /api/auth/password-reset/confirm` with token + new password; token claimed once in a transaction; concurrent reuse fails.

`src/proxy.ts` (Next 16 proxy): unauthenticated **pages** redirect to `/login?next=…`. Public: `/`, `/login`, `/signup`, and static extensions (`jpg`, `png`, fonts, `/brand/`, …). **API is not in this matcher.** Cookie presence is optimistic; **authorization is still checked in handlers**.

`src/server/lib/auth/permissions.ts`: first matching prefix+method rule wins. Customers cannot hit staff prefixes. Default for unknown `/api/*` is **INTERNAL** (staff roles).

Origin/CSRF: mutating requests checked with `sameOrigin` (`src/server/origin.ts`). Cross-site `Sec-Fetch-Site` rejected. Localhost / 127.0.0.1 / `::1` aliases allowed **only in development** with matching scheme and port.

### 4.4 Screens (what the mentor can click)

Shell: `src/components/application/Application.tsx` mounted from layout. Staff nav (role-filtered in practice):

| Path | Purpose |
|---|---|
| `/` | Marketing landing |
| `/login`, `/signup` | Auth presentation |
| `/home` | Overview / pipeline counts |
| `/quotes`, `/quotes/new`, `/quotes/[id]` | Pipeline + builder |
| `/pipeline` | Quote pipeline |
| `/approvals`, `/approvals/[revisionId]` | Inbox + decision |
| `/fulfillment`, `/fulfillment/[orderId]` | Orders + split/allocate/ship |
| `/subscriptions`, `/subscriptions/[id]` | Recurring |
| `/invoices`, `/invoices/[id]` | Receivables + PDF |
| `/billing` | Billing ops |
| `/health` | Flags / tasks |
| `/reports` | Aggregates + export |
| `/products`, `/products/new`, `/products/[id]` | Catalog |
| `/price-lists` | Price books |
| `/customers` | Customer master |
| `/warehouses` | Stock / receipts |
| `/policies` | Discount policy versions |
| `/users` | Admin users |
| `/settings/*` | Setup (customers, etc.) |
| `/portal/*` | Customer shell |

Sidebar collapse preference: `localStorage` key `dealflow-sidebar`.

---

## 5. End-to-end commercial workflow (the story)

Demo company: Nexa sells laptops, docks, mice, **support seats** (recurring), setup, backup. Customers: **Acme GOLD**, **Beta SILVER**, **Gamma** (seed). Currency typically **INR**.

Canonical demo arithmetic (blueprint §13), Gold Acme:

- 10 laptops list 50,000, cost 40,000; 10 docks 3,000 / 2,000; 10 support 1,000/mo, cost 400.
- Ceilings: Gold 15%; hardware 15%; services 10%.
- **In policy:** hardware 12%, support 8% → one-time **466,400** (with docks) / monthly **9,200**.
- **Exception:** hardware 18%, support 16% → Finance chain; one-time **434,600**; monthly **8,400**.
- Stock: Main 6 laptops + 10 docks; East 3 laptops → **1 laptop backorder**.

### 5.1 Configure (Admin)

Categories, products, variants (SKU, extraPrice, cost, `stockTracked`), tax on product (`taxPct` in Prisma), price lists + **PriceRule** (list × product × optional variant × **DiscountTier** × currency × unitPrice), warehouses + **Stock** (`onHand`, `reserved`, `reorderAt`), subscription **plans**, customers (tier, priceList, assigned rep, currency).

Products are **archived**, not deleted. Historical quote lines keep FKs.

### 5.2 Quote (Rep)

1. Create quote for a customer → `Quote` head (`stage=DRAFT`) + first **immutable** `QuoteRevision` + `QuoteLine` snapshots.
2. Add/change lines → **new revision number**, old revision `supersededAt`, previous approval **SUPERSEDED**. Body must send `expectedRevision`; mismatch → **409**.
3. Unit prices come from **catalog resolve** (server), not typed totals in the browser.
4. Line discount + **order-level discount** combine (see §7). Tax on discounted one-time subtotal.
5. Recurring lines carry `planId`, `interval`, `billingKind=RECURRING`. Totals stored as monthly/quarterly/yearly **untaxed subtotals** on the revision (seed math comment: tax not rolled into recurring columns).
6. Recommendations: ranked server-side; **Add** is another revision (same as any material change).
7. Submit → policy evaluation stored **on that revision** (`riskLevel`, excess percents, JSON `evaluationReasons`, copied `QuoteRevisionApprovalStep` rows). Stage → `PENDING_APPROVAL` or `APPROVED` if `NOT_REQUIRED`.

Reads **must not** bump `lastActivityAt`. Only commercial mutations do.

### 5.3 Internal approval (Manager then Finance if required)

Steps are **sequential**. Finance cannot approve before Manager when both are on the chain. Decision kinds: `APPROVE`, `REJECT`, `RETURN`. Reason required. Stored as immutable `ApprovalDecision`; step row points at `decisionId`.

- All required steps APPROVED → revision `approvalStatus=APPROVED`, quote may be sendable to portal.
- REJECT → quote `REJECTED`, remaining steps `BLOCKED`.
- RETURN → typically `UNDER_NEGOTIATION`; customer/rep must change terms (new revision).

Admin can act as a step in the state machine (`actor.role === ADMIN`).

### 5.4 Portal negotiation (Customer)

Customer sees **allowlisted** fields only (no cost, margin, warehouse internals).

- Comment / line question / **counter** (discount, qty, promised date) → `PortalMessage`.
- Material numeric counter → Atharva creates a **spawned revision**; `spawnedRevisionId` set; old approvals invalid.
- Date-only request is **not** a warehouse promise until staff reviews.
- **Accept** writes `CustomerAcceptance` for **that revision + that actor** (unique pair).
- **Confirm** is a separate command (see §5.5). Stale tab (`expectedRevision` old) → 409.

Second customer (Rohan) cannot open Neha’s quote (404).

### 5.5 Commitment (the one transaction that matters)

`LiveQuoteService.confirm` (`src/server/quotes/live-service.ts`), customer only, Prisma `$transaction`:

1. **Idempotency:** `RequestKey` scope `CONFIRM_ORDER` + client `requestKey`. Completed payload replayed; in-progress key → conflict; key reused for another quote/customer → conflict.
2. Lock visible quote; **membership** check; `expectedRevision` must match current.
3. If an `Order` already exists for `sourceRevisionId` → return same order (unique constraint); optionally complete request key.
4. Else require: acceptance by this actor on **current** revision; `approvalStatus` not PENDING/REJECTED/SUPERSEDED; quote not already CONFIRMED.
5. Create `Order` + `OrderLine` copies (unique `sourceQuoteLineId`); link `acceptanceId`; set quote `CONFIRMED`.
6. `initializeBilling(tx, order, requestKey)` — one-time invoice if any ONE_TIME lines; **subscription rows** for RECURRING; **first recurring invoice is not created here** (due-run later). Replay via `BILLING_INIT` claim on same key.
7. `initializeFulfillment(tx, order)` — **does not reserve stock**. Live implementation: if the order row exists, fulfillment is `CONNECTED` / order default status `PENDING`. Reservations happen only on **Accept split**.

Retry confirm with same key → **one order**. New terms → new revision → old acceptance **cannot** confirm.

### 5.6 Fulfillment (Finance / Admin)

1. **Preview** `GET /api/fulfillment/:orderId/preview` — pure split on `onHand - reserved` (and this order’s unshipped claims). **Writes nothing.**
2. **Accept** — lock stock rows, recheck, write `Reservation` + `Backorder`, status `PARTIAL` or `ALLOCATED`. `requestKey` / allocation scope. Repeat key → one allocation.
3. **Receipt** — `StockReceipt` unique via `RequestKey` `STOCK_RECEIPT`; increases `onHand`; does **not** auto-allocate backorders.
4. **Consolidate** remaining backorder after stock arrives → new `Shipment` PLANNED; old shipments untouched.
5. **Ship** — reservation `SHIPPED`, decrement `onHand` and `reserved`, `Shipment` timestamps.
6. **Deliver** — `DELIVERED`.
7. **Override** — re-plan **this order’s unshipped** reservations only.
8. **Cancel** — release reservations; status `CANCELLED`.

Available stock is **derived**: `onHand - reserved`. Invariant: `onHand ≥ reserved ≥ 0`. Support/subscription lines with `stockTracked=false` skipped.

Split heuristic (not a global optimizer):

1. Prefer **one warehouse** that covers all remaining demand; if several, lowest estimated shipping cost then warehouse id.
2. Else greedy: warehouse covering most remaining units, tie-break cost then id; leftover → backorder.

Repeated SKUs on two lines **aggregate** before the stock check; allocations still keep **line ids**.

### 5.7 Billing and cash (Finance)

- One-time invoice: kind `ONE_TIME`, due typically **confirm date + 15 days**, snapshot lines.
- Recurring: `Subscription` calendar (`anchorDay`, `currentPeriodStart/End`, `nextBillingDate`). `POST /api/billing/run-due` creates period invoices; unique period identity (partial unique indexes — no nullable loopholes).
- **Proration** on quantity/plan change: `SubscriptionChange` + optional `ADJUSTMENT` invoice; remainingDays / periodDays stored.
- **Pause / resume / cancel** follow `CancelPolicy` `IMMEDIATE` vs `PERIOD_END`.
- **Payment** unique `RequestKey` `PAYMENT`; cannot exceed remaining after credits; statuses UNPAID → PARTIALLY_PAID → PAID; VOID separate.
- **CreditNote** + **CreditApplication** (can split credit across invoices; unique note+invoice).

### 5.8 Health and reports

Manual **refresh** (not cron): Engine 5 scans quotes/orders vs `HealthSettings` (single row `id=default`).

| Flag | Idea |
|---|---|
| Stalled | Quote still “open” (not pending-approval/approved/confirmed/rejected) and `lastActivityAt` older than `stalledAfterDays` (default 5) |
| Discount anomaly | Current effective discount vs historical confirmed discounts; needs `anomalyMinSamples`; excess above average + margin |
| Delivery risk | Undelivered goods + (paid already **or** promised date passed **or** unallocated near promise, default 3 days) |

Flags unique by unresolved fingerprint; resolve by `resolvedAt`. Tasks: NUDGE / ESCALATE, `actionKey` unique.

Reports: same **filter** for on-screen aggregates and XLSX/PDF export. Rep scoped to own `repId`; customer forbidden on staff reports. Period matching uses quote created/confirmed timestamps (IST ranges in tests).

---

## 6. Money, percent, and pricing math (mentor formulas)

**API money:** decimal **strings** (`"50000.00"`). Never IEEE floats across the wire. Prisma: `Decimal(14,2)` money, `Decimal(5,2)` percents **0–100**.

**Effective discount** (line then order, multiplicative):

\[
\text{effective} = 100 \times \bigl(1 - (1 - d_{\text{line}}/100)\times(1 - d_{\text{order}}/100)\bigr)
\]

**Ceiling** for a line: min(tier ceiling, category ceiling for that tier) — stricter wins.

**Excess points** = max(0, effective − ceiling). **Excess amount** = list×qty × excess/100.

**Weighted excess** = total excess amount / total undiscounted × 100.

**Live policy risk** (`evaluatePolicy`):

- Group lines by billing interval; evaluate each group.
- Any excess on a group → **Manager**.
- Worst-line or weighted excess above Finance thresholds → **Finance** (chain Manager then Finance).
- Empty chain → `NOT_REQUIRED` / risk `NONE`.

**Line money (one-time):** subtotal = round(unitPrice × qty × (1 − effective/100)); tax = round(subtotal × taxPct/100); total = subtotal + tax. Rounding: seed path uses Prisma Decimal HALF_UP; quote engine also uses **integer cents** (`bigint`) in `priceQuote`.

**Catalog `resolvePrice`:**

1. Price list = customer’s `priceListId` if active, else active list matching tier+currency.
2. Rule = most specific: variant rule beats product rule; among those, highest satisfied `minQty`.
3. Basis: `FIXED` unit, or `DISCOUNT` off product base, else product `basePrice`; **plus** variant `extraPrice`.
4. Cost from variant (or product base cost). Tax from product’s tax rate.

Quote builder must call **server resolve**, then Atharva `priceQuote` + `evaluatePolicy` on save/submit.

---

## 7. Database model (how tables collaborate)

PostgreSQL + Prisma. IDs are **cuid** strings. Enums live in Postgres.

### 7.1 Identity

```
User 1—n Session
User 1—n PasswordResetToken
User n—1 SalesTeam (optional)
User n—n Customer via CustomerMembership
Customer n—1 PriceList, n—1 assigned User (rep)
```

### 7.2 Catalog

```
Category 1—n Product 1—n Variant
PriceList 1—n PriceRule → Product, optional Variant, DiscountTier
Product optional default SubscriptionPlan
```

Prisma stores tax on **Product.taxPct** (architecture.md still mentions a TaxRate entity; treat schema as truth). Harsh contracts still have TaxRate in the engine layer for fixture resolve.

### 7.3 Policy (immutable versions)

```
PolicyVersion
  1—n PolicyCeiling (unique version+tier+category; null category is the tier default)
  1—n PolicyChainStep (unique version+stepIndex, role)
QuoteRevision n—1 PolicyVersion   // never edit published policy rows
```

### 7.4 Quote versioning

```
Quote (mutable head: stage, currentRevisionId, lastActivityAt)
  1—n QuoteRevision (unique quoteId+revisionNumber)
        1—n QuoteLine (unique revision+position)
        1—n QuoteRevisionApprovalStep
        1—n ApprovalDecision
        1—n CustomerAcceptance (unique revision+actor)
        0—1 Order (unique sourceRevisionId)
PortalMessage → quote + baseRevision + optional line + optional spawnedRevision
```

`Quote.currentRevisionId` is unique so at most one quote points at a given revision as “current.”

### 7.5 Order and warehouse

```
Order 1—n OrderLine (unique sourceQuoteLineId)
OrderLine 1—n Reservation, Backorder
Order 1—n Shipment 1—n ShipmentLine → Reservation
Warehouse 1—n Stock (unique warehouse+variant) , StockReceipt, Shipment
```

Demand identity: remaining line qty = active reservations + open backorders (uncancelled).

### 7.6 Billing

```
OrderLine 0—1 Subscription (unique sourceOrderLineId)
Subscription n—1 plan, optional pending plan
Subscription 1—n SubscriptionChange (optional unique adjustment invoice)
Invoice 1—n InvoiceLine, Payment, CreditNote
CreditNote 1—n CreditApplication → Invoice
```

### 7.7 Ops

```
RecommendationRule unique (baseProduct, candidateProduct)
HealthSettings id = "default"
HealthFlag (quote xor order), Task
AuditEvent append-only
RequestKey unique (scope, key) — idempotency envelope
```

`RequestScope`: `CONFIRM_ORDER`, `BILLING_INIT`, `PAYMENT`, `CREDIT_APPLY`, `ALLOCATION_ACCEPT`, `DUE_BILLING`, `STOCK_RECEIPT`.

### 7.8 Invariants to say out loud

| Rule | Enforced by |
|---|---|
| One order per accepted revision | `Order.sourceRevisionId` unique |
| One order per acceptance | `Order.acceptanceId` unique |
| Confirm needs acceptance **and** approval/not-required on **same** revision | `LiveQuoteService.confirm` |
| Preview does not reserve | Split engine + preview route |
| Confirm does not reserve | `initializeFulfillment` |
| No oversell | Stock row lock + available check on accept |
| No double pay / double receipt / double confirm | `RequestKey` + unique FKs |
| Portal tenant isolation | Membership in service; 404 |
| Archive not delete | `Product.archivedAt` |
| Money precision | Decimal columns + string API |

---

## 8. HTTP map (enough to answer “which endpoint”)

Conventions: success `{ data }` (many routes also `mode`). Errors `{ error: { code, message, details? } }`. Statuses 401/403/404/409/422/503.

| Family | Examples |
|---|---|
| Auth | `/api/auth/login`, `/signup`, `/me`, `/logout`, `/password-reset`, `/password-reset/confirm` |
| Users | `/api/admin/users`, `/api/admin/users/:id` |
| Catalog | `/api/products`, variants, restore, `/api/price-lists` + rules, `/api/customers`, `/api/catalog/search`, `/api/catalog/resolve`, `/api/tax-rates`, `/api/sales-teams` |
| Quotes | `/api/quotes`, `/api/quotes/:id`, lines, submit, send, accept, confirm, proposals |
| Approvals / policy | `/api/approvals`, `/api/approvals/:revisionId`, `/api/policies` |
| Portal | `/api/portal/quotes/:id`, proposals, confirm (fixture if `usesFixturePortal()`) |
| Recs | `/api/recommendations/:quoteId`, add, rules |
| Inventory | `/api/warehouses`, `/api/stock`, receipts, `/api/fulfillment`, preview, accept, ship, deliver, consolidate, override, cancel, delivery |
| Billing | `/api/plans`, `/api/subscriptions`, `/api/invoices`, PDF, `/api/payments`, `/api/credits`, `/api/billing/run-due` |
| Health / dash | `/api/health`, `/api/health/actions`, `/api/dashboard` |
| Reports | `/api/reports`, `/options`, `/export` |
| Catch-all | `/api/workspace`, `/api/actions` (command bus: `newQuote`, `addLine`, `allocate`, `payment`, …) |

`POST /api/actions` is the fixture/live command bus used by Krishna’s `FormAction` UI. Live implementation lives under `src/server/live/` when bound; unknown actions 404/422. Fixture `reset` is admin-only and **403 on live**.

---

## 9. What is LIVE vs still dual / limited

Say this clearly if asked “is it done?”

| Area | Typical status on current `main` |
|---|---|
| Schema, seed, migrations, Docker | LIVE |
| Session auth, role matrix, password reset | LIVE (Prisma) |
| Quotes, policy eval, approvals, confirm + billing init | LIVE (`LiveQuoteService`) |
| Catalog / customers / price lists REST | Wired to **Prisma** (`src/server/catalog/live.ts`) even if some comments still say fixture |
| Fulfillment REST | Wired to **Prisma** (`src/server/inventory/live.ts`) |
| Billing invoices/payments/subscriptions/due | LIVE |
| Reports | `getReportService` from `src/server/reports/live` |
| Krishna ranking + portal allowlist logic | Implemented; portal GET may still **fixture-switch** (`usesFixturePortal`) |
| Workspace catch-all `/api/workspace` | **503** unless `DEALFLOW_ADAPTER=development` |
| Email for reset / health nudges | **Not built** (log token in dev) |
| Payment gateway, SSO, cron | **Not built** (manual due-run and health refresh) |
| Split algorithm | Deterministic **heuristic**, labeled estimate |
| Production fixture | **Forbidden**; no fallback |

Vitest covers engines (oversell, preview purity, export row counts, auth matrix, billing idempotency, policy Gold 12% vs service 18%, confirm replay). That is **not** a substitute for a browser pass.

---

## 10. Quote stage cheat sheet

| `QuoteStage` | Meaning |
|---|---|
| `DRAFT` | Rep editing |
| `PENDING_APPROVAL` | Waiting on chain |
| `APPROVED` | Internal OK; may send to customer |
| `UNDER_NEGOTIATION` | Returned or portal counter in flight |
| `CONFIRMED` | Order exists |
| `REJECTED` | Terminal no |

Revision `approvalStatus`: `NOT_REQUIRED` | `PENDING` | `APPROVED` | `REJECTED` | `SUPERSEDED`.

Fulfillment `Order.fulfillmentStatus`: `PENDING` → `PARTIAL` / `ALLOCATED` → `SHIPPED` → `DELIVERED` (or `CANCELLED`).

---

## 11. Folder map (where to open code in the review)

```
prisma/schema.prisma          all tables/enums
prisma/seed.ts + prisma/seed/  idempotent Nexa demo + math assertions
src/app/api/**                HTTP
src/proxy.ts                  page login gate
src/server/lib/auth           session, permissions, reset
src/server/quotes             live quote + confirm
src/server/governance         policy + approval machine
src/server/catalog            resolve + Prisma catalog
src/server/inventory          split/allocate/ship
src/server/billing            init, due, pay, credit
src/server/health             flags
src/server/adapters.ts        fixture vs 503
src/development/              JSON adapter (dev only)
src/contracts/*.ts            TypeScript boundaries per owner
src/fixtures/*.ts             seed symbols and demo numbers
src/components/application    one shell for internal + auth pages
```

Fixture **symbols** (`warehouse-main`, `rep-arjun`) are not Postgres ids. Live code maps email / SKU / warehouse **code** via `src/server/lib/db/map.ts` / `src/server/live/ids.ts`.

---

## 12. Likely mentor questions (short answers)

**Why revisions?** Every material change is a new immutable snapshot. Approvals and acceptance attach to a revision id, so old “yes” cannot authorize new discounts.

**Why expectedRevision?** Optimistic concurrency. Two tabs cannot silently overwrite; client reloads.

**Why RequestKey?** Network retries must not create two orders, two payments, or two receipts.

**Why confirm ≠ allocate?** Commitment rule: order + billing records + fulfillment **header** first; warehouse lock is an explicit second decision (and preview is safe to show earlier).

**Why membership + 404?** Customer A must not learn that customer B’s quote id exists.

**Why Decimal strings?** INR amounts and percents must survive JS number limits and rounding debates; engines use Decimal or cents.

**Why one database?** Course constraint: one app, one Postgres, six engines as **modules**, not microservices.

**What would you build next?** Real email, cron due-billing/health, payment gateway, learned recommendation weights, courier rates, SSO — listed in `docs/architecture.md`.

---

## 13. How to demo in five minutes

1. `pnpm db:up && pnpm db:deploy && pnpm db:seed && pnpm dev`.
2. Login Arjun → new quote Acme → add laptop + support within ceiling → submit (no Finance).
3. Optional: add dock via recommendations (new revision).
4. Login Neha → accept + confirm (idempotent second click).
5. Login Farah → fulfillment preview (Main/East/backorder) → Accept split → invoices → partial payment with same `requestKey` twice.
6. Login Rohan → prove Acme quote 404.
7. Exception path: 18%/16% discounts → Sana then Farah approve with reasons → Neha confirms **new** revision only.

If Overview errors with 503, explain the **adapter gap** (§2.2); use lane REST screens (`/quotes`, `/products`, `/fulfillment`) which are Prisma-backed.

---

_Generated from the repository as of the mentor-review request. If schema and this file disagree, trust `prisma/schema.prisma` and the Route Handler._
