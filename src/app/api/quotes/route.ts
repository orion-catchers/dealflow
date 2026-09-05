import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { atharvaFixtures } from "@/fixtures/atharva-dev";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const quotes =
      actor.role === "CUSTOMER"
        ? atharvaFixtures.quotes.filter(
            (quote) => quote.customerId === actor.customerId,
          )
        : actor.role === "SALES_REP"
          ? atharvaFixtures.quotes.filter(
              (quote) => quote.salesRepId === actor.id,
            )
          : atharvaFixtures.quotes;
    return quotes.map((quote) => ({
      id: quote.id,
      customerId: quote.customerId,
      salesRepId: quote.salesRepId,
      stage: quote.stage,
      currentRevisionNumber: quote.currentRevisionNumber,
      currentRevision: quote.revisions.find(
        (revision) => revision.id === quote.currentRevisionId,
      ),
      lastBusinessActivityAt: quote.lastBusinessActivityAt,
    }));
  });
}
