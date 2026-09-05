import { ApiFailure, handle } from "@/lib/api/respond";
import { getSessionUser } from "@/server/lib/auth/actor";
import { developmentEnabled, getAdapter } from "@/server/adapters";

export async function GET(request: Request) {
  return handle(async () => {
    if (developmentEnabled()) {
      const token = request.headers.get("cookie")?.split(";")
        .map(part => part.trim())
        .find(part => part.startsWith("dealflow-session="))
        ?.slice("dealflow-session=".length);
      const actor = await (await getAdapter()).authenticate(token);
      if (!actor) throw new ApiFailure("UNAUTHENTICATED", "Not authenticated");
      return { actor, mode: "DEV FIXTURE" };
    }
    return getSessionUser(request);
  });
}
