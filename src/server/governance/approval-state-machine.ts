import type {
  Actor,
  ApprovalDecision,
  ApprovalLevel,
  ApprovalRecord,
  Id,
  Quote,
  QuoteRevision,
} from "@/contracts/atharva";

export interface ApprovalState {
  revisionId: Id;
  requiredChain: ApprovalLevel[];
  completed: ApprovalRecord[];
  status: "PENDING" | "APPROVED" | "RETURNED" | "REJECTED";
}

export interface ApprovalActionInput {
  quote: Quote;
  revision: QuoteRevision;
  actor: Actor;
  level: ApprovalLevel;
  decision: ApprovalDecision;
  reason: string;
  requestKey?: string;
  createdAt: string;
}

export class ApprovalStateMachineError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "CONFLICT" | "INVALID_INPUT",
  ) {
    super(message);
    this.name = "ApprovalStateMachineError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function actorCanApprove(actor: Actor, level: ApprovalLevel): boolean {
  return (
    (level === "MANAGER" && actor.role === "SALES_MANAGER") ||
    (level === "FINANCE" && actor.role === "FINANCE") ||
    actor.role === "ADMIN"
  );
}

export class InMemoryApprovalStateMachine {
  private readonly states = new Map<Id, ApprovalState>();
  private readonly requestResults = new Map<string, ApprovalRecord>();

  constructor(revisions: QuoteRevision[] = []) {
    for (const revision of revisions) {
      this.states.set(revision.id, {
        revisionId: revision.id,
        requiredChain: [...revision.evaluation.requiredApprovalChain],
        completed: [],
        status: revision.evaluation.requiredApprovalChain.length
          ? "PENDING"
          : "APPROVED",
      });
    }
  }

  private getStateForRevision(revision: QuoteRevision): ApprovalState {
    const existing = this.states.get(revision.id);
    if (existing) return existing;

    const state: ApprovalState = {
      revisionId: revision.id,
      requiredChain: [...revision.evaluation.requiredApprovalChain],
      completed: [],
      status: revision.evaluation.requiredApprovalChain.length
        ? "PENDING"
        : "APPROVED",
    };
    this.states.set(revision.id, state);
    return state;
  }

  getState(revisionId: Id): ApprovalState {
    const state = this.states.get(revisionId);
    if (!state) {
      throw new ApprovalStateMachineError(
        `Revision ${revisionId} has no approval state.`,
        "CONFLICT",
      );
    }
    return clone(state);
  }

  act(input: ApprovalActionInput): ApprovalState {
    if (input.quote.currentRevisionId !== input.revision.id) {
      throw new ApprovalStateMachineError(
        "Approval must target the current quote revision.",
        "CONFLICT",
      );
    }

    if (!actorCanApprove(input.actor, input.level)) {
      throw new ApprovalStateMachineError(
        `Role ${input.actor.role} cannot perform ${input.level} approval.`,
        "FORBIDDEN",
      );
    }

    if (input.actor.id === input.quote.salesRepId) {
      throw new ApprovalStateMachineError(
        "A sales representative cannot approve their own quote.",
        "FORBIDDEN",
      );
    }

    if (!input.reason.trim()) {
      throw new ApprovalStateMachineError(
        "An approval decision requires a reason.",
        "INVALID_INPUT",
      );
    }

    const state = this.getStateForRevision(input.revision);
    const stepIndex = state.requiredChain.indexOf(input.level);
    if (stepIndex < 0) {
      throw new ApprovalStateMachineError(
        `${input.level} approval is not required for this revision.`,
        "CONFLICT",
      );
    }

    const requestKey = input.requestKey
      ? `${input.revision.id}:${input.requestKey}`
      : undefined;
    const previousResult = requestKey
      ? this.requestResults.get(requestKey)
      : undefined;
    if (previousResult) return clone(this.getStateForRevision(input.revision));

    const previousStep = state.requiredChain[stepIndex - 1];
    if (
      previousStep &&
      !state.completed.some(
        (decision) =>
          decision.level === previousStep && decision.decision === "APPROVE",
      )
    ) {
      throw new ApprovalStateMachineError(
        `${previousStep} approval must be completed first.`,
        "CONFLICT",
      );
    }

    if (state.completed.some((decision) => decision.level === input.level)) {
      throw new ApprovalStateMachineError(
        `${input.level} has already acted on this revision.`,
        "CONFLICT",
      );
    }

    const record: ApprovalRecord = {
      id: `approval-${input.revision.id}-${input.level.toLowerCase()}`,
      revisionId: input.revision.id,
      level: input.level,
      actorId: input.actor.id,
      decision: input.decision,
      reason: input.reason.trim(),
      createdAt: input.createdAt,
    };
    state.completed.push(record);
    state.status =
      input.decision === "REJECT"
        ? "REJECTED"
        : input.decision === "RETURN"
          ? "RETURNED"
          : state.completed.length === state.requiredChain.length
            ? "APPROVED"
            : "PENDING";
    if (requestKey) this.requestResults.set(requestKey, record);
    return clone(state);
  }
}
