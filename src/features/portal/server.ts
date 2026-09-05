import { randomUUID } from 'node:crypto';
import type { Actor, ApplicationAdapter, DataState, ProposalInput, Quote, QuoteRevision } from '../../contracts/application';
import { AppError, requireValue, revisionCheck } from '../../server/errors';
export function customerActor(actor: Actor) { if (!actor.active || actor.role !== 'CUSTOMER' || !actor.customerId) throw new AppError(403, 'FORBIDDEN', 'Active customer access required'); return actor.customerId; }
export function safeRevision(q: QuoteRevision) { return { revision: q.revision, orderDiscountPct: q.orderDiscountPct, promisedDate: q.promisedDate, at: q.at, approvalStatus: q.evaluation.status, lines: q.lines.map(l => ({ id:l.id, description:l.description, productId:l.productId, variantId:l.variantId, quantity:l.quantity, discountPct:l.discountPct, unitPrice:l.unitPrice, taxPct:l.taxPct, tax:l.tax, net:l.net, total:l.total, interval:l.interval })), totals:q.totals.map(t=>({interval:t.interval, net:t.net,tax:t.tax,total:t.total})) }; }
export function safeQuote(q: Quote) { return { ...safeRevision(q), id:q.id,name:q.name,currency:q.currency,stage:q.stage,sent:q.sent, requestedDate:q.requestedDate,dateReviewPending:q.dateReviewPending,orderId:q.orderId,acceptedAt:q.acceptedAt,history:q.history.map(safeRevision) }; }
export function portalData(actor: Actor, state: DataState) {
  const customerId = customerActor(actor); const quotes = state.quotes.filter(q=>q.customerId===customerId && q.sent); const ids = new Set(quotes.map(q=>q.id));
  return { quotes:quotes.map(safeQuote), messages:state.messages.filter(m=>ids.has(m.quoteId)).map(m=>({id:m.id,quoteId:m.quoteId,revision:m.revision,lineId:m.lineId,senderName:m.senderName,text:m.text,at:m.at,kind:m.kind,requestedDate:m.requestedDate})), proposals:state.proposals.filter(p=>ids.has(p.quoteId)).map(p=>({id:p.id,quoteId:p.quoteId,fromRevision:p.fromRevision,proposedRevision:p.proposedRevision,at:p.at,status:p.status,requestedDate:p.requestedDate,lineChanges:p.lineChanges.map(l=>({lineId:l.lineId,quantity:l.quantity,discountPct:l.discountPct,comment:l.comment}))})), orders:state.orders.filter(o=>o.customerId===customerId).map(o=>({id:o.id,quoteId:o.quoteId,revision:o.revision,status:o.status,promisedDate:o.promisedDate,lines:o.lines.map(l=>({id:l.id,description:l.description,quantity:l.quantity})),backorders:o.backorders.map(b=>({lineId:b.lineId,quantity:b.quantity}))})), invoices:state.invoices.filter(i=>i.customerId===customerId).map(i=>({id:i.id,orderId:i.orderId,currency:i.currency,dueDate:i.dueDate,status:i.status,net:i.net,tax:i.tax,total:i.total,paid:i.paid,credited:i.credited,outstanding:i.outstanding,lines:i.lines.map(l=>({id:l.id,description:l.description,quantity:l.quantity,unitPrice:l.unitPrice,discountPct:l.discountPct,net:l.net,tax:l.tax,total:l.total}))})) };
}
export function validateProposal(body: ProposalInput) {
  requireValue(body && typeof body.expectedRevision==='string' && typeof body.requestKey==='string' && body.requestKey.length>=8 && body.requestKey.length<=150, 'Revision and operation key are required');
  requireValue(Array.isArray(body.lineChanges) && body.lineChanges.length<=100, 'Invalid line changes'); const seen = new Set<string>();
  for (const l of body.lineChanges) { requireValue(typeof l.lineId==='string' && !seen.has(l.lineId),'Each line may appear only once'); seen.add(l.lineId); if(l.quantity!==undefined) requireValue(Number.isFinite(l.quantity)&&l.quantity>0&&l.quantity<=1e6,'Quantity must be positive'); if(l.discountPct!==undefined) requireValue(Number.isFinite(l.discountPct)&&l.discountPct>=0&&l.discountPct<=100,'Discount must be 0–100%'); if(l.comment!==undefined) requireValue(typeof l.comment==='string'&&l.comment.length<=2000,'Comments must be under 2,000 characters'); }
  if(body.requestedDeliveryDate) { const time=Date.parse(body.requestedDeliveryDate+'T00:00:00Z');requireValue(/^\d{4}-\d{2}-\d{2}$/.test(body.requestedDeliveryDate)&&Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===body.requestedDeliveryDate,'Enter a valid delivery date'); }
  requireValue(body.lineChanges.some(l=>l.comment?.trim()||l.quantity!==undefined||l.discountPct!==undefined)||body.requestedDeliveryDate,'Add a question or proposed change');
}
export async function propose(adapter: ApplicationAdapter, actor: Actor, id: string, body: ProposalInput) {
  const customerId = customerActor(actor); validateProposal(body);
  return adapter.transaction(tx=> { const q=tx.customerQuote(id,customerId); if(!q||q.customerId!==customerId||!q.sent) throw new AppError(404,'NOT_FOUND','Quotation unavailable');
    return tx.replay(`proposal:${actor.id}:${id}`,body.requestKey,JSON.stringify(body),()=>{
      revisionCheck(q.revision,body.expectedRevision); requireValue(q.stage!=='CONFIRMED','Confirmed quotations cannot be changed');
      for(const l of body.lineChanges) requireValue(q.lines.some(line=>line.id===l.lineId),'Requested line is not in this quotation');
      const previous=q.revision; const numeric=body.lineChanges.filter(l=>l.quantity!==undefined||l.discountPct!==undefined);
      if(numeric.length) tx.canonical.revise(q,numeric,actor);
      if(body.requestedDeliveryDate) { q.requestedDate=body.requestedDeliveryDate; q.dateReviewPending=true; }
      const proposalId=randomUUID(), at=new Date().toISOString();
      tx.appendProposal({id:proposalId,quoteId:id,fromRevision:previous,proposedRevision:q.revision,actorId:actor.id,at,lineChanges:body.lineChanges,requestedDate:body.requestedDeliveryDate,status:numeric.length?'EVALUATED':body.requestedDeliveryDate?'DATE_REVIEW':'QUESTION'});
      for(const l of body.lineChanges) tx.appendMessage({id:randomUUID(),quoteId:id,revision:q.revision,lineId:l.lineId,senderId:actor.id,senderName:actor.name,text:l.comment?.trim()||`Requested ${l.quantity===undefined?'':`quantity ${l.quantity} `}${l.discountPct===undefined?'':`discount ${l.discountPct}%`}`,kind:numeric.length?'PROPOSAL':'QUESTION',at});
      if(body.requestedDeliveryDate) tx.appendMessage({id:randomUUID(),quoteId:id,revision:q.revision,lineId:null,senderId:actor.id,senderName:actor.name,text:`Requested delivery date ${body.requestedDeliveryDate}; awaiting team review`,kind:'PROPOSAL',at,requestedDate:body.requestedDeliveryDate});
      return { proposalId, quote:safeQuote(q) };
    });
  });
}
export async function confirm(adapter: ApplicationAdapter, actor: Actor, id: string, body: {expectedRevision:string;requestKey:string}) {
  const customerId=customerActor(actor); requireValue(typeof body.requestKey==='string'&&body.requestKey.length>=8,'Operation key required');
  return adapter.transaction(tx=>{const q=tx.customerQuote(id,customerId); if(!q||q.customerId!==customerId||!q.sent) throw new AppError(404,'NOT_FOUND','Quotation unavailable');
    return tx.replay(`confirm:${actor.id}:${id}`,body.requestKey,JSON.stringify(body),()=>{revisionCheck(q.revision,body.expectedRevision);
      if(q.dateReviewPending || !['APPROVED','NOT_REQUIRED'].includes(q.evaluation.status)) throw new AppError(409,'APPROVAL_PENDING','Current terms need approval or delivery-date review before confirmation');
      const order=tx.canonical.confirm(q,actor); return {orderId:order.id,quoteId:id,revision:q.revision};
    });
  });
}
