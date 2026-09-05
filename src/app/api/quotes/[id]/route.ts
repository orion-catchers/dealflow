import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseQuoteRevision } from "@/server/quotes/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getLiveQuoteService().get(actor, id);
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getLiveQuoteService().revise(actor, id, parseQuoteRevision(await readJson(request)));
  });
}
