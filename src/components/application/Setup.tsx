'use client';
import {useState} from 'react';
import {forms,type Field} from '../../contracts/forms';
import {Button,Input,Select,Link,StatusBadge,Money,Heading,Section,Table,FormAction,Fields,api,newId,OpenLink,BackLink,RowActions,label,type Context} from './shared';
import {IntegrationsPanel} from './IntegrationsPanel';

export default function Setup({ctx}:{ctx:Context}){
  const {d,actor,path,run,reload}=ctx;
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');

  if (actor.role === 'CUSTOMER' || actor.role === 'SALES_REP') {
    return (
      <div style={{padding:'2rem'}}>
        <Heading title="Access restricted" description="Your role does not have access to configuration settings." />
        <Link className="df-button df-button--primary" href={actor.role === 'CUSTOMER' ? '/portal' : '/home'}>
          Return to {actor.role === 'CUSTOMER' ? 'portal' : 'overview'}
        </Link>
      </div>
    );
  }

  const rawTab=path.startsWith('/products')?'products':path==='/price-lists'?'priceRules':path==='/policies'?'policies':path.split('/')[2]??(actor.role==='SALES_MANAGER'?'policies':actor.role==='FINANCE_OPS'?'warehouses':'customers');
  const tab=rawTab==='subscriptions'?'plans':rawTab;

  const isTabAllowed = 
    actor.role === 'ADMIN' ||
    (actor.role === 'SALES_MANAGER' && ['policies', 'recommendations', 'health'].includes(tab)) ||
    (actor.role === 'FINANCE_OPS' && ['plans', 'warehouses'].includes(tab));

  if (!isTabAllowed) {
    const fallbackHref = actor.role === 'SALES_MANAGER' ? '/policies' : '/settings/warehouses';
    const fallbackLabel = actor.role === 'SALES_MANAGER' ? 'Go to approval policy' : 'Go to warehouses';
    return (
      <div style={{padding:'2rem'}}>
        <Heading title="Access restricted" description="Your role does not have access to this setting." />
        <Link className="df-button df-button--primary" href={fallbackHref}>{fallbackLabel}</Link>
      </div>
    );
  }

  const canEdit=actor.role==='ADMIN'||(actor.role==='SALES_MANAGER'&&['policies','recommendations','health'].includes(tab))||(actor.role==='FINANCE_OPS'&&['plans','warehouses'].includes(tab));
  const collection=tab==='warehouses'?'warehouses':tab;
  const form=forms[collection];
  const records=(d[collection as 'customers']??[]) as unknown as Record<string,unknown>[];
  const tabs=[['customers','Customers'],['users','Users & roles'],['warehouses','Warehouses & stock'],['plans','Subscription policies'],['recommendations','Recommendations'],['health','Health settings']];

  let nav: (readonly [string, string, boolean])[] = [];
  if (tab === 'products' || tab === 'priceRules') {
    nav = actor.role === 'ADMIN'
      ? [['/products', 'Products & variants', tab === 'products'], ['/price-lists', 'Price lists', tab === 'priceRules']]
      : [['/products', 'Products & variants', tab === 'products']];
  } else if (actor.role === 'ADMIN') {
    nav = [
      ['/settings/customers', 'Customers', tab === 'customers'],
      ['/settings/users', 'Users & roles', tab === 'users'],
      ['/settings/warehouses', 'Warehouses & stock', tab === 'warehouses'],
      ['/settings/plans', 'Subscription policies', tab === 'plans'],
      ['/settings/recommendations', 'Recommendations', tab === 'recommendations'],
      ['/settings/health', 'Health settings', tab === 'health'],
      ['/policies', 'Approval policy', tab === 'policies'],
    ];
  } else if (actor.role === 'SALES_MANAGER') {
    nav = [
      ['/policies', 'Approval policy', tab === 'policies'],
      ['/settings/recommendations', 'Recommendations', tab === 'recommendations'],
      ['/settings/health', 'Health settings', tab === 'health'],
    ];
  } else if (actor.role === 'FINANCE_OPS') {
    nav = [
      ['/settings/warehouses', 'Warehouses & stock', tab === 'warehouses'],
      ['/settings/plans', 'Subscription policies', tab === 'plans'],
    ];
  }

  const productId=tab==='products'?path.split('/')[2]:undefined;
  const listFields=(form?.fields??[]).filter(f=>f.key!=='description'&&f.type!=='checkbox').slice(0,5);
  const namedSource=(source:Field['source'],value:unknown)=>{
    if(value==null||value==='')return '—';
    const rows=source==='reps'?d.users:source==='customers'?d.customers:source==='products'?d.products:source==='warehouses'?d.warehouses:source==='plans'?d.plans:undefined;
    return rows?.find(x=>x.id===String(value))?.name??'—';
  };
  const recordBlurb=tab==='products'?'What you sell, with list price used on quotations.':tab==='customers'?'Companies you quote to, including tier and currency.':tab==='warehouses'?'Locations that hold stock for delivery.':tab==='plans'?'How recurring products are billed.':tab==='priceRules'?'Special prices by customer tier.':'Records used by quoting and billing.';

  return <>
    <Heading
      title={tab==='products'?'Product catalog':tab==='priceRules'?'Customer price lists':tab==='policies'?'Discount & approval policy':tabs.find(t=>t[0]===tab)?.[1]??'Setup'}
      description="Company settings used when you quote, approve, and bill."
    >
      {productId?<BackLink href="/products">Back to catalog</BackLink>:tab==='health'?<BackLink href="/health">Back to deal health</BackLink>:tab==='plans'?<BackLink href="/subscriptions">Back to subscriptions</BackLink>:null}
    </Heading>
    <div className="setup-nav">
      {nav.map(([href,name,active])=><Link key={String(href)} href={String(href)} className={`df-button ${active?'df-button--primary':'df-button--secondary'}`}>{name}</Link>)}
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    {form&&<><div className="filters"><Input label="Search configuration" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find by name, email or reference…"/>{canEdit&&tab!=='users'&&<FormAction title={'Create '+form.title.toLowerCase()} button="Add" fields={form.fields} d={d} initial={Object.fromEntries(form.fields.map(f=>[f.key,f.type==='checkbox'?true:f.options?.[0]??(f.type==='number'?0:'')]))} onSubmit={v=>run('saveRecord',{requestKey:v.requestKey,collection,record:v})}/>}</div><Section title={form.title+' records'}><p className="lede">{recordBlurb}</p><Table head={[...listFields.map(f=>f.label),'Actions']} rows={records.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).map(r=>[...listFields.map(f=>{const value=r[f.key];if(typeof value==='boolean')return <StatusBadge status={value?'ACTIVE':'INACTIVE'}/>;if(['price','cost','shippingCost'].includes(f.key))return <Money amount={String(value)} currency="INR"/>;if(f.source)return namedSource(f.source,value);if(f.options)return label(String(value??'—'));return String(value??'—');}),<RowActions>{tab==='products'&&<OpenLink href={'/products/'+String(r.id)} variant="secondary"/>}{canEdit?<FormAction title={'Edit '+form.title.toLowerCase()} button="Edit" fields={form.fields} initial={r} d={d} onSubmit={v=>run('saveRecord',{requestKey:v.requestKey,id:r.id,collection,record:v})}/>:<span className="muted">View only</span>}</RowActions>])}/></Section></>}
    {tab==='products'&&d.products.filter(p=>path.split('/')[2]?p.id===path.split('/')[2]:true).map(p=><Section title={p.name+' · variants'} key={p.id} actions={canEdit?<FormAction title="Add variant" fields={[{key:'text',label:'Variant / attribute combination',required:true},{key:'extraPrice',label:'Extra price',type:'number',min:0,required:true}]} initial={{extraPrice:0}} onSubmit={v=>run('variant',{...v,id:p.id})}/>:undefined}><Table head={['Variant','Extra price','Stock tracked','Status']} rows={p.variants.map(v=>[v.name,<Money amount={v.extraPrice} currency="INR"/>,p.stockTracked?'Yes':'No',<StatusBadge status={p.active?'ACTIVE':'INACTIVE'}/>])}/></Section>)}
    {tab==='warehouses'&&<Section title="Stock on hand" actions={canEdit?<FormAction title="Receive stock" d={d} fields={[{key:'warehouseId',label:'Warehouse',type:'select',source:'warehouses',required:true},{key:'variantId',label:'Physical variant',type:'select',source:'variants',required:true},{key:'quantity',label:'Received quantity',type:'number',min:1,required:true}]} onSubmit={v=>run('stockReceipt',v)}/>:undefined}><p className="lede">Units in each warehouse. Available is on hand minus reserved.</p><Table head={['Product / variant','Warehouse','On hand','Reserved','Available','Threshold','Action']} rows={d.stock.map(s=>{const p=d.products.find(p=>p.variants.some(v=>v.id===s.variantId));return [p?.name+' / '+p?.variants.find(v=>v.id===s.variantId)?.name,d.warehouses.find(w=>w.id===s.warehouseId)?.name,s.onHand,s.reserved,s.onHand-s.reserved,<>{s.threshold} {s.onHand-s.reserved<=s.threshold&&<StatusBadge status="PENDING_APPROVAL" label="Replenish"/>}</>,canEdit?<FormAction title="Set replenishment threshold" button="Threshold" fields={[{key:'threshold',label:'Minimum available quantity',type:'number',min:0,required:true}]} initial={{threshold:s.threshold}} onSubmit={v=>run('stockThreshold',{...v,id:s.id})}/>:null];})}/></Section>}
    {tab==='policies'&&<Policy ctx={ctx} editable={canEdit}/>}
    {tab==='health'&&<Section title="When a deal is flagged"><p className="lede">How long a quote can sit idle, and how far margin can drift, before Deal health shows a warning.</p><FormAction title={canEdit?'Edit health settings':'View health settings'} button="Edit" fields={[{key:'stalledDays',label:'Stalled after days',type:'number',min:1,required:true},{key:'anomalyPoints',label:'Margin anomaly threshold (percentage points)',type:'number',min:0,required:true},{key:'minimumHistory',label:'Minimum comparable history',type:'number',min:1,required:true}]} initial={{...d.healthSettings}} onSubmit={v=>run('healthSettings',{requestKey:v.requestKey,settings:v})}/><dl>{Object.entries(d.healthSettings).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></Section>}
    {tab==='recommendations'&&<Section title="Suggested add-ons" actions={canEdit?<RuleForm ctx={ctx}/>:undefined}><p className="lede">When a quote includes the base product, suggest the paired product. Score is ranking; minimum margin is the floor before a suggestion is shown.</p><Table head={['When they quote','Suggest','Promotion','Score','Min. margin','On','Actions']} rows={d.rules.map(r=>[d.products.find(p=>p.id===r.baseProductId)?.name??'Any product',d.products.find(p=>p.id===r.candidateProductId)?.name,r.promotionLabel??'—',r.coPurchaseScore,r.minimumMarginPct+'%',r.active?'Yes':'No',canEdit?<RowActions><RuleForm ctx={ctx} rule={r}/><FormAction title="Delete this suggestion" button="Delete" danger onSubmit={async()=>{await api('recommendations/rules',{rules:d.rules.filter(x=>x.id!==r.id)});await reload();}}/></RowActions>:null])}/></Section>}
    {tab==='users'&&<p className="hint">People request access on signup. An admin then assigns a role before they can sign in.</p>}
    {actor.role==='ADMIN'&&<IntegrationsPanel/>}
    {actor.role==='ADMIN'&&<Section title="Reset sample data"><div className="defined-block"><p>Puts this local demo back to the original sample customers, quotes, and logins. Use if the demo got messy. Does not change a live database.</p><FormAction title="Reset sample data" button="Reset sample data" danger description="This restores the original demo records on this machine only." onSubmit={v=>run('reset',v)}/></div></Section>}
  </>;
}

function RuleForm({ctx,rule}:{ctx:Context;rule?:Context['d']['rules'][number]}){
  const {d,reload}=ctx;
  return <FormAction title={rule?'Edit suggestion':'Add a suggestion'} button={rule?'Edit':'Add'} d={d} initial={rule?{...rule,baseProductId:rule.baseProductId??'',promotionLabel:rule.promotionLabel??''}:{baseProductId:'',coPurchaseScore:0,minimumMarginPct:20,active:true,promotionLabel:''}} fields={[{key:'baseProductId',label:'Base product (blank for fallback)',type:'select',source:'products'},{key:'candidateProductId',label:'Suggested product',type:'select',source:'products',required:true},{key:'promotionLabel',label:'Promotion label'},{key:'coPurchaseScore',label:'Co-purchase ranking score',type:'number',min:0,required:true},{key:'minimumMarginPct',label:'Minimum candidate margin (%)',type:'number',min:0,max:100,required:true},{key:'active',label:'Active',type:'checkbox'}]} onSubmit={async v=>{const next={id:rule?.id??newId(),baseProductId:String(v.baseProductId)||null,candidateProductId:String(v.candidateProductId),promotionLabel:String(v.promotionLabel)||null,coPurchaseScore:Number(v.coPurchaseScore),minimumMarginPct:Number(v.minimumMarginPct),active:v.active===true};await api('recommendations/rules',{rules:[...d.rules.filter(r=>r.id!==rule?.id),next]});await reload();}}/>;
}

function Policy({ctx,editable}:{ctx:Context;editable:boolean}){
  const {d,run}=ctx,[value,set]=useState<Record<string,unknown>>({...d.policy.tierLimits,...d.policy.categoryLimits,financeExcess:d.policy.financeExcess,financeWeighted:d.policy.financeWeighted,budget:d.policy.budget}),[error,setError]=useState('');
  const fields:Field[]=[...Object.keys(d.policy.tierLimits),...Object.keys(d.policy.categoryLimits)].map(key=>({key,label:key+' discount limit (%)',type:'number',min:0,max:100,required:true}));
  fields.push({key:'financeExcess',label:'Finance worst-line excess (points)',type:'number',min:0,max:100,required:true},{key:'financeWeighted',label:'Finance weighted excess (points)',type:'number',min:0,max:100,required:true},{key:'budget',label:'Discount budget (INR)',type:'number',min:0,required:true});
  return <Section title="Discount limits and sequential routing"><p>Effective limits use both customer tier and category. Manager review precedes Finance when risk thresholds are exceeded.</p><form onSubmit={async e=>{e.preventDefault();try{await run('policy',{policy:{tierLimits:Object.fromEntries(Object.keys(d.policy.tierLimits).map(k=>[k,Number(value[k])])),categoryLimits:Object.fromEntries(Object.keys(d.policy.categoryLimits).map(k=>[k,Number(value[k])])),financeExcess:Number(value.financeExcess),financeWeighted:Number(value.financeWeighted),budget:String(value.budget)}});setError('');}catch(e){setError((e as Error).message);}}}><fieldset disabled={!editable}><Fields fields={fields} value={value} set={set}/>{error&&<p className="error" role="alert">{error}</p>}<Button type="submit">Save policy</Button></fieldset></form></Section>;
}
