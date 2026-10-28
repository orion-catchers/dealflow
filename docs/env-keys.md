# Environment keys — local first, vendors later

DealFlow360 does **not** need a hosted deploy for the Nexa demo. Copy `.env.example` to `.env`, start Docker Postgres, seed, and run `npm run dev`.

Vendor APIs (email, cards, Google, live carrier) are **implemented and fail closed**. Until you paste keys, those routes return **503** `INTEGRATION_REQUIRED`. Core catalog, quotes, confirm, fulfillment Preview/Accept, receipts, reports XLSX, and DB payments work without them.

Never commit `.env`.

---

## Required for the local product

| Name | Why |
|---|---|
| `DATABASE_URL` | Postgres 16. Example: `postgresql://dealflow:dealflow@localhost:5434/dealflow?schema=public` (this machine maps Docker to **5434**). |
| `DEALFLOW_DB_PORT` | Host port in `docker-compose.yml`; must match the port in `DATABASE_URL`. Default in example is 5432. |
| `SESSION_SECRET` | Reserved. Sessions are random 32-byte tokens stored as SHA-256 hashes, so nothing is signed with this value today. CI and the integrations panel still list it; set it with `openssl rand -hex 32`. |

Leave **unset**:

- `DEALFLOW_ADAPTER=development` — fixture JSON store, not the live demo.
- `DEALFLOW_DEV_IMPERSONATION=1` — skip real login (forbidden in production).

Optional: `NODE_ENV=production` on a real host. Local `npm run dev` is fine without it.

Optional locally, **required in production**: `APP_URL` — the public https origin. Invite links, password resets, Google OAuth redirects and Stripe return URLs are built from it.

---

## Product switches (production hosts)

A production server checks its configuration at start (`src/server/config/env.ts`) and exits with a list of problems instead of serving a half-working app.

| Name | Default | Effect |
|---|---|---|
| `APP_URL` | none (required) | Public origin, e.g. `https://app.example.com`. |
| `DEALFLOW_PUBLIC_SIGNUP` | off | `1` lets anyone create a new workspace (company) at `/signup`. Off: workspaces are provisioned with `pnpm workspace:create`, and people join a workspace only by an admin's invitation. |
| `DEALFLOW_DEMO_MODE` | off in production, on in development | `1` lists the seeded demo logins on the sign-in page and allows customers' card **Preview** payments. Never set it on a host with real customer data. |
| `MAIL_FROM` | none | Required with `RESEND_API_KEY`: a sender on a domain verified in Resend. |

The server refuses to start in production when `DATABASE_URL` or `APP_URL` is missing, `DEALFLOW_ADAPTER=development` or `DEALFLOW_DEV_IMPERSONATION=1` is set, `CRON_SECRET` is shorter than 24 characters, or `RESEND_API_KEY` has no `MAIL_FROM`. It warns about a remote database without `sslmode=require`, a non-https `APP_URL`, no email provider, demo mode, and open sign-up.

---

## Optional — paste when you want that path off 503

| Name | Used for | Without it |
|---|---|---|
| `RESEND_API_KEY` | Transactional email via Resend | Password reset / quote send / health nudge **log** in non-production |
| `MAIL_FROM` | From-header for Resend | Default `DealFlow360 <noreply@dealflow.invalid>` (required in production with Resend) |
| `MAIL_WEBHOOK_URL` | POST JSON instead of Resend | Same as missing email |
| `STRIPE_SECRET_KEY` | Hosted Checkout Session + record payment on return | **Pay with card** 503; **Record payment** still works |
| `STRIPE_PUBLISHABLE_KEY` | Dashboard / future Elements; not required for hosted Checkout | Optional |
| `STRIPE_WEBHOOK_SECRET` | Signed `POST /api/payments/stripe/webhook` | Return-URL complete still records payment using the secret key |
| `GOOGLE_CLIENT_ID` | `/api/auth/sso/google` | Login page hides Google link |
| `GOOGLE_CLIENT_SECRET` | Google callback | SSO 503 |
| `CRON_SECRET` | `POST /api/jobs/run` `Authorization: Bearer …` | Use `npm run jobs` locally instead |
| (removed) `JOBS_ACTOR_EMAIL` | Jobs now run once per active company, as that company's earliest active admin | — |
| `DEALFLOW_FX_JSON` | `GET /api/fx` display-currency Preview | Built-in INR/USD/EUR → INR factors |
| `CARRIER_QUOTE_URL` | Live HTTP courier quote overlay | Rate **card** still used; live quote 503 |
| `CARRIER_API_KEY` | Optional `Authorization` to the carrier URL | Only if your carrier mock needs it |

Google SSO: the Google account **email must already exist** as an ACTIVE user (seed emails, not arbitrary Gmail). Authorized redirect URI: `{APP_URL}/api/auth/sso/google/callback`.

Stripe: **Pay with card** opens Stripe-hosted Checkout. After pay, `{APP_URL}/api/payments/stripe/complete?session_id=…` records the invoice using `STRIPE_SECRET_KEY`. Optional webhook: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook` then `STRIPE_WEBHOOK_SECRET`.

Jobs without a vendor: `npm run jobs` (due invoices, health refresh, learned co-purchase scores, once per company). `POST /api/jobs/run` needs `CRON_SECRET`.

Stripe and Google are **platform-wide** today: one Stripe account collects for every workspace, and Google SSO signs in any existing user of any workspace. Per-workspace payment accounts (Stripe Connect) are on the roadmap ([productization-roadmap.md](productization-roadmap.md)).

---

## Not API keys, but do not confuse them

| Name | Meaning |
|---|---|
| `DEALFLOW_ADAPTER` | Only `development` for Krishna fixture harness |
| `DEALFLOW_DEV_IMPERSONATION` | `x-dev-actor` header; never in production |

---

## Seed logins (LIVE database)

The complete tester list (Nexa, Contoso, synthetic importer, fixture emails) is **[testing-credentials.md](testing-credentials.md)**.

Passwords are **not** `password123`. They come from `src/fixtures/ruchir.ts`.

| Role | Email | Password |
|---|---|---|
| ADMIN | `dev@nexa.example` | `admin-nexa-2026!` |
| SALES_REP | `arjun@nexa.example` | `arjun-nexa-2026!` |
| SALES_REP | `priya@nexa.example` | `priya-nexa-2026!` |
| SALES_MANAGER | `sana@nexa.example` | `sana-nexa-2026!` |
| FINANCE | `farah@nexa.example` | `farah-nexa-2026!` |
| CUSTOMER (Acme) | `neha@acme.example` | `neha-acme-2026!` |
| CUSTOMER (Beta) | `rohan@beta.example` | `rohan-beta-2026!` |
| CUSTOMER (Gamma) | `meera@gamma.example` | `meera-gamma-2026!` |
| Pending (cannot login) | `vikram@nexa.example` | `vikram-nexa-2026!` |

Contoso admin (`admin@contoso.example` / `contoso-admin-2026!`) is a second, empty workspace with only the starter configuration. Sign in as Contoso to see that none of Nexa's records are visible (`node scripts/tenant-isolation-check.mjs` checks this over HTTP). The seed wipes data.

---

## Browser ticks that do not need vendor keys

1. **Acme ₹50,000** — Arjun, quote for Acme, add Nexa ProBook Standard. Catalog hint + saved line unit price `50000.00`.
2. **6+3+1 split** — Farah, `/fulfillment` → order → **Recommended split · Preview** (Main 6, East 3, backorder 1). Accept to reserve.
3. **Receipt + consolidate** — Fulfillment **Stock** tab → Receive 1 laptop → open order → **Consolidate**.
4. **XLSX vs screen** — `/reports`, apply filters, read the table, **Export XLSX**. Same query string as `GET /api/reports`.
