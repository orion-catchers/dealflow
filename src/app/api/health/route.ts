import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getLiveHealthService } from "@/server/health/live-service";

export async function GET(request: Request) {
  return handle(async () => getLiveHealthService().list(await getActor(request)));
}

export async function POST(request: Request) {
  return handle(async () => getLiveHealthService().refresh(await getActor(request)));
}
