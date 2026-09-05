import "dotenv/config";
import fs from "node:fs";
import { hashPassword } from "../src/server/lib/auth/password";
import { prisma } from "../src/server/lib/db";

type Fixture = Record<string, unknown> & { users: Record<string, unknown>[] };
const file = process.argv[2] ?? "dealflow360_synthetic_dataset.json";
const reset = process.argv.includes("--reset");
const fixture = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;

const dateFields = new Set([
  "createdAt", "updatedAt", "lastActivityAt", "effectiveFrom", "expiresAt",
  "usedAt", "promisedDate", "supersededAt", "acceptedAt", "releasedAt",
  "shippedAt", "deliveredAt", "pausedAt", "cancelEffectiveDate",
  "pendingPlanEffectiveDate", "currentPeriodStart", "currentPeriodEnd",
  "nextBillingDate", "issueDate", "periodStart", "periodEnd", "dueDate",
  "paidOn", "detectedAt", "resolvedAt", "completedAt", "dueDate",
]);

function prismaDates(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) return value;
  if (dateFields.has(key)) return new Date(String(value));
  if (Array.isArray(value)) return value.map((item) => prismaDates(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, prismaDates(v, k)]));
  }
  return value;
}

async function main() {
  if (reset) {
    const tables = [
      "AuditEvent", "RequestKey", "Task", "HealthFlag", "HealthSettings",
      "RecommendationRule", "CreditApplication", "Payment", "CreditNote",
      "InvoiceLine", "Invoice", "SubscriptionChange", "Subscription",
      "ShipmentLine", "Shipment", "Backorder", "Reservation", "Stock",
      "Warehouse", "OrderLine", "Order", "CustomerAcceptance", "ApprovalDecision",
      "QuoteRevisionApprovalStep", "QuoteLine", "QuoteRevision", "PortalMessage",
      "Quote", "PolicyChainStep", "PolicyCategoryCeiling", "PolicyTierCeiling",
      "PolicyVersion", "PriceRule", "CustomerMembership", "Customer", "Variant",
      "Product", "Category", "PriceList", "SubscriptionPlan", "User", "SalesTeam",
      "TaxRate", "Company",
    ];
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((x) => `"${x}"`).join(", ")} CASCADE`);
  }

  const users = [];
  for (const user of fixture.users) {
    users.push({ ...user, passwordHash: await hashPassword(`Synthetic-${String(user.id)}-2026!`) });
  }

  const order = [
    ["companies", "company"], ["taxRates", "taxRate"], ["salesTeams", "salesTeam"],
    ["users", "user"], ["subscriptionPlans", "subscriptionPlan"], ["categories", "category"],
    ["products", "product"], ["variants", "variant"], ["priceLists", "priceList"],
    ["customers", "customer"], ["customerMemberships", "customerMembership"],
    ["priceRules", "priceRule"], ["policies", "policyVersion"],
    ["policyTierCeilings", "policyTierCeiling"], ["policyCategoryCeilings", "policyCategoryCeiling"],
    ["policyChainSteps", "policyChainStep"], ["quotes", "quote"], ["quoteRevisions", "quoteRevision"],
    ["quoteLines", "quoteLine"], ["quoteRevisionApprovalSteps", "quoteRevisionApprovalStep"],
    ["approvalDecisions", "approvalDecision"], ["customerAcceptances", "customerAcceptance"],
    ["portalMessages", "portalMessage"], ["orders", "order"], ["orderLines", "orderLine"],
    ["warehouses", "warehouse"], ["stocks", "stock"], ["reservations", "reservation"],
    ["backorders", "backorder"], ["shipments", "shipment"], ["shipmentLines", "shipmentLine"],
    ["subscriptions", "subscription"], ["invoices", "invoice"], ["invoiceLines", "invoiceLine"],
    ["creditNotes", "creditNote"], ["requestKeys", "requestKey"], ["payments", "payment"], ["creditApplications", "creditApplication"],
    ["recommendationRules", "recommendationRule"], ["healthSettings", "healthSettings"],
    ["healthFlags", "healthFlag"], ["tasks", "task"], ["auditEvents", "auditEvent"],
  ] as const;

  for (const [key, model] of order) {
    const sourceRows = key === "users" ? users : (fixture[key] as Record<string, unknown>[] | undefined) ?? [];
    const data = key === "quotes"
      ? sourceRows.map((row) => ({ ...row, currentRevisionId: null }))
      : sourceRows;
    if (!data.length) continue;
    await (prisma as unknown as Record<string, { createMany(args: { data: unknown[] }): Promise<unknown> }>)[model]
      .createMany({ data: data.map((row) => prismaDates(row)) });
    console.log(`${model}: ${data.length}`);
  }

  const quoteRows = fixture.quotes as Record<string, unknown>[];
  for (const quote of quoteRows) {
    await prisma.quote.update({
      where: { id: String(quote.id) },
      data: { currentRevisionId: String(quote.currentRevisionId) },
    });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
