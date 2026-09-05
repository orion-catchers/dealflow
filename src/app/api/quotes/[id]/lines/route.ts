import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseLineMutation } from "@/server/quotes/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getLiveQuoteService().mutateLines(actor, id, parseLineMutation(await readJson(request)));
  });
}
