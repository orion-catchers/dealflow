import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { healthService } from "@/server/health/service-instance";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = await request.json();
    return healthService.createTask({ ...body, actor });
  });
}
