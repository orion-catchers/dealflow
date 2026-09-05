# Deal schema migration

This branch adds the shared `Deal` identity and consolidates policy ceilings into `PolicyCeiling`.

## Current model

`Deal` is the shared commercial identity. `Quote` remains the compatibility-facing sales model. `Order` remains the confirmed operational record.

The shared revision and line Prisma models are named `DealRevision` and `DealLine`. Their database tables keep the existing names through `@@map`, so this change does not rename existing revision or line tables.

## Migration order

Run the migrations in order with:

```bash
pnpm db:deploy
pnpm db:generate
pnpm db:seed
```

The policy migration copies tier defaults and category overrides into `PolicyCeiling`. A tier default has a null `categoryId`. A category override has a category ID.

The Deal migration creates one Deal for each existing Quote. It links existing revisions and confirmed orders to that Deal. It does not delete quotes or orders.

Do not edit an applied migration. Add a new migration for later changes.

## Owner checklist

### Quote and approval services

- Use `DealRevision` and `DealLine` Prisma delegates.
- Keep `/api/quotes` and quote-facing contracts stable.
- Create a `Deal` when a new quote is created.
- Set `DealRevision.dealId` when a revision is created.
- Update the Deal status and activity timestamp when the quote changes.
- Keep approval and customer acceptance tied to the same revision.

### Fulfillment

- Keep `Order` as the commitment boundary.
- Read commercial values from the accepted `DealRevision` and `DealLine`.
- Use `OrderLine` for fulfillment links and operational state.
- Do not reserve stock during quote or warehouse preview reads.
- Allocate stock only through the explicit allocation command.

### Billing

- Create one-time invoices and subscriptions only after order confirmation.
- Use the accepted Deal revision as the source of billing terms.
- Preserve `RequestKey` for retry-safe invoice, payment, and subscription operations.

### Portal and UI

- Keep quote routes and customer-facing labels unchanged.
- Treat `Deal` as an internal shared identity.
- Show preview data as `Preview`.
- Do not infer customer acceptance from `Deal` or `Quote` status.

## Verification

Run the following checks before merging:

```bash
pnpm exec prisma validate
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
```

The seed must run twice without duplicate rows. Confirmation must create one order for one accepted revision. A repeated request with the same request key must replay the original result.
