import type {
  Customer,
  DataState,
  Evaluation,
  Event,
  HealthFlag,
  Invoice,
  Line,
  Message,
  Order,
  Payment,
  Plan,
  Policy,
  Product,
  Proposal,
  Quote,
  DealRevision,
  Stock,
  Subscription,
  Task,
  Total,
  Warehouse,
} from "@/contracts/application";
import type { BillingInterval, RecommendationRule } from "@/contracts/krishna";
import { prisma } from "@/server/lib/db";
import {
  categoryFromCode,
  currencyOf,
  dateOnly,
  isoOf,
  moneyOf,
  pctOf,
  publicCustomerId,
  publicUserId,
  toPlan,
  toProduct,
  toVariant,
  toWarehouse,
} from "@/server/lib/db/map";
import { toAppRole } from "./ids";

function money(n: unknown): string {
  return moneyOf(n);
}

function revisionLabel(n: number): string {
  return `r${n}`;
}

function intervalOf(kind: string, interval: string | null): BillingInterval {
  if (kind !== "RECURRING") return "ONE_TIME";
  if (interval === "QUARTERLY" || interval === "YEARLY") return interval;
  return "MONTHLY";
}

function roleChain(roles: string[]): Evaluation["chain"] {
  return roles.map((role) => (role === "FINANCE" ? "FINANCE_OPS" : role === "SALES_MANAGER" ? "SALES_MANAGER" : role === "ADMIN" ? "ADMIN" : "SALES_MANAGER")) as Evaluation["chain"];
}

function lineFromQuote(line: {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: unknown;
  unitCost: unknown;
  lineDiscountPct: unknown;
  taxPct: unknown;
  lineSubtotal: unknown;
  taxAmount: unknown;
  lineTotal: unknown;
  stockTracked: boolean;
  billingKind: string;
  interval: string | null;
  product: { name: string };
  variant: { name: string } | null;
}): Line {
  const net = money(line.lineSubtotal);
  const cost = Number(line.unitCost) * line.quantity;
  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId ?? "",
    description: `${line.product.name}${line.variant ? ` · ${line.variant.name}` : ""}`,
    quantity: line.quantity,
    discountPct: pctOf(line.lineDiscountPct),
    unitPrice: money(line.unitPrice),
    unitCost: money(line.unitCost),
    taxPct: pctOf(line.taxPct),
    tax: money(line.taxAmount),
    net,
    total: money(line.lineTotal),
    profit: money(Number(net) - cost),
    interval: intervalOf(line.billingKind, line.interval),
    stockTracked: line.stockTracked,
  };
}

function totalsFromRevision(rev: {
  oneTimeTotal: unknown;
  oneTimeTax: unknown;
  oneTimeSubtotal: unknown;
  recurringMonthly: unknown;
  recurringQuarterly: unknown;
  recurringYearly: unknown;
  totalCost: unknown;
  marginPct: unknown;
}, lines: Line[]): Total[] {
  const groups = new Map<BillingInterval, Line[]>();
  for (const line of lines) {
    const list = groups.get(line.interval) ?? [];
    list.push(line);
    groups.set(line.interval, list);
  }
  if (groups.size === 0) {
    const oneTimeNet = money(rev.oneTimeSubtotal);
    const oneTimeTax = money(rev.oneTimeTax);
    const oneTimeTotal = money(rev.oneTimeTotal);
    const profit = money(Number(oneTimeNet) - Number(rev.totalCost));
    if (Number(oneTimeTotal) === 0 && Number(rev.recurringMonthly) === 0) return [];
    return [
      {
        interval: "ONE_TIME",
        net: oneTimeNet,
        tax: oneTimeTax,
        total: oneTimeTotal,
        profit,
        marginPct: pctOf(rev.marginPct),
      },
    ];
  }
  return [...groups.entries()].map(([interval, group]) => {
    const net = group.reduce((n, l) => n + Number(l.net), 0);
    const tax = group.reduce((n, l) => n + Number(l.tax), 0);
    const total = group.reduce((n, l) => n + Number(l.total), 0);
    const profit = group.reduce((n, l) => n + Number(l.profit), 0);
    return {
      interval,
      net: net.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      profit: profit.toFixed(2),
      marginPct: net > 0 ? (profit / net) * 100 : 0,
    };
  });
}

function evaluationFrom(rev: {
  approvalStatus: string;
  evaluationReasons: unknown;
  worstLineExcessPct: unknown;
  approvalSteps: { stepIndex: number; role: string; status: string }[];
}): Evaluation {
  const raw = rev.evaluationReasons;
  const reasons = Array.isArray(raw)
    ? (raw as unknown[]).map((r) => String(r))
    : raw && typeof raw === "object" && Array.isArray((raw as { reasons?: unknown }).reasons)
      ? ((raw as { reasons: unknown[] }).reasons).map((r) => String(r))
      : typeof raw === "string"
        ? [raw]
        : [];
  const steps = [...rev.approvalSteps].sort((a, b) => a.stepIndex - b.stepIndex);
  const chain = roleChain(steps.map((s) => s.role));
  const step = steps.filter((s) => s.status === "APPROVED").length;
  const status =
    rev.approvalStatus === "PENDING"
      ? "PENDING"
      : rev.approvalStatus === "REJECTED"
        ? "REJECTED"
        : rev.approvalStatus === "SUPERSEDED"
          ? "SUPERSEDED"
          : rev.approvalStatus === "APPROVED"
            ? "APPROVED"
            : "NOT_REQUIRED";
  return { status, chain, step, reasons, worstExcess: pctOf(rev.worstLineExcessPct) };
}

function snapshotRevision(
  rev: {
    revisionNumber: number;
    createdAt: Date;
    orderDiscountPct: unknown;
    promisedDate: Date | null;
    approvalStatus: string;
    evaluationReasons: unknown;
    worstLineExcessPct: unknown;
    oneTimeTotal: unknown;
    oneTimeTax: unknown;
    oneTimeSubtotal: unknown;
    recurringMonthly: unknown;
    recurringQuarterly: unknown;
    recurringYearly: unknown;
    totalCost: unknown;
    marginPct: unknown;
    approvalSteps: { stepIndex: number; role: string; status: string }[];
    lines: Parameters<typeof lineFromQuote>[0][];
  },
): DealRevision {
  const lines = rev.lines.map(lineFromQuote);
  return {
    revision: revisionLabel(rev.revisionNumber),
    lines,
    totals: totalsFromRevision(rev, lines),
    orderDiscountPct: pctOf(rev.orderDiscountPct),
    promisedDate: dateOnly(rev.promisedDate) ?? null,
    evaluation: evaluationFrom(rev),
    at: isoOf(rev.createdAt),
  };
}

export async function loadDataState(): Promise<DataState> {
  const [
    users,
    customers,
    products,
    priceRules,
    warehouses,
    stock,
    plans,
    quotes,
    orders,
    subscriptions,
    invoices,
    payments,
    recRules,
    policyVersions,
    healthSettings,
    flags,
    tasks,
    portalMessages,
  ] = await Promise.all([
    prisma.user.findMany({ include: { memberships: true } }),
    prisma.customer.findMany({ include: { assignedRep: true } }),
    prisma.product.findMany({ include: { category: true, variants: true } }),
    prisma.priceRule.findMany({ where: { active: true } }),
    prisma.warehouse.findMany(),
    prisma.stock.findMany(),
    prisma.subscriptionPlan.findMany({ where: { archivedAt: null } }),
    prisma.quote.findMany({
      include: {
        customer: true,
        rep: true,
        revisions: {
          include: {
            lines: { include: { product: true, variant: true }, orderBy: { position: "asc" } },
            approvalSteps: true,
          },
          orderBy: { revisionNumber: "asc" },
        },
        currentRevision: true,
        portalMessages: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.order.findMany({
      include: {
        lines: { include: { product: true, variant: true } },
        sourceRevision: true,
        shipments: { include: { lines: true } },
      },
    }),
    prisma.subscription.findMany({ include: { plan: true, sourceOrderLine: { select: { productId: true, orderId: true } } } }),
    prisma.invoice.findMany({ include: { lines: true, payments: true, creditApps: true } }),
    prisma.payment.findMany(),
    prisma.recommendationRule.findMany(),
    prisma.policyVersion.findMany({
      include: { policyCeilings: { include: { category: true } }, chainSteps: true },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    prisma.healthSettings.findUnique({ where: { id: "default" } }),
    prisma.healthFlag.findMany(),
    prisma.task.findMany(),
    prisma.portalMessage.findMany({ include: { author: true, baseRevision: true } }),
  ]);

  const reservations = await prisma.reservation.findMany({ include: { orderLine: true } });
  const backorders = await prisma.backorder.findMany({ include: { orderLine: true } });

  const appUsers = users.map((u) => ({
    id: publicUserId(u),
    name: u.name,
    email: u.email,
    role: toAppRole(u.role),
    active: u.status === "ACTIVE",
    companyId: u.companyId,
    customerId: u.role === "CUSTOMER" ? (u.memberships[0] ? publicCustomerId({ id: u.memberships[0].customerId }) : undefined) : undefined,
  }));

  const appCustomers: Customer[] = customers.map((c) => ({
    id: publicCustomerId(c),
    name: c.name,
    email: c.contactEmail,
    tier: c.discountTier === "STANDARD" ? "Bronze" : c.discountTier === "SILVER" ? "Silver" : "Gold",
    currency: currencyOf(c.currency),
    repId: publicUserId(c.assignedRep),
    companyId: c.companyId,
  }));

  const appProducts: Product[] = products.map((p) => {
    const mapped = toProduct({ ...p, variants: p.variants.map((v) => ({ shippingWeight: v.shippingWeight })) });
    const variants = p.variants.map((v) => toVariant(v, Number(p.baseCost)));
    return {
      id: p.id,
      name: p.name,
      category: categoryFromCode(p.category.code) === "SERVICES" || categoryFromCode(p.category.code) === "SUBSCRIPTIONS" ? "Services" : "Hardware",
      unit: mapped.unit,
      description: p.description,
      price: money(p.basePrice),
      cost: money(p.baseCost),
      taxPct: pctOf(p.taxPct),
      active: !p.archivedAt,
      stockTracked: p.stockTracked,
      interval: p.defaultPlanId ? toPlan(plans.find((pl) => pl.id === p.defaultPlanId) ?? { id: "", name: "", interval: "MONTHLY" }).interval : "ONE_TIME",
      planId: p.defaultPlanId ?? "",
      companyId: p.companyId,
      variants: variants.map((v) => ({ id: v.id, name: v.label, extraPrice: v.extraPrice })),
    };
  });

  const appWarehouses: Warehouse[] = warehouses.map((w) => {
    const mapped = toWarehouse(w);
    return { id: w.id, name: w.name, shippingCost: mapped.shippingCostPerShipment, active: w.active, companyId: w.companyId };
  });

  const appStock: Stock[] = stock.map((s) => ({
    id: `${s.warehouseId}:${s.variantId}`,
    warehouseId: s.warehouseId,
    variantId: s.variantId,
    onHand: s.onHand,
    reserved: s.reserved,
    threshold: s.reorderAt,
  }));

  const appPlans: Plan[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    interval: p.interval,
    prorate: true,
    cancellation: p.cancelPolicy === "PERIOD_END" ? "PERIOD_END" : "IMMEDIATE_CREDIT",
    price: "0.00",
  }));

  const appQuotes: Quote[] = quotes.map((q) => {
    const current = q.revisions.find((r) => r.id === q.currentRevisionId) ?? q.revisions.at(-1);
    if (!current) {
      return {
        id: q.id,
        name: q.customer.name,
        customerId: publicCustomerId(q.customer),
        repId: publicUserId(q.rep),
        currency: "INR",
        revision: "r1",
        stage: q.stage === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : q.stage,
        sent: q.stage !== "DRAFT",
        lines: [],
        totals: [],
        orderDiscountPct: 0,
        promisedDate: null,
        history: [],
        events: [],
        evaluation: { status: "NOT_REQUIRED", chain: [], step: 0, reasons: [], worstExcess: 0 },
        at: isoOf(q.createdAt),
        requestedDate: null,
        dateReviewPending: false,
      };
    }
    const currentSnap = snapshotRevision(current);
    const history = q.revisions.filter((r) => r.id !== current.id).map(snapshotRevision);
    const pendingDate = q.portalMessages.find((m) => m.proposedPromisedDate && m.status === "OPEN");
    const events: Event[] = q.portalMessages.map((m) => ({
      id: m.id,
      at: isoOf(m.createdAt),
      actor: publicUserId(m.author),
      text: m.body || "Portal message",
      revision: revisionLabel(current.revisionNumber),
    }));
    const linkedOrder = orders.find((o) => o.sourceRevisionId === current.id);
    const uiStage =
      q.stage === "UNDER_NEGOTIATION" && q.revisions.length === 1
        ? "SENT"
        : q.stage === "APPROVED" && q.revisions.some((r) => r.approvalStatus === "PENDING")
          ? "PENDING_APPROVAL"
          : q.stage;
    return {
      id: q.id,
      name: q.customer.name,
      customerId: publicCustomerId(q.customer),
      repId: publicUserId(q.rep),
      currency: currencyOf(current.currency),
      stage: uiStage,
      sent: q.stage !== "DRAFT",
      history,
      events,
      requestedDate: pendingDate ? dateOnly(pendingDate.proposedPromisedDate) ?? null : null,
      dateReviewPending: Boolean(pendingDate),
      orderId: linkedOrder?.id,
      acceptedAt: linkedOrder ? isoOf(linkedOrder.createdAt) : undefined,
      ...currentSnap,
    };
  });

  const appOrders: Order[] = orders.map((o) => {
    const lines: Line[] = o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId ?? "",
      description: `${l.product.name}${l.variant ? ` · ${l.variant.name}` : ""}`,
      quantity: l.quantity,
      discountPct: pctOf(l.lineDiscountPct),
      unitPrice: money(l.unitPrice),
      unitCost: money(l.unitCost),
      taxPct: pctOf(l.taxPct),
      tax: "0.00",
      net: money(l.lineTotal),
      total: money(l.lineTotal),
      profit: "0.00",
      interval: intervalOf(l.billingKind, l.interval),
      stockTracked: l.stockTracked,
    }));
    const allocations = reservations
      .filter((r) => r.orderLine.orderId === o.id && r.status === "ACTIVE")
      .map((r) => ({ lineId: r.orderLineId, warehouseId: r.warehouseId, quantity: r.quantity }));
    const orderBackorders = backorders
      .filter((b) => b.orderLine.orderId === o.id && !b.resolvedAt)
      .map((b) => ({ lineId: b.orderLineId, quantity: b.quantity }));
    return {
      id: o.id,
      quoteId: quotes.find((q) => q.revisions.some((r) => r.id === o.sourceRevisionId))?.id ?? o.sourceRevisionId,
      revision: revisionLabel(o.sourceRevision.revisionNumber),
      customerId: publicCustomerId({ id: o.customerId, contactEmail: customers.find((c) => c.id === o.customerId)?.contactEmail }),
      currency: currencyOf(o.currency),
      lines,
      totals: totalsFromRevision(
        {
          oneTimeTotal: lines.filter((l) => l.interval === "ONE_TIME").reduce((n, l) => n + Number(l.total), 0),
          oneTimeTax: 0,
          oneTimeSubtotal: lines.filter((l) => l.interval === "ONE_TIME").reduce((n, l) => n + Number(l.net), 0),
          recurringMonthly: 0,
          recurringQuarterly: 0,
          recurringYearly: 0,
          totalCost: 0,
          marginPct: 0,
        },
        lines,
      ),
      status: o.fulfillmentStatus,
      promisedDate: dateOnly(o.promisedDate) ?? null,
      allocations,
      backorders: orderBackorders,
      events: [],
    };
  });

  const appSubscriptions: Subscription[] = subscriptions.map((s) => ({
    id: s.id,
    orderId: s.sourceOrderLine.orderId,
    customerId: publicCustomerId({ id: s.customerId, contactEmail: customers.find((c) => c.id === s.customerId)?.contactEmail }),
    productId: s.sourceOrderLine.productId,
    planId: s.planId,
    quantity: s.quantity,
    unitPrice: money(s.unitPrice),
    status: s.status === "CANCELLED" && s.cancelEffectiveDate ? "CANCEL_AT_PERIOD_END" : s.status,
    periodStart: dateOnly(s.currentPeriodStart) ?? "",
    periodEnd: dateOnly(s.currentPeriodEnd) ?? "",
    nextBill: dateOnly(s.nextBillingDate) ?? dateOnly(s.currentPeriodEnd) ?? "",
    pendingPlanId: s.pendingPlanId ?? undefined,
    events: [],
  }));

  const appInvoices: Invoice[] = invoices.map((i) => {
    const credited = i.creditApps.reduce((n, a) => n + Number(a.amount), 0);
    const paid = i.payments.reduce((n, p) => n + Number(p.amount), 0);
    const outstanding = Math.max(0, Number(i.total) - paid - credited);
    return {
      id: i.id,
      orderId: i.orderId ?? "",
      subscriptionId: i.subscriptionId ?? undefined,
      period: i.periodStart ? dateOnly(i.periodStart) : undefined,
      customerId: publicCustomerId({ id: i.customerId, contactEmail: customers.find((c) => c.id === i.customerId)?.contactEmail }),
      currency: currencyOf(i.currency),
      dueDate: dateOnly(i.dueDate) ?? "",
      lines: i.lines.map((l) => {
        const net = Number(l.unitPrice) * l.quantity * (1 - Number(l.discountPct) / 100);
        const total = Number(l.lineTotal);
        return {
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: money(l.unitPrice),
          discountPct: pctOf(l.discountPct),
          net: money(net),
          tax: money(Math.max(0, total - net)),
          total: money(l.lineTotal),
        };
      }),
      net: money(i.subtotal),
      tax: money(i.taxTotal),
      total: money(i.total),
      paid: money(paid),
      credited: money(credited),
      outstanding: money(outstanding),
      status: i.status,
      events: [],
    };
  });

  const appPayments: Payment[] = payments.map((p) => ({
    id: p.id,
    invoiceId: p.invoiceId,
    amount: money(p.amount),
    method: p.method,
    reference: p.reference,
    date: dateOnly(p.paidOn) ?? "",
  }));

  const appRules: RecommendationRule[] = recRules.map((r) => ({
    id: r.id,
    baseProductId: r.baseProductId,
    candidateProductId: r.candidateProductId,
    coPurchaseScore: Number(r.copurchaseScore),
    promotionLabel: r.promotionTag,
    minimumMarginPct: Number(r.minMarginPct),
    active: r.status === "ACTIVE",
  }));

  const policyRow = policyVersions[0];
  const policy: Policy = policyRow
    ? {
        tierLimits: Object.fromEntries(policyRow.policyCeilings.filter((t) => t.categoryId === null).map((t) => [t.tier === "STANDARD" ? "Bronze" : t.tier === "SILVER" ? "Silver" : "Gold", Number(t.ceilingPct)])),
        categoryLimits: Object.fromEntries(policyRow.policyCeilings.filter((c) => c.categoryId !== null && c.category).map((c) => [c.category!.code === "SERVICES" || c.category!.code === "SUBSCRIPTIONS" ? "Services" : "Hardware", Number(c.ceilingPct)])),
        financeExcess: Number(policyRow.financeWorstExcessPct),
        financeWeighted: Number(policyRow.financeWeightedExcessPct),
        budget: money(policyRow.totalDiscountBudgetPct ?? 0),
      }
    : { tierLimits: { Gold: 15, Silver: 10, Bronze: 5 }, categoryLimits: { Hardware: 15, Services: 10 }, financeExcess: 5, financeWeighted: 8, budget: "0.00" };

  const appFlags: HealthFlag[] = flags.map((f) => ({
    id: f.id,
    quoteId: f.quoteId ?? orders.find((o) => o.id === f.orderId)?.sourceRevisionId ?? "",
    type: f.type === "STALLED" ? "STALLED" : f.type === "DISCOUNT_ANOMALY" ? "ANOMALY" : "DELIVERY",
    reason: f.reason,
    status: f.resolvedAt ? "RESOLVED" : "OPEN",
    detectedAt: isoOf(f.detectedAt),
  }));

  const appTasks: Task[] = tasks.map((t) => ({
    id: t.id,
    quoteId: t.quoteId ?? "",
    assigneeId: publicUserId(users.find((u) => u.id === t.assigneeId) ?? { id: t.assigneeId, email: null }),
    dueDate: dateOnly(t.dueDate) ?? "",
    text: t.actionKey.includes(":") ? t.actionKey.slice(t.actionKey.indexOf(":") + 1) : t.action,
    status: t.status === "DONE" ? "DONE" : "OPEN",
  }));

  const messages: Message[] = portalMessages.map((m) => ({
    id: m.id,
    quoteId: m.quoteId,
    revision: revisionLabel(m.baseRevision.revisionNumber),
    lineId: m.lineId,
    senderId: publicUserId(m.author),
    senderName: m.author.name,
    text: m.body,
    at: isoOf(m.createdAt),
    kind: m.proposedQty != null || m.proposedDiscountPct != null ? "PROPOSAL" : "QUESTION",
    requestedDate: dateOnly(m.proposedPromisedDate),
  }));

  const proposals: Proposal[] = portalMessages
    .filter((m) => m.proposedQty != null || m.proposedDiscountPct != null || m.proposedPromisedDate)
    .map((m) => ({
      id: m.id,
      quoteId: m.quoteId,
      fromRevision: revisionLabel(m.baseRevision.revisionNumber),
      proposedRevision: m.spawnedRevisionId ? "next" : revisionLabel(m.baseRevision.revisionNumber),
      actorId: publicUserId(m.author),
      at: isoOf(m.createdAt),
      lineChanges: m.lineId
        ? [{ lineId: m.lineId, quantity: m.proposedQty ?? undefined, discountPct: m.proposedDiscountPct != null ? Number(m.proposedDiscountPct) : undefined }]
        : [],
      requestedDate: dateOnly(m.proposedPromisedDate),
      status: m.status,
    }));

  return {
    customers: appCustomers,
    products: appProducts,
    priceRules: priceRules.map((r) => ({
      id: r.id,
      productId: r.productId,
      tier: r.tier === "STANDARD" ? "Bronze" : r.tier === "SILVER" ? "Silver" : "Gold",
      currency: r.currency,
      price: money(r.unitPrice),
    })),
    quotes: appQuotes,
    orders: appOrders,
    warehouses: appWarehouses,
    stock: appStock,
    plans: appPlans,
    subscriptions: appSubscriptions,
    invoices: appInvoices,
    payments: appPayments,
    rules: appRules,
    proposals,
    messages,
    policy,
    healthSettings: {
      stalledDays: healthSettings?.stalledAfterDays ?? 5,
      anomalyPoints: Number(healthSettings?.anomalyExcessPoints ?? 10),
      minimumHistory: healthSettings?.anomalyMinSamples ?? 3,
    },
    flags: appFlags,
    tasks: appTasks,
    users: appUsers,
  };
}

export async function latestPolicyVersionId(): Promise<string> {
  const row = await prisma.policyVersion.findFirst({ orderBy: { createdAt: "desc" } });
  if (!row) throw new Error("No policy version is seeded");
  return row.id;
}
