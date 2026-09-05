/**
 * Prisma ReportRepository — projects stored Quote / QuoteRevision / Order rows into
 * `ReportQuoteRecord`. Reports never recompute pricing or policy; they flatten persisted
 * totals and line snapshots.
 */
import type { ProductCategory, ReportLineRecord, ReportQuoteRecord, SalesTeam } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import {
  categoryFromCode,
  currencyOf,
  isoOf,
  moneyOf,
  pctOf,
  publicCustomerId,
  publicUserId,
  toSalesTeam,
} from "@/server/lib/db/map";
import type { ReportProductInfo, ReportRepInfo, ReportRepository } from "./repository";

type QuoteStage = ReportQuoteRecord["stage"];
type ApprovalStatus = ReportQuoteRecord["approvalStatus"];

function asStage(stage: string): QuoteStage {
  const allowed: QuoteStage[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "UNDER_NEGOTIATION", "CONFIRMED", "REJECTED"];
  return (allowed as string[]).includes(stage) ? (stage as QuoteStage) : "DRAFT";
}

function asApproval(status: string): ApprovalStatus {
  const allowed: ApprovalStatus[] = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "SUPERSEDED"];
  return (allowed as string[]).includes(status) ? (status as ApprovalStatus) : "NOT_REQUIRED";
}

function approvalLevel(risk: string): ReportQuoteRecord["requiredApprovalLevel"] {
  if (risk === "FINANCE") return "MANAGER_FINANCE";
  if (risk === "MANAGER") return "MANAGER";
  return "NONE";
}

function quoteNumber(quoteId: string, revisionNumber: number): string {
  const tail = quoteId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "000000";
  return `Q-${tail}-R${revisionNumber}`;
}

function weightedDiscount(lines: { lineSubtotal: unknown; effectiveDiscountPct: unknown }[], orderDiscountPct: unknown): number {
  let num = 0;
  let den = 0;
  for (const l of lines) {
    const sub = Number(l.lineSubtotal);
    if (!Number.isFinite(sub) || sub <= 0) continue;
    den += sub;
    num += sub * pctOf(l.effectiveDiscountPct);
  }
  if (den > 0) return Math.round((num / den) * 10) / 10;
  return Math.round(pctOf(orderDiscountPct) * 10) / 10;
}

export class PrismaReportRepository implements ReportRepository {
  async listQuoteRecords(): Promise<ReportQuoteRecord[]> {
    const quotes = await prisma.quote.findMany({
      include: {
        customer: true,
        rep: true,
        currentRevision: {
          include: {
            lines: { include: { product: true, category: true }, orderBy: { position: "asc" } },
            order: { select: { id: true, createdAt: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const out: ReportQuoteRecord[] = [];
    for (const q of quotes) {
      const rev = q.currentRevision;
      if (!rev) continue;
      const lines: ReportLineRecord[] = rev.lines.map((l) => ({
        productId: l.productId,
        productName: l.product.name,
        category: categoryFromCode(l.category.code),
        variantId: l.variantId ?? undefined,
        quantity: l.quantity,
        unitPrice: moneyOf(l.unitPrice),
        unitCost: moneyOf(l.unitCost),
        effectiveDiscountPct: pctOf(l.effectiveDiscountPct),
        netAmount: moneyOf(l.lineSubtotal),
        isRecurring: l.billingKind === "RECURRING",
      }));
      const monthly =
        Number(rev.recurringMonthly) + Number(rev.recurringQuarterly) / 3 + Number(rev.recurringYearly) / 12;
      out.push({
        quoteId: q.id,
        quoteNumber: quoteNumber(q.id, rev.revisionNumber),
        customerId: publicCustomerId(q.customer),
        customerName: q.customer.name,
        repId: publicUserId(q.rep),
        repName: q.rep.name,
        teamId: q.teamId ?? undefined,
        stage: asStage(q.stage),
        approvalStatus: asApproval(rev.approvalStatus),
        requiredApprovalLevel: approvalLevel(rev.riskLevel),
        currency: currencyOf(rev.currency),
        oneTimeTotal: moneyOf(rev.oneTimeTotal),
        monthlyRecurringTotal: moneyOf(monthly),
        weightedDiscountPct: weightedDiscount(rev.lines, rev.orderDiscountPct),
        createdAt: isoOf(q.createdAt),
        confirmedAt: rev.order ? isoOf(rev.order.createdAt) : undefined,
        orderId: rev.order?.id,
        lines,
      });
    }
    return out;
  }

  async listTeams(): Promise<SalesTeam[]> {
    const rows = await prisma.salesTeam.findMany({ include: { members: true }, orderBy: { name: "asc" } });
    return rows.map(toSalesTeam);
  }

  async listReps(): Promise<ReportRepInfo[]> {
    const rows = await prisma.user.findMany({
      where: { role: "SALES_REP" },
      include: { team: true },
      orderBy: { name: "asc" },
    });
    return rows.map((u) => ({
      id: publicUserId(u),
      name: u.name,
      teamId: u.teamId ?? undefined,
    }));
  }

  async listProducts(): Promise<ReportProductInfo[]> {
    const rows = await prisma.product.findMany({ include: { category: true }, orderBy: { name: "asc" } });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: categoryFromCode(p.category.code),
    }));
  }
}
