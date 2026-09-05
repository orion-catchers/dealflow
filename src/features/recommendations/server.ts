import type { Actor, ApplicationAdapter } from '../../contracts/application';
import type { RecommendationRule } from '../../contracts/krishna';
import { rankRecommendations } from './rank';
import { AppError, requireValue, revisionCheck } from '../../server/errors';
function staff(actor: Actor) { if(!actor.active||!['ADMIN','SALES_REP','SALES_MANAGER'].includes(actor.role)) throw new AppError(403,'FORBIDDEN','Sales access required'); }
export async function suggestions(adapter: ApplicationAdapter, actor: Actor, id: string) {
  staff(actor); return adapter.transaction(tx=>{ const q=tx.quote(id); if(!q || (actor.role==='SALES_REP'&&q.repId!==actor.id)) throw new AppError(404,'NOT_FOUND','Quotation unavailable'); const rules=tx.rules();
    const candidates=rules.flatMap(r=>{const p=tx.product(r.candidateProductId);return p?[tx.canonical.priceCandidate(q,p,r.id)]:[];});
    return {revision:q.revision,items:rankRecommendations({quoteId:q.id,revision:q.revision,currency:q.currency,presentProductIds:q.lines.map(l=>l.productId),dismissedProductIds:[],rules,candidates})};
  });
}
export async function addSuggested(adapter: ApplicationAdapter, actor: Actor, id: string, body: {expectedRevision:string;requestKey:string;productId:string;variantId:string}) {
  staff(actor); requireValue(typeof body.requestKey==='string'&&body.requestKey.length>=8,'Operation key required');
  return adapter.transaction(tx=>{const q=tx.quote(id);if(!q||(actor.role==='SALES_REP'&&q.repId!==actor.id))throw new AppError(404,'NOT_FOUND','Quotation unavailable');return tx.replay(`suggestion:${actor.id}:${id}`,body.requestKey,JSON.stringify(body),()=>{revisionCheck(q.revision,body.expectedRevision);const p=tx.product(body.productId);requireValue(p,'Product unavailable');const rules=tx.rules();const items=rankRecommendations({quoteId:q.id,revision:q.revision,currency:q.currency,presentProductIds:q.lines.map(l=>l.productId),dismissedProductIds:[],rules,candidates:rules.filter(r=>r.candidateProductId===p.id).map(r=>tx.canonical.priceCandidate(q,p,r.id))});const selected=items.find(c=>c.productId===body.productId&&c.variantId===body.variantId);requireValue(selected,'Suggestion no longer qualifies; refresh current pricing');return tx.canonical.addLine(q,selected.productId,selected.variantId,selected.quantity,actor);});});
}
export async function saveRecommendationRules(adapter: ApplicationAdapter, actor: Actor, rules: RecommendationRule[]) {
  if(!actor.active||!['ADMIN','SALES_MANAGER'].includes(actor.role)) throw new AppError(403,'FORBIDDEN','Rule configuration access required');
  requireValue(Array.isArray(rules)&&rules.length<=500,'Invalid rules');const ids=new Set<string>();
  for(const r of rules){requireValue(typeof r.id==='string'&&!ids.has(r.id),'Unique rule IDs required');ids.add(r.id);requireValue(Number.isFinite(r.minimumMarginPct)&&r.minimumMarginPct>=0&&r.minimumMarginPct<=100,'Minimum margin must be 0–100%');requireValue(Number.isFinite(r.coPurchaseScore)&&r.coPurchaseScore>=0,'Co-purchase score must be nonnegative');requireValue(typeof r.active==='boolean'&&(r.promotionLabel===null||typeof r.promotionLabel==='string'),'Invalid rule settings');}
  return adapter.transaction(tx=>{for(const r of rules){requireValue(tx.product(r.candidateProductId),'Candidate product missing');if(r.baseProductId)requireValue(tx.product(r.baseProductId),'Base product missing');}tx.saveRules(rules);return {saved:rules.length};});
}
