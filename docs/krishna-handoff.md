# Krishna first increment - adapter proposal

Status: NOT CONNECTED to live services; DEV FIXTURE browser harness verified. Installed on Krishna's authorized `krishna/shell-portal-recommendations` branch. No package, schema, producer contract or shared branch was changed. Adapter details remain proposals for producer review.

## Reusable frontend boundary

`src/contracts/krishna.ts` preserves blueprint PageHeader, StatusBadge, Money, Dialog and DataTable concepts. DataTable adds `rowKey(row)` so owners need not use array indexes. Component implementations bind Slot generics to ReactNode. `RemoteData` separates loading, failed requests and successful data with explicit integration status. It also defines quote-builder snapshots, proposal/confirmation results, portal negotiation history, and order/invoice allowlists.

Import Button, Input, Select, Card, PageHeader, StatusBadge, Money, DataTable, Dialog, Tabs, Timeline, EmptyState, ErrorState and LoadingState from `src/components/ui`. Import AppShell, CustomerShell and ShellProvider from `src/components/shell`. Load `src/styles/workspace.css` once in the root layout when Ruchir's scaffold lands. Tokens use Krishna's chosen compact slate/white/teal direction. CSS is ordinary CSS, compatible with the agreed Tailwind scaffold; no competing CSS framework was installed.

Wrap AppShell(children) or CustomerShell(children) in ShellProvider with the verified session's mapped role, display name, current path, home link, explicit connection status, navigation entries and real reload/logout handlers. Entries carry href, label, roles and internal/customer surface. Only registered available routes appear; teammates supply their own route entries. Role spelling in WorkspaceRole is a local adapter proposal until Ruchir's auth contract arrives. Shells manage display only; real route handlers must enforce authorization. Logout failures remain visible and do not claim success. Route-level auth/error/not-found integration is still pending.

Accessible fields require labels; tabs support arrows/Home/End; native modal supports Escape, trapped focus and focus return; tables scroll within a keyboard-focusable region. Money preserves canonical decimal precision using BigInt for grouping, supports negative amounts, and displays Unavailable for invalid or unrounded input instead of inventing totals. Theme adoption should be additive when teammate routes arrive.

`src/features/recommendations/service.ts` adds preview loading (propagates failures) and current-revision Add-to-quote forwarding with an idempotency key; `RecommendationPanel.tsx` renders ranked impact, Add and local Dismiss behavior. `src/features/portal/mutations.ts` validates customer actor, revision and proposed terms, preserves delivery dates as proposals, filters empty line changes and forwards to Atharva's revision/confirmation ports. `PortalNegotiation.tsx` renders current/proposed terms, conversation history, proposal submission and confirmation gating. `src/features/portal/read-records.ts` adds customer-scoped order/invoice reads with explicit nested allowlists. No portal mutation writes persistence or order tables locally.

`src/features/builder/QuoteBuilder.tsx`, `src/features/entry/AuthForm.tsx`, and `src/features/home/SalesHome.tsx` provide the remaining Krishna-owned presentation boundaries. The builder renders canonical totals, recurring groups, margin and recommendation actions; it does not calculate authoritative financial values. `tests/ui-preview.tsx` remains the reusable DEV FIXTURE showcase, and `tests/interaction-preview.tsx` exercises builder Add and portal proposal flows with explicit fake ports. Neither harness file may be imported into a production route. A temporary React/esbuild validation harness outside the repo serves them at localhost:4173; it is not the Next.js application. Production files do not import fixtures. No backend route or application package was introduced.

## Producer review needed

| Owner | Needed from producer | Krishna provides |
|---|---|---|
| Ruchir | Pinned scaffold; verified session actor; customer membership; scoped invoice reads; transaction/persistence facilities for proposals and rules | Filtered portal response boundary; recommendation/proposal field needs; shared component props |
| Atharva | Canonical candidate preview including actual customer pricing and order discounts, revision/currency, margin %, incremental profit and margin change by billing interval; addLine, proposeRevision and confirmOrder adapters | Qualification/ranking input/output; revision request and canonical port signatures; no duplicate pricing/policy math |
| Harsh | Active compatible customer-resolved product/variant candidates; product IDs; customer-scoped order fulfillment reads | Rule fields and ranking output; shell contract for owned screens |

No producer contract previously existed. Keep this lane-local adapter until owners agree how their actual types bind. Do not ask teammates to replace working types with it. Canonical mutations must resolve current prices again rather than trust a recommendation preview.

Rules: baseProductId (nullable explicit fallback), candidateProductId, coPurchaseScore, promotionLabel, minimumMarginPct and active. Every candidate, including fallback, passes identical qualification. Dismissed product IDs belong to the current quote session. Proposed deterministic ranking is promotions first, co-purchase score next, stable IDs last; product-level deduplication picks the first qualified variant. Profit is never compared across billing periods or annualized. Financial calculations remain canonical inputs, not calculated by the ranker.

Portal quote reads accept only a verified server actor and require repository predicates on quoteId AND customerId. The service also rejects a mismatched adapter result. Root, line and total objects are rebuilt field-by-field. This proves an isolated service boundary only; PostgreSQL scoping and actual HTTP response inspection still need integration tests.

Proposal/confirmation types describe Atharva's boundary only. No write service is wired yet. Proposed date must remain a request until rep/operations agrees; proposed/current terms and history need distinct persisted records. A date proposal cannot directly set promisedDeliveryDate. Confirmation must enforce pending approval, stale revision and idempotency inside Atharva's transaction. No duplicate local order implementation.

## Working checklist

- [x] Krishna confirmed checkout ownership; created his branch and installed the increment.
- [x] Krishna chose compact slate/white/teal; minimal UI kit and shells verified in a separate harness.
- [x] Krishna confirmed the commitment rule below; documented in AGENTS.md.
- [ ] Ruchir supplies scaffold/package choices (ownership explicitly retained).
- [ ] Agree producer adapter bindings and data models; typed development examples exist in src/fixtures/krishna.ts, seed assembly still needs coordination.
- [x] Wire recommendation preview loading, Add forwarding and local Dismiss through canonical ports; rule configuration API and drawer remain pending.
- [x] Implement proposal validation/history display and canonical reevaluation/confirmation ports; persistence and producer integration remain pending.
- [x] Implement reusable entry/auth, home, builder and customer quote/order/invoice presentation boundaries; route wiring remains pending.
- [ ] Typecheck/build; live role flows; actual network allowlist inspection; stale, pending and duplicate confirmation checks.

## Confirmed shared commitment rule

Before final customer acceptance, allow read-only warehouse split suggestions and billing previews, clearly labeled Preview. No reservation, invoice creation or subscription activation occurs in a preview. The same current quote revision must have both valid required approvals (or no approval required) and final customer acceptance before Atharva creates an order. Stock reservation additionally requires explicit allocation. Material changes create a new revision, preserve all prior history, reevaluate policy and require updated acceptance. Stale approvals or acceptance cannot be reused. Preserve appropriate access to all diagram screens and distinguish preview from committed records. Krishna confirmed this to resolve PDF/blueprint ordering ambiguity.

## Verification for this increment

- `node --experimental-strip-types --test tests/krishna.test.mjs`: 17/17 pass under Node 22.18.0. Covers qualification including unhealthy promoted fallback, discount repricing, dedup/dismissal, deterministic ordering, invalid inputs, current-revision/idempotency forwarding, proposal validation, membership guards, nested quote/order/invoice response allowlisting and propagated repository errors.
- External harness strict TypeScript check: `node node_modules/typescript/bin/tsc -p tsconfig.json`, with ES2022, strict, noEmit, react-jsx and React types mapped to the harness. Passed against all source files and both preview files; this does not establish Next.js application build compatibility. `node check-money.mjs` passed four precision/validation assertions including above-safe-integer and negative fractional amounts.
- External esbuild bundle compiled; browser verified desktop and 390x844 customer layout, contained wide-table overflow, role-filtered navigation, refresh callback, keyboard tabs, modal Escape/focus return, error/retry, failed logout display, recommendation Add producing revision-2 and ₹4,43,000, portal proposal message/history, proposed revision-2 and disabled confirmation while PENDING APPROVAL. A clean browser tab had no warning/error logs after rebuild.
- No actual portal HTTP API exists: network-field leakage, live session isolation, canonical Add updating quotes, approval/stale/duplicate confirmation and transactional behavior are not verified. No end-to-end completion claim.

Validation-only harness used TypeScript 5.9.2, React/React DOM 19.1.1, @types/react 19.1.10, @types/react-dom 19.1.9 and esbuild 0.25.9 outside the repository. These do not select or pin the team's production versions.

## Initial evidence

Clean main at 40a2409, origin https://github.com/orion-catchers/dealflow.git, one worktree, only four supplied files. No applicable AGENTS.md found in inspected ancestor chain. No existing package/lockfile/schema/theme/features. Installed Node is 22.18.0. Default npm launcher is broken (missing roaming npm-cli.js); direct system npm CLI works at 10.9.3. No dependency installation or credential access performed.

Read the full blueprint and all 13 PDF pages; rendered PDF pages 6-8 for relevant frontend requirements. Inspected full native 1239x952 screen map and cropped top/portal regions. Tiny table cells, navigation annotations and portal field labels remain unreadable; PDF/blueprint resolve the required behavior without a new image request. The PDF marks rule setup optional, while Krishna's explicit assignment includes configuration support: retain it. Event date remains unspecified; do not infer hackathon timing from the workstation date.

## Current comprehensive pass

The latest user request expanded all frontend screen ownership to Krishna. The in-repository Next.js application in `src/app` and `src/components/application` now covers the full diagram plus supplementary setup routes. This supersedes the earlier route-wiring-pending and no-API notes above. Krishna’s real service orchestration is in `src/features/recommendations/server.ts` and `src/features/portal/server.ts`; missing producer services use the explicitly labelled development adapter in `src/development/adapter.ts`.

Local verification for this pass: `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/tsx/dist/cli.mjs --test tests/*.test.mjs` passed 29/29; `node node_modules/next/dist/bin/next build --webpack` passed. Service tests cover customer isolation and safe-field filtering, dynamic recommendation qualification and canonical add, proposal and date validation, stale revision, pending approval, request-key replay, duplicate confirmation, payment replay, due billing, stock reservation timing, signup gating, month-end periods and the same-site login origin guard. Prior browser inspection verified the landing and login pages at desktop size; fresh browser coverage was unavailable after the browser tool reached its account usage limit, so all-route browser verification and network inspection remain pending.

Status is DEV FIXTURE locally and NOT CONNECTED to teammate-live services. Ruchir must reconcile the provisional package/runtime choices; Atharva must bind canonical pricing, revision, approval and confirmation; Harsh must bind catalog, stock/fulfillment and reporting. See `docs/team-integration-handoff.md` for exact inputs, outputs, replacement seams, schema review and acceptance checks.

## Visual and QA completion pass

`src/components/application/Application.tsx` is now mounted from `src/app/layout.tsx`, keeping the shell and loaded workspace state persistent across route changes. The sidebar has an explicit accessible collapse/expand control with a local preference, while public entry and login use the plain-text `DealFlow360` wordmark over the unchanged plain marble reference at `public/bg-image.png`. The baked-text reference image was not embedded. The added route and interaction checklist is `docs/krishna-manual-qa.md` and records the seeded accounts, IDs, expected states, API cases, responsive sizes and all remaining fixture limitations.

The visual pass is locally typechecked and included in the production build. Browser-wide screenshot and network verification remains a manual follow-up because the browser tool reached its account usage limit; prior isolated landing/login and builder/portal harness checks are not being represented as an all-route browser result.
