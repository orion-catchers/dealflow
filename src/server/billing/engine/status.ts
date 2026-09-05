import type { InvoiceStatus, Money } from "@/contracts/ruchir";
import { fromCents, toCents } from "./money";

export function outstandingAmount(total: Money, paid: Money, credited: Money): Money {
  return fromCents(toCents(total) - toCents(paid) - toCents(credited));
}

export function invoiceStatus(total: Money, paid: Money, credited: Money): InvoiceStatus {
  const settled = toCents(paid) + toCents(credited);
  if (settled <= 0) return "UNPAID";
  return settled >= toCents(total) ? "PAID" : "PARTIALLY_PAID";
}
