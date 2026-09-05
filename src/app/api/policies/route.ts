import { handle } from "@/lib/api/respond";
import { getActor, requireRole } from "@/server/lib/auth/dev-actor";
import { policy, updatePolicy } from "@/server/governance/policy-service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    requireRole(actor, "ADMIN", "SALES_MANAGER", "SALES_REP");
    return structuredClone(policy);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    requireRole(actor, "ADMIN", "SALES_MANAGER");
    return updatePolicy(await request.json());
  });
}
