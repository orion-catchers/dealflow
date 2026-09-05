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

## Authentication

- Signup: `src/server/lib/auth/credentials.ts`. Password stored as `scrypt$<salt>$<hash>` (`src/server/lib/auth/password.ts`). Timing-safe compare.
- Session: random 32-byte hex token. Database stores **SHA-256 hex** of the token (`Session.tokenHash`). Cookie `dealflow_session` httpOnly, `SameSite=Strict`, `Secure` when `NODE_ENV=production`, `Path=/`.
- Inactive / PENDING / DISABLED users cannot authenticate.
- Signup does not accept a privileged `role` from the client. New users are PENDING until an administrator activates them.

## Authorization

- Actor loaded per request from session (or fixture header).
- Services call role allowlists (e.g. `runLiveCommand` `roles(...)`).
- Sales reps: quote scope by `repId`.
- Customers: `customerId` + membership; repositories must filter by customer. Nested portal JSON is reconstructed from an allowlist (`src/features/portal/server.ts`).
- Admins can manage users via `/api/admin/users`.

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
| Seed `password123` | Demo/local only. Disable or reset on any internet-facing host that is not a labeled demo. |

Never commit `.env`. Never log cookies or password hashes.

## Production fail-closed

```text
NODE_ENV=production
  → developmentEnabled() is false
  → x-dev-actor ignored
  → missing DATABASE_URL → 503
```

## Threats in / out of scope

| Threat | Mitigation | Residual |
|---|---|---|
| Stolen session cookie | httpOnly, HTTPS in prod, 8h catch-all login TTL | XSS in our origin still steals nothing from JS but can CSRF same-site if Origin checks fail |
| Privilege escalation via signup | PENDING + no role field | Admin UI compromise |
| Tenant leak | Portal 404 + membership | Bug in a new nested field |
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
