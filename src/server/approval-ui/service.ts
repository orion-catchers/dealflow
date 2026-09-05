import type { Actor, Pct, Role } from "@/contracts/harsh";
import type {
  ApprovalBreachRow,
  ApprovalDecisionView,
  ApprovalDetail,
  ApprovalListFilter,
  ApprovalListItem,
  ApprovalStepView,
} from "@/contracts/ruchir";
import type {
  ApprovalDecisionKind,
  ApprovalStepStatus,
  QuoteStage,
  RevisionApprovalStatus,
  RiskLevel,
} from "@/generated/prisma/client";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { prismaUserIdForActor } from "@/server/lib/auth/resolve-user";
import {
  actorMayActOnStep,
  applyApprovalDecision,
  findPendingStepIndex,
  type StepState,
} from "./apply-decision";

const READ_ROLES: Role[] = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"];
const ACT_ROLES: Role[] = ["ADMIN", "SALES_MANAGER", "FINANCE"];

type RevisionRow = {
  id: string;
  quoteId: string;
  riskLevel: RiskLevel;
  weightedExcessPct: { toString(): string };
  worstLineExcessPct: { toString(): string };
  evaluationReasons: unknown;
  approvalStatus: RevisionApprovalStatus;
  createdById: string;
  createdAt: Date;
  quote: { stage: QuoteStage; customer: { name: string } };
  approvalSteps: {
    stepIndex: number;
    role: Role;
    status: ApprovalStepStatus;
    decisionId: string | null;
  }[];
  decisions: {
    id: string;
    actorId: string;
    actorRole: Role;
    stepIndex: number;
    kind: ApprovalDecisionKind;
    reason: string;
    createdAt: Date;
    actor: { name: string };
  }[];
  lines: {
    excessPct: { toString(): string };
    excessAmount: { toString(): string };
    product: { name: string };
  }[];
};

function pct(value: { toString(): string }): Pct {
  return Number(value.toString());
}

function requiredLevel(risk: RiskLevel): ApprovalListItem["requiredLevel"] {
  if (risk === "FINANCE") return "FINANCE";
  if (risk === "MANAGER") return "MANAGER";
  return "NONE";
}

function deriveListStatus(
  approvalStatus: RevisionApprovalStatus,
  latestKind: ApprovalDecisionKind | undefined,
): ApprovalListItem["listStatus"] {
  if (approvalStatus === "PENDING" && latestKind === "RETURN") return "RETURNED";
  if (approvalStatus === "PENDING") return "PENDING";
  return "COMPLETED";
}

function matchesFilter(listStatus: ApprovalListItem["listStatus"], filter: ApprovalListFilter): boolean {
  if (filter === "ALL") return true;
  return listStatus === filter;
}

function parseEvaluation(
  raw: unknown,
  lines: RevisionRow["lines"],
  riskLevel: RiskLevel,
): { reasons: string[]; breaches: ApprovalBreachRow[] } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.filter((r): r is string => typeof r === "string") : [];
  let breaches: ApprovalBreachRow[] = [];
  if (Array.isArray(obj.breaches)) {
    breaches = obj.breaches
      .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
      .map((b) => ({
        reason: String(b.reason ?? "Policy breach"),
        excessPointsPct: Number(b.excessPointsPct ?? b.excessPct ?? 0),
        excessAmount: String(b.excessAmount ?? "0.00"),
      }));
  }
  if (breaches.length === 0) {
    breaches = lines
      .filter((l) => Number(l.excessPct.toString()) > 0)
      .map((l) => ({
        reason: `${l.product.name} exceeds discount ceiling`,
        excessPointsPct: pct(l.excessPct),
        excessAmount: l.excessAmount.toString(),
      }));
  }
  const outReasons = [...reasons];
  if (outReasons.length === 0 && breaches.length > 0) outReasons.push(...breaches.map((b) => b.reason));
  if (outReasons.length === 0) {
    if (riskLevel === "FINANCE") {
      outReasons.push("Finance approval is required because a line or interval group exceeds the Finance threshold.");
    } else if (riskLevel === "MANAGER") {
      outReasons.push("Manager approval is required for the policy breach.");
    }
  }
  return { reasons: outReasons, breaches };
}

function toListItem(row: RevisionRow): ApprovalListItem {
  const sortedDecisions = [...row.decisions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestKind = sortedDecisions[0]?.kind;
  const listStatus = deriveListStatus(row.approvalStatus, latestKind);
  const pendingIdx = findPendingStepIndex(
    row.approvalSteps.map((s) => ({
      stepIndex: s.stepIndex,
      role: s.role,
      status: s.status,
      decisionId: s.decisionId,
    })),
  );
  const pendingStep = pendingIdx === null ? null : row.approvalSteps.find((s) => s.stepIndex === pendingIdx);

  return {
    revisionId: row.id,
    quoteId: row.quoteId,
    customerName: row.quote.customer.name,
    requiredLevel: requiredLevel(row.riskLevel),
    assignedReviewerRole: pendingStep?.role ?? null,
    approvalStatus: row.approvalStatus,
    listStatus,
    weightedExcessPct: pct(row.weightedExcessPct),
    createdAt: row.createdAt.toISOString(),
  };
}

function toStepViews(steps: RevisionRow["approvalSteps"]): ApprovalStepView[] {
  return [...steps]
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((s) => ({
      stepIndex: s.stepIndex,
      role: s.role,
      status: s.status,
    }));
}

function toHistory(decisions: RevisionRow["decisions"]): ApprovalDecisionView[] {
  return [...decisions]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((d) => ({
      id: d.id,
      actorId: d.actorId,
      actorName: d.actor.name,
      actorRole: d.actorRole,
      stepIndex: d.stepIndex,
      kind: d.kind,
      reason: d.reason,
      createdAt: d.createdAt.toISOString(),
    }));
}

function computeCanAct(actor: Actor, row: RevisionRow, actorUserId: string | null): boolean {
  if (!ACT_ROLES.includes(actor.role)) return false;
  if (row.approvalStatus !== "PENDING") return false;
  if (actorUserId && actorUserId === row.createdById) return false;
  const pendingIdx = findPendingStepIndex(
    row.approvalSteps.map((s) => ({
      stepIndex: s.stepIndex,
      role: s.role,
      status: s.status,
      decisionId: s.decisionId,
    })),
  );
  if (pendingIdx === null) return false;
  const step = row.approvalSteps.find((s) => s.stepIndex === pendingIdx);
  if (!step || step.decisionId) return false;
  return actorMayActOnStep(actor, step.role);
}

const revisionInclude = {
  quote: { select: { stage: true, customer: { select: { name: true } } } },
  approvalSteps: { orderBy: { stepIndex: "asc" as const } },
  decisions: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { name: true } } },
  },
  lines: {
    where: { excessPct: { gt: 0 } },
    select: {
      excessPct: true,
      excessAmount: true,
      product: { select: { name: true } },
    },
  },
};

export class ApprovalUiService {
  private assertRead(actor: Actor) {
    if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
    if (actor.role === "CUSTOMER") throw new ApiFailure("FORBIDDEN", "Customers may not view approvals");
    requireRole(actor, ...READ_ROLES);
  }

  async listApprovals(actor: Actor, filter: ApprovalListFilter): Promise<ApprovalListItem[]> {
    this.assertRead(actor);
    const rows = await prisma.quoteRevision.findMany({
      where: {
        OR: [{ approvalStatus: { not: "NOT_REQUIRED" } }, { approvalSteps: { some: {} } }],
      },
      include: revisionInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toListItem).filter((item) => matchesFilter(item.listStatus, filter));
  }

  async getApprovalDetail(actor: Actor, revisionId: string): Promise<ApprovalDetail> {
    this.assertRead(actor);
    const row = await prisma.quoteRevision.findUnique({
      where: { id: revisionId },
      include: revisionInclude,
    });
    if (!row) throw new ApiFailure("NOT_FOUND", "Revision not found");
    const actorUserId = await prismaUserIdForActor(actor);
    const { reasons, breaches } = parseEvaluation(row.evaluationReasons, row.lines, row.riskLevel);
    return {
      revisionId: row.id,
      quoteId: row.quoteId,
      customerName: row.quote.customer.name,
      riskLevel: row.riskLevel,
      weightedExcessPct: pct(row.weightedExcessPct),
      worstLineExcessPct: pct(row.worstLineExcessPct),
      reasons,
      breaches,
      chain: toStepViews(row.approvalSteps),
      history: toHistory(row.decisions),
      canAct: computeCanAct(actor, row, actorUserId),
    };
  }

  async submitDecision(
    actor: Actor,
    revisionId: string,
    decision: "APPROVE" | "REJECT" | "RETURN",
    reason: string,
  ): Promise<ApprovalDetail> {
    if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
    requireRole(actor, ...ACT_ROLES);

    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new ApiFailure("INVALID_INPUT", "Reason is required");

    const actorUserId = await prismaUserIdForActor(actor);
    if (!actorUserId) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user");

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QuoteRevision" WHERE id = ${revisionId} FOR UPDATE`;
      const row = await tx.quoteRevision.findUnique({
        where: { id: revisionId },
        include: {
          quote: { select: { id: true, stage: true, customer: { select: { name: true } } } },
          approvalSteps: { orderBy: { stepIndex: "asc" } },
          decisions: { include: { actor: { select: { name: true } } } },
          lines: {
            where: { excessPct: { gt: 0 } },
            select: {
              excessPct: true,
              excessAmount: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!row) throw new ApiFailure("NOT_FOUND", "Revision not found");
      if (row.approvalStatus !== "PENDING") {
        throw new ApiFailure("CONFLICT", "This revision is not awaiting approval");
      }
      if (actorUserId === row.createdById) {
        throw new ApiFailure("FORBIDDEN", "You cannot approve a revision you authored");
      }

      const steps: StepState[] = row.approvalSteps.map((s) => ({
        stepIndex: s.stepIndex,
        role: s.role,
        status: s.status,
        decisionId: s.decisionId,
      }));
      const pendingIdx = findPendingStepIndex(steps);
      if (pendingIdx === null) throw new ApiFailure("CONFLICT", "No pending approval step");
      const pendingStep = row.approvalSteps.find((s) => s.stepIndex === pendingIdx);
      if (!pendingStep) throw new ApiFailure("CONFLICT", "No pending approval step");
      if (pendingStep.decisionId) {
        throw new ApiFailure("CONFLICT", "This step already has a decision");
      }
      if (!actorMayActOnStep(actor, pendingStep.role)) {
        throw new ApiFailure("FORBIDDEN", `Role ${actor.role} may not act on this step`);
      }

      const decisionId = crypto.randomUUID();
      const applied = applyApprovalDecision({
        revision: { approvalStatus: row.approvalStatus, createdById: row.createdById },
        quote: { stage: row.quote.stage },
        steps,
        actor,
        decision,
        reason: trimmedReason,
        decisionId,
        stepIndex: pendingIdx,
      });

      await tx.approvalDecision.create({
        data: {
          id: decisionId,
          revisionId,
          actorId: actorUserId,
          actorRole: actor.role,
          stepIndex: pendingIdx,
          kind: decision,
          reason: trimmedReason,
        },
      });

      for (const step of applied.steps) {
        const existing = row.approvalSteps.find((s) => s.stepIndex === step.stepIndex);
        if (!existing) continue;
        const nextDecisionId =
          decision === "RETURN" && step.stepIndex === pendingIdx ? null : step.decisionId;
        if (existing.status !== step.status || existing.decisionId !== nextDecisionId) {
          await tx.quoteRevisionApprovalStep.update({
            where: { id: existing.id },
            data: { status: step.status, decisionId: nextDecisionId },
          });
        }
      }

      await tx.quoteRevision.update({
        where: { id: revisionId },
        data: { approvalStatus: applied.revision.approvalStatus },
      });

      if (applied.quote.stage !== row.quote.stage) {
        await tx.quote.update({
          where: { id: row.quote.id },
          data: { stage: applied.quote.stage },
        });
      }

      const updated = await tx.quoteRevision.findUniqueOrThrow({
        where: { id: revisionId },
        include: revisionInclude,
      });
      const { reasons, breaches } = parseEvaluation(updated.evaluationReasons, updated.lines, updated.riskLevel);
      return {
        revisionId: updated.id,
        quoteId: updated.quoteId,
        customerName: updated.quote.customer.name,
        riskLevel: updated.riskLevel,
        weightedExcessPct: pct(updated.weightedExcessPct),
        worstLineExcessPct: pct(updated.worstLineExcessPct),
        reasons,
        breaches,
        chain: toStepViews(updated.approvalSteps),
        history: toHistory(updated.decisions),
        canAct: computeCanAct(actor, updated, actorUserId),
      };
    });
  }
}

let instance: ApprovalUiService | undefined;

export function getApprovalUiService(): ApprovalUiService {
  return (instance ??= new ApprovalUiService());
}
