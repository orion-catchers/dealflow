import { ApiFailure, handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseExpectedRevisionBody } from "@/server/quotes/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    const body = parseExpectedRevisionBody(await readJson(request));
    if (!body.requestKey.trim()) throw new ApiFailure("INVALID_INPUT", "requestKey is required.");
    const result = await getLiveQuoteService().confirm(actor, id, {
      expectedRevision: body.expectedRevision,
      requestKey: body.requestKey,
    });
    return {
      ...result,
      quoteId: result.sourceQuoteId,
      revision: result.sourceRevisionId,
      created: !result.replayed,
      fulfillmentStatus: result.status,
    };
  });
}
