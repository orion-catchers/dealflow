/**
 * Harsh's development fixtures — DEV FIXTURE, never a production fallback.
 *
 * Mirrors blueprint §13 "Coherent numerical example":
 *  - Gold Acme buys 10 laptops @ 50,000 (cost 40,000), 10 docks @ 3,000 (cost 2,000),
 *    10 support seats @ 1,000/month (cost 400). INR, zero-tax fixture for easy arithmetic.
 *  - Stock: Main has 6 laptops + 10 docks; East has 3 laptops → 1 laptop backordered.
 *
 * Symbolic IDs are shared across all lanes: customer-acme, customer-beta, rep-arjun,
 * manager-sana, finance-farah, customer-neha, warehouse-main, warehouse-east.
 * Ruchir's seed resolver maps these to real DB IDs.
 */
import type {
  Customer,
  SalesTeam,
  TaxRate,
  Product,
  Variant,
  PriceList,
  PriceRule,
  PlanRef,
  Warehouse,
  StockLevel,
  OrderForFulfillment,
  ReportQuoteRecord,
} from "@/contracts/harsh";

const T0 = "2026-09-01T09:00:00.000Z";

// ---------------------------------------------------------------------------
// Customers / teams
// ---------------------------------------------------------------------------

export const salesTeams: SalesTeam[] = [
  { id: "team-north", name: "North Enterprise", memberUserIds: ["rep-arjun", "rep-priya"] },
  { id: "team-smb", name: "SMB Desk", memberUserIds: ["rep-rohit"] },
];

export const customers: Customer[] = [
  {
    id: "customer-acme",
    name: "Acme Studio",
    contactName: "Neha Kapoor",
    contactEmail: "neha@acme.example",
    tier: "GOLD",
    currency: "INR",
    assignedRepId: "rep-arjun",
    active: true,
    createdAt: T0,
  },
  {
    id: "customer-beta",
    name: "Beta Industries",
    contactName: "Vikram Shah",
    contactEmail: "vikram@beta.example",
    tier: "SILVER",
    currency: "INR",
    assignedRepId: "rep-priya",
    active: true,
    createdAt: T0,
  },
  {
    id: "customer-gamma",
    name: "Gamma Retail",
    contactName: "Asha Menon",
    contactEmail: "asha@gamma.example",
    tier: "BRONZE",
    currency: "INR",
    assignedRepId: "rep-rohit",
    active: true,
    createdAt: T0,
  },
];

// ---------------------------------------------------------------------------
// Taxes / plans
// ---------------------------------------------------------------------------

export const taxRates: TaxRate[] = [
  { id: "tax-zero", name: "Zero (demo)", ratePct: 0, active: true },
  { id: "tax-gst-18", name: "GST 18%", ratePct: 18, active: true },
];

/** Fixture of Ruchir's plan contract until `/api/plans` is live. */
export const planRefs: PlanRef[] = [
  { id: "plan-support-monthly", name: "Support Seat — Monthly", interval: "MONTHLY" },
  { id: "plan-support-yearly", name: "Support Seat — Yearly", interval: "YEARLY" },
  { id: "plan-backup-quarterly", name: "Cloud Backup — Quarterly", interval: "QUARTERLY" },
];

// ---------------------------------------------------------------------------
// Products / variants
// ---------------------------------------------------------------------------

export const products: Product[] = [
  {
    id: "prod-laptop",
    name: "Nexa ProBook 15",
    category: "HARDWARE",
    unit: "UNIT",
    description: "15-inch business laptop, 3-year onsite warranty.",
    basePrice: "50000.00",
    baseCost: "40000.00",
    taxRateId: "tax-zero",
    stockTracked: true,
    isSubscription: false,
    shippingWeightKg: 2.2,
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "prod-dock",
    name: "Nexa USB-C Dock",
    category: "ACCESSORIES",
    unit: "UNIT",
    description: "Dual 4K USB-C docking station.",
    basePrice: "3000.00",
    baseCost: "2000.00",
    taxRateId: "tax-zero",
    stockTracked: true,
    isSubscription: false,
    shippingWeightKg: 0.6,
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "prod-mouse",
    name: "Nexa Wireless Mouse",
    category: "ACCESSORIES",
    unit: "UNIT",
    description: "Silent-click wireless mouse.",
    basePrice: "1200.00",
    baseCost: "700.00",
    taxRateId: "tax-zero",
    stockTracked: true,
    isSubscription: false,
    shippingWeightKg: 0.1,
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "prod-support",
    name: "Priority Support Seat",
    category: "SERVICES",
    unit: "SEAT",
    description: "Per-seat priority support, billed monthly.",
    basePrice: "1000.00",
    baseCost: "400.00",
    taxRateId: "tax-zero",
    stockTracked: false,
    isSubscription: true,
    planId: "plan-support-monthly",
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "prod-setup",
    name: "Onsite Setup Service",
    category: "SERVICES",
    unit: "HOUR",
    description: "Onsite deployment and configuration, per hour.",
    basePrice: "2500.00",
    baseCost: "1500.00",
    taxRateId: "tax-gst-18",
    stockTracked: false,
    isSubscription: false,
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "prod-backup",
    name: "Cloud Backup 1TB",
    category: "SUBSCRIPTIONS",
    unit: "LICENSE",
    description: "Encrypted cloud backup, billed quarterly.",
    basePrice: "4500.00",
    baseCost: "1800.00",
    taxRateId: "tax-gst-18",
    stockTracked: false,
    isSubscription: true,
    planId: "plan-backup-quarterly",
    active: true,
    createdAt: T0,
    updatedAt: T0,
  },
];

export const variants: Variant[] = [
  {
    id: "var-laptop-16-512",
    productId: "prod-laptop",
    label: "16GB / 512GB",
    attributes: [
      { name: "RAM", value: "16GB" },
      { name: "Storage", value: "512GB" },
    ],
    extraPrice: "0.00",
    extraCost: "0.00",
    sku: "NPB15-16-512",
    active: true,
  },
  {
    id: "var-laptop-32-1tb",
    productId: "prod-laptop",
    label: "32GB / 1TB",
    attributes: [
      { name: "RAM", value: "32GB" },
      { name: "Storage", value: "1TB" },
    ],
    extraPrice: "8000.00",
    extraCost: "6000.00",
    sku: "NPB15-32-1TB",
    active: true,
  },
  {
    id: "var-dock-std",
    productId: "prod-dock",
    label: "Standard",
    attributes: [],
    extraPrice: "0.00",
    extraCost: "0.00",
    sku: "NDOCK-STD",
    active: true,
  },
  {
    id: "var-mouse-black",
    productId: "prod-mouse",
    label: "Black",
    attributes: [{ name: "Color", value: "Black" }],
    extraPrice: "0.00",
    extraCost: "0.00",
    sku: "NMOUSE-BLK",
    active: true,
  },
  {
    id: "var-mouse-white",
    productId: "prod-mouse",
    label: "White",
    attributes: [{ name: "Color", value: "White" }],
    extraPrice: "100.00",
    extraCost: "50.00",
    sku: "NMOUSE-WHT",
    active: true,
  },
];

// ---------------------------------------------------------------------------
// Price lists
// ---------------------------------------------------------------------------

export const priceLists: PriceList[] = [
  { id: "pl-inr-gold", name: "INR — Gold", currency: "INR", tier: "GOLD", active: true },
  { id: "pl-inr-silver", name: "INR — Silver", currency: "INR", tier: "SILVER", active: true },
  { id: "pl-inr-bronze", name: "INR — Bronze", currency: "INR", tier: "BRONZE", active: true },
];

/**
 * Gold list intentionally has NO rules on laptop/dock/support so demo arithmetic uses
 * base prices (50,000 / 3,000 / 1,000). Silver and Bronze show list-based pricing.
 */
export const priceRules: PriceRule[] = [
  { id: "pr-gold-setup", priceListId: "pl-inr-gold", productId: "prod-setup", fixedPrice: "2200.00" },
  { id: "pr-silver-laptop", priceListId: "pl-inr-silver", productId: "prod-laptop", fixedPrice: "52000.00" },
  { id: "pr-silver-dock", priceListId: "pl-inr-silver", productId: "prod-dock", discountPct: 0 },
  { id: "pr-bronze-laptop", priceListId: "pl-inr-bronze", productId: "prod-laptop", fixedPrice: "54000.00" },
  { id: "pr-bronze-support", priceListId: "pl-inr-bronze", productId: "prod-support", fixedPrice: "1200.00" },
];

// ---------------------------------------------------------------------------
// Warehouses / stock
// ---------------------------------------------------------------------------

export const warehouses: Warehouse[] = [
  { id: "warehouse-main", name: "Main Warehouse", code: "MAIN", shippingCostPerShipment: "800.00", shippingCostPerKg: "20.00", active: true },
  { id: "warehouse-east", name: "East Depot", code: "EAST", shippingCostPerShipment: "1200.00", shippingCostPerKg: "25.00", active: true },
];

export const stockLevels: StockLevel[] = [
  { warehouseId: "warehouse-main", variantId: "var-laptop-16-512", onHand: 6, reserved: 0, reorderThreshold: 4 },
  { warehouseId: "warehouse-main", variantId: "var-laptop-32-1tb", onHand: 2, reserved: 0, reorderThreshold: 2 },
  { warehouseId: "warehouse-main", variantId: "var-dock-std", onHand: 10, reserved: 0, reorderThreshold: 5 },
  { warehouseId: "warehouse-main", variantId: "var-mouse-black", onHand: 40, reserved: 0, reorderThreshold: 10 },
  { warehouseId: "warehouse-east", variantId: "var-laptop-16-512", onHand: 3, reserved: 0, reorderThreshold: 2 },
  { warehouseId: "warehouse-east", variantId: "var-mouse-white", onHand: 15, reserved: 0, reorderThreshold: 5 },
];

// ---------------------------------------------------------------------------
// Confirmed order fixture (shape of Atharva's orderReady) — Flow A / §13 example
// ---------------------------------------------------------------------------

export const orderAcmeFlowA: OrderForFulfillment = {
  orderId: "order-acme-1001",
  customerId: "customer-acme",
  customerName: "Acme Studio",
  repId: "rep-arjun",
  currency: "INR",
  promisedDate: "2026-09-20",
  confirmedAt: "2026-09-05T06:00:00.000Z",
  lines: [
    {
      orderLineId: "ol-1001-1",
      productId: "prod-laptop",
      productName: "Nexa ProBook 15",
      variantId: "var-laptop-16-512",
      variantLabel: "16GB / 512GB",
      quantity: 10,
      stockTracked: true,
      isSubscription: false,
      shippingWeightKg: 2.2,
    },
    {
      orderLineId: "ol-1001-2",
      productId: "prod-dock",
      productName: "Nexa USB-C Dock",
      variantId: "var-dock-std",
      variantLabel: "Standard",
      quantity: 10,
      stockTracked: true,
      isSubscription: false,
      shippingWeightKg: 0.6,
    },
    {
      orderLineId: "ol-1001-3",
      productId: "prod-support",
      productName: "Priority Support Seat",
      quantity: 10,
      stockTracked: false,
      isSubscription: true,
    },
  ],
};

/** Second order competing for the same laptops (concurrency / competing-orders check). */
export const orderBetaCompeting: OrderForFulfillment = {
  orderId: "order-beta-1002",
  customerId: "customer-beta",
  customerName: "Beta Industries",
  repId: "rep-priya",
  currency: "INR",
  promisedDate: "2026-09-18",
  confirmedAt: "2026-09-05T06:30:00.000Z",
  lines: [
    {
      orderLineId: "ol-1002-1",
      productId: "prod-laptop",
      productName: "Nexa ProBook 15",
      variantId: "var-laptop-16-512",
      variantLabel: "16GB / 512GB",
      quantity: 4,
      stockTracked: true,
      isSubscription: false,
      shippingWeightKg: 2.2,
    },
  ],
};

/** Service-only order — Engine 2 must report NO_STOCK_TRACKED_LINES. */
export const orderServiceOnly: OrderForFulfillment = {
  orderId: "order-gamma-1003",
  customerId: "customer-gamma",
  customerName: "Gamma Retail",
  repId: "rep-rohit",
  currency: "INR",
  confirmedAt: "2026-09-04T10:00:00.000Z",
  lines: [
    {
      orderLineId: "ol-1003-1",
      productId: "prod-setup",
      productName: "Onsite Setup Service",
      quantity: 8,
      stockTracked: false,
      isSubscription: false,
    },
  ],
};

export const fulfillmentOrders: OrderForFulfillment[] = [orderAcmeFlowA, orderBetaCompeting, orderServiceOnly];

// ---------------------------------------------------------------------------
// Report records — stored facts assembled from Atharva's quotes (fixture)
// ---------------------------------------------------------------------------

function line(
  productId: string,
  productName: string,
  category: ReportQuoteRecord["lines"][number]["category"],
  quantity: number,
  unitPrice: number,
  unitCost: number,
  effectiveDiscountPct: number,
  isRecurring = false,
) {
  const net = quantity * unitPrice * (1 - effectiveDiscountPct / 100);
  return {
    productId,
    productName,
    category,
    quantity,
    unitPrice: unitPrice.toFixed(2),
    unitCost: unitCost.toFixed(2),
    effectiveDiscountPct,
    netAmount: net.toFixed(2),
    isRecurring,
  };
}

export const reportQuoteRecords: ReportQuoteRecord[] = [
  {
    quoteId: "quote-1042",
    quoteNumber: "Q-1042",
    customerId: "customer-acme",
    customerName: "Acme Studio",
    repId: "rep-arjun",
    repName: "Arjun Mehta",
    teamId: "team-north",
    stage: "CONFIRMED",
    approvalStatus: "NOT_REQUIRED",
    requiredApprovalLevel: "NONE",
    currency: "INR",
    oneTimeTotal: "466400.00",
    monthlyRecurringTotal: "9200.00",
    weightedDiscountPct: 11.9,
    createdAt: "2026-09-02T04:30:00.000Z",
    confirmedAt: "2026-09-05T06:00:00.000Z",
    orderId: "order-acme-1001",
    lines: [
      line("prod-laptop", "Nexa ProBook 15", "HARDWARE", 10, 50000, 40000, 12),
      line("prod-dock", "Nexa USB-C Dock", "ACCESSORIES", 10, 3000, 2000, 12),
      line("prod-support", "Priority Support Seat", "SERVICES", 10, 1000, 400, 8, true),
    ],
  },
  {
    quoteId: "quote-1043",
    quoteNumber: "Q-1043",
    customerId: "customer-acme",
    customerName: "Acme Studio",
    repId: "rep-arjun",
    repName: "Arjun Mehta",
    teamId: "team-north",
    stage: "PENDING_APPROVAL",
    approvalStatus: "PENDING",
    requiredApprovalLevel: "MANAGER_FINANCE",
    currency: "INR",
    oneTimeTotal: "434600.00",
    monthlyRecurringTotal: "8400.00",
    weightedDiscountPct: 17.9,
    createdAt: "2026-09-04T08:15:00.000Z",
    lines: [
      line("prod-laptop", "Nexa ProBook 15", "HARDWARE", 10, 50000, 40000, 18),
      line("prod-dock", "Nexa USB-C Dock", "ACCESSORIES", 10, 3000, 2000, 18),
      line("prod-support", "Priority Support Seat", "SERVICES", 10, 1000, 400, 16, true),
    ],
  },
  {
    quoteId: "quote-1040",
    quoteNumber: "Q-1040",
    customerId: "customer-beta",
    customerName: "Beta Industries",
    repId: "rep-priya",
    repName: "Priya Nair",
    teamId: "team-north",
    stage: "CONFIRMED",
    approvalStatus: "APPROVED",
    requiredApprovalLevel: "MANAGER",
    currency: "INR",
    oneTimeTotal: "187200.00",
    monthlyRecurringTotal: "0.00",
    weightedDiscountPct: 10,
    createdAt: "2026-08-20T10:00:00.000Z",
    confirmedAt: "2026-08-28T12:00:00.000Z",
    orderId: "order-beta-1002",
    lines: [line("prod-laptop", "Nexa ProBook 15", "HARDWARE", 4, 52000, 40000, 10)],
  },
  {
    quoteId: "quote-1038",
    quoteNumber: "Q-1038",
    customerId: "customer-gamma",
    customerName: "Gamma Retail",
    repId: "rep-rohit",
    repName: "Rohit Verma",
    teamId: "team-smb",
    stage: "REJECTED",
    approvalStatus: "REJECTED",
    requiredApprovalLevel: "MANAGER_FINANCE",
    currency: "INR",
    oneTimeTotal: "97200.00",
    monthlyRecurringTotal: "0.00",
    weightedDiscountPct: 25,
    createdAt: "2026-08-12T09:00:00.000Z",
    lines: [line("prod-laptop", "Nexa ProBook 15", "HARDWARE", 2, 54000, 40000, 25)],
  },
  {
    quoteId: "quote-1044",
    quoteNumber: "Q-1044",
    customerId: "customer-gamma",
    customerName: "Gamma Retail",
    repId: "rep-rohit",
    repName: "Rohit Verma",
    teamId: "team-smb",
    stage: "DRAFT",
    approvalStatus: "NOT_REQUIRED",
    requiredApprovalLevel: "NONE",
    currency: "INR",
    oneTimeTotal: "20000.00",
    monthlyRecurringTotal: "0.00",
    weightedDiscountPct: 0,
    createdAt: "2026-09-05T03:00:00.000Z",
    lines: [line("prod-setup", "Onsite Setup Service", "SERVICES", 8, 2500, 1500, 0)],
  },
  {
    quoteId: "quote-1039",
    quoteNumber: "Q-1039",
    customerId: "customer-beta",
    customerName: "Beta Industries",
    repId: "rep-priya",
    repName: "Priya Nair",
    teamId: "team-north",
    stage: "UNDER_NEGOTIATION",
    approvalStatus: "NOT_REQUIRED",
    requiredApprovalLevel: "NONE",
    currency: "INR",
    oneTimeTotal: "0.00",
    monthlyRecurringTotal: "13500.00",
    weightedDiscountPct: 0,
    createdAt: "2026-08-30T11:00:00.000Z",
    lines: [line("prod-backup", "Cloud Backup 1TB", "SUBSCRIPTIONS", 3, 4500, 1800, 0, true)],
  },
];

/** Users referenced by fixtures (Ruchir owns the real user records). */
export const fixtureUsers = [
  { id: "admin-dev", name: "Dev Sharma", role: "ADMIN" as const },
  { id: "rep-arjun", name: "Arjun Mehta", role: "SALES_REP" as const, teamId: "team-north" },
  { id: "rep-priya", name: "Priya Nair", role: "SALES_REP" as const, teamId: "team-north" },
  { id: "rep-rohit", name: "Rohit Verma", role: "SALES_REP" as const, teamId: "team-smb" },
  { id: "manager-sana", name: "Sana Iyer", role: "SALES_MANAGER" as const },
  { id: "finance-farah", name: "Farah Khan", role: "FINANCE" as const },
  { id: "customer-neha", name: "Neha Kapoor", role: "CUSTOMER" as const, customerId: "customer-acme" },
];
