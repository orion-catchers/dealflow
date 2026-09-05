import { ApiFailure, handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseExpectedRevisionBody } from "@/server/quotes/http";
import { fixturePortalConfirm, usesFixturePortal } from "@/server/quotes/fixture-portal";

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  return handle(async () => {
    const { quoteId } = await context.params;
    const raw = await readJson(request);
    if (usesFixturePortal()) return fixturePortalConfirm(request, quoteId, raw);
    const body = parseExpectedRevisionBody(raw);
    if (!body.requestKey.trim()) throw new ApiFailure("INVALID_INPUT", "requestKey is required.");
    const result = await getLiveQuoteService().confirm(await getActor(request), quoteId, {
      expectedRevision: body.expectedRevision,
      requestKey: body.requestKey,
    });
    return {
      orderId: result.orderId,
      quoteId: result.sourceQuoteId,
      revision: result.sourceRevisionId,
      created: !result.replayed,
      fulfillmentStatus: result.status,
      billingInitialization: result.billingInitialization,
      fulfillmentInitialization: result.fulfillmentInitialization,
    };
  });
}
