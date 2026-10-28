import { parseInput, readJson } from "@/features/catalog/api";
import { handle } from "@/lib/api/respond";
import { parseSignupBody, signupWorkspace } from "@/server/lib/auth/credentials";
import { clientAddress } from "@/server/lib/auth/rate-limit";
import { fixtureSignupSchema } from "@/server/lib/auth/schemas";
import { setSessionCookie } from "@/server/lib/auth/session";
import { developmentEnabled, getAdapter } from "@/server/adapters";

/** Create a new workspace and sign its owner in. Joining an existing workspace happens by admin invitation. */
export async function POST(request: Request) {
  let token: string | undefined;
  const response = await handle(async () => {
    const input = await readJson(request);
    if (developmentEnabled()) {
      const parsed = parseInput(fixtureSignupSchema, input);
      await (await getAdapter()).signup(parsed.name, parsed.email, parsed.password);
      return { message: "Account requested. An administrator must activate access." };
    }
    const result = await signupWorkspace(parseSignupBody(input), clientAddress(request));
    token = result.token;
    return { actor: { ...result.user, role: result.user.role === "FINANCE" ? "FINANCE_OPS" : result.user.role }, mode: "LIVE" };
  });
  if (token) setSessionCookie(response, token);
  return response;
}
