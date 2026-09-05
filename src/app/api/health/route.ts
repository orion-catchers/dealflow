import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getLiveHealthService } from "@/server/health/live-service";

export async function GET(request: Request) {
  return handle(async () => getLiveHealthService().list(await getAuthorizedActor(request)));
}

export async function POST(request: Request) {
  return handle(async () => getLiveHealthService().refresh(await getAuthorizedActor(request)));
}
