/** Krishna-owned adapter proposal. Producer bindings require owner review. */
export type DecimalString = string;
export type ConnectionStatus = 'LIVE' | 'DEV FIXTURE' | 'NOT CONNECTED';
export type BillingInterval = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type ApiResult<T> = { data: T } | {
  error: { code: string; message: string; details?: unknown };
};
export type RevisionRequest = { quoteId: string; expectedRevision: string; requestKey: string };

/** Render slots become ReactNode in the component implementation. */
export interface PageHeaderProps<Slot> { title: string; description?: string; actions?: Slot }
export interface StatusBadgeProps { status: string; label?: string }
export interface MoneyProps { amount: DecimalString; currency: string }
export interface DialogProps<Slot> {
  open: boolean; onClose: () => void; title: string; children: Slot; footer?: Slot | null;
}
export interface DataTableProps<Row, Slot> {
  columns: readonly { id: string; heading: string; render: (row: Row) => Slot }[];
  rows: readonly Row[]; rowKey: (row: Row) => string; loading: boolean; emptyMessage: string;
}
export type RemoteData<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; connection: ConnectionStatus; data: T };

export interface RecommendationRule {
  id: string;
  baseProductId: string | null; // null is an explicit fallback rule
  candidateProductId: string;
  coPurchaseScore: number;
  promotionLabel: string | null;
  minimumMarginPct: number;
  active: boolean;
}

/** Server-produced canonical preview, after customer pricing and all discounts.
 * Never populate these fields with browser pricing or catalog-only estimates.
 * Percentages are 0..100; margin change is signed percentage points.
 */
export interface PricedCandidate {
  ruleId: string;
  productId: string;
  variantId: string;
  name: string;
  active: boolean;
  compatible: boolean;
  quoteId: string;
  revision: string;
  currency: string;
  quantity: number;
  interval: BillingInterval;
  candidateMarginPct: number;
  incrementalProfit: DecimalString;
  marginChangePoints: number | null; // null when the prior group has no margin
}
export interface Recommendation {
  productId: string; variantId: string; name: string; quantity: number;
  reason: string; promotionLabel: string | null;
  impact: {
    currency: string; interval: BillingInterval; incrementalProfit: DecimalString;
    candidateMarginPct: number; marginChangePoints: number | null;
  };
}
export interface RecommendationInput {
  quoteId: string; revision: string; currency: string;
  presentProductIds: readonly string[];
  dismissedProductIds: readonly string[];
  rules: readonly RecommendationRule[];
  candidates: readonly PricedCandidate[];
}

export interface PortalLine {
  id: string; description: string; quantity: number; unitPrice: DecimalString;
  discountPct: number; taxAmount: DecimalString; total: DecimalString;
  interval: BillingInterval;
}
export interface PortalQuote {
  id: string; revision: string; currency: string; status: string;
  promisedDeliveryDate: string | null;
  lines: PortalLine[];
  totals: { interval: BillingInterval; subtotal: DecimalString; tax: DecimalString; total: DecimalString }[];
}
export interface PortalActor { id: string; role: string; active: boolean; customerId?: string }
export interface PortalReadRepository {
  /** SQL predicate must include both quoteId AND customerId before fetching lines. */
  findQuoteForCustomer(quoteId: string, customerId: string): Promise<(PortalQuote & { customerId: string }) | null>;
}
export interface ProposalRequest extends RevisionRequest {
  lineChanges: { lineId: string; comment?: string; quantity?: number; discountPct?: number }[];
  requestedDeliveryDate?: string;
}
export interface CanonicalQuotePort<QuoteResult, ProposalResult, ConfirmationResult> {
  addLine(request: RevisionRequest & { productId: string; variantId: string; quantity: number }): Promise<QuoteResult>;
  /** Producer must reevaluate proposed terms and retain immutable history. */
  proposeRevision(request: ProposalRequest, actor: PortalActor): Promise<ProposalResult>;
  /** Producer owns transactional approval/revision checks and repeat-safe order creation. */
  confirmOrder(request: RevisionRequest, actor: PortalActor): Promise<ConfirmationResult>;
}

export type RecommendationPreviewRequest = {
  quoteId: string; expectedRevision: string; customerId: string; dismissedProductIds: readonly string[];
};
export interface RecommendationPreviewPort {
  /** Producer resolves customer pricing, discounts, compatibility and margin. */
  preview(request: RecommendationPreviewRequest): Promise<RecommendationInput>;
}

export interface ProposalResult {
  quote: PortalQuote;
  proposalId: string;
  proposedRevision: string;
  approvalStatus: string;
  messages: PortalMessage[];
}
export interface ConfirmationResult {
  orderId: string;
  quoteId: string;
  revision: string;
  created: boolean;
  fulfillmentStatus: string;
}
export interface PortalMessage {
  id: string; sender: 'CUSTOMER' | 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE_OPS';
  createdAt: string; body: string; lineId: string | null; kind: 'QUESTION' | 'PROPOSAL' | 'RESPONSE';
}
export interface PortalNegotiationView {
  current: PortalQuote;
  proposed: PortalQuote | null;
  messages: PortalMessage[];
  approvalStatus: string;
  acceptance: { revision: string; acceptedAt: string } | null;
}
export interface PortalNegotiationPort {
  proposeRevision(request: ProposalRequest, actor: PortalActor): Promise<ProposalResult>;
  confirmOrder(request: RevisionRequest, actor: PortalActor): Promise<ConfirmationResult>;
}
export type PortalProposalInput = Omit<ProposalRequest, 'requestKey'> & { requestKey?: string };
export type PortalConfirmationInput = Omit<RevisionRequest, 'requestKey'> & { requestKey?: string };

export interface PortalOrderLine { id: string; description: string; quantity: number; status: string }
export interface PortalOrder {
  id: string; quoteId: string; revision: string; status: string; promisedDeliveryDate: string | null;
  lines: PortalOrderLine[];
}
export interface PortalInvoiceLine { id: string; description: string; quantity: number; total: DecimalString }
export interface PortalInvoice {
  id: string; status: string; currency: string; dueDate: string; subtotal: DecimalString;
  tax: DecimalString; total: DecimalString; outstanding: DecimalString; lines: PortalInvoiceLine[];
}
export interface PortalOrderReadRepository {
  findOrderForCustomer(orderId: string, customerId: string): Promise<(PortalOrder & { customerId: string }) | null>;
}
export interface PortalInvoiceReadRepository {
  findInvoiceForCustomer(invoiceId: string, customerId: string): Promise<(PortalInvoice & { customerId: string }) | null>;
}

export interface QuoteBuilderLine {
  id: string; productId: string; variantId: string; description: string; quantity: number;
  discountPct: number; interval: BillingInterval; unitPrice: DecimalString;
}
export interface QuoteBuilderSnapshot {
  quoteId: string; revision: string; customerId: string; customerName: string; currency: string;
  lines: QuoteBuilderLine[];
  totals: { interval: BillingInterval; subtotal: DecimalString; tax: DecimalString; total: DecimalString }[];
  margin: { amount: DecimalString; percentage: number } | null;
  approvalStatus: string; connection: ConnectionStatus;
}
