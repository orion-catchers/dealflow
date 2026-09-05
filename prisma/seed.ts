import "dotenv/config";

import { atharvaFixtures, type DealFixture } from "@/fixtures/atharva";
import { harshFixtures } from "@/fixtures/harsh";
import { krishnaFixtures } from "@/fixtures/krishna";
import { ruchirFixtures } from "@/fixtures/ruchir";
import { hashPassword } from "@/lib/auth/password";
import { prisma, type Db as PrismaClient } from "@/lib/db";
import {
  buildSeedCatalog,
  expandAllDeals,
  runDemoAssertions,
} from "./seed/deals";
import { SymbolResolver } from "./seed/resolver";

async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await userTables(prisma);
  if (tables.length === 0) {
    return;
  }
  const tableList = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

async function userTables(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;
  return rows.map((row) => row.table_name);
}

async function printCounts(prisma: PrismaClient): Promise<void> {
  for (const table of await userTables(prisma)) {
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}"`,
    );
    console.log(`${table}\t${count}`);
  }
  console.log("Seed complete");
}

async function main(): Promise<void> {
  const resolver = new SymbolResolver();
  const seedTime = new Date();

  await truncateAll(prisma);

  const passwordHash = await hashPassword("password123");

  for (const team of harshFixtures.salesTeams) {
    const row = await prisma.salesTeam.create({
      data: { name: team.name },
    });
    resolver.register(team.sym, row.id);
  }

  for (const user of ruchirFixtures.users) {
    const row = await prisma.user.create({
      data: {
        email: user.email,
        passwordHash,
        name: user.name,
        role: user.role,
        status: user.status,
        teamId: "team" in user && user.team ? resolver.resolve(user.team) : null,
      },
    });
    resolver.register(user.sym, row.id);
  }

  for (const plan of ruchirFixtures.subscriptionPlans) {
    const row = await prisma.subscriptionPlan.create({
      data: {
        code: plan.code,
        name: plan.name,
        interval: plan.interval,
        cancelPolicy: plan.cancelPolicy,
      },
    });
    resolver.register(plan.sym, row.id);
  }

  for (const category of harshFixtures.categories) {
    const row = await prisma.category.create({
      data: { code: category.code, name: category.name },
    });
    resolver.register(category.sym, row.id);
  }

  for (const product of harshFixtures.products) {
    const row = await prisma.product.create({
      data: {
        sku: product.sku,
        name: product.name,
        categoryId: resolver.resolve(product.category),
        unit: product.unit,
        taxPct: product.taxPct,
        basePrice: product.basePrice,
        baseCost: product.baseCost,
        stockTracked: product.stockTracked,
        defaultPlanId:
          "defaultPlan" in product && product.defaultPlan
            ? resolver.resolve(product.defaultPlan)
            : null,
      },
    });
    resolver.register(product.sym, row.id);
  }

  for (const variant of harshFixtures.variants) {
    const row = await prisma.variant.create({
      data: {
        productId: resolver.resolve(variant.product),
        sku: variant.sku,
        name: variant.name,
        extraPrice: variant.extraPrice,
        cost: variant.cost,
      },
    });
    resolver.register(variant.sym, row.id);
  }

  for (const priceList of harshFixtures.priceLists) {
    const row = await prisma.priceList.create({
      data: {
        code: priceList.code,
        name: priceList.name,
        currency: priceList.currency,
      },
    });
    resolver.register(priceList.sym, row.id);
  }

  for (const rule of harshFixtures.priceRules) {
    await prisma.priceRule.create({
      data: {
        priceListId: resolver.resolve(rule.priceList),
        productId: resolver.resolve(rule.product),
        variantId:
          "variant" in rule && rule.variant ? resolver.resolve(rule.variant) : null,
        tier: rule.tier,
        currency: rule.currency,
        unitPrice: rule.unitPrice,
      },
    });
  }

  for (const policy of atharvaFixtures.policyVersions) {
    const row = await prisma.policyVersion.create({
      data: {
        name: policy.name,
        createdById: resolver.resolve(policy.createdBy),
        anyExcessRequiresManager: policy.anyExcessRequiresManager,
        managerWorstExcessPct: policy.managerWorstExcessPct,
        managerWeightedExcessPct: policy.managerWeightedExcessPct,
        financeWorstExcessPct: policy.financeWorstExcessPct,
        financeWeightedExcessPct: policy.financeWeightedExcessPct,
        totalDiscountBudgetPct: policy.totalDiscountBudgetPct,
      },
    });
    resolver.register(policy.sym, row.id);

    for (const ceiling of policy.tierCeilings) {
      await prisma.policyTierCeiling.create({
        data: {
          policyVersionId: row.id,
          tier: ceiling.tier as "STANDARD" | "SILVER" | "GOLD" | "PLATINUM",
          ceilingPct: ceiling.ceilingPct,
        },
      });
    }

    for (const ceiling of policy.categoryCeilings) {
      await prisma.policyCategoryCeiling.create({
        data: {
          policyVersionId: row.id,
          tier: ceiling.tier as "STANDARD" | "SILVER" | "GOLD" | "PLATINUM",
          categoryId: resolver.resolve(ceiling.category),
          ceilingPct: ceiling.ceilingPct,
        },
      });
    }

    for (const step of policy.chain) {
      await prisma.policyChainStep.create({
        data: {
          policyVersionId: row.id,
          stepIndex: step.stepIndex,
          role: step.role as "SALES_MANAGER" | "FINANCE",
        },
      });
    }
  }

  await prisma.healthSettings.create({
    data: { id: atharvaFixtures.healthSettings.id },
  });

  for (const customer of harshFixtures.customers) {
    const row = await prisma.customer.create({
      data: {
        name: customer.name,
        contactName: customer.contactName,
        contactEmail: customer.contactEmail,
        discountTier: customer.discountTier,
        priceListId: resolver.resolve(customer.priceList),
        assignedRepId: resolver.resolve(customer.assignedRep),
        teamId: resolver.resolve(customer.team),
      },
    });
    resolver.register(customer.sym, row.id);
  }

  for (const membership of ruchirFixtures.customerMemberships) {
    await prisma.customerMembership.create({
      data: {
        userId: resolver.resolve(membership.user),
        customerId: resolver.resolve(membership.customer),
      },
    });
  }

  for (const warehouse of harshFixtures.warehouses) {
    const row = await prisma.warehouse.create({
      data: {
        code: warehouse.code,
        name: warehouse.name,
        shippingCost: warehouse.shippingCost,
      },
    });
    resolver.register(warehouse.sym, row.id);
  }

  for (const stock of harshFixtures.stock) {
    await prisma.stock.create({
      data: {
        warehouseId: resolver.resolve(stock.warehouse),
        variantId: resolver.resolve(stock.variant),
        onHand: stock.onHand,
        reserved: stock.reserved,
        reorderAt: stock.reorderAt,
      },
    });
  }

  for (const rule of krishnaFixtures.recommendationRules) {
    await prisma.recommendationRule.create({
      data: {
        baseProductId: resolver.resolve(rule.base),
        candidateProductId: resolver.resolve(rule.candidate),
        copurchaseScore: rule.copurchaseScore,
        promotionTag: rule.promotionTag,
        minMarginPct: rule.minMarginPct,
      },
    });
  }

  const catalog = buildSeedCatalog(
    resolver,
    resolver.resolve("policy-v1"),
  );
  runDemoAssertions(catalog);

  const allDeals: DealFixture[] = [
    ...atharvaFixtures.historicalDeals,
    ...atharvaFixtures.openQuotes,
  ];
  const dealResults = await expandAllDeals(
    prisma,
    resolver,
    catalog,
    allDeals,
    seedTime,
  );

  for (const message of krishnaFixtures.portalMessages) {
    const deal = dealResults.get(message.quote);
    if (!deal) {
      throw new Error(`Missing deal for portal message quote ${message.quote}`);
    }
    const lineId = deal.lineIdsByProduct.get(message.lineProduct);
    if (!lineId) {
      throw new Error(
        `Missing line for product ${message.lineProduct} on ${message.quote}`,
      );
    }
    await prisma.portalMessage.create({
      data: {
        quoteId: deal.quoteId,
        baseRevisionId: deal.revisionId,
        lineId,
        authorId: resolver.resolve(message.author),
        body: message.body,
        status: "OPEN",
      },
    });
  }

  for (const reply of krishnaFixtures.portalReplies) {
    const deal = dealResults.get(reply.quote);
    if (!deal) {
      throw new Error(`Missing deal for portal reply quote ${reply.quote}`);
    }
    await prisma.portalMessage.create({
      data: {
        quoteId: deal.quoteId,
        baseRevisionId: deal.revisionId,
        authorId: resolver.resolve(reply.author),
        body: reply.body,
        status: "OPEN",
      },
    });
  }

  await printCounts(prisma);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
