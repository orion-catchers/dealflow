import type {Actor,DataState} from '../contracts/application';

/** Presentation scope for staff reads. Live repositories must repeat this predicate in SQL. */
export function scopeWorkspace(actor:Actor,state:DataState):DataState {
  if(actor.role!=='SALES_REP') return state;
  const quoteIds=new Set(state.quotes.filter(q=>q.repId===actor.id).map(q=>q.id));
  const orderIds=new Set(state.orders.filter(o=>quoteIds.has(o.quoteId)).map(o=>o.id));
  const customerIds=new Set(state.quotes.filter(q=>quoteIds.has(q.id)).map(q=>q.customerId));
  state.quotes=state.quotes.filter(q=>quoteIds.has(q.id));
  state.customers=state.customers.filter(c=>customerIds.has(c.id));
  state.orders=state.orders.filter(o=>orderIds.has(o.id));
  state.subscriptions=state.subscriptions.filter(s=>orderIds.has(s.orderId));
  state.invoices=state.invoices.filter(i=>orderIds.has(i.orderId));
  state.payments=state.payments.filter(p=>state.invoices.some(i=>i.id===p.invoiceId));
  state.messages=state.messages.filter(m=>quoteIds.has(m.quoteId));
  state.proposals=state.proposals.filter(p=>quoteIds.has(p.quoteId));
  state.flags=state.flags.filter(f=>quoteIds.has(f.quoteId));
  state.tasks=state.tasks.filter(t=>quoteIds.has(t.quoteId));
  return state;
}
