import { describe, expect, it } from "vitest";
import { fromCents, toCents } from "./money";
import { invoiceStatus, outstandingAmount } from "./status";

describe("invoiceStatus", () => {
  it("derives from payments plus applied credits", () => {
    expect(invoiceStatus("1000.00", "0.00", "0.00")).toBe("UNPAID");
    expect(invoiceStatus("1000.00", "400.00", "0.00")).toBe("PARTIALLY_PAID");
    expect(invoiceStatus("1000.00", "400.00", "600.00")).toBe("PAID");
    expect(invoiceStatus("1000.00", "0.00", "1000.00")).toBe("PAID");
    expect(outstandingAmount("1000.00", "400.00", "100.00")).toBe("500.00");
  });
});

describe("money", () => {
  it("round-trips signed cents", () => {
    expect(toCents("-920.5")).toBe(-92050);
    expect(fromCents(-92050)).toBe("-920.50");
    expect(fromCents(5)).toBe("0.05");
    expect(() => toCents("12,00")).toThrow();
  });
});
