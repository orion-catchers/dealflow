import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getLivePolicyService } from "@/server/governance/live-policy-service";

export async function GET(request: Request) {
  return handle(async () => getLivePolicyService().get(await getActor(request)));
}

export async function PATCH(request: Request) {
  return handle(async () => getLivePolicyService().publish(await getActor(request), await readJson(request)));
}
