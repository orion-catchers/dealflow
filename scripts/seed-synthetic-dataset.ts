import "dotenv/config";
import fs from "node:fs";
import { hashPassword } from "../src/server/lib/auth/password";
import { prisma } from "../src/server/lib/db";

type Row = Record<string, unknown>;
type Fixture = Record<string, unknown> & { users: Row[] };

const file = process.argv[2] ?? "dealflow360_synthetic_dataset.json";
const reset = process.argv.includes("--reset");
const fixture = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;

const dateFields = new Set([
  "createdAt",
  "updatedAt",
  "lastActivityAt",
  "effectiveFrom",
  "expiresAt",
  "usedAt",
  "promisedDate",
  "supersededAt",
  "acceptedAt",
  "releasedAt",
  "shippedAt",
  "deliveredAt",
  "pausedAt",
  "cancelEffectiveDate",
  "pendingPlanEffectiveDate",
  "currentPeriodStart",
  "currentPeriodEnd",
  "nextBillingDate",
  "issueDate",
  "periodStart",
  "periodEnd",
  "dueDate",
  "paidOn",
  "detectedAt",
  "resolvedAt",
  "completedAt",
  "archivedAt",
]);

function prismaDates(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) {
    if (key === "createdAt" || key === "updatedAt" || key === "paidOn") return new Date();
    return value;
  }
  if (dateFields.has(key)) return new Date(String(value));
  if (Array.isArray(value)) return value.map((item) => prismaDates(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Row).map(([k, v]) => [k, prismaDates(v, k)]));
  }
  return value;
}

function pick(row: Row, keys: string[]): Row {
  const next: Row = {};
  for (const key of keys) {
    if (row[key] !== undefined) next[key] = row[key];
  }
  return next;
}

function billingShape(row: Row): Row {
  if (row.billingKind === "RECURRING") {
    return { ...row, interval: row.interval ?? "MONTHLY", planId: row.planId ?? "plan-0001" };
  }
  return { ...row, interval: null, planId: null };
}

function stockBalance(row: Row): Row {
  const onHand = Math.max(0, Number(row.onHand ?? 0));
  const reserved = Math.max(0, Number(row.reserved ?? 0));
  const clamped = Math.min(reserved, onHand);
  return { ...row, onHand, reserved: clamped, reorderAt: Math.max(0, Number(row.reorderAt ?? 0)) };
}

function addInterval(start: Date, interval: unknown): Date {
  const end = new Date(start);
  if (interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else if (interval === "QUARTERLY") end.setUTCMonth(end.getUTCMonth() + 3);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

function subscriptionPeriod(row: Row): Row {
  const start = new Date(String(row.currentPeriodStart ?? row.createdAt ?? "2026-01-01"));
  let end = new Date(String(row.currentPeriodEnd ?? row.currentPeriodStart ?? start.toISOString()));
  if (!(start < end)) end = addInterval(start, row.interval);
  let next = row.nextBillingDate ? new Date(String(row.nextBillingDate)) : end;
  if (next < end) next = end;
  return { ...row, currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), nextBillingDate: next.toISOString() };
}

const requestScopes = new Set(["CONFIRM_ORDER", "BILLING_INIT", "PAYMENT", "CREDIT_APPLY", "ALLOCATION_ACCEPT", "DUE_BILLING", "STOCK_RECEIPT"]);
const resultKinds: Record<string, string> = {
  CONFIRM_ORDER: "ORDER",
  BILLING_INIT: "INVOICE",
  PAYMENT: "PAYMENT",
  CREDIT_APPLY: "CREDIT_APPLICATION",
  ALLOCATION_ACCEPT: "ALLOCATION",
  DUE_BILLING: "INVOICE",
  STOCK_RECEIPT: "STOCK_RECEIPT",
};

function requestKeyShape(row: Row): Row {
  const rawScope = String(row.scope ?? "PAYMENT");
  const scope = requestScopes.has(rawScope) ? rawScope : "PAYMENT";
  const resultId = row.resultId ?? row.id;
  const completed = row.completedAt ?? row.createdAt ?? new Date().toISOString();
  const resultKind = row.resultKind && String(row.resultKind) in resultKinds ? row.resultKind : resultKinds[scope];
  return { ...row, scope, resultId, completedAt: completed, resultKind };
}

function invoiceRows(): Row[] {
  const orders = rows("orders");
  const unused = new Set(orders.map((order) => String(order.id)));
  const byCustomer = new Map<string, string[]>();
  for (const order of orders) {
    const customerId = String(order.customerId);
    byCustomer.set(customerId, [...(byCustomer.get(customerId) ?? []), String(order.id)]);
  }
  const fallback = String(orders[0]?.id ?? "");
  return rows("invoices").map((row) => {
    const customerId = String(row.customerId);
    const owned = byCustomer.get(customerId) ?? [];
    let orderId = row.orderId ? String(row.orderId) : owned.find((id) => unused.has(id));
    let status = row.status;
    if (orderId && unused.has(orderId)) unused.delete(orderId);
    else {
      orderId = owned[0] ?? fallback;
      status = "VOID";
    }
    return {
      ...pick(row, ["id", "customerId", "subscriptionId", "kind", "currency", "issueDate", "dueDate", "subtotal", "taxTotal", "total", "createdAt", "updatedAt"]),
      orderId,
      status,
      subscriptionId: null,
      kind: "ONE_TIME",
      periodStart: null,
      periodEnd: null,
    };
  });
}

function rows(key: string): Row[] {
  return (fixture[key] as Row[] | undefined) ?? [];
}

async function insert(model: string, data: Row[], label = model) {
  if (!data.length) {
    console.log(`${label}: 0`);
    return 0;
  }
  const client = prisma as unknown as Record<
    string,
    {
      createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
      create: (args: { data: unknown }) => Promise<unknown>;
    }
  >;
  const prepared = data.map((row) => prismaDates(row) as Row);
  const chunk = 250;
  let count = 0;
  let skipped = 0;
  for (let i = 0; i < prepared.length; i += chunk) {
    const slice = prepared.slice(i, i + chunk);
    try {
      const result = await client[model].createMany({ data: slice, skipDuplicates: true });
      count += result.count;
    } catch {
      for (const row of slice) {
        try {
          await client[model].create({ data: row });
          count += 1;
        } catch (rowError) {
          skipped += 1;
          if (skipped <= 8) {
            const message = rowError instanceof Error ? rowError.message.split("\n")[0] : String(rowError);
            console.warn(`${label} skip ${String(row.id)}: ${message}`);
          }
        }
      }
    }
  }
  console.log(`${label}: ${count}/${data.length}${skipped ? ` (skipped ${skipped})` : ""}`);
  return count;
}

async function main() {
  if (reset) {
    throw new Error("Refusing --reset: this import adds synthetic rows beside the existing demo. Re-seed demo with prisma db seed if you need a wipe.");
  }

  const users: Row[] = [];
  for (const user of fixture.users) {
    users.push({
      ...pick(user, ["id", "email", "name", "role", "status", "teamId", "companyId", "createdAt", "updatedAt"]),
      passwordHash: await hashPassword(`Synthetic-${String(user.id)}-2026!`),
    });
  }

  await insert("company", rows("companies").map((row) => pick(row, ["id", "code", "name", "currency", "active", "createdAt"])));
  await insert("taxRate", rows("taxRates").map((row) => ({ ...pick(row, ["id", "code", "name", "ratePct", "createdAt"]), active: true })));
  await insert("salesTeam", rows("salesTeams").map((row) => pick(row, ["id", "name", "createdAt", "updatedAt"])));
  await insert("user", users);
  await insert(
    "subscriptionPlan",
    rows("subscriptionPlans").map((row) => ({
      ...pick(row, ["id", "code", "name", "interval", "cancelPolicy", "createdAt"]),
      listPrice: row.listPrice ?? "0.00",
    })),
  );
  await insert("category", rows("categories").map((row) => pick(row, ["id", "code", "name", "active", "createdAt"])));
  await insert(
    "product",
    rows("products").map((row) =>
      pick(row, [
        "id",
        "sku",
        "name",
        "categoryId",
        "unit",
        "description",
        "taxPct",
        "taxRateId",
        "companyId",
        "basePrice",
        "baseCost",
        "stockTracked",
        "defaultPlanId",
        "archivedAt",
        "createdAt",
        "updatedAt",
      ]),
    ),
  );
  await insert(
    "variant",
    rows("variants").map((row) =>
      pick(row, ["id", "productId", "sku", "name", "extraPrice", "cost", "shippingWeight", "attributes", "archivedAt", "createdAt", "updatedAt"]),
    ),
  );
  await insert("priceList", rows("priceLists").map((row) => pick(row, ["id", "code", "name", "currency", "createdAt"])));
  await insert(
    "customer",
    rows("customers").map((row) =>
      pick(row, ["id", "name", "contactName", "contactEmail", "discountTier", "currency", "priceListId", "assignedRepId", "teamId", "companyId", "createdAt", "updatedAt"]),
    ),
  );
  await insert("customerMembership", rows("customerMemberships").map((row) => pick(row, ["id", "userId", "customerId", "createdAt"])));
  await insert(
    "priceRule",
    rows("priceRules").map((row) => pick(row, ["id", "priceListId", "productId", "variantId", "tier", "currency", "unitPrice", "active", "createdAt", "updatedAt"])),
  );
  await insert(
    "policyVersion",
    rows("policies").map((row) =>
      pick(row, [
        "id",
        "name",
        "createdById",
        "anyExcessRequiresManager",
        "managerWorstExcessPct",
        "managerWeightedExcessPct",
        "financeWorstExcessPct",
        "financeWeightedExcessPct",
        "totalDiscountBudgetPct",
        "createdAt",
      ]),
    ),
  );

  const ceilings = [
    ...rows("policyTierCeilings").map((row) => ({ ...pick(row, ["id", "policyVersionId", "tier", "ceilingPct", "createdAt"]), categoryId: null })),
    ...rows("policyCategoryCeilings").map((row) => pick(row, ["id", "policyVersionId", "tier", "categoryId", "ceilingPct", "createdAt"])),
  ];
  await insert("policyCeiling", ceilings);
  await insert("policyChainStep", rows("policyChainSteps").map((row) => pick(row, ["id", "policyVersionId", "stepIndex", "role", "createdAt"])));

  const quotes = rows("quotes");
  const deals = quotes.map((quote) => ({
    id: `deal-${quote.id}`,
    customerId: quote.customerId,
    repId: quote.repId,
    teamId: quote.teamId ?? null,
    status: quote.stage,
    lastActivityAt: quote.lastActivityAt,
    createdAt: quote.createdAt,
  }));
  await insert("deal", deals);

  await insert(
    "quote",
    quotes.map((quote) => ({
      ...pick(quote, ["id", "customerId", "repId", "teamId", "stage", "lastActivityAt", "createdAt", "updatedAt"]),
      dealId: `deal-${quote.id}`,
      currentRevisionId: null,
    })),
  );

  await insert(
    "dealRevision",
    rows("quoteRevisions").map((row) => ({
      ...pick(row, [
        "id",
        "quoteId",
        "revisionNumber",
        "policyVersionId",
        "riskLevel",
        "weightedExcessPct",
        "worstLineExcessPct",
        "evaluationReasons",
        "approvalStatus",
        "orderDiscountPct",
        "currency",
        "promisedDate",
        "oneTimeSubtotal",
        "oneTimeTax",
        "oneTimeTotal",
        "recurringMonthly",
        "recurringQuarterly",
        "recurringYearly",
        "totalCost",
        "marginPct",
        "createdById",
        "supersededAt",
        "createdAt",
      ]),
      dealId: `deal-${row.quoteId}`,
    })),
  );

  for (const quote of quotes) {
    if (!quote.currentRevisionId) continue;
    await prisma.quote.update({
      where: { id: String(quote.id) },
      data: { currentRevisionId: String(quote.currentRevisionId) },
    });
  }
  console.log(`quote.currentRevisionId: ${quotes.length}`);

  await insert(
    "dealLine",
    rows("quoteLines").map((row) =>
      billingShape(
        pick(row, [
          "id",
          "revisionId",
          "productId",
          "variantId",
          "planId",
          "billingKind",
          "interval",
          "quantity",
          "unitPrice",
          "unitCost",
          "lineDiscountPct",
          "effectiveDiscountPct",
          "ceilingPct",
          "excessPct",
          "excessAmount",
          "taxPct",
          "lineSubtotal",
          "taxAmount",
          "lineTotal",
          "categoryId",
          "stockTracked",
          "position",
          "createdAt",
        ]),
      ),
    ),
  );
  await insert(
    "dealApprovalStep",
    rows("quoteRevisionApprovalSteps").map((row) => pick(row, ["id", "revisionId", "stepIndex", "role", "status", "decisionId", "createdAt", "updatedAt"])),
  );
  await insert(
    "approvalDecision",
    rows("approvalDecisions").map((row) => pick(row, ["id", "revisionId", "actorId", "actorRole", "stepIndex", "kind", "reason", "createdAt"])),
  );
  await insert("customerAcceptance", rows("customerAcceptances").map((row) => pick(row, ["id", "revisionId", "actorId", "createdAt"])));
  await insert(
    "portalMessage",
    rows("portalMessages").map((row) =>
      pick(row, [
        "id",
        "quoteId",
        "baseRevisionId",
        "lineId",
        "authorId",
        "body",
        "status",
        "proposedDiscountPct",
        "proposedQty",
        "proposedPromisedDate",
        "spawnedRevisionId",
        "createdAt",
      ]),
    ),
  );

  const revisionQuoteId = new Map(rows("quoteRevisions").map((row) => [String(row.id), String(row.quoteId)]));
  await insert(
    "order",
    rows("orders").map((order) => {
      const quoteId = revisionQuoteId.get(String(order.sourceRevisionId));
      return {
        ...pick(order, ["id", "sourceRevisionId", "acceptanceId", "customerId", "repId", "teamId", "currency", "promisedDate", "fulfillmentStatus", "createdAt", "updatedAt"]),
        dealId: quoteId ? `deal-${quoteId}` : null,
      };
    }),
  );
  await insert(
    "orderLine",
    rows("orderLines").map((row) =>
      billingShape({
        ...pick(row, ["id", "orderId", "productId", "variantId", "quantity", "unitPrice", "unitCost", "lineDiscountPct", "taxPct", "lineTotal", "billingKind", "interval", "planId", "stockTracked", "createdAt"]),
        sourceDealLineId: row.sourceDealLineId ?? row.sourceQuoteLineId,
      }),
    ),
  );

  await insert(
    "warehouse",
    rows("warehouses").map((row) => ({
      ...pick(row, ["id", "code", "name", "shippingCost", "active", "createdAt", "updatedAt"]),
      companyId: row.companyId ?? "company-synthetic",
    })),
  );
  await insert(
    "stock",
    rows("stocks").map((row) => stockBalance(pick(row, ["id", "warehouseId", "variantId", "onHand", "reserved", "reorderAt", "createdAt", "updatedAt"]))),
  );
  await insert(
    "reservation",
    rows("reservations").map((row) => pick(row, ["id", "orderLineId", "variantId", "warehouseId", "quantity", "status", "releasedAt", "createdAt", "updatedAt"])),
  );
  await insert("backorder", rows("backorders").map((row) => pick(row, ["id", "orderLineId", "variantId", "quantity", "resolvedAt", "createdAt"])));
  await insert(
    "shipment",
    rows("shipments").map((row) => pick(row, ["id", "orderId", "warehouseId", "status", "shippingCostSnapshot", "shippedAt", "deliveredAt", "createdAt", "updatedAt"])),
  );
  await insert("shipmentLine", rows("shipmentLines").map((row) => pick(row, ["id", "shipmentId", "orderLineId", "reservationId", "quantity", "createdAt"])));

  await insert(
    "subscription",
    rows("subscriptions").map((row) =>
      subscriptionPeriod(
        pick(row, [
          "id",
          "sourceOrderLineId",
          "customerId",
          "planId",
          "status",
          "quantity",
          "unitPrice",
          "interval",
          "anchorDay",
          "currentPeriodStart",
          "currentPeriodEnd",
          "nextBillingDate",
          "cancelPolicy",
          "cancelEffectiveDate",
          "pausedAt",
          "pendingPlanId",
          "pendingPlanEffectiveDate",
          "createdAt",
          "updatedAt",
        ]),
      ),
    ),
  );
  await insert("invoice", invoiceRows());
  await insert(
    "invoiceLine",
    rows("invoiceLines").map((row) => pick(row, ["id", "invoiceId", "description", "quantity", "unitPrice", "discountPct", "taxPct", "lineTotal", "createdAt"])),
  );
  await insert(
    "creditNote",
    rows("creditNotes").map((row) => pick(row, ["id", "customerId", "sourceInvoiceId", "reason", "amount", "issuedById", "createdAt"])),
  );

  const requestKeys = rows("requestKeys").map((row) =>
    requestKeyShape(pick(row, ["id", "scope", "key", "actorId", "resultKind", "resultId", "resultPayload", "completedAt", "createdAt", "updatedAt"])),
  );
  const knownKeyIds = new Set(requestKeys.map((row) => String(row.id)));
  for (const payment of rows("payments")) {
    const id = String(payment.requestKeyId);
    if (knownKeyIds.has(id)) continue;
    knownKeyIds.add(id);
    requestKeys.push({
      id,
      scope: "PAYMENT",
      key: id,
      actorId: payment.recordedById ?? null,
      resultKind: "PAYMENT",
      resultId: payment.id,
      resultPayload: null,
      completedAt: payment.createdAt ?? new Date().toISOString(),
      createdAt: payment.createdAt ?? new Date().toISOString(),
      updatedAt: payment.createdAt ?? new Date().toISOString(),
    });
  }
  for (const credit of rows("creditApplications")) {
    const id = String(credit.requestKeyId);
    if (knownKeyIds.has(id)) continue;
    knownKeyIds.add(id);
    requestKeys.push({
      id,
      scope: "CREDIT_APPLY",
      key: id,
      actorId: null,
      resultKind: "CREDIT_APPLICATION",
      resultId: credit.id,
      resultPayload: null,
      completedAt: credit.createdAt ?? new Date().toISOString(),
      createdAt: credit.createdAt ?? new Date().toISOString(),
      updatedAt: credit.createdAt ?? new Date().toISOString(),
    });
  }
  await insert("requestKey", requestKeys);

  await insert(
    "payment",
    rows("payments").map((row) => ({
      ...pick(row, ["id", "invoiceId", "amount", "method", "reference", "recordedById", "requestKeyId"]),
      paidOn: row.paidOn ?? row.createdAt ?? "2026-09-06",
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
  );
  await insert(
    "creditApplication",
    rows("creditApplications").map((row) => pick(row, ["id", "creditNoteId", "invoiceId", "amount", "requestKeyId", "createdAt"])),
  );
  await insert(
    "recommendationRule",
    rows("recommendationRules").map((row, index) => ({
      ...pick(row, ["id", "baseProductId", "copurchaseScore", "trainedLift", "promotionTag", "minMarginPct", "status", "createdAt", "updatedAt"]),
      candidateProductId: row.baseProductId === row.candidateProductId ? `product-${String(index + 2).padStart(4, "0")}` : row.candidateProductId,
    })),
  );
  await insert(
    "healthSettings",
    rows("healthSettings").map((row) => pick(row, ["id", "stalledAfterDays", "anomalyMinSamples", "anomalyExcessPoints", "deliveryRiskLeadDays", "updatedAt"])),
  );
  await insert(
    "healthFlag",
    rows("healthFlags").map((row) => ({
      ...pick(row, ["id", "type", "fingerprint", "quoteId", "orderId", "reason", "detectedAt", "resolvedAt", "createdAt", "updatedAt"]),
      quoteId: row.quoteId ?? (row.orderId ? null : "quote-0001"),
    })),
  );
  await insert(
    "task",
    rows("tasks").map((row) => ({
      ...pick(row, ["id", "actionKey", "flagId", "quoteId", "orderId", "assigneeId", "createdById", "action", "status", "dueDate", "completedAt", "createdAt", "updatedAt"]),
      quoteId: row.quoteId ?? (row.orderId ? null : "quote-0001"),
    })),
  );
  await insert(
    "auditEvent",
    rows("auditEvents").map((row) => ({
      ...pick(row, ["id", "entityType", "entityId", "revisionId", "action", "reason", "metadata"]),
      actorId: typeof row.actorId === "string" && row.actorId.startsWith("user-") ? row.actorId : null,
      createdAt: row.createdAt ?? new Date().toISOString(),
      metadata: row.metadata ?? {},
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
