# DealFlow360 full-cycle audit

**When:** 6 Sep 2026 (re-run after fixes)  
**How:** Live Postgres (`mode: LIVE`) via HTTP APIs and page GETs against `npm run dev`. Probe: `node scripts/full-cycle-check.mjs`. Unit tests: permissions, catalog, billing, quotes.

Legend: **WORKS** · **VENDOR 503 (expected)**

---

## Verdict

The six engines are connected on the happy path, **including Remove → re-add without duplicate lines**. Catalog, approvals, invoices, subscriptions, users, and warehouses now mount their real feature screens inside the SPA shell. Shared `df-*` dialogs (Escape + backdrop) apply to fulfillment/reports/catalog modals via `dev-adapter/ui`.

Stripe, Google SSO, and live carrier quotes still 503 without vendor keys (by design).

---

## Six engines

| Engine | Status |
|---|---|
| **E1 Governance** | **WORKS** — submit/send/confirm; **Remove line persists**; re-add is a single line; confirm replay uses the same request key for the same quote. |
| **E2 Fulfillment** | **WORKS** — preview → accept ALLOCATED → ship → deliver. |
| **E3 Billing** | **WORKS** — confirm initializes billing; due run; bank payment. Stripe **VENDOR 503**. |
| **E4 Recommendations** | **WORKS** — rank + add suggestion. |
| **E5 Health** | **WORKS** — refresh; follow-up `POST /api/health/actions` is staff (same as `/api/actions` task). Dashboard GET is staff. |
| **E6 Negotiation** | **WORKS** — portal confirm, isolation, no cost/margin leak. |

---

## Fixes applied (this pass)

1. **Quote Remove / duplicates** — After persist, line ids are hydrated from Postgres and the command returns the reloaded quote, so Remove matches the current revision.
2. **Confirm replay** — Same `requestKey` on the same quote replays; no longer compared against mismatched customer id formats.
3. **Health / dashboard / invoices / approvals GET** — Staff can read lists and create health follow-ups; reps still cannot POST approvals or mutate catalog.
4. **Catalog search** — `customerId` optional for staff (Gold/list-price customer used).
5. **SPA mounts unused screens** — `/products`, `/price-lists`, `/customers`, `/users`, `/warehouses`, `/approvals`, `/invoices`, `/subscriptions` render the feature UIs (not Setup/Operations stubs).
6. **UI kit** — `dev-adapter` PageHeader/table/Dialog use `df-*` tokens; Escape and backdrop close; links inherit teal.

---

## Probe result (post-fix)

Remove → empty lines → re-add **1 laptop line** → support → recommend → submit APPROVED → send → portal confirm → allocate → ship → deliver.

Unit tests: **46 passed** (permissions, catalog, billing, quotes).
