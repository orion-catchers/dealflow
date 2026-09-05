import type { PolicySnapshot } from "@/contracts/atharva";
import { atharvaFixtures } from "@/fixtures/atharva-dev";

const globalForPolicy = globalThis as unknown as { policy?: PolicySnapshot };
export const policy =
  globalForPolicy.policy ?? structuredClone(atharvaFixtures.policy);
if (process.env.NODE_ENV !== "production") globalForPolicy.policy = policy;

export function updatePolicy(
  input: Partial<PolicySnapshot["rules"]>,
): PolicySnapshot {
  if (input.defaultCeilingPct !== undefined)
    policy.rules.defaultCeilingPct = input.defaultCeilingPct;
  if (input.financeWorstLineThresholdPct !== undefined)
    policy.rules.financeWorstLineThresholdPct =
      input.financeWorstLineThresholdPct;
  if (input.financeWeightedThresholdPct !== undefined)
    policy.rules.financeWeightedThresholdPct =
      input.financeWeightedThresholdPct;
  if (input.totalDiscountBudgetPct !== undefined)
    policy.rules.totalDiscountBudgetPct = input.totalDiscountBudgetPct;
  return structuredClone(policy);
}
