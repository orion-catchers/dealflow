# DealFlow360 team integration handoff

Updated 2026-09-05, Asia/Kolkata. Owner: Krishna.

This branch contains the complete local frontend experience and Krishna’s two server services. The latest request explicitly expanded frontend ownership to Krishna, so the screens below are the shared frontend implementation. Backend ownership remains with the original owners. The local application is `DEV FIXTURE`; it is ready for service binding but is not a PostgreSQL or live-service integration.

## What is delivered

The single Next.js application runs from the repository with `npm run dev:fixture` at `http://127.0.0.1:3000`. The fixture store is a serialized JSON store under `.dealflow-development/`, survives page reloads and server restart, and is reset only through the administrator’s development reset action. It is intentionally rejected when `NODE_ENV=production`.

The route surface is:

| Route | Screen or workflow | Access |
|---|---|---|
| `/` | DealFlow360 entry and commitment explanation | Public |
| `/login`, `/signup` | Server session login and account request | Public |
| `/home` | Sales dashboard and recent activity | Staff |
| `/quotes`, `/pipeline` | Quotation list, filters and pipeline stages | Staff |
| `/quotes/new`, `/quotes/:id` | Quote creation, canonical-priced builder, totals, margins and recommendations | Admin/sales; detail is role-scoped |
| `/approvals`, `/approvals/:id` | Approval inbox and sequential manager/finance decision | Staff |
| `/fulfillment`, `/fulfillment/:id` | Confirmed orders, preview availability, allocation, shipment and delivery | Staff; allocation finance/admin |
| `/subscriptions`, `/subscriptions/:id` | Recurring commitments, plan changes, pause/resume/cancel and due billing | Staff; mutations finance/admin |
| `/invoices`, `/invoices/:id` | Invoice list, detail, PDF and payment recording | Staff |
| `/health` | Deal-health signals and follow-up tasks | Staff |
| `/reports` | Filtered pipeline/financial report and PDF/XLSX exports | Staff |
| `/products`, `/products/:id`, `/price-lists` | Product dashboard, variants and customer pricing rules | Admin |
| `/policies` | Discount ceilings and approval routing configuration | Admin/manager |
| `/settings/users` | User and role administration | Admin |
| `/settings/customers` | Customer master records | Admin |
| `/settings/warehouses` | Warehouse, stock receipt and replenishment thresholds | Admin/finance |
| `/settings/plans` | Subscription plan and cancellation policy records | Admin/finance |
| `/settings/recommendations` | Pairing, promotion, score and minimum-margin rules | Admin/manager |
| `/settings/health` | Stalled, anomaly and history thresholds | Admin/manager |
| `/portal` | Customer-scoped quotations, orders and invoices | Customer |
| `/portal/quotes/:id` | Customer terms, question/counterproposal, history and confirmation | Owning customer |
| `/portal/orders/:id`, `/portal/invoices/:id` | Customer-safe order and invoice detail | Owning customer |

The shared frontend is in `src/components/application/` and uses the compact light slate, white and deep-teal design system in `src/app/globals.css`. Existing reusable primitives remain in `src/components/ui`, and the older lane components remain source-compatible for teammate adoption. The supplied plain landing background is copied to `public/brand/landing-reference.png` and is used as a full-viewport entry/login surface; operational tables remain on solid surfaces.

## Krishna services and contracts

### Engine 4: recommendations

`src/features/recommendations/rank.ts` is the pure qualification and deterministic ranking function. `src/features/recommendations/server.ts` is the server orchestration. It accepts saved pairing rules and canonical candidate previews, rejects stale quote/revision/currency data, excludes present or dismissed products, applies the same minimum-margin check to fallback candidates, ranks promotions before co-purchase score and stable IDs, deduplicates by product, and returns the reason plus interval-specific incremental profit, candidate margin and margin change points.

The API is:

```text
GET  /api/recommendations/:quoteId
POST /api/recommendations/:quoteId/add
POST /api/recommendations/rules
```

The add body is `{ expectedRevision, requestKey, productId, variantId }`. The server reevaluates the selected candidate and calls `TransactionPort.canonical.addLine`; the browser never calculates or persists totals. `requestKey` is caller-owned and replaying it with the same fingerprint returns the original result. A new key is a new operation. Dismissal is local to the current quote view and never pretends to change backend state.

### Engine 6: customer negotiation

`src/features/portal/server.ts` owns the server orchestration. It requires an active server-validated customer actor, fetches through `customerQuote(quoteId, customerId)`, validates line changes/comments/dates, checks the expected revision, calls `canonical.revise` for numeric changes, stores proposal and message history, and keeps a requested delivery date in `requestedDate/dateReviewPending` until staff reviews it. `confirm` requires the current revision and `APPROVED` or `NOT_REQUIRED`, rejects pending date review, and forwards to `canonical.confirm`.

The portal API is:

```text
GET  /api/portal
GET  /api/portal/quotes/:quoteId
GET  /api/portal/orders/:orderId
GET  /api/portal/invoices/:invoiceId
POST /api/portal/quotes/:quoteId/proposals
POST /api/portal/quotes/:quoteId/confirm
```

Portal responses are reconstructed through explicit allowlists. They include customer prices, taxes, totals, quantities, discounts and billing intervals, but never costs, profit, margins, approval reasons, internal notes, rep IDs or other customers. Orders and invoices are separately scoped. Reads do not write state. The same request key and payload return the prior proposal or order result; a changed payload produces `409 KEY_REUSE`. Stale revisions produce `409 STALE_REVISION` with `currentRevision`.

The shared application contracts are in `src/contracts/application.ts` and the producer-facing older adapter shapes remain in `src/contracts/krishna.ts`. Money is a two-decimal decimal string, percentages are 0–100, dates are ISO calendar dates, IDs are strings, and all quote mutations carry `expectedRevision`.

## Instructions for Ruchir

Bind the live `ApplicationAdapter` in `src/server/adapters.ts` when the auth, repository, billing and payment services are ready. Keep `getAdapter()` fail-closed when `DEALFLOW_ADAPTER=live` and a required service is missing. Implement `authenticate`, `login`, `logout`, `signup`, `read`, `readCustomer`, `transaction`, `command`, and `fulfillmentPreview` against the shared session/database transaction. The browser must receive only the verified actor from the server session. Signup creates an inactive request; it never accepts a browser-selected privileged role.

Review these persistence shapes and indexes with Atharva: `QuoteRevision` history keyed by quote and revision, `Proposal` keyed by quote and operation key, `Message` keyed by quote/revision, `RecommendationRule`, and an idempotency record scoped by actor, resource and request key. Useful uniqueness is `(actor_id, scope, request_key)` with the stored request fingerprint and serialized result. Use decimal database types for money and date/date-time columns for ISO values. Payment records should preserve invoice ID, amount, method, reference, date and request key.

Billing must replace the simulator in `src/development/adapter.ts`: confirm creates one-time invoice lines and recurring subscription records inside the canonical transaction, due billing advances the calendar period once per subscription/period, and payments update invoice balance atomically. The UI already calls `actions` with `runBilling`, `subscription`, and `payment` payloads. Return `{data: ...}` or the shared error envelope, preserving `401`, `403`, `404`, `409`, and `422`.

Acceptance checks: sign in with the session cookie only; customer B cannot read customer A; repeated payment request keys create one payment; overpayment is rejected; month-end periods clamp correctly; cancellation follows the selected policy; production does not load `.dealflow-development`.

## Instructions for Atharva

Replace the development canonical port constructed in `src/development/adapter.ts`. The required operations are:

```text
priceCandidate(quote, product, ruleId) -> PricedCandidate
addLine(quote, productId, variantId, quantity, actor) -> Quote
revise(quote, lineChanges, actor) -> Quote
confirm(quote, actor) -> Order
```

`priceCandidate` must resolve the customer price list, variant upcharge, applicable line/order discounts, taxes, costs and billing interval for the exact quote revision. `rankRecommendations` consumes this result and must remain pricing-engine agnostic. `addLine` must reprice and reevaluate current policy in the same mutation. `revise` must create an immutable new revision, preserve prior approval history as superseded, and return the new current revision. `confirm` must enforce the current revision, final customer acceptance, valid required approval/no-approval, and an idempotent unique source revision in one transaction.

The UI reads `evaluation.status`, `chain`, `step`, `reasons`, and `worstExcess`. The canonical evaluator should also return weighted excess, excess amounts and per-interval groups if those fields are added; extend the contract deliberately rather than embedding those calculations in the frontend. Approval decisions arrive through the local action adapter today and should bind to Atharva’s approval endpoint with current revision, assigned role, reason and request key. Finance cannot act before Manager when the chain requires both.

The shared commitment rule is fixed: before exact current-version customer acceptance, warehouse and billing content is Preview only. After approval/no-approval plus exact acceptance, create the immutable order and initialize billing and fulfillment without reserving stock. Allocation remains a separate explicit operation. A date request is not a promise until reviewed. Acceptance of a stale revision, pending approval, changed terms or duplicate operation must fail or replay safely inside the canonical transaction.

Acceptance checks: Gold hardware at 12% remains allowed under a 15% ceiling; service at 18% against 10% routes Manager then Finance; order-level discount participates in evaluation; a material recommendation/proposal updates revision and invalidates old approval; two confirmation retries return one order; an old acceptance cannot confirm a changed revision.

## Instructions for Harsh

Replace catalog/customer and fulfillment portions of the development adapter. The frontend expects active customer and product/variant records, customer price-list resolution, stock reads, and these preview semantics:

```text
fulfillmentPreview(actor, orderId) ->
  { orderId, allocations: [{ lineId, warehouseId, quantity }],
    backorders: [{ lineId, quantity }], cost }
```

The preview must use on-hand minus existing reservations, aggregate repeated variant demand, prefer an explainable deterministic split, and write no reservations. The explicit `allocate` action must lock and recheck relevant stock, account for this order’s existing unshipped reservations, store backorders, and accept an override atomically. Receipt and consolidation are downstream fulfillment responsibilities. The UI’s `/api/fulfillment/:orderId/preview` route is the replacement seam.

Catalog data should preserve product ID, variant ID, active flag, category, tax, unit, interval, plan ID and customer-resolved price. Customer records need tier, currency and responsible rep. The quote builder reuses the canonical `addLine` seam and does not infer product prices from the browser.

Replace report data behind `/api/export` with the same filtered dataset used by the reporting screen. Keep the PDF/XLSX content disposition and allowlist customer invoice exports. Acceptance checks: preview does not change reserved stock, one warehouse and split warehouse cases are deterministic, a shortage becomes an explicit backorder, override releases/reassigns only this order’s unshipped reservations, and paid backorders remain visible.

## Shared frontend adoption

Use `src/components/application/Application.tsx` as the route shell and register new internal screens in its `navigation` array. Use `src/components/application/shared.tsx` for `Heading`, `Section`, `Table`, `Filter`, `FormAction`, `Events`, `api`, and the shared primitive exports. Use the variables and classes in `src/app/globals.css`; add tokens there rather than introducing another theme or component framework. Operational pages should use solid panels and keyboard-focusable table overflow. Every consequential action should use `FormAction` or an equivalent confirmation and display the returned error.

The shell receives the verified actor and exposes only staff or customer navigation appropriate to that actor. Do not add a public role selector. A development status badge is intentionally visible as `DEV FIXTURE`; it must be absent or replaced by a live connection status after binding production services.

## Git and merge handoff

The branch is `krishna/shell-portal-recommendations`. Existing commits `d0afc56`, `27122c9`, and `758b121` remain intact. The current pass adds the provisional Next.js runtime, route application, shared CSS, development adapter/store, Krishna service routes, exports, focused tests and this documentation. Shared touch points are `src/contracts/application.ts`, `src/server/adapters.ts`, `src/app/api/[...path]/route.ts`, `src/app/globals.css`, and the root package files. Ruchir should reconcile package versions and lockfile before merging. Atharva and Harsh should bind service interfaces behind the existing adapter instead of replacing route components.

Recommended review groups are: (1) runtime/theme/shell, (2) route views and exports, (3) recommendations and portal services, (4) development adapters/tests/docs. Merge order should keep the adapter seam compiling while live services are added. Potential conflicts are concentrated in the root package files, shared application contracts, catch-all API route and global CSS; do not assume zero conflicts.

## Production readiness checklist

The following must be removed or replaced before a live deployment:

- `src/development/seed.ts`, `pricing.ts`, `store.ts`, and `adapter.ts`; no production import or fallback is permitted.
- The `DEALFLOW_ADAPTER=development` path and development reset action.
- Development login credentials and inactive signup fixture behavior.
- JSON idempotency/session storage; replace with shared database/Redis/session infrastructure.
- Local canonical pricing, approval, confirmation, fulfillment, billing, health and reporting simulators.
- Fixture-marked PDF/XLSX export output.
- Any live adapter that trusts browser-supplied actor, role, customer ID, revision or totals.

Production must fail clearly with `INTEGRATION_REQUIRED` if a live service is not bound. The local simulator has known limits: policy weighted/budget escalation and anomaly analysis are simplified, fulfillment preview is an explainable heuristic rather than a global optimizer, and the JSON store is single-process. These are visible integration boundaries, not live guarantees.

## Latest visual system and manual QA

The public entry and login pages now use one full-viewport marble workspace background from `public/bg-image.png`. The bitmap is a plain texture/photo with no baked text or controls; all copy and controls remain React/HTML. The visual direction is deep navy ink, slate text, warm off-white, cool marble gray, restrained teal and quiet borders. The brand is the text-only `DealFlow360` wordmark. There is no symbolic logo mark in the public or internal shell.

`src/components/application/Application.tsx` is the persistent client shell mounted from `src/app/layout.tsx`. The catch-all page returns no second shell. Route changes use the existing Next navigation and keep actor/data state mounted, so a tab change does not blank the whole page or refetch the auth session. The sidebar has an explicit collapse button with `aria-expanded`, accessible labels and a `localStorage` preference under `dealflow-sidebar`; collapsed links retain icon names and titles. Use `.application.is-collapsed` and the tokens at the end of `src/app/globals.css` when adding screens. Add routes to the existing navigation array only when the route is real and role-filtered.

The executable manual route and interaction checklist is [docs/krishna-manual-qa.md](krishna-manual-qa.md). It contains the seeded accounts and IDs, all diagram and setup routes, quote journey, Engine 4 and Engine 6 cases, API payloads, role isolation, keyboard/sidebar checks, responsive sizes, visual checks and the complete `DEV FIXTURE LIMITATIONS` list.

The login mutation origin guard in `src/server/origin.ts` accepts same-site scheme and port and local loopback aliases (`localhost`, `127.0.0.1`, `::1`) only in development. It rejects cross-origin, cross-port and scheme changes. Local login uses `admin@dealflow.test` exactly; do not include backslashes before or after `@` or `.`.

The root `package.json`, `package-lock.json`, `next.config.ts` and `src/app/layout.tsx` are provisional shared touch points for Ruchir to reconcile with the team scaffold. The CSS, shell and catch-all route are Krishna-owned frontend touch points. Keep live services behind `src/server/adapters.ts`; do not import `src/development/*` into teammate-owned production services. Browser-wide QA and network inspection still require a browser session; the prior browser tool was unavailable after its account usage limit, so those checks remain manual follow-up items even though the service suite/build/typecheck pass.

## UI adjustment checkpoint

The latest shell polish keeps the sidebar collapse control icon-only. In collapsed mode, `.nav-label` is hidden while the existing Lucide module icons remain centered and retain accessible `aria-label`/`title` text. The account initials avatar remains visible at the bottom and the sign-out control is hidden; the expanded sidebar shows the account details and sign-out action. The behavior is implemented in `Application.tsx` and the final overrides in `src/app/globals.css`.

Both public pages use the unchanged root reference asset copied byte-for-byte to `public/bg-image.png`; no color wash is applied over it. Landing uses a fixed first-viewport composition with no page scroll, and the navigation is shifted left to keep the right-side foliage clear. Login uses the same background with a transparent, left-aligned typography-led form rather than a white panel.

All scrollable surfaces now share a thin rounded thumb treatment through the global scrollbar rules, including wide tables, pipeline/tabs and dialogs. `dialog.df-dialog` is fixed with `margin:auto`, bounded dimensions, and an 8px blurred backdrop so every `FormAction` modal opens centrally regardless of its trigger position.

The latest public landing adjustment is contained in `Application.tsx` and the final landing overrides in `src/app/globals.css`. It follows the supplied reference with the unchanged `public/bg-image.png`, a serif hero headline and italic teal emphasis, a text-only wordmark, a left-shifted readable navbar, a rectangular CTA, and a three-step row with icons and supporting copy. The change is frontend-only and does not alter teammate service contracts.

Public navigation now lives in `src/components/application/PublicHeader.tsx` with scoped styles in `PublicHeader.module.css`, shared by landing and login/signup. Its header is transparent; navigation is grouped toward the left so account links avoid the foliage. Product, How it works, and Access open informative unboxed panels with links to the existing `/login` and `/signup` routes. `onOpenChange` lets `Application.tsx` temporarily hide/inert the underlying hero while a panel is open; closing restores it without changing route or business data. The panel treatment uses a fading blur of the photograph without a filled container. Keep Escape/focus restoration, outside-click closing, accessible disclosure states, and the narrow-screen Menu when integrating. No API or backend adapter changed.

Journey icon and grid column dimensions now share `--step-icon-size` in `src/app/globals.css`; the desktop column gap is 18px. Avoid reintroducing fixed `!important` icon widths that differ from the grid column at smaller heights. Browser checks for these public-header changes are listed in `docs/krishna-manual-qa.md` and remain pending approval: browser inspection was rejected by automatic approval review under the earlier no-computer-use instruction.
