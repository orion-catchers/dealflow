/**
 * Zod schemas for the catalog + customer master API. Enums mirror `@/contracts/harsh`;
 * money is a decimal string with ≤2 fractional digits, percentages are 0–100.
 */
import { z } from "zod";
import type { Currency, CustomerTier, ProductCategory, Unit } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";

export const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Validate with a schema, converting zod issues into the shared INVALID_INPUT envelope. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issues = result.error.issues;
  const summary = issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  throw new ApiFailure("INVALID_INPUT", `Invalid input — ${summary}`, issues);
}

export const moneySchema = z.string().regex(MONEY_PATTERN, "Money must be a decimal string like '1250.00'");
export const pctSchema = z.number().min(0).max(100);
export const idSchema = z.string().trim().min(1).max(120);
export const nameSchema = z.string().trim().min(1).max(200);

export const customerTierSchema = z.enum(["BRONZE", "SILVER", "GOLD"] satisfies [CustomerTier, ...CustomerTier[]]);
export const currencySchema = z.enum(["INR", "USD", "EUR"] satisfies [Currency, ...Currency[]]);
export const productCategorySchema = z.enum(["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"] satisfies [
  ProductCategory,
  ...ProductCategory[],
]);
export const unitSchema = z.enum(["UNIT", "SEAT", "HOUR", "PACK", "LICENSE"] satisfies [Unit, ...Unit[]]);

// --- Customers -------------------------------------------------------------

export const customerCreateSchema = z.object({
  name: nameSchema,
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().optional(),
  tier: customerTierSchema,
  currency: currencySchema,
  assignedRepId: idSchema.optional(),
  priceListId: idSchema.optional(),
  active: z.boolean().optional(),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

/** `null` clears an optional field; `undefined` leaves it unchanged. */
export const customerUpdateSchema = z
  .object({
    name: nameSchema,
    contactName: z.string().trim().max(200).nullable(),
    contactEmail: z.string().trim().email().nullable(),
    tier: customerTierSchema,
    currency: currencySchema,
    assignedRepId: idSchema.nullable(),
    priceListId: idSchema.nullable(),
    active: z.boolean(),
  })
  .partial();
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

// --- Tax rates -------------------------------------------------------------

export const taxRateCreateSchema = z.object({
  name: nameSchema,
  ratePct: pctSchema,
  active: z.boolean().optional(),
});
export type TaxRateCreateInput = z.infer<typeof taxRateCreateSchema>;

// --- Products / variants -----------------------------------------------------

export const productCreateSchema = z.object({
  name: nameSchema,
  category: productCategorySchema,
  unit: unitSchema,
  description: z.string().trim().max(2000).default(""),
  basePrice: moneySchema,
  baseCost: moneySchema,
  taxRateId: idSchema,
  stockTracked: z.boolean(),
  isSubscription: z.boolean().default(false),
  planId: idSchema.optional(),
  shippingWeightKg: z.number().min(0).optional(),
  active: z.boolean().optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: nameSchema,
    category: productCategorySchema,
    unit: unitSchema,
    description: z.string().trim().max(2000),
    basePrice: moneySchema,
    baseCost: moneySchema,
    taxRateId: idSchema,
    stockTracked: z.boolean(),
    isSubscription: z.boolean(),
    planId: idSchema.nullable(),
    shippingWeightKg: z.number().min(0).nullable(),
    active: z.boolean(),
  })
  .partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const variantAttributeSchema = z.object({ name: nameSchema, value: z.string().trim().min(1).max(200) });

export const variantCreateSchema = z.object({
  label: nameSchema,
  attributes: z.array(variantAttributeSchema).default([]),
  extraPrice: moneySchema.default("0.00"),
  extraCost: moneySchema.default("0.00"),
  sku: z.string().trim().min(1).max(64),
  active: z.boolean().optional(),
});
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;

export const variantUpdateSchema = z
  .object({
    label: nameSchema,
    attributes: z.array(variantAttributeSchema),
    extraPrice: moneySchema,
    extraCost: moneySchema,
    sku: z.string().trim().min(1).max(64),
    active: z.boolean(),
  })
  .partial();
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

// --- Price lists / rules -----------------------------------------------------

export const priceListCreateSchema = z.object({
  name: nameSchema,
  currency: currencySchema,
  tier: customerTierSchema.nullable().default(null),
  active: z.boolean().optional(),
});
export type PriceListCreateInput = z.infer<typeof priceListCreateSchema>;

export const priceListUpdateSchema = z
  .object({
    name: nameSchema,
    currency: currencySchema,
    tier: customerTierSchema.nullable(),
    active: z.boolean(),
  })
  .partial();
export type PriceListUpdateInput = z.infer<typeof priceListUpdateSchema>;

/** Upsert: with `id` updates that rule; without `id` creates one. */
export const priceRuleUpsertSchema = z
  .object({
    id: idSchema.optional(),
    productId: idSchema,
    variantId: idSchema.optional(),
    fixedPrice: moneySchema.optional(),
    discountPct: pctSchema.optional(),
    minQty: z.number().int().min(1).optional(),
  })
  .refine((r) => !(r.fixedPrice !== undefined && r.discountPct !== undefined), {
    message: "Set either fixedPrice or discountPct, not both",
    path: ["fixedPrice"],
  });
export type PriceRuleUpsertInput = z.infer<typeof priceRuleUpsertSchema>;

// --- Catalog boundary --------------------------------------------------------

export const resolvePriceInputSchema = z.object({
  customerId: idSchema,
  productId: idSchema,
  variantId: idSchema.optional(),
  quantity: z.number().positive().optional(),
});

export const catalogSearchInputSchema = z.object({
  customerId: idSchema.optional(),
  query: z.string().trim().max(200).optional(),
  category: productCategorySchema.optional(),
  includeInactive: z.boolean().optional(),
});

/** Parse `?flag=1|true|yes` query-string booleans. */
export function queryFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

/** Read a JSON body, mapping malformed JSON to a zod-like INVALID_INPUT failure. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
