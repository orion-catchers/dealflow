/** Customer master — DEV FIXTURE (in-memory repository). GET list, POST create. */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().listCustomers(actor);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().createCustomer(actor, await readJson(request));
  });
}
