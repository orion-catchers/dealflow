import { atharvaFixtures } from "@/fixtures/atharva-dev";
import { HealthService } from "./health-service";

const globalForHealth = globalThis as unknown as {
  healthService?: HealthService;
};

export const healthService =
  globalForHealth.healthService ??
  new HealthService(atharvaFixtures.health, atharvaFixtures.dashboard);

if (process.env.NODE_ENV !== "production") {
  globalForHealth.healthService = healthService;
}
