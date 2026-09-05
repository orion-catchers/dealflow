import { describe, expect, it } from "vitest";
import type { ReportFilters } from "@/contracts/harsh";
import { reportQuoteRecords, salesTeams } from "@/fixtures/harsh";
import { filterRecords, selectLines } from "./filter";
import { resolvePeriod } from "./period";

const now = new Date("2026-09-05T05:30:00.000Z");
const ALL: ReportFilters = { period: "CUSTOM", from: "2026-08-01", to: "2026-10-01" };

function run(filters: ReportFilters) {
  const range = resolvePeriod(filters, now);
  return filterRecords(reportQuoteRecords, filters, range, salesTeams);
}

const numbers = (rows: { quoteNumber: string }[]) => rows.map((r) => r.quoteNumber).sort();

describe("filterRecords — period", () => {
  it("THIS_MONTH includes quotes created OR confirmed in Sept 2026", () => {
    expect(numbers(run({ period: "THIS_MONTH" }))).toEqual(["Q-1042", "Q-1043", "Q-1044"]);
  });

  it("TODAY includes a quote created earlier but confirmed today", () => {
    // Q-1042 created Sep 2, confirmed Sep 5 11:30 IST; Q-1044 created Sep 5 08:30 IST
    expect(numbers(run({ period: "TODAY" }))).toEqual(["Q-1042", "Q-1044"]);
  });

  it("CUSTOM Aug 1..Oct 1 returns all six fixtures", () => {
    expect(run(ALL)).toHaveLength(6);
  });

  it("excludes records outside the range", () => {
    expect(run({ period: "CUSTOM", from: "2026-07-01", to: "2026-08-01" })).toHaveLength(0);
  });
});

describe("filterRecords — team / rep / approval", () => {
  it("teamId team-smb → Q-1038, Q-1044", () => {
    expect(numbers(run({ ...ALL, teamId: "team-smb" }))).toEqual(["Q-1038", "Q-1044"]);
  });

  it("team match falls back to team membership when record.teamId is absent", () => {
    const orphan = { ...reportQuoteRecords[0], teamId: undefined };
    const range = resolvePeriod(ALL, now);
    expect(filterRecords([orphan], { ...ALL, teamId: "team-north" }, range, salesTeams)).toHaveLength(1);
    expect(filterRecords([orphan], { ...ALL, teamId: "team-smb" }, range, salesTeams)).toHaveLength(0);
  });

  it("repId rep-priya → 2", () => {
    expect(numbers(run({ ...ALL, repId: "rep-priya" }))).toEqual(["Q-1039", "Q-1040"]);
  });

  it("approvalStatus REJECTED → 1; ALL → everything; NOT_REQUIRED → exact", () => {
    expect(numbers(run({ ...ALL, approvalStatus: "REJECTED" }))).toEqual(["Q-1038"]);
    expect(run({ ...ALL, approvalStatus: "ALL" })).toHaveLength(6);
    expect(numbers(run({ ...ALL, approvalStatus: "NOT_REQUIRED" }))).toEqual(["Q-1039", "Q-1042", "Q-1044"]);
    expect(numbers(run({ ...ALL, approvalStatus: "PENDING" }))).toEqual(["Q-1043"]);
    expect(numbers(run({ ...ALL, approvalStatus: "APPROVED" }))).toEqual(["Q-1040"]);
  });
});

describe("filterRecords — product / category", () => {
  it("productId prod-laptop → 4 quotes", () => {
    expect(numbers(run({ ...ALL, productId: "prod-laptop" }))).toEqual(["Q-1038", "Q-1040", "Q-1042", "Q-1043"]);
  });

  it("category SERVICES → Q-1042, Q-1043, Q-1044", () => {
    expect(numbers(run({ ...ALL, category: "SERVICES" }))).toEqual(["Q-1042", "Q-1043", "Q-1044"]);
  });

  it("selectLines returns only matching lines when a product filter is set", () => {
    const q1042 = reportQuoteRecords.find((r) => r.quoteNumber === "Q-1042")!;
    expect(selectLines(q1042, {}).map((l) => l.productId)).toEqual(["prod-laptop", "prod-dock", "prod-support"]);
    expect(selectLines(q1042, { productId: "prod-laptop" }).map((l) => l.productId)).toEqual(["prod-laptop"]);
    expect(selectLines(q1042, { category: "SERVICES" }).map((l) => l.productId)).toEqual(["prod-support"]);
    expect(selectLines(q1042, { category: "SERVICES", productId: "prod-laptop" })).toHaveLength(0);
  });
});
