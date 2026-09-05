# Atharva Implementation Prompt

You are implementing Atharva's ownership lane for DealFlow360. Work only on the quote, pricing governance, approval, order-confirmation, audit, and deal-health modules defined below. Keep backend logic under `backend/src`. Keep frontend screens under `frontend/src` when they are added. Do not modify Krishna's shared shell/theme, Ruchir's authentication/database/billing ownership, or Harsh's catalog/inventory ownership unless an explicit contract change is required.

## Project Context

DealFlow360 is a B2B sales workflow in which a quote can be revised, evaluated against discount policy, approved by the required people, accepted by the customer, converted into one order, fulfilled, and billed. Exact revisions and audit history must be preserved.

Use these conventions:

- TypeScript.
- String IDs.
- Decimal-string money values.
- Percentages from `0` to `100`.
- ISO timestamps and date-only values where appropriate.
- API success shape: `{ data: value }`.
- API error shape: `{ error: { code, message, details? } }`.
- Mutating quote requests include `expectedRevision`.
- Stale writes return a conflict rather than overwriting newer data.
- Reads never change business state.
- No production path may silently fall back to fixtures.

## Completed So Far

The following work has been completed:

1. Atharva's TypeScript contracts were created at `backend/src/contracts/atharva.ts`.
2. Typed development fixtures were created at `backend/src/fixtures/atharva.ts`.
3. The old root `src` directory was removed so backend and frontend code are separated.
4. `frontend/src` was created as the future frontend source directory.
5. The contracts currently describe:
   - Quote stages and revision approval states.
   - Actors and API responses.
   - Quote lines, pricing results, totals, costs, margins, and recurring intervals.
   - Policy snapshots, breaches, evaluation results, and approval chains.
   - Quotes, immutable revisions, approval records, and order confirmation input/output.
   - Health flags, health tasks, health settings, and dashboard summaries.
6. The fixtures currently include:
   - A routine quote within policy.
   - An exception quote requiring Manager then Finance approval.
   - A manager approval record.
   - A stalled quote health flag.
   - A paid-but-undelivered order health flag.
   - A nudge task and dashboard aggregates.

The completed files currently have no editor diagnostics. The repository does not yet have a package manifest, TypeScript configuration, database schema, or application scaffold, so full compilation and integration tests are not available yet.

The contracts and fixtures are scaffolding only. Pricing, governance, quote persistence, approval actions, order confirmation, audit writing, health calculations, APIs, and screens are not implemented yet.

## Modules Atharva Must Complete

### 1. Quote CRUD and immutable revisions

Implement under `backend/src/features/quotes/`.

Required behavior:

- Create and list quotes.
- Scope quotes by customer and sales representative.
- Add, edit, and remove quote lines before confirmation.
- Save draft quotes.
- Store immutable material revisions.
- Preserve all previous revisions and approval decisions.
- Mark previous decisions as superseded when terms change; never delete them.
- Require `expectedRevision` for mutations.
- Return a conflict when a stale client edits a quote.
- Lock direct quote edits after confirmation.

### 2. Reusable pricing engine

Implement pure, database-independent functions under `backend/src/lib/pricing/`.

Required behavior:

- Resolve and snapshot accepted prices, costs, and taxes.
- Validate positive quantities.
- Validate finite, nonnegative money values.
- Validate discounts from `0` to `100`.
- Calculate sequential line and order discounts:
  `100 * (1 - (1 - linePct / 100) * (1 - orderPct / 100))`.
- Calculate one-time totals.
- Calculate recurring totals separately by interval.
- Calculate tax, cost, profit, and margin percentage.
- Preserve separate recurring totals; never add monthly and annual values as if comparable.
- Reject empty or zero-base quotes from submission.

### 3. Engine 1: policy evaluation and governance

Implement under `backend/src/features/governance/`.

Required behavior:

- Resolve the applicable customer tier and category ceiling.
- Use the stricter applicable ceiling.
- Fall back to the tier ceiling when no category ceiling exists.
- Block submission when essential policy configuration is missing.
- Calculate excess points and excess amount per line.
- Calculate value-weighted excess.
- Calculate worst-line excess.
- Evaluate one-time and each recurring interval group separately.
- Determine the highest required approval level across groups.
- Return breached lines, aggregate values, reasons, and the required chain.
- Use the sample rules from the fixtures:
  - Any excess routes to Manager.
  - Worst-line excess above 5 points or weighted excess above 3 points routes to Manager then Finance.
  - Total discount budget rules may add escalation.

### 4. Sequential approval state machine

Implement approval services under `backend/src/features/governance/`.

Required behavior:

- Manager approval must happen before Finance approval.
- Only the correct role can perform each approval action.
- The quote owner cannot approve their own quote.
- Approval actions require a reason where applicable.
- Approvals must target the current exact revision.
- Support approve, return, and reject.
- Make repeated requests safe and duplicate-resistant.
- Preserve immutable approval history.
- Prevent old approvals from validating new terms.

### 5. Quote transition and customer-acceptance services

Implement canonical state transitions under `backend/src/features/quotes/` or `backend/src/features/governance/`.

Required behavior:

- Submit and send quotes.
- Enter negotiation.
- Save customer proposals as proposals, not direct term overwrites.
- Create and evaluate a new revision for material proposed changes.
- Requeue approval when a proposal breaches policy.
- Keep within-limit proposals clearly marked as proposed until acceptance.
- Block confirmation while approval or revision work is pending.
- Validate customer identity and customer ownership.
- Require acceptance of the current exact revision.
- Reject stale browser acceptance with a conflict.

### 6. Repeat-safe order confirmation

Implement the canonical `confirmOrder` service under `backend/src/features/quotes/`.

Required behavior:

- Accept `quoteId`, `expectedRevision`, `customerId`, and `requestKey`.
- Require a current approved or not-required revision.
- Require matching customer acceptance.
- Create one immutable order per accepted quote revision.
- Return the existing order when the same request is retried.
- Produce the `OrderReady` result defined in the contracts.
- Expose billing and fulfillment initialization states.
- Do not duplicate billing or stock reservation logic.
- Coordinate with Ruchir's billing initializer and Harsh's fulfillment initializer later through a transaction-safe interface.

### 7. Shared audit writer

Implement under `backend/src/lib/audit/`.

Required behavior:

- Record entity type and ID.
- Record actor, action, reason, revision, and timestamp.
- Store request key and result linkage where relevant.
- Keep audit events immutable.
- Support quote edits, revision creation, approval actions, proposal changes, acceptance, confirmation, and health actions.
- Use an adapter so it can run with fixtures before Prisma is available.

### 8. Engine 5: deal health calculations

Implement pure calculations and services under `backend/src/features/health/`.

Required behavior:

- Detect stalled submitted, sent, and negotiating quotes.
- Use a configurable default of five days.
- Count meaningful business activity only; page reads and refreshes do not reset activity.
- Detect historical discount anomalies.
- Require at least three prior comparable confirmed quotes.
- Exclude the current quote and future records from the comparison.
- Flag discounts above historical average plus the configured margin.
- Detect delivery risk for confirmed orders.
- Include fully paid but undelivered orders.
- Treat payment and delivery as independent facts.
- Detect insufficient allocation before the promised date when appropriate.
- Detect overdue undelivered goods after the promised date.
- Resolve flags when the underlying condition no longer applies.
- Avoid duplicate active flags during repeated refreshes.

### 9. Health actions and dashboard aggregates

Implement under `backend/src/features/health/` and the Atharva dashboard route.

Required behavior:

- Create nudge and escalation tasks.
- Assign tasks to a real rep, manager, or operations user.
- Store task status, due date, assignee, and linked deal.
- Provide dashboard counts for pending approvals, open quotes, and at-risk deals.
- Provide recent events and next-action links.
- Support explicit refresh/re-evaluation.

### 10. Atharva-owned API routes

Add routes after the application scaffold exists. The minimum families are:

- `/api/quotes/*`
- `/api/approvals/*`
- `/api/policies`
- `/api/health/*`
- `/api/dashboard`

Every route must enforce authentication and record scope server-side. Use the shared response and error contracts. Never trust a role or customer ID supplied by the browser.

### 11. Atharva-owned frontend screens

Implement under `frontend/src` after the frontend scaffold and shared UI components are available. Use local thin adapters temporarily if needed.

Required screens:

- Quote list/pipeline: stage cards, filters, scoped records, list view, and new quote.
- Deal health dashboard: stalled quotes, discount anomalies, delivery risks, links, nudge, and escalation.
- Discount tiers and approval-chain editor: editable limits and risk routing that are used immediately for new evaluations.

Every screen needs loading, empty, error, conflict, and failed-save states. Consequential actions require confirmation. Do not show success before the server confirms the write.

## Modules Atharva Can Proceed With Independently Now

These do not require the database, authentication, shared shell, or teammate implementation:

1. Pure pricing functions and unit tests.
2. Pure policy evaluation and approval-chain calculations.
3. Quote revision and conflict logic using an in-memory repository adapter.
4. Approval state-machine logic using typed actors and fixtures.
5. Customer proposal and exact-version acceptance validation as pure services.
6. Repeat-safe confirmation logic using an in-memory request-key/order adapter.
7. Audit event construction and immutable in-memory audit storage.
8. Health calculations for stalled quotes, discount anomalies, and delivery risk.
9. Health flag upsert/resolution and duplicate-prevention logic.
10. Dashboard aggregation from typed fixtures.
11. Contract tests for all of the above.
12. Backend service interfaces and repository interfaces that Ruchir can later connect to Prisma.
13. Basic pipeline and health UI components using fixture data, provided they do not introduce a competing global theme.

Recommended independent sequence:

1. Pricing functions.
2. Policy evaluation.
3. Quote revision repository and conflicts.
4. Approval state machine.
5. Confirmation and request-key idempotency.
6. Audit writer.
7. Health calculations and flag upsert.
8. API adapters.
9. Atharva frontend screens.

## Work That Requires Coordination Later

These areas can be designed now but cannot be fully integrated without teammate-owned work:

- Prisma models, migrations, and database transactions: coordinate with Ruchir.
- Authentication and session actor resolution: coordinate with Ruchir.
- Product, variant, customer, price-list, and tier data: coordinate with Harsh.
- Shared UI shell, theme tokens, tables, dialogs, and navigation: coordinate with Krishna.
- Billing initialization during order confirmation: coordinate with Ruchir.
- Fulfillment initialization during order confirmation: coordinate with Harsh.
- Live catalog pricing resolution: coordinate with Harsh.
- Deployment, environment variables, package versions, and CI: coordinate with Ruchir.

Until those integrations exist, use replaceable typed adapters and label the implementation `DEV FIXTURE`. Do not claim it is `LIVE`.

## Required Verification

Before claiming a module complete, add focused tests or executable checks for:

- Hardware at 12% against a 15% ceiling is allowed.
- Services at 18% against a 10% ceiling require approval.
- Splitting an identical line does not change aggregate risk.
- Order-level discount cannot bypass policy.
- Mixed billing intervals are evaluated independently.
- Stale quote edits return a conflict.
- Old approvals cannot validate a new revision.
- Finance cannot approve before Manager.
- Sales representatives cannot self-approve.
- Repeated confirmation returns one order.
- Repeated health refreshes do not duplicate flags.
- Delivered orders resolve delivery risk.
- Paid but undelivered orders remain flagged.
- Anomaly detection states when history is insufficient.

Every progress report must state:

- Working live behavior.
- Remaining behavior.
- Interface needed from another owner.
- Checks run.
- PR or commit reference.

Start with the first independent slice: pricing functions, policy evaluation, and focused tests. Preserve the existing contracts and fixtures unless a backward-compatible contract improvement is necessary.
