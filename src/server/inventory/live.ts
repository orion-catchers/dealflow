import { FulfillmentService } from "./service";
import { PrismaInventoryRepository } from "./prisma-inventory";

/** Live fulfillment service (Prisma). Tests construct `new FulfillmentService(new InMemoryInventoryRepository())`. */
export function getFulfillmentService(): FulfillmentService {
  return new FulfillmentService(new PrismaInventoryRepository());
}
