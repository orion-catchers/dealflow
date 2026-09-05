import { readJson } from "@/features/catalog/api";
import { handle } from "@/lib/api/respond";
import { parseSignupBody, signupUser } from "@/server/lib/auth/credentials";

export async function POST(request: Request) {
  return handle(async () => signupUser(await parseSignupBody(await readJson(request))));
}
