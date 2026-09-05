import { handle } from "@/lib/api/respond";
import { getSessionUser } from "@/server/lib/auth/actor";

export async function GET(request: Request) {
  return handle(async () => getSessionUser(request));
}
