import { describe, expect, it } from "vitest";
import type { Actor } from "@/contracts/atharva";
import { atharvaFixtures } from "@/fixtures/atharva-dev";
import { HealthService } from "./health-service";

const manager: Actor = { id: "manager-sana", role: "SALES_MANAGER" };
const customer: Actor = {
  id: "customer-neha",
  role: "CUSTOMER",
  customerId: "customer-acme",
};

describe("HealthService", () => {
  it("deduplicates repeated nudge/escalation actions", () => {
    const service = new HealthService(
      atharvaFixtures.health,
      atharvaFixtures.dashboard,
    );
    const input = {
      flagId: "health-stalled-quote",
      action: "NUDGE" as const,
      assigneeId: "rep-arjun",
      dueDate: "2026-09-06",
      actor: manager,
    };
    const first = service.createTask(input);
    const second = service.createTask(input);
    expect(second).toEqual(first);
  });

  it("rejects customer health management and only counts active risks", () => {
    const service = new HealthService(
      atharvaFixtures.health,
      atharvaFixtures.dashboard,
    );
    expect(() => service.summary(customer)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(service.summary(manager).atRiskDeals).toBe(2);
  });
});
