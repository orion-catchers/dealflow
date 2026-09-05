import { describe, expect, it } from "vitest";
import type { Actor, ReportFilters } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { parseExportFormat, parseReportFilters } from "./api";
import { InMemoryReportRepository, getReportRepository } from "./repository";
import { ReportService, exportSourceLabel } from "./service";

const now = new Date("2026-09-05T05:30:00.000Z");
const ALL: ReportFilters = { period: "CUSTOM", from: "2026-08-01", to: "2026-10-01" };

const admin: Actor = { id: "admin-dev", role: "ADMIN", active: true };
const manager: Actor = { id: "manager-sana", role: "SALES_MANAGER", active: true };
const finance: Actor = { id: "finance-farah", role: "FINANCE", active: true };
const arjun: Actor = { id: "rep-arjun", role: "SALES_REP", active: true };
const customer: Actor = { id: "customer-neha", role: "CUSTOMER", customerId: "customer-acme", active: true };

const service = new ReportService(new InMemoryReportRepository());

describe("ReportService.run — scope", () => {
  it("ADMIN / SALES_MANAGER / FINANCE see all six", async () => {
    for (const actor of [admin, manager, finance]) {
      const agg = await service.run(ALL, actor, now);
      expect(agg.sales.quoteCount).toBe(6);
    }
  });

  it("SALES_REP is forced to its own repId", async () => {
    const agg = await service.run(ALL, arjun, now);
    expect(agg.filters.repId).toBe("rep-arjun");
    expect(agg.rows.every((r) => r.repId === "rep-arjun")).toBe(true);
    expect(agg.rows.map((r) => r.quoteNumber).sort()).toEqual(["Q-1042", "Q-1043"]);
  });

  it("SALES_REP asking for another rep → FORBIDDEN", async () => {
    await expect(service.run({ ...ALL, repId: "rep-priya" }, arjun, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("CUSTOMER → FORBIDDEN", async () => {
    await expect(service.run(ALL, customer, now)).rejects.toBeInstanceOf(ApiFailure);
    await expect(service.run(ALL, customer, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.filterOptions(customer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("THIS_MONTH fixture numbers via the service", async () => {
    const agg = await service.run({ period: "THIS_MONTH" }, admin, now);
    expect(agg.sales).toMatchObject({
      quoteCount: 3,
      confirmedOrderCount: 1,
      confirmedOneTimeRevenue: "466400.00",
      confirmedMonthlyRecurring: "9200.00",
    });
    expect(agg.approvals).toMatchObject({ pending: 1, managerFinance: 1 });
  });

  it("CUSTOM without dates → INVALID_INPUT", async () => {
    await expect(service.run({ period: "CUSTOM" }, admin, now)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("ReportService.export", () => {
  it("XLSX bytes start with PK and use the same dataset as run", async () => {
    const agg = await service.run(ALL, admin, now);
    const out = await service.export(ALL, "XLSX", admin, now);
    expect(out.bytes[0]).toBe(0x50);
    expect(out.bytes[1]).toBe(0x4b);
    expect(out.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(out.filename).toBe("dealflow-report-2026-08-01_2026-10-01.xlsx");

    const XLSX = await import("xlsx");
    const wb = XLSX.read(out.bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Quotes"]);
    expect(rows).toHaveLength(agg.rows.length);
  });

  it("PDF bytes start with %PDF and carry the resolved range in the filename", async () => {
    const out = await service.export({ period: "THIS_MONTH" }, "PDF", admin, now);
    expect(String.fromCharCode(out.bytes[0], out.bytes[1], out.bytes[2], out.bytes[3])).toBe("%PDF");
    expect(out.contentType).toBe("application/pdf");
    expect(out.filename).toBe("dealflow-report-2026-09-01_2026-10-01.pdf");
  });

  it("SALES_REP export is scoped like run", async () => {
    const agg = await service.run(ALL, arjun, now);
    const out = await service.export(ALL, "XLSX", arjun, now);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(out.bytes, { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets["Quotes"])).toHaveLength(agg.rows.length);
    expect(agg.rows).toHaveLength(2);
  });

  it("source label flags DEV FIXTURE outside production", () => {
    expect(exportSourceLabel("development")).toContain("DEV FIXTURE");
    expect(exportSourceLabel("test")).toContain("DEV FIXTURE");
    expect(exportSourceLabel("production")).not.toContain("DEV FIXTURE");
  });
});

describe("ReportService.filterOptions", () => {
  it("returns teams, reps, products and categories for managers", async () => {
    const opts = await service.filterOptions(manager);
    expect(opts.teams.map((t) => t.id)).toEqual(["team-north", "team-smb"]);
    expect(opts.reps.map((r) => r.id)).toEqual(["rep-arjun", "rep-priya", "rep-rohit"]);
    expect(opts.reps[0]).toEqual({ id: "rep-arjun", name: "Arjun Mehta", teamId: "team-north" });
    expect(opts.products.map((p) => p.id)).toContain("prod-laptop");
    expect(opts.products[0]).toEqual({ id: "prod-laptop", name: "Nexa ProBook 15", category: "HARDWARE" });
    expect(opts.categories).toEqual(["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"]);
  });

  it("SALES_REP only sees itself in reps", async () => {
    const opts = await service.filterOptions(arjun);
    expect(opts.reps.map((r) => r.id)).toEqual(["rep-arjun"]);
  });

  it("getReportRepository is cached on globalThis", () => {
    expect(getReportRepository()).toBe(getReportRepository());
  });
});

describe("api — query parsing", () => {
  it("parses filters from URLSearchParams and drops empty values", () => {
    const params = new URLSearchParams("period=CUSTOM&from=2026-08-01&to=2026-10-01&teamId=team-smb&repId=&approvalStatus=REJECTED&category=SERVICES");
    expect(parseReportFilters(params)).toEqual({
      period: "CUSTOM",
      from: "2026-08-01",
      to: "2026-10-01",
      teamId: "team-smb",
      approvalStatus: "REJECTED",
      category: "SERVICES",
    });
  });

  it("defaults period to THIS_MONTH", () => {
    expect(parseReportFilters(new URLSearchParams(""))).toEqual({ period: "THIS_MONTH" });
  });

  it("rejects bad enum values and malformed dates", () => {
    expect(() => parseReportFilters(new URLSearchParams("period=YESTERDAY"))).toThrow();
    expect(() => parseReportFilters(new URLSearchParams("period=CUSTOM&from=01-08-2026&to=2026-10-01"))).toThrow();
    expect(() => parseReportFilters(new URLSearchParams("approvalStatus=MAYBE"))).toThrow();
  });

  it("parses export format case-insensitively", () => {
    expect(parseExportFormat(new URLSearchParams("format=pdf"))).toBe("PDF");
    expect(parseExportFormat(new URLSearchParams("format=XLSX"))).toBe("XLSX");
    expect(() => parseExportFormat(new URLSearchParams("format=csv"))).toThrow();
  });
});
