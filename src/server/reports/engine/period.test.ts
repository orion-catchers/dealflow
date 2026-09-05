import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { localDateOf, resolvePeriod } from "./period";

// 2026-09-05T05:30Z == 11:00 IST, Saturday 5 Sep 2026
const now = new Date("2026-09-05T05:30:00.000Z");

describe("resolvePeriod (IST calendar)", () => {
  it("TODAY = today..tomorrow", () => {
    expect(resolvePeriod({ period: "TODAY" }, now)).toEqual({ from: "2026-09-05", to: "2026-09-06" });
  });

  it("THIS_WEEK = Monday..next Monday", () => {
    expect(resolvePeriod({ period: "THIS_WEEK" }, now)).toEqual({ from: "2026-08-31", to: "2026-09-07" });
  });

  it("THIS_MONTH = 1st..1st of next month", () => {
    expect(resolvePeriod({ period: "THIS_MONTH" }, now)).toEqual({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("THIS_QUARTER = quarter start..next quarter start", () => {
    expect(resolvePeriod({ period: "THIS_QUARTER" }, now)).toEqual({ from: "2026-07-01", to: "2026-10-01" });
  });

  it("uses the time zone's calendar date, not UTC", () => {
    // 20:30Z on Sep 4 is already 02:00 IST on Sep 5
    const late = new Date("2026-09-04T20:30:00.000Z");
    expect(resolvePeriod({ period: "TODAY" }, late)).toEqual({ from: "2026-09-05", to: "2026-09-06" });
    expect(resolvePeriod({ period: "TODAY" }, late, "UTC")).toEqual({ from: "2026-09-04", to: "2026-09-05" });
  });

  it("rolls month and year boundaries", () => {
    const dec = new Date("2026-12-31T12:00:00.000Z");
    expect(resolvePeriod({ period: "THIS_MONTH" }, dec)).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(resolvePeriod({ period: "THIS_QUARTER" }, dec)).toEqual({ from: "2026-10-01", to: "2027-01-01" });
    expect(resolvePeriod({ period: "TODAY" }, dec)).toEqual({ from: "2026-12-31", to: "2027-01-01" });
  });

  it("CUSTOM passes through a valid range", () => {
    expect(resolvePeriod({ period: "CUSTOM", from: "2026-08-01", to: "2026-10-01" }, now)).toEqual({
      from: "2026-08-01",
      to: "2026-10-01",
    });
  });

  it("CUSTOM without from/to → INVALID_INPUT", () => {
    expect(() => resolvePeriod({ period: "CUSTOM" }, now)).toThrowError(ApiFailure);
    try {
      resolvePeriod({ period: "CUSTOM", from: "2026-08-01" }, now);
    } catch (e) {
      expect((e as ApiFailure).code).toBe("INVALID_INPUT");
    }
  });

  it("CUSTOM with from >= to → INVALID_INPUT", () => {
    expect(() => resolvePeriod({ period: "CUSTOM", from: "2026-09-01", to: "2026-09-01" }, now)).toThrowError(ApiFailure);
    expect(() => resolvePeriod({ period: "CUSTOM", from: "2026-09-02", to: "2026-09-01" }, now)).toThrowError(ApiFailure);
    expect(() => resolvePeriod({ period: "CUSTOM", from: "2026-02-30", to: "2026-03-01" }, now)).toThrowError(ApiFailure);
  });
});

describe("localDateOf", () => {
  it("buckets UTC timestamps into IST calendar dates", () => {
    expect(localDateOf("2026-09-04T20:30:00.000Z")).toBe("2026-09-05");
    expect(localDateOf("2026-09-05T03:00:00.000Z")).toBe("2026-09-05");
    expect(localDateOf("2026-09-05T18:29:59.000Z")).toBe("2026-09-05");
    expect(localDateOf("2026-09-05T18:30:00.000Z")).toBe("2026-09-06");
  });
});
