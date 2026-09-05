import { PDFDocument, StandardFonts } from "pdf-lib";
import type { InvoiceRecord } from "@/contracts/ruchir";

function safe(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x20 && code <= 0x7e) return ch;
      return "?";
    })
    .join("");
}

/** Credits and payments are settlement, not revenue. */
export async function renderInvoicePdf(invoice: InvoiceRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const line = (text: string, size = 11, useBold = false) => {
    page.drawText(safe(text), { x: 40, y, size, font: useBold ? bold : font });
    y -= 16;
  };

  line(`Invoice ${invoice.id}`, 16, true);
  line(`${invoice.kind} · ${invoice.status}`);
  line(`Customer: ${invoice.customerName}`);
  line(`Issue ${invoice.issueDate}  Due ${invoice.dueDate}`);
  if (invoice.periodStart && invoice.periodEnd) {
    line(`Period ${invoice.periodStart} to ${invoice.periodEnd} (end exclusive)`);
  }
  y -= 8;
  line("Lines (revenue)", 12, true);
  for (const item of invoice.lines) {
    line(`${item.description}  x${item.quantity}  @ ${item.unitPrice}  = ${item.lineTotal}`);
  }
  y -= 8;
  line(`Subtotal ${invoice.subtotal}`, 11, true);
  line(`Tax ${invoice.taxTotal}`, 11, true);
  line(`Total (revenue) ${invoice.total}`, 12, true);
  y -= 8;
  line("Settlement (not revenue)", 12, true);
  line(`Payments ${invoice.paidAmount}`);
  line(`Credits applied ${invoice.creditedAmount}`);
  line(`Outstanding ${invoice.outstanding}`, 12, true);
  return doc.save();
}
