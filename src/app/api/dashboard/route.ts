import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getLiveQuoteService } from "@/server/quotes/live-service";

export async function GET(request: Request) {
  return handle(async () => getLiveQuoteService().dashboard(await getActor(request)));
}
