import { CatalogService } from "./service";
import { PrismaCatalogRepository } from "./prisma-catalog";

/** Live catalog service (Prisma). Tests construct `new CatalogService(new InMemoryCatalogRepository())`. */
export function getCatalogService(): CatalogService {
  return new CatalogService(new PrismaCatalogRepository());
}
