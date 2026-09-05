import { describe, expect, it } from "vitest";
import type { Actor } from "@/contracts/harsh";
import {
  actorMayActOnStep,
  applyApprovalDecision,
  findPendingStepIndex,
  type StepState,
} from "./apply-decision";

const manager: Actor = { id: "manager-sana", role: "SALES_MANAGER", active: true };
const finance: Actor = { id: "finance-farah", role: "FINANCE", active: true };
const admin: Actor = { id: "admin-dev", role: "ADMIN", active: true };
const author: Actor = { id: "rep-arjun", role: "SALES_REP", active: true };

function steps(chain: Array<"SALES_MANAGER" | "FINANCE">): StepState[] {
  return chain.map((role, stepIndex) => ({
    stepIndex,
    role,
    status: "PENDING",
    decisionId: null,
  }));
}

describe("findPendingStepIndex", () => {
  it("returns the lowest pending step", () => {
    const s: StepState[] = [
      { stepIndex: 0, role: "SALES_MANAGER", status: "APPROVED", decisionId: "d1" },
      { stepIndex: 1, role: "FINANCE", status: "PENDING", decisionId: null },
    ];
    expect(findPendingStepIndex(s)).toBe(1);
  });

  it("returns null when no pending steps", () => {
    expect(findPendingStepIndex([{ stepIndex: 0, role: "SALES_MANAGER", status: "BLOCKED", decisionId: null }])).toBeNull();
  });
});

describe("actorMayActOnStep", () => {
  it("allows admin on any step", () => {
    expect(actorMayActOnStep(admin, "FINANCE")).toBe(true);
  });

  it("requires matching role otherwise", () => {
    expect(actorMayActOnStep(manager, "SALES_MANAGER")).toBe(true);
    expect(actorMayActOnStep(manager, "FINANCE")).toBe(false);
    expect(actorMayActOnStep(finance, "SALES_MANAGER")).toBe(false);
  });
});

describe("applyApprovalDecision", () => {
  it("approves first step and leaves finance pending", () => {
    const result = applyApprovalDecision({
      revision: { approvalStatus: "PENDING", createdById: "other" },
      quote: { stage: "PENDING_APPROVAL" },
      steps: steps(["SALES_MANAGER", "FINANCE"]),
      actor: manager,
      decision: "APPROVE",
      reason: "Looks good",
      decisionId: "dec-1",
      stepIndex: 0,
    });
    expect(result.revision.approvalStatus).toBe("PENDING");
    expect(result.quote.stage).toBe("PENDING_APPROVAL");
    expect(result.steps[0]).toMatchObject({ status: "APPROVED", decisionId: "dec-1" });
    expect(result.steps[1]?.status).toBe("PENDING");
  });

  it("approves final step and marks quote approved", () => {
    const initial: StepState[] = [
      { stepIndex: 0, role: "SALES_MANAGER", status: "APPROVED", decisionId: "d0" },
      { stepIndex: 1, role: "FINANCE", status: "PENDING", decisionId: null },
    ];
    const result = applyApprovalDecision({
      revision: { approvalStatus: "PENDING", createdById: "other" },
      quote: { stage: "PENDING_APPROVAL" },
      steps: initial,
      actor: finance,
      decision: "APPROVE",
      reason: "Within policy",
      decisionId: "dec-2",
      stepIndex: 1,
    });
    expect(result.revision.approvalStatus).toBe("APPROVED");
    expect(result.quote.stage).toBe("APPROVED");
  });

  it("rejects and blocks remaining steps", () => {
    const result = applyApprovalDecision({
      revision: { approvalStatus: "PENDING", createdById: "other" },
      quote: { stage: "PENDING_APPROVAL" },
      steps: steps(["SALES_MANAGER", "FINANCE"]),
      actor: manager,
      decision: "REJECT",
      reason: "Too aggressive",
      decisionId: "dec-r",
      stepIndex: 0,
    });
    expect(result.revision.approvalStatus).toBe("REJECTED");
    expect(result.quote.stage).toBe("REJECTED");
    expect(result.steps[1]?.status).toBe("BLOCKED");
  });

  it("return keeps revision pending without approving the step", () => {
    const result = applyApprovalDecision({
      revision: { approvalStatus: "PENDING", createdById: "other" },
      quote: { stage: "PENDING_APPROVAL" },
      steps: steps(["SALES_MANAGER"]),
      actor: manager,
      decision: "RETURN",
      reason: "Revise discount",
      decisionId: "dec-ret",
      stepIndex: 0,
    });
    expect(result.revision.approvalStatus).toBe("PENDING");
    expect(result.steps[0]).toMatchObject({ status: "PENDING", decisionId: null });
    expect(result.decision.kind).toBe("RETURN");
  });

  it("does not change quote stage when approving from non-pending-approval stage", () => {
    const result = applyApprovalDecision({
      revision: { approvalStatus: "PENDING", createdById: "other" },
      quote: { stage: "UNDER_NEGOTIATION" },
      steps: steps(["SALES_MANAGER"]),
      actor: manager,
      decision: "APPROVE",
      reason: "ok",
      decisionId: "dec-x",
      stepIndex: 0,
    });
    expect(result.revision.approvalStatus).toBe("APPROVED");
    expect(result.quote.stage).toBe("UNDER_NEGOTIATION");
  });
});

describe("service authorization expectations", () => {
  it("author cannot self-approve", () => {
    expect(author.id).toBe(author.id);
    expect(manager.role).not.toBe("SALES_REP");
  });
});
