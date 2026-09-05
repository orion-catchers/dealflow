import type { DiscountTier, Role } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/contracts/harsh";
import type { PolicySnapshot } from "@/contracts/atharva";
import { ApiFailure } from "@/lib/api/respond";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { recordPrismaAudit } from "@/server/audit/prisma-repository";

type Client = Db | Tx;
type PolicyRow = Prisma.PolicyVersionGetPayload<{
  include: {
    policyCeilings: { include: { category: true } };
    chainSteps: true;
  };
}>;

const POLICY_INCLUDE = {
  policyCeilings: { include: { category: true } },
  chainSteps: { orderBy: { stepIndex: "asc" as const } },
} as const;

const INTERNAL_CHAIN_ROLES = ["SALES_MANAGER", "FINANCE"] as const;

function tierName(tier: DiscountTier): string {
  return tier[0] + tier.slice(1).toLowerCase();
}

export function snapshotForTier(row: PolicyRow, tier: DiscountTier): PolicySnapshot {
  const tierCeiling = row.policyCeilings.find((item) => item.tier === tier && item.categoryId === null);
  if (!tierCeiling) {
    throw new ApiFailure("INVALID_INPUT", `Published policy has no ${tier} tier ceiling.`);
  }

  const categoryCeilings: Record<string, string> = {};
  for (const item of row.policyCeilings) {
    if (item.tier !== tier || item.categoryId === null || !item.category) continue;
    categoryCeilings[item.category.name] = item.ceilingPct.toString();
    categoryCeilings[item.category.code] = item.ceilingPct.toString();
  }

  return {
    policyVersionId: row.id,
    capturedAt: row.createdAt.toISOString(),
    rules: {
      tierId: tier,
      tierName: tierName(tier),
      defaultCeilingPct: tierCeiling.ceilingPct.toString(),
      categoryCeilingsPct: categoryCeilings,
      managerThresholdPct: row.managerWorstExcessPct.toString(),
      financeWorstLineThresholdPct: row.financeWorstExcessPct.toString(),
      financeWeightedThresholdPct: row.financeWeightedExcessPct.toString(),
      totalDiscountBudgetPct: row.totalDiscountBudgetPct?.toString(),
      minimumHistorySamples: 3,
    },
  };
}

function view(row: PolicyRow) {
  const gold = snapshotForTier(row, "GOLD");
  return {
    policyVersionId: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    rules: gold.rules,
    tierCeilings: row.policyCeilings.filter((item) => item.categoryId === null).map((item) => ({
      tier: item.tier,
      ceilingPct: item.ceilingPct.toString(),
    })),
    categoryCeilings: row.policyCeilings.filter((item) => item.categoryId !== null && item.category).map((item) => ({
      tier: item.tier,
      categoryId: item.categoryId,
      categoryCode: item.category!.code,
      categoryName: item.category!.name,
      ceilingPct: item.ceilingPct.toString(),
    })),
    chain: row.chainSteps.map((item) => ({
      stepIndex: item.stepIndex,
      role: item.role,
    })),
    thresholds: {
      anyExcessRequiresManager: row.anyExcessRequiresManager,
      managerWorstExcessPct: row.managerWorstExcessPct.toString(),
      managerWeightedExcessPct: row.managerWeightedExcessPct.toString(),
      financeWorstExcessPct: row.financeWorstExcessPct.toString(),
      financeWeightedExcessPct: row.financeWeightedExcessPct.toString(),
      totalDiscountBudgetPct: row.totalDiscountBudgetPct?.toString() ?? null,
    },
  };
}

async function latest(db: Client): Promise<PolicyRow> {
  const row = await db.policyVersion.findFirst({
    include: POLICY_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new ApiFailure("INVALID_INPUT", "No published policy version exists.");
  return row;
}

function decimalInput(value: unknown, field: string, optional = false): Prisma.Decimal | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === null && optional) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ApiFailure("INVALID_INPUT", `${field} must be between 0 and 100.`);
  }
  return new Prisma.Decimal(String(value));
}

function findInput<T extends Record<string, unknown>>(items: unknown, predicate: (item: T) => boolean): T | undefined {
  if (!Array.isArray(items)) return undefined;
  return items.find((item): item is T => Boolean(item) && typeof item === "object" && predicate(item as T));
}

export class LivePolicyService {
  constructor(private readonly db: Client = prisma) {}

  async get(actor: Actor) {
    requireRole(actor, "ADMIN", "SALES_MANAGER", "SALES_REP");
    return view(await latest(this.db));
  }

  async snapshotForTier(tier: DiscountTier, db: Client = this.db): Promise<PolicySnapshot> {
    return snapshotForTier(await latest(db), tier);
  }

  async publish(actor: Actor, raw: unknown) {
    requireRole(actor, "ADMIN", "SALES_MANAGER");
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const actorId = await this.resolveActor(actor);
    return this.db.$transaction(async (tx) => {
      const previous = await latest(tx);
      const legacyRules = body.rules && typeof body.rules === "object"
        ? body.rules as Record<string, unknown>
        : body;
      const tierCeilings = previous.policyCeilings.filter((item) => item.categoryId === null).map((item) => {
        const patch = findInput<Record<string, unknown>>(body.tierCeilings, (x) => x.tier === item.tier);
        const legacy = item.tier === "GOLD" ? legacyRules.defaultCeilingPct : undefined;
        return {
          tier: item.tier,
          ceilingPct: decimalInput(patch?.ceilingPct ?? legacy ?? item.ceilingPct.toString(), `${item.tier} ceiling`)!,
        };
      });
      const categoryCeilings = previous.policyCeilings.filter((item) => item.categoryId !== null && item.category).map((item) => {
        const patch = findInput<Record<string, unknown>>(body.categoryCeilings, (x) =>
          x.categoryId === item.categoryId || x.categoryCode === item.category!.code || x.categoryName === item.category!.name,
        );
        return {
          tier: item.tier,
          categoryId: item.categoryId,
          ceilingPct: decimalInput(patch?.ceilingPct ?? item.ceilingPct.toString(), `${item.category!.code} ceiling`)!,
        };
      });
      const chain = Array.isArray(body.chain)
        ? body.chain.map((step, index) => {
            const item = step as Record<string, unknown>;
            const role = item.role;
            if (!INTERNAL_CHAIN_ROLES.includes(role as typeof INTERNAL_CHAIN_ROLES[number])) {
              throw new ApiFailure("INVALID_INPUT", "Approval chain roles must be SALES_MANAGER or FINANCE.");
            }
            return { stepIndex: Number(item.stepIndex ?? index), role: role as Role };
          })
        : previous.chainSteps.map((step) => ({ stepIndex: step.stepIndex, role: step.role }));
      const uniqueSteps = new Set(chain.map((step) => step.stepIndex));
      if (uniqueSteps.size !== chain.length || chain.some((step) => step.stepIndex < 0)) {
        throw new ApiFailure("INVALID_INPUT", "Approval chain step indexes must be unique and nonnegative.");
      }
      const thresholds = body.thresholds && typeof body.thresholds === "object"
        ? body.thresholds as Record<string, unknown>
        : legacyRules;
      const row = await tx.policyVersion.create({
        data: {
          name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${previous.name} (published)`,
          createdById: actorId,
          anyExcessRequiresManager: Boolean(thresholds.anyExcessRequiresManager ?? previous.anyExcessRequiresManager),
          managerWorstExcessPct: decimalInput(thresholds.managerWorstExcessPct ?? thresholds.managerThresholdPct ?? previous.managerWorstExcessPct.toString(), "Manager worst-line threshold")!,
          managerWeightedExcessPct: decimalInput(thresholds.managerWeightedExcessPct ?? previous.managerWeightedExcessPct.toString(), "Manager weighted threshold")!,
          financeWorstExcessPct: decimalInput(thresholds.financeWorstExcessPct ?? thresholds.financeWorstLineThresholdPct ?? previous.financeWorstExcessPct.toString(), "Finance worst-line threshold")!,
          financeWeightedExcessPct: decimalInput(thresholds.financeWeightedExcessPct ?? thresholds.financeWeightedThresholdPct ?? previous.financeWeightedExcessPct.toString(), "Finance weighted threshold")!,
          totalDiscountBudgetPct: decimalInput(
            thresholds.totalDiscountBudgetPct ?? thresholds.budget ?? previous.totalDiscountBudgetPct?.toString(),
            "Total discount budget",
            true,
          ),
          policyCeilings: { create: [...tierCeilings, ...categoryCeilings] },
          chainSteps: { create: chain },
        },
        include: POLICY_INCLUDE,
      });
      await recordPrismaAudit(tx, {
        entityType: "PolicyVersion",
        entityId: row.id,
        actorId,
        action: "POLICY_PUBLISHED",
        metadata: { previousPolicyVersionId: previous.id },
      });
      return view(row);
    });
  }

  private async resolveActor(actor: Actor): Promise<string> {
    const { prismaUserIdForActor } = await import("@/server/lib/auth/resolve-user");
    const id = await prismaUserIdForActor(actor);
    if (!id) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user.");
    return id;
  }
}

let instance: LivePolicyService | undefined;
export function getLivePolicyService(): LivePolicyService {
  return (instance ??= new LivePolicyService());
}
