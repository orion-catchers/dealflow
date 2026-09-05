/**
 * Harsh's lane contracts — Catalog, Inventory/Fulfillment (Engine 2), Reports.
 *
 * Conventions (blueprint §7):
 *  - string IDs, percentages 0–100, money as decimal strings, ISO dates (UTC for
 *    timestamps, date-only YYYY-MM-DD for business dates), camelCase everywhere.
 *  - Success: { data }, error: { error: { code, message, details? } }.
 *  - Pure engine functions take inputs and return outputs; they never import the DB.
 *
 * Cross-lane changes to this file require a short interface note (before/after
 * examples). Producer keeps old fields until consumers migrate.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Decimal money serialized as a string, e.g. "50000.00". */
export type Money = string;
/** ISO-8601 UTC timestamp, e.g. "2026-09-05T05:39:00.000Z". */
export type IsoTimestamp = string;
/** Date-only ISO date, e.g. "2026-09-05". */
export type IsoDate = string;
/** Percentage in [0, 100]. */
export type Pct = number;

export type Currency = "INR" | "USD" | "EUR";

export type ApiSuccess<T> = { data: T };
export type ApiErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT";
export type ApiError = { error: { code: ApiErrorCode; message: string; details?: unknown } };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

/** Actor shape produced by Ruchir's auth boundary (blueprint §7). */
export type Role = "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "CUSTOMER";
export interface Actor {
  id: string;
  role: Role;
  customerId?: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Customer master (Harsh owns Customer / SalesTeam records)
// ---------------------------------------------------------------------------

export type CustomerTier = "BRONZE" | "SILVER" | "GOLD";

export interface SalesTeam {
  id: string;
  name: string;
  /** User IDs (Ruchir's users) who belong to this team; used for report filters. */
  memberUserIds: string[];
}

export interface Customer {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  tier: CustomerTier;
  currency: Currency;
  /** Assigned sales rep user ID. */
  assignedRepId?: string;
  /** Optional price list override; when absent the tier/currency default applies. */
  priceListId?: string;
  active: boolean;
  createdAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Catalog: products, variants, price lists
// ---------------------------------------------------------------------------

/** Product category drives discount ceilings (Atharva) — separate from billing behavior. */
export type ProductCategory = "HARDWARE" | "ACCESSORIES" | "SERVICES" | "SUBSCRIPTIONS";

export type Unit = "UNIT" | "SEAT" | "HOUR" | "PACK" | "LICENSE";

export interface TaxRate {
  id: string;
  name: string;
  ratePct: Pct;
  active: boolean;
}

/** One attribute value with its extra price, e.g. Size=15" (+2000). */
export interface VariantAttribute {
  name: string;
  value: string;
}

export interface Variant {
  id: string;
  productId: string;
  /** Human label, e.g. `16GB / 512GB`. */
  label: string;
  attributes: VariantAttribute[];
  /** Added to the product base price (may be "0"). */
  extraPrice: Money;
  /** Added to the product base cost (may be "0"). */
  extraCost: Money;
  sku: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: Unit;
  description: string;
  /** Base list price before price-list rules and variant extras. */
  basePrice: Money;
  /** Base unit cost used for margin math. */
  baseCost: Money;
  taxRateId: string;
  /** True for physical goods handled by Engine 2; false for services/subscriptions. */
  stockTracked: boolean;
  /** Recurring products reference a plan (Ruchir's contract). */
  isSubscription: boolean;
  planId?: string;
  /** Kg per unit; used for shipping cost estimate weighting. */
  shippingWeightKg?: number;
  active: boolean;
  /** Archive instead of hard delete (blueprint §10). */
  archivedAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** A price list groups rules; a customer resolves to exactly one list. */
export interface PriceList {
  id: string;
  name: string;
  currency: Currency;
  /** Tier this list applies to by default; null means explicit assignment only. */
  tier: CustomerTier | null;
  active: boolean;
}

/**
 * A rule inside a price list. `fixedPrice` wins over `discountPct`; if neither is set,
 * the rule has no effect (base price). Variant-specific rules override product rules.
 */
export interface PriceRule {
  id: string;
  priceListId: string;
  productId: string;
  variantId?: string;
  fixedPrice?: Money;
  discountPct?: Pct;
  minQty?: number;
}

/** Plan reference shape consumed from Ruchir's `/api/plans` (fixture until live). */
export interface PlanRef {
  id: string;
  name: string;
  interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
}

// ---------------------------------------------------------------------------
// Catalog boundary: customerId/search → resolved price (blueprint §7)
// ---------------------------------------------------------------------------

export interface ResolvePriceInput {
  customerId: string;
  productId: string;
  variantId?: string;
  quantity?: number;
}

export interface ResolvedPrice {
  productId: string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
  category: ProductCategory;
  unit: Unit;
  currency: Currency;
  /** Final unit price for this customer after price list rule + variant extra. */
  unitPrice: Money;
  /** Unit cost including variant extra cost. */
  unitCost: Money;
  taxRateId: string;
  taxPct: Pct;
  stockTracked: boolean;
  isSubscription: boolean;
  planId?: string;
  /** How the price was derived, for the builder's tooltip. */
  priceSource: { priceListId: string; ruleId?: string; basis: "BASE" | "FIXED" | "DISCOUNT" };
}

export interface CatalogSearchInput {
  customerId: string;
  query?: string;
  category?: ProductCategory;
  includeInactive?: boolean;
}

export interface CatalogSearchItem {
  product: Product;
  variants: Variant[];
  /** Resolved price for product without variant (variant extras applied client-side via resolve). */
  resolved: ResolvedPrice;
}

// ---------------------------------------------------------------------------
// Inventory: warehouses, stock, receipts
// ---------------------------------------------------------------------------

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  /** Flat cost per shipment from this warehouse, used by split heuristic. */
  shippingCostPerShipment: Money;
  /** Optional per-kg cost added on top of per-shipment cost. */
  shippingCostPerKg?: Money;
  active: boolean;
}

/** Unique per (warehouseId, variantId). available = onHand - reserved. */
export interface StockLevel {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  /** Replenishment threshold; when available < threshold, flag for reorder. */
  reorderThreshold: number;
}

export interface StockReceipt {
  id: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
  /** Unique replay key; a repeated receipt with the same key is ignored. */
  requestKey: string;
  receivedAt: IsoTimestamp;
  actorId: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Fulfillment (Engine 2)
// ---------------------------------------------------------------------------

export type FulfillmentStatus = "PENDING" | "PARTIAL" | "ALLOCATED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/**
 * Minimal immutable order view Engine 2 consumes. Produced from Atharva's `orderReady`
 * result (blueprint §7 "Confirmation handoff"). Engine 2 never edits order tables.
 */
export interface OrderForFulfillment {
  orderId: string;
  customerId: string;
  customerName: string;
  repId: string;
  currency: Currency;
  promisedDate?: IsoDate;
  confirmedAt: IsoTimestamp;
  lines: OrderLineForFulfillment[];
}

export interface OrderLineForFulfillment {
  orderLineId: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantLabel?: string;
  quantity: number;
  stockTracked: boolean;
  isSubscription: boolean;
  shippingWeightKg?: number;
}

export type ReservationStatus = "RESERVED" | "SHIPPED" | "CANCELLED";

export interface Reservation {
  id: string;
  orderId: string;
  orderLineId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  /** Set when shipped; links to the shipment consuming the reservation. */
  shipmentId?: string;
  createdAt: IsoTimestamp;
}

/** Explicit unallocated remainder. Source warehouse is null by definition. */
export interface Backorder {
  id: string;
  orderId: string;
  orderLineId: string;
  variantId: string;
  remainingQuantity: number;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type ShipmentStatus = "PLANNED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface ShipmentLine {
  orderLineId: string;
  variantId: string;
  quantity: number;
}

export interface Shipment {
  id: string;
  orderId: string;
  warehouseId: string;
  status: ShipmentStatus;
  lines: ShipmentLine[];
  estimatedCost: Money;
  shippedAt?: IsoTimestamp;
  deliveredAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
}

/** Plan of quantities per warehouse per line; the unit both preview and commit use. */
export interface AllocationPlanEntry {
  orderLineId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
}

export interface BackorderPlanEntry {
  orderLineId: string;
  variantId: string;
  quantity: number;
}

export interface WarehouseSplitSummary {
  warehouseId: string;
  warehouseName: string;
  totalUnits: number;
  lines: { orderLineId: string; productName: string; variantLabel?: string; quantity: number }[];
  estimatedCost: Money;
}

/**
 * Output of preview. Writes NOTHING. `estimatedCost` is an estimate from configured
 * warehouse costs; the heuristic does not claim global optimization.
 */
export interface SplitPreview {
  orderId: string;
  strategy: "SINGLE_WAREHOUSE" | "MULTI_WAREHOUSE" | "NO_STOCK_TRACKED_LINES";
  allocations: AllocationPlanEntry[];
  backorders: BackorderPlanEntry[];
  warehouses: WarehouseSplitSummary[];
  shipmentCount: number;
  estimatedTotalCost: Money;
  /** Lines skipped because not stock-tracked (services/subscriptions). */
  skippedLineIds: string[];
  notes: string[];
}

export interface AcceptSplitInput {
  orderId: string;
  /** Unique per user intent; repeated Accept with same key returns the same result. */
  requestKey: string;
  actor: Actor;
  /** If omitted, the server recomputes preview and commits it. */
  plan?: { allocations: AllocationPlanEntry[]; backorders: BackorderPlanEntry[] };
}

export interface OverrideSplitInput {
  orderId: string;
  requestKey: string;
  actor: Actor;
  /** Full replacement plan for this order's UNSHIPPED remainder. */
  allocations: AllocationPlanEntry[];
  backorders: BackorderPlanEntry[];
}

export interface ReceiptInput {
  warehouseId: string;
  variantId: string;
  quantity: number;
  requestKey: string;
  actor: Actor;
  note?: string;
}

/** Backorders that the newly received stock could cover; user is prompted before commit. */
export interface ReceiptResult {
  receipt: StockReceipt;
  stock: StockLevel;
  eligibleBackorders: { backorder: Backorder; orderId: string; customerName: string; coverable: number }[];
}

export interface ConsolidateInput {
  orderId: string;
  requestKey: string;
  actor: Actor;
  /** Backorders to allocate now from the given warehouse. */
  allocations: AllocationPlanEntry[];
}

export interface ShipInput {
  orderId: string;
  shipmentId: string;
  requestKey: string;
  actor: Actor;
}

export interface DeliverInput {
  orderId: string;
  shipmentId: string;
  requestKey: string;
  actor: Actor;
}

export interface CancelAllocationInput {
  orderId: string;
  requestKey: string;
  actor: Actor;
  reason: string;
}

/** Row on Screen 07 (Fulfillment and Stock List). */
export interface FulfillmentListItem {
  orderId: string;
  customerName: string;
  confirmedAt: IsoTimestamp;
  promisedDate?: IsoDate;
  status: FulfillmentStatus;
  stockTrackedUnits: number;
  allocatedUnits: number;
  shippedUnits: number;
  deliveredUnits: number;
  backorderedUnits: number;
  shipmentCount: number;
}

export interface StockListItem {
  warehouseId: string;
  warehouseName: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderThreshold: number;
  belowThreshold: boolean;
}

/** Full detail for Screen 08. */
export interface FulfillmentDetail {
  order: OrderForFulfillment;
  status: FulfillmentStatus;
  lines: {
    orderLineId: string;
    productName: string;
    variantLabel?: string;
    stockTracked: boolean;
    quantity: number;
    reserved: number;
    shipped: number;
    delivered: number;
    backordered: number;
    unallocated: number;
  }[];
  reservations: Reservation[];
  backorders: Backorder[];
  shipments: Shipment[];
  /** Live preview for the unallocated remainder, or null when nothing remains. */
  preview: SplitPreview | null;
  /** Current available stock per relevant variant per warehouse for the override editor. */
  stock: StockListItem[];
  /** True when a receipt has made stock available for an open backorder. */
  consolidationAvailable: boolean;
}

/** Delivery read Ruchir consumes for Invoice Detail (screen 13) and Atharva for health. */
export interface OrderDeliveryRead {
  orderId: string;
  status: FulfillmentStatus;
  totalStockTrackedUnits: number;
  deliveredUnits: number;
  shippedUnits: number;
  undeliveredUnits: number;
  promisedDate?: IsoDate;
}

// ---------------------------------------------------------------------------
// Reports (Engine-agnostic; consumes stored records — never recomputes engines)
// ---------------------------------------------------------------------------

export type ReportPeriodPreset = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "THIS_QUARTER" | "CUSTOM";
export type QuoteStageForReport = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "UNDER_NEGOTIATION" | "CONFIRMED" | "REJECTED";
export type ApprovalStatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";

export interface ReportFilters {
  period: ReportPeriodPreset;
  /** Required when period === "CUSTOM"; inclusive from, exclusive to. */
  from?: IsoDate;
  to?: IsoDate;
  teamId?: string;
  repId?: string;
  approvalStatus?: ApprovalStatusFilter;
  productId?: string;
  category?: ProductCategory;
}

/**
 * Flattened, stored-fact input record for reporting. Assembled from Atharva's quotes /
 * revisions / orders / approvals by the report repository; the aggregate function never
 * recomputes pricing or policy.
 */
export interface ReportQuoteRecord {
  quoteId: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  repId: string;
  repName: string;
  teamId?: string;
  stage: QuoteStageForReport;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  requiredApprovalLevel: "NONE" | "MANAGER" | "MANAGER_FINANCE";
  currency: Currency;
  oneTimeTotal: Money;
  monthlyRecurringTotal: Money;
  /** Value-weighted effective discount for the current revision. */
  weightedDiscountPct: Pct;
  createdAt: IsoTimestamp;
  /** Set when stage === CONFIRMED. */
  confirmedAt?: IsoTimestamp;
  orderId?: string;
  lines: ReportLineRecord[];
}

export interface ReportLineRecord {
  productId: string;
  productName: string;
  category: ProductCategory;
  variantId?: string;
  quantity: number;
  unitPrice: Money;
  unitCost: Money;
  effectiveDiscountPct: Pct;
  /** Net line amount after discounts, before tax. */
  netAmount: Money;
  isRecurring: boolean;
}

export interface ReportAggregates {
  filters: ReportFilters;
  resolvedRange: { from: IsoDate; to: IsoDate };
  sales: {
    quoteCount: number;
    confirmedOrderCount: number;
    confirmedOneTimeRevenue: Money;
    confirmedMonthlyRecurring: Money;
    pipelineValue: Money;
    averageWeightedDiscountPct: Pct;
    conversionRatePct: Pct;
  };
  approvals: {
    pending: number;
    approved: number;
    rejected: number;
    notRequired: number;
    managerOnly: number;
    managerFinance: number;
  };
  byRep: { repId: string; repName: string; quoteCount: number; confirmedCount: number; confirmedOneTimeRevenue: Money; averageDiscountPct: Pct }[];
  byProduct: { productId: string; productName: string; category: ProductCategory; unitsQuoted: number; unitsConfirmed: number; netRevenue: Money; averageDiscountPct: Pct }[];
  byStage: { stage: QuoteStageForReport; count: number; value: Money }[];
  /** Rows the aggregates were computed from; exports use this same dataset. */
  rows: ReportQuoteRecord[];
}

export type ExportFormat = "PDF" | "XLSX";

// ---------------------------------------------------------------------------
// Fulfillment initializer contract (called inside Atharva's confirmOrder transaction)
// ---------------------------------------------------------------------------

/**
 * Database-only initializer: records the order as PENDING fulfillment. Does not
 * reserve stock, does not send mail. Idempotent per orderId.
 */
export interface InitializeFulfillmentInput {
  order: OrderForFulfillment;
}
export interface InitializeFulfillmentResult {
  orderId: string;
  status: "PENDING";
  created: boolean;
}
