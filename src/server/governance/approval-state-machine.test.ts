import { describe, expect, it } from "vitest";
import type {
  Actor,
  PolicyEvaluation,
  Quote,
  DealRevision,
} from "@/contracts/atharva";
import {
  InMemoryApprovalStateMachine,
  ApprovalStateMachineError,
} from "./approval-state-machine";

const evaluation: PolicyEvaluation = {
  status: "PENDING",
  riskLevel: "FINANCE",
  requiredApprovalChain: ["MANAGER", "FINANCE"],
  breaches: [],
  weightedExcessPct: "0.00",
  worstLineExcessPct: "6.00",
  reasons: ["Exception"],
  policySnapshot: {
    policyVersionId: "policy-1",
    capturedAt: "2026-09-05T00:00:00.000Z",
    rules: {
      tierId: "tier-gold",
      tierName: "Gold",
      defaultCeilingPct: "15",
      categoryCeilingsPct: {},
      managerThresholdPct: "0",
      financeWorstLineThresholdPct: "5",
      financeWeightedThresholdPct: "3",
      minimumHistorySamples: 3,
    },
  },
};

const revision = {
  id: "revision-1",
  quoteId: "quote-1",
  revisionNumber: 1,
  evaluation,
} as DealRevision;
const quote = {
  id: "quote-1",
  customerId: "customer-acme",
  salesRepId: "rep-arjun",
  currentRevisionId: revision.id,
} as Quote;
const manager: Actor = { id: "manager-sana", role: "SALES_MANAGER" };
const finance: Actor = { id: "finance-farah", role: "FINANCE" };
const rep: Actor = { id: "rep-arjun", role: "SALES_REP" };

const action = (
  actor: Actor,
  level: "MANAGER" | "FINANCE",
  decision: "APPROVE" | "RETURN" | "REJECT" = "APPROVE",
) => ({
  quote,
  revision,
  actor,
  level,
  decision,
  reason: "Reviewed commercial exception",
  requestKey: `${level.toLowerCase()}-request`,
  createdAt: "2026-09-05T00:00:00.000Z",
});

describe("InMemoryApprovalStateMachine", () => {
  it("requires Manager before Finance and reaches approved after both", () => {
    const machine = new InMemoryApprovalStateMachine([revision]);
    expect(() => machine.act(action(finance, "FINANCE"))).toThrowError(
      ApprovalStateMachineError,
    );
    expect(machine.act(action(manager, "MANAGER")).status).toBe("PENDING");
    expect(machine.act(action(finance, "FINANCE")).status).toBe("APPROVED");
  });

  it("rejects self approval, wrong roles, missing reasons, and stale revisions", () => {
    const machine = new InMemoryApprovalStateMachine([revision]);
    expect(() => machine.act(action(rep, "MANAGER"))).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() =>
      machine.act({ ...action(manager, "MANAGER"), reason: " " }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() =>
      machine.act({
        ...action(manager, "MANAGER"),
        quote: { ...quote, currentRevisionId: "revision-2" },
      }),
    ).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("returns the same state for a repeated request key", () => {
    const machine = new InMemoryApprovalStateMachine([revision]);
    machine.act(action(manager, "MANAGER"));
    const repeated = machine.act(action(manager, "MANAGER"));
    expect(repeated.completed).toHaveLength(1);
    expect(repeated.status).toBe("PENDING");
  });
});
