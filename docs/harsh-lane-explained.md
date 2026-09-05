# Harsh’s DealFlow360 guide (plain English + workflows)

This is a study sheet for **your** work. Imagine DealFlow360 as a laptop shop.

- **You** keep the price tags, the customer cards, the warehouses, and the monthly scoreboard.
- **Atharva** writes the quotation (discounts, “does the manager need to sign?”, turning a signed quote into an order).
- **Ruchir** does login, invoices, and subscriptions.
- **Krishna** does the look of the app and the customer portal screens.

Money is always written like **₹50,000.00** (two decimals). **12** means 12 percent, not 0.12.

---

## Big picture in 30 seconds

Arjun (sales) builds a quote for Acme. The quote builder asks **you**: “What does Acme pay for this laptop SKU?” You answer with a **unit price**, **unit cost**, and “is this a physical box?”

Neha (customer) accepts. Atharva creates an **order** and taps you: “Open a fulfillment folder.” You open it as **PENDING**. **No boxes are reserved yet.** That is on purpose: a quote is not a warehouse promise.

Farah (finance) later looks at a **Preview** split (“ship 6 from Main, 3 from East, 1 later”). Preview is a suggestion. When she **Accepts**, you **reserve** stock. Then she ships, delivers, receives new stock, and covers the leftover laptop.

Reports add up **numbers already saved on quotes**. They do not recalculate prices.

---

## Who does what (so you do not mix lanes)

| If someone asks… | You say… |
|---|---|
| Why is the quote total ₹466,400? | “I gave unit prices 50,000 and 3,000. Atharva applied line discounts and added the lines.” |
| Why did it need Finance approval? | “Atharva’s policy engine, not me.” |
| Why is the invoice unpaid? | “Ruchir’s billing.” |
| Why does the portal hide cost? | “Krishna’s portal allowlist.” |
| Why did we ship from two warehouses? | “My split preview + accept.” |

---

## House rules (with tiny stories)

**1. Looking is free.** Opening Preview does not change stock. Like checking Google Maps without booking a cab.

**2. Preview is not a promise.** Confirming a quote does not lock laptops. Only Accept / Override / Consolidate reserves.

**3. Double-click protection.** Each save sends a `requestKey` (a unique ticket). Same ticket twice = same result, no second reservation. New ticket = new try.

**4. Never delete a product.** Archive it. Old quotes still need the name “Nexa ProBook 14”.

**5. Customers only see themselves.** Neha cannot resolve Beta’s price list.

**6. Who can press which button**

| Job | Who |
|---|---|
| Browse catalog | Any staff; customer only for their company |
| Edit products / price lists | Admin |
| Edit customers | Admin or sales manager |
| See fulfillment | Any staff (not customer) |
| Accept split, receive stock, ship | Finance or Admin |
| Edit warehouses | Admin |
| Reports | Admin / manager / finance see all; a **sales rep only sees their own quotes**; customers cannot |

---

## Part 1 — Customers and catalog

### What you store

A **customer** is a company card: name, gold/silver/bronze **tier**, currency (demo is INR), which **rep** owns them, and optionally “use this **price list**”.

A **product** is a shelf label: list price, our cost, category (hardware / accessory / service), tax %, and “do we track boxes?”

A **variant** is a flavour: Standard vs 32GB RAM. It can add extra rupees to price and cost.

### How a unit price is born (three questions)

**Q1. Which price book?**  
If Acme has a price list attached and it is active → use it.  
Else → use the active book matching **tier + INR**.  
Else → error. You never invent a price.

**Q2. Which rule in that book?**  
Rules that apply to this product, and whose **minimum quantity** is empty or already reached.  
A rule for **this exact variant** beats a rule for the whole product.  
If two rules are equally specific, the one with the **higher minQty** wins (volume deal).

**Q3. What number?**

Start from the product’s list price.

- **Fixed price** on the rule → throw away the list price, use the fixed number.
- **% off** on the rule → `list × (1 − percent/100)`.
- Neither → keep the list price.

Then add the variant extra:

```
what the customer pays per unit  =  (that number)  +  variant extra price
what it costs us per unit        =  product cost   +  variant extra cost
```

Round to the nearest paise (two decimals).

The salesperson’s extra 12% off on the **quote line** is **not** this step. That is Atharva.

---

### Workflow A — “Arjun adds a laptop for Acme”

1. Arjun opens **New quotation**, picks customer **Acme Studio** (Gold, INR, Standard price list).
2. He searches catalog. Your search matches name / SKU / variant label. Archived products stay hidden.
3. He picks **Nexa ProBook 14**, variant **Standard**.
4. Builder calls **resolve price** with customer + product + variant + qty (often 1 at first).
5. You return: unit price **50,000.00**, unit cost **40,000.00**, tax 0%, **stock-tracked = yes**.
6. Arjun types quantity **10** and a line discount. **You do not change 50,000.** Atharva multiplies, discounts, and totals.

**Numbers to say out loud**

| Item | List / extra | Acme unit price | Our unit cost | Physical? |
|---|---|---|---|---|
| ProBook Standard | 50,000 + 0 | 50,000 | 40,000 | Yes |
| ProBook 32GB | 50,000 + 8,000 extra (or a 58,000 fixed variant rule) | 58,000 | 46,000 in seed | Yes |
| USB-C Dock | 3,000 | 3,000 | 2,000 | Yes |
| Support seat | 1,000 / month | 1,000 | 400 | **No** (service + subscription) |

Support never goes to a warehouse.

---

### Workflow B — “Volume break (minQty)”

Imagine a rule: “10 or more docks: 10% off the 3,000 list.”

- Quote for **3 docks** → rule does not apply → **3,000** each.
- Quote for **10 docks** → `3000 × (1 − 0.10) = 2,700` each, then add variant extra (0).

If there is also a **fixed** rule for 10+, **fixed wins** over percent (the code prefers `fixedPrice` when it is set).

---

### Workflow C — “Admin archives a mouse”

1. Admin opens **Catalog**, archives Wireless Mouse.
2. Product is inactive + timestamp. It disappears from the normal list.
3. Old quotes still show the name. You **cannot** resolve it for a **new** line.
4. Restore brings it back. There is no hard delete.

---

## Part 2 — Warehouses and fulfillment

Think of two shops: **Main** and **East**.

**Available to promise** (per shop, per SKU):

```
available  =  boxes on the shelf  −  boxes already promised
           =  onHand              −  reserved
```

Never let reserved go above onHand. **Reorder warning**: if available is below a threshold, the warehouse screen lights up. It does **not** auto-order from the vendor.

### The five buckets (one laptop can sit in only one)

Order is **10 laptops**. After a typical Accept:

| Bucket | Example | Meaning |
|---|---|---|
| Reserved | 9 | Promised, still in our building |
| Shipped | 0 | On a truck |
| Delivered | 0 | Customer has them |
| Backordered | 1 | We owe it; no box reserved yet |
| Unallocated | 0 | Not even planned |

They always add up to 10.

**Order status** (the badge on the list)

| Badge | Everyday meaning |
|---|---|
| PENDING | Folder open, nobody reserved yet |
| PARTIAL | Some reserved and/or some owed later |
| ALLOCATED | Every physical unit reserved, none shipped |
| SHIPPED | Something is on the road (or already delivered), not all delivered |
| DELIVERED | Every physical unit delivered, **or** the order was only services |
| CANCELLED | Stopped |

---

### Workflow D — Happy path (the demo you should be able to walk)

**Starting stock (seed)**

- Main: **6** laptops, **10** docks.
- East: **3** laptops, **0** docks.

**Order after Neha confirms:** 10 laptops + 10 docks + 10 support seats.

**Step 1 — Confirm (Atharva + you)**  
Fulfillment row appears **PENDING**. Reserved is still 0. Support is ignored.

**Step 2 — Farah opens the order (Preview)**  
The computer **pretends** to take stock on a scratch pad. Real reserved does **not** change.

It asks: “Can **one** warehouse cover **all** laptops **and** all docks?”  
Main has only 6 laptops → no. East has only 3 laptops and no docks → no.

Then it uses a simple greedy rule: pick the warehouse that can cover the **most leftover units**, then the next, and so on. Cheapest-looking **estimate**, not a real courier quote:

```
estimated shipping  =  flat fee per shipment  +  (per-kg fee × kilos)
```

**What Preview should show**

- Main: 6 laptops + 10 docks (Main had all 10 docks and 6 laptops).
- East: 3 laptops.
- **Backorder: 1 laptop** (6 + 3 = 9, need 10).
- Two planned shipments, two estimated costs added together.
- Support: skipped, with a note.

**Step 3 — Accept suggested split**  
Farah (Finance) clicks Accept. Now it is real:

- Main reserved += 6 laptops and 10 docks.
- East reserved += 3 laptops.
- One OPEN backorder for 1 laptop.
- Status **PARTIAL** (not everything reserved).
- If she double-clicks with the **same** request key, nothing is reserved twice.

**Step 4 — Ship Main’s pallet**  
Only a **PLANNED** shipment can ship. For each reserved line on that shipment:

```
onHand    down by those units   (boxes left the building)
reserved  down by those units   (no longer “promised on the shelf”)
```

Shipment becomes SHIPPED. Order badge often becomes **SHIPPED**.

**Step 5 — Deliver**  
Mark that shipment **DELIVERED**. Stock numbers do **not** change again. Those units move from “in transit” to “customer has them.”

---

### Workflow E — “We received one more laptop” (receipt + consolidate)

1. Farah still owes Acme **1** laptop (backorder).
2. Admin/Finance **receives 1 laptop at Main**. `onHand` at Main goes up by 1. Available goes up.
3. The screen **does not** auto-reserve. It only **suggests**: “Acme’s backorder can take 1.” Oldest unpaid physical debt first if several orders wait.
4. Farah clicks **Consolidate remaining backorder**.
5. You reserve that 1 at Main, make a **new** PLANNED shipment, and mark the backorder **FULFILLED**. Old shipments stay as they were. Invoices are not reopened.

---

### Workflow F — “Wrong warehouse — Override”

Farah already accepted, nothing has shipped yet. She wants **all 9 reserved laptops from East** instead (assume East magically had stock — in demo it does not; this is the **rule**, not the seed).

Override:

1. Give back **this order’s** unshipped reservations (so East is not double-counted).
2. Cancel this order’s open backorders for that remainder.
3. Commit the new plan. **Already shipped** pallets are left alone.

If the order was never allocated, she uses **Accept**, not Override.

---

### Workflow G — Cancel unshipped allocation

Farah cancels before trucks leave. Reserved for this order goes back to available. You do not invent a new split; she can Preview again later.

---

## Part 3 — Reports (the scoreboard)

Reports are a **calculator on saved quotes**, not a second pricing engine.

### Workflow H — “Farah runs This month, team West”

1. Open **Reports**, period **THIS_MONTH** (1st of this month until 1st of next, in **India time**).
2. Team **West**. Optional: only Arjun, only Hardware, only pending approval.
3. Dashboard totals and **Download PDF / Excel** use the **same** list of quotes. If the screen says 3 confirmed, the file says 3 confirmed.

**Does this quote count in the month?**  
Yes if it was **created** this month **or confirmed** this month. A quote opened in August and signed in September still shows in September.

**Sales rep Arjun** running reports: the filter is forced to Arjun. He cannot peek at Priya’s book.

### Fake numbers you can walk through on a whiteboard

Suppose the filter returns **4 quotes**:

| Quote | Stage | One-time | Monthly | Draft? |
|---|---|---|---|---|
| A | CONFIRMED | 466,400 | 9,200 | no |
| B | APPROVED | 100,000 | 0 | no |
| C | DRAFT | 50,000 | 0 | yes |
| D | CONFIRMED | 80,000 | 1,000 | no |

Then:

- Quote count = **4**
- Confirmed orders = **2** (A and D)
- Confirmed one-time revenue = 466,400 + 80,000 = **546,400.00**
- Confirmed monthly recurring = 9,200 + 1,000 = **10,200.00** (not multiplied by 12)
- Pipeline value = still-open quotes (draft + pending approval + approved + under negotiation) = B + C = **150,000**. Confirmed A and D are **won**, so they are out of pipeline. Rejected would be out too.

- Conversion rate = confirmed / (all quotes minus drafts) = 2 / (4 − 1) = **66.7%**  
  Draft C is left out of the denominator so scratch quotes do not tank the rate.

**Product filter trick:** filter “only Docks”. The **quote** still counts in revenue if it **contains** a dock line, using the **whole quote** total. The **by product** table only adds the **dock lines**, so laptops do not appear in that table.

**SUPERSEDED** approvals: the row can still list the quote; those statuses are **not** stuffed into pending/approved/rejected counts.

---

## Screens (where to click)

| URL | Everyday job |
|---|---|
| `/products` | Price tags, variants, archive |
| `/price-lists` | Who gets which book and rules |
| `/settings/customers` | Company cards |
| `/settings/warehouses` | Receive stock, on-hand, reorder flags |
| `/fulfillment` | Orders and the split |
| `/reports` | Scoreboard + export |

Live database when `DATABASE_URL` is set. `DEALFLOW_ADAPTER=development` is the old fake JSON shop — not the demo you showed on localhost with Postgres.

---

## Mentor answers (one breath each)

- **Customer price?** Their price book, then the most specific rule, then variant extra. Quote % off is Atharva.
- **Does confirm lock stock?** No. Folder PENDING. Lock on Accept.
- **Smartest possible split?** No. Prefer one warehouse if it can do everything; else “who covers the most units,” plus a shipping **estimate**.
- **Backorder?** We sold it, we did not have a free box; it stays on the order until consolidate or cancel.
- **PDF vs screen?** Same filtered quotes.

---

## Demo numbers to memorize

**Acme, Gold, INR.** 10 ProBooks @ **50,000**, 10 docks @ **3,000**, 10 support @ **1,000**/month.  
Shelf: Main **6** laptops + **10** docks, East **3** laptops → Preview **1** laptop backorder. Support never in the split.

---

## Where the code lives (if you must point)

| What | File |
|---|---|
| Price steps | `src/server/catalog/engine/resolve-price.ts` |
| Split + estimate | `src/server/inventory/engine/split.ts` |
| Accept / receipt / ship | `src/server/inventory/service.ts` |
| Report sums | `src/server/reports/engine/aggregate.ts` |
| Seed SKUs and stock | `src/fixtures/harsh.ts` |
