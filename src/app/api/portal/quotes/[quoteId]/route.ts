import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { fixturePortalQuote, usesFixturePortal } from "@/server/quotes/fixture-portal";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  return handle(async () => {
    const { quoteId } = await context.params;
    if (usesFixturePortal()) return fixturePortalQuote(request, quoteId);
    return getLiveQuoteService().portalQuote(await getAuthorizedActor(request), quoteId);
  });
}
