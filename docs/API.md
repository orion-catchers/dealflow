# DealFlow360 HTTP API

_Audience: reviewers, integrators, coding agents. Source of truth for behavior is the Route Handlers under `src/app/api/`, not this file. If they disagree, trust the code._

## Conventions

| Topic | Rule |
|---|---|
| Base | Same origin as the app (`http://localhost:3000` in local). Paths start with `/api`. |
| Auth | Cookie `dealflow_session` (httpOnly). Some handlers also accept `dealflow-session`. Header `x-dev-actor` is **fixture-only**. |
| Success | JSON `{ "data": ..., "mode": "LIVE" \| "DEV FIXTURE" }` on catch-all and many lane routes. Some lane routes use `{ data }` via `src/lib/api/respond.ts`. |
| Error | `{ "error": { "code": string, "message": string, "details"?: unknown } }` |
| Mutations | POST/PATCH/PUT/DELETE require Origin/Referer policy (`src/server/origin.ts`, `src/middleware.ts`). |
| Money | Decimal **strings** (e.g. `"129900.00"`). Never IEEE floats. |
| Percent | `0`–`100`. |
| Idempotency | Fields named `requestKey` / `key` on money and stock writes. |
| Revisions | Quote/portal writes carry `expectedRevision`. |

## HTTP status and error codes

| HTTP | Typical `error.code` | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not JSON |
| 401 | `UNAUTHENTICATED` | Missing/invalid session |
| 403 | `FORBIDDEN`, `ORIGIN` | Role or CSRF origin |
| 404 | `NOT_FOUND` | Unknown id or cross-tenant hide |
| 409 | `STALE_REVISION`, `KEY_REUSE`, `CONFLICT` | Optimistic lock or idempotency clash |
| 422 | Validation / Prisma constraint | Bad payload or invariant |
| 503 | `INTEGRATION_REQUIRED` | No live DB and fixture not enabled |

Portal cross-customer access must be **404**, not 403 (do not leak existence).

## CSRF / Origin

Middleware matcher: `/api/:path*`.

Rejected when:

- `Sec-Fetch-Site: cross-site`
- `Origin` present and not same-origin as the request URL
- Production POST without Origin **and** without Referer

Allowed: same-origin browsers, same-origin `Origin` header, missing Origin in **development** (curl/scripts).

## Two surfaces

### A. Workspace catch-all — `src/app/api/[...path]/route.ts`

Used by `src/components/application/Application.tsx`. Dedicated files such as `src/app/api/auth/login/route.ts` **win** over the catch-all for the same path.

| Method | Path | Auth | Body / query | Notes |
|---|---|---|---|---|
| POST | `/api/auth/login` | Public | `{ email, password }` | Sets cookies; `{ data: { actor } }` |
| POST | `/api/auth/signup` | Public | `{ name, email, password }` | Pending account |
| GET | `/api/auth/me` | Cookie | | `{ data: { actor } }` |
| POST | `/api/auth/logout` | Cookie | | Clears cookies |
| GET | `/api/workspace` | Staff | | Role-scoped snapshot |
| POST | `/api/actions` | Staff | `{ action, ... }` | Command bus (see below) |
| GET | `/api/portal` | Customer | | Allowlisted snapshot |
| GET | `/api/portal/quotes/:id` | Customer | | 404 if not owned |
| GET | `/api/portal/orders/:id` | Customer | | |
| GET | `/api/portal/invoices/:id` | Customer | | |
| POST | `/api/portal/quotes/:id/proposals` | Customer | proposal body + revision | New revision or date review |
| POST | `/api/portal/quotes/:id/confirm` | Customer | `{ expectedRevision, requestKey }` | Creates order if allowed |
| GET | `/api/recommendations/:quoteId` | Staff | | Ranked suggestions |
| POST | `/api/recommendations/:quoteId/add` | Staff | `{ productId, variantId, expectedRevision }` | Adds line |
| POST | `/api/recommendations/rules` | Admin/manager (server) | `{ rules }` | Replace rules |
| GET | `/api/export` | Staff | `format`, filters | xlsx/pdf |
| GET | `/api/fulfillment/:orderId/preview` | Staff | | Read-only; no reservation |

Customers hitting staff-only catch-all paths receive **403** `Staff access required`.

#### `POST /api/actions` `action` values (live)

Implemented in `src/server/live/commands.ts`. Unknown actions 404/422. Live `reset` is **403**.

| action | Typical roles | Side effects |
|---|---|---|
| `newQuote` | Rep, Admin | Creates quote + revision |
| `addLine` | Rep, Admin | New revision; canonical price |
| `saveQuote` | Rep, Admin | Reprice + persist |
| `submitQuote` | Rep, Admin | Evaluation / send into approval |
| `sendQuote` | Rep, Admin | Customer-visible |
| `decision` | Manager, Finance, Admin | Approval step |
| `reply` | Staff | Portal thread |
| `reviewDate` | Staff | Clears or handles date review |
| `allocate` | Finance, Admin | Reservations |
| `ship` | Finance, Admin | Shipment + on-hand |
| `deliver` | Finance, Admin | Delivery complete |
| `cancelOrder` | Finance, Admin | Cancel path |
| `stockReceipt` | Finance, Admin | Increases on-hand; `requestKey` |
| `stockThreshold` | Finance, Admin | Warehouse/variant threshold |
| `saveRecord` | Admin | Catalog/customer/warehouse writes |
| `variant` | Admin | Variant mutate |
| `policy` | Manager, Admin | Policy version |
| `healthSettings` | Manager, Admin | |
| `refreshHealth` | Staff (gated) | Flags/tasks |
| `task` | Staff | Task status |
| `payment` | Finance, Admin | Apply payment |
| `runBilling` | Finance, Admin | Due invoices |
| `subscription` | Finance, Admin | Change/cancel |

### B. Lane REST — `src/app/api/**/route.ts`

Auth via `getActor` / session (Ruchir). Role checks inside each service.

| Prefix | Methods (typical) | Owner |
|---|---|---|
| `/api/auth/login`, `/signup`, `/me`, `/logout` | POST/GET | Ruchir |
| `/api/admin/users`, `/api/admin/users/:id` | GET/POST/PATCH | Ruchir |
| `/api/customers`, `/api/customers/:id` | GET/POST/PATCH | Harsh |
| `/api/products`, `/api/products/:id`, restore, variants | GET/POST/PATCH | Harsh |
| `/api/products/summary` | GET | Harsh |
| `/api/catalog/search`, `/api/catalog/resolve` | GET | Harsh |
| `/api/price-lists`, rules nested | CRUD | Harsh |
| `/api/tax-rates` | GET/POST | Harsh |
| `/api/sales-teams` | GET | Harsh |
| `/api/warehouses`, `/api/warehouses/:id` | CRUD | Harsh |
| `/api/stock`, `/api/stock/levels`, `/api/stock/receipts` | GET/POST | Harsh |
| `/api/fulfillment`, `/initialize`, `/:orderId`, preview, allocate (`accept`), ship, deliver, delivery, consolidate, override, cancel | GET/POST | Harsh |
| `/api/quotes` | GET/POST | Atharva |
| `/api/approvals`, `/api/approvals/:revisionId` | GET/POST | Atharva |
| `/api/policies` | GET/POST | Atharva |
| `/api/health`, `/api/health/actions` | GET/POST | Atharva (deal health, **not** k8s probe) |
| `/api/dashboard` | GET | Atharva |
| `/api/invoices`, `/api/invoices/:id`, PDF | GET | Ruchir |
| `/api/payments` | GET/POST | Ruchir |
| `/api/credits` | GET/POST | Ruchir |
| `/api/subscriptions`, `/api/plans` | GET/POST/PATCH | Ruchir |
| `/api/billing/run-due` | POST | Ruchir |
| `/api/reports`, `/export`, `/options` | GET | Harsh |

Exact verbs and Zod bodies: `src/features/{catalog,inventory,reports}/api.ts` and each `route.ts`.

## Actor payload

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "ADMIN | SALES_REP | SALES_MANAGER | FINANCE | CUSTOMER",
  "active": true,
  "customerId": "optional for CUSTOMER"
}
```

UI may map `FINANCE` → `FINANCE_OPS`.

## Agent checklist

1. Login without Origin in production → expect **403**.
2. Login with matching Origin → **200** + `Set-Cookie`.
3. Confirm without `expectedRevision` → **422**.
4. Confirm twice same `requestKey` → same order id.
5. Customer A fetching customer B quote id → **404**.
6. Missing `DATABASE_URL` without fixture → **503**.
