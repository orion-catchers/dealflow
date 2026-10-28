import { handle, readJsonBody } from "@/lib/api/respond";
import { confirmPasswordReset } from "@/server/lib/auth/password-reset";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJsonBody(request);
    return confirmPasswordReset(body);
  });
}
