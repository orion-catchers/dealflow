import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { healthService } from "@/server/health/service-instance";

export async function GET(request: Request) {
  return handle(async () => healthService.summary(await getActor(request)));
}
