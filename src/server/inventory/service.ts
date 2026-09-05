/**
 * Engine 2 — FulfillmentService (DEV FIXTURE storage via InventoryRepository).
 *
 * Orchestrates the pure engine (./engine) against the repository. Every mutation runs
 * inside `withTransaction`, rechecks stock, and is idempotent by request key
 * (results stored under `${scope}:${requestKey}`).
 *
 * Roles: reads → any internal role (not CUSTOMER); allocation mutations → FINANCE/ADMIN;
 * warehouse/stock configuration → ADMIN.
 */
import type {
  AcceptSplitInput,
  Actor,
  AllocationCommitResult,
  AllocationPlanEntry,
  Backorder,
  BackorderPlanEntry,
  CancelAllocationInput,
  CancelAllocationResult,
  ConsolidateInput,
  DeliverInput,
  FulfillmentDetail,
  FulfillmentListItem,
  FulfillmentStatus,
  InitializeFulfillmentInput,
  InitializeFulfillmentResult,
  OrderDeliveryRead,
  OrderForFulfillment,
  OverrideSplitInput,
  ReceiptInput,
  ReceiptResult,
  Reservation,
  Role,
  Shipment,
  ShipInput,
  ShipmentActionResult,
  SplitPreview,
  StockLevel,
  StockLevelUpsertInput,
  StockListItem,
  Warehouse,
} from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { requireRole } from "@/server/lib/auth/dev-actor";
import {
  available,
  deriveStatus,
  estimateShipmentCost,
  isStockTrackedLine,
  previewSplit,
  remainingByLine,
  summarizeLines,
  totalUnits,
  validatePlan,
  type LineSummary,
  type PlanValidationError,
  type UnitTotals,
} from "./engine";
import { getInventoryRepository, type FulfillmentRecord, type InventoryRepository, type InventoryStore } from "./repository";
import { carrierConfigured, quoteCarrierShipment } from "@/server/integrations/carrier";

const INTERNAL_ROLES: Role[] = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"];
const MUTATION_ROLES: Role[] = ["FINANCE", "ADMIN"];
const CONFIG_ROLES: Role[] = ["ADMIN"];

export type WarehouseCreateInput = Omit<Warehouse, "id" | "active"> & { id?: string; active?: boolean };
export type WarehouseUpdateInput = Partial<Omit<Warehouse, "id">>;

interface OrderState {
  rec: FulfillmentRecord;
  order: OrderForFulfillment;
  reservations: Reservation[];
  backorders: Backorder[];
  shipments: Shipment[];
  lines: LineSummary[];
  totals: UnitTotals;
  status: FulfillmentStatus;
}

interface CommitOutput {
  reservations: Reservation[];
  shipments: Shipment[];
}

function throwPlanErrors(errors: PlanValidationError[]): void {
  if (errors.length === 0) return;
  const shortages = errors.filter((e) => e.kind === "SHORTAGE");
  const invalid = errors.filter((e) => e.kind === "INVALID");
  if (invalid.length > 0) {
    throw new ApiFailure("INVALID_INPUT", "Allocation plan is invalid", { errors: invalid });
  }
  throw new ApiFailure("CONFLICT", "Insufficient available stock for the requested plan", { errors: shortages });
}

function sortByCreated<T extends { createdAt: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export class FulfillmentService {
  constructor(private readonly repo: InventoryRepository) {}

  private async withCarrierRates(warehouses: Warehouse[]): Promise<Warehouse[]> {
    if (!carrierConfigured()) return warehouses;
    return Promise.all(
      warehouses.map(async (warehouse) => {
        try {
          const quote = await quoteCarrierShipment({ warehouseCode: warehouse.code, weightKg: 1 });
          if (quote.source !== "LIVE") return warehouse;
          return { ...warehouse, shippingCostPerShipment: quote.amount };
        } catch {
          return warehouse;
        }
      }),
    );
  }

  private forCompany(actor: Actor, warehouses: Warehouse[]): Warehouse[] {
    if (!actor.companyId) return warehouses;
    return warehouses.filter((w) => !w.companyId || w.companyId === actor.companyId);
  }

  // -------------------------------------------------------------------------
  // Initializer (called inside Atharva's confirmOrder transaction; no actor)
  // -------------------------------------------------------------------------

  /** Records the order as PENDING fulfillment. No reservations, no mail. Idempotent per orderId. */
  async initializeFulfillment(input: InitializeFulfillmentInput): Promise<InitializeFulfillmentResult> {
    const { order } = input;
    if (!order?.orderId) throw new ApiFailure("INVALID_INPUT", "order.orderId is required");
    return this.repo.withTransaction(async (tx) => {
      const existing = await tx.getFulfillment(order.orderId);
      if (existing) return { orderId: order.orderId, status: "PENDING", created: false };
      await tx.saveFulfillment({ order, cancelled: false, createdAt: tx.now() });
      return { orderId: order.orderId, status: "PENDING", created: true };
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async listFulfillment(actor: Actor): Promise<FulfillmentListItem[]> {
    requireRole(actor, ...INTERNAL_ROLES);
    const records = await this.repo.listFulfillments();
    const items: FulfillmentListItem[] = [];
    for (const rec of records) {
      const state = await this.loadState(this.repo, rec.order.orderId);
      items.push({
        orderId: rec.order.orderId,
        customerName: rec.order.customerName,
        confirmedAt: rec.order.confirmedAt,
        promisedDate: rec.order.promisedDate,
        status: state.status,
        stockTrackedUnits: state.totals.stockTrackedUnits,
        allocatedUnits: state.totals.allocatedUnits,
        shippedUnits: state.totals.shippedUnits,
        deliveredUnits: state.totals.deliveredUnits,
        backorderedUnits: state.totals.backorderedUnits,
        shipmentCount: state.shipments.filter((s) => s.status !== "CANCELLED").length,
      });
    }
    return items.sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt) || a.orderId.localeCompare(b.orderId));
  }

  async listStock(actor: Actor, filter?: { warehouseId?: string; variantId?: string }): Promise<StockListItem[]> {
    requireRole(actor, ...INTERNAL_ROLES);
    const levels = await this.repo.listStockLevels(filter);
    return this.toStockItems(this.repo, levels);
  }

  async getDetail(actor: Actor, orderId: string): Promise<FulfillmentDetail> {
    requireRole(actor, ...INTERNAL_ROLES);
    const state = await this.loadState(this.repo, orderId);
    const warehouses = this.forCompany(actor, await this.withCarrierRates(await this.repo.listWarehouses()));
    const variantIds = state.order.lines.filter(isStockTrackedLine).map((l) => l.variantId as string);
    const levels = await this.repo.listStockLevels({ variantIds });

    const remaining = remainingByLine(state.lines, "UNALLOCATED");
    let anyRemaining = false;
    for (const q of remaining.values()) if (q > 0) anyRemaining = true;

    let preview: SplitPreview | null = null;
    if (state.totals.stockTrackedUnits === 0) {
      preview = previewSplit(state.order, levels, warehouses, state);
    } else if (!state.rec.cancelled && anyRemaining) {
      preview = previewSplit(state.order, levels, warehouses, state);
    }

    const activeIds = new Set(warehouses.filter((w) => w.active).map((w) => w.id));
    const openBackorderVariants = new Set(state.backorders.filter((b) => b.status === "OPEN").map((b) => b.variantId));
    const consolidationAvailable =
      !state.rec.cancelled &&
      levels.some((l) => activeIds.has(l.warehouseId) && openBackorderVariants.has(l.variantId) && available(l) > 0);

    return {
      order: state.order,
      status: state.status,
      lines: state.lines,
      reservations: sortByCreated(state.reservations),
      backorders: sortByCreated(state.backorders),
      shipments: sortByCreated(state.shipments),
      preview,
      stock: await this.toStockItems(this.repo, levels),
      consolidationAvailable,
    };
  }

  async preview(actor: Actor, orderId: string): Promise<SplitPreview> {
    requireRole(actor, ...INTERNAL_ROLES);
    const state = await this.loadState(this.repo, orderId);
    const warehouses = this.forCompany(actor, await this.withCarrierRates(await this.repo.listWarehouses()));
    const levels = await this.repo.listStockLevels();
    return previewSplit(state.order, levels, warehouses, state);
  }

  async getDeliveryRead(actor: Actor, orderId: string): Promise<OrderDeliveryRead> {
    requireRole(actor, ...INTERNAL_ROLES);
    const state = await this.loadState(this.repo, orderId);
    const t = state.totals;
    return {
      orderId,
      status: state.status,
      totalStockTrackedUnits: t.stockTrackedUnits,
      deliveredUnits: t.deliveredUnits,
      shippedUnits: t.shippedUnits,
      undeliveredUnits: Math.max(0, t.stockTrackedUnits - t.deliveredUnits),
      promisedDate: state.order.promisedDate,
    };
  }

  // -------------------------------------------------------------------------
  // Accept (rule 5) — commit reservations once under a unique requestKey
  // -------------------------------------------------------------------------

  async accept(input: AcceptSplitInput): Promise<AllocationCommitResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, requestKey } = input;
    return this.repo.withTransaction(async (tx) => {
      const scope = `accept:${orderId}`;
      const replay = await tx.getRequestResult<AllocationCommitResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      const state = await this.loadState(tx, orderId);
      this.assertNotCancelled(state);
      const alreadyAllocated =
        state.reservations.some((r) => r.status !== "CANCELLED") || state.backorders.some((b) => b.status !== "CANCELLED");
      if (alreadyAllocated) {
        throw new ApiFailure("CONFLICT", "Order is already allocated; use override or consolidate", { orderId, status: state.status });
      }
      if (state.totals.stockTrackedUnits === 0) {
        throw new ApiFailure("INVALID_INPUT", "Order has no stock-tracked lines; nothing to allocate", {
          code: "NO_STOCK_TRACKED_LINES",
          orderId,
        });
      }

      const warehouses = await tx.listWarehouses();
      const levels = await tx.listStockLevels();
      let plan = input.plan;
      if (!plan) {
        const p = previewSplit(state.order, levels, warehouses);
        plan = { allocations: p.allocations, backorders: p.backorders };
      }

      throwPlanErrors(
        validatePlan({
          order: state.order,
          allocations: plan.allocations,
          backorders: plan.backorders,
          stockLevels: levels,
          warehouses,
          ownReservations: [],
          remainingByLine: remainingByLine(state.lines, "UNSHIPPED"),
        }),
      );

      const committed = await this.commitAllocations(tx, state.order, plan.allocations, warehouses);
      const createdBackorders = await this.createBackorders(tx, state.order, plan.backorders);
      const after = await this.loadState(tx, orderId);

      const result: AllocationCommitResult = {
        orderId,
        requestKey,
        status: after.status,
        replayed: false,
        reservations: committed.reservations,
        backorders: createdBackorders,
        shipments: committed.shipments,
      };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Override (rule 7) — full replacement of the UNSHIPPED remainder
  // -------------------------------------------------------------------------

  async override(input: OverrideSplitInput): Promise<AllocationCommitResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, requestKey } = input;
    return this.repo.withTransaction(async (tx) => {
      const scope = `override:${orderId}`;
      const replay = await tx.getRequestResult<AllocationCommitResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      const state = await this.loadState(tx, orderId);
      this.assertNotCancelled(state);
      if (state.totals.stockTrackedUnits === 0) {
        throw new ApiFailure("INVALID_INPUT", "Order has no stock-tracked lines; nothing to allocate", {
          code: "NO_STOCK_TRACKED_LINES",
          orderId,
        });
      }

      const warehouses = await tx.listWarehouses();
      const levels = await tx.listStockLevels();
      const own = state.reservations.filter((r) => r.status === "RESERVED");

      throwPlanErrors(
        validatePlan({
          order: state.order,
          allocations: input.allocations,
          backorders: input.backorders,
          stockLevels: levels,
          warehouses,
          ownReservations: own,
          remainingByLine: remainingByLine(state.lines, "UNSHIPPED"),
        }),
      );

      // Release this order's unshipped state atomically (SHIPPED reservations/shipments untouched).
      await this.releaseUnshipped(tx, state);

      const committed = await this.commitAllocations(tx, state.order, input.allocations, warehouses);
      const createdBackorders = await this.createBackorders(tx, state.order, input.backorders);
      const after = await this.loadState(tx, orderId);

      const result: AllocationCommitResult = {
        orderId,
        requestKey,
        status: after.status,
        replayed: false,
        reservations: committed.reservations,
        backorders: createdBackorders,
        shipments: committed.shipments,
      };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Receipt (rule 8) — onHand += qty, then list eligible backorders (no auto-commit)
  // -------------------------------------------------------------------------

  async receipt(input: ReceiptInput): Promise<ReceiptResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ApiFailure("INVALID_INPUT", "Receipt quantity must be a positive integer");
    }
    return this.repo.withTransaction(async (tx) => {
      const scope = "receipt";
      const replay = await tx.getRequestResult<ReceiptResult>(scope, input.requestKey);
      if (replay) return replay;

      const warehouse = await tx.getWarehouse(input.warehouseId);
      if (!warehouse) throw new ApiFailure("NOT_FOUND", `Warehouse ${input.warehouseId} not found`);
      if (!warehouse.active) throw new ApiFailure("INVALID_INPUT", `Warehouse ${input.warehouseId} is inactive`);
      const variant = await tx.getVariant(input.variantId);
      if (!variant) throw new ApiFailure("NOT_FOUND", `Variant ${input.variantId} not found`);
      const warehouseId = warehouse.id;
      const variantId = variant.id;

      const level: StockLevel = (await tx.getStockLevel(warehouseId, variantId)) ?? {
        warehouseId,
        variantId,
        onHand: 0,
        reserved: 0,
        reorderThreshold: 0,
      };
      level.onHand += input.quantity;
      const stock = await tx.saveStockLevel(level);

      const receipt = await tx.saveReceipt({
        id: await tx.nextId("rcpt"),
        warehouseId,
        variantId,
        quantity: input.quantity,
        requestKey: input.requestKey,
        receivedAt: tx.now(),
        actorId: input.actor.id,
        note: input.note,
      });

      // Eligible OPEN backorders for this variant, oldest order first.
      const open = await tx.listBackorders({ variantId, status: "OPEN" });
      const withOrders: { backorder: Backorder; rec: FulfillmentRecord }[] = [];
      for (const b of open) {
        const rec = await tx.getFulfillment(b.orderId);
        if (rec && !rec.cancelled) withOrders.push({ backorder: b, rec });
      }
      withOrders.sort(
        (a, b) =>
          a.rec.order.confirmedAt.localeCompare(b.rec.order.confirmedAt) ||
          a.backorder.createdAt.localeCompare(b.backorder.createdAt) ||
          a.backorder.id.localeCompare(b.backorder.id),
      );
      let pool = available(stock);
      const eligibleBackorders: ReceiptResult["eligibleBackorders"] = [];
      for (const { backorder, rec } of withOrders) {
        const coverable = Math.min(backorder.remainingQuantity, pool);
        if (coverable <= 0) continue;
        pool -= coverable;
        eligibleBackorders.push({ backorder, orderId: rec.order.orderId, customerName: rec.order.customerName, coverable });
      }

      const result: ReceiptResult = { receipt, stock, eligibleBackorders };
      await tx.saveRequestResult(scope, input.requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Consolidate (rule 9) — allocate against OPEN backorders; new PLANNED shipment
  // -------------------------------------------------------------------------

  async consolidate(input: ConsolidateInput): Promise<AllocationCommitResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, requestKey } = input;
    return this.repo.withTransaction(async (tx) => {
      const scope = `consolidate:${orderId}`;
      const replay = await tx.getRequestResult<AllocationCommitResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      const state = await this.loadState(tx, orderId);
      this.assertNotCancelled(state);
      if (input.allocations.length === 0) throw new ApiFailure("INVALID_INPUT", "Consolidation needs at least one allocation");

      const openByLine = new Map<string, number>();
      for (const b of state.backorders) {
        if (b.status !== "OPEN") continue;
        openByLine.set(b.orderLineId, (openByLine.get(b.orderLineId) ?? 0) + b.remainingQuantity);
      }
      if (openByLine.size === 0) throw new ApiFailure("CONFLICT", "Order has no open backorders to consolidate", { orderId });

      const warehouses = await tx.listWarehouses();
      const levels = await tx.listStockLevels();
      throwPlanErrors(
        validatePlan({
          order: state.order,
          allocations: input.allocations,
          backorders: [],
          stockLevels: levels,
          warehouses,
          ownReservations: [],
          remainingByLine: openByLine,
          allowPartial: true,
        }),
      );

      const committed = await this.commitAllocations(tx, state.order, input.allocations, warehouses);

      // Reduce OPEN backorders per line, oldest first; FULFILLED at zero.
      const updated: Backorder[] = [];
      const allocatedByLine = new Map<string, number>();
      for (const a of input.allocations) allocatedByLine.set(a.orderLineId, (allocatedByLine.get(a.orderLineId) ?? 0) + a.quantity);
      const openSorted = sortByCreated(state.backorders.filter((b) => b.status === "OPEN"));
      for (const [orderLineId, qty] of allocatedByLine) {
        let left = qty;
        for (const b of openSorted) {
          if (left <= 0) break;
          if (b.orderLineId !== orderLineId) continue;
          const take = Math.min(b.remainingQuantity, left);
          b.remainingQuantity -= take;
          left -= take;
          b.updatedAt = tx.now();
          if (b.remainingQuantity === 0) b.status = "FULFILLED";
          updated.push(await tx.saveBackorder(b));
        }
      }

      const after = await this.loadState(tx, orderId);
      const result: AllocationCommitResult = {
        orderId,
        requestKey,
        status: after.status,
        replayed: false,
        reservations: committed.reservations,
        backorders: updated,
        shipments: committed.shipments,
      };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Ship / Deliver (rule 10)
  // -------------------------------------------------------------------------

  async ship(input: ShipInput): Promise<ShipmentActionResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, shipmentId, requestKey } = input;
    return this.repo.withTransaction(async (tx) => {
      const scope = `ship:${orderId}`;
      const replay = await tx.getRequestResult<ShipmentActionResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      const state = await this.loadState(tx, orderId);
      const shipment = await tx.getShipment(shipmentId);
      if (!shipment || shipment.orderId !== orderId) throw new ApiFailure("NOT_FOUND", `Shipment ${shipmentId} not found for order ${orderId}`);
      if (shipment.status !== "PLANNED") {
        throw new ApiFailure("CONFLICT", `Shipment ${shipmentId} is ${shipment.status}; only PLANNED shipments can ship`, { status: shipment.status });
      }

      // Consume onHand and reserved exactly once per reservation in this shipment.
      for (const r of state.reservations) {
        if (r.shipmentId !== shipmentId || r.status !== "RESERVED") continue;
        const level = await tx.getStockLevel(r.warehouseId, r.variantId);
        if (!level) throw new ApiFailure("CONFLICT", `Stock level missing for ${r.warehouseId}/${r.variantId}`);
        level.onHand = Math.max(0, level.onHand - r.quantity);
        level.reserved = Math.max(0, level.reserved - r.quantity);
        await tx.saveStockLevel(level);
        r.status = "SHIPPED";
        await tx.saveReservation(r);
      }
      shipment.status = "SHIPPED";
      shipment.shippedAt = tx.now();
      const saved = await tx.saveShipment(shipment);

      const after = await this.loadState(tx, orderId);
      const result: ShipmentActionResult = { orderId, shipmentId, status: after.status, shipment: saved, replayed: false };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  async deliver(input: DeliverInput): Promise<ShipmentActionResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, shipmentId, requestKey } = input;
    return this.repo.withTransaction(async (tx) => {
      const scope = `deliver:${orderId}`;
      const replay = await tx.getRequestResult<ShipmentActionResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      await this.loadState(tx, orderId); // NOT_FOUND guard
      const shipment = await tx.getShipment(shipmentId);
      if (!shipment || shipment.orderId !== orderId) throw new ApiFailure("NOT_FOUND", `Shipment ${shipmentId} not found for order ${orderId}`);
      if (shipment.status !== "SHIPPED") {
        throw new ApiFailure("CONFLICT", `Shipment ${shipmentId} is ${shipment.status}; only SHIPPED shipments can be delivered`, { status: shipment.status });
      }
      shipment.status = "DELIVERED";
      shipment.deliveredAt = tx.now();
      const saved = await tx.saveShipment(shipment);

      const after = await this.loadState(tx, orderId);
      const result: ShipmentActionResult = { orderId, shipmentId, status: after.status, shipment: saved, replayed: false };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Cancel unshipped allocation (rule 10)
  // -------------------------------------------------------------------------

  async cancel(input: CancelAllocationInput): Promise<CancelAllocationResult> {
    requireRole(input.actor, ...MUTATION_ROLES);
    const { orderId, requestKey } = input;
    if (!input.reason || input.reason.trim().length === 0) throw new ApiFailure("INVALID_INPUT", "Cancellation reason is required");
    return this.repo.withTransaction(async (tx) => {
      const scope = `cancel:${orderId}`;
      const replay = await tx.getRequestResult<CancelAllocationResult>(scope, requestKey);
      if (replay) return { ...replay, replayed: true };

      const state = await this.loadState(tx, orderId);
      this.assertNotCancelled(state);

      const released = await this.releaseUnshipped(tx, state);
      const rec: FulfillmentRecord = { ...state.rec, cancelled: true, cancelReason: input.reason, cancelledAt: tx.now() };
      await tx.saveFulfillment(rec);

      const after = await this.loadState(tx, orderId);
      const result: CancelAllocationResult = {
        orderId,
        status: after.status,
        releasedUnits: released.releasedUnits,
        cancelledReservationIds: released.reservationIds,
        cancelledBackorderIds: released.backorderIds,
        cancelledShipmentIds: released.shipmentIds,
        replayed: false,
      };
      await tx.saveRequestResult(scope, requestKey, result);
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Warehouse / stock configuration (ADMIN)
  // -------------------------------------------------------------------------

  async listWarehouses(actor: Actor): Promise<Warehouse[]> {
    requireRole(actor, ...INTERNAL_ROLES);
    return this.forCompany(actor, await this.repo.listWarehouses());
  }

  async createWarehouse(actor: Actor, input: WarehouseCreateInput): Promise<Warehouse> {
    requireRole(actor, ...CONFIG_ROLES);
    return this.repo.withTransaction(async (tx) => {
      const id = input.id ?? `warehouse-${input.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (await tx.getWarehouse(id)) throw new ApiFailure("CONFLICT", `Warehouse ${id} already exists`);
      const all = await tx.listWarehouses();
      if (all.some((w) => w.code.toLowerCase() === input.code.toLowerCase())) {
        throw new ApiFailure("CONFLICT", `Warehouse code ${input.code} already in use`);
      }
      return tx.saveWarehouse({
        id,
        name: input.name,
        code: input.code,
        shippingCostPerShipment: input.shippingCostPerShipment,
        shippingCostPerKg: input.shippingCostPerKg,
        companyId: actor.companyId,
        active: input.active ?? true,
      });
    });
  }

  async updateWarehouse(actor: Actor, id: string, patch: WarehouseUpdateInput): Promise<Warehouse> {
    requireRole(actor, ...CONFIG_ROLES);
    return this.repo.withTransaction(async (tx) => {
      const existing = await tx.getWarehouse(id);
      if (!existing) throw new ApiFailure("NOT_FOUND", `Warehouse ${id} not found`);
      if (patch.code && patch.code.toLowerCase() !== existing.code.toLowerCase()) {
        const all = await tx.listWarehouses();
        if (all.some((w) => w.id !== id && w.code.toLowerCase() === patch.code!.toLowerCase())) {
          throw new ApiFailure("CONFLICT", `Warehouse code ${patch.code} already in use`);
        }
      }
      return tx.saveWarehouse({ ...existing, ...patch, id });
    });
  }

  /** Admin edit of threshold and/or onHand. onHand may not drop below reserved. */
  async upsertStockLevel(input: StockLevelUpsertInput): Promise<StockListItem> {
    requireRole(input.actor, ...CONFIG_ROLES);
    if (input.onHand === undefined && input.reorderThreshold === undefined) {
      throw new ApiFailure("INVALID_INPUT", "Provide onHand and/or reorderThreshold");
    }
    return this.repo.withTransaction(async (tx) => {
      if (!(await tx.getWarehouse(input.warehouseId))) throw new ApiFailure("NOT_FOUND", `Warehouse ${input.warehouseId} not found`);
      if (!(await tx.getVariant(input.variantId))) throw new ApiFailure("NOT_FOUND", `Variant ${input.variantId} not found`);
      const level: StockLevel = (await tx.getStockLevel(input.warehouseId, input.variantId)) ?? {
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        onHand: 0,
        reserved: 0,
        reorderThreshold: 0,
      };
      if (input.onHand !== undefined) {
        if (!Number.isInteger(input.onHand) || input.onHand < 0) throw new ApiFailure("INVALID_INPUT", "onHand must be a non-negative integer");
        if (input.onHand < level.reserved) {
          throw new ApiFailure("CONFLICT", `onHand (${input.onHand}) cannot be below reserved (${level.reserved})`, { reserved: level.reserved });
        }
        level.onHand = input.onHand;
      }
      if (input.reorderThreshold !== undefined) {
        if (!Number.isInteger(input.reorderThreshold) || input.reorderThreshold < 0) {
          throw new ApiFailure("INVALID_INPUT", "reorderThreshold must be a non-negative integer");
        }
        level.reorderThreshold = input.reorderThreshold;
      }
      const saved = await tx.saveStockLevel(level);
      const [item] = await this.toStockItems(tx, [saved]);
      return item;
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadState(store: InventoryStore, orderId: string): Promise<OrderState> {
    const rec = await store.getFulfillment(orderId);
    if (!rec) throw new ApiFailure("NOT_FOUND", `Fulfillment for order ${orderId} not found`);
    const [reservations, backorders, shipments] = await Promise.all([
      store.listReservations(orderId),
      store.listBackorders({ orderId }),
      store.listShipments(orderId),
    ]);
    const lines = summarizeLines(rec.order, reservations, backorders, shipments);
    return {
      rec,
      order: rec.order,
      reservations,
      backorders,
      shipments,
      lines,
      totals: totalUnits(lines),
      status: deriveStatus(lines, { cancelled: rec.cancelled }),
    };
  }

  private assertNotCancelled(state: OrderState): void {
    if (state.rec.cancelled) {
      throw new ApiFailure("CONFLICT", `Fulfillment for order ${state.order.orderId} is cancelled`, { reason: state.rec.cancelReason });
    }
  }

  /**
   * Create RESERVED reservations and one PLANNED shipment per warehouse used.
   * Caller must have validated the plan; stock is re-read per cell inside the transaction.
   */
  private async commitAllocations(
    tx: InventoryStore,
    order: OrderForFulfillment,
    allocations: AllocationPlanEntry[],
    warehouses: Warehouse[],
  ): Promise<CommitOutput> {
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const lineById = new Map(order.lines.map((l) => [l.orderLineId, l]));
    const byWarehouse = new Map<string, AllocationPlanEntry[]>();
    for (const a of allocations) {
      if (a.quantity <= 0) continue;
      const list = byWarehouse.get(a.warehouseId) ?? [];
      list.push(a);
      byWarehouse.set(a.warehouseId, list);
    }

    const reservations: Reservation[] = [];
    const shipments: Shipment[] = [];
    const now = tx.now();

    for (const warehouseId of [...byWarehouse.keys()].sort()) {
      const entries = byWarehouse.get(warehouseId)!;
      const warehouse = warehouseById.get(warehouseId);
      if (!warehouse) throw new ApiFailure("INVALID_INPUT", `Unknown warehouse ${warehouseId}`);
      const shipmentId = await tx.nextId("shp");

      const lineMap = new Map<string, Shipment["lines"][number]>();
      let kg = 0;
      for (const a of entries) {
        const level = await tx.getStockLevel(warehouseId, a.variantId);
        if (!level || available(level) < a.quantity) {
          throw new ApiFailure("CONFLICT", "Insufficient available stock during commit", { warehouseId, variantId: a.variantId });
        }
        level.reserved += a.quantity;
        await tx.saveStockLevel(level);

        reservations.push(
          await tx.saveReservation({
            id: await tx.nextId("rsv"),
            orderId: order.orderId,
            orderLineId: a.orderLineId,
            variantId: a.variantId,
            warehouseId,
            quantity: a.quantity,
            status: "RESERVED",
            shipmentId,
            createdAt: now,
          }),
        );

        const key = `${a.orderLineId}::${a.variantId}`;
        const line = lineMap.get(key) ?? { orderLineId: a.orderLineId, variantId: a.variantId, quantity: 0 };
        line.quantity += a.quantity;
        lineMap.set(key, line);
        kg += a.quantity * (lineById.get(a.orderLineId)?.shippingWeightKg ?? 0);
      }

      shipments.push(
        await tx.saveShipment({
          id: shipmentId,
          orderId: order.orderId,
          warehouseId,
          status: "PLANNED",
          lines: [...lineMap.values()],
          estimatedCost: estimateShipmentCost(warehouse, kg),
          createdAt: now,
        }),
      );
    }
    return { reservations, shipments };
  }

  /** Create OPEN backorders, merged per order line. */
  private async createBackorders(tx: InventoryStore, order: OrderForFulfillment, entries: BackorderPlanEntry[]): Promise<Backorder[]> {
    const merged = new Map<string, BackorderPlanEntry>();
    for (const e of entries) {
      if (e.quantity <= 0) continue;
      const m = merged.get(e.orderLineId) ?? { ...e, quantity: 0 };
      m.quantity += e.quantity;
      merged.set(e.orderLineId, m);
    }
    const out: Backorder[] = [];
    const now = tx.now();
    for (const e of merged.values()) {
      out.push(
        await tx.saveBackorder({
          id: await tx.nextId("bo"),
          orderId: order.orderId,
          orderLineId: e.orderLineId,
          variantId: e.variantId,
          remainingQuantity: e.quantity,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return out;
  }

  /**
   * Cancel RESERVED reservations (releasing stock), OPEN backorders and PLANNED shipments
   * for the order. SHIPPED/DELIVERED reservations and shipments are never touched.
   */
  private async releaseUnshipped(
    tx: InventoryStore,
    state: OrderState,
  ): Promise<{ releasedUnits: number; reservationIds: string[]; backorderIds: string[]; shipmentIds: string[] }> {
    let releasedUnits = 0;
    const reservationIds: string[] = [];
    const backorderIds: string[] = [];
    const shipmentIds: string[] = [];
    const now = tx.now();

    for (const r of state.reservations) {
      if (r.status !== "RESERVED") continue;
      const level = await tx.getStockLevel(r.warehouseId, r.variantId);
      if (level) {
        level.reserved = Math.max(0, level.reserved - r.quantity);
        await tx.saveStockLevel(level);
      }
      r.status = "CANCELLED";
      await tx.saveReservation(r);
      releasedUnits += r.quantity;
      reservationIds.push(r.id);
    }
    for (const b of state.backorders) {
      if (b.status !== "OPEN") continue;
      b.status = "CANCELLED";
      b.updatedAt = now;
      await tx.saveBackorder(b);
      backorderIds.push(b.id);
    }
    for (const s of state.shipments) {
      if (s.status !== "PLANNED") continue;
      s.status = "CANCELLED";
      await tx.saveShipment(s);
      shipmentIds.push(s.id);
    }
    return { releasedUnits, reservationIds, backorderIds, shipmentIds };
  }

  private async toStockItems(store: InventoryStore, levels: StockLevel[]): Promise<StockListItem[]> {
    const warehouses = new Map((await store.listWarehouses()).map((w) => [w.id, w]));
    const items: StockListItem[] = [];
    for (const l of levels) {
      const variant = await store.getVariant(l.variantId);
      const product = variant ? await store.getProduct(variant.productId) : null;
      const avail = available(l);
      items.push({
        warehouseId: l.warehouseId,
        warehouseName: warehouses.get(l.warehouseId)?.name ?? l.warehouseId,
        variantId: l.variantId,
        productName: product?.name ?? l.variantId,
        variantLabel: variant?.label ?? "",
        sku: variant?.sku ?? "",
        onHand: l.onHand,
        reserved: l.reserved,
        available: avail,
        reorderThreshold: l.reorderThreshold,
        belowThreshold: avail < l.reorderThreshold,
      });
    }
    return items;
  }
}

// ---------------------------------------------------------------------------
// Singleton bound to the HMR-safe repository singleton.
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__dealflow_fulfillment_service__" as const;
type GlobalWithService = typeof globalThis & { [GLOBAL_KEY]?: FulfillmentService };

export function getFulfillmentService(): FulfillmentService {
  const g = globalThis as GlobalWithService;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new FulfillmentService(getInventoryRepository());
  return g[GLOBAL_KEY];
}
