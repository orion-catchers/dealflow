'use client';

import {useCallback,useEffect,useLayoutEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {ArrowUpRight,BarChart3,Boxes,CreditCard,FileText,HeartPulse,LayoutDashboard,LogOut,Menu,Package,PanelLeft,PanelLeftClose,Repeat,Settings,ShieldCheck} from 'lucide-react';
import type {Actor,DataState,Role} from '../../contracts/application';
import {api,Button,Heading,Input,Link,Money,Section,StatusBadge,Table,type Context} from './shared';
import Quotes from './Quotes';
import Operations from './Operations';
import Setup from './Setup';
import CustomerPortal from './CustomerPortal';

const navigation=[
  ['/home','Overview',LayoutDashboard],
  ['/quotes','Quotations',FileText],
  ['/approvals','Approvals',ShieldCheck],
  ['/fulfillment','Fulfillment',Package],
  ['/subscriptions','Subscriptions',Repeat],
  ['/invoices','Invoices',CreditCard],
  ['/health','Deal health',HeartPulse],
  ['/reports','Reports',BarChart3],
  ['/products','Catalog',Boxes],
  ['/settings/customers','Setup',Settings],
] as const;

function sessionToActor(data: unknown): Actor | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const nested = value.actor && typeof value.actor === 'object' ? (value.actor as Record<string, unknown>) : value;
  if (typeof nested.id !== 'string' || typeof nested.role !== 'string') return null;
  const role = (nested.role === 'FINANCE' ? 'FINANCE_OPS' : nested.role) as Role;
  return {
    id: nested.id,
    name: typeof nested.name === 'string' ? nested.name : nested.id,
    email: typeof nested.email === 'string' ? nested.email : '',
    role,
    active: nested.active !== false,
    customerId: typeof nested.customerId === 'string' ? nested.customerId : undefined,
  };
}

const sessionHold:{actor:Actor|null;mode:string;data:DataState|null}={actor:null,mode:'NOT CONNECTED',data:null};

function restoreHeldSession(){
  if(sessionHold.actor)return sessionHold;
  if(typeof window==='undefined')return sessionHold;
  try{
    const raw=sessionStorage.getItem('dealflow-session');
    if(!raw)return sessionHold;
    const parsed=JSON.parse(raw) as {actor?:unknown;mode?:string};
    const actor=sessionToActor(parsed.actor??parsed);
    if(actor){
      sessionHold.actor=actor;
      if(typeof parsed.mode==='string')sessionHold.mode=parsed.mode;
    }
  }catch{/* session cache is optional */}
  return sessionHold;
}

export default function Application(){
  const pathname=usePathname()??'/';
  const router=useRouter();
  const [actor,setActor]=useState<Actor|null>(sessionHold.actor);
  const [data,setData]=useState<DataState|null>(sessionHold.data);
  const [mode,setMode]=useState(sessionHold.mode);
  const [sessionReady,setSessionReady]=useState(Boolean(sessionHold.actor)||['/','/login','/signup'].includes(pathname));
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [menu,setMenu]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const viewPath=(()=>{
    if(!actor)return pathname;
    if(actor.role==='CUSTOMER')return pathname.startsWith('/portal')?pathname:'/portal';
    if(pathname.startsWith('/portal')||pathname==='/'||pathname==='/login'||pathname==='/signup')return '/home';
    return pathname;
  })();
  const authRoute=['/','/login','/signup'].includes(pathname);
  const publicPage=!actor&&(authRoute||sessionReady);

  const remember=useCallback((next:Actor|null,nextMode?:string)=>{
    sessionHold.actor=next;
    if(nextMode)sessionHold.mode=nextMode;
    if(!next)sessionHold.data=null;
    setActor(next);
    if(nextMode)setMode(nextMode);
    try{
      if(next)sessionStorage.setItem('dealflow-session',JSON.stringify({actor:next,mode:nextMode??sessionHold.mode}));
      else sessionStorage.removeItem('dealflow-session');
    }catch{/* session cache is optional */}
  },[]);

  const reload=useCallback(async()=>{
    if(actor&&actor.role!=='CUSTOMER'){
      const next=await api<DataState>('workspace');
      sessionHold.data=next;
      setData(next);
    }
  },[actor]);

  useLayoutEffect(()=>{
    const held=restoreHeldSession();
    if(held.actor){
      setActor(held.actor);
      setMode(held.mode);
      if(held.data)setData(held.data);
    }
  },[]);

  useEffect(()=>{
    let cancelled=false;
    fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'}).then(async response=>{
      const result=await response.json();
      if(cancelled)return;
      if(response.ok){remember(sessionToActor(result.data),result.mode??'LIVE');}
      else {
        if(response.status===401)remember(null);
        else if(response.status!==401)setError(result.error?.message??'The session could not be checked.');
      }
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'The session could not be checked.');})
      .finally(()=>{if(!cancelled)setSessionReady(true);});
    return()=>{cancelled=true;};
  },[remember]);

  useEffect(()=>{reload().catch(reason=>setError(reason instanceof Error?reason.message:'The workspace could not be loaded.'));},[reload]);
  useEffect(()=>{
    if(!sessionReady||!actor)return;
    const next=actor.role==='CUSTOMER'?(pathname.startsWith('/portal')?null:'/portal'):(pathname.startsWith('/portal')||pathname==='/'||pathname==='/login'||pathname==='/signup'?'/home':null);
    if(next&&next!==pathname)router.replace(next);
  },[sessionReady,actor,pathname,router]);
  useEffect(()=>{setMenu(false);},[pathname]);
  useEffect(()=>{
    try{setCollapsed(window.localStorage.getItem('dealflow-sidebar')==='collapsed');}catch{/* local preference is optional */}
  },[]);

  const setSidebarCollapsed=(value:boolean)=>{
    setCollapsed(value);
    try{window.localStorage.setItem('dealflow-sidebar',value?'collapsed':'expanded');}catch{/* local preference is optional */}
  };
  const run=async(action:string,body:Record<string,unknown>={})=>{
    const result=await api('actions',{...body,action,requestKey:body.requestKey??crypto.randomUUID()});
    await reload();
    setMessage(mode==='DEV FIXTURE'?'Development record updated.':'Record updated.');
    return result;
  };

  if(publicPage){
    return <Auth path={authRoute?pathname:'/login'} error={error} onLogin={async(nextActor,nextMode)=>{
      if(nextActor.role!=='CUSTOMER'){
        const next=await api<DataState>('workspace');
        sessionHold.data=next;
        setData(next);
      }
      remember(nextActor,nextMode??'LIVE');
      router.replace(nextActor.role==='CUSTOMER'?'/portal':'/home');
    }}/>;
  }
  if(!actor)return null;

  const ctx:Context={d:data!,actor,path:viewPath,reload,run,notice:setMessage};
  const shellClass=`application ${actor.role==='CUSTOMER'?'customer-app ':''}${collapsed?'is-collapsed':''}`;
  return <div className={shellClass}>
    <a className="skip" href="#main">Skip to main content</a>
    <aside className={menu?'sidebar visible':'sidebar'} aria-label="Primary navigation">
      <div className="sidebar-head">
        <Link className="brand wordmark" href={actor.role==='CUSTOMER'?'/portal':'/home'} aria-label="DealFlow360 home">DealFlow<span>360</span></Link>
        <button className="sidebar-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setSidebarCollapsed(!collapsed)}>
          {collapsed?<PanelLeft size={18}/>:<PanelLeftClose size={18}/>} 
        </button>
      </div>
      <p className="nav-caption">{actor.role==='CUSTOMER'?'YOUR BUSINESS':'WORKSPACE'}</p>
      <nav id="primary-navigation">
        {actor.role==='CUSTOMER'?<Link className="active" href="/portal" aria-label="Your deals"><FileText size={18}/><span className="nav-label">Your deals</span></Link>:navigation.filter(([url])=>actor.role!=='SALES_REP'||url!=='/settings/customers').map(([url,name,Icon])=><Link key={url} className={viewPath.startsWith(url)?'active':''} href={url} aria-label={name} title={collapsed?name:undefined}><Icon size={18}/><span className="nav-label">{name}</span></Link>)}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar" aria-hidden="true">{actor.name.split(' ').map(s=>s[0]).join('')}</span>
        <div><strong>{actor.name}</strong><small>{actor.role.replaceAll('_',' ')}</small></div>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={async()=>{remember(null);router.replace('/login');try{await api('auth/logout',{});}catch{/* local sign-out already applied */}}}><LogOut size={18}/></button>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" type="button" aria-expanded={menu} aria-controls="primary-navigation" aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}><Menu size={20}/></button>
        <div><StatusBadge status={mode}/><span className="top-date">{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span></div>
      </header>
      <main id="main">
        {message&&<div className="notice" role="status">{message}<button type="button" onClick={()=>setMessage('')} aria-label="Dismiss notification">×</button></div>}
        {error&&<div role="alert" className="error">{error}<Button onClick={()=>{setError('');reload().catch(reason=>setError(reason instanceof Error?reason.message:'Retry failed.'));}}>Retry</Button></div>}
        {actor.role==='CUSTOMER'?<CustomerPortal path={viewPath}/>:!data?null:viewPath==='/home'?<Home ctx={ctx}/>:viewPath.startsWith('/quotes')||viewPath==='/pipeline'||viewPath.startsWith('/approvals')?<Quotes ctx={ctx}/>:viewPath.startsWith('/products')||viewPath.startsWith('/settings')||viewPath==='/policies'||viewPath==='/price-lists'||viewPath.startsWith('/users')||viewPath.startsWith('/warehouses')||viewPath.startsWith('/customers')?<Setup ctx={ctx}/>:['/fulfillment','/subscriptions','/invoices','/health','/reports','/billing'].some(p=>viewPath.startsWith(p))?<Operations ctx={ctx}/>:<><Heading title="Page not found" description="This route does not exist."/><Link href="/home">Return to overview</Link></>}
      </main>
    </div>
  </div>;
}

function Auth({path,error,onLogin}:{path:string;error:string;onLogin:(actor:Actor,mode?:string)=>void|Promise<void>}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [issue,setIssue]=useState(error);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const landing=path==='/';
  return <div className={`auth-page ${landing?'auth-landing':''}`}>
    <header className="auth-topbar">
      <Link className="wordmark" href="/" aria-label="DealFlow360 home">DealFlow<span>360</span></Link>
      {landing?<nav className="landing-nav" aria-label="Landing page navigation"><a href="#product">Product</a><a href="#process">How it works</a><Link href="/login">Access</Link><Link href="/login">Sign in</Link><Link className="header-cta" href="/login">Get started</Link></nav>:<Link className="auth-back" href="/">Back to home</Link>}
    </header>
    {landing?<main className="auth-body landing-body" id="product">
      <div className="auth-copy">
        <span className="eyebrow">CONNECTED SALES OPERATIONS</span>
        <h1>Every deal.<br/>Every detail.<br/><em>In sync.</em></h1>
        <p>Unify people, process, and data across your revenue engine so deals move forward with clarity and confidence.</p>
        <Link className="primary-link" href="/login">Open your workspace <ArrowUpRight size={18}/></Link>
        <div className="auth-facts" id="process"><span><b>01</b>Configure</span><span><b>02</b>Agree</span><span><b>03</b>Deliver</span></div>
      </div>
    </main>:<main className="auth-body login-body" id="access">
      <div className="auth-form">
        <span className="eyebrow">DEALFLOW360 WORKSPACE</span>
        <h1>{path==='/signup'?'Request an account':'Welcome back'}</h1>
        <p>{path==='/signup'?'Your administrator will verify your access.':'Sign in with your assigned company account.'}</p>
        <p className="dev-copy">DEV FIXTURE · Local seeded accounts</p>
        {done?<div className="notice" role="status">Account requested. Your administrator must activate access.<Link href="/login">Return to sign in</Link></div>:<form onSubmit={async event=>{
          event.preventDefault();setBusy(true);setIssue('');
          try{if(path==='/signup'){await api('auth/signup',{name,email,password});setDone(true);}else{const result=await api<{actor?:Actor;mode?:string;id?:string;name?:string;email?:string;role?:Role;active?:boolean;customerId?:string}>('auth/login',{email,password});const actor=result.actor??sessionToActor(result);if(!actor)throw new Error('Sign in could not be completed.');await onLogin(actor,result.mode??'LIVE');}}
          catch(reason){setIssue(reason instanceof Error?reason.message:'Sign in could not be completed.');}
          finally{setBusy(false);}
        }}>
          {path==='/signup'&&<Input label="Full name" value={name} onChange={event=>setName(event.target.value)} required autoComplete="name"/>}
          <Input label="Work email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="username"/>
          <Input label="Password" type="password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8} autoComplete={path==='/signup'?'new-password':'current-password'}/>
          {issue&&<p role="alert" className="error">{issue}</p>}
          <Button type="submit" disabled={busy}>{busy?'Please wait…':path==='/signup'?'Request access':'Sign in'}</Button>
        </form>}
        <p className="auth-switch">{path==='/signup'?'Already have access?':'Need an account?'} <Link href={path==='/signup'?'/login':'/signup'}>{path==='/signup'?'Sign in':'Request access'}</Link></p>
        <small>Password recovery: contact your company administrator.</small>
      </div>
    </main>}
  </div>;
}

function Home({ctx}:{ctx:Context}){
  const {d,actor}=ctx;
  const metrics=[['Active quotations',d.quotes.filter(q=>q.stage!=='CONFIRMED').length,'/quotes'],['Awaiting approval',d.quotes.filter(q=>q.evaluation.status==='PENDING').length,'/approvals'],['Open invoices',d.invoices.filter(i=>i.status!=='PAID').length,'/invoices'],['Deals needing attention',d.flags.filter(f=>f.status==='OPEN').length,'/health']];
  return <>
    <Heading title={`Good to see you, ${actor.name.split(' ')[0]}`} description="A clear view of your pipeline and the work that needs you next."><Link className="primary-link" href="/quotes/new">New quotation</Link></Heading>
    <div className="metrics">{metrics.map(([name,value,url])=><Link className="metric" href={String(url)} key={name}><span>{name}</span><strong>{value}</strong><small>View details</small></Link>)}</div>
    <Section title="Your recent quotations" actions={<Link href="/quotes">View all</Link>}><Table head={['Quotation','Customer','Status','One-time total','Next step']} rows={d.quotes.slice(0,5).map(q=>[<Link key={q.id} href={'/quotes/'+q.id}>{q.id}<small>{q.name}</small></Link>,d.customers.find(c=>c.id===q.customerId)?.name,<StatusBadge status={q.stage}/>,<Money amount={q.totals.find(t=>t.interval==='ONE_TIME')?.total??'0.00'} currency={q.currency}/>,q.stage==='CONFIRMED'?'Allocate stock':q.evaluation.status==='PENDING'?'Review approval':q.sent?'Await customer acceptance':'Review and send'])}/></Section>
    <div className="two-columns"><Section title="Commitments at a glance"><p>Warehouse and billing previews do not commit your business. Confirm the current, approved terms with your customer first.</p><Link href="/fulfillment">Review fulfillment</Link></Section><Section title="Team follow-ups">{d.tasks.filter(t=>t.status==='OPEN').length?d.tasks.filter(t=>t.status==='OPEN').map(t=><p key={t.id}><Link href={'/quotes/'+t.quoteId}>{t.text}</Link> · {t.dueDate}</p>):<p>No open follow-ups. Deal health will help you spot the next action.</p>}<Link href="/health">Open deal health</Link></Section></div>
  </>;
}
