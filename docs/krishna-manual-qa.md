# DealFlow360 manual QA guide

This guide verifies the Krishna-owned frontend, recommendation service, customer negotiation service, and their development adapters on `krishna/shell-portal-recommendations`. A checked item is evidence from the local application only. It does not prove PostgreSQL, live authentication, or teammate service integration.

## 1. Setup

From the repository root:

```powershell
npm.cmd install
npm.cmd run dev:fixture
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The fixture launcher sets `DEALFLOW_ADAPTER=development`; production must use `DEALFLOW_ADAPTER=live` and a bound `ApplicationAdapter`.

The local fixture store is `.dealflow-development/store.json`. Successful actions survive page reloads and a server restart. On `/settings/customers`, an administrator can use **Reset development fixture** to restore the seeded scenario. Reset is development-only and deletes local fixture changes.

Development accounts all use password `DealFlow2026!`:

| Account | Role | Customer scope | Intended landing route |
|---|---|---|---|
| `admin@dealflow.test` | Admin | All workspace records | `/home` |
| `sales@dealflow.test` | Sales rep | Rep-owned records for Arjun Shah | `/home` |
| `manager@dealflow.test` | Sales manager | Workspace approval and policy review | `/home` |
| `finance@dealflow.test` | Finance operations | Billing, payment, warehouse actions | `/home` |
| `acme@dealflow.test` | Customer | Acme Studio only | `/portal` |
| `beta@dealflow.test` | Customer | Beta Industries only | `/portal` |

The customer master records are `customer-acme` / Acme Studio, `customer-beta` / Beta Industries, and `customer-north` / Northstar Labs. Seeded products are `laptop` Latitude Pro 14, `dock` Connect USB-C Dock, `mouse` Precision Mouse, `support` Business Care, `setup` Workspace Setup, and `monitor` Studio Display 27. Seeded physical variants use the `-standard` suffix; the additional laptop variant is `laptop-32gb` / `32 GB / 1 TB`.

## 2. Role matrix

| Capability | Admin | Sales rep | Sales manager | Finance ops | Customer |
|---|---:|---:|---:|---:|---:|
| Public landing, sign in, signup | Yes | Yes | Yes | Yes | Yes |
| Quotations and pipeline | All | Rep-owned | Read/review | Read | Own quotes through portal |
| Quote editing and recommendations | Yes | Yes | Read | Read | No internal editor |
| Approval decisions | Yes | Assigned only | Assigned manager step | Assigned finance step | Status only |
| Fulfillment and allocation | Read | Read | Read | Yes | Own order status |
| Billing, payment and subscriptions | Read | Read | Read | Yes | Own invoice/subscription view |
| Health and reports | Yes | Rep scope | Yes | Read | No |
| Catalog and price lists | Yes | Read | Read | Read | No |
| Customers, users, setup | Yes | Customer records hidden | Policy/health only | Plans/warehouses | No |
| Fixture reset | Yes, development only | No | No | No | No |

There is no public privileged-role selector. The workspace role comes from the verified session. The small `DEV FIXTURE` badge identifies the local adapter and must be replaced by a live connection status before production.

## 3. Route and screen inventory

For every row, verify the route loads through the persistent shell without a full-page loading screen between tabs. The intended role is the precondition for the row; where an authenticated role is not listed, start from the public page. Values and record IDs in the action column are the seeded values to use. The expected result covers both the visible state and the corresponding local fixture state; the final column is the negative/error check. The route may show only a local fixture status until the owning teammate service is bound.

| Screen | Route | Intended role | Manual action and expected result | Negative case |
|---|---|---|---|---|
| Login | `/login` | Public | Enter `admin@dealflow.test` and `DealFlow2026!`; choose **Sign in**; land on `/home` with `DEV FIXTURE`. | Wrong password shows an inline error and keeps the form usable. |
| Signup | `/signup` | Public | Enter a name, a new email, and an 8+ character password; choose **Request access**; see inactive-account confirmation. | A duplicate email or short password shows a recoverable validation error. |
| Sales home | `/home` | Staff | Select **New quotation**, metric links, a quotation, and a follow-up; each opens its target route. | Use a staff account with no visible scope and confirm the table empty state is meaningful. |
| Quotations / pipeline | `/quotes`, `/pipeline` | Staff | Filter by `SENT`, search `Studio expansion`, switch to Pipeline, and open `Q-1042`. | Search an unknown value and confirm the empty table state. |
| Quote builder/detail | `/quotes/new`, `/quotes/Q-1042` | Admin or sales rep | Create with customer `Acme Studio`, add Latitude Pro 14 and Business Care, set line discounts to `12` and `8`, save; server totals and revision change. | Try discount `101` or quantity `0`; the action is rejected and saved totals remain unchanged. |
| Approval list | `/approvals` | Admin, manager, assigned finance | Open `Q-1043` (`Hybrid workspace`); see pending sequence and current revision. | Sales rep cannot record a step assigned to another role. |
| Approval detail | `/approvals/Q-1043` | Assigned reviewer | Choose `approve`, enter `Reviewed against policy`, submit; the next chain state is shown. | Choose `reject` with a reason and confirm confirmation remains unavailable. |
| Fulfillment / stock list | `/fulfillment` | Staff, finance action | Open `O-1001`; review the `Warehouse availability · Preview` table. | Before explicit allocation, verify available and reserved values do not change. |
| Fulfillment detail | `/fulfillment/O-1001` | Staff, finance action | Choose **Allocate available stock**, confirm, then inspect allocation/backorder rows. | Cancel the dialog and confirm no reservation is written. |
| Subscriptions list | `/subscriptions` | Staff, finance action | Open `SUB-1001`; review current plan and use **Generate due invoices** as finance. | Repeat the due run and confirm the same billing period does not duplicate. |
| Billing detail | `/subscriptions/SUB-1001` | Staff, finance action | Inspect period, next invoice, cancellation policy and billing history. | A non-finance account sees view-only controls. |
| Customer portal | `/portal` | Customer | Sign in as `acme@dealflow.test`; see only Acme quotes, orders and invoices. | Try `beta@dealflow.test` after Acme; Acme records are unavailable. |
| Invoice list | `/invoices` | Staff | Filter `UNPAID`, open `INV-1001`, and download PDF from detail. | A sales rep cannot record a payment. |
| Invoice detail/payment | `/invoices/INV-1001` | Finance action | Enter amount `1000`, method `BANK_TRANSFER`, reference `QA-INV-1001`, today’s date; record and see payment history. | Amount greater than outstanding is rejected. |
| Deal health | `/health` | Staff | Choose **Refresh health checks**, open the `Q-1045` stalled flag, create an assigned follow-up. | An incomplete task form shows validation and does not create a task. |
| Reporting/export | `/reports` | Staff | Filter by `SENT`, choose **Download Excel** and **Download PDF**; fixture filenames identify development data. | Invalid or unavailable export format returns a visible error. |
| Product catalog | `/products`, `/products/laptop` | Admin/read-only staff | Search `Latitude Pro 14`, open it, and review Standard and `32 GB / 1 TB` variants. | A sales rep sees view-only controls. |
| Product/price-list editor | `/price-lists` | Admin | Search `Gold`, confirm `dock` has customer price `2800.00`; edit only through the dialog and reload. | A customer cannot reach the route and a non-admin cannot save. |
| Discount tiers/approval chains | `/policies` | Admin or manager | Review Gold `15`, Silver `10`, Bronze `5`, Hardware `15`, Services `10`; save a valid threshold and inspect the policy result. | Set a negative or over-100 value and confirm browser/server validation. |
| User and role administration | `/settings/users` | Admin | Review the seeded users; confirm signup does not assign a privileged role. | Sales rep is redirected to an access error when opening setup. |
| Customer setup | `/settings/customers` | Admin | Search `Acme Studio`; inspect owner `Arjun Shah` and currency `INR`. | A customer session cannot enumerate this table. |
| Warehouse and replenishment | `/settings/warehouses` | Admin or finance | Review Main warehouse and East depot, receive stock for `laptop-standard`, and change a threshold. | Cancel receive-stock dialog; on-hand must not change. |
| Subscription policies | `/settings/plans` | Admin or finance | Review Business Care Monthly and Priority Care Monthly, including cancellation policies. | A sales rep sees the records without mutation controls. |
| Recommendation rules | `/settings/recommendations` | Admin or manager | Review `rule-dock`, `rule-mouse`, `rule-care`, and fallback `rule-fallback`; edit minimum margin or add a rule. | Inactive or missing candidates never appear in a quote recommendation list. |
| Health settings | `/settings/health` | Admin or manager | Review stalled `5` days, anomaly `10` points, and history `3`; save a valid setting. | Finance cannot edit health thresholds. |

## 4. Complete quote journey

Use **Reset development fixture** before this journey when repeatability matters.

- [ ] Sign in as `admin@dealflow.test` / `DealFlow2026!`; confirm `/home` and the `DEV FIXTURE` status.
- [ ] Open `/quotes/new`; choose `Acme Studio` and name the deal `Studio expansion`.
- [ ] Open the created quote; add product `Latitude Pro 14`, variant `Standard`, quantity `10`.
- [ ] Add product `Business Care`, variant `Standard`, quantity `10`.
- [ ] Set line discounts to `12%` for Latitude Pro 14 and `8%` for Business Care. Keep order discount at `0%`.
- [ ] Save changes. Confirm the displayed totals come from the returned revision and show separate one-time and monthly totals.
- [ ] Open **Recommended additions**. Confirm `Connect USB-C Dock` is ranked by the seeded team-essential promotion and that the card shows its period-specific profit and margin impact.
- [ ] Choose **Add suggestion** for the dock. Confirm the request uses the current revision, the quote revision advances, the dock appears as a line, and totals refresh.
- [ ] Choose **Dismiss** for another qualifying item and confirm it disappears only from the current recommendation view. Use **Restore dismissed suggestions** to bring it back.
- [ ] Change a discount to `18%` and save. Confirm the policy evaluation becomes pending and the approval chain identifies the next role.
- [ ] Submit for approval. Open `/approvals/Q-1043` or the newly changed quote’s approval detail and review the exact revision.
- [ ] As the assigned manager, approve with a non-empty reason. If Finance is required, sign in as `finance@dealflow.test` and complete the finance step.
- [ ] Send the approved current quote to the customer. Confirm the customer-facing state is sent, while warehouse and billing sections remain Preview.
- [ ] Sign in as `acme@dealflow.test`; open the quote from `/portal`; verify the portal has no cost, profit, margin, internal note, policy reason, or other customer data.
- [ ] Submit a line comment or counter-discount proposal. Confirm the proposal is a new revision, history remains visible, and acceptance is disabled while approval is pending.
- [ ] As staff, review the proposal and complete the required approval sequence. A requested delivery date remains a request until review; it does not become a promise by itself.
- [ ] As Acme, accept the exact current approved revision once. Confirm the result points to the created order.
- [ ] Retry confirmation with the same request key. Confirm the same committed result is replayed and no second order appears.
- [ ] Sign in as finance; open the fulfillment detail, review Preview values, then explicitly allocate stock. Confirm reservations change only after allocation.
- [ ] Open the related invoice and subscription. Record a payment against `INV-1001` with reference `QA-INV-1001`, then confirm the balance and payment history update.

## 5. Engine 4 recommendation cases

The browser calls `/api/recommendations/:quoteId` and `/api/recommendations/:quoteId/add`. The ranking service consumes the current quote snapshot and candidate pricing result; it does not calculate a replacement quote total.

- [ ] On a quote containing Latitude Pro 14, verify the dock, mouse, support, and fallback rules are evaluated from live fixture inputs and are ranked deterministically.
- [ ] Add the dock and reload. Verify it is absent from recommendations because it is already in the quote.
- [ ] Add the dock twice with the same request key. Verify the second response replays the first mutation and does not duplicate the line.
- [ ] Edit a rule’s minimum margin above the candidate margin. Verify the candidate disappears, including when it is the fallback candidate.
- [ ] Deactivate a rule. Verify it is excluded without changing the quote.
- [ ] Create a quote where all candidate margins fail. Verify `No qualifying suggestions.` is rendered and no fixed fallback appears.
- [ ] Change customer from Gold Acme Studio to Silver Beta Industries and reload recommendations. Verify customer price resolution and qualification can change the result.
- [ ] Dismiss a suggestion, reload the page, and confirm the documented local dismiss behavior. A dismiss does not claim a server business mutation.
- [ ] Force a stale expected revision by opening two tabs, adding a line in one, then adding a recommendation from the old tab. Verify the mutation returns a conflict and saved totals remain coherent.
- [ ] Inspect the portal network response for a customer quote. Confirm recommendation score, candidate cost, candidate margin, and internal rationale fields are absent.

## 6. Engine 6 negotiation and orchestration cases

The browser calls `/api/portal`, `/api/portal/quotes/:quoteId`, `/api/portal/quotes/:quoteId/proposals`, and `/api/portal/quotes/:quoteId/confirm`. The server obtains the actor from the session cookie and does not trust a browser-supplied role or customer ID.

- [ ] Sign in as Acme and load `/api/portal`; verify only `customer-acme` records are returned.
- [ ] Change the URL to `/portal/quotes/Q-1044` while signed in as Acme. Verify an unavailable/not-found response when the record is outside the customer scope.
- [ ] Sign in as Beta and repeat the Acme quote request. Verify the same isolation result.
- [ ] Submit a comment with no numeric changes. Verify a message is recorded without a delivery promise or silent quote acceptance.
- [ ] Submit `discountPct: 25` for a line and `expectedRevision: r1`; verify a new revision and pending policy evaluation are returned.
- [ ] Submit a quantity below `0.01`, discount above `100`, an unknown line ID, or malformed date. Verify a `422` validation response and no revision change.
- [ ] Submit a delivery date request. Verify `requestedDate` and `dateReviewPending` are visible while `promisedDate` remains unchanged.
- [ ] Attempt confirmation while approval is pending or date review is pending. Verify a server-side `409`/policy error and no order.
- [ ] Open two browser tabs, submit a proposal in one, then submit the old revision in the other. Verify `409 STALE_REVISION` and preserved history.
- [ ] Retry a proposal with the same request key and identical payload. Verify one proposal/message result is replayed. Change the payload while keeping that key and verify `409 KEY_REUSE`.
- [ ] Confirm the same approved revision twice with the same request key. Verify one order result. A new request key is a separate operation and must still be checked by the canonical service.
- [ ] After confirmation, verify the portal quote is locked and numeric edits are unavailable.
- [ ] Inspect every portal response and confirm no `unitCost`, `profit`, `marginPct`, `worstExcess`, approval reasons, internal notes, rep IDs, or unrelated customer IDs occur.
- [ ] Reload `/portal` repeatedly and confirm reads do not change quote stage, revision, approval state, or order count.

## 7. API checks

Use browser DevTools or a request client with the session cookie. Responses use `{ data, mode }` for success and `{ error: { code, message, details } }` for failures. Money is a two-decimal decimal string, percentages are `0..100`, dates are ISO calendar dates, and mutations include an actor-scoped request key plus `expectedRevision` where applicable.

| Method and route | Payload or query | Expected success | Expected error |
|---|---|---|---|
| `POST /api/auth/login` | `{ "email":"admin@dealflow.test", "password":"DealFlow2026!" }` | `200`, verified actor, httpOnly `dealflow-session`, `mode: DEV FIXTURE` | `401 INVALID_CREDENTIALS` |
| `GET /api/auth/me` | None | Verified actor only | `401 UNAUTHENTICATED` |
| `POST /api/auth/signup` | `{ "name":"QA User", "email":"qa-user@dealflow.test", "password":"DealFlow2026!" }` | Inactive access request | Duplicate or short password error |
| `GET /api/workspace` | None | Role-scoped `DataState` | Customer actor gets `403` |
| `GET /api/recommendations/Q-1042` | None | Ranked dynamic items and current revision | `404` missing quote, `403` unauthorized |
| `POST /api/recommendations/Q-1042/add` | `{ "expectedRevision":"r1", "requestKey":"qa-add-1", "productId":"dock", "variantId":"dock-standard" }` | Canonical quote mutation result | `409 STALE_REVISION` or duplicate-line validation |
| `GET /api/portal` | None | Safe customer quotes/orders/invoices | `401` or customer-scoped empty result |
| `GET /api/portal/quotes/Q-1042` | None | Safe current quote plus history | `404` outside customer scope |
| `POST /api/portal/quotes/Q-1042/proposals` | `{ "expectedRevision":"r1", "requestKey":"qa-proposal-1", "lineChanges":[{ "lineId":"<current-line-id>", "discountPct":18, "comment":"Please review" }] }` | Proposal, message, new revision where financial terms change | `422` invalid line/discount/date; `409` stale or key reuse |
| `POST /api/portal/quotes/Q-1042/confirm` | `{ "expectedRevision":"r2", "requestKey":"qa-confirm-1" }` | Same-revision accepted/committed result | `409` pending approval, stale revision, locked quote, or replay/key error |
| `GET /api/fulfillment/O-1001/preview` | None | Allocations/backorders/cost preview | No reservation side effect; `403` unauthorized |
| `POST /api/actions` | `{ "action":"allocate", "id":"O-1001", "requestKey":"qa-allocate-1" }` | Explicit allocation result | `403` for non-finance, stock conflict |
| `GET /api/export?format=xlsx&stage=SENT` | Filters | Download with `fixture-` filename | Unsupported format/unauthorized error |

## 8. Access, keyboard, retry and responsive checks

- [ ] As a customer, request `/api/workspace`, `/api/settings/customers`, and another customer’s portal quote. Each is rejected or scope-filtered.
- [ ] As a sales rep, open `/settings/customers` and `/settings/users`; confirm role-appropriate access and view-only or forbidden behavior.
- [ ] Use `Tab` from the landing page. Focus is visible on the wordmark, navigation links, CTA, and login controls.
- [ ] On a workspace route, use `Tab` to reach the sidebar collapse button, navigation links, primary action, fields, dialogs and table region. No important action is icon-only without an accessible label.
- [ ] Activate **Collapse sidebar** with keyboard Enter or Space. Verify `aria-expanded="false"`, icon labels remain available through accessible names/title, and the main content expands.
- [ ] Expand again and reload. Verify the local preference is retained. On narrow view, use the menu button and verify `aria-expanded` and focusable navigation.
- [ ] Trigger a failed save or stale revision. Verify the affected error is inline, a retry/reload action is offered, and no totals or statuses are falsely changed.
- [ ] At approximately `1440px` and `1280px`, verify the tables remain readable and wide data scrolls inside the table region.
- [ ] At approximately `768px`, verify headings, actions, filters and two-column sections reflow without clipped controls.
- [ ] At approximately `390px` wide, verify landing/login content, sidebar menu, forms, tables and customer portal remain usable with no horizontal page overflow.
- [ ] Switch between `/home`, `/quotes`, `/approvals`, `/fulfillment`, `/invoices`, `/health`, and `/reports`; confirm the shell remains mounted and only affected content changes. No full-page `Loading your workspace` appears between tabs.

## 9. Visual acceptance checks

- [ ] Landing and login use one continuous marble workspace background with quiet left-side negative space and softly visible desk objects at right.
- [ ] Landing and login contain no split panel, vertical divider, large opaque white panel, duplicated marketing panel, baked-in text, or symbolic logo.
- [ ] Login content is left-aligned and blended into the unchanged `bg-image.png`; there is no boxed white form surface.
- [ ] Landing fits at 100% zoom with Configure / Agree / Deliver visible in the first viewport and no page scroll.
- [ ] The landing navigation sits left of the right-side foliage and remains readable.
- [ ] Landing and login headers have no white bar, filled rectangle, border, or shadow. Navigation text sits in the quiet area of the original photo; primary CTA buttons remain teal.
- [ ] At desktop width, the circle and text in each Configure / Agree / Deliver step have an 18px gap. At mobile width, the icon sits above its text with 10px clearance; no icon stretches or overlaps copy.
- [ ] Branding is the plain text wordmark `DealFlow360` with the restrained teal `360` accent.
- [ ] Headline, supporting copy, CTA and Configure / Agree / Deliver journey are balanced in the first viewport.
- [ ] Internal pages use a cool stone canvas and layered solid surfaces. Dense tables never sit directly on the marble photograph.
- [ ] Collapsed sidebar shows only the module icons and initials avatar; the collapse control and sign-out control are icon-only/hidden as specified. Expanded sidebar restores account details and sign-out.
- [ ] Wide tables, pipeline, tabs and dialogs use the rounded custom scrollbar treatment without page-level horizontal overflow.
- [ ] **New quotation**, **Reply to customer**, policy edits and every other dialog open centrally with a blurred backdrop, regardless of trigger position.
- [ ] One-time and recurring totals are separately labelled, amounts use consistent decimal alignment, and status badges explain the next action.
- [ ] Primary actions are obvious, secondary actions are quiet, disabled actions explain their state, and no emoji or unexplained decorative glyph is present.
- [ ] Customer portal is simpler than the staff workspace and contains customer-safe data only.
- [ ] Browser console contains no hydration, React, or route errors during the route inventory. Network requests contain no unexpected `5xx` responses.

## Public navigation interaction checks

These checks are pending browser execution for the latest public-header change; typecheck/build do not verify layout or pointer/keyboard behavior.

- [ ] Open `/`. Click **Product**: an unboxed panel on the photograph explains quotations/recommendations, approvals/negotiation, and fulfillment/billing. The hero temporarily hides so the two sets of text cannot overlap.
- [ ] Click **How it works** while Product is open: only the three-step process panel is visible. It explains exact-revision acceptance and the preview commitment rule.
- [ ] Click **Access**: staff and customer account information appears, with **Sign in with your account** linking to `/login` and **Request an account** linking to `/signup`. There is no public privileged-role selector.
- [ ] **Sign in**, **Get started**, and each panel's workspace link navigate to `/login`; **Back to home** from login returns to `/`.
- [ ] Close a panel by clicking its trigger again, **Close**, or outside the header. The landing hero returns without page scrolling. **Escape** closes it and restores focus to its trigger.
- [ ] Use Tab, Enter, and Space to open the three panels and follow their links. Triggers expose `aria-expanded`. Content hidden behind an open panel is inert and cannot receive focus.
- [ ] At widths at or below 1100px, use **Menu** to reach Product, How it works, Access, and Get started. Panel content remains transparent; overflow is confined to the navigation area on short screens. Sign in is also available beside Menu.
- [ ] At about 1440px, 1280px, 768px, and 390px, check that the photo remains visible through the panels and that no opaque card appears. The blur behind an open panel has soft edges.

## DEV FIXTURE LIMITATIONS

The following local adapters are deliberate and must be replaced before production:

- `src/development/store.ts`: single-process JSON persistence, local sessions, and idempotency records. Replace with Ruchir’s PostgreSQL/Prisma and session transaction layer.
- `src/development/seed.ts`: development accounts and business records. Remove seeded credentials and inactive signup behavior from production.
- `src/development/pricing.ts`: decimal fixture pricing and simplified policy evaluation. Replace with Atharva’s canonical customer-price, revision, discount and approval evaluator.
- `src/development/adapter.ts` canonical port: local add-line, revise and confirm simulation. Replace with Atharva’s transactional quote/revision/approval/order service.
- `src/development/adapter.ts` fulfillment preview and allocation: deterministic local stock heuristic. Replace with Harsh’s locking, reservation, backorder and fulfillment service.
- `src/development/adapter.ts` billing, subscriptions and payments: local invoice/period/payment simulation. Replace with Ruchir’s billing and payment transaction.
- `src/development/adapter.ts` health/reporting: local anomaly and export data. Replace with Atharva’s deal-health service and Harsh’s filtered reporting/export service.
- `DEALFLOW_ADAPTER=development` and the development reset action: keep unavailable in production; live startup must fail with `INTEGRATION_REQUIRED` when a required adapter is missing.

Successful fixture QA demonstrates local frontend behavior and Krishna service logic. It does not demonstrate live authentication, database durability under concurrency, canonical approval correctness, duplicate order guarantees, actual stock reservation, invoice creation, subscription activation, or production reporting.
