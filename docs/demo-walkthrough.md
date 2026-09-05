# DealFlow360 — Demo Walkthrough (Flow A & Flow B)

_Owner: Harsh (README demo scenarios, blueprint §4/§13). Each owner checks their steps.
Status column is updated as screens go LIVE; nothing here is a claim of completion._

Fixture accounts (Ruchir seeds; real authenticated sessions, not a role bypass):
`admin-dev` Dev · `rep-arjun` Arjun · `manager-sana` Sana · `finance-farah` Farah ·
`customer-neha` Neha (Acme) · second customer user at Beta for isolation checks.

Demo numbers: Gold Acme, 10 laptops @ 50,000 (cost 40,000), 10 docks @ 3,000 (cost 2,000),
10 support seats @ 1,000/mo (cost 400). Ceilings Gold 15 / Hardware 15 / Services 10.
Stock: Main 6 laptops + 10 docks, East 3 laptops → 1 laptop backordered.

## Flow A — routine sale through payment (~2 min)

| # | Step | Screen | Owner | Expected visible result | Status |
|---|---|---|---|---|---|
| 1 | Login as Arjun (rep) | 01 | Krishna/Ruchir | Redirect to Sales Home | NOT CONNECTED |
| 2 | New Quote → select Acme | 04 | Krishna/Atharva | Gold tier, INR, empty lines | NOT CONNECTED |
| 3 | Add 10 × ProBook 15 (12%), 10 × Support Seat (8%) | 04 | Atharva + Harsh catalog | Prices 50,000 / 1,000 resolved from Harsh's catalog; one-time 440,000; monthly 9,200 | catalog DEV FIXTURE |
| 4 | Accept dock recommendation (10 × 3,000, 12%) | 04 panel | Krishna | One-time becomes 466,400; margin updates | NOT CONNECTED |
| 5 | Submit | 04 | Atharva | Within policy → APPROVED / NOT_REQUIRED; send to portal | NOT CONNECTED |
| 6 | Login as Neha → confirm exact revision | 11 | Krishna/Atharva | Order `order-acme-…` created once; repeat click returns same order | NOT CONNECTED |
| 7 | Login as Farah → Fulfillment list | 07 | Harsh | Acme order PENDING, 20 stock-tracked units, support skipped | DEV FIXTURE |
| 8 | Open detail → preview split | 08 | Harsh | Main: 6 laptops + 10 docks; East: 3 laptops; 1 laptop backorder; 2 shipments, estimated cost shown | DEV FIXTURE |
| 9 | Accept Suggested Split | 08 | Harsh | Reservations committed once; status PARTIAL; backorder 1 | DEV FIXTURE |
| 10 | Billing detail | 10 | Ruchir | One-time invoice 466,400 and monthly subscription 9,200 separately, same order | NOT CONNECTED |
| 11 | Record payment on one-time invoice (partial) | 13 | Ruchir | Status PARTIALLY_PAID, balance updated; repeat = no double | NOT CONNECTED |

## Flow B — negotiated exception through billing/fulfillment (~3 min)

| # | Step | Screen | Owner | Expected visible result | Status |
|---|---|---|---|---|---|
| 1 | Login as Neha → open sent quote | 11 | Krishna | Own terms only; no cost/margin fields in network payload | NOT CONNECTED |
| 2 | Counter: hardware 18%, support 16% → Submit Request | 11 | Krishna → Atharva | Proposed revision; worst-line excess 6 → Manager then Finance | NOT CONNECTED |
| 3 | Login as Sana → approve with reason | 06 | Ruchir UI / Atharva | Chain advances to Finance; timeline entry | NOT CONNECTED |
| 4 | Login as Farah → approve with reason | 06 | Ruchir UI / Atharva | Revision APPROVED; one-time 434,600; monthly 8,400 | NOT CONNECTED |
| 5 | Neha confirms latest version | 11 | Krishna/Atharva | Order created; stale tab gets 409 | NOT CONNECTED |
| 6 | Farah → Fulfillment detail → Accept split | 08 | Harsh | 9 laptops allocated, 1 backordered | DEV FIXTURE |
| 7 | Receive 1 laptop at Main (receipt) | Warehouses | Harsh | Prompt: eligible backorder for Acme (coverable 1) | DEV FIXTURE |
| 8 | Consolidate Remaining Backorder | 08 | Harsh | New PLANNED shipment; backorder FULFILLED; earlier shipments untouched | DEV FIXTURE |
| 9 | Generate billing → +2 support seats mid-period | 10 | Ruchir | Proration 2 × 840 × 15/30 = 840 explained | NOT CONNECTED |
| 10 | Deal Health | 14 | Atharva | Delivery-risk / discount alert with exact quote link | NOT CONNECTED |
| 11 | Reports → THIS_MONTH, team North → export XLSX | 15 | Harsh | Aggregates from the same filtered rows as the export | DEV FIXTURE |

## Harsh-lane verification evidence (blueprint §14)

- Repeated-product allocation: two lines of the same variant aggregate before stock check; allocations keep both line IDs. _(vitest)_
- Competing orders: Acme + Beta accept concurrently → total reserved ≤ onHand; no oversell. _(vitest)_
- Preview writes nothing: stock identical before/after preview. _(vitest)_
- Override releases: re-plan moves units; reserved totals equal plan; shipped untouched. _(vitest)_
- Receipt/backorder: receipt → eligible list → consolidate → backorder FULFILLED. _(vitest)_
- Filtered report equals export: `rows.length` identical for run vs export. _(vitest)_

## Startup (until Ruchir publishes the runbook)

```powershell
npm install
npm run dev        # http://localhost:3000 → links to Harsh's screens
npm test           # engine + service checks
npm run typecheck
```

Pick a fixture actor with the yellow "DEV FIXTURE actor" bar on internal pages. This bar
is development-only and disappears when Ruchir's session auth is live.
