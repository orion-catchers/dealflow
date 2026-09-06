'use client';
import type {ReactNode} from 'react';
import type {Actor,DataState,Quote,Role} from '../../contracts/application';
import {revisionTitle} from './shared';

/**
 * One vocabulary for "where is this deal and what happens next".
 * Home, the quotation list, the approval inbox and the quotation page all read
 * from here, so a rep sees the same words in every place.
 */

export const ROLE_NAME:Record<Role,string>={ADMIN:'Admin',SALES_REP:'Sales rep',SALES_MANAGER:'Sales manager',FINANCE_OPS:'Finance',CUSTOMER:'Customer'};

export type StepTone='action'|'waiting'|'done'|'blocked';
export type StepOwner='rep'|'approver'|'customer'|'finance';
export interface NextStep {
  key:'order'|'save'|'first-line'|'date-request'|'rejected'|'awaiting-review'|'decide'|'submit'|'send'|'awaiting-customer';
  title:string;
  detail:string;
  tone:StepTone;
  owner:StepOwner;
  href?:string;
}

export function approvalOk(q:Pick<Quote,'evaluation'>){return q.evaluation.status==='APPROVED'||q.evaluation.status==='NOT_REQUIRED';}
export function assignedReviewer(q:Pick<Quote,'evaluation'>):Role|undefined{return q.evaluation.status==='PENDING'?q.evaluation.chain[q.evaluation.step]:undefined;}
export function canDecide(q:Pick<Quote,'evaluation'|'repId'|'stage'>,actor:Actor){
  const reviewer=assignedReviewer(q);
  if(!reviewer||q.stage==='CONFIRMED')return false;
  if(actor.id===q.repId)return false;
  return actor.role===reviewer||actor.role==='ADMIN';
}

export function dealNextStep(q:Quote,opts:{actor:Actor;customerName?:string;dirty?:boolean}={} as {actor:Actor}):NextStep{
  const {actor,dirty=false}=opts;
  const customer=opts.customerName??'the customer';
  const version=revisionTitle(q.revision);
  if(q.stage==='CONFIRMED'){
    return {key:'order',title:'Order created',detail:`${customer} accepted ${version}. Stock is reserved only when Finance allocates it.`,tone:'done',owner:'finance',href:q.orderId?'/fulfillment/'+q.orderId:undefined};
  }
  if(dirty)return {key:'save',title:'Save your changes',detail:'Saving creates a new version and re-checks the discount policy.',tone:'action',owner:'rep'};
  if(q.lines.length===0)return {key:'first-line',title:'Add the first product',detail:`Prices come from ${customer}'s price list. Totals and policy appear after the first line.`,tone:'action',owner:'rep'};
  if(q.dateReviewPending)return {key:'date-request',title:`${customer} asked for delivery on ${q.requestedDate}`,detail:'Accepting creates a new version with that promise. Declining keeps the current terms.',tone:'action',owner:'rep'};
  if(q.evaluation.status==='REJECTED')return {key:'rejected',title:'Approval was rejected',detail:'Change the terms and save. The new version is evaluated again.',tone:'blocked',owner:'rep'};
  const reviewer=assignedReviewer(q);
  if(reviewer&&q.stage==='PENDING_APPROVAL'){
    if(actor&&canDecide(q,actor))return {key:'decide',title:`Your decision is needed on ${version}`,detail:q.evaluation.reasons[0]??'This version exceeds the discount policy.',tone:'action',owner:'approver'};
    return {key:'awaiting-review',title:`Waiting for ${ROLE_NAME[reviewer]} review`,detail:q.evaluation.chain.length>1?`Approval runs ${q.evaluation.chain.map(r=>ROLE_NAME[r]).join(', then ')}.`:'You will see the decision here and in the activity history.',tone:'waiting',owner:'approver'};
  }
  const lastRevEvent = [...(q.events ?? [])].reverse().find((e) => !e.revision || e.revision === q.revision) ?? q.events?.[q.events.length - 1];
  const isRepRevision = Boolean(
    lastRevEvent &&
    (["Terms revised", "Removed a quotation line", "Customer tier set to"].some((t) => lastRevEvent.text?.includes(t)) ||
     (actor && lastRevEvent.actor === actor.name))
  );
  const isCustomerProposal = q.stage === 'UNDER_NEGOTIATION' && !isRepRevision && Boolean(
    lastRevEvent && (lastRevEvent.actor === customer || lastRevEvent.text?.toLowerCase().includes("proposal"))
  );

  if(q.evaluation.status==='PENDING'){
    const because=q.evaluation.reasons[0]??'These terms exceed the discount policy.';
    const proposed = isCustomerProposal ? `${customer} proposed these changes. ` : '';
    return {key:'submit',title:'Submit for approval',detail:`${proposed}${because} Submitting shares ${version} with ${customer} in their portal; they can accept once it is approved.`,tone:'action',owner:'rep'};
  }
  if(!q.sent){
    return {key:'send',title:`Send to ${customer}`,detail:q.evaluation.status==='APPROVED'?`${version} is approved. The customer can review and accept it in their portal.`:'Within policy, so no approval is needed. The customer can accept it in their portal.',tone:'action',owner:'rep'};
  }
  const proposed = isCustomerProposal ? `${customer} proposed ${version}; it is within policy and ready for their acceptance.` : `${customer} can accept ${version} in their portal.`;
  return {key:'awaiting-customer',title:'Waiting for customer acceptance',detail:proposed,tone:'waiting',owner:'customer'};
}

/** Short label for tables: the same title, without the customer name. */
export function nextStepLabel(q:Quote,actor:Actor):string{
  const step=dealNextStep(q,{actor});
  if(step.key==='send')return 'Send to customer';
  if(step.key==='date-request')return 'Review delivery-date request';
  return step.title;
}

export function nextStepHref(q:Quote,actor:Actor):string{
  const step=dealNextStep(q,{actor});
  return step.href??'/quotes/'+q.id;
}

type FlowState='done'|'current'|'upcoming'|'skipped';
interface FlowStep{name:string;caption:string;state:FlowState}

export function flowSteps(q:Quote):FlowStep[]{
  const confirmed=q.stage==='CONFIRMED';
  const ok=approvalOk(q);
  const needsApproval=q.evaluation.status==='PENDING'||q.evaluation.status==='REJECTED'||q.evaluation.status==='APPROVED'||q.evaluation.chain.length>0;
  const inReview=q.stage==='PENDING_APPROVAL';
  const reviewer=assignedReviewer(q);
  const draft:FlowStep={name:'Draft',caption:q.lines.length?`${q.lines.length} line${q.lines.length===1?'':'s'} · ${revisionTitle(q.revision)}`:'No lines yet',state:q.lines.length?'done':'current'};
  const approval:FlowStep=!needsApproval
    ?{name:'Approval',caption:'Not needed',state:q.lines.length?'skipped':'upcoming'}
    :q.evaluation.status==='APPROVED'?{name:'Approval',caption:'Approved',state:'done'}
    :q.evaluation.status==='REJECTED'?{name:'Approval',caption:'Rejected',state:'current'}
    :inReview?{name:'Approval',caption:reviewer?`${ROLE_NAME[reviewer]} reviewing`:'In review',state:'current'}
    :{name:'Approval',caption:'Needs submission',state:q.lines.length?'current':'upcoming'};
  const customer:FlowStep=confirmed?{name:'Customer',caption:'Accepted',state:'done'}
    :q.sent?{name:'Customer',caption:ok?'Reviewing terms':'Shared, cannot accept yet',state:ok?'current':'upcoming'}
    :{name:'Customer',caption:'Not sent',state:'upcoming'};
  const order:FlowStep=confirmed?{name:'Order',caption:'Created',state:q.orderId?'done':'current'}:{name:'Order',caption:'After acceptance',state:'upcoming'};
  if(confirmed){draft.state='done';if(approval.state==='current')approval.state='done';}
  return [draft,approval,customer,order];
}

export function FlowSteps({steps,label='Deal progress'}:{steps:FlowStep[];label?:string}){
  return <ol className="flow-steps" aria-label={label}>
    {steps.map((step,index)=><li key={step.name} className={`flow-step is-${step.state}`} aria-current={step.state==='current'?'step':undefined}>
      <span className="flow-step-marker" aria-hidden="true">{step.state==='done'?'✓':index+1}</span>
      <span className="flow-step-text"><strong>{step.name}</strong><small>{step.caption}</small></span>
    </li>)}
  </ol>;
}

export function NextStepCard({step,children,eyebrow='Next step'}:{step:Pick<NextStep,'title'|'detail'|'tone'>;children?:ReactNode;eyebrow?:string}){
  return <section className={`next-step is-${step.tone}`} aria-live="polite">
    <div className="next-step-copy">
      <span className="next-step-eyebrow">{step.tone==='waiting'?'Waiting on others':step.tone==='done'?'Complete':step.tone==='blocked'?'Needs a change':eyebrow}</span>
      <h2>{step.title}</h2>
      <p>{step.detail}</p>
    </div>
    {children&&<div className="next-step-actions">{children}</div>}
  </section>;
}

export interface AttentionItem{id:string;title:string;detail:string;href:string;kind:'quote'|'approval'|'order'|'invoice'|'task'}

/** What this person should look at first, in the order they should look at it. */
export function attentionItems(d:DataState,actor:Actor):AttentionItem[]{
  const name=(id:string)=>d.customers.find(c=>c.id===id)?.name??'Customer';
  const today=new Date().toISOString().slice(0,10);
  const items:AttentionItem[]=[];
  const quotes=[...d.quotes].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const approver=actor.role==='SALES_MANAGER'||actor.role==='FINANCE_OPS'||actor.role==='ADMIN';
  if(approver){
    for(const q of quotes){
      if(canDecide(q,actor)&&q.stage==='PENDING_APPROVAL')items.push({id:'a-'+q.id,kind:'approval',title:`Decide on ${name(q.customerId)} · ${revisionTitle(q.revision)}`,detail:q.evaluation.reasons[0]??'Exceeds policy',href:'/quotes/'+q.id});
    }
  }
  if(actor.role==='SALES_REP'||actor.role==='ADMIN'){
    for(const q of quotes){
      const step=dealNextStep(q,{actor,customerName:name(q.customerId)});
      if(step.owner==='rep'&&step.tone!=='done')items.push({id:'q-'+q.id,kind:'quote',title:`${step.key==='send'?'Send':step.key==='submit'?'Submit':step.key==='date-request'?'Review date request':step.key==='first-line'?'Add products to':'Revise'} · ${name(q.customerId)}`,detail:step.key==='date-request'?`Requested ${q.requestedDate}`:step.title,href:'/quotes/'+q.id});
    }
    for(const t of d.tasks.filter(t=>t.status==='OPEN'&&(actor.role==='ADMIN'||t.assigneeId===actor.id))){
      items.push({id:'t-'+t.id,kind:'task',title:t.text,detail:`Due ${t.dueDate}${t.dueDate<today?' · overdue':''}`,href:'/quotes/'+t.quoteId});
    }
  }
  if(actor.role==='FINANCE_OPS'||actor.role==='ADMIN'){
    for(const o of d.orders){
      if(!['SHIPPED','DELIVERED','CANCELLED'].includes(o.status)&&o.allocations.length===0)items.push({id:'o-'+o.id,kind:'order',title:`Allocate stock · ${name(o.customerId)}`,detail:o.promisedDate?`Promised ${o.promisedDate}`:'No delivery promise yet',href:'/fulfillment/'+o.id});
    }
    for(const i of d.invoices){
      if(Number(i.outstanding)>0&&i.dueDate<today)items.push({id:'i-'+i.id,kind:'invoice',title:`Overdue invoice · ${name(i.customerId)}`,detail:`Due ${i.dueDate}`,href:'/invoices/'+i.id});
    }
  }
  return items.slice(0,8);
}
