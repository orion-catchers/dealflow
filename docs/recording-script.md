# DealFlow360 — recording script

Shoot on **LIVE** only: `DATABASE_URL` set, `DEALFLOW_ADAPTER` **unset**, `npm run dev`, Postgres up. Use **incognito or one browser** and **Sign out** between roles. Login page **Demo fill** buttons: Rep / Manager / Finance / Customer.

**Target length:** 8–10 minutes (Part A) + 3 minutes (Part B, optional).  
**Do not film:** fixture mode, Stripe/Google 503, `.env`, passwords typed slowly (use Demo fill), code editors.

Gold Acme ceilings: hardware **15%**, services **10%**. Stay inside those for Part A. Blow through them for Part B.

| Role | Demo fill | Email |
| --- | --- | --- |
| Sales | **Rep** | `arjun@nexa.example` |
| Manager | **Manager** | `sana@nexa.example` |
| Finance | **Finance** | `farah@nexa.example` |
| Customer | **Customer** | `neha@acme.example` |

---

## Shot 0 — before you press record (30 s, off camera)

1. `docker start dealflow-postgres` then `npm run dev`.
2. Open `http://localhost:3000`. Confirm landing title **DealFlow360** is centered.
3. Decide: **new quote** (clean story) vs seeded Acme 10-laptop deal (shows Main 6 / East 3 / backorder 1). For a new quote, use **2 laptops** if stock is already reserved.
4. Zoom browser so the wordmark, totals, and Preview table are readable (125–150%).
5. Hide bookmarks. Full screen.

---

## Part A — happy path (record this)

### 1. Landing (15 s)

**Show:** `/` — centered italic title, “Every deal. Every detail. In sync.”, **Open your workspace**.

**Say:** “DealFlow360 is one app and one database for B2B quote-to-cash. Previews never commit. Stock is reserved only when finance allocates.”

**Click:** Open your workspace.

### 2. Sign in as sales (20 s)

**Show:** Login. Click **Rep** (Demo fill), then sign in. Land on `/home`.

**Say:** “Arjun is a Nexa sales rep. The workspace is live against Postgres.”

**Do not** linger on the password.

### 3. Start a quotation (40 s)

**Show:** **Quotations** → new quote → customer **Acme** (Gold). Point at **Gold** and the ceiling.

**Say:** “Acme is Gold. Policy uses this tier’s ceiling, not a hardcoded Gold.”

### 4. Build lines inside policy (50 s)

**Show:** Add hardware (laptop) qty **2** (or **10** if you want the classic split), discount **12%**. Add support seats, discount **8%**. Click **Save**. Point at list vs discount vs net, tax, total.

**Say:** “Twelve percent is under the hardware ceiling. Eight percent is under services. Totals are server-priced — the browser is not the ledger.”

If a recommendation card appears: add **one** dock, Save, say “Adding a recommendation creates a new revision.”

### 5. Submit / send (30 s)

**Show:** Approval chain empty or **not required**. Click **Submit for approval** if shown, then **Send to customer**. Point at “Shared in the customer portal.”

**Say:** “Within policy, manager and finance are not blocking. Sending shares this exact revision with the customer.”

### 6. Customer accepts (50 s)

**Show:** Sign out → **Customer** → portal. Open the quote. Point at **Ready for your acceptance**. Scroll **Current terms** (discount + net). Click **Accept [version]** → confirm **Accept these terms**.

**Say:** “Neha only sees her company. She accepts this revision — that is what creates the order. A preview never did.”

If you have 20 extra seconds: mention Rohan cannot open Acme’s quote (do not actually 404 on camera unless you prepared a second tab).

### 7. Finance — preview is not reserve (70 s)

**Show:** Sign out → **Finance**. Open **Fulfillment** → the new order.

**Show:** **Recommended split · Preview**. Point at the Preview label. Hover stock reserved **before** Accept (unchanged).

**Say:** “This split is Preview. It does not reserve stock.”

**Click:** Accept / allocate available stock. Point at reservations and status change.

**Say:** “Allocate is the first reservation. Confirm only opened the order.”

If you used 10 laptops on a fresh Main/East seed: call out Main **6**, East **3**, backorder **1**.

### 8. Ship and bill (40 s)

**Show:** Ship (then Deliver if it is one click). Open **Invoices**. Point at one-time total and any subscription. **Record payment** (books) — not Stripe unless keys are set.

**Say:** “Billing started at confirm. Payment is recorded in the books. Card checkout is optional.”

### 9. Close Part A (15 s)

**Show:** Home or the delivered order.

**Say:** “Quote, policy, customer acceptance, allocate, bill — one revision, one database.”

**Stop recording** or cut to Part B.

---

## Part B — exception path (optional, 3 min)

Use a **new** quote so Part A’s order stays clean.

### 10. Blow the ceiling (40 s)

**Rep** again. New Acme quote. Laptop discount **18%** (or 50% if you want a loud number). Save.

**Say:** “This discount is above the Gold hardware ceiling, so the engine requires manager, then finance. Neither role can skip the other.”

Point at the chain: **Sales manager** → **Finance**, status **PENDING**.

Submit.

### 11. Manager, then finance (50 s)

Sign out → **Manager** (Sana). Home / Approvals. Open the quote. Approve with a short reason.

**Say:** “Sana cannot be skipped. Farah cannot act while this step is open.”

Sign out → **Finance**. Approve.

### 12. Customer on the new revision (30 s)

**Customer**. Accept **only after** both approvals. Point at the version number.

**Say:** “Stale acceptance on an old revision is rejected. She must accept the current one.”

Cut.

---

## Optional 20-second inserts (cut in if time)

| Insert | Who | What to show | Line |
| --- | --- | --- | --- |
| Catalog | Admin `dev@nexa.example` | `/products` or price list | “List price comes from catalog, not the quote screen.” |
| Health | Finance or Admin | Deal Health → **Refresh** | “Flags are stored. Refresh re-reads saved quotes and orders.” |
| Reports | Finance | `/reports` → export XLSX | “Export is the same rows as this table.” |

Skip these if the mentor already saw Part A.

---

## What to say if something goes wrong on camera

| Happens | Line | Fix off-camera |
| --- | --- | --- |
| Login error / ECONNREFUSED | “Database isn’t up — we restart Postgres.” | `docker start dealflow-postgres` |
| Connection **DEV FIXTURE** | Stop. Do not continue. | Unset `DEALFLOW_ADAPTER` |
| Stripe / Google error | “That’s NOT CONNECTED without vendor keys. Core demo doesn’t need them.” | Keep recording books payment |
| Stale revision **409** | “Good — we reload and use the current version.” | Reload the quote |
| Stock too low to confirm | “Confirm is blocked until quantity fits availability. We still don’t reserve until Allocate.” | Lower qty or receive stock |

---

## Suggested timeline (10:00)

| Time | Shot |
| --- | --- |
| 0:00 | Landing |
| 0:15 | Arjun login + home |
| 0:40 | New Acme quote + Gold ceiling |
| 1:20 | Lines 12% / 8%, save, totals |
| 2:10 | Submit / send |
| 2:40 | Neha portal + accept |
| 3:40 | Farah Preview (no reserve) |
| 4:30 | Allocate + ship |
| 5:10 | Invoice + record payment |
| 5:40 | End card / Part B start |
| 6:00–9:00 | Exception + dual approval (if filming B) |

---

## End card (on-screen text, 5 s)

**DealFlow360** — quote to cash, one app, one database.  
Preview ≠ commit. Allocate reserves. Customer accepts the current revision.
