export type Id = string;
export type DecimalString = string;
export type ISODate = string;
export type Currency = "INR";
export type BillingInterval = "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type QuoteStage =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "UNDER_NEGOTIATION"
  | "CONFIRMED"
  | "REJECTED";
export type RevisionApprovalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";
export type ApprovalLevel = "MANAGER" | "FINANCE";
export type ApprovalDecision = "APPROVE" | "RETURN" | "REJECT";
export type HealthFlagType =
  | "STALLED_QUOTE"
  | "DISCOUNT_ANOMALY"
  | "DELIVERY_RISK";
export type HealthFlagStatus = "ACTIVE" | "RESOLVED";

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_INPUT";
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface Actor {
  id: Id;
  role:
    | "SALES_REP"
    | "SALES_MANAGER"
    | "FINANCE"
    | "OPERATIONS"
    | "ADMIN"
    | "CUSTOMER";
  customerId?: Id;
}

export interface QuoteLineInput {
  productId: Id;
  variantId?: Id;
  category?: string;
  description: string;
  quantity: number;
  unitPrice: DecimalString;
  unitCost: DecimalString;
  taxPct: DecimalString;
  discountPct: DecimalString;
  billingInterval: BillingInterval;
  stockTracked: boolean;
}

export interface PricedQuoteLine extends QuoteLineInput {
  lineId: Id;
  priceSnapshot: DecimalString;
  costSnapshot: DecimalString;
  undiscountedAmount: DecimalString;
  discountAmount: DecimalString;
  taxAmount: DecimalString;
  totalAmount: DecimalString;
  marginAmount: DecimalString;
  marginPct: DecimalString;
}

export interface PricingTotals {
  currency: Currency;
  oneTimeTotal: DecimalString;
  recurringTotals: Partial<
    Record<Exclude<BillingInterval, "ONE_TIME">, DecimalString>
  >;
  taxTotal: DecimalString;
  costTotal: DecimalString;
  marginTotal: DecimalString;
  marginPct: DecimalString;
}

export interface PricingResult {
  lines: PricedQuoteLine[];
  totals: PricingTotals;
  orderDiscountPct: DecimalString;
  effectiveDiscountPct: DecimalString;
}

export interface PolicyRule {
  tierId: Id;
  tierName: string;
  defaultCeilingPct: DecimalString;
  categoryCeilingsPct: Record<string, DecimalString>;
  managerThresholdPct: DecimalString;
  financeWorstLineThresholdPct: DecimalString;
  financeWeightedThresholdPct: DecimalString;
  minimumHistorySamples: number;
}

export interface PolicySnapshot {
  policyVersionId: Id;
  rules: PolicyRule;
  capturedAt: ISODate;
}

export interface PolicyBreach {
  lineId?: Id;
  reason: string;
  excessPointsPct: DecimalString;
  excessAmount: DecimalString;
}

export interface PolicyEvaluation {
  status: "NOT_REQUIRED" | "PENDING";
  riskLevel: "NONE" | "MANAGER" | "FINANCE";
  requiredApprovalChain: ApprovalLevel[];
  breaches: PolicyBreach[];
  weightedExcessPct: DecimalString;
  worstLineExcessPct: DecimalString;
  reasons: string[];
  policySnapshot: PolicySnapshot;
}

export interface QuoteRevision {
  id: Id;
  quoteId: Id;
  revisionNumber: number;
  createdAt: ISODate;
  createdBy: Id;
  currency: Currency;
  promisedDate?: string;
  lines: PricedQuoteLine[];
  pricing: PricingResult;
  evaluation: PolicyEvaluation;
  approvalStatus: RevisionApprovalStatus;
  customerAcceptedAt?: ISODate;
  customerAcceptedBy?: Id;
}

export interface Quote {
  id: Id;
  customerId: Id;
  salesRepId: Id;
  stage: QuoteStage;
  currentRevisionId: Id;
  currentRevisionNumber: number;
  lastBusinessActivityAt: ISODate;
  revisions: QuoteRevision[];
}

export interface ApprovalRecord {
  id: Id;
  revisionId: Id;
  level: ApprovalLevel;
  actorId: Id;
  decision: ApprovalDecision;
  reason: string;
  createdAt: ISODate;
}

export interface ConfirmOrderInput {
  quoteId: Id;
  expectedRevision: number;
  customerId: Id;
  requestKey: string;
}

export interface OrderReady {
  orderId: Id;
  sourceQuoteId: Id;
  sourceRevisionId: Id;
  customerId: Id;
  status: "PENDING_FULFILLMENT";
  billingInitialization: "PENDING" | "CONNECTED";
  fulfillmentInitialization: "PENDING" | "CONNECTED";
}

export interface HealthFlag {
  id: Id;
  type: HealthFlagType;
  status: HealthFlagStatus;
  quoteId?: Id;
  orderId?: Id;
  reason: string;
  detectedAt: ISODate;
  resolvedAt?: ISODate;
}

export interface HealthTask {
  id: Id;
  healthFlagId: Id;
  dealId: Id;
  assigneeId: Id;
  status: "OPEN" | "DONE";
  dueDate: string;
  action: "NUDGE" | "ESCALATE";
}

export interface HealthSettings {
  stalledAfterDays: number;
  anomalyMinimumSamples: number;
  anomalyMarginAboveAveragePct: DecimalString;
}

export interface HealthEvaluation {
  flags: HealthFlag[];
  tasks: HealthTask[];
  settings: HealthSettings;
}

export interface DashboardSummary {
  pendingApprovals: number;
  openQuotes: number;
  atRiskDeals: number;
  recentEvents: Array<{
    id: Id;
    label: string;
    occurredAt: ISODate;
    quoteId?: Id;
    orderId?: Id;
  }>;
}

export interface AtharvaFixtures {
  actors: Actor[];
  policy: PolicySnapshot;
  quotes: Quote[];
  approvals: ApprovalRecord[];
  health: HealthEvaluation;
  dashboard: DashboardSummary;
}
