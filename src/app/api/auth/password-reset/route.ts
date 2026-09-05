import { handle } from "@/lib/api/respond";
import { readJson } from "@/features/catalog/api";
import { requestPasswordReset } from "@/server/lib/auth/password-reset";

export async function POST(request: Request) {
  return handle(async () => {
    return requestPasswordReset(await readJson(request));
  });
}
