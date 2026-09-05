import { BillingService } from "./service";
import { PrismaBillingRepository } from "./prisma-store";

/** Live billing service (Prisma). Tests construct `new BillingService(new InMemoryBillingRepository())`. */
export function getBillingService(): BillingService {
  return new BillingService(new PrismaBillingRepository());
}
