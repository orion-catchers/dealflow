import type {
  Actor,
  DashboardSummary,
  HealthEvaluation,
  HealthFlag,
  HealthTask,
  Id,
} from "@/contracts/atharva";
import { ApiFailure } from "@/lib/api/respond";
import {
  findHealthCandidates,
  reconcileHealthFlags,
  type HealthEvaluationInput,
} from "./deal-health";

export interface HealthActionInput {
  flagId: Id;
  action: "NUDGE" | "ESCALATE";
  assigneeId: Id;
  dueDate: string;
  actor: Actor;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireInternal(actor: Actor) {
  if (actor.role === "CUSTOMER") {
    throw new ApiFailure("FORBIDDEN", "Customers may not manage deal health.");
  }
}

export class HealthService {
  private flags: HealthFlag[];
  private tasks: HealthTask[];
  private dashboard: DashboardSummary;

  constructor(initial: HealthEvaluation, dashboard: DashboardSummary) {
    this.flags = clone(initial.flags);
    this.tasks = clone(initial.tasks);
    this.dashboard = clone(dashboard);
  }

  list(actor: Actor): HealthEvaluation {
    requireInternal(actor);
    return {
      flags: clone(this.flags),
      tasks: clone(this.tasks),
      settings: {
        stalledAfterDays: 5,
        anomalyMinimumSamples: 3,
        anomalyMarginAboveAveragePct: "10",
      },
    };
  }

  refresh(actor: Actor, input: HealthEvaluationInput): HealthEvaluation {
    requireInternal(actor);
    const candidates = findHealthCandidates(input);
    this.flags = reconcileHealthFlags(this.flags, candidates, input.now);
    return {
      flags: clone(this.flags),
      tasks: clone(this.tasks),
      settings: clone(input.settings),
    };
  }

  createTask(input: HealthActionInput): HealthTask {
    requireInternal(input.actor);
    const flag = this.flags.find((candidate) => candidate.id === input.flagId);
    if (!flag || flag.status !== "ACTIVE") {
      throw new ApiFailure("NOT_FOUND", "Active health flag was not found.");
    }
    if (
      !input.assigneeId.trim() ||
      !input.dueDate.match(/^\d{4}-\d{2}-\d{2}$/)
    ) {
      throw new ApiFailure(
        "INVALID_INPUT",
        "A valid assignee and date are required.",
      );
    }

    const dealId = flag.quoteId ?? flag.orderId;
    if (!dealId) {
      throw new ApiFailure("INVALID_INPUT", "Health flag has no linked deal.");
    }
    const actionKey = `${input.action}:${input.flagId}:${input.assigneeId}`;
    const existing = this.tasks.find(
      (task) =>
        task.id === actionKey ||
        (task.healthFlagId === input.flagId &&
          task.action === input.action &&
          task.status === "OPEN"),
    );
    if (existing) return clone(existing);

    const task: HealthTask = {
      id: actionKey,
      healthFlagId: flag.id,
      dealId,
      assigneeId: input.assigneeId,
      status: "OPEN",
      dueDate: input.dueDate,
      action: input.action,
    };
    this.tasks.push(task);
    return clone(task);
  }

  summary(actor: Actor): DashboardSummary {
    requireInternal(actor);
    const activeFlagCount = this.flags.filter(
      (flag) => flag.status === "ACTIVE",
    ).length;
    return {
      ...clone(this.dashboard),
      atRiskDeals: activeFlagCount,
      pendingApprovals: this.dashboard.pendingApprovals,
    };
  }
}
