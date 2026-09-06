import type { BillingInterval, RecommendationRule, PricedCandidate } from './krishna';
export type Role = 'ADMIN' | 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE_OPS' | 'CUSTOMER';
export interface Actor { id: string; name: string; email: string; role: Role; active: boolean; customerId?: string; companyId?: string }
export interface Customer { id: string; name: string; email: string; tier: string; currency: string; repId: string; companyId?: string }
export interface Variant { id: string; name: string; extraPrice: string }
export interface Product { id: string; name: string; category: string; unit: string; description: string; price: string; cost: string; taxPct: number; active: boolean; stockTracked: boolean; interval: BillingInterval; planId: string; variants: Variant[]; companyId?: string }
export interface PriceRule { id: string; productId: string; variantId?: string | null; tier: string; currency: string; price: string }
export interface Line { id: string; productId: string; variantId: string; description: string; quantity: number; discountPct: number; unitPrice: string; unitCost: string; taxPct: number; tax: string; net: string; total: string; profit: string; interval: BillingInterval; stockTracked: boolean }
export interface Total { interval: BillingInterval; net: string; tax: string; total: string; profit: string; marginPct: number }
export interface Evaluation { status: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'; chain: Role[]; step: number; reasons: string[]; worstExcess: number }
export interface DealRevision { revision: string; lines: Line[]; totals: Total[]; orderDiscountPct: number; promisedDate: string | null; evaluation: Evaluation; at: string }
export interface Quote extends DealRevision { id: string; customerId: string; repId: string; name: string; currency: string; stage: string; sent: boolean; history: DealRevision[]; events: Event[]; requestedDate: string | null; dateReviewPending: boolean; orderId?: string; acceptedAt?: string }
export interface Event { id: string; at: string; actor: string; text: string; revision?: string }
export interface Message { id: string; quoteId: string; revision: string; lineId: string | null; senderId: string; senderName: string; text: string; at: string; kind: 'QUESTION' | 'PROPOSAL' | 'RESPONSE'; requestedDate?: string }
export interface Proposal { id: string; quoteId: string; fromRevision: string; proposedRevision: string; actorId: string; at: string; lineChanges: { lineId: string; quantity?: number; discountPct?: number; comment?: string }[]; requestedDate?: string; status: string }
export interface Warehouse { id: string; name: string; shippingCost: string; active: boolean; companyId?: string }
export interface Stock { id: string; warehouseId: string; variantId: string; onHand: number; reserved: number; threshold: number }
export interface Allocation { lineId: string; warehouseId: string; quantity: number }
export interface FulfillmentPreview { orderId: string; allocations: Allocation[]; backorders: { lineId: string; quantity: number }[]; cost: string }
export interface Order { id: string; quoteId: string; revision: string; customerId: string; currency: string; lines: Line[]; totals: Total[]; status: string; promisedDate: string | null; allocations: Allocation[]; backorders: { lineId: string; quantity: number }[]; events: Event[] }
export interface Plan { id: string; name: string; interval: BillingInterval; prorate: boolean; cancellation: 'IMMEDIATE_CREDIT' | 'PERIOD_END'; price: string }
export interface Subscription { id: string; orderId: string; customerId: string; productId: string; planId: string; quantity: number; unitPrice: string; status: string; periodStart: string; periodEnd: string; nextBill: string; pendingPlanId?: string; events: Event[] }
export interface Invoice { id: string; orderId: string; subscriptionId?: string; period?: string; customerId: string; currency: string; dueDate: string; lines: { id: string; description: string; quantity: number; unitPrice: string; discountPct: number; net: string; tax: string; total: string }[]; net: string; tax: string; total: string; paid: string; credited: string; outstanding: string; status: string; events: Event[] }
export interface Payment { id: string; invoiceId: string; amount: string; method: string; reference: string; date: string; recordedByName?: string }
export interface Policy { tierLimits: Record<string, number>; categoryLimits: Record<string, number>; financeExcess: number; financeWeighted: number; budget: string }
export interface HealthSettings { stalledDays: number; anomalyPoints: number; minimumHistory: number }
export interface HealthFlag { id: string; quoteId: string; type: string; reason: string; status: string; detectedAt: string }
export interface Task { id: string; quoteId: string; assigneeId: string; dueDate: string; text: string; status: string }
export interface DataState { customers: Customer[]; products: Product[]; priceRules: PriceRule[]; quotes: Quote[]; orders: Order[]; warehouses: Warehouse[]; stock: Stock[]; plans: Plan[]; subscriptions: Subscription[]; invoices: Invoice[]; payments: Payment[]; rules: RecommendationRule[]; proposals: Proposal[]; messages: Message[]; policy: Policy; healthSettings: HealthSettings; flags: HealthFlag[]; tasks: Task[]; users: Actor[] }
export interface SessionInfo { actor: Actor; mode: 'LIVE' | 'DEV FIXTURE' }
export interface ProposalInput { expectedRevision: string; requestKey: string; lineChanges: { lineId: string; quantity?: number; discountPct?: number; comment?: string }[]; requestedDeliveryDate?: string }
export interface CanonicalPort {
  priceCandidate(quote: Quote, product: Product, ruleId: string): PricedCandidate;
  addLine(quote: Quote, productId: string, variantId: string, quantity: number, actor: Actor): Quote;
  revise(quote: Quote, changes: ProposalInput['lineChanges'], actor: Actor): Quote;
  confirm(quote: Quote, actor: Actor): Order;
}
export interface TransactionPort {
  quote(id: string): Quote | undefined;
  customerQuote(id: string, customerId: string): Quote | undefined;
  product(id: string): Product | undefined;
  rules(): RecommendationRule[];
  saveRules(rules: RecommendationRule[]): void;
  appendProposal(proposal: Proposal): void;
  appendMessage(message: Message): void;
  replay<T>(scope: string, key: string, fingerprint: string, perform: () => T): T;
  canonical: CanonicalPort;
}
export interface ApplicationAdapter {
  mode: 'LIVE' | 'DEV FIXTURE';
  authenticate(token: string | undefined): Promise<Actor | null>;
  login(email: string, password: string): Promise<{actor: Actor; token: string}>;
  logout(token: string): Promise<void>;
  signup(name: string, email: string, password: string): Promise<void>;
  read(): Promise<DataState>;
  readCustomer(customerId: string): Promise<DataState>;
  fulfillmentPreview(actor: Actor, orderId: string): Promise<FulfillmentPreview>;
  transaction<T>(perform: (tx: TransactionPort) => T): Promise<T>;
  command(actor: Actor, action: string, input: Record<string, unknown>): Promise<unknown>;
}
