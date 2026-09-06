import { describe, expect, it } from "vitest";
import { accessFor, canAccess } from "./permissions";

const INTERNAL = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"] as const;

describe("accessFor", () => {
  it("keeps auth entry points public", () => {
    expect(accessFor("/api/auth/sso/google", "GET")).toBe("PUBLIC");
    expect(accessFor("/api/jobs/run", "POST")).toBe("PUBLIC");
    expect(accessFor("/api/payments/stripe/webhook", "POST")).toBe("PUBLIC");
    expect(accessFor("/api/integrations/public", "GET")).toBe("PUBLIC");
  });

  it("requires any session for auth self endpoints", () => {
    expect(accessFor("/api/auth/me", "GET")).toBe("ANY");
    expect(accessFor("/api/auth/logout", "POST")).toBe("ANY");
  });

  it("defaults unknown api paths to internal", () => {
    expect(accessFor("/api/something-new", "GET")).toBe("INTERNAL");
  });

  it("deal health is staff-only data, not a public probe", () => {
    expect(accessFor("/api/health", "GET")).toBe("INTERNAL");
    expect(accessFor("/api/health/actions", "POST")).toBe("INTERNAL");
    expect(canAccess("CUSTOMER", "/api/health", "GET")).toBe(false);
    expect(canAccess("SALES_REP", "/api/health", "GET")).toBe(true);
  });
});

describe("role matrix (blueprint §3)", () => {
  it("customer is portal-only", () => {
    expect(canAccess("CUSTOMER", "/api/portal/quotes/Q1", "GET")).toBe(true);
    expect(canAccess("CUSTOMER", "/api/portal/quotes/Q1/proposals", "POST")).toBe(true);
    expect(canAccess("CUSTOMER", "/api/quotes", "GET")).toBe(false);
    expect(canAccess("CUSTOMER", "/api/products", "GET")).toBe(false);
    expect(canAccess("CUSTOMER", "/api/admin/users", "GET")).toBe(false);
    expect(canAccess("CUSTOMER", "/api/payments", "POST")).toBe(true);
    for (const role of INTERNAL) {
      expect(canAccess(role, "/api/portal/quotes/Q1", "GET")).toBe(false);
    }
  });

  it("sales rep builds quotes but does not approve or administer", () => {
    expect(canAccess("SALES_REP", "/api/quotes", "POST")).toBe(true);
    expect(canAccess("SALES_REP", "/api/quotes/Q-1/send", "POST")).toBe(true);
    expect(canAccess("SALES_REP", "/api/products", "GET")).toBe(true);
    expect(canAccess("SALES_REP", "/api/approvals", "GET")).toBe(true);
    expect(canAccess("SALES_REP", "/api/approvals", "POST")).toBe(false);
    expect(canAccess("SALES_REP", "/api/dashboard", "GET")).toBe(true);
    expect(canAccess("SALES_REP", "/api/invoices", "GET")).toBe(true);
    expect(canAccess("SALES_REP", "/api/health/actions", "POST")).toBe(true);
    expect(canAccess("SALES_REP", "/api/products/p1", "PATCH")).toBe(false);
    expect(canAccess("SALES_REP", "/api/fulfillment/O1/ship", "POST")).toBe(false);
    expect(canAccess("SALES_REP", "/api/price-lists", "POST")).toBe(false);
  });

  it("sales manager approves, configures policy, and monitors deals", () => {
    expect(canAccess("SALES_MANAGER", "/api/approvals/rev1", "POST")).toBe(true);
    expect(canAccess("SALES_MANAGER", "/api/dashboard", "GET")).toBe(true);
    expect(canAccess("SALES_MANAGER", "/api/reports", "GET")).toBe(true);
    expect(canAccess("SALES_MANAGER", "/api/invoices", "GET")).toBe(true);
    expect(canAccess("SALES_MANAGER", "/api/quotes", "GET")).toBe(true);
    expect(canAccess("SALES_MANAGER", "/api/products", "POST")).toBe(false);
    expect(canAccess("SALES_MANAGER", "/api/payments", "POST")).toBe(false);
  });

  it("finance handles fulfillment, stock and billing", () => {
    expect(canAccess("FINANCE", "/api/fulfillment/O1/ship", "POST")).toBe(true);
    expect(canAccess("FINANCE", "/api/fulfillment/O1/override", "POST")).toBe(true);
    expect(canAccess("FINANCE", "/api/fulfillment/O1", "GET")).toBe(true);
    expect(canAccess("FINANCE", "/api/stock/receipts", "POST")).toBe(true);
    expect(canAccess("FINANCE", "/api/invoices/inv1", "PATCH")).toBe(true);
    expect(canAccess("FINANCE", "/api/payments", "POST")).toBe(true);
    expect(canAccess("FINANCE", "/api/credits", "GET")).toBe(true);
    expect(canAccess("FINANCE", "/api/billing/run-due", "POST")).toBe(true);
    expect(canAccess("FINANCE", "/api/approvals", "GET")).toBe(true);
    expect(canAccess("FINANCE", "/api/quotes", "POST")).toBe(false);
    expect(canAccess("FINANCE", "/api/products/p1", "DELETE")).toBe(false);
  });

  it("admin manages backend setup and platform analytics", () => {
    expect(canAccess("ADMIN", "/api/products", "POST")).toBe(true);
    expect(canAccess("ADMIN", "/api/price-lists/pl1/rules", "POST")).toBe(true);
    expect(canAccess("ADMIN", "/api/warehouses/w1", "PATCH")).toBe(true);
    expect(canAccess("ADMIN", "/api/plans", "POST")).toBe(true);
    expect(canAccess("ADMIN", "/api/admin/users/u1", "PATCH")).toBe(true);
    expect(canAccess("ADMIN", "/api/reports/export", "GET")).toBe(true);
    expect(canAccess("ADMIN", "/api/health/actions", "POST")).toBe(true);
    expect(canAccess("ADMIN", "/api/integrations/status", "GET")).toBe(true);
    expect(canAccess("CUSTOMER", "/api/integrations/status", "GET")).toBe(false);
    expect(canAccess("FINANCE", "/api/carrier/quote", "GET")).toBe(true);
    expect(canAccess("SALES_REP", "/api/companies", "GET")).toBe(true);
  });

  it("fulfillment reads are open to staff, writes are not", () => {
    for (const role of INTERNAL) {
      expect(canAccess(role, "/api/fulfillment", "GET")).toBe(true);
      expect(canAccess(role, "/api/stock/levels", "GET")).toBe(true);
    }
    expect(canAccess("SALES_REP", "/api/fulfillment/O1/deliver", "POST")).toBe(false);
    expect(canAccess("SALES_MANAGER", "/api/stock", "POST")).toBe(false);
  });

  it("matches nested portal and admin paths exactly", () => {
    expect(accessFor("/api/admin/users/u1", "PATCH")).toEqual(["ADMIN"]);
    expect(accessFor("/api/portal/quotes/Q1/confirm", "POST")).toEqual(["CUSTOMER"]);
  });
});
