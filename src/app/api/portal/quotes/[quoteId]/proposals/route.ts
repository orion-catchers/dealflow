import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseExpectedRevisionBody } from "@/server/quotes/http";
import { fixturePortalPropose, usesFixturePortal } from "@/server/quotes/fixture-portal";

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  return handle(async () => {
    const { quoteId } = await context.params;
    const raw = await readJson(request);
    if (usesFixturePortal()) return fixturePortalPropose(request, quoteId, raw);
    const body = parseExpectedRevisionBody(raw);
    return getLiveQuoteService().propose(await getActor(request), quoteId, {
      expectedRevision: body.expectedRevision,
      requestKey: body.requestKey,
      body: body.body || body.lineChanges.map((line) => line.comment).filter(Boolean).join("\n"),
      lineChanges: body.lineChanges,
      requestedDeliveryDate: body.requestedDeliveryDate,
    });
  });
}
