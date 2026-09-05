import { handle } from "@/lib/api/respond";
import { convertMoney } from "@/server/integrations/fx";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import type { Currency } from "@/contracts/harsh";

export async function GET(request: Request) {
  return handle(async () => {
    await getAuthorizedActor(request);
    const url = new URL(request.url);
    const amount = url.searchParams.get("amount") ?? "0";
    const from = (url.searchParams.get("from") ?? "INR") as Currency;
    const to = (url.searchParams.get("to") ?? "INR") as Currency;
    return { amount, from, to, converted: convertMoney(amount, from, to), source: process.env.DEALFLOW_FX_JSON ? "ENV" : "DEFAULT" };
  });
}
