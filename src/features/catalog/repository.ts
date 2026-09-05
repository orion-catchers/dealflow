/**
 * Catalog repository — interface + in-memory DEV FIXTURE implementation.
 *
 * The in-memory store is seeded from `@/fixtures/harsh-dev` (deep-cloned so fixtures stay
 * immutable). A Prisma adapter implementing `CatalogRepository` replaces it later; the
 * service only talks to the interface. Singleton lives on `globalThis` so it survives
 * Next dev HMR; `reset()` restores fixture state for tests.
 */
import type { Customer, PlanRef, PriceList, PriceRule, Product, SalesTeam, TaxRate, Variant } from "@/contracts/harsh";
import * as fixtures from "@/fixtures/harsh-dev";

export interface CatalogRepository {
  // customers / teams
  listCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  insertCustomer(c: Customer): Promise<Customer>;
  updateCustomer(c: Customer): Promise<Customer>;
  listSalesTeams(): Promise<SalesTeam[]>;

  // taxes / plans
  listTaxRates(): Promise<TaxRate[]>;
  insertTaxRate(t: TaxRate): Promise<TaxRate>;
  listPlans(): Promise<PlanRef[]>;

  // products / variants
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  insertProduct(p: Product): Promise<Product>;
  updateProduct(p: Product): Promise<Product>;
  listVariants(productId?: string): Promise<Variant[]>;
  getVariant(id: string): Promise<Variant | undefined>;
  insertVariant(v: Variant): Promise<Variant>;
  updateVariant(v: Variant): Promise<Variant>;

  // price lists / rules
  listPriceLists(): Promise<PriceList[]>;
  getPriceList(id: string): Promise<PriceList | undefined>;
  insertPriceList(pl: PriceList): Promise<PriceList>;
  updatePriceList(pl: PriceList): Promise<PriceList>;
  listPriceRules(priceListId?: string): Promise<PriceRule[]>;
  getPriceRule(id: string): Promise<PriceRule | undefined>;
  insertPriceRule(r: PriceRule): Promise<PriceRule>;
  updatePriceRule(r: PriceRule): Promise<PriceRule>;
  deletePriceRule(id: string): Promise<boolean>;

  /** Restore seed state (tests / dev reset). */
  reset(): Promise<void>;
}

const clone = <T>(v: T): T => structuredClone(v);

function replaceById<T extends { id: string }>(list: T[], item: T): T {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) throw new Error(`Record ${item.id} not found`);
  list[i] = clone(item);
  return clone(item);
}

/** DEV FIXTURE: in-memory repository seeded from Harsh's fixtures. */
export class InMemoryCatalogRepository implements CatalogRepository {
  private customers: Customer[] = [];
  private salesTeams: SalesTeam[] = [];
  private taxRates: TaxRate[] = [];
  private plans: PlanRef[] = [];
  private products: Product[] = [];
  private variants: Variant[] = [];
  private priceLists: PriceList[] = [];
  private priceRules: PriceRule[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    this.customers = clone(fixtures.customers);
    this.salesTeams = clone(fixtures.salesTeams);
    this.taxRates = clone(fixtures.taxRates);
    this.plans = clone(fixtures.planRefs);
    this.products = clone(fixtures.products);
    this.variants = clone(fixtures.variants);
    this.priceLists = clone(fixtures.priceLists);
    this.priceRules = clone(fixtures.priceRules);
  }

  async reset() {
    this.seed();
  }

  // customers / teams
  async listCustomers() {
    return clone(this.customers);
  }
  async getCustomer(id: string) {
    const c = this.customers.find((x) => x.id === id);
    return c ? clone(c) : undefined;
  }
  async insertCustomer(c: Customer) {
    this.customers.push(clone(c));
    return clone(c);
  }
  async updateCustomer(c: Customer) {
    return replaceById(this.customers, c);
  }
  async listSalesTeams() {
    return clone(this.salesTeams);
  }

  // taxes / plans
  async listTaxRates() {
    return clone(this.taxRates);
  }
  async insertTaxRate(t: TaxRate) {
    this.taxRates.push(clone(t));
    return clone(t);
  }
  async listPlans() {
    return clone(this.plans);
  }

  // products / variants
  async listProducts() {
    return clone(this.products);
  }
  async getProduct(id: string) {
    const p = this.products.find((x) => x.id === id);
    return p ? clone(p) : undefined;
  }
  async insertProduct(p: Product) {
    this.products.push(clone(p));
    return clone(p);
  }
  async updateProduct(p: Product) {
    return replaceById(this.products, p);
  }
  async listVariants(productId?: string) {
    return clone(productId ? this.variants.filter((v) => v.productId === productId) : this.variants);
  }
  async getVariant(id: string) {
    const v = this.variants.find((x) => x.id === id);
    return v ? clone(v) : undefined;
  }
  async insertVariant(v: Variant) {
    this.variants.push(clone(v));
    return clone(v);
  }
  async updateVariant(v: Variant) {
    return replaceById(this.variants, v);
  }

  // price lists / rules
  async listPriceLists() {
    return clone(this.priceLists);
  }
  async getPriceList(id: string) {
    const pl = this.priceLists.find((x) => x.id === id);
    return pl ? clone(pl) : undefined;
  }
  async insertPriceList(pl: PriceList) {
    this.priceLists.push(clone(pl));
    return clone(pl);
  }
  async updatePriceList(pl: PriceList) {
    return replaceById(this.priceLists, pl);
  }
  async listPriceRules(priceListId?: string) {
    return clone(priceListId ? this.priceRules.filter((r) => r.priceListId === priceListId) : this.priceRules);
  }
  async getPriceRule(id: string) {
    const r = this.priceRules.find((x) => x.id === id);
    return r ? clone(r) : undefined;
  }
  async insertPriceRule(r: PriceRule) {
    this.priceRules.push(clone(r));
    return clone(r);
  }
  async updatePriceRule(r: PriceRule) {
    return replaceById(this.priceRules, r);
  }
  async deletePriceRule(id: string) {
    const before = this.priceRules.length;
    this.priceRules = this.priceRules.filter((r) => r.id !== id);
    return this.priceRules.length !== before;
  }
}

const GLOBAL_KEY = "__dealflow_catalogRepository" as const;
type RepoGlobal = typeof globalThis & { [GLOBAL_KEY]?: CatalogRepository };

/** Process-wide repository singleton (cached on globalThis to survive Next dev HMR). */
export function getCatalogRepository(): CatalogRepository {
  const g = globalThis as RepoGlobal;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new InMemoryCatalogRepository();
  return g[GLOBAL_KEY];
}

/** Swap the singleton (e.g. for a Prisma adapter or an isolated test instance). */
export function setCatalogRepository(repo: CatalogRepository | undefined) {
  const g = globalThis as RepoGlobal;
  if (repo) g[GLOBAL_KEY] = repo;
  else delete g[GLOBAL_KEY];
}
