import type { Actor, DataState } from "../contracts/application";

/** Presentation scope for staff reads. Live repositories must repeat this predicate in SQL. */
export function scopeCompany(actor: Actor, state: DataState): DataState {
  if (!actor.companyId) return state;
  const companyId = actor.companyId;
  const customers = state.customers.filter((c) => !c.companyId || c.companyId === companyId);
  const customerIds = new Set(customers.map((c) => c.id));
  const products = state.products.filter((p) => !p.companyId || p.companyId === companyId);
  const warehouses = state.warehouses.filter((w) => !w.companyId || w.companyId === companyId);
  const warehouseIds = new Set(warehouses.map((w) => w.id));
  const quotes = state.quotes.filter((q) => customerIds.has(q.customerId));
  const quoteIds = new Set(quotes.map((q) => q.id));
  const orders = state.orders.filter((o) => customerIds.has(o.customerId));
  const orderIds = new Set(orders.map((o) => o.id));
  const invoices = state.invoices.filter((i) => customerIds.has(i.customerId));
  return {
    ...state,
    customers,
    products,
    warehouses,
    stock: state.stock.filter((s) => warehouseIds.has(s.warehouseId)),
    quotes,
    orders,
    users: state.users.filter((u) => !u.companyId || u.companyId === companyId),
    invoices,
    subscriptions: state.subscriptions.filter((s) => orderIds.has(s.orderId)),
    payments: state.payments.filter((p) => invoices.some((i) => i.id === p.invoiceId)),
    messages: state.messages.filter((m) => quoteIds.has(m.quoteId)),
    proposals: state.proposals.filter((p) => quoteIds.has(p.quoteId)),
    flags: state.flags.filter((f) => quoteIds.has(f.quoteId)),
    tasks: state.tasks.filter((t) => quoteIds.has(t.quoteId)),
  };
}

export function scopeWorkspace(actor: Actor, state: DataState): DataState {
  state = scopeCompany(actor, state);
  if (actor.role !== "SALES_REP") return state;
  const quoteIds = new Set(state.quotes.filter((q) => q.repId === actor.id).map((q) => q.id));
  const orderIds = new Set(state.orders.filter((o) => quoteIds.has(o.quoteId)).map((o) => o.id));
  const customerIds = new Set(state.quotes.filter((q) => quoteIds.has(q.id)).map((q) => q.customerId));
  state.quotes = state.quotes.filter((q) => quoteIds.has(q.id));
  state.customers = state.customers.filter((c) => customerIds.has(c.id));
  state.orders = state.orders.filter((o) => orderIds.has(o.id));
  state.subscriptions = state.subscriptions.filter((s) => orderIds.has(s.orderId));
  state.invoices = state.invoices.filter((i) => orderIds.has(i.orderId));
  state.payments = state.payments.filter((p) => state.invoices.some((i) => i.id === p.invoiceId));
  state.messages = state.messages.filter((m) => quoteIds.has(m.quoteId));
  state.proposals = state.proposals.filter((p) => quoteIds.has(p.quoteId));
  state.flags = state.flags.filter((f) => quoteIds.has(f.quoteId));
  state.tasks = state.tasks.filter((t) => quoteIds.has(t.quoteId));
  return state;
}
