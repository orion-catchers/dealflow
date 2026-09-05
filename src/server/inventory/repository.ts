/**
 * Engine 2 — inventory repository.
 *
 * `InventoryStore` is the narrow, transaction-friendly data surface the service uses.
 * `InventoryRepository` adds `withTransaction`, which hands the callback a store bound to
 * the transaction. A Prisma adapter will implement the same interface with `tx` bound to
 * the Prisma transaction client.
 *
 * DEV FIXTURE: `InMemoryInventoryRepository` is seeded from `@/fixtures/harsh-dev`. It
 * serializes transactions with a promise-chain mutex and snapshots/restores state so a
 * thrown error inside a transaction leaves no partial writes. Never a production fallback.
 */
import type {
  Backorder,
  IsoTimestamp,
  OrderForFulfillment,
  Product,
  Reservation,
  Shipment,
  StockLevel,
  StockReceipt,
  Variant,
  Warehouse,
} from "@/contracts/harsh";
import * as fixtures from "@/fixtures/harsh-dev";

export interface FulfillmentRecord {
  order: OrderForFulfillment;
  cancelled: boolean;
  cancelReason?: string;
  cancelledAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
}

export interface StockLevelFilter {
  warehouseId?: string;
  variantId?: string;
  variantIds?: readonly string[];
}

export interface BackorderFilter {
  orderId?: string;
  variantId?: string;
  status?: Backorder["status"];
}

export interface InventoryStore {
  now(): IsoTimestamp;
  nextId(prefix: string): Promise<string>;

  listWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: string): Promise<Warehouse | null>;
  saveWarehouse(warehouse: Warehouse): Promise<Warehouse>;

  listStockLevels(filter?: StockLevelFilter): Promise<StockLevel[]>;
  getStockLevel(warehouseId: string, variantId: string): Promise<StockLevel | null>;
  saveStockLevel(level: StockLevel): Promise<StockLevel>;

  listFulfillments(): Promise<FulfillmentRecord[]>;
  getFulfillment(orderId: string): Promise<FulfillmentRecord | null>;
  saveFulfillment(record: FulfillmentRecord): Promise<FulfillmentRecord>;

  listReservations(orderId?: string): Promise<Reservation[]>;
  saveReservation(reservation: Reservation): Promise<Reservation>;

  listBackorders(filter?: BackorderFilter): Promise<Backorder[]>;
  saveBackorder(backorder: Backorder): Promise<Backorder>;

  listShipments(orderId?: string): Promise<Shipment[]>;
  getShipment(id: string): Promise<Shipment | null>;
  saveShipment(shipment: Shipment): Promise<Shipment>;

  saveReceipt(receipt: StockReceipt): Promise<StockReceipt>;

  /** Idempotency store: results keyed by `${scope}:${key}`. */
  getRequestResult<T>(scope: string, key: string): Promise<T | null>;
  saveRequestResult<T>(scope: string, key: string, result: T): Promise<void>;

  /** Read-only catalog lookups for list joins (Harsh's catalog feature owns writes). */
  getVariant(id: string): Promise<Variant | null>;
  getProduct(id: string): Promise<Product | null>;
}

export interface InventoryRepository extends InventoryStore {
  /** Run `fn` atomically and serialized against other transactions. */
  withTransaction<T>(fn: (tx: InventoryStore) => Promise<T>): Promise<T>;
  /** Restore fixture state (tests / dev). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// In-memory implementation (DEV FIXTURE)
// ---------------------------------------------------------------------------

interface State {
  warehouses: Map<string, Warehouse>;
  stockLevels: Map<string, StockLevel>;
  fulfillments: Map<string, FulfillmentRecord>;
  reservations: Map<string, Reservation>;
  backorders: Map<string, Backorder>;
  shipments: Map<string, Shipment>;
  receipts: Map<string, StockReceipt>;
  requestResults: Map<string, unknown>;
  counters: Map<string, number>;
}

const clone = <T>(v: T): T => structuredClone(v);
const levelKey = (warehouseId: string, variantId: string) => `${warehouseId}::${variantId}`;

export class InMemoryInventoryRepository implements InventoryRepository {
  private state: State;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly clock: () => IsoTimestamp;

  constructor(opts?: { clock?: () => IsoTimestamp; seed?: boolean }) {
    this.clock = opts?.clock ?? (() => new Date().toISOString());
    this.state = this.seed(opts?.seed ?? true);
  }

  private seed(withFixtures: boolean): State {
    const state: State = {
      warehouses: new Map(),
      stockLevels: new Map(),
      fulfillments: new Map(),
      reservations: new Map(),
      backorders: new Map(),
      shipments: new Map(),
      receipts: new Map(),
      requestResults: new Map(),
      counters: new Map(),
    };
    if (!withFixtures) return state;
    for (const w of fixtures.warehouses) state.warehouses.set(w.id, clone(w));
    for (const s of fixtures.stockLevels) state.stockLevels.set(levelKey(s.warehouseId, s.variantId), clone(s));
    for (const o of fixtures.fulfillmentOrders) {
      state.fulfillments.set(o.orderId, { order: clone(o), cancelled: false, createdAt: o.confirmedAt });
    }
    return state;
  }

  reset(): void {
    this.state = this.seed(true);
  }

  now(): IsoTimestamp {
    return this.clock();
  }

  async nextId(prefix: string): Promise<string> {
    const n = (this.state.counters.get(prefix) ?? 0) + 1;
    this.state.counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, "0")}`;
  }

  withTransaction<T>(fn: (tx: InventoryStore) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const snapshot = clone(this.state);
      try {
        return await fn(this);
      } catch (e) {
        this.state = snapshot; // roll back: no partial writes
        throw e;
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  // -- warehouses
  async listWarehouses(): Promise<Warehouse[]> {
    return [...this.state.warehouses.values()].map(clone).sort((a, b) => a.id.localeCompare(b.id));
  }
  async getWarehouse(id: string): Promise<Warehouse | null> {
    const w = this.state.warehouses.get(id);
    return w ? clone(w) : null;
  }
  async saveWarehouse(warehouse: Warehouse): Promise<Warehouse> {
    this.state.warehouses.set(warehouse.id, clone(warehouse));
    return clone(warehouse);
  }

  // -- stock
  async listStockLevels(filter?: StockLevelFilter): Promise<StockLevel[]> {
    const variantSet = filter?.variantIds ? new Set(filter.variantIds) : null;
    return [...this.state.stockLevels.values()]
      .filter((s) => !filter?.warehouseId || s.warehouseId === filter.warehouseId)
      .filter((s) => !filter?.variantId || s.variantId === filter.variantId)
      .filter((s) => !variantSet || variantSet.has(s.variantId))
      .map(clone)
      .sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || a.variantId.localeCompare(b.variantId));
  }
  async getStockLevel(warehouseId: string, variantId: string): Promise<StockLevel | null> {
    const s = this.state.stockLevels.get(levelKey(warehouseId, variantId));
    return s ? clone(s) : null;
  }
  async saveStockLevel(level: StockLevel): Promise<StockLevel> {
    this.state.stockLevels.set(levelKey(level.warehouseId, level.variantId), clone(level));
    return clone(level);
  }

  // -- fulfillment records
  async listFulfillments(): Promise<FulfillmentRecord[]> {
    return [...this.state.fulfillments.values()].map(clone);
  }
  async getFulfillment(orderId: string): Promise<FulfillmentRecord | null> {
    const r = this.state.fulfillments.get(orderId);
    return r ? clone(r) : null;
  }
  async saveFulfillment(record: FulfillmentRecord): Promise<FulfillmentRecord> {
    this.state.fulfillments.set(record.order.orderId, clone(record));
    return clone(record);
  }

  // -- reservations
  async listReservations(orderId?: string): Promise<Reservation[]> {
    return [...this.state.reservations.values()].filter((r) => !orderId || r.orderId === orderId).map(clone);
  }
  async saveReservation(reservation: Reservation): Promise<Reservation> {
    this.state.reservations.set(reservation.id, clone(reservation));
    return clone(reservation);
  }

  // -- backorders
  async listBackorders(filter?: BackorderFilter): Promise<Backorder[]> {
    return [...this.state.backorders.values()]
      .filter((b) => !filter?.orderId || b.orderId === filter.orderId)
      .filter((b) => !filter?.variantId || b.variantId === filter.variantId)
      .filter((b) => !filter?.status || b.status === filter.status)
      .map(clone);
  }
  async saveBackorder(backorder: Backorder): Promise<Backorder> {
    this.state.backorders.set(backorder.id, clone(backorder));
    return clone(backorder);
  }

  // -- shipments
  async listShipments(orderId?: string): Promise<Shipment[]> {
    return [...this.state.shipments.values()].filter((s) => !orderId || s.orderId === orderId).map(clone);
  }
  async getShipment(id: string): Promise<Shipment | null> {
    const s = this.state.shipments.get(id);
    return s ? clone(s) : null;
  }
  async saveShipment(shipment: Shipment): Promise<Shipment> {
    this.state.shipments.set(shipment.id, clone(shipment));
    return clone(shipment);
  }

  // -- receipts
  async saveReceipt(receipt: StockReceipt): Promise<StockReceipt> {
    this.state.receipts.set(receipt.id, clone(receipt));
    return clone(receipt);
  }

  // -- idempotency
  async getRequestResult<T>(scope: string, key: string): Promise<T | null> {
    const v = this.state.requestResults.get(`${scope}:${key}`);
    return v === undefined ? null : clone(v as T);
  }
  async saveRequestResult<T>(scope: string, key: string, result: T): Promise<void> {
    this.state.requestResults.set(`${scope}:${key}`, clone(result));
  }

  // -- catalog lookups (fixtures)
  async getVariant(id: string): Promise<Variant | null> {
    const v = fixtures.variants.find((x) => x.id === id);
    return v ? clone(v) : null;
  }
  async getProduct(id: string): Promise<Product | null> {
    const p = fixtures.products.find((x) => x.id === id);
    return p ? clone(p) : null;
  }
}

// ---------------------------------------------------------------------------
// Singleton cached on globalThis so Next dev HMR keeps in-memory state.
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__dealflow_inventory_repository__" as const;
type GlobalWithRepo = typeof globalThis & { [GLOBAL_KEY]?: InventoryRepository };

export function getInventoryRepository(): InventoryRepository {
  const g = globalThis as GlobalWithRepo;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new InMemoryInventoryRepository();
  return g[GLOBAL_KEY];
}

/** Swap the singleton (e.g. for a Prisma adapter or an isolated test instance). */
export function setInventoryRepository(repo: InventoryRepository | undefined) {
  const g = globalThis as GlobalWithRepo;
  if (repo) g[GLOBAL_KEY] = repo;
  else delete g[GLOBAL_KEY];
}
