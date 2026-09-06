'use client';
import {useEffect,useState} from 'react';
import type {portalData} from '../../features/portal/server';
import {api,Button,Input,Link,StatusBadge,Money,Heading,Section,Table,FormAction,Events,newId,quoteTitle,orderTitle,invoiceTitle,revisionTitle,BackLink,OpenLink} from './shared';
import {readPortalCache,rememberPortal} from './portal-cache';
import {FlowSteps,NextStepCard} from './DealFlow';
import {CardCheckoutButton} from './CardCheckoutButton';
type Portal=ReturnType<typeof portalData>;
type PortalQuoteRow=Portal['quotes'][number];
type PortalInvoiceRow=Portal['invoices'][number];
type PortalOrderRow=Portal['orders'][number];

export default function CustomerPortal({path}:{path:string}){
  const [data,setData]=useState<Portal|null>(readPortalCache<Portal>());
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const reload=async()=>{
    const next=await api<Portal>('portal');
    rememberPortal(next);
    setData(next);
  };
  useEffect(()=>{
    reload().catch(e=>setError(e.message));
  },[path]);
  if(!data)return <><Heading title="Your customer workspace"/>{error?<div className="error" role="alert">{error}<Button onClick={()=>reload().catch(e=>setError(e.message))}>Try again</Button></div>:<p role="status">Loading your records…</p>}</>;
  const parts=path.slice(1).split('/');
  const id=parts[2];
  const q=data.quotes.find(item=>item.id===id);
  const invoice=data.invoices.find(item=>item.id===id);
  const order=data.orders.find(item=>item.id===id);
  if(id&&!q&&!invoice&&!order)return <><Heading title="Record unavailable" description="This record is not available to your account."/><BackLink href="/portal">Back to your deals</BackLink></>;
  const headingTitle=q?quoteTitle(q):invoice?invoiceTitle(invoice):order?orderTitle(order,data.quotes.find(item=>item.id===order.quoteId)):'Your deals';
  const headingDescription=q?(q.stage==='CONFIRMED'?`You accepted ${revisionTitle(q.revision)}. Open your order to see the amount due and pay.`:`Current ${revisionTitle(q.revision)}. Review terms, ask a question, or accept when approval is complete.`):invoice?'Pay this invoice. Finance sees the same payment on their invoice record.':order?'Delivery is separate from payment. Amount due and pay are on this page.':'Review quotations, follow deliveries, and pay invoices after you accept.';
  return <>
    <Heading title={headingTitle} description={headingDescription}>{id&&<Link href="/portal" className="df-button df-button--secondary">All your records</Link>}</Heading>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {q?<PortalQuote key={q.revision} q={q} data={data} reload={reload} notice={setNotice}/>:invoice?<PortalInvoice invoice={invoice} reload={reload} notice={setNotice}/>:order?<PortalOrder order={order} data={data} reload={reload} notice={setNotice}/>:<PortalHome data={data}/>}
  </>;
}

function portalRank(q:PortalQuoteRow){
  if(q.stage==='CONFIRMED')return 3;
  if(q.dateReviewPending)return 1;
  return ['APPROVED','NOT_REQUIRED'].includes(q.approvalStatus)?0:2;
}

function PortalHome({data}:{data:Portal}){
  return <>
    <Section title="Quotations to review">
      <Table
        head={['Quotation','Status','What happens next','Amount','']}
        rows={[...data.quotes].sort((a,b)=>portalRank(a)-portalRank(b)).map(q=>[
          quoteTitle(q),
          <StatusBadge status={q.stage}/>,
          q.stage==='CONFIRMED'?'Accepted · pay invoices and follow delivery':q.dateReviewPending?'Your date request is in review':['APPROVED','NOT_REQUIRED'].includes(q.approvalStatus)?'Ready for your acceptance':'Waiting for supplier approval',
          q.totals.map(t=><small key={t.interval}><Money amount={t.total} currency={q.currency}/> · {t.interval.replaceAll('_',' ').toLowerCase()}</small>),
          <OpenLink href={'/portal/quotes/'+q.id} />,
        ])}
      />
    </Section>
    <Section title="Your orders">
      <Table
        head={['Order','Status','Delivery promise','']}
        rows={data.orders.map(o=>[
          orderTitle(o,data.quotes.find(item=>item.id===o.quoteId)),
          <StatusBadge status={o.status}/>,
          o.promisedDate??'Not yet agreed',
          <OpenLink href={'/portal/orders/'+o.id} />,
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
          <OpenLink href={'/portal/invoices/'+i.id} />,
        ])}
      />
    </Section>
  </>;
}

function moneySum(amounts:string[]){
  const cents=amounts.reduce((n,a)=>n+Math.round(Number(a)*100),0);
  return (cents/100).toFixed(2);
}

function invoicesForOrder(data:Portal,order:PortalOrderRow){
  const direct=data.invoices.filter(i=>i.orderId&&i.orderId===order.id);
  if(direct.length)return direct;
  const quote=data.quotes.find(q=>q.id===order.quoteId||q.orderId===order.id);
  if(quote?.orderId){
    const byQuote=data.invoices.filter(i=>i.orderId===quote.orderId);
    if(byQuote.length)return byQuote;
  }
  const names=new Set(order.lines.map(l=>l.description));
  return data.invoices.filter(i=>!i.orderId&&i.lines.some(l=>names.has(l.description)));
}

function PortalInvoice({invoice,reload,notice}:{invoice:PortalInvoiceRow;reload:()=>Promise<void>;notice:(s:string)=>void}){
  const due=Number(invoice.outstanding)>0;
  return <Section title="Invoice summary" actions={<a className="primary-link" href={'/api/export?format=pdf&invoice='+invoice.id}>Download PDF</a>}>
    <StatusBadge status={invoice.status}/>
    <p>Due {invoice.dueDate}</p>
    <Table head={['Description','Quantity','Net','Tax','Total']} rows={invoice.lines.map(l=>[l.description,l.quantity,<Money amount={l.net} currency={invoice.currency}/>,<Money amount={l.tax} currency={invoice.currency}/>,<Money amount={l.total} currency={invoice.currency}/>])}/>
    <dl>{[['Total',invoice.total],['Paid',invoice.paid],['Credit',invoice.credited],['Balance',invoice.outstanding]].map(([k,v])=><div key={k}><dt>{k}</dt><dd><Money amount={v} currency={invoice.currency}/></dd></div>)}</dl>
    {due?<div className="actions">
      <CardCheckoutButton invoiceId={invoice.id} amount={invoice.outstanding} currency={invoice.currency} onNotice={notice} onPaid={reload}/>
    </div>:<p>This invoice is settled. Finance can see the same payment on the invoice record.</p>}
    <h3>Payment history</h3>
    <Table
      head={['Who paid','Method','Reference','Date','Amount']}
      rows={(invoice.payments??[]).map(p=>[p.recordedByName??'You',p.method.replaceAll('_',' '),p.reference,p.date,<Money amount={p.amount} currency={invoice.currency}/>])}
      empty="No payments yet."
    />
  </Section>;
}

function PortalOrder({order,data,reload,notice}:{order:PortalOrderRow;data:Portal;reload:()=>Promise<void>;notice:(s:string)=>void}){
  const invoices=invoicesForOrder(data,order);
  const open=invoices.filter(i=>Number(i.outstanding)>0);
  const due=moneySum((open.length?open:invoices).map(i=>i.outstanding));
  const quote=data.quotes.find(q=>q.id===order.quoteId);
  const currency=invoices[0]?.currency??quote?.currency??'INR';
  const quoted=quote?.totals.find(t=>t.interval==='ONE_TIME')?.total??quote?.totals[0]?.total??'0.00';
  return <>
    <Section title="Amount to pay">
      {open.length?<div className="payable-strip">
        <div>
          <span>Balance due</span>
          <strong><Money amount={due} currency={currency}/></strong>
        </div>
        {open.map(invoice=><CardCheckoutButton key={invoice.id} invoiceId={invoice.id} amount={invoice.outstanding} currency={invoice.currency} onNotice={notice} onPaid={reload}/>)}
      </div>:invoices.length?<p>This order is paid. Finance sees the same payment on the invoice.</p>:<p>Invoice is still being prepared{quoted!=='0.00'?<> · quoted <Money amount={quoted} currency={currency}/></>:null}. Refresh if pay does not appear yet.</p>}
    </Section>
    <Section title="Delivery progress">
      <StatusBadge status={order.status}/>
      <p>Promised delivery: {order.promisedDate??'Not yet agreed'}</p>
      <Table head={['Product','Quantity','Backordered']} rows={order.lines.map(l=>[l.description,l.quantity,order.backorders.find(b=>b.lineId===l.id)?.quantity??0])}/>
    </Section>
    {invoices.map(invoice=><PortalInvoice key={invoice.id} invoice={invoice} reload={reload} notice={notice}/>)}
  </>;
}

function portalSteps(q:PortalQuoteRow){
  const accepted=q.stage==='CONFIRMED';
  const ok=['APPROVED','NOT_REQUIRED'].includes(q.approvalStatus);
  const version=revisionTitle(q.revision);
  return [
    {name:'Quotation',caption:`${version} shared`,state:'done' as const},
    {name:'Supplier approval',caption:q.approvalStatus==='NOT_REQUIRED'?'Not needed':q.approvalStatus==='APPROVED'?'Approved':q.approvalStatus==='REJECTED'?'Being revised':'In review',state:(ok?'done':q.approvalStatus==='REJECTED'?'upcoming':'current') as 'done'|'current'|'upcoming'},
    {name:'Your acceptance',caption:accepted?'Accepted':ok&&!q.dateReviewPending?'Ready for you':q.dateReviewPending?'Date request in review':'After approval',state:(accepted?'done':ok&&!q.dateReviewPending?'current':'upcoming') as 'done'|'current'|'upcoming'},
    {name:'Order',caption:accepted?'Created':'After acceptance',state:(accepted?'done':'upcoming') as 'done'|'upcoming'},
  ];
}

function relatedInvoicesForQuote(data:Portal,q:PortalQuoteRow){
  if(!q.orderId)return [];
  const order=data.orders.find(o=>o.id===q.orderId);
  if(order)return invoicesForOrder(data,order);
  return data.invoices.filter(i=>i.orderId===q.orderId);
}

function seedProposal(q:PortalQuoteRow){
  return Object.fromEntries(q.lines.map(l=>[l.id,{quantity:l.quantity,discountPct:l.discountPct,comment:'' as string}]));
}

function proposalComplete(q:PortalQuoteRow,changes:Record<string,{quantity?:number;discountPct?:number;comment?:string}>,requestedDate:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate))return false;
  return q.lines.every(l=>{
    const row=changes[l.id];
    const comment=row?.comment?.trim()??'';
    return Number.isFinite(row?.quantity)&&Number(row?.quantity)>0&&Number.isFinite(row?.discountPct)&&Number(row?.discountPct)>=0&&comment.length>0;
  });
}

function PortalQuote({q,data,reload,notice}:{q:PortalQuoteRow;data:Portal;reload:()=>Promise<void>;notice:(s:string)=>void}){
  const [changes,setChanges]=useState<Record<string,{quantity?:number;discountPct?:number;comment?:string}>>(()=>seedProposal(q));
  const [requestedDate,setDate]=useState('');
  const [key,setKey]=useState(newId());
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const update=(id:string,k:string,value:unknown)=>{setChanges({...changes,[id]:{...changes[id],[k]:value}});setKey(newId());};
  const locked=q.stage==='CONFIRMED';
  const version=revisionTitle(q.revision);
  const canAccept=!locked&&['APPROVED','NOT_REQUIRED'].includes(q.approvalStatus)&&!q.dateReviewPending;
  const ready=proposalComplete(q,changes,requestedDate);
  const relatedInvoices=relatedInvoicesForQuote(data,q);
  const step=locked
    ?{title:`You accepted ${version}`,detail:'Your order has been created. Pay any open invoice below, then follow delivery.',tone:'done' as const}
    :canAccept
      ?{title:`${version} is ready for your acceptance`,detail:'Accepting confirms the order at exactly these terms. If something should change first, propose it below instead.',tone:'action' as const}
      :q.dateReviewPending
        ?{title:`Your delivery date request (${q.requestedDate}) is being reviewed`,detail:'The supplier will confirm or decline it. Acceptance opens again once they respond.',tone:'waiting' as const}
        :q.approvalStatus==='REJECTED'
          ?{title:'These terms are being revised',detail:'The supplier is updating the quotation. You will see the new version here.',tone:'waiting' as const}
          :{title:'Waiting for supplier approval',detail:`${version} is in the supplier's internal review. You can ask questions or propose changes meanwhile; acceptance opens once it is approved.`,tone:'waiting' as const};
  return <>
    <div className="deal-flow"><FlowSteps steps={portalSteps(q)} label="Quotation progress"/><NextStepCard step={step} eyebrow="Your next step">{locked?<>{q.orderId&&<OpenLink href={'/portal/orders/'+q.orderId}>View your order</OpenLink>}{relatedInvoices[0]&&<OpenLink href={'/portal/invoices/'+relatedInvoices[0].id} variant="secondary">Open invoice</OpenLink>}</>:canAccept?<><FormAction title={`Accept ${version}`} button={`Accept ${version}`} variant="primary" confirmLabel="Accept these terms" description={`You are accepting ${version} exactly as shown, including ${q.totals.map(t=>t.interval==='ONE_TIME'?'the one-time total':`the ${t.interval.toLowerCase()} commitment`).join(' and ')}. This confirms the order.`} onSubmit={async v=>{await api('portal/quotes/'+q.id+'/confirm',{...v,expectedRevision:q.revision});await reload();notice(`You accepted ${version}. Your order has been created. Pay the invoice when it appears.`);}}/><a className="df-button df-button--secondary" href="#propose">Propose a change</a></>:<a className="df-button df-button--secondary" href="#propose">Ask a question</a>}</NextStepCard></div>
    <dl className="deal-meta"><div><dt>Delivery promise</dt><dd>{q.promisedDate??'Not yet agreed'}</dd></div><div><dt>Order discount</dt><dd>{q.orderDiscountPct}%</dd></div><div><dt>Approval</dt><dd><StatusBadge status={q.approvalStatus}/></dd></div></dl>
    <Section title="Current terms">
      <Table
        head={['Product','Quantity','Unit price','Discount','Net','Tax','Total','Billing']}
        rows={q.lines.map(l=>[l.description,l.quantity,<Money amount={l.unitPrice} currency={q.currency}/>,l.discountPct+'%',<Money amount={l.net} currency={q.currency}/>,<Money amount={l.tax} currency={q.currency}/>,<Money amount={l.total} currency={q.currency}/>,l.interval.replaceAll('_',' ').toLowerCase()])}
      />
      <div className="portal-totals">
        {q.totals.map(t=>
          <div key={t.interval}>
            <span>{t.interval==='ONE_TIME'?'One-time total':`${t.interval.toLowerCase()} total`}</span>
            <strong><Money amount={t.total} currency={q.currency}/></strong>
            <small>Net <Money amount={t.net} currency={q.currency}/> · tax <Money amount={t.tax} currency={q.currency}/></small>
          </div>
        )}
      </div>
    </Section>
    {locked&&relatedInvoices.map(invoice=><PortalInvoice key={invoice.id} invoice={invoice} reload={reload} notice={notice}/>)}
    {!locked&&<Section title="Ask a question or propose a change"><div id="propose"/>
      <p className="lede">Quotation quantity and discount stay in the first columns. Use the next columns for the changed quantity and discount. Fill comment and delivery date as well. Submit stays off until every field is filled.</p>
      <form className="proposal-form" onSubmit={async e=>{e.preventDefault();if(!ready)return;setBusy(true);setError('');try{await api('portal/quotes/'+q.id+'/proposals',{expectedRevision:q.revision,requestKey:key,lineChanges:q.lines.map(l=>({lineId:l.id,quantity:changes[l.id]?.quantity,discountPct:changes[l.id]?.discountPct,comment:changes[l.id]?.comment?.trim()})),requestedDeliveryDate:requestedDate});await reload();setChanges(seedProposal(q));setDate('');setKey(newId());notice('Your proposal has been recorded. Review the updated status before accepting.');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
        <Table
          head={['Line','Quotation qty','Changed qty','Quotation discount','Changed discount (%)','Comment']}
          rows={q.lines.map(l=>[
            l.description,
            <span className="quote-current">{l.quantity}</span>,
            <Input label={'Changed quantity '+l.description} type="number" min={0.01} step="any" required value={changes[l.id]?.quantity??''} onChange={e=>update(l.id,'quantity',e.target.value===''?undefined:Number(e.target.value))}/>,
            <span className="quote-current">{l.discountPct}%</span>,
            <Input label={'Changed discount '+l.description} type="number" min={0} max={100} step="any" required value={changes[l.id]?.discountPct??''} onChange={e=>update(l.id,'discountPct',e.target.value===''?undefined:Number(e.target.value))}/>,
            <Input label={'Comment '+l.description} maxLength={2000} required value={changes[l.id]?.comment??''} onChange={e=>update(l.id,'comment',e.target.value)}/>,
          ])}
        />
        <Input label="Requested delivery date (subject to team review)" type="date" value={requestedDate} onChange={e=>{setDate(e.target.value);setKey(newId());}} required/>
        {error&&<p role="alert" className="error">{error} <Button onClick={()=>reload()}>Reload current terms</Button></p>}
        <Button type="submit" disabled={busy||!ready}>{busy?'Submitting…':'Submit proposal / question'}</Button>
      </form>
    </Section>}
    <Section title="Conversation"><Events events={data.messages.filter(m=>m.quoteId===q.id)}/></Section>
    <Section title="Proposed versus previous terms">{data.proposals.filter(p=>p.quoteId===q.id).map(p=><article className="proposal" key={p.id}><h3>{revisionTitle(p.fromRevision)} → {revisionTitle(p.proposedRevision)} · {p.status.replaceAll('_',' ')}</h3><small>{new Date(p.at).toLocaleString()}</small><Table head={['Line','Previous quantity / discount','Requested quantity / discount','Comment']} rows={p.lineChanges.map(c=>{const old=q.history.find(h=>h.revision===p.fromRevision)?.lines.find(l=>l.id===c.lineId)??q.lines.find(l=>l.id===c.lineId);return [old?.description,`${old?.quantity} / ${old?.discountPct}%`,`${c.quantity??'unchanged'} / ${c.discountPct===undefined?'unchanged':c.discountPct+'%'}`,c.comment];})}/>{p.requestedDate&&<p>Requested date: {p.requestedDate}</p>}</article>)}{!data.proposals.some(p=>p.quoteId===q.id)&&<p>No proposals yet.</p>}</Section>
    <Section title="Version history">{[...q.history,q].map(r=><details key={r.revision}><summary>{revisionTitle(r.revision)} · {new Date(r.at).toLocaleString()} · {r.approvalStatus.replaceAll('_',' ')}</summary><Table head={['Line','Quantity','Discount','Total']} rows={r.lines.map(l=>[l.description,l.quantity,l.discountPct+'%',<Money amount={l.total} currency={q.currency}/>])}/></details>)}</Section>
  </>;
}
