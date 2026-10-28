# DealFlow360 productization roadmap

Updated 2026-10-28 (Asia/Kolkata). Owner of this document: Ruchir.

This document explains what it takes to turn DealFlow360 from a hackathon project with one demo company into a product that several customer companies can use at the same time. It lists what is already done, the decisions the team has to make, and the remaining work in priority order. Each item names the lane that owns it.

## Where we started

The hackathon build proved the full quote-to-cash flow for one seller (Nexa). It was not safe to give to a second company:

- Most business tables had no company column. Quotes, orders, invoices, subscriptions, policies, price lists, categories, plans, and health data were shared by everyone who could sign in.
- The workspace screens loaded every row in the database on each request and filtered afterwards in JavaScript.
- Sign-up created a pending user inside the hardcoded "NEXA" company, and anyone could claim any customer id.
- Product codes (SKU, price list code, warehouse code, plan code, team name) were unique across the whole database, so two companies could not both have a "STANDARD" price list.
- Scheduled jobs ran as one fixed user (`dev@nexa.example`), and Stripe callbacks recorded payments as any finance user of any company.
- The sign-in page shipped the seeded demo passwords to every browser, and a customer could mark their own invoice paid with a made-up card number when Stripe was not connected.

## What is done (phase 1: a safe multi-company foundation)

| Area | What changed | Where |
|---|---|---|
| Data model | Every business table now belongs to a company, directly through `companyId` or through its parent. Natural keys are unique per company. The migration backfills existing rows from their relations (audit rows and request keys through what they describe), refuses to finish if any checked reference crosses companies, and reports how many unlinked rows it gave to the oldest company. | `prisma/migrations/20261028120000_company_tenancy` |
| Query isolation | Each API request runs in a tenant scope. Signing in binds the user's company. A Prisma client extension adds the company filter to every read, update, and delete, and checks the company on every create. Code that runs without a scope is refused. | `src/server/lib/tenant/context.ts`, `src/server/lib/db/tenant.ts` |
| Database guard | Triggers on 34 tables reject any row that points at another company's row, even if application code has a bug. | `prisma/migrations/20261028120100_tenant_reference_guard` |
| Onboarding | A new company gets a working workspace (owner admin, four categories, a standard price list, a starter approval policy, health settings) from `pnpm workspace:create`, or from `/signup` when `DEALFLOW_PUBLIC_SIGNUP=1`. | `src/server/tenancy/workspace.ts`, `scripts/create-workspace.ts` |
| Team invitations | Admins invite staff and customer-portal users from Settings → Users & roles. Each person sets a password from a one-time link valid for 7 days. Admins can disable and re-enable users. | `src/server/users/service.ts`, `src/features/users/ui/UsersAdmin.tsx` |
| Suspension | A company marked inactive cannot sign in, and its open sessions stop working. | `src/server/lib/auth/session.ts` |
| Jobs and callbacks | Scheduled jobs run once per active company. Stripe payments are recorded inside the invoice's own company. | `src/server/integrations/jobs.ts`, `src/server/billing/system-actor.ts` |
| Production safety | The server checks its configuration at start and exits on errors. Demo logins appear only in demo mode and are not in the browser bundle. Customers cannot record their own payments outside demo mode. Security headers are set on every route. | `src/server/config/env.ts`, `src/instrumentation.ts`, `next.config.ts` |
| Operations | Liveness and readiness probes, a Dockerfile, and a compose `app` profile. | `src/app/api/livez`, `src/app/api/readyz`, `Dockerfile` |
| Evidence | Unit tests for the query rewriting, a test that the tenant rules match the schema, a PostgreSQL test with two fresh workspaces, and an HTTP probe that the Contoso admin cannot read or change Nexa records. | `src/server/lib/db/tenant.test.ts`, `src/server/tenancy/isolation.test.ts`, `scripts/tenant-isolation-check.mjs` |

## Decisions the team must make before selling

These are business decisions, not code. The code cannot settle them.

1. **License and terms.** `LICENSE` says the code is academic and not licensed for reuse. Before any customer pays, the four owners must agree on ownership and a commercial license, and publish terms of service, a privacy policy, and a data processing agreement.
2. **How sellers get paid.** Today one Stripe account collects for every workspace. A real product needs each seller to collect into its own account (Stripe Connect), or it must be clear that DealFlow360 only records payments taken elsewhere.
3. **How DealFlow360 charges its customers.** Pricing (per seat, per workspace, or per transaction), trial length, and what happens when a workspace stops paying (suspension is already supported).
4. **Hosting region and data residency.** Indian sellers may need data stored in India. This decides the database provider and region.
5. **Self-serve or sales-led.** Public sign-up is off by default. Decide whether to open it, and if so, add email verification first (see P0).

## Remaining work

### P0: before the first paying customer

| Item | Why it matters | Lane |
|---|---|---|
| Email verification for self-serve sign-up | Without it, anyone can create a workspace with someone else's email. Keep `DEALFLOW_PUBLIC_SIGNUP` off until this exists. | Ruchir (auth) |
| Shared rate limiting and idempotency store | The login and sign-up limiters and the workspace command replay map live in one process's memory. Two app instances, or one restart, lose them. Move them to PostgreSQL or Redis. | Ruchir |
| Stock allocation race | Two finance users allocating the same stock at the same moment can both succeed (no row lock, no `CHECK (onHand >= reserved)`). Oversold stock is a real customer complaint. | Harsh (inventory) |
| Workspace lost update | Two people saving the same quote from the workspace screens can overwrite each other (`src/server/live/canonical.ts` has no head-revision check). | Atharva (quotes) with Krishna |
| Remove the demo id layer from the live path | Live code still maps seeded emails to fixture ids (`EMAIL_TO_ACTOR_ID`, `FIXTURE_*` in `src/server/lib/auth/actor-helpers.ts`, `src/server/lib/db/map.ts`, `src/server/live/ids.ts`). It is scoped and harmless for other companies, but it is demo logic in production code and makes ids inconsistent. | Ruchir with Krishna |
| Backups and restore drill | Turn on point-in-time recovery on the managed database and restore it once into a scratch database. | Ruchir |
| Error tracking and logs | Add `onRequestError` in `src/instrumentation.ts` to send errors to a tracker, and structured request logs with the company id. | Ruchir |
| Verified email sending | Configure a sending domain (`MAIL_FROM`) so invites and resets actually arrive. | Ruchir |
| Manual check of onboarding | A Playwright run clicked through sign-up, invite, and activation on the production build. A person should still try it on real devices, including the first quote in a brand-new workspace. | Krishna |
| Invitation edge cases | Login emails are unique across workspaces, so an admin who invites an address that belongs to someone else blocks it for other workspaces until the invitation is withdrawn, and the "already has an account" answer reveals that an address is registered somewhere. Invitations stay PENDING (no sign-in, no Google SSO) until redeemed, are emailed rather than shown when mail is configured, and are limited to 30 per hour per admin. Per-workspace identities (P1) remove the rest. | Ruchir |
| Request keys per company | Request keys are unique across the platform but looked up per company, so reusing another company's key returns an error instead of a replay. Make the unique key `(companyId, scope, key)`. Upserts on company-owned tables now run as find-then-create, so two identical concurrent upserts can fail one of them instead of converging. | Ruchir |

### P1: in the first months

| Item | Why it matters | Lane |
|---|---|---|
| Paginated workspace APIs | The workspace screens still load all of one company's data on every request (`loadDataState`). This is fine for a small company and slow for one with thousands of quotes. | Krishna with every lane |
| Per-company settings | Time zone, currency display, logo and company name on invoices and PDFs, invoice numbering, and company-owned tax rates (tax rates are shared today). | Ruchir (billing), Harsh (catalog) |
| Customer offboarding | Export all of one company's data, and delete it on request. | Ruchir |
| One person in several workspaces | Login emails are unique across the platform, so a buyer who buys from two sellers needs two emails. Supporting this needs a workspace picker at sign-in. | Ruchir with Krishna |
| Single sign-on per company and two-factor sign-in | Larger customers will ask for their own SAML or OIDC provider and MFA. Google SSO today is one platform-wide client. | Ruchir |
| Audit log screen | Every important change is already recorded in `AuditEvent` with its company. Admins cannot see it yet. | Krishna |
| Operator console | A small internal screen to list workspaces, see usage, and suspend or reactivate a company. Today this needs SQL or a script. | Ruchir |
| Pre-existing open items | See the 2026-10-28 bug-sweep entry in `memory.md` (price-list rules, policy budget, subscription edge cases, multi-currency report totals). | Each lane |

### P2: later

- Integrations: an API with per-workspace keys, and webhooks to CRMs and ERPs.
- Load testing and a published service level.
- Accessibility audit and translations.
- Plan limits per workspace (seats, storage) and billing for DealFlow360 itself.

## Known technical notes

- `SESSION_SECRET` is not used for signing. Sessions are random tokens stored as SHA-256 hashes, which is safe without a secret. The variable is kept for CI and the integrations panel.
- Raw SQL bypasses the tenant extension. Every `$queryRaw` or `$executeRaw` must filter by company itself or use only ids the scoped client returned. There are eight today, all reviewed: five `SELECT … FOR UPDATE` row locks on ids the service then reads through the scoped client, one plan price update that also filters by company, one plan price read limited to the scoped plans, and the readiness probe's `SELECT 1`.
- The schema and migrations already disagreed before this work on a few foreign keys and one index (`Order_dealId_fkey`, `Quote_dealId_fkey`, `PolicyCeiling_categoryId_fkey`, `OrderLine_sourceQuoteLineId_fkey`, and two indexes). `prisma migrate diff` shows them. They were left alone here and should be fixed in a separate migration.
- The migration that added `Company` in September inserts the "Nexa" and "Contoso Demo" companies into every database. On a production database they stay empty and unused.

## How to check this work

```bash
pnpm db:deploy && pnpm db:seed && pnpm db:seed
pnpm typecheck && pnpm lint && pnpm test
pnpm build && APP_URL=http://127.0.0.1:3000 pnpm start
BASE_URL=http://127.0.0.1:3000 node scripts/full-cycle-check.mjs
BASE_URL=http://127.0.0.1:3000 node scripts/tenant-isolation-check.mjs
```
