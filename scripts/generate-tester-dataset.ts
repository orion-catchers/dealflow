/**
 * Writes data/tester-dataset.json — Prisma-shaped rows for testers.
 * Load with: pnpm tester:seed
 * Does not wipe the Nexa demo; import is add-only (skipDuplicates).
 */
import fs from "node:fs";
import path from "node:path";

const ISO = (d: string) => `${d}T06:30:00.000Z`;
const money = (n: number) => n.toFixed(2);
const pct = (n: number) => n.toFixed(2);

const COMPANY = "tester-company";
const POLICY = "tester-policy";
const LIST = "tester-plist-inr";
const PLAN_M = "tester-plan-monthly";
const PLAN_Y = "tester-plan-yearly";
const WH_A = "tester-wh-mum";
const WH_B = "tester-wh-blr";
const ADMIN = "tester-user-admin";
const MANAGER = "tester-user-manager";
const FINANCE = "tester-user-finance";
const REP1 = "tester-user-rep-01";
const REP2 = "tester-user-rep-02";
const PORTAL1 = "tester-user-portal-01";

const fixture: Record<string, unknown[]> = {};
const counts: Record<string, number> = {};

function add<T extends { id?: string }>(key: string, rows: T[]): T[] {
  fixture[key] = rows as unknown[];
  counts[key] = rows.length;
  return rows;
}

function totalRecords(): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

add("companies", [
  {
    id: COMPANY,
    code: "TESTER",
    name: "Tester Co (synthetic)",
    currency: "INR",
    active: true,
    createdAt: ISO("2025-01-15"),
  },
]);

add("taxRates", [
  { id: "tax-0", code: "tax-0", name: "Zero (synthetic)", ratePct: 0, createdAt: ISO("2025-01-15") },
  { id: "tax-5", code: "tax-5", name: "GST 5%", ratePct: 5, createdAt: ISO("2025-01-15") },
  { id: "tax-12", code: "tax-12", name: "GST 12%", ratePct: 12, createdAt: ISO("2025-01-15") },
  { id: "tax-18", code: "tax-18", name: "GST 18%", ratePct: 18, createdAt: ISO("2025-01-15") },
]);

add("salesTeams", [
  { id: "tester-team-west", name: "Tester West", createdAt: ISO("2025-01-16"), updatedAt: ISO("2025-01-16") },
  { id: "tester-team-east", name: "Tester East", createdAt: ISO("2025-01-16"), updatedAt: ISO("2025-01-16") },
]);

const staffUsers = [
  [ADMIN, "admin.tester@example.test", "Tester Admin", "ADMIN", null],
  [MANAGER, "manager.tester@example.test", "Tester Manager", "SALES_MANAGER", "tester-team-west"],
  ["tester-user-manager-02", "manager2.tester@example.test", "Tester Manager 2", "SALES_MANAGER", "tester-team-east"],
  [FINANCE, "finance.tester@example.test", "Tester Finance", "FINANCE", null],
  ["tester-user-finance-02", "finance2.tester@example.test", "Tester Finance 2", "FINANCE", null],
  [REP1, "rep01.tester@example.test", "Tester Rep 01", "SALES_REP", "tester-team-west"],
  [REP2, "rep02.tester@example.test", "Tester Rep 02", "SALES_REP", "tester-team-east"],
  ["tester-user-rep-03", "rep03.tester@example.test", "Tester Rep 03", "SALES_REP", "tester-team-west"],
] as const;

const portalUsers = [
  [PORTAL1, "buyer01.tester@example.test", "Buyer One"],
  ["tester-user-portal-02", "buyer02.tester@example.test", "Buyer Two"],
  ["tester-user-portal-03", "buyer03.tester@example.test", "Buyer Three"],
] as const;

add("users", [
  ...staffUsers.map(([id, email, name, role, teamId], i) => ({
    id,
    email,
    passwordHash: "__GENERATE_WITH_HASH_PASSWORD__",
    name,
    role,
    status: "ACTIVE",
    teamId,
    companyId: COMPANY,
    createdAt: ISO(`2025-02-${String(10 + i).padStart(2, "0")}`),
    updatedAt: ISO(`2025-02-${String(10 + i).padStart(2, "0")}`),
  })),
  ...portalUsers.map(([id, email, name], i) => ({
    id,
    email,
    passwordHash: "__GENERATE_WITH_HASH_PASSWORD__",
    name,
    role: "CUSTOMER" as const,
    status: "ACTIVE",
    teamId: null,
    companyId: COMPANY,
    createdAt: ISO(`2025-02-${String(20 + i).padStart(2, "0")}`),
    updatedAt: ISO(`2025-02-${String(20 + i).padStart(2, "0")}`),
  })),
]);

add("subscriptionPlans", [
  {
    id: PLAN_M,
    code: "TESTER-CARE-M",
    name: "Tester Care Monthly",
    interval: "MONTHLY",
    cancelPolicy: "PERIOD_END",
    listPrice: money(499),
    createdAt: ISO("2025-01-20"),
  },
  {
    id: PLAN_Y,
    code: "TESTER-CARE-Y",
    name: "Tester Care Yearly",
    interval: "YEARLY",
    cancelPolicy: "PERIOD_END",
    listPrice: money(4990),
    createdAt: ISO("2025-01-20"),
  },
  {
    id: "tester-plan-q",
    code: "TESTER-CARE-Q",
    name: "Tester Care Quarterly",
    interval: "QUARTERLY",
    cancelPolicy: "IMMEDIATE",
    listPrice: money(1399),
    createdAt: ISO("2025-01-20"),
  },
]);

const categories = [
  ["tester-cat-hw", "TESTER-HW", "Hardware"],
  ["tester-cat-sv", "TESTER-SV", "Services"],
  ["tester-cat-ac", "TESTER-AC", "Accessories"],
  ["tester-cat-sw", "TESTER-SW", "Software"],
] as const;

add(
  "categories",
  categories.map(([id, code, name]) => ({
    id,
    code,
    name,
    active: true,
    createdAt: ISO("2025-01-18"),
  })),
);

const productDefs = [
  ["tester-prod-01", "T-CHAIR-01", "Ergo Chair", "tester-cat-hw", "ea", "18", "tax-18", 8999, 5200, true, null],
  ["tester-prod-02", "T-DESK-01", "Sit-Stand Desk", "tester-cat-hw", "ea", "18", "tax-18", 24999, 14800, true, null],
  ["tester-prod-03", "T-MON-01", "27in Monitor", "tester-cat-hw", "ea", "18", "tax-18", 18999, 11200, true, null],
  ["tester-prod-04", "T-DOCK-01", "USB-C Dock", "tester-cat-hw", "ea", "18", "tax-18", 7999, 4100, true, null],
  ["tester-prod-05", "T-LAMP-01", "Desk Lamp", "tester-cat-ac", "ea", "12", "tax-12", 2499, 980, true, null],
  ["tester-prod-06", "T-MAT-01", "Floor Mat", "tester-cat-ac", "ea", "12", "tax-12", 1299, 420, true, null],
  ["tester-prod-07", "T-INST-01", "Install Visit", "tester-cat-sv", "job", "18", "tax-18", 3500, 900, false, null],
  ["tester-prod-08", "T-CARE-01", "Device Care", "tester-cat-sv", "seat", "18", "tax-18", 499, 120, false, PLAN_M],
  ["tester-prod-09", "T-SOFT-01", "Asset Tracker", "tester-cat-sw", "seat", "18", "tax-18", 199, 40, false, PLAN_Y],
  ["tester-prod-10", "T-CAM-01", "Webcam HD", "tester-cat-hw", "ea", "18", "tax-18", 4599, 2100, true, null],
] as const;

add(
  "products",
  productDefs.map(([id, sku, name, categoryId, unit, taxPct, taxRateId, basePrice, baseCost, stockTracked, defaultPlanId]) => ({
    id,
    sku,
    name,
    categoryId,
    unit,
    description: `Tester catalog ${sku}`,
    taxPct: Number(taxPct),
    taxRateId,
    companyId: COMPANY,
    basePrice: money(basePrice),
    baseCost: money(baseCost),
    stockTracked,
    defaultPlanId,
    archivedAt: null,
    createdAt: ISO("2025-01-22"),
    updatedAt: ISO("2025-01-22"),
  })),
);

const variants: Record<string, unknown>[] = [];
for (const [pid, sku, name, , , , , basePrice, baseCost, stockTracked] of productDefs) {
  variants.push({
    id: `${pid}-a`,
    productId: pid,
    sku: `${sku}-A`,
    name: `${name} Std`,
    extraPrice: money(0),
    cost: money(baseCost),
    shippingWeight: stockTracked ? "2.500" : null,
    attributes: { finish: "std" },
    archivedAt: null,
    createdAt: ISO("2025-01-22"),
    updatedAt: ISO("2025-01-22"),
  });
  variants.push({
    id: `${pid}-b`,
    productId: pid,
    sku: `${sku}-B`,
    name: `${name} Plus`,
    extraPrice: money(Math.round(Number(basePrice) * 0.12)),
    cost: money(Math.round(Number(baseCost) * 1.08)),
    shippingWeight: stockTracked ? "3.100" : null,
    attributes: { finish: "plus" },
    archivedAt: null,
    createdAt: ISO("2025-01-22"),
    updatedAt: ISO("2025-01-22"),
  });
}
add("variants", variants);

add("priceLists", [
  { id: LIST, code: "TESTER-INR", name: "Tester INR list", currency: "INR", createdAt: ISO("2025-01-21") },
  {
    id: "tester-plist-partner",
    code: "TESTER-PARTNER",
    name: "Tester partner list",
    currency: "INR",
    createdAt: ISO("2025-01-21"),
  },
]);

const tiers = ["STANDARD", "SILVER", "GOLD"] as const;
const priceRules: Record<string, unknown>[] = [];
let pr = 1;
for (const [pid, , , , , , , basePrice] of productDefs) {
  for (const tier of tiers) {
    const cut = tier === "GOLD" ? 0.88 : tier === "SILVER" ? 0.93 : 1;
    priceRules.push({
      id: `tester-pr-${String(pr).padStart(3, "0")}`,
      priceListId: LIST,
      productId: pid,
      variantId: null,
      tier,
      currency: "INR",
      unitPrice: money(Math.round(Number(basePrice) * cut)),
      active: true,
      createdAt: ISO("2025-01-23"),
      updatedAt: ISO("2025-01-23"),
    });
    pr += 1;
  }
}
add("priceRules", priceRules);

const customerNames = [
  "Acme Tester Labs",
  "Beta Tester Mills",
  "Gamma Tester Clinic",
  "Delta Tester Depot",
  "Epsilon Tester Hub",
  "Zeta Tester Works",
  "Eta Tester Studio",
  "Theta Tester Park",
  "Iota Tester Campus",
  "Kappa Tester Mart",
];
const discTiers = ["STANDARD", "SILVER", "GOLD", "PLATINUM"] as const;
const reps = [REP1, REP2, "tester-user-rep-03"] as const;
const teams = ["tester-team-west", "tester-team-east"] as const;

add(
  "customers",
  customerNames.map((name, i) => ({
    id: `tester-cust-${String(i + 1).padStart(2, "0")}`,
    name,
    contactName: `Contact ${i + 1}`,
    contactEmail: `contact${i + 1}@buyer.example.test`,
    discountTier: discTiers[i % discTiers.length],
    currency: "INR",
    priceListId: i % 5 === 0 ? "tester-plist-partner" : LIST,
    assignedRepId: reps[i % reps.length],
    teamId: teams[i % teams.length],
    companyId: COMPANY,
    createdAt: ISO("2025-03-01"),
    updatedAt: ISO("2025-03-01"),
  })),
);

const portalByCustomer = [
  PORTAL1,
  PORTAL1,
  PORTAL1,
  PORTAL1,
  "tester-user-portal-02",
  "tester-user-portal-02",
  "tester-user-portal-02",
  "tester-user-portal-03",
  "tester-user-portal-03",
  "tester-user-portal-03",
];

add(
  "customerMemberships",
  customerNames.map((_, i) => ({
    id: `tester-mem-${String(i + 1).padStart(2, "0")}`,
    userId: portalByCustomer[i],
    customerId: `tester-cust-${String(i + 1).padStart(2, "0")}`,
    createdAt: ISO("2025-03-02"),
  })),
);

add("policies", [
  {
    id: POLICY,
    name: "Tester policy v1",
    createdById: ADMIN,
    anyExcessRequiresManager: true,
    managerWorstExcessPct: pct(2),
    managerWeightedExcessPct: pct(1.5),
    financeWorstExcessPct: pct(8),
    financeWeightedExcessPct: pct(5),
    totalDiscountBudgetPct: pct(12),
    createdAt: ISO("2025-01-25"),
  },
]);

add("policyTierCeilings", [
  { id: "tester-ptc-std", policyVersionId: POLICY, tier: "STANDARD", ceilingPct: pct(5), createdAt: ISO("2025-01-25") },
  { id: "tester-ptc-slv", policyVersionId: POLICY, tier: "SILVER", ceilingPct: pct(8), createdAt: ISO("2025-01-25") },
  { id: "tester-ptc-gld", policyVersionId: POLICY, tier: "GOLD", ceilingPct: pct(12), createdAt: ISO("2025-01-25") },
  { id: "tester-ptc-plt", policyVersionId: POLICY, tier: "PLATINUM", ceilingPct: pct(15), createdAt: ISO("2025-01-25") },
]);

add(
  "policyCategoryCeilings",
  categories.flatMap(([catId], i) =>
    (["STANDARD", "GOLD"] as const).map((tier, j) => ({
      id: `tester-pcc-${i}-${j}`,
      policyVersionId: POLICY,
      tier,
      categoryId: catId,
      ceilingPct: pct(tier === "GOLD" ? 14 : 6),
      createdAt: ISO("2025-01-25"),
    })),
  ),
);

add("policyChainSteps", [
  { id: "tester-pcs-1", policyVersionId: POLICY, stepIndex: 0, role: "SALES_MANAGER", createdAt: ISO("2025-01-25") },
  { id: "tester-pcs-2", policyVersionId: POLICY, stepIndex: 1, role: "FINANCE", createdAt: ISO("2025-01-25") },
]);

const stages = [
  "DRAFT",
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "UNDER_NEGOTIATION",
  "REJECTED",
  "CONFIRMED",
  "CONFIRMED",
  "CONFIRMED",
  "CONFIRMED",
  "PENDING_APPROVAL",
  "APPROVED",
] as const;

type QuoteRow = {
  id: string;
  customerId: string;
  repId: string;
  teamId: string;
  currentRevisionId: string;
  stage: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

const quotes: QuoteRow[] = stages.map((stage, i) => {
  const n = String(i + 1).padStart(2, "0");
  const custN = String((i % 10) + 1).padStart(2, "0");
  return {
    id: `tester-quote-${n}`,
    customerId: `tester-cust-${custN}`,
    repId: reps[i % reps.length],
    teamId: teams[i % teams.length],
    currentRevisionId: `tester-rev-${n}-2`,
    stage,
    lastActivityAt: ISO("2026-08-01"),
    createdAt: ISO("2026-06-01"),
    updatedAt: ISO("2026-08-01"),
  };
});
add("quotes", quotes);

const quoteRevisions: Record<string, unknown>[] = [];
const quoteLines: Record<string, unknown>[] = [];
const approvalSteps: Record<string, unknown>[] = [];
const approvalDecisions: Record<string, unknown>[] = [];
const acceptances: Record<string, unknown>[] = [];
const portalMessages: Record<string, unknown>[] = [];
const orders: Record<string, unknown>[] = [];
const orderLines: Record<string, unknown>[] = [];
const reservations: Record<string, unknown>[] = [];
const backorders: Record<string, unknown>[] = [];
const shipments: Record<string, unknown>[] = [];
const shipmentLines: Record<string, unknown>[] = [];
const subscriptions: Record<string, unknown>[] = [];
const invoices: Record<string, unknown>[] = [];
const invoiceLines: Record<string, unknown>[] = [];
const payments: Record<string, unknown>[] = [];
const requestKeys: Record<string, unknown>[] = [];
const creditNotes: Record<string, unknown>[] = [];
const creditApplications: Record<string, unknown>[] = [];
const healthFlags: Record<string, unknown>[] = [];
const tasks: Record<string, unknown>[] = [];
const auditEvents: Record<string, unknown>[] = [];

function lineMoney(unitPrice: number, qty: number, disc: number, taxPct: number) {
  const sub = Math.round(unitPrice * qty * (1 - disc / 100) * 100) / 100;
  const tax = Math.round(sub * (taxPct / 100) * 100) / 100;
  const total = Math.round((sub + tax) * 100) / 100;
  return { sub, tax, total };
}

quotes.forEach((quote, i) => {
  const n = String(i + 1).padStart(2, "0");
  const prodA = productDefs[i % productDefs.length]!;
  const prodB = productDefs[(i + 3) % productDefs.length]!;
  const ceiling = 12;
  const disc1 = quote.stage === "PENDING_APPROVAL" || quote.stage === "REJECTED" ? 18 : 8;
  const disc2 = 4;
  const price1 = Number(prodA[7]);
  const price2 = Number(prodB[7]);
  const tax1 = Number(prodA[5]);
  const tax2 = Number(prodB[5]);
  const m1 = lineMoney(price1, 2, disc1, tax1);
  const m2 = lineMoney(price2, 1, disc2, tax2);
  const oneTimeSubtotal = m1.sub + m2.sub;
  const oneTimeTax = m1.tax + m2.tax;
  const oneTimeTotal = m1.total + m2.total;
  const cost = Number(prodA[8]) * 2 + Number(prodB[8]);
  const marginPct = oneTimeSubtotal === 0 ? 0 : ((oneTimeSubtotal - cost) / oneTimeSubtotal) * 100;
  const needsChain = disc1 > 12;
  const approvalStatus =
    quote.stage === "REJECTED"
      ? "REJECTED"
      : quote.stage === "PENDING_APPROVAL"
        ? "PENDING"
        : needsChain && quote.stage !== "DRAFT"
          ? "APPROVED"
          : "NOT_REQUIRED";

  const rev1 = {
    id: `tester-rev-${n}-1`,
    quoteId: quote.id,
    revisionNumber: 1,
    policyVersionId: POLICY,
    riskLevel: needsChain ? "MANAGER" : "NONE",
    weightedExcessPct: pct(needsChain ? 4 : 0),
    worstLineExcessPct: pct(needsChain ? 6 : 0),
    evaluationReasons: { fixture: true, revision: 1 },
    approvalStatus: quote.stage === "DRAFT" ? "NOT_REQUIRED" : "SUPERSEDED",
    orderDiscountPct: pct(0),
    currency: "INR",
    promisedDate: "2026-09-30",
    oneTimeSubtotal: money(oneTimeSubtotal),
    oneTimeTax: money(oneTimeTax),
    oneTimeTotal: money(oneTimeTotal),
    recurringMonthly: money(0),
    recurringQuarterly: money(0),
    recurringYearly: money(0),
    totalCost: money(cost),
    marginPct: pct(Math.max(0, Math.min(99.99, marginPct))),
    createdById: quote.repId,
    supersededAt: ISO("2026-07-01"),
    createdAt: ISO("2026-06-01"),
  };
  const rev2 = {
    ...rev1,
    id: `tester-rev-${n}-2`,
    revisionNumber: 2,
    approvalStatus,
    supersededAt: null,
    createdAt: ISO("2026-07-02"),
    evaluationReasons: { fixture: true, revision: 2, stage: quote.stage },
  };
  quoteRevisions.push(rev1, rev2);

  const lineDefs = [
    { rev: rev1.id, pos: 0, prod: prodA, qty: 2, disc: disc1, m: m1, variant: `${prodA[0]}-a` },
    { rev: rev1.id, pos: 1, prod: prodB, qty: 1, disc: disc2, m: m2, variant: `${prodB[0]}-a` },
    { rev: rev2.id, pos: 0, prod: prodA, qty: 2, disc: disc1, m: m1, variant: `${prodA[0]}-a` },
    { rev: rev2.id, pos: 1, prod: prodB, qty: 1, disc: disc2, m: m2, variant: `${prodB[0]}-b` },
  ];
  for (const line of lineDefs) {
    const recurring = line.prod[0] === "tester-prod-08" || line.prod[0] === "tester-prod-09";
    quoteLines.push({
      id: `${line.rev}-L${line.pos}`,
      revisionId: line.rev,
      productId: line.prod[0],
      variantId: line.variant,
      planId: recurring ? (line.prod[0] === "tester-prod-09" ? PLAN_Y : PLAN_M) : null,
      billingKind: recurring ? "RECURRING" : "ONE_TIME",
      interval: recurring ? (line.prod[0] === "tester-prod-09" ? "YEARLY" : "MONTHLY") : null,
      quantity: line.qty,
      unitPrice: money(Number(line.prod[7])),
      unitCost: money(Number(line.prod[8])),
      lineDiscountPct: pct(line.disc),
      effectiveDiscountPct: pct(line.disc),
      ceilingPct: pct(ceiling),
      excessPct: pct(Math.max(0, line.disc - ceiling)),
      excessAmount: money(Math.max(0, (Number(line.prod[7]) * line.qty * (line.disc - ceiling)) / 100)),
      taxPct: Number(line.prod[5]),
      lineSubtotal: money(line.m.sub),
      taxAmount: money(line.m.tax),
      lineTotal: money(line.m.total),
      categoryId: line.prod[3],
      stockTracked: line.prod[9],
      position: line.pos,
      createdAt: ISO("2026-07-02"),
    });
  }

  if (quote.stage === "PENDING_APPROVAL" || quote.stage === "REJECTED" || (quote.stage === "CONFIRMED" && needsChain)) {
    const stepStatus0 =
      quote.stage === "PENDING_APPROVAL" ? "PENDING" : quote.stage === "REJECTED" ? "PENDING" : "APPROVED";
    approvalSteps.push({
      id: `tester-step-${n}-0`,
      revisionId: rev2.id,
      stepIndex: 0,
      role: "SALES_MANAGER",
      status: stepStatus0,
      decisionId: null,
      createdAt: ISO("2026-07-03"),
      updatedAt: ISO("2026-07-03"),
    });
    approvalSteps.push({
      id: `tester-step-${n}-1`,
      revisionId: rev2.id,
      stepIndex: 1,
      role: "FINANCE",
      status: quote.stage === "CONFIRMED" ? "APPROVED" : "BLOCKED",
      decisionId: null,
      createdAt: ISO("2026-07-03"),
      updatedAt: ISO("2026-07-03"),
    });
    if (quote.stage === "CONFIRMED") {
      approvalDecisions.push({
        id: `tester-dec-${n}-0`,
        revisionId: rev2.id,
        actorId: MANAGER,
        actorRole: "SALES_MANAGER",
        stepIndex: 0,
        kind: "APPROVE",
        reason: "Tester manager approve",
        createdAt: ISO("2026-07-04"),
      });
      approvalDecisions.push({
        id: `tester-dec-${n}-1`,
        revisionId: rev2.id,
        actorId: FINANCE,
        actorRole: "FINANCE",
        stepIndex: 1,
        kind: "APPROVE",
        reason: "Tester finance approve",
        createdAt: ISO("2026-07-05"),
      });
    }
    if (quote.stage === "REJECTED") {
      approvalDecisions.push({
        id: `tester-dec-${n}-r`,
        revisionId: rev2.id,
        actorId: MANAGER,
        actorRole: "SALES_MANAGER",
        stepIndex: 0,
        kind: "REJECT",
        reason: "Tester reject path",
        createdAt: ISO("2026-07-04"),
      });
    }
  }

  if (quote.stage === "UNDER_NEGOTIATION") {
    portalMessages.push({
      id: `tester-msg-${n}`,
      quoteId: quote.id,
      baseRevisionId: rev2.id,
      lineId: `${rev2.id}-L0`,
      authorId: portalByCustomer[i % 10],
      body: "Please reduce discount wait — tester counter on qty.",
      status: "OPEN",
      proposedDiscountPct: pct(10),
      proposedQty: 3,
      proposedPromisedDate: "2026-10-15T00:00:00.000Z",
      spawnedRevisionId: null,
      createdAt: ISO("2026-07-20"),
    });
  }

  if (quote.stage === "CONFIRMED") {
    const accId = `tester-acc-${n}`;
    const orderId = `tester-ord-${n}`;
    const portalUser = portalByCustomer[i % 10];
    acceptances.push({
      id: accId,
      revisionId: rev2.id,
      actorId: portalUser,
      createdAt: ISO("2026-07-10"),
    });
    const fulfill =
      i % 6 === 0 ? "PENDING" : i % 6 === 1 ? "ALLOCATED" : i % 6 === 2 ? "SHIPPED" : i % 6 === 3 ? "DELIVERED" : "PARTIAL";
    orders.push({
      id: orderId,
      sourceRevisionId: rev2.id,
      acceptanceId: accId,
      customerId: quote.customerId,
      repId: quote.repId,
      teamId: quote.teamId,
      currency: "INR",
      promisedDate: "2026-09-30",
      fulfillmentStatus: fulfill,
      createdAt: ISO("2026-07-10"),
      updatedAt: ISO("2026-07-12"),
    });
    const ol0 = `tester-ol-${n}-0`;
    const ol1 = `tester-ol-${n}-1`;
    orderLines.push({
      id: ol0,
      orderId,
      sourceQuoteLineId: `${rev2.id}-L0`,
      productId: prodA[0],
      variantId: `${prodA[0]}-a`,
      quantity: 2,
      unitPrice: money(price1),
      unitCost: money(Number(prodA[8])),
      lineDiscountPct: pct(disc1),
      taxPct: tax1,
      lineTotal: money(m1.total),
      billingKind: prodA[0] === "tester-prod-08" || prodA[0] === "tester-prod-09" ? "RECURRING" : "ONE_TIME",
      interval: prodA[0] === "tester-prod-09" ? "YEARLY" : prodA[0] === "tester-prod-08" ? "MONTHLY" : null,
      planId: prodA[0] === "tester-prod-09" ? PLAN_Y : prodA[0] === "tester-prod-08" ? PLAN_M : null,
      stockTracked: prodA[9],
      createdAt: ISO("2026-07-10"),
    });
    orderLines.push({
      id: ol1,
      orderId,
      sourceQuoteLineId: `${rev2.id}-L1`,
      productId: prodB[0],
      variantId: `${prodB[0]}-b`,
      quantity: 1,
      unitPrice: money(price2),
      unitCost: money(Number(prodB[8])),
      lineDiscountPct: pct(disc2),
      taxPct: tax2,
      lineTotal: money(m2.total),
      billingKind: "ONE_TIME",
      interval: null,
      planId: null,
      stockTracked: prodB[9],
      createdAt: ISO("2026-07-10"),
    });

    if (fulfill !== "PENDING" && prodA[9]) {
      const resId = `tester-res-${n}`;
      reservations.push({
        id: resId,
        orderLineId: ol0,
        variantId: `${prodA[0]}-a`,
        warehouseId: WH_A,
        quantity: 2,
        status: fulfill === "SHIPPED" || fulfill === "DELIVERED" ? "SHIPPED" : "ACTIVE",
        releasedAt: null,
        createdAt: ISO("2026-07-11"),
        updatedAt: ISO("2026-07-11"),
      });
      if (fulfill === "SHIPPED" || fulfill === "DELIVERED") {
        const shId = `tester-ship-${n}`;
        shipments.push({
          id: shId,
          orderId,
          warehouseId: WH_A,
          status: fulfill === "DELIVERED" ? "DELIVERED" : "SHIPPED",
          shippingCostSnapshot: money(250),
          shippedAt: ISO("2026-07-14"),
          deliveredAt: fulfill === "DELIVERED" ? ISO("2026-07-18") : null,
          createdAt: ISO("2026-07-14"),
          updatedAt: ISO("2026-07-18"),
        });
        shipmentLines.push({
          id: `tester-sl-${n}`,
          shipmentId: shId,
          orderLineId: ol0,
          reservationId: resId,
          quantity: 2,
          createdAt: ISO("2026-07-14"),
        });
      }
    } else if (prodA[9] && fulfill === "PARTIAL") {
      backorders.push({
        id: `tester-bo-${n}`,
        orderLineId: ol0,
        variantId: `${prodA[0]}-a`,
        quantity: 1,
        resolvedAt: null,
        createdAt: ISO("2026-07-11"),
      });
    }

    if (prodA[0] === "tester-prod-08" || prodA[0] === "tester-prod-09") {
      subscriptions.push({
        id: `tester-sub-${n}`,
        sourceOrderLineId: ol0,
        customerId: quote.customerId,
        planId: prodA[0] === "tester-prod-09" ? PLAN_Y : PLAN_M,
        status: "ACTIVE",
        quantity: 2,
        unitPrice: money(price1),
        interval: prodA[0] === "tester-prod-09" ? "YEARLY" : "MONTHLY",
        anchorDay: 10,
        currentPeriodStart: "2026-08-10",
        currentPeriodEnd: prodA[0] === "tester-prod-09" ? "2027-08-10" : "2026-09-10",
        nextBillingDate: prodA[0] === "tester-prod-09" ? "2027-08-10" : "2026-09-10",
        cancelPolicy: "PERIOD_END",
        cancelEffectiveDate: null,
        pausedAt: null,
        pendingPlanId: null,
        pendingPlanEffectiveDate: null,
        createdAt: ISO("2026-07-10"),
        updatedAt: ISO("2026-07-10"),
      });
    }

    const invId = `tester-inv-${n}`;
    invoices.push({
      id: invId,
      customerId: quote.customerId,
      orderId,
      subscriptionId: null,
      kind: "ONE_TIME",
      status: i % 3 === 0 ? "PAID" : i % 3 === 1 ? "PARTIALLY_PAID" : "UNPAID",
      currency: "INR",
      issueDate: "2026-07-11",
      dueDate: "2026-08-10",
      subtotal: money(oneTimeSubtotal),
      taxTotal: money(oneTimeTax),
      total: money(oneTimeTotal),
      createdAt: ISO("2026-07-11"),
      updatedAt: ISO("2026-07-11"),
    });
    invoiceLines.push({
      id: `tester-il-${n}-0`,
      invoiceId: invId,
      description: String(prodA[2]),
      quantity: 2,
      unitPrice: money(price1),
      discountPct: pct(disc1),
      taxPct: tax1,
      lineTotal: money(m1.total),
      createdAt: ISO("2026-07-11"),
    });
    invoiceLines.push({
      id: `tester-il-${n}-1`,
      invoiceId: invId,
      description: String(prodB[2]),
      quantity: 1,
      unitPrice: money(price2),
      discountPct: pct(disc2),
      taxPct: tax2,
      lineTotal: money(m2.total),
      createdAt: ISO("2026-07-11"),
    });

    if (i % 3 !== 2) {
      const payId = `tester-pay-${n}`;
      const keyId = `tester-rk-pay-${n}`;
      const amt = i % 3 === 0 ? oneTimeTotal : Math.round(oneTimeTotal * 0.4 * 100) / 100;
      requestKeys.push({
        id: keyId,
        scope: "PAYMENT",
        key: `tester-payment-${n}`,
        actorId: FINANCE,
        resultKind: "PAYMENT",
        resultId: payId,
        resultPayload: { amount: money(amt) },
        completedAt: ISO("2026-07-20"),
        createdAt: ISO("2026-07-20"),
        updatedAt: ISO("2026-07-20"),
      });
      payments.push({
        id: payId,
        invoiceId: invId,
        amount: money(amt),
        method: i % 2 === 0 ? "BANK_TRANSFER" : "CHEQUE",
        reference: `TESTER-UTR-${n}`,
        paidOn: "2026-07-20",
        recordedById: FINANCE,
        requestKeyId: keyId,
        createdAt: ISO("2026-07-20"),
      });
    }

    requestKeys.push({
      id: `tester-rk-confirm-${n}`,
      scope: "CONFIRM_ORDER",
      key: `tester-confirm-${n}`,
      actorId: portalUser,
      resultKind: "ORDER",
      resultId: orderId,
      resultPayload: { orderId },
      completedAt: ISO("2026-07-10"),
      createdAt: ISO("2026-07-10"),
      updatedAt: ISO("2026-07-10"),
    });
  }

  if (quote.stage === "DRAFT" && i === 0) {
    healthFlags.push({
      id: "tester-flag-stalled",
      type: "STALLED",
      fingerprint: "tester-stalled-quote-01",
      quoteId: quote.id,
      orderId: null,
      reason: "Tester: draft idle past stalledAfterDays",
      detectedAt: ISO("2026-08-20"),
      resolvedAt: null,
      createdAt: ISO("2026-08-20"),
      updatedAt: ISO("2026-08-20"),
    });
    tasks.push({
      id: "tester-task-nudge",
      actionKey: "tester-nudge-quote-01",
      flagId: "tester-flag-stalled",
      quoteId: quote.id,
      orderId: null,
      assigneeId: quote.repId,
      createdById: ADMIN,
      action: "NUDGE",
      status: "OPEN",
      dueDate: "2026-09-08",
      completedAt: null,
      createdAt: ISO("2026-08-20"),
      updatedAt: ISO("2026-08-20"),
    });
  }

  auditEvents.push({
    id: `tester-audit-${n}`,
    entityType: "Quote",
    entityId: quote.id,
    revisionId: `tester-rev-${n}-2`,
    actorId: quote.repId,
    action: "tester.quote.saved",
    reason: "Synthetic tester event",
    metadata: { stage: quote.stage },
    createdAt: ISO("2026-07-02"),
  });
});

creditNotes.push({
  id: "tester-cn-01",
  customerId: "tester-cust-10",
  sourceInvoiceId: invoices[0] ? invoices[0].id : "tester-inv-10",
  reason: "GOODWILL",
  amount: money(500),
  issuedById: FINANCE,
  createdAt: ISO("2026-07-22"),
});
if (invoices[0]) {
  const ck = "tester-rk-credit-01";
  requestKeys.push({
    id: ck,
    scope: "CREDIT_APPLY",
    key: "tester-credit-01",
    actorId: FINANCE,
    resultKind: "CREDIT_APPLICATION",
    resultId: "tester-ca-01",
    resultPayload: { amount: money(500) },
    completedAt: ISO("2026-07-22"),
    createdAt: ISO("2026-07-22"),
    updatedAt: ISO("2026-07-22"),
  });
  creditApplications.push({
    id: "tester-ca-01",
    creditNoteId: "tester-cn-01",
    invoiceId: invoices[0].id,
    amount: money(500),
    requestKeyId: ck,
    createdAt: ISO("2026-07-22"),
  });
}

healthFlags.push({
  id: "tester-flag-discount",
  type: "DISCOUNT_ANOMALY",
  fingerprint: "tester-discount-quote-03",
  quoteId: "tester-quote-03",
  orderId: null,
  reason: "Tester: line discount above Gold ceiling",
  detectedAt: ISO("2026-08-12"),
  resolvedAt: null,
  createdAt: ISO("2026-08-12"),
  updatedAt: ISO("2026-08-12"),
});
tasks.push({
  id: "tester-task-escalate",
  actionKey: "tester-escalate-quote-03",
  flagId: "tester-flag-discount",
  quoteId: "tester-quote-03",
  orderId: null,
  assigneeId: MANAGER,
  createdById: ADMIN,
  action: "ESCALATE",
  status: "OPEN",
  dueDate: "2026-09-05",
  completedAt: null,
  createdAt: ISO("2026-08-12"),
  updatedAt: ISO("2026-08-12"),
});

add("quoteRevisions", quoteRevisions);
add("quoteLines", quoteLines);
add("quoteRevisionApprovalSteps", approvalSteps);
add("approvalDecisions", approvalDecisions);
add("customerAcceptances", acceptances);
add("portalMessages", portalMessages);
add("orders", orders);
add("orderLines", orderLines);

add("warehouses", [
  {
    id: WH_A,
    code: "TESTER-MUM",
    name: "Tester Mumbai",
    shippingCost: money(250),
    companyId: COMPANY,
    active: true,
    createdAt: ISO("2025-01-19"),
    updatedAt: ISO("2025-01-19"),
  },
  {
    id: WH_B,
    code: "TESTER-BLR",
    name: "Tester Bengaluru",
    shippingCost: money(180),
    companyId: COMPANY,
    active: true,
    createdAt: ISO("2025-01-19"),
    updatedAt: ISO("2025-01-19"),
  },
]);

const stocks: Record<string, unknown>[] = [];
let si = 1;
for (const v of variants) {
  if (!String(v.sku).includes("-A") && !String(v.sku).includes("-B")) continue;
  const tracked = productDefs.some((p) => p[0] === v.productId && p[9] === true);
  if (!tracked) continue;
  stocks.push({
    id: `tester-stock-${String(si).padStart(3, "0")}`,
    warehouseId: WH_A,
    variantId: v.id,
    onHand: 40 + (si % 20),
    reserved: si % 7,
    reorderAt: 8,
    createdAt: ISO("2025-04-01"),
    updatedAt: ISO("2025-04-01"),
  });
  si += 1;
}
add("stocks", stocks);
add("reservations", reservations);
add("backorders", backorders);
add("shipments", shipments);
add("shipmentLines", shipmentLines);
add("subscriptions", subscriptions);
add("invoices", invoices);
add("invoiceLines", invoiceLines);
add("creditNotes", creditNotes);
add("requestKeys", requestKeys);
add("payments", payments);
add("creditApplications", creditApplications);

add("recommendationRules", [
  {
    id: "tester-rec-01",
    baseProductId: "tester-prod-01",
    candidateProductId: "tester-prod-06",
    copurchaseScore: "0.6200",
    trainedLift: "1.150000",
    promotionTag: "bundle-mat",
    minMarginPct: pct(18),
    status: "ACTIVE",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
  {
    id: "tester-rec-02",
    baseProductId: "tester-prod-02",
    candidateProductId: "tester-prod-05",
    copurchaseScore: "0.4100",
    trainedLift: "1.080000",
    promotionTag: null,
    minMarginPct: pct(15),
    status: "ACTIVE",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
  {
    id: "tester-rec-03",
    baseProductId: "tester-prod-03",
    candidateProductId: "tester-prod-04",
    copurchaseScore: "0.7300",
    trainedLift: "1.220000",
    promotionTag: "dock-with-monitor",
    minMarginPct: pct(20),
    status: "ACTIVE",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
  {
    id: "tester-rec-04",
    baseProductId: "tester-prod-10",
    candidateProductId: "tester-prod-04",
    copurchaseScore: "0.3300",
    trainedLift: null,
    promotionTag: null,
    minMarginPct: pct(12),
    status: "ACTIVE",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
  {
    id: "tester-rec-05",
    baseProductId: "tester-prod-01",
    candidateProductId: "tester-prod-08",
    copurchaseScore: "0.2800",
    trainedLift: "1.040000",
    promotionTag: "care-upsell",
    minMarginPct: pct(40),
    status: "ACTIVE",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
  {
    id: "tester-rec-06",
    baseProductId: "tester-prod-07",
    candidateProductId: "tester-prod-02",
    copurchaseScore: "0.5100",
    trainedLift: "1.090000",
    promotionTag: null,
    minMarginPct: pct(22),
    status: "ARCHIVED",
    createdAt: ISO("2025-05-01"),
    updatedAt: ISO("2025-05-01"),
  },
]);

add("healthFlags", healthFlags);
add("tasks", tasks);
add("auditEvents", auditEvents);

const n = totalRecords();
if (n < 200 || n > 320) {
  throw new Error(`Record count ${n} is outside 200–300 (±20). Adjust generator.`);
}

const out = {
  metadata: {
    seed: "dealflow360-tester-dataset-v1",
    generatedAt: "2026-09-06T09:00:00+05:30",
    application: "DealFlow360",
    purpose: "Tester dummy data aligned to prisma/schema.prisma. Synthetic only. No real people or secrets.",
    recordCount: n,
    counts,
    passwordRule: "Importer hashes Synthetic-<user.id>-2026! (see scripts/seed-synthetic-dataset.ts)",
    load: "pnpm tester:seed  (add-only; does not wipe Nexa demo)",
    idsAreStable: true,
    moneyEncoding: "decimal-string",
    bronzeDatabaseValue: "STANDARD",
  },
  ...fixture,
};

const dest = path.join(process.cwd(), "data", "tester-dataset.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${dest} (${n} records)`);
console.log(JSON.stringify(counts, null, 2));
