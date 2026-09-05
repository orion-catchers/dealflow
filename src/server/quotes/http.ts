import type { Quote } from "@/contracts/atharva";
import { ApiFailure } from "@/lib/api/respond";
import type { QuoteCreateInput, DealLineMutationInput, DealRevisionInput } from "./live-service";

export function quoteListItem(quote: Quote) {
  return {
    id: quote.id,
    customerId: quote.customerId,
    salesRepId: quote.salesRepId,
    stage: quote.stage,
    currentRevisionNumber: quote.currentRevisionNumber,
    currentRevision: quote.revisions.find((revision) => revision.id === quote.currentRevisionId),
    lastBusinessActivityAt: quote.lastBusinessActivityAt,
  };
}

function expectedRevision(raw: unknown): number | string {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  throw new ApiFailure("INVALID_INPUT", "expectedRevision is required.");
}

function lineDrafts(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) {
    throw new ApiFailure("INVALID_INPUT", "lines must be a non-empty array.");
  }
  return raw.map((item, index) => {
    const line = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (typeof line.productId !== "string" || !line.productId.trim()) {
      throw new ApiFailure("INVALID_INPUT", `Line ${index + 1} productId is required.`);
    }
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiFailure("INVALID_INPUT", `Line ${index + 1} quantity must be a positive integer.`);
    }
    return {
      productId: line.productId,
      variantId: typeof line.variantId === "string" ? line.variantId : undefined,
      quantity,
      discountPct: line.discountPct as number | string | undefined,
    };
  });
}

export function parseQuoteCreate(raw: unknown): QuoteCreateInput {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (typeof body.customerId !== "string" || !body.customerId.trim()) {
    throw new ApiFailure("INVALID_INPUT", "customerId is required.");
  }
  return {
    customerId: body.customerId,
    currency: body.currency === "INR" ? "INR" : undefined,
    orderDiscountPct: body.orderDiscountPct as number | string | undefined,
    promisedDate: body.promisedDate === null || typeof body.promisedDate === "string" ? body.promisedDate : undefined,
    lines: lineDrafts(body.lines),
  };
}

export function parseDealRevision(raw: unknown): DealRevisionInput {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    expectedRevision: expectedRevision(body.expectedRevision),
    orderDiscountPct: body.orderDiscountPct as number | string | undefined,
    promisedDate: body.promisedDate === null || typeof body.promisedDate === "string" ? body.promisedDate : undefined,
    lines: body.lines === undefined ? undefined : lineDrafts(body.lines),
  };
}

export function parseLineMutation(raw: unknown): DealLineMutationInput {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const action = body.action;
  if (action !== "ADD" && action !== "REMOVE" && action !== "REPLACE") {
    throw new ApiFailure("INVALID_INPUT", "action must be ADD, REMOVE, or REPLACE.");
  }
  return {
    expectedRevision: expectedRevision(body.expectedRevision),
    action,
    line: body.line && typeof body.line === "object" ? lineDrafts([body.line])[0] : undefined,
    lineId: typeof body.lineId === "string" ? body.lineId : undefined,
    lines: body.lines === undefined ? undefined : lineDrafts(body.lines),
    orderDiscountPct: body.orderDiscountPct as number | string | undefined,
    promisedDate: body.promisedDate === null || typeof body.promisedDate === "string" ? body.promisedDate : undefined,
  };
}

export function parseExpectedRevisionBody(raw: unknown) {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    expectedRevision: expectedRevision(body.expectedRevision),
    requestKey: typeof body.requestKey === "string" ? body.requestKey : "",
    body: typeof body.body === "string" ? body.body : "",
    lineChanges: Array.isArray(body.lineChanges) ? body.lineChanges as Array<{
      lineId: string;
      quantity?: number;
      discountPct?: number;
      comment?: string;
    }> : [],
    requestedDeliveryDate: typeof body.requestedDeliveryDate === "string" ? body.requestedDeliveryDate : undefined,
  };
}
