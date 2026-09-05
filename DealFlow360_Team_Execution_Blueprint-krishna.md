# DealFlow360 — Four-Person Execution Blueprint

**Team:** Krishna, Ruchir, Atharva, Harsh  
**Purpose:** One implementation brief for all four humans and their coding agents.  
**Delivery target:** All six real engines connected through usable screens by **22:00 on the event day, Asia/Kolkata (IST assumed)**. Confirm the event date/timezone in the team's issue board; no calendar date is invented here.  
**Organization:** Ownership lanes, not sequential phases. Everyone starts useful work immediately.  
**Database decision:** PostgreSQL + Prisma. Frontend/backend: Next.js, TypeScript, Tailwind. One application, one database, one deployment.

This document supersedes both supplied plans. It is a plan, not a claim that the application has been implemented or tested. It combines `DealFlow360_Implementation_Plan(1).md`, `Dealflow implementation plan_2.md`, the DealFlow360 problem statement, and the supplied Excalidraw screen map. All 18 numbered screen groups have explicit owners below. Tiny screenshot annotations were not all readable, so the written PS supplies the detailed requirements. Do not silently discard a written requirement because the screenshot is smaller or labels a report optional.

## 1. What we are building, in simple terms

**Promise: Every change to a deal triggers the right checks before the business commits.**

Nexa Office Solutions sells laptops, accessories, and recurring support. Acme Studio is its customer.

- Dev, the admin, configures products, prices, warehouses, subscription plans, and access.
- Arjun, the sales rep, builds Acme's quotation and considers relevant accessories.
- Neha, Acme's customer representative, views and negotiates through a restricted portal.
- Sana, the sales manager, reviews discounts outside normal limits.
- Farah, finance/operations, reviews larger exceptions, allocates stock, and manages billing/payment.

The main journey is **login → configured products → quote → recommendations and policy checks → customer negotiation → required approvals → final customer acceptance → order → warehouse allocation/backorders → one-time and recurring billing → payment → live monitoring and reports**.

A quotation is a proposal. An approval is internal permission for exact terms. Customer acceptance is the customer's agreement to those terms. An order is the resulting commitment. An invoice states what is owed. Payment records what was received. These are related, but are not interchangeable states.

### Role journeys

| Role | Journey and allowed work |
|---|---|
| Admin | Login → users/roles → catalog/price lists → policies → warehouses/plans → reports. Admin configuration changes are audited; business actions still follow valid transitions. |
| Sales Rep | Login → dashboard/pipeline → new quote → add/edit lines → suggestions → submit/send → respond to negotiation → track approvals/order/fulfillment. Cannot self-approve or record finance payments. |
| Sales Manager | Login → approval queue → inspect exact revision and reasons → approve/reject/return → deal health/reporting → policy configuration. |
| Finance / Operations | Login → second-level approvals → fulfillment/splits/backorders → subscriptions/invoices/credits → payment recording. |
| Customer | Login → own quotations → questions/counterproposal → view revised terms → confirm allowed version → own order status and invoices. Never receives internal costs, margins, policies, or other customers' records. |

Internal signup creates an inactive/pending account until an admin assigns access. Customer signup/invitation requires a verified customer association. Nobody selects Admin at public signup. Seed five role accounts and a second customer account for isolation checks. Use email/password for the required portal; magic links are unnecessary for the core.

## 2. Serious issues found and corrected

The second plan mainly adds Convex and its schema; it retains the first plan's engine logic and scheduling problems.

| Old issue | Why it matters | Replacement in this blueprint |
|---|---|---|
| All engines blocked until a shared gate passes | Everyone waits; real integration starts too late. | Engines and screens start together against fixed interfaces and development fixtures. |
| Flat approval built first, discarded later | Spends time implementing the wrong core behavior. | Real tier/category and aggregate policy evaluation from the start. |
| Integration delayed to hour 18 | Too late for a 15–16 effective-hour build. | Small working PRs and shared integration continuously. |
| No customer role or customer-user relationship | Restricted portal cannot be enforced properly. | CUSTOMER role plus customer membership and filtered portal responses. |
| Quote edits clear approval history | Destroys the audit trail. | Immutable revisions; old approvals become superseded, never deleted. |
| Portal read changes status | Refreshing a page alters the business workflow. | Reads have no side effects; explicit send/request/accept actions change state. |
| Customer request directly overwrites accepted terms | Requests become commitments without controlled review. | Save proposal, create proposed revision, evaluate it, obtain final acceptance. |
| Merely lowering an excessive discount supposedly needs no approval | The lower value may still breach policy. | Reevaluate every material revision under the same rules. |
| Sum of line excess percentages | Splitting one line into two changes risk artificially. | Value-weighted excess plus worst-line and total-budget checks. |
| Suggesting a split reserves stock, then accepting reserves again | Double reservation and misleading availability. | Suggestion uses local working quantities only; acceptance reserves once transactionally. |
| Override does not account for existing reservations | Can leak reservations or reject valid reallocations. | Replace the order's unshipped reservations atomically. |
| All quote lines enter warehouse logic | Services/subscriptions create false shortages. | Allocate stock-tracked goods only. |
| Convex backorder warehouse is mandatory | Cannot represent a backorder without a source. | Separate backorder records or nullable warehouse with explicit validation. |
| Discounts use ambiguous fraction/percentage convention | A stored 10 may be treated as 1000%. | Percentages are 0–100; arithmetic uses division by 100. |
| Monthly means 30 days; quarter 91 | Dates drift while labels imply calendar billing. | Calendar intervals and actual stored period boundaries. |
| Recurring charges/credits have no uniqueness or invoice-line detail | Duplicate invoices, unexplained charges, possible invalid credits. | Period uniqueness, invoice lines, linked adjustments, repeat-safe writes. |
| Paid orders are excluded from delivery alerts | A fully paid order can still be undelivered. | Fulfillment state determines delivery risk, not payment state. |
| Health refresh skips confirmed orders | Misses the very orders with delivery obligations. | Separate eligible sets for quote inactivity and order delivery. |
| Recommendation fallback bypasses qualification | Unhealthy products can appear. | Every candidate, including fallback, passes the same pricing/margin filters. |
| Product setup, reports, and exports have weak/no owners | Diagram completeness is lost. | Explicit 18-screen map and supplementary configuration ownership. |
| Core monitoring/recommendations described as disposable stretch | Conflicts with requested behavior. | Six engines remain required; defer genuine extras only. |
| Claimed competitor counts/judging certainty | Not established by supplied brief. | No invented competitor count or guaranteed ranking. |
| Two-hour first-time database experiment | Uses scarce delivery time and risks rewrite. | Lock PostgreSQL now; no dual database implementation. |

## 3. Architecture and working conventions

Choose PostgreSQL because orders, versions, stock, invoices, and payments have clear relationships and consistency requirements. The second plan explicitly describes Convex as new to the team. This is a delivery choice, not a claim that Convex is unsuitable.

- Next.js + TypeScript for pages and server routes; Tailwind and a single component kit.
- Prisma + PostgreSQL; Ruchir pins compatible package versions once. Preserve an already-working compatible repo scaffold rather than reinitializing it.
- Server-side services for six engines; no microservices, message broker, or extra backend framework.
- Session cookies using an established authentication approach; no production role-switch bypass.
- PostgreSQL is server-only. Never expose database credentials in browser variables.
- Decimal arithmetic for money; serialize money as decimal strings. One currency per quote; INR default.
- Real calendar monthly/quarterly/yearly periods; explicit date-only billing boundaries and UTC audit timestamps.
- Immediate result refresh after writes; short polling/refetch-on-focus for cross-user updates is sufficient. Do not label this instant push synchronization.
- Development fixture adapters are allowed to unblock implementation, but cannot silently replace failed production APIs.

Transactions keep related changes together. Stock allocation and payment allocation need concurrency protection and bounded retry/conflict handling, not just a sequence of successful database calls. See official [PostgreSQL concurrency documentation](https://www.postgresql.org/docs/current/mvcc.html) and [Prisma transaction documentation](https://www.prisma.io/docs/orm/fundamentals/transactions). Use the documentation matching the pinned Prisma version.

## 4. Four ownership lanes — start together

| Person | Owns fully | Main frontend responsibility | Shared-file ownership |
|---|---|---|---|
| **Krishna** | Engine 4 recommendations; Engine 6 customer negotiation and customer-facing orchestration. | Reusable shell/theme, entry/login UI, navigation, home dashboard, quote builder and recommendation panel, restricted customer portal. | Global styles, shared UI kit, layouts, root page, navigation registry. |
| **Ruchir** | Database/schema/migrations/seed assembly; authentication backend; Engine 3 billing/subscriptions/payments; backend deployment setup. | Subscription and invoice/payment screens; approval list/detail presentation using Atharva's APIs; user-access administration. | Prisma schema/migrations/client, auth middleware, package/lockfile/env template, CI setup. |
| **Atharva** | Quote CRUD/pricing/order transition; Engine 1 governance; Engine 5 health; audit helper. | Quote list/pipeline, discount-policy setup, deal-health dashboard. | Quote/policy/health contracts and shared money/pricing functions. |
| **Harsh** | Product/variant/price-list/customer backend; Engine 2 stock/fulfillment; reporting/export backend. | Fulfillment list/detail, product catalog/editor, reports/export screen, warehouse setup. | Catalog/inventory/report contracts and demo walkthrough documentation. |

This preserves Krishna's two engines, moves the reusable frontend base to him, moves his old approval and invoice/payment UI to Ruchir, and gives Ruchir database ownership. Harsh and Atharva build their pages with Krishna's components. Ruchir does not become the author of every other person's database query; he owns the schema, while feature owners implement their repositories and queries.

The workload is ambitious. Keep the shell small, use reusable forms/tables, and implement narrow real rules. Do not spend Krishna's time on a marketing website or Ruchir's time inventing infrastructure.

### Krishna — detailed assignment

- Create compact entry page: product purpose, sign-in action, no elaborate landing animations.
- Build login/signup presentation, session loading states, role-based navigation, logout, mobile/table overflow handling, 403/404/error views.
- Publish theme tokens and reusable Button, Input, Select, Table, Card, Badge, Dialog, Tabs, PageHeader, Money, EmptyState, ErrorState, and Timeline.
- Build internal AppShell and simpler CustomerShell; everyone imports these rather than copying markup.
- Build Sales Home from Atharva's summary API: pending approvals, open quotes, at-risk deals, recent events, next action links.
- Build quote builder against Atharva's quote/pricing APIs and Harsh's catalog: product search, variants, customer, quantity, discounts, tax, totals, save/submit/send.
- Implement recommendation engine/service + API + live panel, Add and Dismiss, reasons and margin deltas; add through the canonical quote mutation.
- Implement customer portal service/API + UI: own quotes, own invoices, line comments, proposed discounts/delivery dates, full thread, version comparison, confirmation.
- Call Atharva's canonical revision/evaluation/confirmation service; never duplicate policy math or edit order tables directly.
- Add recommendation configuration editor as a small drawer using own rules API. Seed rules remain functional even if the editor is completed later.
- Verify portal network responses contain no internal fields. Build a second-customer denial case.
- Review shared visual consistency; do not rewrite teammates' functional screens in a late design overhaul.

**Done means:** browser login, builder, recommendations, negotiated revision and final acceptance work with live APIs; the portal isolates customers; all other screens reuse the shell.

### Ruchir — detailed assignment

- Translate Section 10 into Prisma models, constraints, migrations, database client, and reproducible reset/seed commands.
- Provide per-developer database/schema naming instructions; only Ruchir runs migrations on the shared integration database.
- Implement login/signup/logout/me, hashed credentials, session validation, roles, customer membership, admin user activation/role assignment. Feature owners still enforce record scope.
- Assemble seeds from each owner's fixture file; do not wait to write historical seed records until demo night.
- Implement Engine 3: initial one-time invoice, recurring subscriptions, due billing, adjustments, cancellation/credits, invoice/payment allocation and PDF.
- Build subscription list/detail and plan setup, invoice list/detail, payment dialog, credit display, due-billing action.
- Build approval list/detail UI from Atharva's contracts: why-flagged table, chain, approve/reject/return, reason, history. Atharva owns approval rules/backend.
- Include repeat-safe transaction handling and clear partial/unpaid/paid statuses.
- Own package changes, env example, CI build command, deployment/migration runbook and integration database setup. No credentials in Git.
- Smoke-check authentication and backend access on the integrated app; document exact startup commands after the repo is known.

**Done means:** a clean database can be migrated/seeded, five roles log in, invoice/subscription/payment workflows work, and approval screens drive Atharva's real decisions.

### Atharva — detailed assignment

- Implement canonical quote CRUD and immutable material revisions; list/pipeline filters and customer/rep scope.
- Implement reusable pricing math including price snapshots, line/order discounts, tax, cost/margin and separate recurring totals.
- Implement Engine 1 policy evaluation and sequential manager/finance approval with immutable audit history.
- Implement submit/send, proposed revision, customer-acceptance validation, and repeat-safe confirmed-order creation. Krishna calls these from the portal.
- Define the orderReady result that Harsh and Ruchir consume. Coordinate idempotent downstream initialization without letting either engine create duplicate orders.
- Build pipeline/list UI and discount ceiling/approval-chain editor. Supply approval APIs/fixtures to Ruchir.
- Implement Engine 5: stalled quotes, historical discount anomalies, delivery risk, flag resolution, in-app nudge/escalation tasks.
- Build health UI and supply live home-dashboard aggregates/recent events to Krishna.
- Own shared audit writer and canonical state rules, not every feature's individual audit call.
- Validate quote revision conflicts, stale acceptance/approval, rep self-approval, and aggregate-risk test cases.

**Done means:** the same engine governs rep edits, recommendations, and customer counters; order creation requires valid exact-version acceptance; health includes confirmed-but-undelivered orders.

### Harsh — detailed assignment

- Implement customer/tier records, product/catalog CRUD, categories, units, descriptions, configured taxes, variants/extra prices, costs, price lists and plan links.
- Build product catalog and product/price-list editor. Plan options come from Ruchir's plan contract; use fixtures until that API is live.
- Implement warehouses, stock per variant, receipts, replenishment thresholds, shipping weights and warehouse settings UI.
- Implement Engine 2 suggestion, acceptance, override, partial allocation, backorders, consolidation, shipment progress, cancellation release.
- Build fulfillment list/detail with quantity, available/reserved stock, shipment count/cost, actions, and shortages.
- Implement report aggregates/filters/exports and build reporting screen. Consume stored records; do not rebuild each engine's calculation independently.
- Verify simultaneous stock claims and manual overrides without reservation leakage.
- Own the one-page architecture/data-model diagram and README demo scenarios; other owners check their portions.
- Act as release reviewer for Krishna's shell/portal PRs; Ruchir remains deployment owner.

**Done means:** catalog changes feed real quotes, allocation cannot oversell, replenishment clears genuine backorders, reports/exports reflect actual records.

## 5. Every Excalidraw screen has an owner

Screen numbers follow the supplied DealFlow360 diagram. A row is complete only when its visible actions and states work; navigation to a placeholder does not count.

| # | Diagram screen | UI owner | Data/engine owner | Required visible behavior |
|---|---|---|---|---|
| 01 | Login / Signup | Krishna | Ruchir | Sign in/signup, validation, role redirect, logout. Forgot-password link opens an honest recovery path; recovery handler owned by Ruchir. |
| 02 | Sales Dashboard / Home | Krishna | Atharva | Pending approvals, open quotes, at-risk count, recent activity, New Quote, View Approvals. |
| 03 | Quotations / Pipeline | Atharva | Atharva | Stage cards, selectable quotes, list toggle, new quote, scoped data. |
| 04 | Quotation Detail / Builder | Krishna | Atharva + Krishna + Harsh catalog | Lines, variant/qty/discount, totals/tax, margin, recommendations, Save Draft, Submit, send/portal access. |
| 05 | Approvals List | Ruchir | Atharva | Pending/returned/completed filters, required level, assigned reviewer, open detail. |
| 06 | Approval Detail | Ruchir | Atharva | Risk/reason table, manager→finance chain, immutable timeline, Approve/Return/Reject. |
| 07 | Fulfillment and Stock List | Harsh | Harsh | On-hand/reserved/available quantities, ready orders and backorder states. |
| 08 | Fulfillment Detail | Harsh | Harsh | Recommended split, shipment count/cost, accept, override, consolidate eligible remainder. |
| 09 | Subscriptions List | Ruchir | Ruchir | Status filters including paused if displayed, plan/frequency/next bill, detail navigation, New Plan/setup. |
| 10 | Billing Detail | Ruchir | Ruchir | One-time/recurring separation, dates, schedule, quantity/plan change, cancel, adjustments/credits. |
| 11 | Customer Portal Negotiation | Krishna | Krishna + Atharva state service | Own terms/status, line messages, counteroffer, Submit Request, Confirm, reapproval state. |
| 12 | Invoices List | Ruchir | Ruchir | Unpaid/partial/paid filters, customer/amount/due date, detail navigation. |
| 13 | Invoice Detail | Ruchir | Ruchir + Harsh delivery read | Order/shipment/invoice/payment progress, line/tax amounts, record payment, partial balance, document PDF. |
| 14 | Deal Health / Anomaly Dashboard | Atharva | Atharva | Stalled, anomaly, delivery risk cards; exact quote links; Escalate/Nudge actions. |
| 15 | Admin / Reporting Dashboard | Harsh | Harsh | Period/team/approval/product filters, sales/approval/product metrics, PDF and spreadsheet export. |
| 16 | Product Dashboard | Harsh | Harsh | Product/price-list/variant counts, catalog table, New Product, Manage Price Fields. |
| 17 | Product and Price List | Harsh | Harsh | Category/price/tax/unit/description, variants and extra prices, tier/currency price rules, subscription flag and plan. |
| 18 | Discount Tiers and Approval Chains | Atharva | Atharva | Tier limits, category limits, risk routing, editable saved configuration used immediately on new evaluations. |

Supplementary configuration is not optional just because it lacks a numbered screen: users/roles (Ruchir); customer master (Harsh); warehouse/stock/replenishment (Harsh); plans/proration/cancellation (Ruchir); recommendation rules (Krishna); health thresholds/tasks (Atharva). Implement compact tabs/drawers rather than inventing more disconnected pages.

For invoice progress, show independent facts. A paid invoice can have pending delivery; do not force the diagram's visual stepper to imply otherwise. For subscription pause, stop new cycles while paused; resume at a declared new cycle boundary without silently charging paused periods. Ruchir implements and displays that policy.

## 6. Shared UI contract — follow Krishna's base without waiting

Krishna owns theme tokens: colors, font, spacing, radius, typography, table density, status colors. Default direction: clean B2B workspace, legible tables, restrained accents, clear financial totals. Do not copy tiny screenshot text sizes.

Every owner can start page components immediately against these interfaces:

- `PageHeader(title, description?, actions?)`
- `StatusBadge(status, label?)`
- `DataTable(columns, rows, loading, emptyMessage)`
- `Money(amount, currency)`
- `Dialog(open, onClose, title, children, footer?)`
- `AppShell(children)` and `CustomerShell(children)`

If the components have not landed, use a thin **local development adapter** with the same props. Krishna's real components replace the adapter by import change; no owner designs a competing theme. Krishna should publish the smallest usable kit early, not finish every UI detail before sharing it.

Shared requirements: loading/empty/error states, visible failed saves, confirmation for consequential actions, keyboard labels/focus, responsive navigation and horizontally scrollable wide tables, no success toast before server success. Reload refetches real data. Go to Backend respects permissions. Close Workspace returns to home; Logout ends the session.

## 7. Start independently, integrate continuously

There are real runtime dependencies; pretending there are none would create a broken system. We remove **waiting for another person's code**, using agreed contracts and replaceable development fixtures.

| Person can start immediately with | Without waiting for |
|---|---|
| Krishna: UI kit, builder fixtures, recommendation calculations, portal proposal UI/service tests | Auth/database/approval implementation |
| Ruchir: schema/migrations/auth, billing math from a ConfirmedOrder fixture, invoice and approval screens | A real customer-confirmation event |
| Atharva: pricing/risk/revisions/health calculations, quote/pipeline UI | Database being online or shell being polished |
| Harsh: catalog forms, split algorithm from stock fixtures, report layouts/export fixtures | A real confirmed order |

Fixtures are typed examples with the same shape as real results. Pure engine functions accept inputs and return outputs without importing the database. The feature service adds permissions, persistence, audit, and transaction handling. Each owner swaps the repository adapter to PostgreSQL as it becomes available.

No engine waits for a global skeleton gate. No production fallback to fixtures. Every PR states `LIVE`, `DEV FIXTURE`, or `NOT CONNECTED`; only LIVE counts at 22:00.

### Shared boundaries agreed by this document

| Boundary | Owner | Input → output |
|---|---|---|
| Auth session | Ruchir | credentials → actor `{id, role, customerId?, active}`; session cookie, not a browser-selected role |
| Catalog | Harsh | customerId/search → resolved product/variant prices, tax, unit, plan reference |
| Quote pricing | Atharva | customer/tier, currency, lines, orderDiscountPct → calculated lines, one-time total, recurring totals by interval, tax and margin |
| Policy evaluation | Atharva | priced revision + policy snapshot → risk level, breached lines, aggregates, required chain |
| Suggestions | Krishna | quote revision + eligible catalog/rules → ranked candidates/reasons/profit delta/margin change |
| Proposed revision | Atharva | quoteId, expectedRevision, proposed terms, actor → new revision/evaluation; old decisions retained |
| Customer proposal | Krishna | quoteId, expectedRevision, line comments/proposed discount/date → saved proposal and evaluated proposed revision |
| Approval action | Atharva | revisionId, decision, reason, actor → next approver/status; duplicate-safe |
| Customer confirmation | Atharva, invoked by Krishna | quoteId, expectedRevision, customer actor, requestKey → same single confirmed order on repeat |
| Split preview/commit | Harsh | confirmed order + stock → suggestion; explicit commit → reservations/backorder/shipment plan |
| Billing initialization | Ruchir | immutable confirmed order, requestKey → one-time invoice + subscription records; repeat returns existing records |
| Health | Atharva | stored quotes/orders/history, current time, settings → current flags and next actions |
| Reports | Harsh | period/team/status/product filters → aggregates and exports from same filtered dataset |

All mutating quote requests include `expectedRevision`. Conflicts return a clear `409` and current revision; reload and review rather than overwriting. Shared errors: `401` unauthenticated, `403` forbidden, `404` unavailable record, `409` stale/conflict, `422` invalid input. Successful result: `{data: ...}`; error: `{error: {code, message, details?}}`.

Use string IDs, percentages from 0–100, decimal-string money, ISO dates. Do not mix camelCase and snake_case across API layers; TypeScript API contracts use camelCase.

### Minimum endpoint families

- Ruchir: `/api/auth/*`, `/api/admin/users`, `/api/plans`, `/api/subscriptions/*`, `/api/invoices/*`, `/api/payments`, `/api/billing/run-due`.
- Atharva: `/api/quotes/*`, `/api/approvals/*`, `/api/policies`, `/api/health/*`, `/api/dashboard`.
- Harsh: `/api/customers`, `/api/products/*`, `/api/price-lists`, `/api/warehouses/*`, `/api/stock/*`, `/api/fulfillment/*`, `/api/reports/*`.
- Krishna: `/api/recommendations/*`, `/api/portal/*`. Portal uses customer-specific response shapes even when reading billing/order records.

### Confirmation handoff — no hidden duplicate writes

Atharva owns `confirmOrder`. It validates approval and customer acceptance on the same revision and creates one immutable order. In the same database transaction it calls Ruchir's lightweight database-only billing initializer and Harsh's pending-fulfillment initializer; neither sends email nor reserves stock. All accept the transaction client and the same order ID. A unique source-revision constraint makes retries safe. Harsh's stock reservation happens only when allocation is accepted. If initializers are not wired in development, report NOT CONNECTED; do not return a fake complete order. This handoff is an early integration contract, not a late-night design decision.

## 8. Six engine specifications and acceptance checks

### Engine 1 — Pricing governance and approvals (Atharva)

1. Resolve customer price list and variant extra price; snapshot accepted prices/costs/taxes.
2. Validate quantity > 0; discount 0–100; money finite/nonnegative. Use a separate configured price change for an upcharge rather than ambiguous negative discount.
3. Effective discount with sequential line/order discounts: `100 × (1 - (1-linePct/100) × (1-orderPct/100))`.
4. Line ceiling = stricter of applicable tier/category ceilings; absent category falls back to tier. Missing essential tier configuration blocks submission with a setup message.
5. Excess points = `max(0, effectivePct - ceilingPct)`; excess amount = undiscounted line amount × excess points / 100.
6. Weighted excess = total excess amount / total undiscounted amount × 100. Also calculate worst-line excess. Empty or zero-base quote cannot be submitted.
7. Sample configurable rules: any excess → Manager; worst excess > 5 points OR weighted excess > 3 points → Manager then Finance. Optional total discount budget threshold can also escalate within-line-limit deals. These are team policy choices, not official mandated numbers.
8. For mixed billing intervals, evaluate one-time and each recurring interval group separately, then take the highest required level. Do not add annual and monthly recurring amounts as if they were comparable.
9. Display breached lines, weighted result, required chain and reasons. Editing materially creates a new revision and supersedes previous decisions.
10. Approval actions check role, step order, revision, self-approval restriction, and reason. Preserve all prior entries.

Checks: official Gold hardware 12% vs 15% is allowed; service 18% vs 10% routes to Manager then Finance under sample rules. A small breach routes to Manager. Splitting an identical line into two does not change aggregate risk. Order discount cannot bypass policy. Finance cannot act first. Old approval cannot validate new terms. Two concurrent edits conflict clearly.

### Engine 2 — Warehouses, fulfillment and backorders (Harsh)

1. Process stock-tracked variants only; skip services/subscriptions and zero/cancelled quantities.
2. Available = onHand - reserved. Aggregate demand across repeated variant lines before comparing stock, while retaining order-line allocation links.
3. Preview: try a single warehouse that covers all demand; otherwise use a deterministic heuristic balancing coverage, shipment count and configured shipping cost. Label estimated cost and do not claim global optimization.
4. Preview decrements only a local working stock map. It writes NO reservations.
5. Accept: lock/recheck relevant stock and commit reservations once, with a unique request key. Report shortage conflicts rather than overcommitting.
6. Store backorder remainder explicitly. Quantities across allocation + backorder must equal remaining order demand.
7. Override: account for this order's existing unshipped reservations; validate replacement and release/reassign atomically. Never alter shipped quantities.
8. Receipt increases onHand and reevaluates eligible backorders; prompt before committing newly available stock. Process other existing reservations too.
9. Consolidate only unshipped remainder. If earlier shipment left, create another shipment; don't rewrite its history.
10. Ship: consume onHand and reserved exactly once; mark delivered separately. Cancel unshipped allocation releases reserved stock.

Checks: one warehouse, two warehouses, short stock, repeated product lines, concurrent orders, preview-without-write, repeated Accept, manual override, receipt/consolidation, service-only order, reservation release. Paid-but-backordered orders remain visible.

### Engine 3 — Billing, subscription and payments (Ruchir)

1. At confirmation, create one one-time invoice for nonrecurring lines and subscription records for recurring lines. Initial due-billing action creates first recurring invoices. The initial billing screen shows both, linked to one order.
2. Use explicit upfront billing for ordered hardware, even if some goods are backordered; display this policy. No claim that the system supports every invoicing policy.
3. Invoice lines preserve descriptions, quantity, agreed unit price, discounts, taxes and totals. Do not use the current catalog to recompute old invoices.
4. Calendar periods: monthly +1 month, quarterly +3, yearly +12; preserve original anchor day and clamp to valid month-end. Compute actual period days from `[start, end)`.
5. Due billing creates one invoice per subscription/period, advances the period correctly, and is safe to retry or run simultaneously. A manual button executes the real billing function.
6. Mid-period quantity change: `(new full-period amount - current full-period amount) × remainingDays / periodDays`; store before/after/effective date and the linked adjustment. Tax adjusts consistently.
7. Same-frequency plan changes may apply immediately using that period. Different-frequency changes take effect at renewal in this prototype; show pending new plan/date. Cancellation and current-period quantity changes still support proration.
8. Repeated same-period changes use the current rate, preserve prior adjustments, and never recalculate historical invoices. Disallow backdated changes before the latest applied adjustment in the prototype.
9. Cancellation policy determines immediate or period-end stop and eligible unused-service credit. Credit only billed service, account for prior credits, and link the source invoice. No credit for an unbilled initial period. Refund cash is separate from issuing a credit.
10. Pause/resume behavior is explicit: pause prevents new cycles; existing invoiced period remains under cancellation/credit policy; resume starts a new cycle, no automatic charge for paused periods.
11. Payments require finance/admin permission, amount/date/method/reference and request key. Invoice status uses payments and applied credits. Reject overpayment with a clear message for this prototype.
12. PDF download uses actual invoice lines/status; a credit note is shown as credit, not positive revenue.

Checks: hardware charged once; monthly recurring charge; repeat due run; leap/month-end dates; increase/decrease mid-cycle; boundary-day change; cancellation before first invoice; partial/full payment; repeated payment; credit against unpaid versus paid invoice. Example period Sep 1–Oct 1, unit 920, +2 units on Sep 16: 15/30 × 1840 = 920 adjustment.

### Engine 4 — Upsell/cross-sell (Krishna)

1. Candidate pairings use seeded co-purchase history/rules; boost eligible promotions.
2. Resolve actual customer price and applicable order discount, not a catalog-only margin.
3. Exclude already-present products, inactive/incompatible products, and candidates below minimum margin. Fallback candidates pass the same checks. Empty results show “No qualifying suggestions.”
4. Rank deterministically and return reason, promotion tag, incremental profit amount and margin-percentage-point change. Separate one-time and recurring impact; do not invent lifetime profit.
5. Add uses canonical quote mutation, updates totals and approval evaluation, and creates a new revision if material. A zero line discount does not exempt the item from order-level discount or approval invalidation.
6. Dismiss is local to the current quote session. Small optional configuration drawer manages pairings/promotions/thresholds; the required suggestion behavior is never static.

Checks: add laptop → relevant mouse/dock/support; healthy filtering; promotion fallback cannot bypass threshold; add updates real totals; duplicate candidate excluded; empty state; later discount can change qualification.

### Engine 5 — Deal health and actions (Atharva)

1. Stalled: submitted/sent/negotiating quotes with no meaningful business activity beyond configurable threshold (default 5 days). Page reads and automatic refreshes do not reset activity.
2. Anomaly: compare current value-weighted effective discount with the rep's prior comparable confirmed quotes, excluding the current quote and future records. Default requires 3 prior samples and flags > historical average +10 points. Insufficient history is stated.
3. Delivery: compare promised date to remaining undelivered goods; include confirmed and fully paid orders. Payment never implies delivery. Early risk may show insufficient allocation before the date; overdue means date has passed with remainder.
4. Upsert active flags and resolve flags that no longer apply; preserve history. Avoid duplicate alerts on every refresh.
5. Dashboard reads stored facts; Refresh reevaluates. Nudge/Escalate creates a task assigned to an actual rep/manager/operations user, linked to the deal, with status and due date.

Checks: aged quote, current quote, cold-start rep, known anomaly, paid-undelivered order, delivered order resolves flag, repeated refresh creates no duplicates, task opens correct deal. No need for historical seed data to detect a simple stalled quote; history is specifically needed for anomaly comparison.

### Engine 6 — Customer negotiation (Krishna)

1. Authenticate and enforce customer membership before fetching quote, order, invoice, or line.
2. GET requests never change status. Customer receives only explicitly allowed fields.
3. Save line questions and proposed discount/qty/date as a proposal with sender identity and timestamp.
4. A numeric counter creates a proposed revision and immediately invokes canonical evaluation; if it breaches limits, queue approvals. Within-limit proposals still remain clearly identified as proposed terms until customer acceptance. Inform the rep; no overwrite of historical versions.
5. Date-only requests are proposals, not guaranteed delivery promises. Rep/operations must accept a revised promised date; numeric discount risk need not change, but terms revision and acceptance must be renewed.
6. During pending approval/revision, confirmation is blocked server-side as well as in UI. Reapproval presents the exact approved revision for customer acceptance.
7. Confirmation sends expectedRevision/requestKey and calls Atharva's confirmOrder. Stale browser tabs receive a conflict. Repeated confirmation returns the same order.
8. Retain conversation, revisions, prior approvals and acceptance history. After order confirmation, lock direct quote edits; subscription changes use the billing workflow, not quote rewriting.

Checks: no-change acceptance; within-limit counter; excessive counter; lower counter still over limit; date-only request; stale version; duplicate acceptance; customer B cannot access customer A even by guessed URL; no costs/margins in network payload.

## 9. Minimal state rules shared by everyone

Track independent dimensions rather than treating CONFIRMED as the end of all work:

- Quote display stage: DRAFT, PENDING_APPROVAL, APPROVED, UNDER_NEGOTIATION, CONFIRMED, REJECTED.
- Revision approval: NOT_REQUIRED, PENDING, APPROVED, REJECTED, SUPERSEDED.
- Customer acceptance: revision reference + actor/time; no acceptance for old terms counts.
- Fulfillment: PENDING, PARTIAL, ALLOCATED, SHIPPED, DELIVERED, CANCELLED; line-level quantities remain authoritative.
- Subscription: ACTIVE, PAUSED, CANCELLED with pending-plan/effective-date fields.
- Invoice: UNPAID, PARTIALLY_PAID, PAID, VOID; credits are separate linked documents/application records.

Rep cannot manually force CONFIRMED. Current approved/not-required revision plus matching customer acceptance is required. Viewing a record never advances it. New terms supersede approval history, not delete it. Finalized order/invoice lines are snapshots.

## 10. Data-model checklist for Ruchir and all feature owners

This is a minimum implementation model, not a claim that the previous schemas were complete. Ruchir owns schema syntax; owners provide fields needed by their lane immediately. Simpler grouping is acceptable if all relationships and constraints survive.

| Record group | Essential fields/relationships | Feature owner |
|---|---|---|
| User / Session / CustomerMembership | Unique email, hash/auth reference, active, role incl CUSTOMER; customer linkage; session expiry | Ruchir |
| Customer / SalesTeam | Name/contact/tier/currency/assigned rep; team membership for filters | Harsh |
| Product / Variant / PriceList / PriceRule | Category, unit, description, tax, base price/cost, stockTracked, active, plan reference; attributes/extra prices; tier/currency rule | Harsh |
| PolicyVersion | Tier/category ceilings, manager/finance thresholds, approval chain, optional total budget; immutable version | Atharva |
| Quote / QuoteRevision / QuoteLine | Customer/rep/team, current revision, stage, activity; snapshot terms, policy/pricing, currency, discount, promised date; product/variant, qty, unit price/cost/tax/plan | Atharva |
| ApprovalDecision / CustomerAcceptance | Revision FK, actor/role, decision/reason/time; exact accepted revision | Atharva |
| Proposal / NegotiationMessage | Quote/revision/line references, actual sender user, proposed values, status, text/time | Krishna |
| Order / OrderLine | Unique source quote revision, immutable accepted line data, customer/rep/team, promised date | Atharva |
| Warehouse / Stock / StockReceipt | Warehouse shipping cost/active; unique warehouse+variant, onHand/reserved, threshold; receipt key/time | Harsh |
| Reservation / Shipment / ShipmentLine / Backorder | Order-line linkage, variant/warehouse/qty, status; remaining quantity; nullable source only for unallocated remainder | Harsh |
| SubscriptionPlan / Subscription / Change | Interval/anchor/proration/cancel policy; unique source order line, dates, agreed price/qty, status; immutable change history and linked adjustments | Ruchir |
| Invoice / InvoiceLine / CreditNote | Customer/order/subscription/period/currency/due date; snapshots and tax; linked credited invoice and reason | Ruchir |
| Payment / CreditApplication | Invoice, positive amount, method/reference/date, actor, unique request key; credit applications accounted separately | Ruchir |
| RecommendationRule | Base/candidate product, co-purchase score, promotion, minimum margin, active | Krishna |
| HealthFlag / Task | Deal/order reference, type/reason/detected/resolved; assignee/due/status and action key | Atharva |
| AuditEvent / RequestKey | Entity/id/revision/actor/action/time/reason, immutable metadata; action scope/key/result linkage | Atharva; schema Ruchir |

Constraints: one order per accepted revision; unique invoice per subscription and period/type; unique replay keys; stock cannot become negative; payments/credits cannot be applied twice; customer FK and access checks on portal reads; searchable indexes for quote lines, decisions, customer records, due subscriptions and active flags. Do not hard-delete referenced financial/catalog records; archive products instead.

## 11. File boundaries and GitHub workflow

Suggested paths are contracts for a new repo; adapt once to an existing structure and publish that map. Do not create duplicate architectures.

| Owner | Main paths |
|---|---|
| Krishna | `src/components/ui/`, `src/components/shell/`, `src/styles/`, root layout/home/login; `src/features/builder/`, `src/features/recommendations/`, `src/features/portal/`; their API routes |
| Ruchir | `prisma/`, `src/lib/db/`, `src/lib/auth/`, `src/features/billing/`, `src/features/approval-ui/`, admin users; auth/billing routes; package/lockfile/CI |
| Atharva | `src/features/quotes/`, `src/features/governance/`, `src/features/health/`, `src/lib/pricing/`, `src/lib/audit/`; their routes |
| Harsh | `src/features/catalog/`, `src/features/inventory/`, `src/features/reports/`; their routes; architecture/demo docs |

Each lane owns a separate contracts file under `src/contracts/<lane>.ts` and `src/fixtures/<lane>.ts`. Do not make one giant contract file everybody edits. Cross-lane changes require a short interface note with before/after examples; producer preserves the old field until consumers migrate where possible.

### Branches and merge rules

- `krishna/shell-portal-recommendations`
- `ruchir/data-auth-billing`
- `atharva/quotes-governance-health`
- `harsh/catalog-fulfillment-reports`

Use one branch/worktree per person, never four people editing one checkout. Push small working commits to GitHub and open draft PRs early. A small foundation PR may land early, but others keep implementing functions/screens against contracts while it is reviewed.

PR contents: changed screens/engine, API/schema changes, LIVE versus fixture status, checks performed, known blockers. Review pairings: Krishna ↔ Harsh, Ruchir ↔ Atharva; affected contract owner also reviews interface changes.

Merge one PR at a time into the shared integration branch (`main` if the repo has no separate integration branch). Pull/rebase your own unshared work after merges; never force-push main. Do not silently overwrite a shared branch. Ruchir reconciles migrations/lockfile; Krishna resolves theme/layout conflicts. Schema changes are additive during the build. Never reset the shared demo database to fix an individual branch.

All owners bring their route/API code; Krishna is not required to wire every page manually. Route modules import the common shell. Only the small nav registry remains Krishna-owned; send route entries in your PR.

Continuous integration minimum: install from lockfile, typecheck, build, targeted engine/contract checks. After each merged capability, its owner runs the relevant live flow on integration. No giant end-of-day merge of four untested feature branches.

## 12. Clock-based acceptance commitments — not serial work phases

All owners work in parallel throughout. Set T = event day 22:00 IST. These are shared readiness checks, not permission gates before someone else may begin.

| Latest checkpoint | Every lane's commitment |
|---|---|
| T−6h | Contracts/fixtures available; core engine calculations executable; smallest shell and schema/auth changes landing. |
| T−4h | Real API-backed lane screens and local database behavior; at least first cross-owner quote/approval/portal handoff on integration. |
| T−2h | Normal quote→customer acceptance→order→allocation→billing→payment runs end-to-end; exception revision loop integrated. |
| T−1h | All six engines live; all 18 screen routes/action wiring present; owners fix failed checks together. |
| **T = 22:00** | Core acceptance below passes on the shared deployed/integration build, with evidence. |

If a listed checkpoint is already in the past when this plan is adopted, treat it as an immediate status check. Do not pretend elapsed hours remain. Reassign a bounded UI task through an explicit owner change if overloaded; avoid assigning a fifth person. If completion is at risk, report the exact missing behavior and revised estimate, not “almost done.”

After 22:00, prioritize remaining required behavior or fixes before extras. Extra services start only after the core is verified. A deadline is a target, not a guarantee of feasibility.

### Core acceptance by 22:00

- [ ] Five roles log in; wrong-role actions denied on the backend.
- [ ] Catalog, variants, customer pricing, policy, warehouse and plan settings are editable and used.
- [ ] Quote CRUD, line/order discounts, tax and totals work from actual records.
- [ ] Recommendations are ranked/filtered and update real quote results.
- [ ] Manager/finance routing, rejection/return, history and superseded revisions work.
- [ ] Customer counterproposal returns to approval and current-version acceptance confirms once.
- [ ] Warehouse split, manual override, true backorder, receipt and consolidation work without double reservation.
- [ ] One-time/recurring billing, due-run retry, proration and cancellation credit work.
- [ ] Partial/full payment changes outstanding amount correctly and safely on repeat.
- [ ] Stalled/anomaly/delivery alerts and in-app nudge/escalation actions work.
- [ ] All 18 screens and supplementary configuration are reachable and functional with consistent shell.
- [ ] Report filters and PDF/spreadsheet exports use live records.
- [ ] Customer network responses exclude cost/margin and other customers.
- [ ] Two live end-to-end scenarios pass; no final path depends on fixtures.

Optional after acceptance: live payment gateway, external email nudges, courier rates, advanced recommendation modeling, SSO, multi-company, multi-currency conversion, elaborate animations. Never replace required ranking, alerts, or exports with static placeholders and call them extras.

## 13. Shared demo data and two walkthroughs

Use fixed symbolic fixture IDs consistently across all owners: `customer-acme`, `customer-beta`, `rep-arjun`, `manager-sana`, `finance-farah`, `customer-neha`, `warehouse-main`, `warehouse-east`. Actual database IDs may differ; Ruchir's seed resolver maps symbols. No domain code branches on a demo customer name.

Harsh supplies catalog/warehouse/customer fixtures; Atharva supplies policies and dated deal history; Krishna supplies recommendation pairs and negotiation examples; Ruchir supplies plans/accounts/billing records and assembles them. Seed at least 15 prior realistic confirmed deals with varied dates/discounts for monitoring, plus active aged quotes and a paid-but-undelivered order. Do not expose seeded historical records as real customer traction.

### Coherent numerical example

Gold Acme buys ten laptops at 50,000 each (cost 40,000), ten docks at 3,000 (cost 2,000), and ten support seats at 1,000/month (cost 400). Use INR and a zero-tax fixture only for easy demo arithmetic; separately test a nonzero configured tax.

Seed Gold 15%, Hardware 15%, Services 10%, and classify recurring support under Services with a recurring plan. Product category and billing behavior are separate concepts. Initial hardware discount 12%, support 8%: one-time 466,400; monthly 9,200. Both are within policy.

For the approved exception demonstration, propose hardware 18% and support 16%: hardware excess three points and support excess six points, so Finance is required under the worst-line rule. One-time total becomes 434,600 and monthly support becomes 8,400. Hardware cost 420,000 gives profit 14,600; monthly support cost 4,000 gives profit 4,400. UI shows those actual margins; reviewers approve explicitly. These are sample configurable policies, not promised optimal commercial terms.

For a recurring adjustment on this same deal, increasing support by two seats halfway through a 30-day actual period gives 2 × 840 × 15/30 = 840. The separate 920-unit example in the engine tests is a different test fixture, not this revised deal.

Stock: Main has six laptops and ten docks; East has three laptops. One laptop remains backordered. Add one laptop receipt and consolidate only the unshipped remainder.

### Flow A — routine sale through payment (about two minutes)

Login as rep → select Acme → add laptop and support → accept dock recommendation → show within-limit evaluation → customer accepts exact quote → order → accept split → show separate initial one-time/recurring invoices → record payment on one invoice and show changed balance. Use saved product/customer setup, not a long admin tour.

### Flow B — negotiated exception through billing/fulfillment (about three minutes)

Open another sent quote as customer → request support discount over ceiling → show automatic Manager then Finance → both decisions with reasons → customer accepts latest version → order and allocation/backorder → record receipt/consolidation → generate billing → show one quantity proration explanation. End with live delivery/discount alert and its action link. Seed session tabs for role changes; these are real authenticated sessions, not a production auth bypass.

If the full walkthrough is too long, shorten clicks with prepared draft records and pre-opened tabs, not fabricated results. Both scenarios must reach an actual fulfillment or billing outcome. Rehearse within five minutes.

## 14. Verification and submission ownership

| Owner | Must show evidence for |
|---|---|
| Krishna | Consistent shell; live recommendation total; customer isolation; proposed/reapproved/current-version acceptance; portal payload inspection. |
| Ruchir | Fresh migrate/seed; role restrictions; invoice math/tax; proration boundary; duplicate billing/payment prevention; deployed startup. |
| Atharva | Mixed-category and aggregate routing; old approvals retained; stale edit rejection; repeat confirmation; paid-undelivered alert. |
| Harsh | Repeated-product allocation; competing orders; preview no reservation; override release; receipt/backorder; filtered report/export match. |

Test the business risks above rather than writing tests for every presentational component. Unit checks cover engine arithmetic; database integration checks cover concurrent/duplicate writes; browser checks cover the two complete journeys and customer isolation.

Harsh owns the final one-page architecture/data-model diagram and draft roadmap; Ruchir verifies deployment instructions and credentials handling; Krishna drives the UI demo; Atharva narrates the rules and checks the timing. Harsh is backup demo driver. Keep a resettable demo dataset and a pre-recorded backup only if allowed; do not substitute a recording for a required live demo.

Submission checklist: working app/repo, seed/start instructions, five-minute live demo, one-page architecture with relationships, roadmap note, all required links according to organizer instructions. No push or deployment is performed by this planning document.

## 15. Instructions to every coding agent

Read this document and the existing repository instructions. Identify your named owner and implement only that lane plus explicitly agreed shared contributions. Do not restart the project, change the database, introduce a second UI theme, or follow the superseded global “gate before engines” rule.

Start your assigned engine and screens against these contracts immediately. Keep fixture-only development visibly separate. Coordinate contract/schema changes through the owner; never wait silently. Implement permissions and state validation server-side. Use canonical quote pricing/evaluation/confirmation rather than copying formulas into the portal or recommendations.

Each progress report should say: **working live behavior; remaining behavior; interface needed; checks run; PR/commit reference**. Never claim complete from screenshots or mocked endpoints. Mark incomplete functionality accurately and continue toward the acceptance checklist.

## 16. Reviewer explanation

“We are building a connected B2B sales workflow where changing a deal triggers the right checks. A customer can negotiate a hardware-and-support quotation; revised terms are evaluated and approved, stock is allocated without overselling, and hardware and recurring service are billed correctly. Our emphasis is explaining what changed, why action is required, and who acts next, with exact-version approvals and traceable calculations. Four owners are implementing against shared contracts and integrating continuously.”

This is our design emphasis, not a claim that existing ERP products lack these capabilities. Success evidence is correct live behavior, not a guaranteed prize or invented savings percentage.
