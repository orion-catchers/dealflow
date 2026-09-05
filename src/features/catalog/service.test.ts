import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { InMemoryCatalogRepository, getCatalogRepository, setCatalogRepository } from "./repository";
import { CatalogService, getCatalogService } from "./service";

const admin: Actor = { id: "admin-dev", role: "ADMIN", active: true };
const manager: Actor = { id: "manager-sana", role: "SALES_MANAGER", active: true };
const rep: Actor = { id: "rep-arjun", role: "SALES_REP", active: true };
const finance: Actor = { id: "finance-farah", role: "FINANCE", active: true };
const neha: Actor = { id: "customer-neha", role: "CUSTOMER", customerId: "customer-acme", active: true };

async function expectFailure(p: Promise<unknown>, code: ApiFailure["code"]) {
  await expect(p).rejects.toBeInstanceOf(ApiFailure);
  await expect(p).rejects.toMatchObject({ code });
}

let repo: InMemoryCatalogRepository;
let svc: CatalogService;

beforeEach(async () => {
  repo = new InMemoryCatalogRepository();
  svc = new CatalogService(repo);
});

describe("repository singleton", () => {
  it("caches on globalThis and can be reset", async () => {
    setCatalogRepository(undefined);
    const a = getCatalogRepository();
    const b = getCatalogRepository();
    expect(a).toBe(b);
    const beforeCount = (await a.listProducts()).length;
    await getCatalogService().archiveProduct(admin, "prod-mouse");
    expect((await a.listProducts()).find((p) => p.id === "prod-mouse")?.archivedAt).toBeTruthy();
    await a.reset();
    expect((await a.listProducts()).find((p) => p.id === "prod-mouse")?.archivedAt).toBeUndefined();
    expect((await a.listProducts()).length).toBe(beforeCount);
    setCatalogRepository(undefined);
  });
});

describe("products — archive / restore", () => {
  it("archive sets active=false + archivedAt and hides from list unless includeArchived", async () => {
    const archived = await svc.archiveProduct(admin, "prod-mouse");
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).toBeTruthy();

    const visible = await svc.listProducts(rep);
    expect(visible.map((p) => p.id)).not.toContain("prod-mouse");
    const all = await svc.listProducts(rep, { includeArchived: true });
    expect(all.map((p) => p.id)).toContain("prod-mouse");
    // Record still exists — never hard-deleted.
    expect((await repo.getProduct("prod-mouse"))?.archivedAt).toBeTruthy();

    // Archived products cannot be priced.
    await expectFailure(svc.resolve(rep, { customerId: "customer-acme", productId: "prod-mouse" }), "INVALID_INPUT");
  });

  it("restore clears archivedAt and reactivates", async () => {
    await svc.archiveProduct(admin, "prod-mouse");
    const restored = await svc.restoreProduct(admin, "prod-mouse");
    expect(restored.active).toBe(true);
    expect(restored.archivedAt).toBeUndefined();
    expect((await svc.listProducts(rep)).map((p) => p.id)).toContain("prod-mouse");
  });

  it("DELETE-as-archive is idempotent and unknown ids are NOT_FOUND", async () => {
    const first = await svc.archiveProduct(admin, "prod-dock");
    const second = await svc.archiveProduct(admin, "prod-dock");
    expect(second.archivedAt).toBe(first.archivedAt);
    await expectFailure(svc.archiveProduct(admin, "prod-nope"), "NOT_FOUND");
  });
});

describe("products — create / update / validation", () => {
  const body = {
    name: "Nexa Monitor 27",
    category: "HARDWARE",
    unit: "UNIT",
    description: "27-inch 4K monitor",
    basePrice: "18000.00",
    baseCost: "12000.00",
    taxRateId: "tax-gst-18",
    stockTracked: true,
    shippingWeightKg: 5.4,
  };

  it("ADMIN creates a product with generated id and timestamps", async () => {
    const p = await svc.createProduct(admin, body);
    expect(p.id).toMatch(/^prod-nexa-monitor-27-[a-f0-9]{6}$/);
    expect(p.active).toBe(true);
    expect(p.isSubscription).toBe(false);
    expect(p.createdAt).toBe(p.updatedAt);
    expect((await svc.getProduct(finance, p.id)).product.name).toBe("Nexa Monitor 27");
  });

  it("SALES_REP / SALES_MANAGER cannot create products (FORBIDDEN)", async () => {
    await expectFailure(svc.createProduct(rep, body), "FORBIDDEN");
    await expectFailure(svc.createProduct(manager, body), "FORBIDDEN");
  });

  it("rejects bad money, unknown tax rate, and subscription without plan", async () => {
    await expectFailure(svc.createProduct(admin, { ...body, basePrice: "18,000" }), "INVALID_INPUT");
    await expectFailure(svc.createProduct(admin, { ...body, taxRateId: "tax-nope" }), "INVALID_INPUT");
    await expectFailure(svc.createProduct(admin, { ...body, isSubscription: true }), "INVALID_INPUT");
    await expectFailure(svc.createProduct(admin, { ...body, planId: "plan-support-monthly" }), "INVALID_INPUT");
    const sub = await svc.createProduct(admin, { ...body, isSubscription: true, planId: "plan-support-yearly", stockTracked: false });
    expect(sub.planId).toBe("plan-support-yearly");
  });

  it("PATCH merges fields and bumps updatedAt; null clears optional fields", async () => {
    const before = (await repo.getProduct("prod-laptop"))!;
    const after = await svc.updateProduct(admin, "prod-laptop", { basePrice: "51000.00", shippingWeightKg: null });
    expect(after.basePrice).toBe("51000.00");
    expect(after.shippingWeightKg).toBeUndefined();
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    const r = await svc.resolve(rep, { customerId: "customer-acme", productId: "prod-laptop" });
    expect(r.unitPrice).toBe("51000.00");
  });
});

describe("variants", () => {
  it("create / update / deactivate with SKU uniqueness", async () => {
    const v = await svc.createVariant(admin, "prod-mouse", { label: "Red", attributes: [{ name: "Color", value: "Red" }], sku: "NMOUSE-RED", extraPrice: "150.00" });
    expect(v.id).toMatch(/^var-/);
    expect(v.extraCost).toBe("0.00");
    expect((await svc.listVariants(rep, "prod-mouse")).map((x) => x.sku)).toContain("NMOUSE-RED");

    await expectFailure(svc.createVariant(admin, "prod-dock", { label: "Dup", sku: "NMOUSE-RED" }), "CONFLICT");
    await expectFailure(svc.createVariant(rep, "prod-mouse", { label: "Blue", sku: "NMOUSE-BLU" }), "FORBIDDEN");
    await expectFailure(svc.updateVariant(admin, "prod-dock", v.id, { label: "x" }), "NOT_FOUND");

    const updated = await svc.updateVariant(admin, "prod-mouse", v.id, { extraPrice: "200.00" });
    expect(updated.extraPrice).toBe("200.00");
    const r = await svc.resolve(rep, { customerId: "customer-acme", productId: "prod-mouse", variantId: v.id });
    expect(r.unitPrice).toBe("1400.00");

    const off = await svc.deactivateVariant(admin, "prod-mouse", v.id);
    expect(off.active).toBe(false);
    await expectFailure(svc.resolve(rep, { customerId: "customer-acme", productId: "prod-mouse", variantId: v.id }), "INVALID_INPUT");
  });
});

describe("price lists and rules", () => {
  it("ADMIN creates a list, upserts rules, and pricing reflects them; rules can be deleted", async () => {
    const pl = await svc.createPriceList(admin, { name: "INR — Partner", currency: "INR", tier: null });
    expect(pl.id).toMatch(/^pl-inr-partner-/);
    expect(pl.tier).toBeNull();

    const rule = await svc.upsertPriceRule(admin, pl.id, { productId: "prod-laptop", discountPct: 15 });
    expect(rule.id).toMatch(/^pr-/);
    await expectFailure(svc.upsertPriceRule(admin, pl.id, { productId: "prod-laptop", discountPct: 5 }), "CONFLICT");
    await expectFailure(svc.upsertPriceRule(admin, pl.id, { productId: "prod-laptop", fixedPrice: "1.00", discountPct: 5 }), "INVALID_INPUT");
    await expectFailure(svc.upsertPriceRule(admin, pl.id, { productId: "prod-laptop", variantId: "var-mouse-white" }), "NOT_FOUND");

    // Assign the list to a customer via override.
    await svc.updateCustomer(manager, "customer-gamma", { priceListId: pl.id });
    const r = await svc.resolve(rep, { customerId: "customer-gamma", productId: "prod-laptop" });
    expect(r.unitPrice).toBe("42500.00");
    expect(r.priceSource).toEqual({ priceListId: pl.id, ruleId: rule.id, basis: "DISCOUNT" });

    const replaced = await svc.upsertPriceRule(admin, pl.id, { id: rule.id, productId: "prod-laptop", fixedPrice: "41000.00" });
    expect(replaced.id).toBe(rule.id);
    expect((await svc.resolve(rep, { customerId: "customer-gamma", productId: "prod-laptop" })).unitPrice).toBe("41000.00");

    expect(await svc.deletePriceRule(admin, pl.id, rule.id)).toEqual({ deleted: true, ruleId: rule.id });
    expect(await svc.listPriceRules(rep, pl.id)).toEqual([]);
    await expectFailure(svc.deletePriceRule(admin, pl.id, rule.id), "NOT_FOUND");

    // Deactivating the list falls back to the tier default (Bronze: 54000 fixed).
    await svc.updatePriceList(admin, pl.id, { active: false });
    expect((await svc.resolve(rep, { customerId: "customer-gamma", productId: "prod-laptop" })).unitPrice).toBe("54000.00");
  });

  it("non-admins cannot mutate price lists", async () => {
    await expectFailure(svc.createPriceList(manager, { name: "x", currency: "INR" }), "FORBIDDEN");
    await expectFailure(svc.upsertPriceRule(rep, "pl-inr-gold", { productId: "prod-laptop", discountPct: 1 }), "FORBIDDEN");
    await expectFailure(svc.deletePriceRule(finance, "pl-inr-gold", "pr-gold-setup"), "FORBIDDEN");
    expect((await svc.getPriceList(rep, "pl-inr-gold")).rules.map((r) => r.id)).toEqual(["pr-gold-setup"]);
  });
});

describe("customers, teams, tax rates, plans", () => {
  it("ADMIN/SALES_MANAGER create and update customers; reps only read", async () => {
    const c = await svc.createCustomer(manager, { name: "Delta Corp", tier: "SILVER", currency: "INR", contactEmail: "ops@delta.example" });
    expect(c.id).toMatch(/^cust-delta-corp-/);
    expect(c.active).toBe(true);
    await expectFailure(svc.createCustomer(rep, { name: "Nope", tier: "GOLD", currency: "INR" }), "FORBIDDEN");
    await expectFailure(svc.createCustomer(admin, { name: "Bad", tier: "PLATINUM", currency: "INR" }), "INVALID_INPUT");
    await expectFailure(svc.createCustomer(admin, { name: "Bad", tier: "GOLD", currency: "INR", priceListId: "pl-nope" }), "NOT_FOUND");

    const updated = await svc.updateCustomer(admin, c.id, { tier: "GOLD", contactEmail: null });
    expect(updated.tier).toBe("GOLD");
    expect(updated.contactEmail).toBeUndefined();
    expect((await svc.listCustomers(rep)).map((x) => x.id)).toContain(c.id);
    await expectFailure(svc.getCustomer(rep, "customer-nope"), "NOT_FOUND");
  });

  it("CUSTOMER role reads only its own record", async () => {
    expect((await svc.getCustomer(neha, "customer-acme")).name).toBe("Acme Studio");
    await expectFailure(svc.getCustomer(neha, "customer-beta"), "FORBIDDEN");
    expect((await svc.listCustomers(neha)).map((c) => c.id)).toEqual(["customer-acme"]);
    await expectFailure(svc.updateCustomer(neha, "customer-acme", { name: "Hacked" }), "FORBIDDEN");
    await expectFailure(svc.listProducts(neha), "FORBIDDEN");
  });

  it("sales teams, tax rates and plan fixtures", async () => {
    expect((await svc.listSalesTeams(rep)).map((t) => t.id)).toEqual(["team-north", "team-smb"]);
    expect((await svc.listPlans(rep)).map((p) => p.id)).toContain("plan-support-monthly");
    const tax = await svc.createTaxRate(admin, { name: "GST 5%", ratePct: 5 });
    expect(tax.id).toMatch(/^tax-gst-5-/);
    expect((await svc.listTaxRates(finance)).map((t) => t.id)).toContain(tax.id);
    await expectFailure(svc.createTaxRate(manager, { name: "x", ratePct: 1 }), "FORBIDDEN");
    await expectFailure(svc.createTaxRate(admin, { name: "x", ratePct: 101 }), "INVALID_INPUT");
  });
});

describe("catalog boundary — resolve / search", () => {
  it("internal roles resolve for any customer; CUSTOMER only for its own customerId", async () => {
    const r = await svc.resolve(rep, { customerId: "customer-beta", productId: "prod-laptop" });
    expect(r.unitPrice).toBe("52000.00");

    const own = await svc.resolve(neha, { customerId: "customer-acme", productId: "prod-laptop", variantId: "var-laptop-32-1tb" });
    expect(own.unitPrice).toBe("58000.00");

    await expectFailure(svc.resolve(neha, { customerId: "customer-beta", productId: "prod-laptop" }), "FORBIDDEN");
    await expectFailure(svc.search(neha, { customerId: "customer-beta" }), "FORBIDDEN");
    await expectFailure(svc.resolve(rep, { customerId: "customer-nope", productId: "prod-laptop" }), "NOT_FOUND");
    await expectFailure(svc.resolve(rep, { customerId: "customer-acme", productId: "prod-nope" }), "NOT_FOUND");
    await expectFailure(svc.resolve(rep, { customerId: "customer-acme", productId: "prod-laptop", variantId: "var-nope" }), "NOT_FOUND");
    await expectFailure(svc.resolve(rep, { customerId: "customer-acme" }), "INVALID_INPUT");
  });

  it("search filters and prices; customers never see inactive products", async () => {
    await svc.updateProduct(admin, "prod-mouse", { active: false });
    const repItems = await svc.search(rep, { customerId: "customer-acme", includeInactive: true });
    expect(repItems.map((i) => i.product.id)).toContain("prod-mouse");
    const custItems = await svc.search(neha, { customerId: "customer-acme", includeInactive: true });
    expect(custItems.map((i) => i.product.id)).not.toContain("prod-mouse");

    const hw = await svc.search(rep, { customerId: "customer-beta", category: "HARDWARE" });
    expect(hw).toHaveLength(1);
    expect(hw[0].resolved.unitPrice).toBe("52000.00");
    expect(hw[0].variants).toHaveLength(2);
  });
});

describe("dashboardSummary", () => {
  it("counts fixture catalog and reacts to archive", async () => {
    const s = await svc.dashboardSummary(rep);
    expect(s).toEqual({
      productCount: 6,
      activeProductCount: 6,
      variantCount: 5,
      priceListCount: 3,
      priceRuleCount: 5,
      subscriptionProductCount: 2,
      byCategory: [
        { category: "HARDWARE", count: 1 },
        { category: "ACCESSORIES", count: 2 },
        { category: "SERVICES", count: 2 },
        { category: "SUBSCRIPTIONS", count: 1 },
      ],
    });

    await svc.archiveProduct(admin, "prod-backup");
    const after = await svc.dashboardSummary(admin);
    expect(after.productCount).toBe(6);
    expect(after.activeProductCount).toBe(5);
    expect(after.subscriptionProductCount).toBe(1);
    expect(after.byCategory.find((c) => c.category === "SUBSCRIPTIONS")).toBeUndefined();
    await expectFailure(svc.dashboardSummary(neha), "FORBIDDEN");
  });
});
