import { handle } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const rows = await prisma.company.findMany({ orderBy: { name: "asc" } });
    return rows
      .filter((c) => actor.role === "ADMIN" || !actor.companyId || c.id === actor.companyId)
      .map((c) => ({ id: c.id, code: c.code, name: c.name, currency: c.currency, active: c.active }));
  });
}
