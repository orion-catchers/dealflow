# DealFlow360 — Team Memory

> Living log of what each owner has done, what is LIVE / DEV FIXTURE / NOT CONNECTED, and
> what interfaces are pending. Every owner (and their coding agent) appends to their own
> section after each work session. Do not rewrite another owner's entries; add a dated note.
>
> Source of truth for the plan: `DealFlow360_Team_Execution_Blueprint-krishna.md`.
> Problem statement: `DealFlow360.pdf`. Screen map: `preview.webp` (18 numbered screens).

---

## 1. Project context (read this first)

**What:** DealFlow360 — a self-governing B2B sales-operations platform for Nexa Office
Solutions (laptops, accessories, recurring support). Customer example: Acme Studio.

**Promise:** every change to a deal triggers the right checks before the business commits.

**Journey:** login → configured products → quote → recommendations + policy checks →
customer negotiation → approvals → final acceptance → order → warehouse allocation /
backorders → one-time + recurring billing → payment → monitoring + reports.

**Stack (locked):** Next.js (App Router) + TypeScript + Tailwind, PostgreSQL + Prisma.
One app, one DB, one deployment. No microservices, no Convex, no second UI theme.

**Conventions (§3, §7):**
- string IDs, percentages 0–100, money as decimal strings, ISO dates, camelCase.
- Success `{data}`; error `{error:{code,message,details?}}`; 401/403/404/409/422.
- Mutating quote requests carry `expectedRevision`; conflicts → 409.
- Pure engine functions never import the DB; service layer adds permissions, persistence,
  audit, transactions. Repository adapter swaps from in-memory fixture → Prisma.
- Every PR states **LIVE**, **DEV FIXTURE**, or **NOT CONNECTED**. Only LIVE counts at T=22:00.

**Roles:** ADMIN (Dev), SALES_REP (Arjun), SALES_MANAGER (Sana), FINANCE (Farah),
CUSTOMER (Neha @ Acme). Symbolic fixture IDs: `customer-acme`, `customer-beta`,
`rep-arjun`, `manager-sana`, `finance-farah`, `customer-neha`, `warehouse-main`,
`warehouse-east`.

**Six engines:** (1) Pricing governance & approvals — Atharva; (2) Warehouses / fulfillment
/ backorders — Harsh; (3) Billing / subscriptions / payments — Ruchir; (4) Upsell /
cross-sell — Krishna; (5) Deal health — Atharva; (6) Customer negotiation — Krishna.

**Branches:** `krishna/shell-portal-recommendations`, `ruchir/data-auth-billing`,
`atharva/quotes-governance-health`, `harsh/catalog-fulfillment-reports`. Merge one PR at a
time into `main`. Review pairs: Krishna ↔ Harsh, Ruchir ↔ Atharva.

**Coherent demo numbers (§13):** Gold Acme: 10 laptops @ 50,000 (cost 40,000), 10 docks @
3,000 (cost 2,000), 10 support seats @ 1,000/mo (cost 400). Ceilings Gold 15 / Hardware 15
/ Services 10. Initial: hardware 12%, support 8% → one-time 466,400; monthly 9,200 (within
policy). Exception: hardware 18%, support 16% → Finance required; one-time 434,600; monthly
8,400. Stock: Main 6 laptops + 10 docks; East 3 laptops → 1 laptop backordered.

---

## 2. Ownership lanes (from §4 / §5 / §11)

| Owner | Engines | Screens (UI owner) | Paths | Endpoint families |
|---|---|---|---|---|
| **Krishna** | 4 Recommendations, 6 Negotiation | 01 Login, 02 Home, 04 Builder, 11 Portal | `src/components/ui`, `src/components/shell`, `src/styles`, root layout/home/login, `src/features/{builder,recommendations,portal}` | `/api/recommendations/*`, `/api/portal/*` |
| **Ruchir** | 3 Billing; schema/auth/deploy | 05 Approvals list, 06 Approval detail, 09 Subscriptions, 10 Billing, 12 Invoices, 13 Invoice detail, users/roles | `prisma/`, `src/lib/db`, `src/lib/auth`, `src/features/{billing,approval-ui}`, package/lockfile/CI | `/api/auth/*`, `/api/admin/users`, `/api/plans`, `/api/subscriptions/*`, `/api/invoices/*`, `/api/payments`, `/api/billing/run-due` |
| **Atharva** | 1 Governance, 5 Health; quote CRUD/pricing/order; audit | 03 Pipeline, 14 Health, 18 Discount tiers | `src/features/{quotes,governance,health}`, `src/lib/pricing`, `src/lib/audit` | `/api/quotes/*`, `/api/approvals/*`, `/api/policies`, `/api/health/*`, `/api/dashboard` |
| **Harsh** | 2 Fulfillment; catalog/customer backend; reports | 07 Fulfillment list, 08 Fulfillment detail, 15 Reports, 16 Product dashboard, 17 Product editor, warehouses, customer master | `src/features/{catalog,inventory,reports}`, `src/contracts/harsh.ts`, `src/fixtures/harsh.ts`, arch/demo docs | `/api/customers`, `/api/products/*`, `/api/price-lists`, `/api/warehouses/*`, `/api/stock/*`, `/api/fulfillment/*`, `/api/reports/*` |

Each lane owns `src/contracts/<lane>.ts` and `src/fixtures/<lane>.ts`. Cross-lane changes
need a short interface note (before/after) in this file under "Interface notes".

---

## 3. Shared boundaries status

| Boundary | Owner | Status | Notes |
|---|---|---|---|
| Auth session → Actor | Ruchir | NOT CONNECTED | Harsh routes use `src/lib/auth/dev-actor.ts` (`x-dev-actor` header, dev only) until Ruchir's `getActor` lands. Same signature. |
| Catalog resolve | Harsh | DEV FIXTURE | `ResolvePriceInput → ResolvedPrice` in `src/contracts/harsh.ts`. |
| Quote pricing / policy / revisions | Atharva | NOT STARTED | — |
| Suggestions / customer proposal | Krishna | NOT STARTED | — |
| Customer confirmation → orderReady | Atharva | NOT STARTED | Harsh consumes `OrderForFulfillment` (defined in harsh.ts) — Atharva to confirm field mapping. |
| Split preview/commit | Harsh | DEV FIXTURE | See Harsh log. |
| Fulfillment initializer (inside confirmOrder tx) | Harsh | DEV FIXTURE | `InitializeFulfillmentInput/Result` in harsh.ts. DB-only, no reservation. |
| Billing initializer | Ruchir | NOT STARTED | — |
| Delivery read for Invoice Detail / Health | Harsh | DEV FIXTURE | `OrderDeliveryRead` in harsh.ts. |
| Plans (`/api/plans`) | Ruchir | NOT STARTED | Harsh uses `planRefs` fixture (`PlanRef`). |
| Reports | Harsh | DEV FIXTURE | Consumes `ReportQuoteRecord[]` (stored facts); needs Atharva's quote repository to assemble live rows. |

---

## 4. Per-owner step logs

### Krishna
_No entries yet._

### Ruchir
_No entries yet._

**Notes for Ruchir from Harsh (2026-09-05):**
- Harsh created a minimal scaffold (`package.json`, `tsconfig.json`, `next.config.ts`,
  Tailwind v4 via `@tailwindcss/postcss`, `vitest`). No teammate scaffold existed. You own
  package pinning — reconcile/replace freely; keep `vitest`, `xlsx`, `pdf-lib`, `zod` (used
  by Harsh's lane) or tell Harsh which alternatives to move to.
- `.env.example` placeholder created; owned by you.
- Data model fields Harsh needs (from §10): Customer/SalesTeam; Product/Variant/PriceList/
  PriceRule; Warehouse/StockLevel (unique warehouse+variant, onHand/reserved/threshold)/
  StockReceipt (unique requestKey); Reservation/Shipment/ShipmentLine/Backorder (nullable
  source warehouse only for backorder). Exact TS shapes in `src/contracts/harsh.ts`.

### Atharva
_No entries yet._

**Notes for Atharva from Harsh (2026-09-05):**
- Engine 2 consumes `OrderForFulfillment` (harsh.ts). Please map your `orderReady` result
  to it (orderId, customerId/name, repId, currency, promisedDate, confirmedAt, lines with
  stockTracked/isSubscription/variantId/quantity/shippingWeightKg).
- Reports consume `ReportQuoteRecord` — flattened stored facts (stage, approvalStatus,
  requiredApprovalLevel, weightedDiscountPct, totals, lines). Harsh will not recompute
  policy/pricing; a repository function on your quote tables should project to this shape.
- `confirmOrder` should call `initializeFulfillment(tx, order)` (DB-only, idempotent).

### Harsh

**2026-09-05 — Session 1 (branch `harsh/catalog-fulfillment-reports`)**

1. Read blueprint, problem statement PDF, screen map, README. Confirmed repo had only
   docs (commits `b761f8f`, `000c9c0`, `2951e73`, `40a2409`); no teammate branches.
2. Created branch `harsh/catalog-fulfillment-reports`.
3. Created minimal foundation scaffold (no `create-next-app` — it refused the non-empty
   dir): Next 15.3.3, React 19.1, TS 5.8, Tailwind 4.1, vitest 3.2, zod, xlsx, pdf-lib.
   Files: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
   `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/{layout,page,globals.css}`.
   Root page is a placeholder linking Harsh's screens; Krishna owns the real entry page.
4. Wrote `src/contracts/harsh.ts` — catalog (Customer, SalesTeam, Product, Variant,
   PriceList, PriceRule, TaxRate, PlanRef, ResolvePriceInput/ResolvedPrice, CatalogSearch),
   inventory (Warehouse, StockLevel, StockReceipt, Reservation, Backorder, Shipment,
   AllocationPlanEntry, SplitPreview, Accept/Override/Receipt/Consolidate/Ship/Deliver/
   Cancel inputs, FulfillmentListItem, StockListItem, FulfillmentDetail,
   OrderDeliveryRead, InitializeFulfillment), reports (ReportFilters, ReportQuoteRecord,
   ReportLineRecord, ReportAggregates, ExportFormat), shared (Money, Pct, Actor, Role,
   ApiResult).
5. Wrote `src/fixtures/harsh.ts` — §13 numbers: 3 customers (Acme GOLD, Beta SILVER,
   Gamma BRONZE), 2 teams, 2 tax rates (zero demo + GST 18), 3 plan refs, 6 products
   (laptop, dock, mouse, support seat, setup service, cloud backup), 5 variants, 3 price
   lists + rules, 2 warehouses (Main 6 laptops/10 docks; East 3 laptops), 3 confirmed
   orders (Acme Flow A, Beta competing, Gamma service-only), 6 report quote records,
   fixture users.
6. Wrote `src/dev-adapter/ui.tsx` — thin local adapter with §6 props (PageHeader,
   StatusBadge, DataTable, Money, Dialog, AppShell + Button/Input/Select/Card/Error/Empty).
   Replaced by Krishna's kit via import change.
7. Wrote `src/lib/api/respond.ts` (envelope + `ApiFailure` + `handle`) and
   `src/lib/auth/dev-actor.ts` (dev-only `x-dev-actor` header → Actor; production throws
   UNAUTHENTICATED; Ruchir's `getActor` replaces it).
8. Delegated three parallel engine/service tracks to subagents (see entries below).

**Status legend for Harsh's lane:** everything is **DEV FIXTURE** (in-memory repositories)
until Ruchir's Prisma schema lands; then the repository adapters swap to Prisma.

---

## 5. Interface notes (cross-lane changes)

_None yet. Format: date, owner, file, before → after example, consumers notified._

---

## 6. Open questions / blockers

- Event date/time confirmed? Blueprint assumes T = 22:00 IST event day.
- Ruchir: confirm you accept the foundation scaffold or replace it (before others branch).
- Atharva: confirm `OrderForFulfillment` mapping and `ReportQuoteRecord` projection.
