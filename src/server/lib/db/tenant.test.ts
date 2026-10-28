import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TenantScopeError } from "@/server/lib/tenant/context";
import { DIRECT_TENANT_MODELS, INDIRECT_TENANT_MODELS, SHARED_MODELS, scopeArgs } from "./tenant";

const A = "company-a";
const B = "company-b";

describe("scopeArgs", () => {
  it("adds the company filter to reads without dropping the caller's filter", () => {
    expect(scopeArgs("Quote", "findMany", { where: { stage: "DRAFT" } }, A)).toEqual({
      where: { stage: "DRAFT", AND: [{ companyId: A }] },
    });
    expect(scopeArgs("Quote", "findMany", {}, A)).toEqual({ where: { AND: [{ companyId: A }] } });
  });

  it("keeps the unique key at the top level of findUnique and appends to an existing AND", () => {
    expect(scopeArgs("Invoice", "findUnique", { where: { id: "inv-1", AND: { status: "PAID" } } }, A)).toEqual({
      where: { id: "inv-1", AND: [{ status: "PAID" }, { companyId: A }] },
    });
  });

  it("filters child models through their parent", () => {
    expect(scopeArgs("Payment", "findMany", {}, A).where).toEqual({ AND: [{ invoice: { companyId: A } }] });
    expect(scopeArgs("DealLine", "deleteMany", { where: { revisionId: "r" } }, A).where).toEqual({
      revisionId: "r",
      AND: [{ revision: { quote: { companyId: A } } }],
    });
  });

  it("limits Company reads to the bound company", () => {
    expect(scopeArgs("Company", "findMany", {}, A).where).toEqual({ AND: [{ id: A }] });
  });

  it("leaves shared reference data alone", () => {
    expect(scopeArgs("TaxRate", "findMany", { where: { active: true } }, A)).toEqual({ where: { active: true } });
  });

  it("stamps the company on unchecked creates and connects it on checked creates", () => {
    expect(scopeArgs("Customer", "create", { data: { name: "X", priceListId: "pl" } }, A).data).toEqual({
      name: "X",
      priceListId: "pl",
      companyId: A,
    });
    expect(scopeArgs("Customer", "create", { data: { name: "X", priceList: { connect: { id: "pl" } } } }, A).data).toEqual({
      name: "X",
      priceList: { connect: { id: "pl" } },
      company: { connect: { id: A } },
    });
    expect(scopeArgs("Task", "createMany", { data: [{ flagId: "f" }, { flagId: "g" }] }, A).data).toEqual([
      { flagId: "f", companyId: A },
      { flagId: "g", companyId: A },
    ]);
  });

  it("refuses writes that name another company", () => {
    expect(() => scopeArgs("Quote", "create", { data: { companyId: B } }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Quote", "create", { data: { company: { connect: { id: B } } } }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Quote", "update", { where: { id: "q" }, data: { companyId: B } }, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Quote", "upsert", { where: { id: "q" }, create: {}, update: { companyId: B } }, A)).toThrow(
      TenantScopeError,
    );
  });

  it("scopes both halves of an upsert", () => {
    expect(scopeArgs("HealthSettings", "upsert", { where: { companyId: A }, create: {}, update: {} }, A)).toEqual({
      where: { companyId: A, AND: [{ companyId: A }] },
      create: { companyId: A },
      update: {},
    });
  });

  it("fails closed for a model without a tenant rule", () => {
    expect(() => scopeArgs("BrandNewModel", "findMany", {}, A)).toThrow(/no tenant rule/);
  });
});

describe("tenant rules match prisma/schema.prisma", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({ name, body }));

  it("lists every model with a companyId column, with its owning relation fields", () => {
    const direct = Object.fromEntries(
      models
        .filter((m) => /^\s+companyId\s+String\b/m.test(m.body))
        .map((m) => [
          m.name,
          [...m.body.matchAll(/^\s+(\w+)\s+\w+\??\s+@relation\([^)]*fields:/gm)].map(([, field]) => field).sort(),
        ]),
    );
    const listed = Object.fromEntries(Object.entries(DIRECT_TENANT_MODELS).map(([name, fields]) => [name, [...fields].sort()]));
    expect(listed).toEqual(direct);
  });

  it("gives every other model a parent filter or marks it shared", () => {
    const others = models
      .map((m) => m.name)
      .filter((name) => name !== "Company" && !DIRECT_TENANT_MODELS[name] && !SHARED_MODELS.has(name));
    expect(others.filter((name) => !INDIRECT_TENANT_MODELS[name])).toEqual([]);
  });
});
