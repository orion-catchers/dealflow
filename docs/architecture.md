# DealFlow360 — One-Page Architecture & Data Model

_Owner: Harsh (blueprint §4, §14). Other owners verify their portions. Draft — updated as lanes land._

## Runtime shape

One Next.js (App Router) application: React screens + server route handlers, TypeScript
throughout, Tailwind UI kit (Krishna). One PostgreSQL database via Prisma (Ruchir). Six
server-side engine services; no microservices or message broker. Session-cookie auth
(Ruchir) yields an `Actor {id, role, customerId?, active}` for every request.

```mermaid
flowchart LR
  subgraph Browser
    INT[Internal workspace<br/>AppShell]
    CP[Customer portal<br/>CustomerShell]
  end
  subgraph NextJS[Next.js app · route handlers]
    AUTH[/api/auth · Ruchir/]
    CAT[/api/products · price-lists · customers · Harsh/]
    Q[/api/quotes · approvals · policies · Atharva/]
    REC[/api/recommendations · Krishna/]
    PORT[/api/portal · Krishna/]
    FUL[/api/warehouses · stock · fulfillment · Harsh/]
    BILL[/api/subscriptions · invoices · payments · Ruchir/]
    HLT[/api/health · dashboard · Atharva/]
    REP[/api/reports · Harsh/]
  end
  subgraph Engines[Engine services · pure functions + repositories]
    E1[E1 Governance<br/>Atharva]
    E2[E2 Fulfillment<br/>Harsh]
    E3[E3 Billing<br/>Ruchir]
    E4[E4 Recommendations<br/>Krishna]
    E5[E5 Health<br/>Atharva]
    E6[E6 Negotiation<br/>Krishna]
  end
  DB[(PostgreSQL · Prisma)]
  INT --> AUTH & CAT & Q & REC & FUL & BILL & HLT & REP
  CP --> AUTH & PORT
  Q --> E1
  REC --> E4 --> Q
  PORT --> E6 --> Q
  FUL --> E2
  BILL --> E3
  HLT --> E5
  Q -- confirmOrder tx --> E2
  Q -- confirmOrder tx --> E3
  CAT --> DB
  E1 & E2 & E3 & E4 & E5 & E6 --> DB
  REP --> DB
```

## Confirmation handoff (the one cross-engine transaction)

`confirmOrder` (Atharva) validates approval + customer acceptance on the **same revision**,
creates one immutable `Order` (unique source revision), and in the same transaction calls
`initializeFulfillment(tx, order)` (Harsh — records PENDING, reserves nothing) and
`initializeBilling(tx, order, requestKey)` (Ruchir — one-time invoice + subscription
records). Stock is reserved only when allocation is **accepted** later.

## Data model (minimum, blueprint §10)

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ CustomerMembership : has
  Customer ||--o{ CustomerMembership : grants
  Customer }o--|| PriceList : resolves
  Customer ||--o{ Quote : owns
  SalesTeam ||--o{ User : groups

  Product ||--o{ Variant : has
  Product }o--|| TaxRate : taxed
  Product }o--o| SubscriptionPlan : billedBy
  PriceList ||--o{ PriceRule : contains
  PriceRule }o--|| Product : prices
  PriceRule }o--o| Variant : prices

  PolicyVersion ||--o{ QuoteRevision : evaluated
  Quote ||--|{ QuoteRevision : versions
  QuoteRevision ||--|{ QuoteLine : lines
  QuoteRevision ||--o{ ApprovalDecision : decided
  QuoteRevision ||--o| CustomerAcceptance : accepted
  QuoteRevision ||--o{ Proposal : negotiated
  Proposal ||--o{ NegotiationMessage : thread
  QuoteRevision ||--o| Order : "confirmed (unique)"
  Order ||--|{ OrderLine : lines

  Warehouse ||--o{ StockLevel : holds
  Variant ||--o{ StockLevel : stocked
  Warehouse ||--o{ StockReceipt : receives
  OrderLine ||--o{ Reservation : reserves
  Warehouse ||--o{ Reservation : from
  OrderLine ||--o{ Backorder : remainder
  Order ||--o{ Shipment : ships
  Shipment ||--|{ ShipmentLine : lines
  Reservation }o--o| Shipment : consumedBy

  OrderLine ||--o| Subscription : recurring
  SubscriptionPlan ||--o{ Subscription : plan
  Subscription ||--o{ SubscriptionChange : history
  Order ||--o{ Invoice : oneTime
  Subscription ||--o{ Invoice : perPeriod
  Invoice ||--|{ InvoiceLine : lines
  Invoice ||--o{ Payment : paid
  Invoice ||--o{ CreditNote : credited
  CreditNote ||--o{ CreditApplication : applied

  Product ||--o{ RecommendationRule : base
  Quote ||--o{ HealthFlag : flagged
  Order ||--o{ HealthFlag : flagged
  HealthFlag ||--o{ Task : action
  AuditEvent }o--|| User : actor
  RequestKey ||--o| AuditEvent : result
```

Key constraints: one order per accepted revision; unique invoice per (subscription,
period, type); unique replay keys (receipt, accept, payment); `onHand ≥ reserved ≥ 0`;
payments/credits never applied twice; customer FK + membership check on every portal read;
products archived, never deleted.

## Harsh's lane internals

```
src/contracts/harsh.ts        types shared with other lanes (catalog, inventory, reports)
src/fixtures/harsh.ts         §13 demo numbers (DEV FIXTURE)
src/features/catalog/         engine/resolve-price · repository · service · api (zod)
src/features/inventory/       engine/{demand,availability,split,validate-plan,status} · repository · service
src/features/reports/         engine/{period,filter,aggregate,export-xlsx,export-pdf} · repository · service
src/app/api/{customers,products,price-lists,catalog,warehouses,stock,fulfillment,reports}
src/app/(internal)/{products,customers,warehouses,fulfillment,reports}
```

Engine functions are pure (inputs → outputs, no DB import). Services add role checks,
request-key idempotency, transactions and audit. Repositories are interfaces with an
in-memory fixture implementation now and a Prisma implementation once the schema lands.

## Roadmap note (what we would build next)

Live payment gateway; e-mail/Slack nudges; courier rate lookup for real shipping costs;
learned co-purchase weights for recommendations; SSO; multi-company and currency
conversion; scheduled (cron) due-billing and health refresh instead of manual buttons.
