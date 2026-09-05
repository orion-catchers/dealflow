# DealFlow360 checklist — living tracker

Updated 2026-09-06 (Asia/Kolkata). Branch: **`main`** (local work may be ahead of origin).  
`[x]` = in the repo. Optional vendors still need **your** API keys to leave 503.

---

## Whole product

### Done

- [x] One app, Postgres, Prisma, Docker, seed
- [x] Session auth, roles, signup pending, lockout, password-reset token
- [x] Quotes, policy, approvals, confirm → order
- [x] Confirm initializes billing + fulfillment header; **does not reserve**; **blocks** if tracked qty > available
- [x] Catalog / customers / price lists / warehouses / stock / fulfillment REST (Prisma)
- [x] Reports + PDF/XLSX same rows
- [x] Billing invoices, payments, subscriptions, credits, due-run API
- [x] Recommendations rank + add
- [x] Portal confirm / proposals (customer-scoped)
- [x] Staff shell; live `/api/workspace` when `DATABASE_URL` is set
- [x] Dual `/api/actions` path: live adapter when DB is set (fixture only if `DEALFLOW_ADAPTER=development`)
- [x] Portal fixture switch: **only** when `DEALFLOW_ADAPTER=development` (intentional)
- [x] Email adapter: Resend or `MAIL_WEBHOOK_URL`; otherwise **log in non-production**; wired to reset, quote send, health nudge
- [x] Stripe PaymentIntent checkout + webhook (503 without `STRIPE_SECRET_KEY`); DB `recordPayment` still the default
- [x] Cron: `npm run jobs` and `POST /api/jobs/run` (`CRON_SECRET`) — due billing, health refresh, learn rec scores
- [x] Google SSO routes (`/api/auth/sso/google`) — 503 without Google env; login email must already exist
- [x] FX: `GET /api/fx` + `DEALFLOW_FX_JSON` (default INR/USD/EUR to INR)
- [x] Courier rate card: per-kg add-on by warehouse code on **live** Prisma warehouses
- [x] Learned co-purchase: job updates existing `RecommendationRule.copurchaseScore` from confirmed quotes
- [x] TaxRate table + product FK; quote/billing still snapshot `taxPct`
- [x] Multi-company: `Company` on users, customers, products, warehouses; workspace scoped
- [x] Item-item lift trainer upserts recommendation rules (`npm run jobs`)
- [x] Live carrier HTTP `GET /api/carrier/quote` (`CARRIER_QUOTE_URL`); 503 without it
- [x] Confirm-time stock cap: cannot confirm more than available; still no reserve until Allocate
- [x] Integrations status: `GET /api/integrations/status` (staff) and `GET /api/integrations/public` (login Google link)
- [x] Invoice Stripe checkout wired in staff invoice screen + dedicated invoice page
- [x] Reports display-currency Preview via `GET /api/fx`; canonical `/api/reports/export` linked from workspace reports
- [x] Admin Setup shows connected-service flags
- [x] `docs/demo-walkthrough.md` marked LIVE
- [x] Staff shell mounts Harsh fulfillment + reports (not App Router pages that `layout` never rendered)
- [x] `docs/env-keys.md` — required DB/session vs optional vendor keys; no deploy required
- [x] `docs/detailed-project-understanding.md` — stack, workflows, vendor key-gated paths
- [x] Stripe hosted Checkout + return-URL payment record; signed webhook optional
- [x] Google SSO `state` cookie; email/Resend/jobs/carrier already key-gated

### Remaining / out of scope as full products

- [ ] **Hosted keys:** set Resend/Stripe/Google/`CRON_SECRET`/`CARRIER_QUOTE_URL` in `.env` if you want those paths off 503
- [ ] **Browser recording** of Flow A + Flow B (code is LIVE; record it in your demo)
- [ ] Push this local batch to `origin/main` if the team should have it

---

## Harsh lane

- [x] Catalog resolve, archive, Prisma live
- [x] Engine 2 preview / accept / override / receipt / consolidate / ship / deliver
- [x] Reports engine + export
- [x] `docs/harsh-lane-explained.md`
- [x] Your own browser ticks (UI wired, no vendor keys): Acme 50,000 catalog hint, `/fulfillment` 6+3+1 Preview, receipt + consolidate, `/reports` XLSX vs same on-screen rows

---

## Shell UX (this machine)

- [x] No post-login “Loading business records…”
- [x] No “Sales operations / home” crumb
- [x] Persistent shell + sessionStorage so refresh does not flash the loading page

---

## How to turn on optional vendors

```
APP_URL=http://localhost:3000
RESEND_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CRON_SECRET=...
CARRIER_QUOTE_URL=...
CARRIER_API_KEY=...
```

Then: `npm run jobs` on a schedule (Windows Task Scheduler / cron).

**Honest line:** Core Nexa demo is LIVE without Stripe/Resend/Google. Those adapters wait for keys listed in [docs/env-keys.md](env-keys.md). Do not deploy until you want a public host.
