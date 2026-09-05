/**
 * Engine 2 — zod schemas for request bodies of /api/warehouses, /api/stock, /api/fulfillment.
 * Actor is never in the body; routes attach it from `getActor(request)`.
 */
import { z } from "zod";

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "money must be a decimal string like 800.00");
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const requestKey = z.string().min(1).max(200);

export const allocationPlanEntrySchema = z.object({
  orderLineId: z.string().min(1),
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: positiveInt,
});

export const backorderPlanEntrySchema = z.object({
  orderLineId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: positiveInt,
});

export const acceptBodySchema = z.object({
  requestKey,
  plan: z
    .object({
      allocations: z.array(allocationPlanEntrySchema),
      backorders: z.array(backorderPlanEntrySchema),
    })
    .optional(),
});

export const overrideBodySchema = z.object({
  requestKey,
  allocations: z.array(allocationPlanEntrySchema),
  backorders: z.array(backorderPlanEntrySchema),
});

export const consolidateBodySchema = z.object({
  requestKey,
  allocations: z.array(allocationPlanEntrySchema).min(1),
});

export const shipBodySchema = z.object({
  shipmentId: z.string().min(1),
  requestKey,
});

export const deliverBodySchema = shipBodySchema;

export const cancelBodySchema = z.object({
  requestKey,
  reason: z.string().trim().min(1).max(500),
});

export const receiptBodySchema = z.object({
  warehouseId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: positiveInt,
  requestKey,
  note: z.string().max(500).optional(),
});

export const stockLevelPatchSchema = z
  .object({
    warehouseId: z.string().min(1),
    variantId: z.string().min(1),
    onHand: nonNegativeInt.optional(),
    reorderThreshold: nonNegativeInt.optional(),
  })
  .refine((v) => v.onHand !== undefined || v.reorderThreshold !== undefined, {
    message: "Provide onHand and/or reorderThreshold",
  });

export const warehouseCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
  shippingCostPerShipment: money,
  shippingCostPerKg: money.optional(),
  active: z.boolean().optional(),
});

export const warehouseUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().min(1).max(20).optional(),
    shippingCostPerShipment: money.optional(),
    shippingCostPerKg: money.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

const orderLineSchema = z.object({
  orderLineId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  variantId: z.string().min(1).optional(),
  variantLabel: z.string().optional(),
  quantity: nonNegativeInt,
  stockTracked: z.boolean(),
  isSubscription: z.boolean(),
  shippingWeightKg: z.number().nonnegative().optional(),
});

export const initializeBodySchema = z.object({
  order: z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    customerName: z.string().min(1),
    repId: z.string().min(1),
    currency: z.enum(["INR", "USD", "EUR"]),
    promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    confirmedAt: z.string().datetime(),
    lines: z.array(orderLineSchema),
  }),
});

export const stockQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  variantId: z.string().min(1).optional(),
});
