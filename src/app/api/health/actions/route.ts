import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getLiveHealthService } from "@/server/health/live-service";
import { notifyHealthNudge } from "@/server/integrations/notifications";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const task = await getLiveHealthService().createTask({
      actor,
      flagId: String(body.flagId ?? ""),
      action: body.action === "ESCALATE" ? "ESCALATE" : "NUDGE",
      assigneeId: String(body.assigneeId ?? ""),
      dueDate: String(body.dueDate ?? ""),
    });
    if (body.action !== "ESCALATE") {
      try {
        await notifyHealthNudge(String(body.assigneeId ?? ""), `A deal-health follow-up is due ${String(body.dueDate ?? "")}.`);
      } catch (reason) {
        console.error("[health] nudge email was not delivered", reason);
      }
    }
    return task;
  });
}
