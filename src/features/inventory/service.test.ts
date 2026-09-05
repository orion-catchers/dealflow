import { beforeEach, describe, expect, it } from "vitest";
import type { Actor, OrderForFulfillment } from "@/contracts/harsh";
import { orderAcmeFlowA, orderBetaCompeting, orderServiceOnly } from "@/fixtures/harsh-dev";
import { ApiFailure } from "@/lib/api/respond";
import { InMemoryInventoryRepository } from "./repository";
import { FulfillmentService } from "./service";

const finance: Actor = { id: "finance-farah", role: "FINANCE", active: true };
const admin: Actor = { id: "admin-dev", role: "ADMIN", active: true };
const rep: Actor = { id: "rep-arjun", role: "SALES_REP", active: true };
const customer: Actor = { id: "customer-neha", role: "CUSTOMER", customerId: "customer-acme", active: true };

const ACME = orderAcmeFlowA.orderId;
const BETA = orderBetaCompeting.orderId;
const LAPTOP = "var-laptop-16-512";

let repo: InMemoryInventoryRepository;
let svc: FulfillmentService;

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected ApiFailure");
}

async function stock(warehouseId: string, variantId: string) {
  const s = await repo.getStockLevel(warehouseId, variantId);
  if (!s) throw new Error("missing stock level");
  return s;
}

/** For every stock level: reserved ≤ onHand and reserved == sum of RESERVED reservations. */
async function assertNoOversell() {
  const levels = await repo.listStockLevels();
  const reservations = await repo.listReservations();
  for (const l of levels) {
    expect(l.reserved).toBeLessThanOrEqual(l.onHand);
    const sum = reservations
      .filter((r) => r.status === "RESERVED" && r.warehouseId === l.warehouseId && r.variantId === l.variantId)
      .reduce((a, r) => a + r.quantity, 0);
    expect(l.reserved).toBe(sum);
  }
}

/** Per-line invariant: reserved + shipped + delivered + backordered + unallocated == quantity. */
async function assertLineInvariant(orderId: string) {
  const d = await svc.getDetail(admin, orderId);
  for (const l of d.lines.filter((x) => x.stockTracked)) {
    expect(l.reserved + l.shipped + l.delivered + l.backordered + l.unallocated).toBe(l.quantity);
  }
  return d;
}

beforeEach(() => {
  repo = new InMemoryInventoryRepository();
  svc = new FulfillmentService(repo);
});

describe("roles", () => {
  it("customers cannot read; reps cannot mutate", async () => {
    expect((await failure(svc.listFulfillment(customer))).code).toBe("FORBIDDEN");
    expect((await failure(svc.accept({ orderId: BETA, requestKey: "k", actor: rep }))).code).toBe("FORBIDDEN");
    expect((await failure(svc.createWarehouse(finance, { name: "X", code: "X", shippingCostPerShipment: "1.00" }))).code).toBe("FORBIDDEN");
    await expect(svc.listFulfillment(rep)).resolves.toHaveLength(3);
  });
});

describe("initialize / list / detail", () => {
  it("initializeFulfillment is idempotent per orderId and records PENDING", async () => {
    const order: OrderForFulfillment = { ...structuredClone(orderBetaCompeting), orderId: "order-new-1" };
    expect(await svc.initializeFulfillment({ order })).toEqual({ orderId: "order-new-1", status: "PENDING", created: true });
    expect(await svc.initializeFulfillment({ order })).toEqual({ orderId: "order-new-1", status: "PENDING", created: false });
    const list = await svc.listFulfillment(admin);
    expect(list.find((x) => x.orderId === "order-new-1")?.status).toBe("PENDING");
  });

  it("service-only order: preview NO_STOCK_TRACKED_LINES, stockTrackedUnits 0, accept → 422", async () => {
    const p = await svc.preview(admin, orderServiceOnly.orderId);
    expect(p.strategy).toBe("NO_STOCK_TRACKED_LINES");
    const list = await svc.listFulfillment(admin);
    const row = list.find((x) => x.orderId === orderServiceOnly.orderId)!;
    expect(row.stockTrackedUnits).toBe(0);
    expect(row.status).toBe("DELIVERED");
    const err = await failure(svc.accept({ orderId: orderServiceOnly.orderId, requestKey: "k", actor: finance }));
    expect(err.code).toBe("INVALID_INPUT");
    expect((err.details as { code: string }).code).toBe("NO_STOCK_TRACKED_LINES");
  });

  it("unknown order → NOT_FOUND", async () => {
    expect((await failure(svc.getDetail(admin, "nope"))).code).toBe("NOT_FOUND");
  });
});

describe("preview", () => {
  it("writes nothing: stock and records unchanged after preview", async () => {
    const before = await repo.listStockLevels();
    await svc.preview(admin, ACME);
    await svc.getDetail(admin, ACME);
    expect(await repo.listStockLevels()).toEqual(before);
    expect(await repo.listReservations()).toEqual([]);
    expect(await repo.listBackorders()).toEqual([]);
  });
});

describe("accept", () => {
  it("one warehouse: Beta 4 laptops → Main only, ALLOCATED, one PLANNED shipment", async () => {
    const r = await svc.accept({ orderId: BETA, requestKey: "beta-1", actor: finance });
    expect(r.status).toBe("ALLOCATED");
    expect(r.reservations).toHaveLength(1);
    expect(r.reservations[0]).toMatchObject({ warehouseId: "warehouse-main", quantity: 4, status: "RESERVED" });
    expect(r.shipments).toHaveLength(1);
    expect(r.shipments[0]).toMatchObject({ warehouseId: "warehouse-main", status: "PLANNED", estimatedCost: "976.00" });
    expect(r.backorders).toEqual([]);
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(4);
    await assertLineInvariant(BETA);
  });

  it("two warehouses: Acme → Main 6 + East 3 + 1 backorder, docks from Main, PARTIAL", async () => {
    const r = await svc.accept({ orderId: ACME, requestKey: "acme-1", actor: finance });
    expect(r.status).toBe("PARTIAL");
    expect(r.shipments.map((s) => [s.warehouseId, s.status])).toEqual([
      ["warehouse-east", "PLANNED"],
      ["warehouse-main", "PLANNED"],
    ]);
    expect(r.backorders).toHaveLength(1);
    expect(r.backorders[0]).toMatchObject({ orderLineId: "ol-1001-1", remainingQuantity: 1, status: "OPEN" });
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(6);
    expect((await stock("warehouse-east", LAPTOP)).reserved).toBe(3);
    expect((await stock("warehouse-main", "var-dock-std")).reserved).toBe(10);
    const d = await assertLineInvariant(ACME);
    expect(d.lines.find((l) => l.orderLineId === "ol-1001-1")).toMatchObject({ reserved: 9, backordered: 1, unallocated: 0 });
    expect(d.lines.find((l) => l.orderLineId === "ol-1001-3")).toMatchObject({ stockTracked: false, reserved: 0 });
    await assertNoOversell();
  });

  it("repeated Accept with the same key returns the same result and does not double-reserve", async () => {
    const a = await svc.accept({ orderId: BETA, requestKey: "same", actor: finance });
    const b = await svc.accept({ orderId: BETA, requestKey: "same", actor: finance });
    expect(b.replayed).toBe(true);
    expect({ ...b, replayed: false }).toEqual(a);
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(4);
    expect(await repo.listReservations(BETA)).toHaveLength(1);
  });

  it("Accept with a different key when already allocated → 409", async () => {
    await svc.accept({ orderId: BETA, requestKey: "k1", actor: finance });
    const err = await failure(svc.accept({ orderId: BETA, requestKey: "k2", actor: finance }));
    expect(err.code).toBe("CONFLICT");
  });

  it("shortage on recheck → 409 with details and no partial write", async () => {
    await svc.accept({ orderId: ACME, requestKey: "acme", actor: finance }); // consumes all laptops
    const before = await repo.listStockLevels();
    const err = await failure(
      svc.accept({
        orderId: BETA,
        requestKey: "beta-explicit",
        actor: finance,
        plan: { allocations: [{ orderLineId: "ol-1002-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 4 }], backorders: [] },
      }),
    );
    expect(err.code).toBe("CONFLICT");
    expect(err.details).toMatchObject({ errors: [{ code: "INSUFFICIENT_STOCK", details: { available: 0, requested: 4 } }] });
    expect(await repo.listStockLevels()).toEqual(before);
    expect(await repo.listReservations(BETA)).toEqual([]);
    expect(await repo.listShipments(BETA)).toEqual([]);
  });

  it("plan that does not cover the order exactly → 422", async () => {
    const err = await failure(
      svc.accept({
        orderId: BETA,
        requestKey: "k",
        actor: finance,
        plan: { allocations: [{ orderLineId: "ol-1002-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 2 }], backorders: [] },
      }),
    );
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("repeated product lines: two lines of the same variant aggregate but keep both orderLineIds", async () => {
    const order: OrderForFulfillment = {
      ...structuredClone(orderBetaCompeting),
      orderId: "order-dup",
      lines: [
        { ...structuredClone(orderBetaCompeting.lines[0]), orderLineId: "l-a", quantity: 4 },
        { ...structuredClone(orderBetaCompeting.lines[0]), orderLineId: "l-b", quantity: 4 },
      ],
    };
    await svc.initializeFulfillment({ order });
    const r = await svc.accept({ orderId: "order-dup", requestKey: "dup", actor: finance });
    expect(r.reservations.map((x) => [x.orderLineId, x.warehouseId, x.quantity])).toEqual([
      ["l-b", "warehouse-east", 2],
      ["l-a", "warehouse-main", 4],
      ["l-b", "warehouse-main", 2],
    ]);
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(6);
    expect((await stock("warehouse-east", LAPTOP)).reserved).toBe(2);
    await assertLineInvariant("order-dup");
  });

  it("concurrent orders: Promise.all accept on Acme + Beta never oversells", async () => {
    const results = await Promise.all([
      svc.accept({ orderId: ACME, requestKey: "c-acme", actor: finance }),
      svc.accept({ orderId: BETA, requestKey: "c-beta", actor: finance }),
    ]);
    await assertNoOversell();
    const totalReserved = results.flatMap((r) => r.reservations).filter((r) => r.variantId === LAPTOP).reduce((a, r) => a + r.quantity, 0);
    const totalBackordered = results.flatMap((r) => r.backorders).reduce((a, b) => a + b.remainingQuantity, 0);
    expect(totalReserved).toBe(9); // all 9 laptops on hand
    expect(totalBackordered).toBe(5); // 14 demanded − 9 available
    await assertLineInvariant(ACME);
    await assertLineInvariant(BETA);
  });

  it("concurrent explicit plans for the same stock: exactly one wins, the other gets 409", async () => {
    const plan = { allocations: [{ orderLineId: "ol-1002-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 4 }], backorders: [] };
    const order: OrderForFulfillment = { ...structuredClone(orderBetaCompeting), orderId: "order-beta-2", lines: [{ ...orderBetaCompeting.lines[0] }] };
    await svc.initializeFulfillment({ order });
    const settled = await Promise.allSettled([
      svc.accept({ orderId: BETA, requestKey: "x1", actor: finance, plan }),
      svc.accept({ orderId: "order-beta-2", requestKey: "x2", actor: finance, plan }),
    ]);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((s) => s.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as ApiFailure).code).toBe("CONFLICT");
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(4);
    await assertNoOversell();
  });
});

describe("override", () => {
  it("release + reassign: Beta from Main to East 3 + 1 backorder; reserved totals correct", async () => {
    await svc.accept({ orderId: BETA, requestKey: "b", actor: finance });
    const r = await svc.override({
      orderId: BETA,
      requestKey: "ov-1",
      actor: finance,
      allocations: [{ orderLineId: "ol-1002-1", variantId: LAPTOP, warehouseId: "warehouse-east", quantity: 3 }],
      backorders: [{ orderLineId: "ol-1002-1", variantId: LAPTOP, quantity: 1 }],
    });
    expect(r.status).toBe("PARTIAL");
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(0);
    expect((await stock("warehouse-east", LAPTOP)).reserved).toBe(3);
    const all = await repo.listReservations(BETA);
    expect(all.filter((x) => x.status === "CANCELLED")).toHaveLength(1);
    expect(all.filter((x) => x.status === "RESERVED")).toHaveLength(1);
    const shipments = await repo.listShipments(BETA);
    expect(shipments.map((s) => s.status).sort()).toEqual(["CANCELLED", "PLANNED"]);
    await assertLineInvariant(BETA);
    await assertNoOversell();
  });

  it("re-using the same warehouse does not double-count own reservations", async () => {
    await svc.accept({ orderId: ACME, requestKey: "a", actor: finance }); // Main laptops fully reserved (6)
    const r = await svc.override({
      orderId: ACME,
      requestKey: "ov",
      actor: finance,
      allocations: [
        { orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 6 },
        { orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-east", quantity: 3 },
        { orderLineId: "ol-1001-2", variantId: "var-dock-std", warehouseId: "warehouse-main", quantity: 10 },
      ],
      backorders: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, quantity: 1 }],
    });
    expect(r.replayed).toBe(false);
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(6);
    await assertNoOversell();
  });

  it("quantities must cover exactly the unshipped remainder → 422; SHIPPED reservations untouched", async () => {
    const acc = await svc.accept({ orderId: ACME, requestKey: "a", actor: finance });
    const east = acc.shipments.find((s) => s.warehouseId === "warehouse-east")!;
    await svc.ship({ orderId: ACME, shipmentId: east.id, requestKey: "ship-east", actor: finance });

    // Wrong total (must be 7 laptops + 10 docks unshipped)
    const err = await failure(
      svc.override({
        orderId: ACME,
        requestKey: "ov-bad",
        actor: finance,
        allocations: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 6 }],
        backorders: [],
      }),
    );
    expect(err.code).toBe("INVALID_INPUT");

    const ok = await svc.override({
      orderId: ACME,
      requestKey: "ov-good",
      actor: finance,
      allocations: [
        { orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 5 },
        { orderLineId: "ol-1001-2", variantId: "var-dock-std", warehouseId: "warehouse-main", quantity: 10 },
      ],
      backorders: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, quantity: 2 }],
    });
    expect(ok.status).toBe("SHIPPED");
    const shipped = (await repo.listReservations(ACME)).filter((r) => r.status === "SHIPPED");
    expect(shipped).toHaveLength(1);
    expect(shipped[0]).toMatchObject({ warehouseId: "warehouse-east", quantity: 3, shipmentId: east.id });
    expect((await repo.getShipment(east.id))?.status).toBe("SHIPPED");
    const d = await assertLineInvariant(ACME);
    expect(d.lines[0]).toMatchObject({ shipped: 3, reserved: 5, backordered: 2 });
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(5);
  });
});

describe("receipt + consolidation", () => {
  it("receive 1 laptop at Main → eligibleBackorders includes Acme's 1 → consolidate → FULFILLED + new PLANNED shipment", async () => {
    const acc = await svc.accept({ orderId: ACME, requestKey: "a", actor: finance });
    const firstShipments = acc.shipments.map((s) => s.id);
    const main = acc.shipments.find((s) => s.warehouseId === "warehouse-main")!;
    await svc.ship({ orderId: ACME, shipmentId: main.id, requestKey: "ship-main", actor: finance });
    const mainAfterShip = await stock("warehouse-main", LAPTOP);
    expect(mainAfterShip).toMatchObject({ onHand: 0, reserved: 0 });

    const rc = await svc.receipt({ warehouseId: "warehouse-main", variantId: LAPTOP, quantity: 1, requestKey: "rcpt-1", actor: finance });
    expect(rc.stock).toMatchObject({ onHand: 1, reserved: 0 });
    expect(rc.eligibleBackorders).toHaveLength(1);
    expect(rc.eligibleBackorders[0]).toMatchObject({ orderId: ACME, customerName: "Acme Studio", coverable: 1 });
    // Receipt does NOT auto-commit.
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(0);
    expect((await svc.getDetail(admin, ACME)).consolidationAvailable).toBe(true);

    // Replay of the receipt is ignored.
    const rc2 = await svc.receipt({ warehouseId: "warehouse-main", variantId: LAPTOP, quantity: 1, requestKey: "rcpt-1", actor: finance });
    expect(rc2.receipt.id).toBe(rc.receipt.id);
    expect((await stock("warehouse-main", LAPTOP)).onHand).toBe(1);

    const con = await svc.consolidate({
      orderId: ACME,
      requestKey: "con-1",
      actor: finance,
      allocations: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 1 }],
    });
    expect(con.backorders[0]).toMatchObject({ status: "FULFILLED", remainingQuantity: 0 });
    expect(con.shipments).toHaveLength(1);
    expect(con.shipments[0].status).toBe("PLANNED");
    expect(firstShipments).not.toContain(con.shipments[0].id);
    expect((await repo.getShipment(main.id))?.status).toBe("SHIPPED"); // first shipment untouched
    expect((await stock("warehouse-main", LAPTOP)).reserved).toBe(1);
    const d = await assertLineInvariant(ACME);
    expect(d.consolidationAvailable).toBe(false);
    expect(d.status).toBe("SHIPPED");
    await assertNoOversell();
  });

  it("consolidate beyond open backorder → 422; without stock → 409", async () => {
    await svc.accept({ orderId: ACME, requestKey: "a", actor: finance });
    const tooMany = await failure(
      svc.consolidate({ orderId: ACME, requestKey: "c1", actor: finance, allocations: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 2 }] }),
    );
    expect(tooMany.code).toBe("INVALID_INPUT");
    const noStock = await failure(
      svc.consolidate({ orderId: ACME, requestKey: "c2", actor: finance, allocations: [{ orderLineId: "ol-1001-1", variantId: LAPTOP, warehouseId: "warehouse-main", quantity: 1 }] }),
    );
    expect(noStock.code).toBe("CONFLICT");
  });
});

describe("ship / deliver", () => {
  it("ship consumes onHand and reserved exactly once (idempotent by key); deliver is separate", async () => {
    const acc = await svc.accept({ orderId: BETA, requestKey: "b", actor: finance });
    const shp = acc.shipments[0];
    const r1 = await svc.ship({ orderId: BETA, shipmentId: shp.id, requestKey: "ship-1", actor: finance });
    expect(r1.status).toBe("SHIPPED");
    expect(r1.shipment.status).toBe("SHIPPED");
    expect(await stock("warehouse-main", LAPTOP)).toMatchObject({ onHand: 2, reserved: 0 });

    const r2 = await svc.ship({ orderId: BETA, shipmentId: shp.id, requestKey: "ship-1", actor: finance });
    expect(r2.replayed).toBe(true);
    expect(await stock("warehouse-main", LAPTOP)).toMatchObject({ onHand: 2, reserved: 0 });

    const again = await failure(svc.ship({ orderId: BETA, shipmentId: shp.id, requestKey: "ship-2", actor: finance }));
    expect(again.code).toBe("CONFLICT");

    const notDelivered = await svc.getDeliveryRead(admin, BETA);
    expect(notDelivered).toMatchObject({ status: "SHIPPED", shippedUnits: 4, deliveredUnits: 0, undeliveredUnits: 4 });

    const dl = await svc.deliver({ orderId: BETA, shipmentId: shp.id, requestKey: "dl-1", actor: finance });
    expect(dl.status).toBe("DELIVERED");
    expect(await svc.getDeliveryRead(admin, BETA)).toMatchObject({ status: "DELIVERED", deliveredUnits: 4, undeliveredUnits: 0 });
    const list = await svc.listFulfillment(admin);
    expect(list.find((x) => x.orderId === BETA)).toMatchObject({ status: "DELIVERED", deliveredUnits: 4, shippedUnits: 0, shipmentCount: 1 });
  });

  it("deliver requires SHIPPED", async () => {
    const acc = await svc.accept({ orderId: BETA, requestKey: "b", actor: finance });
    const err = await failure(svc.deliver({ orderId: BETA, shipmentId: acc.shipments[0].id, requestKey: "d", actor: finance }));
    expect(err.code).toBe("CONFLICT");
  });
});

describe("cancel", () => {
  it("releases reserved stock, cancels RESERVED reservations, OPEN backorders and PLANNED shipments; SHIPPED untouched", async () => {
    const acc = await svc.accept({ orderId: ACME, requestKey: "a", actor: finance });
    const east = acc.shipments.find((s) => s.warehouseId === "warehouse-east")!;
    await svc.ship({ orderId: ACME, shipmentId: east.id, requestKey: "s", actor: finance });

    const r = await svc.cancel({ orderId: ACME, requestKey: "cancel-1", actor: finance, reason: "Customer withdrew" });
    expect(r.status).toBe("CANCELLED");
    expect(r.releasedUnits).toBe(16); // 6 laptops + 10 docks at Main
    expect(r.cancelledBackorderIds).toHaveLength(1);
    expect(r.cancelledShipmentIds).toHaveLength(1);
    expect(await stock("warehouse-main", LAPTOP)).toMatchObject({ onHand: 6, reserved: 0 });
    expect(await stock("warehouse-main", "var-dock-std")).toMatchObject({ onHand: 10, reserved: 0 });
    expect(await stock("warehouse-east", LAPTOP)).toMatchObject({ onHand: 0, reserved: 0 });
    expect((await repo.getShipment(east.id))?.status).toBe("SHIPPED");
    expect((await repo.listReservations(ACME)).filter((x) => x.status === "SHIPPED")).toHaveLength(1);

    const replay = await svc.cancel({ orderId: ACME, requestKey: "cancel-1", actor: finance, reason: "Customer withdrew" });
    expect(replay.replayed).toBe(true);
    const again = await failure(svc.cancel({ orderId: ACME, requestKey: "cancel-2", actor: finance, reason: "x" }));
    expect(again.code).toBe("CONFLICT");
    expect((await failure(svc.accept({ orderId: ACME, requestKey: "after", actor: finance }))).code).toBe("CONFLICT");
    expect((await svc.getDetail(admin, ACME)).preview).toBeNull();
  });
});

describe("warehouses and stock configuration", () => {
  it("create/update warehouse; duplicate code → 409", async () => {
    const w = await svc.createWarehouse(admin, { name: "West Hub", code: "WEST", shippingCostPerShipment: "900.00" });
    expect(w).toMatchObject({ id: "warehouse-west", active: true });
    expect((await failure(svc.createWarehouse(admin, { name: "Dup", code: "west", shippingCostPerShipment: "1.00" }))).code).toBe("CONFLICT");
    const u = await svc.updateWarehouse(admin, w.id, { active: false, shippingCostPerKg: "10.00" });
    expect(u).toMatchObject({ active: false, shippingCostPerKg: "10.00" });
    expect((await failure(svc.updateWarehouse(admin, "nope", { name: "x" }))).code).toBe("NOT_FOUND");
    expect(await svc.listWarehouses(rep)).toHaveLength(3);
  });

  it("stock list joins product/variant and flags belowThreshold; threshold edit; onHand below reserved → 409", async () => {
    const items = await svc.listStock(rep, { warehouseId: "warehouse-main", variantId: LAPTOP });
    expect(items[0]).toMatchObject({ productName: "Nexa ProBook 15", variantLabel: "16GB / 512GB", sku: "NPB15-16-512", available: 6, belowThreshold: false });

    const edited = await svc.upsertStockLevel({ warehouseId: "warehouse-main", variantId: LAPTOP, reorderThreshold: 8, actor: admin });
    expect(edited).toMatchObject({ reorderThreshold: 8, belowThreshold: true });

    await svc.accept({ orderId: BETA, requestKey: "b", actor: finance });
    const err = await failure(svc.upsertStockLevel({ warehouseId: "warehouse-main", variantId: LAPTOP, onHand: 3, actor: admin }));
    expect(err.code).toBe("CONFLICT");

    const created = await svc.upsertStockLevel({ warehouseId: "warehouse-east", variantId: "var-dock-std", onHand: 5, actor: admin });
    expect(created).toMatchObject({ warehouseId: "warehouse-east", onHand: 5, available: 5 });
  });
});
