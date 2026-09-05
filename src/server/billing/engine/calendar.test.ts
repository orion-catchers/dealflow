import { describe, expect, it } from "vitest";
import { addDays, addInterval, addMonthsAnchored, daysBetween, parseDate, periodFrom } from "./calendar";

describe("addMonthsAnchored", () => {
  it("clamps Jan 31 to Feb 28 and returns to the anchor day in March", () => {
    expect(addMonthsAnchored({ date: "2026-01-31", months: 1, anchorDay: 31 })).toBe("2026-02-28");
    expect(addMonthsAnchored({ date: "2026-02-28", months: 1, anchorDay: 31 })).toBe("2026-03-31");
  });

  it("uses Feb 29 in a leap year and Feb 28 the year after", () => {
    expect(addMonthsAnchored({ date: "2028-01-31", months: 1, anchorDay: 31 })).toBe("2028-02-29");
    expect(addMonthsAnchored({ date: "2028-02-29", months: 12, anchorDay: 29 })).toBe("2029-02-28");
    expect(addMonthsAnchored({ date: "2029-02-28", months: 12, anchorDay: 29 })).toBe("2030-02-28");
  });

  it("crosses year boundaries", () => {
    expect(addMonthsAnchored({ date: "2026-11-15", months: 3, anchorDay: 15 })).toBe("2027-02-15");
    expect(addMonthsAnchored({ date: "2026-12-31", months: 1, anchorDay: 31 })).toBe("2027-01-31");
  });
});

describe("addInterval / periodFrom", () => {
  it("monthly, quarterly, yearly", () => {
    expect(addInterval({ date: "2026-09-01", interval: "MONTHLY", anchorDay: 1 })).toBe("2026-10-01");
    expect(addInterval({ date: "2026-09-01", interval: "QUARTERLY", anchorDay: 1 })).toBe("2026-12-01");
    expect(addInterval({ date: "2026-09-01", interval: "YEARLY", anchorDay: 1 })).toBe("2027-09-01");
  });

  it("period days are calendar days on [start, end)", () => {
    expect(periodFrom({ start: "2026-09-01", interval: "MONTHLY", anchorDay: 1 })).toEqual({ start: "2026-09-01", end: "2026-10-01", days: 30 });
    expect(periodFrom({ start: "2028-02-01", interval: "MONTHLY", anchorDay: 1 })).toEqual({ start: "2028-02-01", end: "2028-03-01", days: 29 });
    expect(periodFrom({ start: "2026-01-31", interval: "MONTHLY", anchorDay: 31 }).days).toBe(28);
  });
});

describe("daysBetween / addDays", () => {
  it("is signed and ignores DST", () => {
    expect(daysBetween("2026-09-16", "2026-10-01")).toBe(15);
    expect(daysBetween("2026-10-01", "2026-09-16")).toBe(-15);
    expect(addDays("2026-09-05", 15)).toBe("2026-09-20");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });
});

describe("parseDate", () => {
  it("rejects impossible calendar dates", () => {
    expect(() => parseDate("2026-13-01")).toThrow(/real calendar date/);
    expect(() => parseDate("2026-02-29")).toThrow(/real calendar date/);
    expect(parseDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });
});
