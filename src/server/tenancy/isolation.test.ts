/**
 * Tenant isolation against a real PostgreSQL database (skipped without one).
 *
 * Two fresh workspaces are created through the same path as public sign-up. Company A gets a customer and a product;
 * the test then acts as company B and proves B cannot list, read, change, delete, or reference A's records, through
 * the tenant-scoped client, the catalog service, the workspace loader, and the database triggers.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import { getCatalogService } from "@/server/catalog/live";
import { loginWithPassword } from "@/server/lib/auth/credentials";
import { findUserBySessionToken } from "@/server/lib/auth/session";
import { loadDataState } from "@/server/live/state";
import { runAsSystem, runForCompany, TenantScopeError, withTenantScope } from "@/server/lib/tenant/context";
import { createWorkspace, type CreatedWorkspace } from "./workspace";

async function isDbUp(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbAvailable = await isDbUp();
const run = randomUUID().slice(0, 8);

let a: CreatedWorkspace;
let b: CreatedWorkspace;
let aCustomerId: string;
let aProductId: string;
let aPriceListId: string;

const admin = (w: CreatedWorkspace): Actor => ({ id: w.ownerId, role: "ADMIN", active: true, companyId: w.companyId });
const asA = <T>(fn: () => Promise<T>) => runForCompany(a.companyId, fn);
const asB = <T>(fn: () => Promise<T>) => runForCompany(b.companyId, fn);

beforeAll(async () => {
  if (!dbAvailable) return;
  a = await createWorkspace({ companyName: `Isolation A ${run}`, name: "Owner A", email: `owner-a-${run}@iso.test`, password: "isolation-a-pass" });
  b = await createWorkspace({ companyName: `Isolation B ${run}`, name: "Owner B", email: `owner-b-${run}@iso.test`, password: "isolation-b-pass" });
  await asA(async () => {
    const priceList = await prisma.priceList.findFirstOrThrow();
    aPriceListId = priceList.id;
    const customer = await getCatalogService().createCustomer(admin(a), {
      name: `A Customer ${run}`,
      contactEmail: `buyer-${run}@a.test`,
      tier: "BRONZE",
      currency: "INR",
      assignedRepId: a.ownerId,
    });
    aCustomerId = customer.id;
    const category = await prisma.category.findFirstOrThrow({ where: { code: "HARDWARE" } });
    const product = await prisma.product.create({
      data: {
        sku: `ISO-${run}`,
        name: "A Laptop",
        categoryId: category.id,
        unit: "UNIT",
        taxPct: 18,
        taxRateId: "tax-18",
        companyId: a.companyId,
        basePrice: "1000.00",
        baseCost: "600.00",
        stockTracked: false,
      },
    });
    aProductId = product.id;
  });
});

afterAll(async () => {
  if (!dbAvailable) return;
  // Leave the shared database as we found it: delete both workspaces' rows, children first.
  await runAsSystem(async () => {
    const companyIds = [a?.companyId, b?.companyId].filter(Boolean) as string[];
    const where = { companyId: { in: companyIds } };
    await prisma.auditEvent.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.customerMembership.deleteMany({ where: { customer: where } });
    await prisma.customer.deleteMany({ where });
    await prisma.policyCeiling.deleteMany({ where: { policyVersion: where } });
    await prisma.policyChainStep.deleteMany({ where: { policyVersion: where } });
    await prisma.policyVersion.deleteMany({ where });
    await prisma.priceList.deleteMany({ where });
    await prisma.category.deleteMany({ where });
    await prisma.healthSettings.deleteMany({ where });
    await prisma.session.deleteMany({ where: { user: where } });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
  await prisma.$disconnect();
});

describe.skipIf(!dbAvailable)("tenant isolation", () => {
  it("each workspace starts with its own starter configuration", async () => {
    for (const w of [a, b]) {
      await runForCompany(w.companyId, async () => {
        expect(await prisma.category.count()).toBe(4);
        expect(await prisma.priceList.count()).toBe(1);
        expect(await prisma.policyVersion.count()).toBe(1);
        expect(await prisma.user.count()).toBe(1);
      });
    }
  });

  it("company B cannot list or read company A's records", async () => {
    await asB(async () => {
      expect(await prisma.customer.findMany()).toEqual([]);
      expect(await prisma.customer.findUnique({ where: { id: aCustomerId } })).toBeNull();
      expect(await prisma.product.findUnique({ where: { id: aProductId } })).toBeNull();
      expect(await prisma.priceList.findUnique({ where: { id: aPriceListId } })).toBeNull();
      expect((await prisma.company.findMany()).map((c) => c.id)).toEqual([b.companyId]);
      expect(await prisma.user.findUnique({ where: { id: a.ownerId } })).toBeNull();
    });
  });

  it("company B's services and workspace see none of company A's data", async () => {
    await asB(async () => {
      expect(await getCatalogService().listCustomers(admin(b))).toEqual([]);
      expect(await getCatalogService().getCustomer(admin(b), aCustomerId).catch((e: { code?: string }) => e.code)).toBe("NOT_FOUND");
      const state = await loadDataState();
      expect(state.customers).toEqual([]);
      expect(state.products).toEqual([]);
      expect(state.users.map((u) => u.email)).toEqual([`owner-b-${run}@iso.test`]);
    });
    await asA(async () => {
      const state = await loadDataState();
      expect(state.customers.map((c) => c.id)).toEqual([aCustomerId]);
    });
  });

  it("company B cannot change or delete company A's records", async () => {
    await asB(async () => {
      await expect(prisma.customer.update({ where: { id: aCustomerId }, data: { name: "Hijacked" } })).rejects.toThrow();
      expect((await prisma.customer.updateMany({ data: { name: "Hijacked" } })).count).toBe(0);
      expect((await prisma.product.deleteMany({ where: { id: aProductId } })).count).toBe(0);
    });
    await asA(async () => {
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: aCustomerId } })).name).toBe(`A Customer ${run}`);
    });
  });

  it("company B cannot create rows owned by, or pointing at, company A", async () => {
    await asB(async () => {
      await expect(
        prisma.category.create({ data: { code: `X-${run}`, name: "X", companyId: a.companyId } }),
      ).rejects.toBeInstanceOf(TenantScopeError);
      // B's own customer pointing at A's price list and A's owner is rejected by the database trigger.
      await expect(
        prisma.customer.create({
          data: {
            name: "Cross",
            contactName: "Cross",
            contactEmail: "cross@b.test",
            discountTier: "STANDARD",
            priceListId: aPriceListId,
            assignedRepId: a.ownerId,
            companyId: b.companyId,
          },
        }),
      ).rejects.toThrow(/tenant guard/);
    });
  });

  it("the database refuses cross-company references even for system code", async () => {
    await runAsSystem(async () => {
      const bPriceList = await prisma.priceList.findFirstOrThrow({ where: { companyId: b.companyId } });
      await expect(
        prisma.priceRule.create({
          data: { priceListId: bPriceList.id, productId: aProductId, tier: "STANDARD", currency: "INR", unitPrice: "1.00" },
        }),
      ).rejects.toThrow(/tenant guard/);
    });
  });

  it("refuses company data before sign-in and outside any scope", async () => {
    await withTenantScope(async () => {
      await expect(prisma.customer.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    });
    await expect(prisma.customer.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("a suspended workspace cannot sign in, and its open sessions stop working", async () => {
    await withTenantScope(async () => {
      const { token } = await loginWithPassword({ email: `owner-b-${run}@iso.test`, password: "isolation-b-pass" });
      expect(await findUserBySessionToken(token)).not.toBeNull();
      await runAsSystem(() => prisma.company.update({ where: { id: b.companyId }, data: { active: false } }));
      expect(await findUserBySessionToken(token)).toBeNull();
      await expect(loginWithPassword({ email: `owner-b-${run}@iso.test`, password: "isolation-b-pass" })).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      await runAsSystem(() => prisma.company.update({ where: { id: b.companyId }, data: { active: true } }));
    });
  });

  it("rejects a second workspace for an email that is already registered", async () => {
    await expect(
      createWorkspace({ companyName: "Duplicate", name: "Dup", email: `owner-a-${run}@iso.test`, password: "duplicate-pass" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
