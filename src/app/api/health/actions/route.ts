import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLiveHealthService } from "@/server/health/live-service";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    return getLiveHealthService().createTask({
      actor,
      flagId: String(body.flagId ?? ""),
      action: body.action === "ESCALATE" ? "ESCALATE" : "NUDGE",
      assigneeId: String(body.assigneeId ?? ""),
      dueDate: String(body.dueDate ?? ""),
    });
  });
}
