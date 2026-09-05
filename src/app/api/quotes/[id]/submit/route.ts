import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseExpectedRevisionBody } from "@/server/quotes/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    const body = parseExpectedRevisionBody(await readJson(request));
    return getLiveQuoteService().submit(actor, id, body.expectedRevision);
  });
}
