import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getLiveQuoteService } from "@/server/quotes/live-service";

export async function GET(request: Request) {
  return handle(async () => getLiveQuoteService().dashboard(await getAuthorizedActor(request)));
}
