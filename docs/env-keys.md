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
| `SESSION_SECRET` | Cookie signing. Generate with `openssl rand -hex 32`. `change-me` is local-only. |

Leave **unset**:

- `DEALFLOW_ADAPTER=development` — fixture JSON store, not the live demo.
- `DEALFLOW_DEV_IMPERSONATION=1` — skip real login (forbidden in production).

Optional: `NODE_ENV=production` on a real host. Local `npm run dev` is fine without it.

Optional: `APP_URL=http://localhost:3000` — used in Google OAuth redirect and some email links.

---

## Optional — paste when you want that path off 503

| Name | Used for | Without it |
|---|---|---|
| `RESEND_API_KEY` | Transactional email via Resend | Password reset / quote send / health nudge **log** in non-production |
| `MAIL_FROM` | From-header for Resend | Default `DealFlow360 <noreply@nexa.example>` |
| `MAIL_WEBHOOK_URL` | POST JSON instead of Resend | Same as missing email |
| `STRIPE_SECRET_KEY` | Hosted Checkout Session + record payment on return | **Pay with card** 503; **Record payment** still works |
| `STRIPE_PUBLISHABLE_KEY` | Dashboard / future Elements; not required for hosted Checkout | Optional |
| `STRIPE_WEBHOOK_SECRET` | Signed `POST /api/payments/stripe/webhook` | Return-URL complete still records payment using the secret key |
| `GOOGLE_CLIENT_ID` | `/api/auth/sso/google` | Login page hides Google link |
| `GOOGLE_CLIENT_SECRET` | Google callback | SSO 503 |
| `CRON_SECRET` | `POST /api/jobs/run` `Authorization: Bearer …` | Use `npm run jobs` locally instead |
| `JOBS_ACTOR_EMAIL` | Actor for job writes | Defaults to `dev@nexa.example` |
| `DEALFLOW_FX_JSON` | `GET /api/fx` display-currency Preview | Built-in INR/USD/EUR → INR factors |
| `CARRIER_QUOTE_URL` | Live HTTP courier quote overlay | Rate **card** still used; live quote 503 |
| `CARRIER_API_KEY` | Optional `Authorization` to the carrier URL | Only if your carrier mock needs it |

Google SSO: the Google account **email must already exist** as an ACTIVE user (seed emails, not arbitrary Gmail). Authorized redirect URI: `{APP_URL}/api/auth/sso/google/callback`.

Stripe: **Pay with card** opens Stripe-hosted Checkout. After pay, `{APP_URL}/api/payments/stripe/complete?session_id=…` records the invoice using `STRIPE_SECRET_KEY`. Optional webhook: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook` then `STRIPE_WEBHOOK_SECRET`.

Jobs without a vendor: `npm run jobs` (due invoices, health refresh, learned co-purchase scores). `POST /api/jobs/run` needs `CRON_SECRET`.

---

## Not API keys, but do not confuse them

| Name | Meaning |
|---|---|
| `DEALFLOW_ADAPTER` | Only `development` for Krishna fixture harness |
| `DEALFLOW_DEV_IMPERSONATION` | `x-dev-actor` header; never in production |

---

## Seed logins (LIVE database)

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

Contoso tenancy admin (`admin@contoso.example` / `contoso-admin-2026!`) appears only after a **seed** that includes that company (seed wipes data).

---

## Browser ticks that do not need vendor keys

1. **Acme ₹50,000** — Arjun, quote for Acme, add Nexa ProBook Standard. Catalog hint + saved line unit price `50000.00`.
2. **6+3+1 split** — Farah, `/fulfillment` → order → **Recommended split · Preview** (Main 6, East 3, backorder 1). Accept to reserve.
3. **Receipt + consolidate** — Fulfillment **Stock** tab → Receive 1 laptop → open order → **Consolidate**.
4. **XLSX vs screen** — `/reports`, apply filters, read the table, **Export XLSX**. Same query string as `GET /api/reports`.
