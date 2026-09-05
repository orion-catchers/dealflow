import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { healthService } from "@/server/health/service-instance";

export async function GET(request: Request) {
  return handle(async () => healthService.list(await getActor(request)));
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = await request.json();
    return healthService.refresh(actor, body);
  });
}
