import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { ReportFilters } from "@/contracts/harsh";
import { reportQuoteRecords, salesTeams } from "@/fixtures/harsh";
import { aggregateReport } from "./aggregate";
import { buildPdf } from "./export-pdf";
import { buildXlsx } from "./export-xlsx";
import { filterRecords } from "./filter";
import { resolvePeriod } from "./period";

const now = new Date("2026-09-05T05:30:00.000Z");
const ALL: ReportFilters = { period: "CUSTOM", from: "2026-08-01", to: "2026-10-01" };
const range = resolvePeriod(ALL, now);
const agg = aggregateReport(filterRecords(reportQuoteRecords, ALL, range, salesTeams), ALL, range);

describe("buildXlsx", () => {
  it("produces a ZIP container (PK magic) with the five sheets and all rows", () => {
    const bytes = buildXlsx(agg, { sourceLabel: "DEV FIXTURE" });
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["Summary", "By Rep", "By Product", "By Stage", "Quotes"]);
    const quotes = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Quotes"]);
    expect(quotes).toHaveLength(agg.rows.length);
    expect(quotes[0]).toHaveProperty("Number");
    const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Summary"], { header: 1 });
    expect(summary[1][0]).toBe("DEV FIXTURE");
    expect(summary.some((row) => row[0] === "Range from (inclusive)" && row[1] === "2026-08-01")).toBe(true);
  });
});

describe("buildPdf", () => {
  it("produces a PDF (%PDF magic) even for many rows", async () => {
    const bytes = await buildPdf(agg, { sourceLabel: "DEV FIXTURE" });
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe("%PDF");

    // 120 rows must paginate without throwing
    const manyRows = Array.from({ length: 120 }, (_, i) => ({ ...agg.rows[i % agg.rows.length], quoteNumber: `Q-${i}` }));
    const big = await buildPdf({ ...agg, rows: manyRows });
    expect(String.fromCharCode(big[0], big[1], big[2], big[3])).toBe("%PDF");
    expect(big.byteLength).toBeGreaterThan(bytes.byteLength);
  });

  it("survives non-WinAnsi characters in names", async () => {
    const rows = [{ ...agg.rows[0], customerName: "Ácme ₹ 株式会社" }];
    const bytes = await buildPdf({ ...agg, rows });
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe("%PDF");
  });
});
