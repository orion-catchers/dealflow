import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getLivePolicyService } from "@/server/governance/live-policy-service";

export async function GET(request: Request) {
  return handle(async () => getLivePolicyService().get(await getAuthorizedActor(request)));
}

export async function PATCH(request: Request) {
  return handle(async () => getLivePolicyService().publish(await getAuthorizedActor(request), await readJson(request)));
}
