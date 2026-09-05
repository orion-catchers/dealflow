# DealFlow360 data model

_Source of truth: `prisma/schema.prisma`. This file is a reviewer map. Column lists belong in Prisma._

Generated client: `src/generated/prisma` (gitignored). After clone: `pnpm install` or `pnpm db:generate`.

## Enums

| Enum | Values (as of schema) |
|---|---|
| Role | ADMIN, SALES_REP, SALES_MANAGER, FINANCE, CUSTOMER |
| AccountStatus | PENDING, ACTIVE, DISABLED |
| DiscountTier | STANDARD, SILVER, GOLD, PLATINUM |
| QuoteStage | DRAFT, PENDING_APPROVAL, APPROVED, UNDER_NEGOTIATION, CONFIRMED, REJECTED |
| RevisionApprovalStatus | NOT_REQUIRED, PENDING, APPROVED, REJECTED, SUPERSEDED |
| ApprovalDecisionKind | APPROVE, REJECT, RETURN |
| ApprovalStepStatus | PENDING, APPROVED, BLOCKED |
| RiskLevel | NONE, MANAGER, FINANCE |
| LineBillingKind | ONE_TIME, RECURRING |
| BillingInterval | MONTHLY, QUARTERLY, YEARLY |
| FulfillmentStatus | PENDING, PARTIAL, ALLOCATED, SHIPPED, DELIVERED, CANCELLED |
| ReservationStatus | ACTIVE, SHIPPED, RELEASED |
| ShipmentStatus | PLANNED, SHIPPED, DELIVERED, CANCELLED |
| SubscriptionStatus | see schema |
| SubscriptionChangeKind | see schema |
| CancelPolicy | see schema |
| InvoiceKind | see schema |
| InvoiceStatus | see schema |
| PaymentMethod | see schema |
| CreditReason | see schema |
| HealthFlagType | see schema |
| TaskAction | see schema |
| TaskStatus | see schema |
| RuleStatus | see schema |
| PortalMessageStatus | see schema |
| RequestScope | see schema |
| RequestResultKind | see schema |

## Models (tables)

Identity: `User`, `Session`, `SalesTeam`, `CustomerMembership`, `Customer`.

Catalog: `Category`, `Product`, `Variant`, `PriceList`, `PriceRule` (+ tax/plan FKs on product).

Governance: `PolicyVersion`, `PolicyTierCeiling`, `PolicyCategoryCeiling`, `PolicyChainStep`.

Quotes: `Quote`, `QuoteRevision`, `QuoteLine`, `QuoteRevisionApprovalStep`, `ApprovalDecision`, `CustomerAcceptance`, `PortalMessage`.

Orders: `Order`, `OrderLine`.

Inventory: `Warehouse`, `Stock`, `StockReceipt`, `Reservation`, `Backorder`, `Shipment`, `ShipmentLine`.

Billing: `SubscriptionPlan`, `Subscription`, `SubscriptionChange`, `Invoice`, `InvoiceLine`, `CreditNote`, `Payment`, `CreditApplication`.

Ops: `RecommendationRule`, `HealthSettings`, `HealthFlag`, `Task`, `AuditEvent`, `RequestKey`.

ER sketch: [architecture.md](architecture.md).

## Invariants reviewers must check in schema + engines

| Invariant | Where |
|---|---|
| One order per accepted revision | Unique on order source revision |
| `onHand ≥ reserved ≥ 0` | Stock + fulfillment engine |
| Products archived, not deleted | Product flags / restore route |
| Unique replay `(scope, key)` | `RequestKey` |
| Unique invoice per subscription period/type | Invoice unique |
| Portal reads membership | Services, not only UI |
| Confirm initializes fulfillment with **zero** reservations | `initializeFulfillment` |
| Money `Decimal(14,2)` | Prisma fields |
| Percent `Decimal(5,2)` 0–100 | Policy/discount fields |

## Identity mapping (live vs fixtures)

Team fixtures use symbols (`warehouse-main`, `variant-laptop-std`, `rep-arjun`). Postgres uses generated ids. `src/server/lib/db/map.ts` and `src/server/live/ids.ts` resolve:

- emails → user ids
- SKUs → variant ids
- warehouse **codes** → warehouse ids

Receipts and allocations must persist **Prisma ids**, not fixture symbols.

## Migrations

- Additive only. New file under `prisma/migrations/`.
- Never edit a migration that already ran on `schema=public`.
- Shared DB: teammates use `?schema=dev_<name>`; only the schema owner deploys `public`.
- `pnpm db:reset` drops data — local/demo laptop only.

## Seed

`pnpm db:seed` loads Nexa demo (users, Acme/Beta/Gamma, catalog, policies). Must be **idempotent** (CI runs seed twice).
