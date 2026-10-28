# DealFlow360 security model

_Audience: reviewers, operators, coding agents. This is the threat model for the current codebase, not a SOC 2 attestation._

## Trust boundaries

| Zone | Trust |
|---|---|
| Browser | Untrusted. UI RoleGates hide navigation only. |
| Next.js Route Handlers | Trusted for authorization and engines. |
| PostgreSQL | Trusted store. App uses parameterized Prisma queries. |
| Fixture adapter `src/development/` | Untrusted for production. Must not load when `NODE_ENV=production`. |
| Header `x-dev-actor` | Trusted **only** in development fixture mode. |

## Tenant isolation

One deployment serves many companies (workspaces). Isolation has three layers, so one missed check in a service is not a data leak:

1. **Tenant scope per request** (`src/server/lib/tenant/context.ts`). Every API request runs in an `AsyncLocalStorage` scope (`handle()`, the workspace catch-all, and `scopedRoute()` for the few routes that build their own responses). Authentication binds the session user's `companyId`; a request can never switch company.
2. **Tenant-scoped Prisma client** (`src/server/lib/db/tenant.ts`). A client extension adds `companyId` (or the parent's, e.g. a payment through its invoice) to the `where` of every read, update, and delete, and stamps or checks `companyId` on every create. Queries with no scope throw; before sign-in only identity models (User, Session, PasswordResetToken, CustomerMembership, Company, TaxRate) are reachable. A model without a tenant rule throws, and `tenant.test.ts` fails if the rule list falls out of step with the schema. Cross-company code (seed, cron fan-out, Stripe callbacks) must call `runAsSystem` or `runForCompany` explicitly.
3. **Database triggers** (`prisma/migrations/20261028120100_tenant_reference_guard`). `BEFORE INSERT OR UPDATE` triggers on 34 tables reject any row that references another company's row (a customer pointing at another company's price list, an order line pointing at another company's product, and so on), whatever the application does.

Raw SQL (`$queryRaw` / `$executeRaw`) bypasses layer 2: every raw statement must carry its own company predicate or act only on ids the scoped client returned.

Evidence: `src/server/lib/db/tenant.test.ts` (rewriting rules), `src/server/tenancy/isolation.test.ts` (two fresh workspaces against PostgreSQL), and `scripts/tenant-isolation-check.mjs` (HTTP probe: the Contoso admin cannot read or change any Nexa id).

Platform-wide pieces, shared by every workspace: login emails are unique across the platform; tax rates are shared reference data (a workspace can add a rate but not rename or deactivate one); one Stripe account and one Google OAuth client serve every workspace.

## Authentication

- Sign-up (`src/server/lib/auth/credentials.ts`) creates a **new workspace** with the person as its ADMIN, and only when `DEALFLOW_PUBLIC_SIGNUP=1`; it is rate-limited per client address. People join an existing workspace only through an admin invitation (`POST /api/admin/users`), which creates the account with an unusable password and a one-time set-password link valid for 7 days. There is no way to claim a customer membership from the outside.
- Password stored as `scrypt$<salt>$<hash>` (`src/server/lib/auth/password.ts`). Timing-safe compare.
- Session: random 32-byte hex token. Database stores **SHA-256 hex** of the token (`Session.tokenHash`). Cookie `dealflow_session` httpOnly, `SameSite=Strict`, `Secure` when `NODE_ENV=production`, `Path=/`.
- Inactive / PENDING / DISABLED users cannot authenticate. Disabling a user ends their sessions.
- Session tokens are random and stored hashed, so `SESSION_SECRET` is not used for signing.

## Authorization

- Actor loaded per request from session (or fixture header).
- Services call role allowlists (e.g. `runLiveCommand` `roles(...)`).
- Sales reps: quote scope by `repId`.
- Customers: `customerId` + membership; repositories must filter by customer. Nested portal JSON is reconstructed from an allowlist (`src/features/portal/server.ts`).
- Admins manage and invite users of their own workspace via `/api/admin/users`.
- Customers cannot record payments in production; the card **Preview** that books a payment without a provider exists only in demo mode (`DEALFLOW_DEMO_MODE=1` or non-production). Stripe settlements are recorded inside the invoice's company by one of that company's finance users.

## CSRF

- `assertPostOrigin` in `src/middleware.ts` for `/api/*`.
- Blocks cross-site `Sec-Fetch-Site` and mismatched `Origin`.
- Production mutations require Origin or Referer.
- Cookie `SameSite=Strict` reduces cross-site cookie send.

## Injection and XSS

- SQL: Prisma. Avoid new `$queryRaw` unless parameterized and reviewed.
- XSS: React default escaping. Do not `dangerouslySetInnerHTML` with user content.
- Path params: treat unknown ids as 404.

## Business integrity (security-relevant)

- `expectedRevision` prevents acting on a superseded quote.
- `RequestKey` uniqueness prevents double payment/receipt/allocation replay with a different payload.
- Confirm does not reserve stock; allocation is explicit.
- Stale approvals never authorize a new revision.

## Secrets

| Secret | Handling |
|---|---|
| `SESSION_SECRET` | Env only. Rotate by issuing new sessions (old cookies fail hash if you change hashing input — confirm current usage before rotating). |
| `DATABASE_URL` | Env only. Prefer TLS to hosted Postgres (`sslmode=require`). |
| Seeded demo passwords | Demo/local only. The sign-in page lists them only in demo mode, and production builds do not ship them to the browser. Never seed a production database. |

Never commit `.env`. Never log cookies or password hashes.

## Production fail-closed

```text
NODE_ENV=production
  → developmentEnabled() is false
  → x-dev-actor ignored
  → server start checks configuration (src/server/config/env.ts) and exits on errors
  → demo logins hidden, customer Preview payments refused
```

Response headers on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`, a `Content-Security-Policy` limited to `frame-ancestors`, `object-src`, `base-uri` and `form-action`, and HSTS in production.

## Threats in / out of scope

| Threat | Mitigation | Residual |
|---|---|---|
| Stolen session cookie | httpOnly, HTTPS in prod, 8h catch-all login TTL | XSS in our origin still steals nothing from JS but can CSRF same-site if Origin checks fail |
| Privilege escalation via signup | PENDING + no role field | Admin UI compromise |
| Tenant leak | Tenant-scoped client + reference triggers + portal membership | Raw SQL without a company predicate; nested `include` of a shared model |
| Workspace spam | Sign-up off by default; 5 per hour per address | In-memory limiter per instance |
| Double spend | RequestKey + unique invoices | In-memory replay map for some live commands (restart gap) |
| CSRF | Origin middleware | Non-browser clients without Origin in prod blocked |
| Fixture in prod | Adapter guard | Mis-set env on a host |

## Reviewer tests

1. POST `/api/auth/login` with `Origin: https://evil.example` → 403.
2. Production-like `NODE_ENV=production` without Origin/Referer → 403.
3. Fixture header on live adapter → ignored; must use cookie.
4. Pending `vikram@nexa.example` login → 401.
5. Portal quote of another customer → 404.
6. Confirm with wrong `expectedRevision` → 409/422.
