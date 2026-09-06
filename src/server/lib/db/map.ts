/**
 * Map Ruchir's Prisma rows onto Harsh's lane contracts (and back).
 *
 * Schema maps Prisma catalog tables onto Harsh contracts. TaxRate is a real
 * table; Product.taxPct stays as the snapshot used by quote/billing engines.
 * Company tenancy is on User, Customer, Product, and Warehouse.
 */
import type {
  Backorder,
  Currency,
  Customer,
  CustomerTier,
  PlanRef,
  PriceList,
  PriceRule,
  Product,
  ProductCategory,
  Reservation,
  ReservationStatus,
  SalesTeam,
  Shipment,
  StockLevel,
  StockReceipt,
  TaxRate,
  Unit,
  Variant,
  Warehouse,
} from "@/contracts/harsh";
import { harshFixtures } from "@/fixtures/harsh";

export const FIXTURE_USER_EMAIL: Record<string, string> = {
  "admin-dev": "dev@nexa.example",
  "rep-arjun": "arjun@nexa.example",
  "rep-priya": "priya@nexa.example",
  "manager-sana": "sana@nexa.example",
  "finance-farah": "farah@nexa.example",
  "customer-neha": "neha@acme.example",
};

const EMAIL_TO_SYMBOL = Object.fromEntries(Object.entries(FIXTURE_USER_EMAIL).map(([sym, email]) => [email, sym]));

export const FIXTURE_CUSTOMER_EMAIL: Record<string, string> = {
  "customer-acme": "neha@acme.example",
  "customer-beta": "rohan@beta.example",
  "customer-gamma": "contact@gammalabs.example",
};

const CUSTOMER_EMAIL_TO_SYMBOL = Object.fromEntries(
  Object.entries(FIXTURE_CUSTOMER_EMAIL).map(([sym, email]) => [email, sym]),
);
CUSTOMER_EMAIL_TO_SYMBOL["meera@gamma.example"] = "customer-gamma";

export const FIXTURE_WAREHOUSE_CODE: Record<string, string> = Object.fromEntries(
  harshFixtures.warehouses.map((row) => [row.sym, row.code]),
);
export const FIXTURE_VARIANT_SKU: Record<string, string> = Object.fromEntries(
  harshFixtures.variants.map((row) => [row.sym, row.sku]),
);

export function moneyOf(value: unknown): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function pctOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isoOf(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

export function dateOnly(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export function publicUserId(user: { id: string; email?: string | null }): string {
  if (user.email && EMAIL_TO_SYMBOL[user.email]) return EMAIL_TO_SYMBOL[user.email];
  return user.id;
}

export function publicCustomerId(row: { id: string; contactEmail?: string | null }): string {
  if (row.contactEmail && CUSTOMER_EMAIL_TO_SYMBOL[row.contactEmail]) return CUSTOMER_EMAIL_TO_SYMBOL[row.contactEmail];
  return row.id;
}

export function tierFromDb(tier: string): CustomerTier {
  if (tier === "SILVER") return "SILVER";
  if (tier === "GOLD" || tier === "PLATINUM") return "GOLD";
  return "BRONZE";
}

export function tierToDb(tier: CustomerTier): "STANDARD" | "SILVER" | "GOLD" {
  if (tier === "SILVER") return "SILVER";
  if (tier === "GOLD") return "GOLD";
  return "STANDARD";
}

export function currencyOf(value: string): Currency {
  if (value === "USD" || value === "EUR") return value;
  return "INR";
}

export function categoryFromCode(code: string): ProductCategory {
  if (code === "HARDWARE" || code === "ACCESSORIES" || code === "SERVICES" || code === "SUBSCRIPTIONS") return code;
  const upper = code.toUpperCase();
  if (upper.includes("PERIPH") || upper.includes("ACCESS")) return "ACCESSORIES";
  if (upper.includes("SERVICE") || upper.includes("SUPPORT") || upper.includes("SOFTWARE") || upper.includes("SUBSCRIPTION")) {
    return "SERVICES";
  }
  return "HARDWARE";
}

export function unitFromDb(unit: string): Unit {
  const u = unit.toUpperCase().replace(/[^A-Z]/g, "");
  if (u === "SEAT" || u.startsWith("SEAT")) return "SEAT";
  if (u === "HOUR") return "HOUR";
  if (u === "PACK") return "PACK";
  if (u === "LICENSE") return "LICENSE";
  return "UNIT";
}

export function taxRateIdFromPct(pct: unknown): string {
  const n = Math.round(pctOf(pct));
  return `tax-${n}`;
}

export function pctFromTaxRateId(id: string): number {
  const m = /^tax-(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function virtualTaxRate(id: string, pct: number, name?: string): TaxRate {
  return { id, name: name ?? `GST ${pct}%`, ratePct: pct, active: true };
}

export function toCustomer(row: {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  discountTier: string;
  currency: string;
  assignedRepId: string;
  assignedRep?: { id: string; email: string };
  priceListId: string;
  createdAt: Date;
  companyId?: string;
}): Customer {
  return {
    id: publicCustomerId(row),
    name: row.name,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    tier: tierFromDb(row.discountTier),
    currency: currencyOf(row.currency),
    assignedRepId: row.assignedRep ? publicUserId(row.assignedRep) : row.assignedRepId,
    priceListId: row.priceListId,
    companyId: row.companyId,
    active: true,
    createdAt: isoOf(row.createdAt),
  };
}

export function toSalesTeam(row: { id: string; name: string; members: { id: string; email: string }[] }): SalesTeam {
  return { id: row.id, name: row.name, memberUserIds: row.members.map(publicUserId) };
}

export function toPlan(row: { id: string; name: string; interval: string }): PlanRef {
  const interval = row.interval === "QUARTERLY" || row.interval === "YEARLY" ? row.interval : "MONTHLY";
  return { id: row.id, name: row.name, interval };
}

export function toProduct(row: {
  id: string;
  name: string;
  unit: string;
  description: string;
  taxPct: unknown;
  basePrice: unknown;
  baseCost: unknown;
  stockTracked: boolean;
  defaultPlanId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { code: string };
  variants?: { shippingWeight: unknown }[];
  taxRateId?: string;
  companyId?: string;
}): Product {
  const weights = (row.variants ?? []).map((v) => Number(v.shippingWeight)).filter((n) => Number.isFinite(n) && n > 0);
  const category = categoryFromCode(row.category.code);
  const isSubscription = Boolean(row.defaultPlanId) || category === "SUBSCRIPTIONS";
  return {
    id: row.id,
    name: row.name,
    category,
    unit: unitFromDb(row.unit),
    description: row.description,
    basePrice: moneyOf(row.basePrice),
    baseCost: moneyOf(row.baseCost),
    taxRateId: row.taxRateId ?? taxRateIdFromPct(row.taxPct),
    companyId: row.companyId,
    stockTracked: row.stockTracked,
    isSubscription,
    planId: row.defaultPlanId ?? undefined,
    shippingWeightKg: weights.length ? Math.max(...weights) : undefined,
    active: !row.archivedAt,
    archivedAt: row.archivedAt ? isoOf(row.archivedAt) : undefined,
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt),
  };
}

export function toVariant(
  row: {
    id: string;
    productId: string;
    name: string;
    extraPrice: unknown;
    cost: unknown;
    sku: string;
    attributes: unknown;
    archivedAt: Date | null;
  },
  productBaseCost: number,
): Variant {
  const extraCost = Math.max(0, Number(row.cost) - productBaseCost);
  const attributes = Array.isArray(row.attributes)
    ? (row.attributes as { name?: string; value?: string }[])
        .filter((a) => a && typeof a.name === "string")
        .map((a) => ({ name: a.name as string, value: String(a.value ?? "") }))
    : [];
  return {
    id: row.id,
    productId: row.productId,
    label: row.name,
    attributes,
    extraPrice: moneyOf(row.extraPrice),
    extraCost: moneyOf(extraCost),
    sku: row.sku,
    active: !row.archivedAt,
  };
}

export function toPriceList(row: { id: string; name: string; currency: string; code: string }): PriceList {
  const code = row.code.toUpperCase();
  let tier: PriceList["tier"] = null;
  if (code.includes("GOLD")) tier = "GOLD";
  else if (code.includes("SILVER")) tier = "SILVER";
  else if (code.includes("BRONZE") || code.includes("STANDARD")) tier = "BRONZE";
  return { id: row.id, name: row.name, currency: currencyOf(row.currency), tier, active: true };
}

export function toPriceRule(row: {
  id: string;
  priceListId: string;
  productId: string;
  variantId: string | null;
  unitPrice: unknown;
}): PriceRule {
  return {
    id: row.id,
    priceListId: row.priceListId,
    productId: row.productId,
    variantId: row.variantId ?? undefined,
    fixedPrice: moneyOf(row.unitPrice),
  };
}

export function toWarehouse(row: { id: string; name: string; code: string; shippingCost: unknown; active: boolean; companyId?: string }): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    shippingCostPerShipment: moneyOf(row.shippingCost),
    active: row.active,
    companyId: row.companyId,
  };
}

export function toStockLevel(row: {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  reorderAt: number;
}): StockLevel {
  return {
    warehouseId: row.warehouseId,
    variantId: row.variantId,
    onHand: row.onHand,
    reserved: row.reserved,
    reorderThreshold: row.reorderAt,
  };
}

export function reservationStatusFromDb(status: string): ReservationStatus {
  if (status === "SHIPPED") return "SHIPPED";
  if (status === "RELEASED") return "CANCELLED";
  return "RESERVED";
}

export function reservationStatusToDb(status: ReservationStatus): "ACTIVE" | "SHIPPED" | "RELEASED" {
  if (status === "SHIPPED") return "SHIPPED";
  if (status === "CANCELLED") return "RELEASED";
  return "ACTIVE";
}

export function toReservation(row: {
  id: string;
  orderLineId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  createdAt: Date;
  orderLine: { orderId: string };
  shipmentLines: { shipmentId: string }[];
}): Reservation {
  return {
    id: row.id,
    orderId: row.orderLine.orderId,
    orderLineId: row.orderLineId,
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    quantity: row.quantity,
    status: reservationStatusFromDb(row.status),
    shipmentId: row.shipmentLines[0]?.shipmentId,
    createdAt: isoOf(row.createdAt),
  };
}

export function toBackorder(row: {
  id: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  orderLine: { orderId: string };
}): Backorder {
  let status: Backorder["status"] = "OPEN";
  if (row.resolvedAt) status = row.quantity === 0 ? "CANCELLED" : "FULFILLED";
  return {
    id: row.id,
    orderId: row.orderLine.orderId,
    orderLineId: row.orderLineId,
    variantId: row.variantId,
    remainingQuantity: row.quantity,
    status,
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt),
  };
}

export function toShipment(row: {
  id: string;
  orderId: string;
  warehouseId: string;
  status: string;
  shippingCostSnapshot: unknown;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  lines: { orderLineId: string; quantity: number; reservation: { variantId: string } }[];
}): Shipment {
  const status = row.status as Shipment["status"];
  return {
    id: row.id,
    orderId: row.orderId,
    warehouseId: row.warehouseId,
    status,
    lines: row.lines.map((l) => ({ orderLineId: l.orderLineId, variantId: l.reservation.variantId, quantity: l.quantity })),
    estimatedCost: moneyOf(row.shippingCostSnapshot),
    shippedAt: row.shippedAt ? isoOf(row.shippedAt) : undefined,
    deliveredAt: row.deliveredAt ? isoOf(row.deliveredAt) : undefined,
    createdAt: isoOf(row.createdAt),
  };
}

export function toStockReceipt(row: {
  id: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
  receivedById: string;
  createdAt: Date;
  requestKey: { key: string };
  receivedBy?: { id: string; email: string };
}): StockReceipt {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    variantId: row.variantId,
    quantity: row.quantity,
    requestKey: row.requestKey.key,
    receivedAt: isoOf(row.createdAt),
    actorId: row.receivedBy ? publicUserId(row.receivedBy) : row.receivedById,
  };
}
