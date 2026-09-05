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
| Auth session → Actor | Ruchir | LIVE | Cookie `dealflow_session`; routes use `getAuthorizedActor` from `@/server/lib/auth/permissions` (role matrix enforced). `x-dev-actor` only with `DEALFLOW_DEV_IMPERSONATION=1` outside production. Seeded accounts have unique passwords (`src/fixtures/ruchir.ts`); no shared password. |
| Catalog resolve | Harsh | DEV FIXTURE | Live API + Screens 16/17; in-memory repo until Prisma. |
| Quote pricing / policy / revisions | Atharva | LIVE | Prisma `LiveQuoteService` + HTTP `/api/quotes/*`. Fixture GET removed. |
| Suggestions / customer proposal | Krishna | LIVE (portal mutations) | `POST /api/quotes/:id/proposals` and `/api/portal/quotes/:id/proposals`. Fixture portal still used when `DEALFLOW_ADAPTER=development`. |
| Customer confirmation → orderReady | Atharva | LIVE | `POST /api/quotes/:id/confirm` and portal confirm. Same tx: Order + `initializeBilling` + `initializeFulfillment`. |
| Split preview/commit | Harsh | DEV FIXTURE | Screens 07/08 + Engine 2 tests; in-memory until Prisma. |
| Fulfillment initializer (inside confirmOrder tx) | Harsh | DEV FIXTURE | `InitializeFulfillmentInput/Result` in harsh.ts. DB-only, no reservation. |
| Billing initializer | Ruchir | LIVE | `initializeBilling(tx, order, requestKey)` from `@/server/billing/initialize`. First recurring invoice is due-run, not init. |
| Delivery read for Invoice Detail / Health | Harsh | DEV FIXTURE | `GET /api/fulfillment/[orderId]/delivery`. |
| Plans (`/api/plans`) | Ruchir | LIVE | GET returns `PlanRef[]` (Prisma plans plus catalog fixture ids). POST/PATCH are ADMIN. |
| Reports | Harsh | DEV FIXTURE | Screen 15 + PDF/XLSX from stored facts; Atharva's quote repo must project into `ReportQuoteRecord`. |

---

## 4. Per-owner step logs

### Krishna

Entries below were recorded on the Krishna UI branch before merge with main.

## 2026-09-05T11:30:23+05:30 (Asia/Kolkata) - Owner: Krishna

Completed first isolated foundation increment on authorized branch krishna/shell-portal-recommendations. Added compact slate/white/teal UI tokens and reusable kit, AppShell/CustomerShell with role-filtered supplied navigation, typed UI/recommendation/portal adapter proposals, recommendation qualification/ranking, and customer-scoped read orchestration with explicit nested quote response allowlisting. Recorded Krishna's final-acceptance-before-commitment rule in AGENTS.md and handoff; previews never reserve stock/create invoices/activate subscriptions. Ruchir retains package/scaffold ownership.

Files: src/components/ui/index.tsx, src/components/shell/index.tsx, src/styles/workspace.css, src/contracts/krishna.ts, src/features/recommendations/rank.ts, src/features/portal/read-quote.ts, src/fixtures/krishna.ts, tests/krishna.test.mjs, tests/ui-preview.tsx, AGENTS.md, docs/krishna-handoff.md.

Checks and outcomes:
- `node --experimental-strip-types --test tests/krishna.test.mjs`: 12 tests passed, 0 failed. Includes low-margin promoted fallback exclusion, repricing qualification, duplicates/dismissals, deterministic promotion ranking, invalid/stale candidates, pre-fetch session denial, second-customer denial even on a faulty adapter, nested internal-field removal and propagated repository errors. These are isolated service/engine checks with test doubles.
- External validation working directory: C:/Users/krish/.codex/visualizations/2026/09/05/01a07015-3719-7ce1-a119-0b741a33c2ea/ui-validation. `node node_modules/typescript/bin/tsc -p tsconfig.json`: passed strict ES2022/react-jsx/noEmit checks for source and preview. `node serve.mjs`: esbuild bundle succeeded and served loopback-only preview. `node check-money.mjs`: 4 assertions passed for above-safe-integer precision, negative fractional display, unrounded and invalid money rejection. Harness packages are outside the repository, not production version decisions.
- Browser: inspected desktop and 390x844 customer layout; no page-width overflow (document 375px, viewport 390px); table content 651px contained in 308px scroll region. Verified role-filtered navigation, reload callback count, keyboard tab selection, dialog Escape and focus restoration to trigger, retry clearing error, and failed logout remaining visible. Browser warning/error logs empty.

Status: DEV FIXTURE UI; NOT CONNECTED production services. No Next.js application build, live auth, real customer-price calculation, portal HTTP network response, database concurrency or end-to-end flow verified. Recommendation Add, proposal persistence/reapproval, stale/pending/duplicate confirmation, customer orders/invoices and route-level errors are still incomplete. Canonical preview figures are fixture inputs, not verified finance calculations.

Next handoff: Ruchir supplies pinned scaffold/auth/schema, Atharva reviews preview/add/proposal/confirmation adapters, Harsh supplies resolved catalog candidates and scoped fulfillment reads. See docs/krishna-handoff.md for exact contracts and working checklist. No push, merge, deploy or external teammate message performed.

## 2026-09-05T11:46:34+05:30 (Asia/Kolkata) - Owner: Krishna

Completed second isolated Krishna increment on branch krishna/shell-portal-recommendations. Added typed recommendation preview/add/dismiss services and panel; portal proposal validation, current-revision confirmation forwarding and negotiation UI with current/proposed terms and conversation history; customer-scoped order/invoice readers with nested field allowlists; quote builder presentation with canonical totals, recurring groups and margin; entry/auth presentation; and sales home presentation. Added explicit preview harness interactions. No production route, database write, pricing formula, approval logic or order creation was duplicated.

Files: src/contracts/krishna.ts, src/features/recommendations/service.ts, src/features/recommendations/RecommendationPanel.tsx, src/features/portal/mutations.ts, src/features/portal/PortalNegotiation.tsx, src/features/portal/read-records.ts, src/features/builder/QuoteBuilder.tsx, src/features/entry/AuthForm.tsx, src/features/home/SalesHome.tsx, src/styles/workspace.css, tests/interaction-preview.tsx, tests/krishna.test.mjs, docs/krishna-handoff.md.

Checks and outcomes:
- `node --experimental-strip-types --test tests/krishna.test.mjs`: 17 tests passed, 0 failed. Added checks for recommendation current-revision/idempotency forwarding, no fixture fallback on preview failure, proposal filtering/validation/date-only proposal, exact-revision confirmation forwarding, and customer-scoped order/invoice allowlisting.
- External harness strict TypeScript check `node node_modules/typescript/bin/tsc -p tsconfig.json`: passed all source and preview files. External `node check-money.mjs`: 4 precision/validation assertions passed.
- Loopback-only esbuild browser harness rebuilt. Desktop and 390x844 checks passed. Add to quote showed canonical mutation result, revision-2 and updated one-time total ₹4,43,000. Portal proposal recorded message/history, showed proposed revision-2, changed status to PENDING APPROVAL and disabled confirmation. Clean builder tab warning/error log was empty.

Status: DEV FIXTURE UI and isolated service ports; NOT CONNECTED to Next.js/auth/PostgreSQL/Prisma or teammate APIs. The second increment does not prove live network leakage, live customer isolation, database concurrency, approval re-evaluation, stale/duplicate confirmation, or end-to-end billing/fulfillment. Rule configuration drawer/API, actual persistence, route wiring, and live browser flows remain pending the Ruchir scaffold and Atharva/Harsh contracts.

Next handoff: Ruchir supplies scaffold and verified session; Atharva binds canonical preview/add/proposal/confirmation and approval status; Harsh binds catalog candidates and portal fulfillment reads. Use the exact commitment rule in AGENTS.md and docs/krishna-handoff.md. No push, merge, deploy or external teammate message performed.

## 2026-09-05T11:51:38+05:30 (Asia/Kolkata) - Owner: Krishna

Final verification checkpoint for the second increment. Added stable caller/UI request-key support for proposal and confirmation retries while retaining current-revision forwarding. No production behavior or teammate-owned files changed.

Checks: strict external TypeScript check passed after the React 19 useRef fix; `node --experimental-strip-types --test tests/krishna.test.mjs` passed 17/17; rebuilt loopback esbuild browser harness passed builder Add showing revision-2 and totals ₹4,43,000, portal proposal showing PENDING APPROVAL and disabled Confirm current quotation, and clean builder-tab browser warning/error logs. Temporary browser server was stopped after verification.

Status remains DEV FIXTURE and isolated ports; NOT CONNECTED to the application scaffold or live auth/database/teammate services. Stable request keys are now retained across UI retries, but duplicate-order guarantees remain Atharva's transactional responsibility. No push, merge, deploy or external teammate message performed.

## 2026-09-05T11:52:33+05:30 (Asia/Kolkata) - Owner: Krishna

Commit reference for the verified second increment: `27122c9 feat(krishna): add quote builder and portal interactions`, based on `d0afc56 feat(krishna): add shared UI foundation and engine adapter boundaries`. Branch is clean. The commit is local only; it has not been pushed, merged or deployed.

## 2026-09-05T13:39:39+05:30 (Asia/Kolkata) - Owner: Krishna

Completed the comprehensive local frontend pass. Added the repository Next.js runtime, shared light slate/white/teal shell and entry experience, all diagram screens plus setup routes, customer portal UI, operational views, fixture persistence, exports, server API routing, and replaceable adapter boundaries. Added real Krishna recommendation ranking/orchestration and customer negotiation/proposal/confirmation orchestration with customer-scoped reads, explicit safe-field projections, revision checks and request-key replay.

Files include `src/app`, `src/components/application`, `src/contracts/application.ts`, `src/development/*`, `src/features/{recommendations,portal}/server.ts`, `src/server/*`, `public/brand/landing-reference.png`, `tests/application.test.mjs`, and `docs/team-integration-handoff.md`. Existing commits `d0afc56`, `27122c9`, and `758b121` remain unchanged. The supplied landing image is used only for the public entry/login panel.

Checks: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `node node_modules/next/dist/bin/next build --webpack` passed. Prior browser inspection verified the landing/login visual at desktop size and the earlier isolated builder/portal harness; a fresh all-route browser pass and network inspector run could not be completed because the browser tool hit its account usage limit. No live teammate integration was claimed.

Status: local frontend and Krishna services are DEV FIXTURE; live auth, PostgreSQL/Prisma, canonical pricing/approval/confirmation, fulfillment and billing/reporting remain NOT CONNECTED. JSON fixture changes survive reload/restart and the development reset is admin-only. Next handoff is `docs/team-integration-handoff.md`; no push, merge, deploy or external teammate message performed.

## 2026-09-05T13:44:05+05:30 (Asia/Kolkata) - Owner: Krishna

Final verification update: added the fulfillment preview contract seam, staff read scoping, anomaly flag calculation, and export response tests. The exact test command now passes 29/29, typecheck passes, and the Next.js production build passes. Browser-wide route and network inspection remains unverified because the browser tool exhausted its account usage limit. The branch remains at `758b121` with the comprehensive pass uncommitted; a local staging/commit attempt was blocked by the automatic approval layer’s usage limit. No push, merge, deploy or external teammate message performed.

## 2026-09-05T14:47:02+05:30 (Asia/Kolkata) - Owner: Krishna

Fixed the local login `ORIGIN: Request origin does not match` failure. The API now compares the browser origin with the request’s actual or forwarded scheme/host, avoiding Next development host inference mismatches while retaining cross-origin mutation rejection. Added a focused regression test covering same-site `127.0.0.1` versus `localhost` serving and cross-origin rejection.

Checks after the fix: `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `node node_modules/next/dist/bin/next build --webpack` passed; `node node_modules/typescript/bin/tsc --noEmit` passed sequentially after the build. Use `admin@dealflow.test` without backslashes and password `DealFlow2026!` under `npm run dev:fixture`. Status remains DEV FIXTURE; no live integration, push, merge or deploy performed.

## 2026-09-05T14:50:51+05:30 (Asia/Kolkata) - Owner: Krishna

Extended the login origin fix for local loopback aliases. `localhost`, `127.0.0.1`, and `::1` are accepted only in development when the scheme and port match; cross-origin, cross-port, and scheme changes remain rejected. Focused regression test and full suite pass 29/29. The production build from the origin fix passed and typecheck passed sequentially. Restart `npm run dev:fixture` if the existing dev process has stale route code.

## 2026-09-05T10:10:37.3598006Z (UTC) - Owner: Krishna

Completed the visual and manual-QA pass on `krishna/shell-portal-recommendations`. Mounted the existing application shell from `src/app/layout.tsx` so route changes preserve workspace state; added an accessible persistent sidebar collapse/expand control with local preference persistence; removed symbolic branding from the React UI; and redesigned landing/login as one full-bleed marble composition using the plain reference asset `public/brand/landing-reference.png`. Added `docs/krishna-manual-qa.md` with actual fixture accounts, records, route inventory, quote journey, Engine 4 and Engine 6 cases, API checks, role isolation, accessibility/responsive checks and `DEV FIXTURE LIMITATIONS`. Updated `docs/team-integration-handoff.md` and `docs/krishna-handoff.md` with the persistent-shell and visual-token assumptions.

Checks: `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `node node_modules/next/dist/bin/next build --webpack` passed with no CSS warnings; `node node_modules/typescript/bin/tsc --noEmit` passed after the build; `git diff --check` passed. Lint is not configured. Browser-wide route screenshots, console inspection and network capture remain unverified because the browser tool previously exhausted its account usage limit; existing service tests cover customer isolation, safe-field filtering, dynamic recommendation qualification/add/replay, stale revisions, approval gating, date requests, payment/billing idempotency and origin checks.

Status: frontend, recommendation service, negotiation/orchestration service and local persistence are DEV FIXTURE; teammate live authentication, PostgreSQL/Prisma, canonical pricing/approval/order confirmation, fulfillment, billing/subscriptions/payments and reporting remain NOT CONNECTED. The branch is review-ready in content but the requested commit is still pending the local Git approval attempt. No push, merge or deployment performed. Next integration actions are in `docs/team-integration-handoff.md`; manual execution is in `docs/krishna-manual-qa.md`.

## 2026-09-05T10:12:24.9854284Z (UTC) - Owner: Krishna

Attempted to stage the verified comprehensive visual/QA pass for a local review commit. Git staging was rejected by the automatic approval layer because the account usage limit is exhausted. No workaround, push, merge, deployment or history rewrite was attempted. All changes remain intact and uncommitted on `krishna/shell-portal-recommendations`; rerun `git add -A` and commit when Git approval is available.

## 2026-09-05T10:43:08.3899285Z (UTC) - Owner: Krishna

Applied the follow-up UI corrections requested from the supplied screenshots. The sidebar collapse control is icon-only; collapsed navigation hides labels and keeps the module icons centered, retains only the DM initials avatar and hides sign-out; expanded navigation restores the account details and sign-out control. The landing and login pages now use the byte-identical root `bg-image.png` served as `public/bg-image.png`, with no color wash; landing is constrained to one first viewport and the navigation is shifted left; login is a transparent left-aligned typography form. Added rounded custom scrollbars across scrollable surfaces and fixed every native dialog to open centrally with a blurred backdrop. Updated the manual QA and team handoff documents with these checks.

Checks: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/next/dist/bin/next build --webpack` passed without CSS warnings; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `git diff --check` passed. Browser screenshot revalidation remains unavailable because the browser tool usage limit is exhausted. Status remains DEV FIXTURE locally and NOT CONNECTED to teammate-live services. Changes remain uncommitted because Git staging is blocked by the same approval limit.

## 2026-09-05T13:47:41.0977207Z (UTC) - Owner: Krishna

Updated the public landing page to match the supplied reference direction more closely. The hero now uses a large serif headline with italic teal emphasis, a text-only enlarged wordmark, a larger readable navbar shifted away from the right-side foliage, a rectangular workspace CTA, and a three-step Configure/Agree/Deliver row with icons and supporting copy. The existing `public/bg-image.png` remains unchanged and is still the only landing bitmap.

Checks: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/next/dist/bin/next build --webpack` passed; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `git diff --check` passed. Browser screenshot revalidation remains unavailable because the browser tool usage limit is exhausted. Status remains DEV FIXTURE locally and NOT CONNECTED to teammate-live services.

## 2026-09-05T14:01:09.4724544Z (UTC) - Owner: Krishna

Corrected the landing step-row regression by replacing nested span wrappers with isolated article/div structure, preventing inherited flex rules from stretching the step icons into ovals. Updated the public auth layout so Access and Sign in remain in a readable navigation lane, and aligned login with the landing typography and transparent left-side composition. The background asset remains unchanged.

Checks: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `node node_modules/next/dist/bin/next build --webpack` passed; `git diff --check` passed. Browser screenshot revalidation remains unavailable because the browser tool usage limit is exhausted. Status remains DEV FIXTURE locally and NOT CONNECTED to teammate-live services.

## 2026-09-05T14:24:44Z (UTC) - Owner: Krishna

Corrected journey icon spacing in `src/app/globals.css`: grid tracks and icon dimensions now share `--step-icon-size`, with an 18px desktop gap and a 10px mobile vertical gap. Added `src/components/application/PublicHeader.tsx` and `PublicHeader.module.css` for Product, How it works, and Access disclosures, existing login/signup links, narrow-screen Menu, outside-click closing, and Escape focus restoration. `Application.tsx` makes the hero hidden/inert while navigation content is open. Per Krishna's latest correction, the final header and panels are transparent and unboxed; the navbar sits toward the left, and open content uses a soft fading blur over the original photo. Landing/login share the header. Updated manual QA and integration handoff.

Checks on the final code: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/next/dist/bin/next build --webpack` passed; `git diff --check` passed. Existing 29 service tests were not rerun for this frontend-only increment. Visual, pointer, and keyboard browser checks remain pending: automatic approval review rejected the browser connection because of the user's earlier instruction not to start computer use. This is the current blocker, rather than an assumed tool usage limit. Browser inspection requires explicit permission; no workaround was attempted. Public UI compiles in the repository, business services remain DEV FIXTURE / teammate live adapters NOT CONNECTED, and changes are uncommitted on `krishna/dealflow360-ui-recommendations-portal`.

## 2026-09-05T14:38:16.8590729Z (UTC) - Owner: Krishna

Applied the final focused public-header adjustment: `PublicHeader.module.css` now uses the same Georgia editorial family as the hero for a regular-weight, thinner DealFlow360 wordmark, and the full navigation group moves only 12–24px toward the page center. The dropdown panel remains anchored to that same group, so its open position and transparent premium treatment are unchanged. No recommendation, portal, API, or adapter code changed.

Checks: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/next/dist/bin/next build --webpack` passed; `git diff --check` passed. Browser visual revalidation remains pending because the browser connection was rejected under the earlier no-computer-use instruction. Changes remain uncommitted on `krishna/dealflow360-ui-recommendations-portal`.

### Ruchir

**2026-09-05 — Session 2 (branch `ruchir/auth-billing-screens`)**

1. Schema/migrations/seed/CI/version pins already on `main` from earlier PRs (Prisma 7.10, Postgres 16).
2. Locked remaining decisions: Neon for hosted Postgres 16; teammates propose schema via PR; billing uses RequestKey + partial unique indexes + row locks; seed assembly stays `src/fixtures/<lane>.ts`.
3. Added `src/contracts/ruchir.ts` and `docs/deploy.md`. CI now runs `pnpm test`.
4. Session auth: `/api/auth/login|signup|logout|me`, cookie `dealflow_session`, admin user activation.
5. Approval screens 05/06 + `/users` against Prisma.

## 2026-09-05T18:25:00+05:30 (Asia/Kolkata) - Owner: Ruchir

Replaced shared-password auth with per-user credentials plus enforced role-based access.

Files: `src/server/lib/auth/permissions.ts` (new role matrix + `getAuthorizedActor`), `src/server/lib/auth/cookies.ts` (new), `src/server/lib/auth/dev-actor.ts`, `src/server/lib/auth/session.ts`, `src/server/lib/auth/permissions.test.ts` (new), `src/proxy.ts` (new Next 16 page guard), `src/fixtures/ruchir.ts`, `prisma/seed.ts`, `src/development/{seed,store}.ts`, 64 route files under `src/app/api/**`, `auth-flow.test.ts`, `.env.example`, `docs/deploy.md`.

Changes:
- Every API route now resolves the actor through `getAuthorizedActor(request)`: real session → role matrix check (PDF §3 roles: SALES_REP builds/quotes; SALES_MANAGER approves + policies + dashboard; FINANCE fulfillment/stock/billing; CUSTOMER portal-only; ADMIN backend config + users + reports). Default deny for unknown `/api/*`.
- Removed the default `admin-dev` impersonation: `x-dev-actor` requires `DEALFLOW_DEV_IMPERSONATION=1` outside production; otherwise 401 without a session.
- Killed shared passwords: DB seed uses per-account `devPassword` from ruchir fixtures (was `password123` for all); dev fixture store uses per-account passwords from `src/development/seed.ts` (was `DealFlow2026!` for all). Deleted `.dealflow-development/store.json` so dev stores regenerate.
- `src/proxy.ts` redirects unauthenticated page requests (non-`/api`) to `/login` — optimistic cookie-presence check only; real authz stays server-side.

Checks (timezone IST): `pnpm typecheck` clean; `pnpm lint` 0 errors (3 pre-existing warnings in teammate files); `pnpm test` 231 passed / 32 files after `pnpm db:seed` reseed; live DB probe: admin + customer logins with unique passwords, customer blocked on `/api/quotes`, `/api/products`, `/api/admin/users`, `/api/fulfillment`, allowed on `/api/portal/*`; `x-dev-actor` without cookie → 401 by default, resolves fixture actor only with opt-in flag.

Limitations: role matrix is path+method based — row-level scoping (rep sees own quotes) still lives in services; customer portal reads not yet Prisma-live (Krishna adapter boundary unchanged); `pnpm build` and browser flow not run this session.
6. Engine 3 in `src/server/billing/`. Atharva imports `initializeBilling(tx, order, requestKey)` from `@/server/billing/initialize` — no `BillingService` construct. First recurring invoice comes from due billing, not init.
7. Screens 09/10/12/13: `/subscriptions`, `/billing`, `/invoices`. `GET /api/plans` still returns `PlanRef[]`.

**Status:** Auth, Engine 3, and Ruchir screens are on this branch. Catalog/inventory remain Harsh DEV FIXTURE. Atharva still wires `confirmOrder` → `initializeBilling`.

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
9. Wrote `src/lib/api/client.ts` (browser fetch helper: unwraps envelope, throws
   `ApiClientError`, sends `x-dev-actor`, `newRequestKey`), `src/app/(internal)/layout.tsx`
   (AppShell route group), `src/dev-adapter/dev-actor-switcher.tsx` (dev-only fixture actor
   picker; renders nothing in production — not a role bypass).
10. Wrote `docs/architecture.md` (one-page runtime + ER diagram, Mermaid), `docs/demo-walkthrough.md`
    (Flow A / Flow B step tables with owner + status), refreshed `README.md`.
11. **Reports backend landed (subagent) — DEV FIXTURE.** `src/features/reports/`:
    `repository.ts` (interface + in-memory over fixtures; Prisma impl will project
    Atharva's tables into `ReportQuoteRecord`), `engine/{period,filter,aggregate,
    export-xlsx,export-pdf}.ts`, `service.ts` (ADMIN/MANAGER/FINANCE all; SALES_REP
    scoped to own repId; CUSTOMER forbidden; export reuses same `run` rows), `api.ts` (zod
    query parsing, default period THIS_MONTH). Routes: `GET /api/reports`,
    `GET /api/reports/options`, `GET /api/reports/export?format=PDF|XLSX`. 54 vitest
    tests pass (period ranges in IST, filters, fixture aggregates, XLSX `PK` / PDF `%PDF`
    magic bytes, export rows == run rows). Judgment calls: period matches `createdAt` OR
    `confirmedAt`; product/category filters count whole quote at quote level but only
    matching lines in `byProduct`; `byStage` always emits all six stages zero-filled.
12. **Catalog + customer master backend landed (subagent) — DEV FIXTURE.**
    `src/features/catalog/`: `engine/{money,resolve-price}.ts` (pure: price list by
    customer override → tier/currency; variant rule beats product rule; `minQty` honoured;
    fixedPrice replaces base, variant extra still added; tax by product), `repository.ts`
    (interface + in-memory, `setCatalogRepository` for Prisma swap), `service.ts` (role
    checks: ADMIN mutations; ADMIN/MANAGER customer edits; CUSTOMER reads only own record
    and may resolve only own customerId), `api.ts` (zod). 17 routes: `/api/customers[/id]`,
    `/api/sales-teams`, `/api/tax-rates`, `/api/plans` (DEV FIXTURE of Ruchir's),
    `/api/products[/summary|/id|/id/restore|/id/variants[/variantId]]`,
    `/api/price-lists[/id|/id/rules[/ruleId]]`, `/api/catalog/{resolve,search}`.
    Archive never deletes. 40 tests pass, tsc clean. Contract addition:
    `CatalogDashboardSummary` appended to `src/contracts/harsh.ts`.
13. **Engine 2 backend landed (subagent) — DEV FIXTURE.** `src/features/inventory/`:
    `engine/{availability,demand,split,validate-plan,status}.ts` (pure; preview writes
    nothing; single-warehouse else greedy most-units → lower cost → id; own RESERVED
    reservations credited during override validation), `repository.ts` (interface +
    in-memory with promise-chain mutex + snapshot/restore so a failed transaction leaves
    no partial writes; request-key results per scope), `service.ts` (reads any internal
    role; accept/override/consolidate/receipt/ship/deliver/cancel FINANCE/ADMIN; warehouse
    CRUD + stock-level edit ADMIN), `api.ts` (zod). 17 routes: `/api/warehouses[/id]`,
    `/api/stock`, `/api/stock/receipts`, `/api/stock/levels`, `/api/fulfillment`,
    `/api/fulfillment/initialize`, `/api/fulfillment/[orderId]` + `/preview`, `/delivery`,
    `/accept`, `/override`, `/consolidate`, `/ship`, `/deliver`, `/cancel`. 47 tests
    (repeated lines aggregate; competing orders never oversell; preview no-write; repeat
    Accept same key replays; different key on allocated → 409; override releases +
    reassigns; receipt → eligible backorders → consolidate; service-only → 422
    NO_STOCK_TRACKED_LINES; cancel releases; ship idempotent). Full suite 141/141, tsc
    clean. Contract additions: `AllocationCommitResult`, `ShipmentActionResult`,
    `CancelAllocationResult`, `StockLevelUpsertInput`. Decisions: `Reservation.shipmentId`
    set at planning time; override cancels PLANNED shipments and creates new ones, never
    touches SHIPPED/DELIVERED; service-only orders derive DELIVERED with
    `stockTrackedUnits: 0`.
14. UI tracks delegated (Grok 4.6 Medium per user request for remaining tracks): Reports
    screen (15), Product dashboard/editor + price lists + customers (16/17/supplementary),
    Fulfillment list/detail (07/08), Warehouses/stock/receipts (supplementary).
15. **Screen 15 Reports UI landed (subagent) — DEV FIXTURE.** `src/app/(internal)/reports/page.tsx`
    (Suspense around `useSearchParams`) + `src/features/reports/ui/ReportsDashboard.tsx`.
    Filters (period/CUSTOM from-to, team, rep scoped to team, approval, product, category)
    sync to URL; sales + approval metric cards; by-stage Tailwind bars; by-rep / by-product /
    quotes DataTables; PDF/XLSX export via `/api/reports/export` using the same applied
    filters. Smoke: `GET /reports` 200, `GET /api/reports?period=THIS_MONTH` 200 (3 rows,
    range 2026-09-01 → 2026-10-01), export XLSX 200 with correct Content-Disposition.
16. **Screens 07–08 Fulfillment UI landed (subagent, Grok 4.6 Medium) — DEV FIXTURE.**
    `src/features/inventory/ui/{useApi,FulfillmentList,FulfillmentDetailView,OverrideEditor}.tsx`
    + `src/app/(internal)/fulfillment/{page,[orderId]/page}.tsx`. List: Orders + Stock
    tabs, status filter, backorder highlight. Detail: recommended split (Accept with
    requestKey generated once at dialog open), Manual Override editor (credits own
    RESERVED stock), Consolidate Remaining Backorder prompt when `consolidationAvailable`,
    ship/deliver per shipment, cancel unshipped with reason. 403 shown, buttons not hidden.
    Smoke: `/fulfillment` 200, `/fulfillment/order-acme-1001` 200, preview matches
    Main 6 laptops + 10 docks / East 3 laptops / 1 backorder. Accept/override not posted
    against shared in-memory state.
17. **Warehouses & stock setup UI landed (subagent, Grok 4.6 Medium) — DEV FIXTURE.**
    `src/app/(internal)/warehouses/page.tsx` + `src/features/inventory/ui/warehouses/{useApi,WarehousesScreen}.tsx`.
    Warehouse CRUD (shipping costs used by split heuristic), stock table with LOW/OK
    threshold filter, upsert stock row, Record Receipt (requestKey generated once at
    dialog open; eligibleBackorders listed with links to fulfillment detail — consolidate
    happens there). Recent receipts skipped: no list API. Smoke: `GET /warehouses` 200.
18. **Screens 16–17 + price lists + customer master UI landed (subagent) — DEV FIXTURE.**
    `src/features/catalog/ui/{useApi,form,ProductDashboard,ProductEditor,VariantDialog,
    PriceRuleDialog,PriceListsManager,CustomersMaster}.tsx` + pages under
    `src/app/(internal)/{products,products/new,products/[id],price-lists,customers}`.
    Product dashboard (counts, catalog table, archive/restore, New Product, Manage Price
    Lists); editor (general info, variants, per-product price rules, live resolve preview
    with margin %); price-list manager (CRUD + rules panel); customer master (tier,
    currency, assigned rep from fixtureUsers until Ruchir's users API, price-list override).
    Customer schema has no team field so no sales-team select. Smoke: all 5 pages 200;
    request bodies verified against live API (POST/PATCH product with `planId: null`,
    variant POST, rule PUT, resolve). tsc clean project-wide.
19. All Harsh-owned screens (07, 08, 15, 16, 17) plus supplementary warehouses and
    customer master are reachable. Remaining: Prisma adapters (blocked on Ruchir's
    schema), live `confirmOrder` wiring (Atharva), session auth (Ruchir).
20. **Verification (2026-09-05, this session):** `npx tsc --noEmit` clean; `npx vitest run`
    **141/141 passing** (11 files); `npx next build` compiled, typed, and generated 29
    routes including all Harsh screens (`/products`, `/products/[id]`, `/products/new`,
    `/price-lists`, `/customers`, `/warehouses`, `/fulfillment`, `/fulfillment/[orderId]`,
    `/reports`) and the catalog/inventory/reports API families. Harsh's lane is **DEV
    FIXTURE** throughout. LIVE requires Ruchir's Prisma schema + Atharva's `orderReady`
    / `ReportQuoteRecord` projection.

**Status legend for Harsh's lane:** everything is **DEV FIXTURE** (in-memory repositories)
until Ruchir's Prisma schema lands; then the repository adapters swap to Prisma.

---

## 2026-09-05T17:32:00+05:30 (Asia/Kolkata) - Owner: Atharva (landed by Ruchir)

Wired Atharva engines to Prisma and HTTP so quotes, policy versions, health, dashboard, audit, and confirmOrder are live.

Files: `src/server/quotes/live-service.ts`, `src/server/quotes/http.ts`, `src/app/api/quotes/**`, `src/app/api/portal/quotes/**`, `src/server/governance/live-policy-service.ts`, `src/app/api/policies/route.ts`, `src/server/audit/prisma-repository.ts`, `src/server/health/live-service.ts`, `src/app/api/health/**`, `src/app/api/dashboard/route.ts`, `src/app/api/approvals/[revisionId]/route.ts`, `src/features/atharva/ui/AtharvaScreens.tsx`.

Checks:
- `npx tsc --noEmit`: clean
- `npx vitest run`: 221 passed
- Browser: not verified this session (API/typecheck only)

Status: LIVE for dedicated Atharva HTTP (`/api/quotes/*`, policies, health, dashboard, confirm). Krishna Application `/api/workspace` and `/api/actions` still 503 unless `DEALFLOW_ADAPTER=development`. End-to-end authenticated quote→approve→accept→confirm against Postgres not run here.

## 2026-09-05T21:20:00+05:30 (Asia/Kolkata) - Owner: Harsh

Bound Krishna’s workspace shell to Postgres so Overview and `/api/actions` no longer 503 on live.

Files: `src/server/adapters.ts`, `src/server/live/{adapter,canonical,commands,ids,pricing,state}.ts`, `src/app/api/[...path]/route.ts`, `src/app/api/auth/{login,me}/route.ts`, `src/server/lib/db/map.ts`, `src/server/inventory/{prisma-inventory,service}.ts`, `src/components/application/Application.tsx`.

Checks: `npx prisma generate`; `npx tsc --noEmit` clean. Browser login→workspace not re-verified in this session.

Status: LIVE adapter when `DATABASE_URL` is set. `DEALFLOW_ADAPTER=development` still uses the JSON store. Command replay for the shell is in-process (not Redis).

## 2026-09-06T00:20:00+05:30 (Asia/Kolkata) - Owner: Harsh

Cross-lane remaining-work pass: optional email (Resend/webhook + dev log), cron jobs (`npm run jobs` / `POST /api/jobs/run`), Stripe checkout + webhook (503 without keys), Google SSO (503 without keys), FX helper `GET /api/fx`, courier per-kg rate card on live warehouses, recommendation co-purchase learning from confirmed quotes. Docs: `docs/demo-walkthrough.md`, `docs/status-checklist.md`.

Files: `src/server/integrations/*`, `src/app/api/jobs/run/route.ts`, `src/app/api/fx/route.ts`, `src/app/api/payments/checkout/route.ts`, `src/app/api/payments/stripe/webhook/route.ts`, `src/app/api/auth/sso/google/**`, `src/server/inventory/engine/rate-card.ts`, `scripts/run-jobs.ts`.

Checks: focused vitest on integrations + permissions (run locally). Stripe/Google/Resend not exercised with live vendor keys.

Status: LIVE core engines unchanged. Optional providers fail closed with 503 `INTEGRATION_REQUIRED` when env is missing.

## 2026-09-06T00:45:00+05:30 (Asia/Kolkata) - Owner: Harsh

Connected optional adapters into the staff shell: invoice Stripe checkout, admin integration flags, public Google SSO link, reports FX Preview plus canonical export links. No commit.

Files: `src/components/application/{Operations,Setup,Application,CardCheckoutButton,IntegrationsPanel}.tsx`, `src/features/{billing/ui/InvoiceDetail,reports/ui/ReportsDashboard}.tsx`, `src/app/api/integrations/{status,public}/route.ts`, `src/server/integrations/edge-cases.test.ts`.

Checks: `npm test` (full vitest) in this session.

Status: LIVE Postgres path unchanged. Vendor keys still optional.

## 2026-09-06T00:55:00+05:30 (Asia/Kolkata) - Owner: Harsh

Implemented remaining product gaps: TaxRate table, Company tenancy (Nexa + Contoso demo), item-item lift rec trainer, live carrier HTTP adapter, confirm-time stock cap (no reserve). Migration applied locally. No commit.

Files: `prisma/schema.prisma`, `prisma/migrations/20260906010000_tax_company_recs_carrier/`, `src/server/inventory/{confirm-stock-cap,engine/confirm-stock-cap}.ts`, `src/server/integrations/{train-copurchase,carrier,learn-recommendations}.ts`, live confirm paths, catalog Prisma.

Checks: `npx prisma migrate deploy`; `npx tsc --noEmit`; `npm test`.

Status: Confirm still does not reserve. Available = on-hand − reserved. Carrier 503 without `CARRIER_QUOTE_URL`.

## 2026-09-06T01:10:00+05:30 (Asia/Kolkata) - Owner: Harsh

Wired browser ticks in the staff shell (root layout never rendered App Router pages). Quote catalog hint (`POST /api/catalog/resolve`) for Acme 50,000; `/fulfillment` LIVE list + receipt; order Preview 6+3+1 + consolidate; `/reports` dashboard XLSX vs same filters. Documented required vs optional keys in `docs/env-keys.md` and README. No deploy, no vendor keys, no commit.

Files: `src/components/application/{Application,Quotes}.tsx`, `src/features/inventory/ui/{FulfillmentList,FulfillmentDetailView}.tsx`, `src/features/reports/ui/ReportsDashboard.tsx`, `docs/env-keys.md`, `README.md`, `docs/{status-checklist,demo-walkthrough,harsh-lane-explained}.md`.

Checks: `npx tsc --noEmit`; browser E2E of the four ticks not recorded in this pass (dev server may already be running).

Status: LIVE UI for Harsh ticks without Stripe/Resend/Google.

## 2026-09-06T01:20:00+05:30 (Asia/Kolkata) - Owner: Harsh

Completed vendor paths so they 503 without keys and run when keys are in `.env`: Stripe Checkout Session + `/api/payments/stripe/complete` (webhook HMAC optional), Google SSO state cookie. Added `docs/detailed-project-understanding.md`.

Files: `src/server/integrations/stripe.ts`, payments checkout/webhook/complete, Google SSO routes, `CardCheckoutButton`, `InvoiceDetail`, `docs/detailed-project-understanding.md`.

Checks: focused vitest stripe + existing fail-closed tests; `npx tsc --noEmit`.

Status: Local demo complete. Remaining human work: manual click-through + demo video.

---

## 5. Interface notes (cross-lane changes)

- **2026-09-05, Ruchir, `src/server/billing/initialize.ts`:** Atharva's `confirmOrder` should call `initializeBilling(tx, order, requestKey)` inside the same Prisma transaction as order insert. Replay with the same key returns `{ replayed: true }` and the original invoice/subscription ids. Does not create the first recurring invoice. Consumers: Atharva.
- **2026-09-05, Ruchir, `GET /api/plans`:** still `{ id, name, interval }[]` for Harsh's product editor. Extra Prisma plans may appear with cuid ids; fixture ids `plan-support-monthly` etc. remain from the catalog merge. `POST /api/plans` is ADMIN. Consumers: Harsh ProductEditor.
- **2026-09-05, merge `origin/main` into Krishna UI PR:** Conflicted files were Krishna-owned UI/theme plus Ruchir-owned scaffold. Kept Krishna `globals.css`/login/home/portal/builder screens and seed+harness exports in `src/fixtures/krishna.ts`. Kept main `package.json`/Prisma/auth/CI/`@/*` tsconfig, and appended Krishna's `memory.md` log instead of overwriting teammate entries. Removed root `[[...path]]` page so teammate App Router screens keep their URLs.
- **2026-09-05, Atharva live quotes:** `confirmOrder` persists `Order`/`OrderLine` then calls `initializeBilling(tx, …)` and `initializeFulfillment(tx, orderReady)` in one transaction. Fulfillment is `CONNECTED` only if the Order row exists. Krishna portal confirm maps `{orderId, quoteId, revision, created, fulfillmentInitialization}`. Approvals POST now runs `LiveQuoteService.decideApproval` then returns Ruchir's UI detail. Consumers: Krishna portal/builder HTTP, Harsh fulfillment, Ruchir billing.
- **2026-09-05, Harsh, live workspace:** `getAdapter()` loads `src/server/live/adapter.ts` when `DATABASE_URL` is present. Catch-all `/api/workspace` and `/api/actions` authenticate with `dealflow_session`. Consumers: Krishna Application shell.

---

## 6. Open questions / blockers

- Event date/time confirmed? Blueprint assumes T = 22:00 IST event day.
- Atharva: confirm `OrderForFulfillment` mapping and `ReportQuoteRecord` projection.
- Harsh lane complete at DEV FIXTURE. Next for Harsh once schema lands: Prisma adapters
  for `CatalogRepository`, `InventoryRepository`, `ReportRepository` (`set*Repository`
  already exists).

## 2026-09-05T20:05:00+05:30 (Asia/Kolkata) - Owner: Krishna

Completed the customer-tier send-flow increment. The quotation send dialog now requires
Bronze, Silver, or Gold and sends the selection with `expectedRevision`; the development
adapter persists it on the assigned customer, and the live Prisma send transaction updates
the customer before recording `QUOTE_SENT`. The live path maps public `BRONZE` to Prisma's
existing `STANDARD` enum value. The customer setup tab already supports later tier edits/upgrades
with the same choices; customer-facing portal projections remain unchanged and do not expose tier.

Files: `src/components/application/Quotes.tsx`, `src/development/adapter.ts`,
`src/app/api/quotes/[id]/send/route.ts`, `src/server/quotes/live-service.ts`.

Checks: focused ESLint completed with 0 errors (one pre-existing unused-import warning in
`live-service.ts`); `git diff --check` passed. Repository-wide `tsc --noEmit` remains blocked
by pre-existing `passwordResetToken` Prisma-client schema drift in
`src/server/lib/auth/password-reset*.ts`; no new tier-related type errors were reported.
Vitest could not load the repository config in this sandbox because esbuild received
`Access is denied` while resolving the config path. No live database/browser E2E was run.

## 2026-09-06T00:00:00+05:30 (Asia/Kolkata) - Owner: Krishna

Replaced the untracked flattened synthetic source with one Prisma scalar fixture at
`dealflow360_synthetic_dataset.json` and added `scripts/seed-synthetic-dataset.ts`.
The fixture preserves 300 quotes, 613 revisions, 1,910 quote lines, 105 orders, and 110
invoices; the loader creates its password hashes, handles the quote/revision insertion
cycle, and supports an explicit `--reset` only when invoked by the operator. Package script:
`pnpm synthetic:seed` (or `pnpm synthetic:seed -- --reset`).

Checks: fixture parse and relationship spot checks passed; Prisma schema validation passed;
all normalized enum values are valid; zero one-time lines carry recurring intervals; zero
shipment lines lack reservations; zero payments lack a generated request key. Full typecheck
continues to have only the known password-reset Prisma-client drift. Database insertion was not
run because it requires an operator-provided database and `--reset` is destructive.
