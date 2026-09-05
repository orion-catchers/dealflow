import { readJson } from "@/features/catalog/api";
import { handle } from "@/lib/api/respond";
import { parseSignupBody, signupUser } from "@/server/lib/auth/credentials";
import { developmentEnabled, getAdapter } from "@/server/adapters";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await readJson(request);
    if (developmentEnabled()) {
      const parsed = parseSignupBody(input);
      await (await getAdapter()).signup(parsed.name, parsed.email, parsed.password);
      return { message: "Account requested. An administrator must activate access." };
    }
    return signupUser(parseSignupBody(input));
  });
}
