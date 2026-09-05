import type {
  ApprovalRecord,
  AtharvaFixtures,
  DashboardSummary,
  HealthEvaluation,
  PolicySnapshot,
  PricedQuoteLine,
  Quote,
  QuoteRevision,
} from "../contracts/atharva";

const policy: PolicySnapshot = {
  policyVersionId: "policy-v1",
  capturedAt: "2026-09-05T09:00:00.000Z",
  rules: {
    tierId: "tier-gold",
    tierName: "Gold",
    defaultCeilingPct: "15",
    categoryCeilingsPct: {
      Hardware: "15",
      Services: "10",
    },
    managerThresholdPct: "0",
    financeWorstLineThresholdPct: "5",
    financeWeightedThresholdPct: "3",
    minimumHistorySamples: 3,
  },
};

const withinLimitLine: PricedQuoteLine = {
  lineId: "line-laptop-1",
  productId: "product-laptop",
  variantId: "variant-laptop-gold",
  description: "Gold laptop",
  quantity: 10,
  unitPrice: "50000.00",
  unitCost: "40000.00",
  priceSnapshot: "50000.00",
  costSnapshot: "40000.00",
  taxPct: "0",
  discountPct: "12",
  billingInterval: "ONE_TIME",
  stockTracked: true,
  undiscountedAmount: "500000.00",
  discountAmount: "60000.00",
  taxAmount: "0.00",
  totalAmount: "440000.00",
  marginAmount: "40000.00",
  marginPct: "9.09",
};

const riskyServiceLine: PricedQuoteLine = {
  lineId: "line-support-1",
  productId: "product-support",
  variantId: "variant-support-standard",
  description: "Monthly support seat",
  quantity: 10,
  unitPrice: "1000.00",
  unitCost: "400.00",
  priceSnapshot: "1000.00",
  costSnapshot: "400.00",
  taxPct: "0",
  discountPct: "16",
  billingInterval: "MONTHLY",
  stockTracked: false,
  undiscountedAmount: "10000.00",
  discountAmount: "1600.00",
  taxAmount: "0.00",
  totalAmount: "8400.00",
  marginAmount: "4400.00",
  marginPct: "52.38",
};

const pricingFor = (lines: PricedQuoteLine[], orderDiscountPct: string) => ({
  lines,
  orderDiscountPct,
  effectiveDiscountPct: orderDiscountPct,
  totals: {
    currency: "INR" as const,
    oneTimeTotal: "440000.00",
    recurringTotals: { MONTHLY: "8400.00" },
    taxTotal: "0.00",
    costTotal: "404000.00",
    marginTotal: "44400.00",
    marginPct: "9.19",
  },
});

const approvedEvaluation = {
  status: "NOT_REQUIRED" as const,
  riskLevel: "NONE" as const,
  requiredApprovalChain: [],
  breaches: [],
  weightedExcessPct: "0.00",
  worstLineExcessPct: "0.00",
  reasons: ["All line discounts are within configured ceilings."],
  policySnapshot: policy,
};

const pendingEvaluation = {
  status: "PENDING" as const,
  riskLevel: "FINANCE" as const,
  requiredApprovalChain: ["MANAGER", "FINANCE"] as ["MANAGER", "FINANCE"],
  breaches: [
    {
      lineId: riskyServiceLine.lineId,
      reason: "Services discount exceeds the configured 10% ceiling.",
      excessPointsPct: "6.00",
      excessAmount: "600.00",
    },
  ],
  weightedExcessPct: "0.98",
  worstLineExcessPct: "6.00",
  reasons: ["Worst-line excess is above the Finance threshold."],
  policySnapshot: policy,
};

const approvedRevision: QuoteRevision = {
  id: "revision-routine-1",
  quoteId: "quote-routine",
  revisionNumber: 1,
  createdAt: "2026-09-04T10:00:00.000Z",
  createdBy: "rep-arjun",
  currency: "INR",
  promisedDate: "2026-09-15",
  lines: [withinLimitLine],
  pricing: pricingFor([withinLimitLine], "0"),
  evaluation: approvedEvaluation,
  approvalStatus: "NOT_REQUIRED",
};

const pendingRevision: QuoteRevision = {
  id: "revision-exception-2",
  quoteId: "quote-exception",
  revisionNumber: 2,
  createdAt: "2026-09-05T08:30:00.000Z",
  createdBy: "customer-neha",
  currency: "INR",
  promisedDate: "2026-09-20",
  lines: [withinLimitLine, riskyServiceLine],
  pricing: pricingFor([withinLimitLine, riskyServiceLine], "0"),
  evaluation: pendingEvaluation,
  approvalStatus: "PENDING",
};

const quotes: Quote[] = [
  {
    id: "quote-routine",
    customerId: "customer-acme",
    salesRepId: "rep-arjun",
    stage: "APPROVED",
    currentRevisionId: approvedRevision.id,
    currentRevisionNumber: approvedRevision.revisionNumber,
    lastBusinessActivityAt: "2026-09-04T10:00:00.000Z",
    revisions: [approvedRevision],
  },
  {
    id: "quote-exception",
    customerId: "customer-acme",
    salesRepId: "rep-arjun",
    stage: "PENDING_APPROVAL",
    currentRevisionId: pendingRevision.id,
    currentRevisionNumber: pendingRevision.revisionNumber,
    lastBusinessActivityAt: "2026-09-05T08:30:00.000Z",
    revisions: [pendingRevision],
  },
];

const approvals: ApprovalRecord[] = [
  {
    id: "approval-exception-manager",
    revisionId: pendingRevision.id,
    level: "MANAGER",
    actorId: "manager-sana",
    decision: "APPROVE",
    reason: "Strategic Acme renewal opportunity.",
    createdAt: "2026-09-05T09:00:00.000Z",
  },
];

const health: HealthEvaluation = {
  settings: {
    stalledAfterDays: 5,
    anomalyMinimumSamples: 3,
    anomalyMarginAboveAveragePct: "10",
  },
  flags: [
    {
      id: "health-stalled-quote",
      type: "STALLED_QUOTE",
      status: "ACTIVE",
      quoteId: "quote-routine",
      reason:
        "Quote has had no meaningful business activity for more than 5 days.",
      detectedAt: "2026-09-05T09:00:00.000Z",
    },
    {
      id: "health-paid-delivery",
      type: "DELIVERY_RISK",
      status: "ACTIVE",
      orderId: "order-paid-backorder",
      reason: "Payment is complete but one or more goods remain undelivered.",
      detectedAt: "2026-09-05T09:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-stalled-nudge",
      healthFlagId: "health-stalled-quote",
      dealId: "quote-routine",
      assigneeId: "rep-arjun",
      status: "OPEN",
      dueDate: "2026-09-06",
      action: "NUDGE",
    },
  ],
};

const dashboard: DashboardSummary = {
  pendingApprovals: 1,
  openQuotes: 2,
  atRiskDeals: 2,
  recentEvents: [
    {
      id: "event-revision-created",
      label: "Customer counterproposal requires approval",
      occurredAt: "2026-09-05T08:30:00.000Z",
      quoteId: "quote-exception",
    },
    {
      id: "event-delivery-risk",
      label: "Paid order still has an undelivered item",
      occurredAt: "2026-09-05T09:00:00.000Z",
      orderId: "order-paid-backorder",
    },
  ],
};

export const atharvaFixtures: AtharvaFixtures = {
  actors: [
    { id: "rep-arjun", role: "SALES_REP" },
    { id: "manager-sana", role: "SALES_MANAGER" },
    { id: "finance-farah", role: "FINANCE" },
    { id: "customer-neha", role: "CUSTOMER", customerId: "customer-acme" },
  ],
  policy,
  quotes,
  approvals,
  health,
  dashboard,
};
