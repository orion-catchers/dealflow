# DealFlow360 — Demo Walkthrough (Flow A & Flow B)

_Owner: Harsh. Status is **LIVE** when `DATABASE_URL` is set and `DEALFLOW_ADAPTER` is unset._

Seeded logins (Ruchir): `arjun@nexa.example` / `arjun-nexa-2026!` · `neha@acme.example` / `neha-acme-2026!` · `farah@nexa.example` / `farah-nexa-2026!` · `sana@nexa.example` / `sana-nexa-2026!`.

Demo numbers: Gold Acme, 10 laptops @ 50,000 (cost 40,000), 10 docks @ 3,000, 10 support @ 1,000/mo. Ceilings Gold 15 / Hardware 15 / Services 10. Stock: Main 6 laptops + 10 docks, East 3 laptops → 1 laptop backordered.

## Flow A — routine sale through payment (~2 min)

| # | Step | Owner | Expected | Status |
|---|---|---|---|---|
| 1 | Login as Arjun | Krishna/Ruchir | Sales home | LIVE |
| 2 | New quote → Acme | Krishna/Atharva | Gold, INR | LIVE |
| 3 | Add 10 laptops (12%) + 10 support (8%) | Atharva + Harsh catalog | 50,000 / 1,000 unit prices | LIVE |
| 4 | Optional dock recommendation | Krishna | Totals update; new revision | LIVE |
| 5 | Submit | Atharva | Within ceiling → NOT_REQUIRED / APPROVED | LIVE |
| 6 | Neha confirms current revision | Krishna/Atharva | One order; replay same requestKey | LIVE |
| 7 | Farah → **Fulfillment** (`/fulfillment`) | Harsh | LIVE list of orders (not the old workspace-only table) | LIVE |
| 8 | Open the order → **Recommended split · Preview** | Harsh | Main 6 laptops + docks; East 3 laptops; 1 backorder | LIVE |
| 9 | Accept split | Harsh | Reserved; PARTIAL | LIVE |
| 10 | Invoices | Ruchir | One-time + subscription records | LIVE |
| 11 | Record payment (or Stripe checkout if `STRIPE_SECRET_KEY` is set) | Ruchir | Balance updates; replay-safe | LIVE |

## Flow B — exception through finance

| # | Step | Status |
|---|---|---|
| Counter 18%/16% → manager then finance approve → Neha confirms **new** revision | LIVE |
| Receive 1 laptop on Fulfillment **Stock** → Consolidate on the order | LIVE |
| **Reports** (`/reports`) THIS_MONTH, team West, export XLSX — same rows as the screen | LIVE |

## Jobs / email / SSO (optional env)

- `npm run jobs` or `POST /api/jobs/run` with `Authorization: Bearer $CRON_SECRET` — due billing, health refresh, learned co-purchase scores.
- Password reset / quote sent / health nudge: log in dev; Resend or `MAIL_WEBHOOK_URL` when set.
- Google SSO: `/api/auth/sso/google` when Google client id/secret are set. User email must already exist and be ACTIVE.
