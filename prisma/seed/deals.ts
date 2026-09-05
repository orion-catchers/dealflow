import {
  atharvaFixtures,
  type DealFixture,
  type DealLine,
  type DealOutcome,
} from "@/fixtures/atharva";
import { harshFixtures } from "@/fixtures/harsh";
import { ruchirFixtures } from "@/fixtures/ruchir";
import {
  Prisma,
  type PrismaClient,
  type QuoteStage,
  type RevisionApprovalStatus,
} from "@/generated/prisma/client";
import {
  assertDemoTotals,
  evaluateRevision,
  type CategoryCeiling,
  type EvaluatedLineInput,
  type TierCeiling,
} from "./math";
import { SymbolResolver } from "./resolver";

type Db = PrismaClient | Prisma.TransactionClient;

type ProductMeta = {
  sym: string;
  categorySym: string;
  taxPct: string;
  stockTracked: boolean;
  defaultPlanSym?: string;
  basePrice: string;
};

type VariantMeta = {
  sym: string;
  productSym: string;
  extraPrice: string;
  cost: string;
};

type PlanMeta = {
  sym: string;
  interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
  cancelPolicy: "IMMEDIATE" | "PERIOD_END";
};

type CustomerMeta = {
  sym: string;
  discountTier: string;
  priceListSym: string;
  portalUserSym?: string;
};

type PolicyMeta = {
  sym: string;
  id: string;
  tierCeilings: TierCeiling[];
  categoryCeilings: CategoryCeiling[];
  chain: { stepIndex: number; role: string }[];
  thresholds: {
    managerWorstExcessPct: string;
    managerWeightedExcessPct: string;
    financeWorstExcessPct: string;
    financeWeightedExcessPct: string;
  };
};

export type SeedCatalog = {
  products: Map<string, ProductMeta>;
  variants: Map<string, VariantMeta>;
  plans: Map<string, PlanMeta>;
  planById: Map<string, PlanMeta>;
  customers: Map<string, CustomerMeta>;
  priceRules: readonly {
    priceList: string;
    product: string;
    variant?: string;
    tier: string;
    currency: string;
    unitPrice: string;
  }[];
  policy: PolicyMeta;
};

export function buildSeedCatalog(resolver: SymbolResolver, policyId: string): SeedCatalog {
  const products = new Map<string, ProductMeta>();
  for (const product of harshFixtures.products) {
    products.set(product.sym, {
      sym: product.sym,
      categorySym: product.category,
      taxPct: product.taxPct,
      stockTracked: product.stockTracked,
      defaultPlanSym:
        "defaultPlan" in product ? product.defaultPlan : undefined,
      basePrice: product.basePrice,
    });
  }

  const variants = new Map<string, VariantMeta>();
  for (const variant of harshFixtures.variants) {
    variants.set(variant.sym, {
      sym: variant.sym,
      productSym: variant.product,
      extraPrice: variant.extraPrice,
      cost: variant.cost,
    });
  }

  const plans = new Map<string, PlanMeta>();
  for (const plan of ruchirFixtures.subscriptionPlans) {
    plans.set(plan.sym, {
      sym: plan.sym,
      interval: plan.interval,
      cancelPolicy: plan.cancelPolicy,
    });
  }

  const customers = new Map<string, CustomerMeta>();
  for (const customer of harshFixtures.customers) {
    const membership = ruchirFixtures.customerMemberships.find(
      (row) => row.customer === customer.sym,
    );
    customers.set(customer.sym, {
      sym: customer.sym,
      discountTier: customer.discountTier,
      priceListSym: customer.priceList,
      portalUserSym: membership?.user,
    });
  }

  const planById = new Map<string, PlanMeta>();
  for (const [sym, meta] of plans) {
    planById.set(resolver.resolve(sym), meta);
  }

  const policyFixture = atharvaFixtures.policyVersions[0]!;
  return {
    products,
    variants,
    plans,
    planById,
    customers,
    priceRules: harshFixtures.priceRules as SeedCatalog["priceRules"],
    policy: {
      sym: policyFixture.sym,
      id: policyId,
      tierCeilings: policyFixture.tierCeilings.map((row) => ({
        tier: row.tier,
        ceilingPct: row.ceilingPct,
      })),
      categoryCeilings: policyFixture.categoryCeilings.map((row) => ({
        tier: row.tier,
        categorySym: row.category,
        ceilingPct: row.ceilingPct,
      })),
      chain: [...policyFixture.chain],
      thresholds: {
        managerWorstExcessPct: policyFixture.managerWorstExcessPct,
        managerWeightedExcessPct: policyFixture.managerWeightedExcessPct,
        financeWorstExcessPct: policyFixture.financeWorstExcessPct,
        financeWeightedExcessPct: policyFixture.financeWeightedExcessPct,
      },
    },
  };
}

function resolveUnitPrice(
  catalog: SeedCatalog,
  customerTier: string,
  priceListSym: string,
  productSym: string,
  variantSym: string,
): string {
  const product = catalog.products.get(productSym);
  const variant = catalog.variants.get(variantSym);
  if (!product || !variant) {
    throw new Error(`Missing catalog entry for ${productSym}/${variantSym}`);
  }

  const specificRule = catalog.priceRules.find(
    (rule) =>
      rule.priceList === priceListSym &&
      rule.product === productSym &&
      rule.variant === variantSym &&
      rule.tier === customerTier,
  );
  if (specificRule) {
    return specificRule.unitPrice;
  }

  const productRule = catalog.priceRules.find(
    (rule) =>
      rule.priceList === priceListSym &&
      rule.product === productSym &&
      !rule.variant &&
      rule.tier === customerTier,
  );
  if (productRule) {
    return new Prisma.Decimal(productRule.unitPrice)
      .plus(variant.extraPrice)
      .toFixed(2);
  }

  return new Prisma.Decimal(product.basePrice).plus(variant.extraPrice).toFixed(2);
}

function lineToEvalInput(
  catalog: SeedCatalog,
  customer: CustomerMeta,
  line: DealLine,
): EvaluatedLineInput {
  const productSym = line.product;
  const variantSym = line.variant ?? `${line.product}-std`;
  const product = catalog.products.get(productSym)!;
  const variant = catalog.variants.get(variantSym)!;
  const unitPrice = resolveUnitPrice(
    catalog,
    customer.discountTier,
    customer.priceListSym,
    productSym,
    variantSym,
  );
  const planSym = product.defaultPlanSym;
  const billingKind = planSym ? ("RECURRING" as const) : ("ONE_TIME" as const);
  const interval = planSym ? catalog.plans.get(planSym)?.interval : undefined;

  return {
    qty: line.qty,
    unitPrice,
    unitCost: variant.cost,
    taxPct: product.taxPct,
    linePct: line.linePct,
    categorySym: product.categorySym,
    billingKind,
    interval,
  };
}

function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() < day) {
    result.setUTCDate(0);
  }
  return result;
}

function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBefore(seedTime: Date, daysAgo: number): Date {
  const result = new Date(seedTime);
  result.setUTCDate(result.getUTCDate() - daysAgo);
  return dateOnly(result);
}

function quoteStageFor(outcome: DealOutcome): QuoteStage {
  switch (outcome) {
    case "DRAFT":
      return "DRAFT";
    case "SENT_NEGOTIATING":
      return "UNDER_NEGOTIATION";
    case "SENT_STALLED":
      return "APPROVED";
    case "CONFIRMED_PAID":
    case "CONFIRMED_UNPAID":
    case "CONFIRMED_PAID_UNDELIVERED":
      return "CONFIRMED";
  }
}

function approvalStatusFor(riskLevel: string): RevisionApprovalStatus {
  return riskLevel === "NONE" ? "NOT_REQUIRED" : "APPROVED";
}

async function writeAudit(
  db: Db,
  resolver: SymbolResolver,
  input: {
    entityType: string;
    entityId: string;
    revisionId?: string;
    actorSym?: string;
    action: string;
    reason?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  },
): Promise<void> {
  await db.auditEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      revisionId: input.revisionId,
      actorId: input.actorSym ? resolver.resolve(input.actorSym) : null,
      action: input.action,
      reason: input.reason ?? null,
      metadata: input.metadata as Prisma.InputJsonValue,
      createdAt: input.createdAt,
    },
  });
}

export async function expandDeal(
  db: Db,
  resolver: SymbolResolver,
  catalog: SeedCatalog,
  deal: DealFixture,
  seedTime: Date,
): Promise<{ quoteId: string; revisionId: string; lineIdsByProduct: Map<string, string> }> {
  const customer = catalog.customers.get(deal.customer)!;
  const totals = evaluateRevision(
    customer.discountTier,
    deal.lines.map((line) => lineToEvalInput(catalog, customer, line)),
    deal.orderPct,
    catalog.policy.tierCeilings,
    catalog.policy.categoryCeilings,
    catalog.policy.thresholds,
  );

  const eventDate = daysBefore(seedTime, deal.daysAgo);
  const teamId = resolver.tryResolve("team-west") ?? null;
  const quote = await db.quote.create({
    data: {
      customerId: resolver.resolve(deal.customer),
      repId: resolver.resolve(deal.rep),
      teamId,
      stage: quoteStageFor(deal.outcome),
      lastActivityAt: eventDate,
      createdAt: eventDate,
      updatedAt: eventDate,
    },
  });

  await writeAudit(db, resolver, {
    entityType: "Quote",
    entityId: quote.id,
    actorSym: deal.rep,
    action: "QUOTE_CREATED",
    metadata: { symbol: deal.sym },
    createdAt: eventDate,
  });

  const revision = await db.quoteRevision.create({
    data: {
      quoteId: quote.id,
      revisionNumber: 1,
      policyVersionId: catalog.policy.id,
      riskLevel: totals.riskLevel,
      weightedExcessPct: totals.weightedExcessPct,
      worstLineExcessPct: totals.worstLineExcessPct,
      evaluationReasons: {
        weightedExcessPct: totals.weightedExcessPct.toFixed(2),
        worstLineExcessPct: totals.worstLineExcessPct.toFixed(2),
        riskLevel: totals.riskLevel,
      },
      approvalStatus: approvalStatusFor(totals.riskLevel),
      orderDiscountPct: deal.orderPct,
      currency: "INR",
      promisedDate:
        deal.outcome === "CONFIRMED_PAID_UNDELIVERED"
          ? daysBefore(seedTime, 3)
          : null,
      oneTimeSubtotal: totals.oneTimeSubtotal,
      oneTimeTax: totals.oneTimeTax,
      oneTimeTotal: totals.oneTimeTotal,
      recurringMonthly: totals.recurringMonthly,
      recurringQuarterly: totals.recurringQuarterly,
      recurringYearly: totals.recurringYearly,
      totalCost: totals.totalCost,
      marginPct: totals.marginPct,
      createdById: resolver.resolve(deal.rep),
      createdAt: eventDate,
    },
  });

  await db.quote.update({
    where: { id: quote.id },
    data: { currentRevisionId: revision.id },
  });

  await writeAudit(db, resolver, {
    entityType: "QuoteRevision",
    entityId: revision.id,
    revisionId: revision.id,
    actorSym: deal.rep,
    action: "REVISION_EVALUATED",
    metadata: {
      riskLevel: totals.riskLevel,
      oneTimeTotal: totals.oneTimeTotal.toFixed(2),
      recurringMonthly: totals.recurringMonthly.toFixed(2),
    },
    createdAt: eventDate,
  });

  const lineIdsByProduct = new Map<string, string>();
  for (let position = 0; position < deal.lines.length; position++) {
    const dealLine = deal.lines[position]!;
    const evaluated = totals.lines[position]!;
    const productSym = dealLine.product;
    const variantSym = dealLine.variant ?? `${dealLine.product}-std`;
    const product = catalog.products.get(productSym)!;
    const planSym = product.defaultPlanSym;
    const planId = planSym ? resolver.resolve(planSym) : null;
    const quoteLine = await db.quoteLine.create({
      data: {
        revisionId: revision.id,
        productId: resolver.resolve(productSym),
        variantId: resolver.resolve(variantSym),
        planId,
        billingKind: evaluated.billingKind,
        interval: evaluated.interval ?? null,
        quantity: evaluated.qty,
        unitPrice: evaluated.unitPrice,
        unitCost: evaluated.unitCost,
        lineDiscountPct: evaluated.lineDiscountPct,
        effectiveDiscountPct: evaluated.effectiveDiscountPct,
        ceilingPct: evaluated.ceilingPct,
        excessPct: evaluated.excessPct,
        excessAmount: evaluated.excessAmount,
        taxPct: evaluated.taxPct,
        lineSubtotal: evaluated.lineSubtotal,
        taxAmount: evaluated.taxAmount,
        lineTotal: evaluated.lineTotal,
        categoryId: resolver.resolve(product.categorySym),
        stockTracked: product.stockTracked,
        position,
        createdAt: eventDate,
      },
    });
    lineIdsByProduct.set(productSym, quoteLine.id);
  }

  if (totals.riskLevel !== "NONE") {
    for (const step of catalog.policy.chain) {
      const needsFinance = totals.riskLevel === "FINANCE";
      if (step.role === "FINANCE" && !needsFinance) {
        continue;
      }
      const actorSym =
        step.role === "SALES_MANAGER" ? "manager-sana" : "finance-farah";
      const decision = await db.approvalDecision.create({
        data: {
          revisionId: revision.id,
          actorId: resolver.resolve(actorSym),
          actorRole: step.role as "SALES_MANAGER" | "FINANCE",
          stepIndex: step.stepIndex,
          kind: "APPROVE",
          reason: `Seed approval for ${deal.sym}`,
          createdAt: eventDate,
        },
      });
      await db.quoteRevisionApprovalStep.create({
        data: {
          revisionId: revision.id,
          stepIndex: step.stepIndex,
          role: step.role as "SALES_MANAGER" | "FINANCE",
          status: "APPROVED",
          decisionId: decision.id,
          createdAt: eventDate,
          updatedAt: eventDate,
        },
      });
      await writeAudit(db, resolver, {
        entityType: "QuoteRevision",
        entityId: revision.id,
        revisionId: revision.id,
        actorSym,
        action: "APPROVAL_DECISION",
        reason: decision.reason,
        metadata: { stepIndex: step.stepIndex, kind: "APPROVE" },
        createdAt: eventDate,
      });
    }
  }

  if (
    deal.outcome === "CONFIRMED_PAID" ||
    deal.outcome === "CONFIRMED_UNPAID" ||
    deal.outcome === "CONFIRMED_PAID_UNDELIVERED"
  ) {
    await confirmDeal(
      db,
      resolver,
      catalog,
      deal,
      quote.id,
      revision.id,
      eventDate,
      seedTime,
      totals,
    );
  }

  return { quoteId: quote.id, revisionId: revision.id, lineIdsByProduct };
}

async function confirmDeal(
  db: Db,
  resolver: SymbolResolver,
  catalog: SeedCatalog,
  deal: DealFixture,
  _quoteId: string,
  revisionId: string,
  confirmDate: Date,
  seedTime: Date,
  totals: ReturnType<typeof evaluateRevision>,
): Promise<void> {
  const customer = catalog.customers.get(deal.customer)!;
  const portalUser = customer.portalUserSym ?? deal.rep;

  const acceptance = await db.customerAcceptance.create({
    data: {
      revisionId,
      actorId: resolver.resolve(portalUser),
      createdAt: confirmDate,
    },
  });

  await writeAudit(db, resolver, {
    entityType: "CustomerAcceptance",
    entityId: acceptance.id,
    revisionId,
    actorSym: portalUser,
    action: "CUSTOMER_ACCEPTED",
    metadata: { symbol: deal.sym },
    createdAt: confirmDate,
  });

  const fulfillmentStatus =
    deal.outcome === "CONFIRMED_PAID" ? "DELIVERED" : "PENDING";

  const order = await db.order.create({
    data: {
      sourceRevisionId: revisionId,
      acceptanceId: acceptance.id,
      customerId: resolver.resolve(deal.customer),
      repId: resolver.resolve(deal.rep),
      teamId: resolver.tryResolve("team-west") ?? null,
      currency: "INR",
      promisedDate:
        deal.outcome === "CONFIRMED_PAID_UNDELIVERED"
          ? daysBefore(seedTime, 3)
          : null,
      fulfillmentStatus,
      createdAt: confirmDate,
      updatedAt: confirmDate,
    },
  });

  const confirmKey = await db.requestKey.create({
    data: {
      scope: "CONFIRM_ORDER",
      key: `seed:${deal.sym}`,
      actorId: resolver.resolve(deal.rep),
      resultKind: "ORDER",
      resultId: order.id,
      completedAt: confirmDate,
      createdAt: confirmDate,
      updatedAt: confirmDate,
    },
  });

  await writeAudit(db, resolver, {
    entityType: "Order",
    entityId: order.id,
    revisionId,
    actorSym: portalUser,
    action: "ORDER_CONFIRMED",
    metadata: { requestKeyId: confirmKey.id, symbol: deal.sym },
    createdAt: confirmDate,
  });

  const revisionLines = await db.quoteLine.findMany({
    where: { revisionId },
    orderBy: { position: "asc" },
  });

  const orderLines = [];
  for (const line of revisionLines) {
    const orderLine = await db.orderLine.create({
      data: {
        orderId: order.id,
        sourceQuoteLineId: line.id,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        lineDiscountPct: line.lineDiscountPct,
        taxPct: line.taxPct,
        lineTotal: line.lineTotal,
        billingKind: line.billingKind,
        interval: line.interval,
        planId: line.planId,
        stockTracked: line.stockTracked,
        createdAt: confirmDate,
      },
    });
    orderLines.push(orderLine);
  }

  const dueDate = new Date(confirmDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 15);

  const oneTimeLines = revisionLines.filter((line) => line.billingKind === "ONE_TIME");
  if (oneTimeLines.length > 0) {
    const oneTimeInvoice = await db.invoice.create({
      data: {
        customerId: resolver.resolve(deal.customer),
        orderId: order.id,
        kind: "ONE_TIME",
        status:
          deal.outcome === "CONFIRMED_UNPAID" ? "UNPAID" : "PAID",
        currency: "INR",
        issueDate: confirmDate,
        dueDate,
        subtotal: totals.oneTimeSubtotal,
        taxTotal: totals.oneTimeTax,
        total: totals.oneTimeTotal,
        createdAt: confirmDate,
        updatedAt: confirmDate,
      },
    });

    for (const line of oneTimeLines) {
      const product = await db.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      await db.invoiceLine.create({
        data: {
          invoiceId: oneTimeInvoice.id,
          description: product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPct: line.lineDiscountPct,
          taxPct: line.taxPct,
          lineTotal: line.lineTotal,
          createdAt: confirmDate,
        },
      });
    }

    await writeAudit(db, resolver, {
      entityType: "Invoice",
      entityId: oneTimeInvoice.id,
      revisionId,
      actorSym: "finance-farah",
      action: "INVOICE_ISSUED",
      metadata: { kind: "ONE_TIME", symbol: deal.sym },
      createdAt: confirmDate,
    });

    if (deal.outcome !== "CONFIRMED_UNPAID") {
      const paymentKey = await db.requestKey.create({
        data: {
          scope: "PAYMENT",
          key: `seed:${deal.sym}:payment`,
          actorId: resolver.resolve("finance-farah"),
          createdAt: confirmDate,
          updatedAt: confirmDate,
        },
      });

      const payment = await db.payment.create({
        data: {
          invoiceId: oneTimeInvoice.id,
          amount: totals.oneTimeTotal,
          method: "BANK_TRANSFER",
          reference: `SEED-${deal.sym}`,
          paidOn: confirmDate,
          recordedById: resolver.resolve("finance-farah"),
          requestKeyId: paymentKey.id,
          createdAt: confirmDate,
        },
      });

      await db.requestKey.update({
        where: { id: paymentKey.id },
        data: {
          resultKind: "PAYMENT",
          resultId: payment.id,
          completedAt: confirmDate,
          updatedAt: confirmDate,
        },
      });

      await writeAudit(db, resolver, {
        entityType: "Payment",
        entityId: payment.id,
        revisionId,
        actorSym: "finance-farah",
        action: "PAYMENT_RECORDED",
        metadata: { invoiceId: oneTimeInvoice.id, symbol: deal.sym },
        createdAt: confirmDate,
      });
    }
  }

  const recurringLines = orderLines.filter((line) => line.billingKind === "RECURRING");
  for (const line of recurringLines) {
    const periodStart = confirmDate;
    const periodEnd = addMonthsClamped(confirmDate, 1);
    const subscription = await db.subscription.create({
      data: {
        sourceOrderLineId: line.id,
        customerId: resolver.resolve(deal.customer),
        planId: line.planId!,
        status: "ACTIVE",
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        interval: line.interval!,
        anchorDay: confirmDate.getUTCDate(),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        cancelPolicy:
          catalog.planById.get(line.planId!)?.cancelPolicy ?? "PERIOD_END",
        createdAt: confirmDate,
        updatedAt: confirmDate,
      },
    });

    const recurringSubtotal = new Prisma.Decimal(line.unitPrice)
      .times(line.quantity)
      .times(
        new Prisma.Decimal(1).minus(
          new Prisma.Decimal(line.lineDiscountPct).div(100),
        ),
      );
    const recurringTax = recurringSubtotal.times(line.taxPct).div(100);
    const recurringTotal = recurringSubtotal.plus(recurringTax);

    const recurringInvoice = await db.invoice.create({
      data: {
        customerId: resolver.resolve(deal.customer),
        orderId: order.id,
        subscriptionId: subscription.id,
        kind: "RECURRING",
        status: deal.outcome === "CONFIRMED_UNPAID" ? "UNPAID" : "PAID",
        currency: "INR",
        issueDate: confirmDate,
        periodStart,
        periodEnd,
        dueDate,
        subtotal: recurringSubtotal.toDecimalPlaces(2),
        taxTotal: recurringTax.toDecimalPlaces(2),
        total: recurringTotal.toDecimalPlaces(2),
        createdAt: confirmDate,
        updatedAt: confirmDate,
      },
    });

    const product = await db.product.findUniqueOrThrow({
      where: { id: line.productId },
    });
    await db.invoiceLine.create({
      data: {
        invoiceId: recurringInvoice.id,
        description: product.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.lineDiscountPct,
        taxPct: line.taxPct,
        lineTotal: recurringTotal.toDecimalPlaces(2),
        createdAt: confirmDate,
      },
    });

    if (deal.outcome !== "CONFIRMED_UNPAID") {
      const paymentKey = await db.requestKey.create({
        data: {
          scope: "PAYMENT",
          key: `seed:${deal.sym}:recurring:${line.id}`,
          actorId: resolver.resolve("finance-farah"),
          createdAt: confirmDate,
          updatedAt: confirmDate,
        },
      });
      const payment = await db.payment.create({
        data: {
          invoiceId: recurringInvoice.id,
          amount: recurringTotal.toDecimalPlaces(2),
          method: "BANK_TRANSFER",
          reference: `SEED-${deal.sym}-REC`,
          paidOn: confirmDate,
          recordedById: resolver.resolve("finance-farah"),
          requestKeyId: paymentKey.id,
          createdAt: confirmDate,
        },
      });
      await db.requestKey.update({
        where: { id: paymentKey.id },
        data: {
          resultKind: "PAYMENT",
          resultId: payment.id,
          completedAt: confirmDate,
          updatedAt: confirmDate,
        },
      });
    }
  }

  if (deal.outcome === "CONFIRMED_PAID") {
    const stockLines = orderLines.filter(
      (line) => line.stockTracked && line.variantId,
    );
    if (stockLines.length > 0) {
      const shipment = await db.shipment.create({
        data: {
          orderId: order.id,
          warehouseId: resolver.resolve("warehouse-main"),
          status: "DELIVERED",
          shippingCostSnapshot: harshFixtures.warehouses.find(
            (row) => row.sym === "warehouse-main",
          )!.shippingCost,
          shippedAt: confirmDate,
          deliveredAt: confirmDate,
          createdAt: confirmDate,
          updatedAt: confirmDate,
        },
      });

      for (const line of stockLines) {
        const reservation = await db.reservation.create({
          data: {
            orderLineId: line.id,
            variantId: line.variantId!,
            warehouseId: resolver.resolve("warehouse-main"),
            quantity: line.quantity,
            status: "SHIPPED",
            createdAt: confirmDate,
            updatedAt: confirmDate,
          },
        });
        await db.shipmentLine.create({
          data: {
            shipmentId: shipment.id,
            orderLineId: line.id,
            reservationId: reservation.id,
            quantity: line.quantity,
            createdAt: confirmDate,
          },
        });
      }
    }
  }
}

export function runDemoAssertions(catalog: SeedCatalog): void {
  const acme = catalog.customers.get("customer-acme")!;
  const flowBLines = [
    { product: "product-laptop", variant: "variant-laptop-std", qty: 10, linePct: "12" },
    { product: "product-dock", variant: "variant-dock-std", qty: 10, linePct: "12" },
    { product: "product-support", variant: "variant-support-std", qty: 10, linePct: "8" },
  ] as DealLine[];

  const flowBTotals = evaluateRevision(
    acme.discountTier,
    flowBLines.map((line) => lineToEvalInput(catalog, acme, line)),
    "0",
    catalog.policy.tierCeilings,
    catalog.policy.categoryCeilings,
    catalog.policy.thresholds,
  );
  assertDemoTotals("Acme flowb", flowBTotals, {
    oneTimeTotal: "466400.00",
    recurringMonthly: "9200.00",
    riskLevel: "NONE",
  });

  const exceptionLines = [
    { product: "product-laptop", variant: "variant-laptop-std", qty: 10, linePct: "18" },
    { product: "product-dock", variant: "variant-dock-std", qty: 10, linePct: "18" },
    { product: "product-support", variant: "variant-support-std", qty: 10, linePct: "16" },
  ] as DealLine[];

  const exceptionTotals = evaluateRevision(
    acme.discountTier,
    exceptionLines.map((line) => lineToEvalInput(catalog, acme, line)),
    "0",
    catalog.policy.tierCeilings,
    catalog.policy.categoryCeilings,
    catalog.policy.thresholds,
  );
  assertDemoTotals("Acme exception", exceptionTotals, {
    oneTimeTotal: "434600.00",
    recurringMonthly: "8400.00",
    riskLevel: "FINANCE",
    worstLineExcessPct: "6",
  });
}

export async function expandAllDeals(
  db: Db,
  resolver: SymbolResolver,
  catalog: SeedCatalog,
  deals: DealFixture[],
  seedTime: Date,
): Promise<Map<string, { quoteId: string; revisionId: string; lineIdsByProduct: Map<string, string> }>> {
  const results = new Map<
    string,
    { quoteId: string; revisionId: string; lineIdsByProduct: Map<string, string> }
  >();
  for (const deal of deals) {
    const result = await expandDeal(db, resolver, catalog, deal, seedTime);
    results.set(deal.sym, result);
  }
  return results;
}
