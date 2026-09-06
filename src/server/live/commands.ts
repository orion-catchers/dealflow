import { randomUUID } from "node:crypto";
import type { Actor, Allocation, DataState, Quote } from "@/contracts/application";
import { forms } from "@/contracts/forms";
import { AppError, requireValue, revisionCheck } from "@/server/errors";
import { prisma } from "@/server/lib/db";
import { getBillingService } from "@/server/billing/live";
import { getCatalogService } from "@/server/catalog/live";
import { getFulfillmentService } from "@/server/inventory/live";
import { ApprovalUiService } from "@/server/approval-ui/service";
import { LiveHealthService } from "@/server/health/live-service";
import { patchUser } from "@/server/users/service";
import { moneyOf } from "@/server/lib/db/map";
import { harshActor, prismaCustomerId, prismaUserId, prismaVariantId, prismaWarehouseId, wrapError } from "./ids";
import { applyAtharvaEvaluation, displayCustomerTier, event, newRevision } from "./pricing";
import { persistQuote, type Dirty, liveCanonical } from "./canonical";

function roles(actor: Actor, ...allowed: Actor["role"][]) {
  if (!actor.active || !allowed.includes(actor.role)) throw new AppError(403, "FORBIDDEN", "Your role cannot perform this action");
}

function getQuote(d: DataState, actor: Actor, key: string) {
  const q = d.quotes.find((quote) => quote.id === key);
  if (!q || (actor.role === "SALES_REP" && q.repId !== actor.id)) throw new AppError(404, "NOT_FOUND", "Quotation unavailable");
  return q;
}

function paymentMethod(raw: unknown) {
  const value = String(raw ?? "").toUpperCase().replace(/\s+/g, "_");
  if (value === "BANK_TRANSFER" || value === "CARD" || value === "CHEQUE" || value === "CASH" || value === "OTHER") return value;
  if (value === "BANK" || value === "TRANSFER") return "BANK_TRANSFER";
  return "OTHER";
}

async function mapAllocations(orderId: string, requested: Allocation[] | undefined) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order missing");
  if (!requested) return undefined;
  const allocations = await Promise.all(
    requested.map(async (a) => {
      const line = order.lines.find((l) => l.id === a.lineId);
      requireValue(line, "Invalid allocation line");
      return { orderLineId: line.id, variantId: line.variantId ?? "", warehouseId: await prismaWarehouseId(a.warehouseId), quantity: a.quantity };
    }),
  );
  return {
    allocations,
    backorders: order.lines
      .filter((l) => l.stockTracked)
      .map((l) => {
        const allocated = requested.filter((a) => a.lineId === l.id).reduce((n, a) => n + a.quantity, 0);
        return { orderLineId: l.id, variantId: l.variantId ?? "", quantity: Math.max(0, l.quantity - allocated) };
      })
      .filter((b) => b.quantity > 0),
  };
}

export async function runLiveCommand(
  state: DataState,
  actor: Actor,
  action: string,
  b: Record<string, unknown>,
  dirty: Dirty,
): Promise<unknown> {
  const key = String(b.id ?? "");
  const text = String(b.text ?? "").trim();
  const requestKey = String(b.requestKey ?? randomUUID());
  const harsh = harshActor(actor);
  const canonical = liveCanonical(state, dirty, actor);

  try {
    if (action === "reset") throw new AppError(403, "FORBIDDEN", "Development reset is not available on the live adapter");

    if (action === "payment") {
      roles(actor, "ADMIN", "FINANCE_OPS");
      return await getBillingService().recordPayment(harsh, {
        invoiceId: key,
        amount: String(b.amount),
        method: paymentMethod(b.method),
        reference: String(b.reference ?? ""),
        paidOn: String(b.date ?? b.paidOn ?? ""),
        requestKey,
      });
    }

    if (action === "runBilling") {
      roles(actor, "ADMIN", "FINANCE_OPS");
      return await getBillingService().runDueBilling(harsh, { requestKey, asOf: typeof b.asOf === "string" ? b.asOf : undefined });
    }

    if (action === "subscription") {
      roles(actor, "ADMIN", "FINANCE_OPS");
      const mode = String(b.operation ?? "");
      const body: Record<string, unknown> = { requestKey };
      if (typeof b.effectiveDate === "string") body.effectiveDate = b.effectiveDate;
      if (mode === "pause") body.pause = true;
      else if (mode === "resume") body.resume = true;
      else if (mode === "cancel") body.cancel = true;
      else if (mode === "change") {
        if (b.planId) body.planId = String(b.planId);
        else body.quantity = Number(b.quantity);
      } else throw new AppError(422, "VALIDATION", "Unknown subscription action");
      return await getBillingService().patchSubscription(harsh, key, body);
    }

    if (["allocate", "ship", "deliver", "cancelOrder"].includes(action)) {
      roles(actor, "ADMIN", "FINANCE_OPS");
      const svc = getFulfillmentService();
      if (action === "allocate") {
        const plan = await mapAllocations(key, b.allocations as Allocation[] | undefined);
        return await svc.accept({ orderId: key, requestKey, actor: harsh, plan });
      }
      if (action === "ship") {
        const planned = await prisma.shipment.findMany({ where: { orderId: key, status: "PLANNED" } });
        let last = null;
        for (const shipment of planned) {
          last = await svc.ship({ orderId: key, shipmentId: shipment.id, requestKey: `${requestKey}:${shipment.id}`, actor: harsh });
        }
        requireValue(planned.length, "Allocate all stock before shipping");
        return last;
      }
      if (action === "deliver") {
        const shipped = await prisma.shipment.findMany({ where: { orderId: key, status: "SHIPPED" } });
        let last = null;
        for (const shipment of shipped) {
          last = await svc.deliver({ orderId: key, shipmentId: shipment.id, requestKey: `${requestKey}:${shipment.id}`, actor: harsh });
        }
        requireValue(shipped.length, "Ship before marking delivered");
        return last;
      }
      return await svc.cancel({ orderId: key, requestKey, actor: harsh, reason: text || "Cancelled from operations" });
    }

    if (action === "stockReceipt") {
      roles(actor, "ADMIN", "FINANCE_OPS");
      return await getFulfillmentService().receipt({
        warehouseId: await prismaWarehouseId(String(b.warehouseId)),
        variantId: await prismaVariantId(String(b.variantId)),
        quantity: Number(b.quantity),
        requestKey,
        actor: harsh,
      });
    }

    if (action === "stockThreshold") {
      roles(actor, "ADMIN", "FINANCE_OPS");
      const stock = state.stock.find((s) => s.id === key);
      requireValue(stock && Number(b.threshold) >= 0, "Invalid threshold");
      await prisma.stock.update({
        where: { warehouseId_variantId: { warehouseId: stock.warehouseId, variantId: stock.variantId } },
        data: { reorderAt: Number(b.threshold) },
      });
      stock.threshold = Number(b.threshold);
      return stock;
    }

    if (action === "variant") {
      roles(actor, "ADMIN");
      const extra = Number(b.extraPrice);
      requireValue(text, "Variant name required");
      requireValue(Number.isFinite(extra) && extra >= 0, "Extra price must be nonnegative");
      return await getCatalogService().createVariant(harsh, key, {
        label: text,
        extraPrice: extra.toFixed(2),
        extraCost: "0.00",
        sku: `sku-${randomUUID().slice(0, 8)}`,
      });
    }

    if (action === "saveRecord") {
      const collection = String(b.collection);
      const form = forms[collection];
      requireValue(form, "Unknown collection");
      const r = b.record as Record<string, unknown>;
      requireValue(r && typeof r === "object", "Record required");
      if (collection === "products") {
        roles(actor, "ADMIN");
        const unitRaw = String(r.unit ?? "UNIT").toUpperCase();
        const unit = unitRaw === "SEAT" || unitRaw === "HOUR" || unitRaw === "PACK" || unitRaw === "LICENSE" ? unitRaw : "UNIT";
        const category = String(r.category) === "Services" ? "SERVICES" : "HARDWARE";
        const interval = String(r.interval ?? "ONE_TIME");
        const body = {
          name: String(r.name ?? ""),
          category,
          unit,
          description: String(r.description ?? ""),
          basePrice: String(r.price ?? "0.00"),
          baseCost: String(r.cost ?? "0.00"),
          taxRateId: `tax-${Math.round(Number(r.taxPct ?? 0))}`,
          stockTracked: r.stockTracked === true,
          isSubscription: interval !== "ONE_TIME",
          planId: interval !== "ONE_TIME" ? String(r.planId) : undefined,
          active: r.active !== false,
        };
        if (key) return await getCatalogService().updateProduct(harsh, key, body);
        return await getCatalogService().createProduct(harsh, body);
      }
      if (collection === "customers") {
        roles(actor, "ADMIN");
        const tier = String(r.tier) === "Gold" ? "GOLD" : String(r.tier) === "Silver" ? "SILVER" : "BRONZE";
        const body = {
          name: String(r.name ?? ""),
          contactEmail: String(r.email ?? ""),
          contactName: String(r.name ?? ""),
          tier,
          currency: String(r.currency ?? "INR"),
          assignedRepId: await prismaUserId(String(r.repId ?? actor.id)),
        };
        if (key) {
          const id = await prismaCustomerId(key);
          return await getCatalogService().updateCustomer(harsh, id, body);
        }
        return await getCatalogService().createCustomer(harsh, body);
      }
      if (collection === "warehouses") {
        roles(actor, "ADMIN");
      const payload = {
        code: String(r.name ?? `WH-${randomUUID().slice(0, 6)}`).replace(/\s+/g, "-").slice(0, 40),
        name: String(r.name ?? ""),
        shippingCostPerShipment: String(r.shippingCost ?? "0.00"),
        active: r.active !== false,
      };
      if (key) return await getFulfillmentService().updateWarehouse(harsh, key, payload);
      return await getFulfillmentService().createWarehouse(harsh, payload);
      }
      if (collection === "plans") {
        roles(actor, "ADMIN", "FINANCE_OPS");
        const intervalRaw = String(r.interval ?? "").trim().toUpperCase().replace(/\s+/g, "_");
        const interval =
          intervalRaw === "QUARTERLY" || intervalRaw === "YEARLY" || intervalRaw === "MONTHLY" ? intervalRaw : undefined;
        const cancelRaw = String(r.cancellation ?? "").trim().toUpperCase().replace(/\s+/g, "_");
        const cancelPolicy =
          cancelRaw === "PERIOD_END" || cancelRaw === "PERIODEND" || cancelRaw === "AT_PERIOD_END"
            ? "PERIOD_END"
            : cancelRaw === "IMMEDIATE" || cancelRaw === "IMMEDIATE_CREDIT"
              ? "IMMEDIATE"
              : undefined;
        const listPrice = moneyOf(r.price ?? 0);
        const name = String(r.name ?? "");
        const saved = key
          ? await getBillingService().patchPlan(harsh, key, {
              name,
              listPrice,
              ...(interval ? { interval } : {}),
              ...(cancelPolicy ? { cancelPolicy } : {}),
            })
          : await getBillingService().createPlan(harsh, {
              code: `P-${randomUUID().slice(0, 8)}`,
              name,
              interval: interval ?? "MONTHLY",
              cancelPolicy: cancelPolicy ?? "PERIOD_END",
              listPrice,
            });
        await prisma.product.updateMany({ where: { defaultPlanId: saved.id }, data: { basePrice: listPrice } });
        return saved;
      }
      if (collection === "users") {
        roles(actor, "ADMIN");
        requireValue(key, "Users request accounts through signup");
        const role = String(r.role) === "FINANCE_OPS" ? "FINANCE" : String(r.role);
        const id = await prismaUserId(key);
        const rawCustomer = String(r.customerId ?? "").trim();
        if (role === "CUSTOMER") requireValue(rawCustomer, "Customer membership required");
        const customerIds = rawCustomer ? [await prismaCustomerId(rawCustomer)] : [];
        const saved = await patchUser(harsh, id, {
          status: r.active === false ? "DISABLED" : "ACTIVE",
          role,
          customerIds,
        });
        const user = state.users.find((row) => row.id === key);
        if (user) user.customerId = rawCustomer || undefined;
        return saved;
      }
      if (collection === "priceRules") {
        roles(actor, "ADMIN");
        const list = await prisma.priceList.findFirst();
        requireValue(list, "Create a price list before adding customer prices");
        const tier = String(r.tier) === "Gold" ? "GOLD" : String(r.tier) === "Silver" ? "SILVER" : "STANDARD";
        const data = {
          productId: String(r.productId),
          priceListId: list.id,
          unitPrice: String(r.price ?? "0.00"),
          tier: tier as "STANDARD" | "SILVER" | "GOLD",
          currency: String(r.currency ?? "INR"),
          active: true,
        };
        if (key) {
          return await prisma.priceRule.update({ where: { id: key }, data: { unitPrice: data.unitPrice, productId: data.productId, tier: data.tier, currency: data.currency } });
        }
        return await prisma.priceRule.create({ data });
      }
      throw new AppError(422, "VALIDATION", "Unknown collection");
    }

    if (action === "policy") {
      roles(actor, "ADMIN", "SALES_MANAGER");
      const p = b.policy as DataState["policy"];
      requireValue(p, "Policy required");
      const createdById = await prismaUserId(actor.id);
      const categories = await prisma.category.findMany();
      const hardware = categories.find((c) => c.code === "HARDWARE") ?? categories[0];
      const services = categories.find((c) => c.code === "SERVICES") ?? categories[0];
      await prisma.policyVersion.create({
        data: {
          name: `Policy ${new Date().toISOString().slice(0, 10)}`,
          createdById,
          anyExcessRequiresManager: true,
          managerWorstExcessPct: 0,
          managerWeightedExcessPct: 0,
          financeWorstExcessPct: p.financeExcess,
          financeWeightedExcessPct: p.financeWeighted,
          totalDiscountBudgetPct: Number(p.budget),
          policyCeilings: {
            create: [
              { tier: "GOLD", categoryId: null, ceilingPct: p.tierLimits.Gold ?? 15 },
              { tier: "SILVER", categoryId: null, ceilingPct: p.tierLimits.Silver ?? 10 },
              { tier: "STANDARD", categoryId: null, ceilingPct: p.tierLimits.Bronze ?? 5 },
              { tier: "GOLD", categoryId: hardware.id, ceilingPct: p.categoryLimits.Hardware ?? 15 },
              { tier: "GOLD", categoryId: services.id, ceilingPct: p.categoryLimits.Services ?? 10 },
            ],
          },
          chainSteps: {
            create: [
              { stepIndex: 0, role: "SALES_MANAGER" },
              { stepIndex: 1, role: "FINANCE" },
            ],
          },
        },
      });
      state.policy = p;
      return p;
    }

    if (action === "healthSettings") {
      roles(actor, "ADMIN", "SALES_MANAGER");
      const settings = b.settings as DataState["healthSettings"];
      requireValue(settings && settings.stalledDays >= 1 && settings.anomalyPoints >= 0 && settings.minimumHistory >= 1, "Invalid health settings");
      await prisma.healthSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          stalledAfterDays: settings.stalledDays,
          anomalyMinSamples: settings.minimumHistory,
          anomalyExcessPoints: settings.anomalyPoints,
        },
        update: {
          stalledAfterDays: settings.stalledDays,
          anomalyMinSamples: settings.minimumHistory,
          anomalyExcessPoints: settings.anomalyPoints,
        },
      });
      state.healthSettings = settings;
      return settings;
    }

    if (action === "refreshHealth") {
      roles(actor, "ADMIN", "SALES_MANAGER", "SALES_REP", "FINANCE_OPS");
      return await new LiveHealthService().refresh(harsh);
    }

    if (action === "task") {
      roles(actor, "ADMIN", "SALES_MANAGER", "SALES_REP", "FINANCE_OPS");
      if (b.complete === true) {
        const task = await prisma.task.findUnique({ where: { id: key } });
        requireValue(task, "Task missing");
        return await prisma.task.update({ where: { id: key }, data: { status: "DONE", completedAt: new Date() } });
      }
      requireValue(text && b.dueDate && b.assigneeId, "Assignee, due date and task required");
      const assigneeId = await prismaUserId(String(b.assigneeId));
      const createdById = await prismaUserId(actor.id);
      const quoteId = String(b.quoteId);
      const flag = await prisma.healthFlag.create({
        data: {
          type: "STALLED",
          fingerprint: `TASK:${quoteId}:${randomUUID()}`,
          quoteId,
          reason: text,
          detectedAt: new Date(),
        },
      });
      return await prisma.task.create({
        data: {
          actionKey: `manual:${quoteId}:${randomUUID()}`,
          flagId: flag.id,
          quoteId,
          assigneeId,
          createdById,
          action: "NUDGE",
          dueDate: new Date(`${String(b.dueDate)}T00:00:00Z`),
        },
      });
    }

    if (action === "newQuote") {
      roles(actor, "ADMIN", "SALES_REP");
      const c = state.customers.find((customer) => customer.id === b.customerId);
      requireValue(c, "Select a customer");
      const q: Quote = {
        id: `Q-${randomUUID().slice(0, 8)}`,
        name: text || "New quotation",
        customerId: c.id,
        repId: actor.role === "SALES_REP" ? actor.id : c.repId,
        currency: c.currency,
        revision: "r1",
        stage: "DRAFT",
        sent: false,
        lines: [],
        totals: [],
        orderDiscountPct: 0,
        promisedDate: null,
        history: [],
        events: [event(actor, "Draft created")],
        evaluation: { status: "NOT_REQUIRED", chain: [], step: 0, reasons: [], worstExcess: 0 },
        at: new Date().toISOString(),
        requestedDate: null,
        dateReviewPending: false,
      };
      state.quotes.push(q);
      dirty.quotes.set(q.id, q);
      await persistQuote(state, q);
      return q;
    }

    if (["saveQuote", "addLine", "removeLine", "submitQuote", "sendQuote", "setCustomerTier", "decision", "reply", "reviewDate"].includes(action)) {
      roles(actor, "ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE_OPS");
      const q = getQuote(state, actor, key);
      revisionCheck(q.revision, b.expectedRevision);
      if (action === "reply") {
        requireValue(text, "Message required");
        state.messages.push({
          id: randomUUID(),
          quoteId: key,
          revision: q.revision,
          lineId: null,
          senderId: actor.id,
          senderName: actor.name,
          text,
          kind: "RESPONSE",
          at: new Date().toISOString(),
        });
        dirty.messages = true;
        return q;
      }
      if (action === "decision") {
        requireValue(q.evaluation.status === "PENDING", "No pending approval");
        requireValue(actor.role === q.evaluation.chain[q.evaluation.step] || actor.role === "ADMIN", "Only the assigned approval level may act");
        requireValue(actor.id !== q.repId && text, "Approval reason required; reps cannot approve their own quote");
        const decision = String(b.decision);
        requireValue(["approve", "reject", "return"].includes(decision), "Invalid decision");
        const dbQuote = await prisma.quote.findUnique({ where: { id: q.id } });
        requireValue(dbQuote?.currentRevisionId, "Revision missing");
        const mapped = decision === "approve" ? "APPROVE" : decision === "reject" ? "REJECT" : "RETURN";
        await new ApprovalUiService().submitDecision(harsh, dbQuote.currentRevisionId, mapped, text);
        return q;
      }
      roles(actor, "ADMIN", "SALES_REP");
      requireValue(q.stage !== "CONFIRMED", "Confirmed quotation is locked");
      if (action === "addLine") return canonical.addLine(q, String(b.productId), String(b.variantId), Number(b.quantity), actor);
      if (action === "removeLine") {
        const lineId = String(b.lineId ?? "");
        requireValue(q.lines.some((line) => line.id === lineId), "Line is not on this quotation");
        newRevision(q, actor, "Removed a quotation line");
        q.lines = q.lines.filter((line) => line.id !== lineId);
        applyAtharvaEvaluation(state, q);
        q.stage = q.sent ? "UNDER_NEGOTIATION" : "DRAFT";
        dirty.quotes.set(q.id, q);
        return q;
      }
      if (action === "saveQuote") {
        newRevision(q, actor, "Terms revised");
        const customer = state.customers.find((c) => c.id === b.customerId);
        requireValue(customer, "Customer required");
        q.customerId = customer.id;
        q.name = String(b.name ?? q.name);
        q.currency = customer.currency;
        q.orderDiscountPct = Number(b.orderDiscountPct);
        if (!Number.isFinite(q.orderDiscountPct) || q.orderDiscountPct < 0 || q.orderDiscountPct > 100) {
          throw new AppError(400, "INVALID_ARGUMENT", "Order discount must be between 0% and 100%");
        }
        q.promisedDate = b.promisedDate ? String(b.promisedDate) : null;
        const changes = (b.lines ?? []) as { id: string; quantity: number; discountPct: number }[];
        requireValue(Array.isArray(changes), "Lines required");
        for (const l of q.lines) {
          const c = changes.find((change) => change.id === l.id);
          if (!c) continue;
          const qty = Math.round(Number(c.quantity));
          if (Number.isFinite(qty) && qty > 0) l.quantity = qty;
          const disc = Number(c.discountPct);
          if (!Number.isFinite(disc) || disc < 0 || disc > 100) {
            throw new AppError(400, "INVALID_ARGUMENT", "Discount must be between 0% and 100%");
          }
          l.discountPct = disc;
        }
        applyAtharvaEvaluation(state, q);
        q.stage = q.sent ? "UNDER_NEGOTIATION" : "DRAFT";
        dirty.quotes.set(q.id, q);
        return q;
      }
      if (action === "reviewDate") {
        requireValue(q.dateReviewPending, "No delivery request pending");
        newRevision(q, actor, "Delivery request reviewed");
        if (b.accept === true) q.promisedDate = q.requestedDate;
        q.dateReviewPending = false;
        applyAtharvaEvaluation(state, q);
        q.stage = "UNDER_NEGOTIATION";
        state.messages.push({
          id: randomUUID(),
          quoteId: key,
          revision: q.revision,
          lineId: null,
          senderId: actor.id,
          senderName: actor.name,
          text: b.accept === true ? `Delivery promise revised to ${q.promisedDate}` : "Requested date declined; existing promise retained",
          kind: "RESPONSE",
          at: new Date().toISOString(),
        });
        dirty.quotes.set(q.id, q);
        dirty.messages = true;
        await prisma.portalMessage.updateMany({
          where: { quoteId: q.id, status: "OPEN", proposedPromisedDate: { not: null } },
          data: { status: "DECLINED" },
        });
        return q;
      }
      if (action === "setCustomerTier") {
        roles(actor, "ADMIN", "SALES_REP");
        requireValue(q.stage !== "CONFIRMED", "Confirmed quotation is locked");
        const customer = state.customers.find((row) => row.id === q.customerId);
        requireValue(customer, "Customer required");
        const tier = displayCustomerTier(String(b.customerTier ?? ""));
        requireValue(["Bronze", "Silver", "Gold"].includes(String(b.customerTier ?? "")), "Customer tier must be Bronze, Silver, or Gold");
        newRevision(q, actor, `Customer tier set to ${tier}`);
        customer.tier = tier;
        await prisma.customer.update({
          where: { id: await prismaCustomerId(customer.id) },
          data: { discountTier: tier === "Silver" ? "SILVER" : tier === "Gold" ? "GOLD" : "STANDARD" },
        });
        applyAtharvaEvaluation(state, q);
        q.stage = q.sent ? "UNDER_NEGOTIATION" : "DRAFT";
        dirty.quotes.set(q.id, q);
        return q;
      }
      requireValue(q.lines.length && q.totals.some((t) => Number(t.net) > 0), "Add nonzero quotation lines");
      if (action === "submitQuote") {
        applyAtharvaEvaluation(state, q);
        q.stage = q.evaluation.status === "PENDING" ? "PENDING_APPROVAL" : "APPROVED";
      } else {
        if (b.customerTier != null && String(b.customerTier).trim() !== "") {
          const customer = state.customers.find((row) => row.id === q.customerId);
          requireValue(customer, "Customer required");
          const tier = displayCustomerTier(String(b.customerTier));
          requireValue(["Bronze", "Silver", "Gold"].includes(String(b.customerTier)), "Customer tier must be Bronze, Silver, or Gold");
          customer.tier = tier;
          await prisma.customer.update({
            where: { id: await prismaCustomerId(customer.id) },
            data: { discountTier: tier === "Silver" ? "SILVER" : tier === "Gold" ? "GOLD" : "STANDARD" },
          });
          applyAtharvaEvaluation(state, q);
        }
        q.sent = true;
        if (q.stage === "DRAFT") q.stage = "SENT";
      }
      q.events.push(event(actor, action === "sendQuote" ? "Quotation sent to customer" : "Submitted for policy review", q.revision));
      dirty.quotes.set(q.id, q);
      return q;
    }

    throw new AppError(404, "NOT_FOUND", "Action unavailable");
  } catch (error) {
    wrapError(error);
  }
}
