import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseQuoteCreate, quoteListItem } from "@/server/quotes/http";

export async function GET(request: Request) {
  return handle(async () => {
    const quotes = await getLiveQuoteService().list(await getActor(request));
    return quotes.map(quoteListItem);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getLiveQuoteService().create(actor, parseQuoteCreate(await readJson(request)));
  });
}
