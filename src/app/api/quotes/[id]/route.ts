import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseDealRevision } from "@/server/quotes/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    return getLiveQuoteService().get(actor, id);
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    return getLiveQuoteService().revise(actor, id, parseDealRevision(await readJson(request)));
  });
}
