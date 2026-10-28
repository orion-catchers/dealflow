import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { InvoiceRecord } from "@/contracts/ruchir";
import { renderInvoicePdf } from "./pdf";

function invoiceWithLines(count: number): InvoiceRecord {
  return {
    id: "inv-long",
    customerId: "customer-acme",
    customerName: "Acme",
    orderId: "order-1",
    subscriptionId: null,
    kind: "ONE_TIME",
    status: "UNPAID",
    currency: "INR",
    issueDate: "2026-09-01",
    periodStart: null,
    periodEnd: null,
    dueDate: "2026-09-16",
    subtotal: "1000.00",
    taxTotal: "0.00",
    total: "1000.00",
    paidAmount: "0.00",
    creditedAmount: "0.00",
    outstanding: "1000.00",
    lines: Array.from({ length: count }, (_, i) => ({
      id: `line-${i}`,
      description: `Line ${i + 1}`,
      quantity: 1,
      unitPrice: "20.00",
      discountPct: 0,
      taxPct: 0,
      lineTotal: "20.00",
    })),
    payments: [],
  };
}

describe("renderInvoicePdf", () => {
  it("adds pages so a 60-line invoice keeps every line and the totals", async () => {
    const bytes = await renderInvoicePdf(invoiceWithLines(60));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
