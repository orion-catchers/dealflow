import type {
  HealthEvaluation,
  HealthFlag,
  HealthSettings,
  HealthTask,
} from "@/contracts/atharva";
import type { Actor as SessionActor } from "@/contracts/harsh";
import type { QuoteStage } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { ApiFailure } from "@/lib/api/respond";
import { prisma, type Db } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { prismaUserIdForActor } from "@/server/lib/auth/resolve-user";
import { recordPrismaAudit } from "@/server/audit/prisma-repository";
import { PrismaInventoryStore } from "@/server/inventory/prisma-inventory";
import { summarizeLines, totalUnits } from "@/server/inventory/engine/status";
import {
  findHealthCandidates,
  type HealthEvaluationInput,
  type HealthQuoteInput,
} from "./deal-health";
import { toContractFlagType, toDbFlagType } from "./flag-type";

const READ_ROLES = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"] as const;

function quoteStage(stage: QuoteStage): HealthQuoteInput["stage"] {
  return stage;
}

function weightedEffectiveDiscount(
  lines: Array<{ unitPrice: unknown; quantity: number; effectiveDiscountPct: unknown }>,
): string {
  let undiscounted = 0;
  let discounted = 0;
  for (const line of lines) {
    const amount = Number(line.unitPrice) * line.quantity;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    undiscounted += amount;
    discounted += (amount * Number(line.effectiveDiscountPct ?? 0)) / 100;
  }
  if (undiscounted <= 0) return "0";
  return ((discounted / undiscounted) * 100).toFixed(2);
}

export class LiveHealthService {
  constructor(private readonly db: Db = prisma) {}

  async list(actor: SessionActor): Promise<HealthEvaluation> {
    requireRole(actor, ...READ_ROLES);
    return this.view(actor);
  }

  async refresh(actor: SessionActor): Promise<HealthEvaluation> {
    requireRole(actor, ...READ_ROLES);
    const input = await this.liveInput(actor);
    const candidates = findHealthCandidates(input);
    const now = new Date(input.now);
    const scope = await this.flagScope(actor);
    const existing = await this.db.healthFlag.findMany({ where: scope });
    const active = new Set(candidates.map((candidate) => candidate.fingerprint));

    for (const flag of existing) {
      if (active.has(flag.fingerprint)) {
        if (flag.resolvedAt) {
          const match = candidates.find((candidate) => candidate.fingerprint === flag.fingerprint)!;
          await this.db.healthFlag.update({
            where: { id: flag.id },
            data: { resolvedAt: null, reason: match.reason, detectedAt: now },
          });
        }
        continue;
      }
      if (!flag.resolvedAt) {
        await this.db.healthFlag.update({
          where: { id: flag.id },
          data: { resolvedAt: now },
        });
      }
    }

    for (const candidate of candidates) {
      if (existing.some((flag) => flag.fingerprint === candidate.fingerprint)) continue;
      await this.db.healthFlag.create({
        data: {
          type: toDbFlagType(candidate.type),
          fingerprint: candidate.fingerprint,
          quoteId: candidate.quoteId ?? null,
          orderId: candidate.orderId ?? null,
          reason: candidate.reason,
          detectedAt: now,
        },
      });
    }

    await recordPrismaAudit(this.db, {
      entityType: "HealthFlag",
      entityId: "refresh",
      action: "HEALTH_REFRESHED",
      metadata: { candidateCount: candidates.length },
    });
    return this.view(actor);
  }

  async createTask(input: {
    actor: SessionActor;
    flagId: string;
    action: "NUDGE" | "ESCALATE";
    assigneeId: string;
    dueDate: string;
  }): Promise<HealthTask> {
    requireRole(input.actor, ...READ_ROLES);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw new ApiFailure("INVALID_INPUT", "A valid assignee and date are required.");
    }
    const flag = await this.db.healthFlag.findFirst({
      where: { id: input.flagId, ...(await this.flagScope(input.actor)) },
    });
    if (!flag || flag.resolvedAt) throw new ApiFailure("NOT_FOUND", "Active health flag was not found.");
    const dealId = flag.quoteId ?? flag.orderId;
    if (!dealId) throw new ApiFailure("INVALID_INPUT", "Health flag has no linked deal.");
    const actorId = await prismaUserIdForActor(input.actor);
    if (!actorId) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user.");
    const assigneeId = (await prismaUserIdForActor({
      id: input.assigneeId,
      role: "SALES_REP",
      active: true,
    })) ?? input.assigneeId;
    const assignee = await this.db.user.findUnique({ where: { id: assigneeId } });
    if (!assignee) throw new ApiFailure("INVALID_INPUT", "A valid assignee and date are required.");
    const actionKey = `${input.action}:${flag.id}:${assigneeId}`;
    const existing = await this.db.task.findUnique({ where: { actionKey } });
    if (existing) return this.toTask(existing);
    const task = await this.db.task.create({
      data: {
        actionKey,
        flagId: flag.id,
        quoteId: flag.quoteId,
        orderId: flag.orderId,
        assigneeId,
        createdById: actorId,
        action: input.action,
        dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
      },
    });
    await recordPrismaAudit(this.db, {
      entityType: "Task",
      entityId: task.id,
      actorId,
      action: "HEALTH_TASK_CREATED",
      metadata: { flagId: flag.id, dealId, action: input.action },
    });
    return this.toTask(task);
  }

  private async view(actor: SessionActor): Promise<HealthEvaluation> {
    const scope = await this.flagScope(actor);
    const [settingsRow, flags, tasks] = await Promise.all([
      this.settings(),
      this.db.healthFlag.findMany({ where: scope, orderBy: { detectedAt: "desc" } }),
      this.db.task.findMany({ where: await this.dealScope(actor), orderBy: { createdAt: "desc" } }),
    ]);
    return {
      flags: flags.map((flag) => this.toFlag(flag)),
      tasks: tasks.map((task) => this.toTask(task)),
      settings: settingsRow,
    };
  }

  private async settings(): Promise<HealthSettings> {
    const row = await this.db.healthSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
    return {
      stalledAfterDays: row.stalledAfterDays,
      anomalyMinimumSamples: row.anomalyMinSamples,
      anomalyMarginAboveAveragePct: row.anomalyExcessPoints.toString(),
    };
  }

  private async liveInput(actor: SessionActor): Promise<HealthEvaluationInput> {
    const settings = await this.settings();
    const now = new Date().toISOString();
    const quoteWhere = await this.quoteScope(actor);
    const quotes = await this.db.quote.findMany({
      where: quoteWhere,
      include: {
        currentRevision: { include: { lines: true } },
        revisions: { include: { lines: true }, orderBy: { revisionNumber: "desc" }, take: 1 },
      },
    });
    const confirmed = quotes.filter((quote) => quote.stage === "CONFIRMED");
    const quoteInputs: HealthQuoteInput[] = quotes.map((quote) => {
      const revision = quote.currentRevision ?? quote.revisions[0];
      const comparable = confirmed
        .filter((other) => other.repId === quote.repId && other.id !== quote.id && other.currentRevision)
        .map((other) => ({
          quoteId: other.id,
          confirmedAt: other.lastActivityAt.toISOString(),
          effectiveDiscountPct: weightedEffectiveDiscount(other.currentRevision!.lines),
        }));
      return {
        quoteId: quote.id,
        stage: quoteStage(quote.stage),
        lastBusinessActivityAt: quote.lastActivityAt.toISOString(),
        currentEffectiveDiscountPct: weightedEffectiveDiscount(revision?.lines ?? []),
        salesRepId: quote.repId,
        comparableConfirmedDiscounts: comparable,
      };
    });

    const orders = await this.db.order.findMany({
      where: { sourceRevision: { quote: quoteWhere } },
      include: { invoices: true, lines: { include: { product: true, variant: true } }, customer: true },
    });
    const store = new PrismaInventoryStore(this.db);
    const orderInputs = [];
    for (const order of orders) {
      const record = await store.getFulfillment(order.id);
      if (!record) continue;
      const [reservations, backorders, shipments] = await Promise.all([
        store.listReservations(order.id),
        store.listBackorders({ orderId: order.id }),
        store.listShipments(order.id),
      ]);
      const totals = totalUnits(summarizeLines(record.order, reservations, backorders, shipments));
      const liveInvoices = order.invoices.filter((invoice) => invoice.status !== "VOID");
      const paid =
        liveInvoices.length > 0 && liveInvoices.every((invoice) => invoice.status === "PAID");
      orderInputs.push({
        orderId: order.id,
        promisedDate: order.promisedDate?.toISOString().slice(0, 10),
        undeliveredGoodsQty: Math.max(0, totals.stockTrackedUnits - totals.deliveredUnits),
        unallocatedGoodsQty: totals.unallocatedUnits,
        paid,
      });
    }

    return { quotes: quoteInputs, orders: orderInputs, settings, now };
  }

  private async quoteScope(actor: SessionActor): Promise<Prisma.QuoteWhereInput> {
    if (actor.role === "SALES_REP") {
      const id = await prismaUserIdForActor(actor);
      if (!id) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user.");
      return { repId: id };
    }
    if (actor.role === "SALES_MANAGER") {
      const id = await prismaUserIdForActor(actor);
      if (!id) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user.");
      const user = await this.db.user.findUnique({ where: { id }, select: { teamId: true } });
      if (!user?.teamId) return {};
      return { teamId: user.teamId };
    }
    return {};
  }

  private async dealScope(actor: SessionActor): Promise<Prisma.HealthFlagWhereInput & Prisma.TaskWhereInput> {
    const quote = await this.quoteScope(actor);
    if (Object.keys(quote).length === 0) return {};
    return { OR: [{ quote }, { order: { sourceRevision: { quote } } }] };
  }

  private async flagScope(actor: SessionActor): Promise<Prisma.HealthFlagWhereInput> {
    return this.dealScope(actor);
  }

  private toFlag(flag: {
    id: string;
    type: "STALLED" | "DISCOUNT_ANOMALY" | "DELIVERY_RISK";
    quoteId: string | null;
    orderId: string | null;
    reason: string;
    detectedAt: Date;
    resolvedAt: Date | null;
  }): HealthFlag {
    return {
      id: flag.id,
      type: toContractFlagType(flag.type),
      status: flag.resolvedAt ? "RESOLVED" : "ACTIVE",
      quoteId: flag.quoteId ?? undefined,
      orderId: flag.orderId ?? undefined,
      reason: flag.reason,
      detectedAt: flag.detectedAt.toISOString(),
      resolvedAt: flag.resolvedAt?.toISOString(),
    };
  }

  private toTask(task: {
    id: string;
    flagId: string;
    quoteId: string | null;
    orderId: string | null;
    assigneeId: string;
    status: string;
    dueDate: Date;
    action: string;
  }): HealthTask {
    return {
      id: task.id,
      healthFlagId: task.flagId,
      dealId: task.quoteId ?? task.orderId ?? task.flagId,
      assigneeId: task.assigneeId,
      status: task.status === "OPEN" ? "OPEN" : "DONE",
      dueDate: task.dueDate.toISOString().slice(0, 10),
      action: task.action === "ESCALATE" ? "ESCALATE" : "NUDGE",
    };
  }
}

let instance: LiveHealthService | undefined;
export function getLiveHealthService(): LiveHealthService {
  return (instance ??= new LiveHealthService());
}
