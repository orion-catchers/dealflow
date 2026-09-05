/**
 * Prisma InventoryRepository — Engine 2 persistence against Ruchir's warehouse /
 * stock / reservation / shipment / order tables.
 *
 * Fulfillment records are Orders (created by confirmOrder). `saveFulfillment` will not
 * invent an Order row; initialize is idempotent only when the order already exists.
 */
import { randomUUID } from "node:crypto";
import type {
  Backorder,
  OrderForFulfillment,
  Product,
  Reservation,
  Shipment,
  StockLevel,
  StockReceipt,
  Variant,
  Warehouse,
} from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import {
  dateOnly,
  FIXTURE_USER_EMAIL,
  FIXTURE_VARIANT_SKU,
  FIXTURE_WAREHOUSE_CODE,
  isoOf,
  reservationStatusToDb,
  toBackorder,
  toProduct,
  toReservation,
  toShipment,
  toStockLevel,
  toStockReceipt,
  toVariant,
  toWarehouse,
} from "@/server/lib/db/map";
import type {
  BackorderFilter,
  FulfillmentRecord,
  InventoryRepository,
  InventoryStore,
  StockLevelFilter,
} from "./repository";

type Client = Db | Tx;

const reservationInclude = { orderLine: { select: { orderId: true } }, shipmentLines: { select: { shipmentId: true } } } as const;
const backorderInclude = { orderLine: { select: { orderId: true } } } as const;
const shipmentInclude = { lines: { include: { reservation: { select: { variantId: true } } } } } as const;
const productInclude = { category: true, variants: { select: { shippingWeight: true } } } as const;

function requestKeyPair(scope: string, key: string): { scope: "STOCK_RECEIPT" | "ALLOCATION_ACCEPT"; key: string } {
  if (scope === "receipt") return { scope: "STOCK_RECEIPT", key };
  return { scope: "ALLOCATION_ACCEPT", key: `${scope}::${key}` };
}

export class PrismaInventoryStore implements InventoryStore {
  constructor(protected readonly db: Client) {}

  now() {
    return new Date().toISOString();
  }

  async nextId(_prefix: string): Promise<string> {
    return randomUUID();
  }

  private async resolveUserId(symbolOrId: string): Promise<string> {
    const byId = await this.db.user.findUnique({ where: { id: symbolOrId } });
    if (byId) return byId.id;
    const email = FIXTURE_USER_EMAIL[symbolOrId];
    if (email) {
      const byEmail = await this.db.user.findUnique({ where: { email } });
      if (byEmail) return byEmail.id;
    }
    const admin = await this.db.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) throw new ApiFailure("INVALID_INPUT", `Cannot resolve user '${symbolOrId}' to a database user`);
    return admin.id;
  }

  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.db.warehouse.findMany({ orderBy: { code: "asc" } });
    return rows.map(toWarehouse);
  }

  async getWarehouse(id: string): Promise<Warehouse | null> {
    const code = FIXTURE_WAREHOUSE_CODE[id] ?? (id.startsWith("warehouse-") ? id.slice("warehouse-".length).toUpperCase() : id.toUpperCase());
    const row =
      (await this.db.warehouse.findUnique({ where: { id } })) ??
      (await this.db.warehouse.findUnique({ where: { code: id.toUpperCase() } })) ??
      (await this.db.warehouse.findUnique({ where: { code } }));
    return row ? toWarehouse(row) : null;
  }

  async saveWarehouse(warehouse: Warehouse): Promise<Warehouse> {
    const existing = await this.db.warehouse.findUnique({ where: { id: warehouse.id } });
    const data = {
      name: warehouse.name,
      code: warehouse.code,
      shippingCost: warehouse.shippingCostPerShipment,
      active: warehouse.active,
    };
    const row = existing
      ? await this.db.warehouse.update({ where: { id: warehouse.id }, data })
      : await this.db.warehouse.create({ data: { id: warehouse.id, ...data } });
    return toWarehouse(row);
  }

  async listStockLevels(filter?: StockLevelFilter): Promise<StockLevel[]> {
    const rows = await this.db.stock.findMany({
      where: {
        ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
        ...(filter?.variantIds
          ? { variantId: { in: [...filter.variantIds] } }
          : filter?.variantId
            ? { variantId: filter.variantId }
            : {}),
      },
      orderBy: [{ warehouseId: "asc" }, { variantId: "asc" }],
    });
    return rows.map(toStockLevel);
  }

  async getStockLevel(warehouseId: string, variantId: string): Promise<StockLevel | null> {
    const row = await this.db.stock.findUnique({ where: { warehouseId_variantId: { warehouseId, variantId } } });
    return row ? toStockLevel(row) : null;
  }

  async saveStockLevel(level: StockLevel): Promise<StockLevel> {
    const row = await this.db.stock.upsert({
      where: { warehouseId_variantId: { warehouseId: level.warehouseId, variantId: level.variantId } },
      create: {
        warehouseId: level.warehouseId,
        variantId: level.variantId,
        onHand: level.onHand,
        reserved: level.reserved,
        reorderAt: level.reorderThreshold,
      },
      update: { onHand: level.onHand, reserved: level.reserved, reorderAt: level.reorderThreshold },
    });
    return toStockLevel(row);
  }

  private async toFulfillmentRecord(orderId: string): Promise<FulfillmentRecord | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        lines: { include: { product: true, variant: true } },
      },
    });
    if (!order) return null;
    const mapped: OrderForFulfillment = {
      orderId: order.id,
      customerId: order.customerId,
      customerName: order.customer.name,
      repId: order.repId,
      currency: (order.currency === "USD" || order.currency === "EUR" ? order.currency : "INR") as OrderForFulfillment["currency"],
      promisedDate: dateOnly(order.promisedDate),
      confirmedAt: isoOf(order.createdAt),
      lines: order.lines.map((l) => ({
        orderLineId: l.id,
        productId: l.productId,
        productName: l.product.name,
        variantId: l.variantId ?? undefined,
        variantLabel: l.variant?.name,
        quantity: l.quantity,
        stockTracked: l.stockTracked,
        isSubscription: l.billingKind === "RECURRING",
        shippingWeightKg: l.variant?.shippingWeight != null ? Number(l.variant.shippingWeight) : undefined,
      })),
    };
    return {
      order: mapped,
      cancelled: order.fulfillmentStatus === "CANCELLED",
      createdAt: isoOf(order.createdAt),
    };
  }

  async listFulfillments(): Promise<FulfillmentRecord[]> {
    const orders = await this.db.order.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
    const out: FulfillmentRecord[] = [];
    for (const o of orders) {
      const rec = await this.toFulfillmentRecord(o.id);
      if (rec) out.push(rec);
    }
    return out;
  }

  async getFulfillment(orderId: string): Promise<FulfillmentRecord | null> {
    return this.toFulfillmentRecord(orderId);
  }

  async saveFulfillment(record: FulfillmentRecord): Promise<FulfillmentRecord> {
    const existing = await this.db.order.findUnique({ where: { id: record.order.orderId } });
    if (!existing) {
      throw new ApiFailure(
        "NOT_FOUND",
        `Order ${record.order.orderId} is not in the database. confirmOrder must persist the order before initializeFulfillment.`,
      );
    }
    await this.db.order.update({
      where: { id: record.order.orderId },
      data: { fulfillmentStatus: record.cancelled ? "CANCELLED" : existing.fulfillmentStatus === "CANCELLED" ? "PENDING" : existing.fulfillmentStatus },
    });
    const rec = await this.toFulfillmentRecord(record.order.orderId);
    if (!rec) throw new ApiFailure("NOT_FOUND", `Order ${record.order.orderId} not found`);
    return { ...rec, cancelled: record.cancelled, cancelReason: record.cancelReason, cancelledAt: record.cancelledAt };
  }

  async listReservations(orderId?: string): Promise<Reservation[]> {
    const rows = await this.db.reservation.findMany({
      where: orderId ? { orderLine: { orderId } } : undefined,
      include: reservationInclude,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toReservation);
  }

  async saveReservation(reservation: Reservation): Promise<Reservation> {
    const status = reservationStatusToDb(reservation.status);
    const data = {
      orderLineId: reservation.orderLineId,
      variantId: reservation.variantId,
      warehouseId: reservation.warehouseId,
      quantity: reservation.quantity,
      status,
      releasedAt: status === "RELEASED" ? new Date() : null,
    };
    const existing = await this.db.reservation.findUnique({ where: { id: reservation.id } });
    const row = existing
      ? await this.db.reservation.update({ where: { id: reservation.id }, data, include: reservationInclude })
      : await this.db.reservation.create({ data: { id: reservation.id, ...data }, include: reservationInclude });
    return toReservation(row);
  }

  async listBackorders(filter?: BackorderFilter): Promise<Backorder[]> {
    const rows = await this.db.backorder.findMany({
      where: {
        variantId: filter?.variantId,
        orderLine: filter?.orderId ? { orderId: filter.orderId } : undefined,
      },
      include: backorderInclude,
      orderBy: { createdAt: "asc" },
    });
    const mapped = rows.map(toBackorder);
    return filter?.status ? mapped.filter((b) => b.status === filter.status) : mapped;
  }

  async saveBackorder(backorder: Backorder): Promise<Backorder> {
    const resolvedAt = backorder.status === "OPEN" ? null : new Date(backorder.updatedAt);
    const quantity = backorder.status === "CANCELLED" ? 0 : backorder.remainingQuantity;
    const data = {
      orderLineId: backorder.orderLineId,
      variantId: backorder.variantId,
      quantity,
      resolvedAt,
    };
    const existing = await this.db.backorder.findUnique({ where: { id: backorder.id } });
    const row = existing
      ? await this.db.backorder.update({ where: { id: backorder.id }, data, include: backorderInclude })
      : await this.db.backorder.create({ data: { id: backorder.id, ...data }, include: backorderInclude });
    return toBackorder(row);
  }

  async listShipments(orderId?: string): Promise<Shipment[]> {
    const rows = await this.db.shipment.findMany({
      where: orderId ? { orderId } : undefined,
      include: shipmentInclude,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toShipment);
  }

  async getShipment(id: string): Promise<Shipment | null> {
    const row = await this.db.shipment.findUnique({ where: { id }, include: shipmentInclude });
    return row ? toShipment(row) : null;
  }

  async saveShipment(shipment: Shipment): Promise<Shipment> {
    const data = {
      orderId: shipment.orderId,
      warehouseId: shipment.warehouseId,
      status: shipment.status,
      shippingCostSnapshot: shipment.estimatedCost,
      shippedAt: shipment.shippedAt ? new Date(shipment.shippedAt) : null,
      deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
    };
    const existing = await this.db.shipment.findUnique({ where: { id: shipment.id } });
    if (existing) {
      await this.db.shipment.update({ where: { id: shipment.id }, data });
    } else {
      await this.db.shipment.create({ data: { id: shipment.id, ...data } });
    }

    if (!existing) {
      for (const line of shipment.lines) {
        const reservation = await this.db.reservation.findFirst({
          where: {
            orderLineId: line.orderLineId,
            variantId: line.variantId,
            warehouseId: shipment.warehouseId,
            status: { not: "RELEASED" },
            shipmentLines: { none: {} },
          },
        });
        if (!reservation) continue;
        await this.db.shipmentLine.create({
          data: {
            shipmentId: shipment.id,
            orderLineId: line.orderLineId,
            reservationId: reservation.id,
            quantity: line.quantity,
          },
        });
      }
    }

    const row = await this.db.shipment.findUnique({ where: { id: shipment.id }, include: shipmentInclude });
    if (!row) throw new ApiFailure("NOT_FOUND", `Shipment ${shipment.id} not found`);
    return toShipment(row);
  }

  async saveReceipt(receipt: StockReceipt): Promise<StockReceipt> {
    const actorId = await this.resolveUserId(receipt.actorId);
    const pair = requestKeyPair("receipt", receipt.requestKey);
    const rk = await this.db.requestKey.upsert({
      where: { scope_key: { scope: pair.scope, key: pair.key } },
      create: { scope: pair.scope, key: pair.key, actorId },
      update: {},
    });
    const existing = await this.db.stockReceipt.findUnique({ where: { requestKeyId: rk.id } });
    if (existing) {
      const full = await this.db.stockReceipt.findUnique({
        where: { id: existing.id },
        include: { requestKey: true, receivedBy: true },
      });
      return toStockReceipt(full!);
    }
    const row = await this.db.stockReceipt.create({
      data: {
        id: receipt.id,
        warehouseId: receipt.warehouseId,
        variantId: receipt.variantId,
        quantity: receipt.quantity,
        receivedById: actorId,
        requestKeyId: rk.id,
      },
      include: { requestKey: true, receivedBy: true },
    });
    return toStockReceipt(row);
  }

  async getRequestResult<T>(scope: string, key: string): Promise<T | null> {
    const pair = requestKeyPair(scope, key);
    const row = await this.db.requestKey.findUnique({ where: { scope_key: { scope: pair.scope, key: pair.key } } });
    if (!row?.completedAt || row.resultPayload == null) return null;
    return row.resultPayload as T;
  }

  async saveRequestResult<T>(scope: string, key: string, result: T): Promise<void> {
    const pair = requestKeyPair(scope, key);
    const kind = pair.scope === "STOCK_RECEIPT" ? "STOCK_RECEIPT" : "ALLOCATION";
    const payload = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
    const resultId =
      result && typeof result === "object" && result !== null && "receipt" in result && (result as { receipt?: { id?: string } }).receipt?.id
        ? String((result as { receipt: { id: string } }).receipt.id)
        : key;
    await this.db.requestKey.upsert({
      where: { scope_key: { scope: pair.scope, key: pair.key } },
      create: {
        scope: pair.scope,
        key: pair.key,
        resultKind: kind,
        resultId,
        resultPayload: payload,
        completedAt: new Date(),
      },
      update: {
        resultKind: kind,
        resultId,
        resultPayload: payload,
        completedAt: new Date(),
      },
    });
  }

  async getVariant(id: string): Promise<Variant | null> {
    const sku = FIXTURE_VARIANT_SKU[id] ?? id;
    const row =
      (await this.db.variant.findUnique({ where: { id }, include: { product: { select: { baseCost: true } } } })) ??
      (await this.db.variant.findUnique({ where: { sku: id }, include: { product: { select: { baseCost: true } } } })) ??
      (await this.db.variant.findUnique({ where: { sku }, include: { product: { select: { baseCost: true } } } }));
    return row ? toVariant(row, Number(row.product.baseCost)) : null;
  }

  async getProduct(id: string): Promise<Product | null> {
    const row = await this.db.product.findUnique({ where: { id }, include: productInclude });
    return row ? toProduct(row) : null;
  }
}

export class PrismaInventoryRepository extends PrismaInventoryStore implements InventoryRepository {
  constructor() {
    super(prisma);
  }

  async withTransaction<T>(fn: (tx: InventoryStore) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => fn(new PrismaInventoryStore(tx)));
  }

  reset(): void {
    // Live database is not reset from the fulfillment service. Use `pnpm prisma db seed`.
  }
}
