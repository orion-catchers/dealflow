'use client';
import {useEffect,useState} from 'react';
import type {portalData} from '../../features/portal/server';
import {api,Button,Input,Link,StatusBadge,Money,Heading,Section,Table,FormAction,Events,newId} from './shared';
type Portal=ReturnType<typeof portalData>;
type PortalQuoteRow=Portal['quotes'][number];

let portalCache:Portal|null=null;

function productLabel(description:string){
  return description.split('·')[0]?.trim() || description;
}

function quoteTitle(q:PortalQuoteRow){
  const names=[...new Set(q.lines.map(l=>productLabel(l.description)).filter(Boolean))];
  const version=`Version ${q.revision}`;
  if(!names.length) return `Quotation · ${version}`;
  if(names.length===1) return `${names[0]} · ${version}`;
  return `${names[0]} + ${names.length-1} more · ${version}`;
}

function orderTitle(order:Portal['orders'][number],quotes:PortalQuoteRow[]){
  const quote=quotes.find(q=>q.id===order.quoteId);
  return quote?`${quoteTitle(quote).replace(/ · Version .+$/,'')} · delivery`:`Delivery ${order.status.replaceAll('_',' ').toLowerCase()}`;
}

function invoiceTitle(invoice:Portal['invoices'][number]){
  return `Invoice due ${invoice.dueDate}`;
}

export default function CustomerPortal({path}:{path:string}){
  const [data,setData]=useState<Portal|null>(portalCache);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const reload=async()=>{
    const next=await api<Portal>('portal');
    portalCache=next;
    setData(next);
  };
  useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
  if(!data)return <><Heading title="Your customer workspace"/>{error?<div className="error" role="alert">{error}<Button onClick={()=>reload().catch(e=>setError(e.message))}>Try again</Button></div>:<p role="status">Loading your records…</p>}</>;
  const parts=path.slice(1).split('/');
  const id=parts[2];
  const q=data.quotes.find(item=>item.id===id);
  const invoice=data.invoices.find(item=>item.id===id);
  const order=data.orders.find(item=>item.id===id);
  if(id&&!q&&!invoice&&!order)return <><Heading title="Record unavailable" description="This record is not available to your account."/><Link href="/portal">Back to your deals</Link></>;
  const headingTitle=q?quoteTitle(q):invoice?invoiceTitle(invoice):order?orderTitle(order,data.quotes):'Your deals';
  const headingDescription=q?`Current version ${q.revision}. Review terms, ask a question, or accept when approval is complete.`:'Review quotations, follow deliveries, and open invoices.';
  return <>
    <Heading title={headingTitle} description={headingDescription}>{id&&<Link href="/portal" className="df-button df-button--secondary">All your records</Link>}</Heading>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {q?<PortalQuote key={q.revision} q={q} data={data} reload={reload} notice={setNotice}/>:invoice?<><Section title="Invoice summary" actions={<a className="primary-link" href={'/api/export?format=pdf&invoice='+invoice.id}>Download PDF</a>}><StatusBadge status={invoice.status}/><p>Due {invoice.dueDate}</p><Table head={['Description','Quantity','Net','Tax','Total']} rows={invoice.lines.map(l=>[l.description,l.quantity,<Money amount={l.net} currency={invoice.currency}/>,<Money amount={l.tax} currency={invoice.currency}/>,<Money amount={l.total} currency={invoice.currency}/>])}/><dl>{[['Total',invoice.total],['Paid',invoice.paid],['Credit',invoice.credited],['Balance',invoice.outstanding]].map(([k,v])=><div key={k}><dt>{k}</dt><dd><Money amount={v} currency={invoice.currency}/></dd></div>)}</dl><p>Your finance contact can help with payment instructions.</p></Section></>:order?<Section title="Delivery progress"><StatusBadge status={order.status}/><p>Promised delivery: {order.promisedDate??'Not yet agreed'}</p><Table head={['Product','Quantity','Backordered']} rows={order.lines.map(l=>[l.description,l.quantity,order.backorders.find(b=>b.lineId===l.id)?.quantity??0])}/></Section>:<PortalHome data={data}/>}
  </>;
}

function PortalHome({data}:{data:Portal}){
  return <>
    <Section title="Quotations to review">
      <Table
        head={['Quotation','Status','Approval','Amount','']}
        rows={data.quotes.map(q=>[
          quoteTitle(q),
          <StatusBadge status={q.stage}/>,
          <StatusBadge status={q.approvalStatus}/>,
          q.totals.map(t=><small key={t.interval}><Money amount={t.total} currency={q.currency}/> · {t.interval.replaceAll('_',' ').toLowerCase()}</small>),
          <Link href={'/portal/quotes/'+q.id} className="df-button df-button--primary">Open</Link>,
        ])}
      />
    </Section>
    <Section title="Your orders">
      <Table
        head={['Order','Status','Delivery promise','']}
        rows={data.orders.map(o=>[
          orderTitle(o,data.quotes),
          <StatusBadge status={o.status}/>,
          o.promisedDate??'Not yet agreed',
          <Link href={'/portal/orders/'+o.id} className="df-button df-button--secondary">Open</Link>,
        ])}
      />
    </Section>
    <Section title="Your invoices">
      <Table
        head={['Invoice','Due','Total','Balance','Status','']}
        rows={data.invoices.map(i=>[
          invoiceTitle(i),
          i.dueDate,
          <Money amount={i.total} currency={i.currency}/>,
          <Money amount={i.outstanding} currency={i.currency}/>,
          <StatusBadge status={i.status}/>,
          <Link href={'/portal/invoices/'+i.id} className="df-button df-button--secondary">Open</Link>,
        ])}
      />
    </Section>
  </>;
}
function PortalQuote({q,data,reload,notice}:{q:PortalQuoteRow;data:Portal;reload:()=>Promise<void>;notice:(s:string)=>void}){const [changes,setChanges]=useState<Record<string,{quantity?:number;discountPct?:number;comment?:string}>>({}),[requestedDate,setDate]=useState(''),[key,setKey]=useState(newId()),[error,setError]=useState(''),[busy,setBusy]=useState(false);const update=(id:string,k:string,value:unknown)=>{setChanges({...changes,[id]:{...changes[id],[k]:value}});setKey(newId());};const locked=q.stage==='CONFIRMED';return <><div className="deal-summary"><StatusBadge status={q.stage}/><span>Approval <StatusBadge status={q.approvalStatus}/></span><span>Delivery promise: {q.promisedDate??'Not yet agreed'}</span></div>{q.dateReviewPending&&<p className="notice">Your requested delivery date, {q.requestedDate}, is awaiting review. It is not yet a promise.</p>}<Section title="Current terms"><Table head={['Product','Quantity','Unit price','Discount','Tax','Total','Billing']} rows={q.lines.map(l=>[l.description,l.quantity,<Money amount={l.unitPrice} currency={q.currency}/>,l.discountPct+'%',<Money amount={l.tax} currency={q.currency}/>,<Money amount={l.total} currency={q.currency}/>,l.interval.replaceAll('_',' ').toLowerCase()])}/><div className="portal-totals">{q.totals.map(t=><div key={t.interval}><span>{t.interval==='ONE_TIME'?'One-time total':t.interval.toLowerCase()+' total'}</span><strong><Money amount={t.total} currency={q.currency}/></strong><small>Includes tax <Money amount={t.tax} currency={q.currency}/></small></div>)}</div><p>Order discount: {q.orderDiscountPct}%</p>{!locked&&(['APPROVED','NOT_REQUIRED'].includes(q.approvalStatus)&&!q.dateReviewPending?<FormAction title="Accept current terms" description={`Accept version ${q.revision} exactly as shown. This confirms the order; stock allocation is a separate step.`} onSubmit={async v=>{await api('portal/quotes/'+q.id+'/confirm',{...v,expectedRevision:q.revision});await reload();notice('Your acceptance was recorded for the current version.');}}/>:<p className="notice">Acceptance is unavailable while these terms await approval or delivery-date review.</p>)}{locked&&<p className="notice">You accepted version {q.revision}. <Link href={'/portal/orders/'+q.orderId}>View your order →</Link></p>}</Section>{!locked&&<Section title="Ask a question or propose a change"><p>Enter only the terms you want to change. A proposal is evaluated as a new version when financial terms change. It does not accept the deal.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('portal/quotes/'+q.id+'/proposals',{expectedRevision:q.revision,requestKey:key,lineChanges:Object.entries(changes).map(([lineId,v])=>({lineId,...v})),...(requestedDate?{requestedDeliveryDate:requestedDate}:{})});await reload();setChanges({});setDate('');setKey(newId());notice('Your proposal has been recorded. Review the updated status before accepting.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><Table head={['Line','Proposed quantity','Proposed discount (%)','Comment']} rows={q.lines.map(l=>[<>{l.description}<small>Current: {l.quantity} units / {l.discountPct}%</small></>,<Input label={'Proposed quantity '+l.description} type="number" min={0.01} step="any" placeholder={String(l.quantity)} value={changes[l.id]?.quantity??''} onChange={e=>update(l.id,'quantity',e.target.value===''?undefined:Number(e.target.value))}/>,<Input label={'Proposed discount '+l.description} type="number" min={0} max={100} step="any" placeholder={String(l.discountPct)} value={changes[l.id]?.discountPct??''} onChange={e=>update(l.id,'discountPct',e.target.value===''?undefined:Number(e.target.value))}/>,<Input label={'Comment '+l.description} maxLength={2000} value={changes[l.id]?.comment??''} onChange={e=>update(l.id,'comment',e.target.value)}/>])}/><Input label="Requested delivery date (subject to team review)" type="date" value={requestedDate} onChange={e=>{setDate(e.target.value);setKey(newId());}}/>{error&&<p role="alert" className="error">{error} <Button onClick={()=>reload()}>Reload current terms</Button></p>}<Button type="submit" disabled={busy}>{busy?'Submitting…':'Submit proposal / question'}</Button></form></Section>}<Section title="Conversation"><Events events={data.messages.filter(m=>m.quoteId===q.id)}/></Section><Section title="Proposed versus previous terms">{data.proposals.filter(p=>p.quoteId===q.id).map(p=><article className="proposal" key={p.id}><h3>{p.fromRevision} → {p.proposedRevision} · {p.status.replaceAll('_',' ')}</h3><small>{new Date(p.at).toLocaleString()}</small><Table head={['Line','Previous quantity / discount','Requested quantity / discount','Comment']} rows={p.lineChanges.map(c=>{const old=q.history.find(h=>h.revision===p.fromRevision)?.lines.find(l=>l.id===c.lineId)??q.lines.find(l=>l.id===c.lineId);return [old?.description,`${old?.quantity} / ${old?.discountPct}%`,`${c.quantity??'unchanged'} / ${c.discountPct===undefined?'unchanged':c.discountPct+'%'}`,c.comment];})}/>{p.requestedDate&&<p>Requested date: {p.requestedDate}</p>}</article>)}{!data.proposals.some(p=>p.quoteId===q.id)&&<p>No proposals yet.</p>}</Section><Section title="Version history">{[...q.history,q].map(r=><details key={r.revision}><summary>{r.revision} · {new Date(r.at).toLocaleString()} · {r.approvalStatus.replaceAll('_',' ')}</summary><Table head={['Line','Quantity','Discount','Total']} rows={r.lines.map(l=>[l.description,l.quantity,l.discountPct+'%',<Money amount={l.total} currency={q.currency}/>])}/></details>)}</Section></>;}
