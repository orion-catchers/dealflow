/**
 * Ruchir's lane contracts — Auth, Engine 3 billing, plans, approval-screen DTOs.
 *
 * Conventions match blueprint §7: string IDs, percentages 0–100, money as
 * decimal strings, ISO dates, camelCase. Pure engine functions never import
 * the database. Cross-lane changes need an interface note in memory.md.
 */
import type { Actor, Money, Pct, PlanRef, Role } from "@/contracts/harsh";

export type { Actor, Money, Pct, PlanRef, Role };

export type IsoDate = string;
export type IsoTimestamp = string;

export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";
export type BillingInterval = "MONTHLY" | "QUARTERLY" | "YEARLY";
export type CancelPolicy = "IMMEDIATE" | "PERIOD_END";
export type SubscriptionStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type SubscriptionChangeKind = "QUANTITY" | "PLAN" | "PAUSE" | "RESUME" | "CANCEL";
export type InvoiceKind = "ONE_TIME" | "RECURRING" | "ADJUSTMENT";
export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID";
export type PaymentMethod = "BANK_TRANSFER" | "CARD" | "CHEQUE" | "CASH" | "OTHER";
export type CreditReason = "CANCELLATION" | "PRORATION" | "GOODWILL";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  customerId?: string;
  companyId?: string;
  active: boolean;
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  customerId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserAdminRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  teamId: string | null;
  customerIds: string[];
  createdAt: IsoTimestamp;
}

export interface UserPatchInput {
  status?: AccountStatus;
  role?: Role;
  teamId?: string | null;
  customerIds?: string[];
}

export interface SubscriptionPlanRecord {
  id: string;
  code: string;
  name: string;
  interval: BillingInterval;
  cancelPolicy: CancelPolicy;
  listPrice: Money;
  archivedAt: IsoTimestamp | null;
}

export interface SubscriptionRecord {
  id: string;
  sourceOrderLineId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  quantity: number;
  unitPrice: Money;
  interval: BillingInterval;
  anchorDay: number;
  currentPeriodStart: IsoDate;
  currentPeriodEnd: IsoDate;
  nextBillingDate: IsoDate | null;
  cancelPolicy: CancelPolicy;
  cancelEffectiveDate: IsoDate | null;
  pausedAt: IsoTimestamp | null;
  pendingPlanId: string | null;
  pendingPlanName: string | null;
  pendingPlanEffectiveDate: IsoDate | null;
}

export interface SubscriptionChangeRecord {
  id: string;
  subscriptionId: string;
  kind: SubscriptionChangeKind;
  beforeQuantity: number | null;
  afterQuantity: number | null;
  beforePlanId: string | null;
  afterPlanId: string | null;
  effectiveDate: IsoDate;
  remainingDays: number | null;
  periodDays: number | null;
  adjustmentAmount: Money | null;
  adjustmentInvoiceId: string | null;
  createdAt: IsoTimestamp;
}

export interface InvoiceLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  discountPct: Pct;
  taxPct: Pct;
  lineTotal: Money;
}

export interface InvoiceRecord {
  id: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
  subscriptionId: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  currency: string;
  issueDate: IsoDate;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dueDate: IsoDate;
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  paidAmount: Money;
  creditedAmount: Money;
  outstanding: Money;
  lines: InvoiceLineRecord[];
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: Money;
  method: PaymentMethod;
  reference: string;
  paidOn: IsoDate;
  recordedById: string;
  createdAt: IsoTimestamp;
  replayed: boolean;
}

export interface CreditNoteRecord {
  id: string;
  customerId: string;
  sourceInvoiceId: string;
  reason: CreditReason;
  amount: Money;
  issuedById: string;
  appliedAmount: Money;
  createdAt: IsoTimestamp;
}

export interface CreditApplicationRecord {
  id: string;
  creditNoteId: string;
  invoiceId: string;
  amount: Money;
  createdAt: IsoTimestamp;
}

export interface SubscriptionDetail {
  subscription: SubscriptionRecord;
  changes: SubscriptionChangeRecord[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
}

export interface InvoiceDetail {
  invoice: InvoiceRecord;
  payments: PaymentRecord[];
  creditNotes: CreditNoteRecord[];
  creditApplications: CreditApplicationRecord[];
}

export interface BillingInitResult {
  orderId: string;
  oneTimeInvoice: InvoiceRecord | null;
  subscriptions: SubscriptionRecord[];
  replayed: boolean;
}

export interface DueBillingResult {
  invoices: InvoiceRecord[];
  replayed: boolean;
}

export interface ConfirmedOrderForBilling {
  orderId: string;
  customerId: string;
  currency: string;
  confirmedAt: IsoDate;
  lines: Array<{
    orderLineId: string;
    description: string;
    quantity: number;
    unitPrice: Money;
    discountPct: Pct;
    taxPct: Pct;
    lineTotal: Money;
    billingKind: "ONE_TIME" | "RECURRING";
    interval: BillingInterval | null;
    planId: string | null;
  }>;
}

export interface CalendarPeriod {
  start: IsoDate;
  end: IsoDate;
  days: number;
}

export interface ProrationInput {
  currentPeriodAmount: Money;
  newPeriodAmount: Money;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  effectiveDate: IsoDate;
}

export interface ProrationResult {
  remainingDays: number;
  periodDays: number;
  adjustmentAmount: Money;
}

export type ApprovalListFilter = "PENDING" | "RETURNED" | "COMPLETED" | "ALL";

export interface ApprovalListItem {
  revisionId: string;
  quoteId: string;
  customerName: string;
  requiredLevel: "MANAGER" | "FINANCE" | "NONE";
  assignedReviewerRole: Role | null;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  listStatus: "PENDING" | "RETURNED" | "COMPLETED";
  weightedExcessPct: Pct;
  createdAt: IsoTimestamp;
}

export interface ApprovalBreachRow {
  reason: string;
  excessPointsPct: Pct;
  excessAmount: Money;
}

export interface ApprovalStepView {
  stepIndex: number;
  role: Role;
  status: "PENDING" | "APPROVED" | "BLOCKED";
}

export interface ApprovalDecisionView {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  stepIndex: number;
  kind: "APPROVE" | "REJECT" | "RETURN";
  reason: string;
  createdAt: IsoTimestamp;
}

export interface ApprovalDetail {
  revisionId: string;
  quoteId: string;
  customerName: string;
  riskLevel: "NONE" | "MANAGER" | "FINANCE";
  weightedExcessPct: Pct;
  worstLineExcessPct: Pct;
  reasons: string[];
  breaches: ApprovalBreachRow[];
  chain: ApprovalStepView[];
  history: ApprovalDecisionView[];
  canAct: boolean;
}

export interface ApprovalActionInput {
  revisionId: string;
  decision: "APPROVE" | "REJECT" | "RETURN";
  reason: string;
  actor: Actor;
}
