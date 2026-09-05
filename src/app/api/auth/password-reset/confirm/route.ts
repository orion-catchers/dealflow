import { handle } from "@/lib/api/respond";
import { confirmPasswordReset } from "@/server/lib/auth/password-reset";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    return confirmPasswordReset(body);
  });
}
