import { z } from "zod";
import type { BillingInterval, CancelPolicy, InvoiceStatus, PaymentMethod, SubscriptionStatus } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { moneySchema } from "@/features/catalog/api";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
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
});

export const planPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  archived: z.boolean().optional(),
});

export const paymentBodySchema = z.object({
  invoiceId: z.string().trim().min(1),
  amount: moneySchema,
  method: paymentMethodSchema,
  reference: z.string().trim().min(1).max(120),
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
  })
  .refine(
    (v) => [v.quantity !== undefined, Boolean(v.planId), v.pause, v.resume, v.cancel].filter(Boolean).length === 1,
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
