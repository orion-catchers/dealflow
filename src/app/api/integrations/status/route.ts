import { handle } from "@/lib/api/respond";
import { integrationFlags, ENV_KEYS } from "@/server/integrations/status";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

export async function GET(request: Request) {
  return handle(async () => {
    await getAuthorizedActor(request);
    return { flags: integrationFlags(), keys: ENV_KEYS };
  });
}
