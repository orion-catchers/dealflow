import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { parseQuoteCreate, quoteListItem } from "@/server/quotes/http";

export async function GET(request: Request) {
  return handle(async () => {
    const quotes = await getLiveQuoteService().list(await getAuthorizedActor(request));
    return quotes.map(quoteListItem);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getLiveQuoteService().create(actor, parseQuoteCreate(await readJson(request)));
  });
}
