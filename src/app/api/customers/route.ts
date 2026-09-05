/** Customer master — DEV FIXTURE (in-memory repository). GET list, POST create. */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().listCustomers(actor);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().createCustomer(actor, await readJson(request));
  });
}
