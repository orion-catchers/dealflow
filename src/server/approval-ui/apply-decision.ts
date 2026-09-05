import type { Actor, Role } from "@/contracts/harsh";
import type { ApprovalActionInput } from "@/contracts/ruchir";

export type StepState = {
  stepIndex: number;
  role: Role;
  status: "PENDING" | "APPROVED" | "BLOCKED";
  decisionId: string | null;
};

export type RevisionState = {
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  createdById: string;
};

export type QuoteState = {
  stage: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "UNDER_NEGOTIATION" | "CONFIRMED" | "REJECTED";
};

export type ApplyDecisionInput = {
  revision: RevisionState;
  quote: QuoteState;
  steps: StepState[];
  actor: Actor;
  decision: ApprovalActionInput["decision"];
  reason: string;
  decisionId: string;
  stepIndex: number;
};

export type ApplyDecisionResult = {
  revision: RevisionState;
  quote: QuoteState;
  steps: StepState[];
  decision: {
    id: string;
    actorId: string;
    actorRole: Role;
    stepIndex: number;
    kind: ApprovalActionInput["decision"];
    reason: string;
  };
};

export function findPendingStepIndex(steps: StepState[]): number | null {
  const pending = [...steps].filter((s) => s.status === "PENDING").sort((a, b) => a.stepIndex - b.stepIndex);
  return pending[0]?.stepIndex ?? null;
}

/** ADMIN may act on any pending step; other roles must match the step role. */
export function actorMayActOnStep(actor: Actor, stepRole: Role): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === stepRole;
}

export function applyApprovalDecision(input: ApplyDecisionInput): ApplyDecisionResult {
  const steps = input.steps.map((s) => ({ ...s }));
  const revision = { ...input.revision };
  const quote = { ...input.quote };
  const step = steps.find((s) => s.stepIndex === input.stepIndex);
  if (!step || step.status !== "PENDING") {
    throw new Error("No pending step at the requested index");
  }

  const decision = {
    id: input.decisionId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    stepIndex: input.stepIndex,
    kind: input.decision,
    reason: input.reason,
  };

  if (input.decision === "APPROVE") {
    step.status = "APPROVED";
    step.decisionId = input.decisionId;
    const nextPending = findPendingStepIndex(steps);
    if (nextPending === null) {
      revision.approvalStatus = "APPROVED";
      if (quote.stage === "PENDING_APPROVAL") quote.stage = "APPROVED";
    }
  } else if (input.decision === "REJECT") {
    step.status = "APPROVED";
    step.decisionId = input.decisionId;
    revision.approvalStatus = "REJECTED";
    quote.stage = "REJECTED";
    for (const s of steps) {
      if (s.status === "PENDING" && s.stepIndex !== input.stepIndex) s.status = "BLOCKED";
    }
  } else {
    revision.approvalStatus = "PENDING";
  }

  return { revision, quote, steps, decision };
}
