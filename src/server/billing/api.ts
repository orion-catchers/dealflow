import { z } from "zod";
import type { BillingInterval, CancelPolicy, InvoiceStatus, PaymentMethod, SubscriptionStatus } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { moneySchema } from "@/features/catalog/api";
import { parseDate } from "./engine/calendar";

export const isoDateSchema = z.string().superRefine((value, ctx) => {
  try {
    parseDate(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "Date must be a real YYYY-MM-DD calendar date" });
  }
});
export const requestKeySchema = z.string().trim().min(1).max(200);

export const billingIntervalSchema = z.enum(["MONTHLY", "QUARTERLY", "YEARLY"] satisfies [
  BillingInterval,
  ...BillingInterval[],
]);
export const cancelPolicySchema = z.enum(["IMMEDIATE", "PERIOD_END"] satisfies [CancelPolicy, ...CancelPolicy[]]);
export const invoiceStatusSchema = z.enum(["UNPAID", "PARTIALLY_PAID", "PAID", "VOID"] satisfies [
  InvoiceStatus,
  ...InvoiceStatus[],
]);
export const subscriptionStatusSchema = z.enum(["ACTIVE", "PAUSED", "CANCELLED"] satisfies [
  SubscriptionStatus,
  ...SubscriptionStatus[],
]);
export const paymentMethodSchema = z.enum(["BANK_TRANSFER", "CARD", "CHEQUE", "CASH", "OTHER"] satisfies [
  PaymentMethod,
  ...PaymentMethod[],
]);

export const planCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  interval: billingIntervalSchema,
  cancelPolicy: cancelPolicySchema,
  listPrice: moneySchema.optional(),
});

export const planPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  archived: z.boolean().optional(),
  interval: billingIntervalSchema.optional(),
  cancelPolicy: cancelPolicySchema.optional(),
  listPrice: moneySchema.optional(),
});

export const paymentBodySchema = z.object({
  invoiceId: z.string().trim().min(1),
  amount: z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
    if (typeof value === "string") {
      const n = Number(value.trim().replace(/,/g, ""));
      if (Number.isFinite(n)) return n.toFixed(2);
    }
    return value;
  }, moneySchema),
  method: paymentMethodSchema,
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : `PAY-${Date.now()}`)),
  paidOn: isoDateSchema,
  requestKey: requestKeySchema,
});

export const dueBillingBodySchema = z.object({
  requestKey: requestKeySchema,
  asOf: isoDateSchema.optional(),
});

export const subscriptionPatchSchema = z
  .object({
    requestKey: requestKeySchema,
    effectiveDate: isoDateSchema.optional(),
    quantity: z.number().int().positive().optional(),
    planId: z.string().trim().min(1).optional(),
    pause: z.boolean().optional(),
    resume: z.boolean().optional(),
    cancel: z.boolean().optional(),
    uncancel: z.boolean().optional(),
  })
  .refine(
    (v) => [v.quantity !== undefined, Boolean(v.planId), v.pause, v.resume, v.cancel, v.uncancel].filter(Boolean).length === 1,
    { message: "Specify exactly one of quantity, planId, pause, resume, or cancel" },
  );

export function parseListStatus(raw: string | null): InvoiceStatus | undefined {
  if (!raw) return undefined;
  return parseInput(invoiceStatusSchema, raw);
}

export function parseSubStatus(raw: string | null): SubscriptionStatus | undefined {
  if (!raw) return undefined;
  return parseInput(subscriptionStatusSchema, raw);
}
