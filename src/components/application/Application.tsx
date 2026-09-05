'use client';

import {useCallback,useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {BarChart3,Boxes,CircleCheck,CreditCard,FileText,HeartPulse,LayoutDashboard,LogOut,Menu,Package,PanelLeft,PanelLeftClose,Repeat,Settings,Settings2,ShieldCheck,UsersRound} from 'lucide-react';
import type {Actor,DataState,Role} from '../../contracts/application';
import {api,Button,Heading,Input,Link,Money,Section,StatusBadge,Table,type Context} from './shared';
import Quotes from './Quotes';
import Operations from './Operations';
import Setup from './Setup';
import CustomerPortal from './CustomerPortal';
import PublicHeader from './PublicHeader';

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

export default function Application(){
  const pathname=usePathname()??'/';
  const router=useRouter();
  const [actor,setActor]=useState<Actor|null>(null);
  const [data,setData]=useState<DataState|null>(null);
  const [mode,setMode]=useState('NOT CONNECTED');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [menu,setMenu]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const publicPage=['/','/login','/signup'].includes(pathname);

  const reload=useCallback(async()=>{
    if(actor&&actor.role!=='CUSTOMER')setData(await api<DataState>('workspace'));
  },[actor]);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    fetch('/api/auth/me',{cache:'no-store'}).then(async response=>{
      const result=await response.json();
      if(cancelled)return;
      if(response.ok){setActor(sessionToActor(result.data));setMode(result.mode??'LIVE');}
      else if(response.status!==401)setError(result.error?.message??'The session could not be checked.');
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'The session could not be checked.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{reload().catch(reason=>setError(reason instanceof Error?reason.message:'The workspace could not be loaded.'));},[reload]);
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

  if(publicPage)return <Auth path={pathname} mode={mode} error={error} onLogin={(nextActor,nextMode)=>{setActor(nextActor);setMode(nextMode??'LIVE');router.push(nextActor.role==='CUSTOMER'?'/portal':'/home');}}/>;
  if(loading)return <main className="standalone" role="status">Loading your workspace…</main>;
  if(!actor)return <main className="standalone"><h1>{error?'Service not connected':'Sign in to continue'}</h1><p>{error||'Your session has expired or you have not signed in.'}</p><Link href="/login">Open sign in</Link></main>;
  if(actor.role==='CUSTOMER'&&!pathname.startsWith('/portal'))return <main className="standalone"><h1>Customer access only</h1><Link href="/portal">Open your customer portal</Link></main>;
  if(actor.role!=='CUSTOMER'&&pathname.startsWith('/portal'))return <main className="standalone"><h1>Customer account required</h1><Link href="/home">Return to workspace</Link></main>;

  const ctx:Context={d:data!,actor,path:pathname,reload,run,notice:setMessage};
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
        {actor.role==='CUSTOMER'?<Link className="active" href="/portal" aria-label="Your deals" title="Your deals"><FileText size={18}/><span className="nav-label">Your deals</span></Link>:navigation.filter(([url])=>actor.role!=='SALES_REP'||url!=='/settings/customers').map(([url,name,Icon])=><Link key={url} className={pathname.startsWith(url)?'active':''} href={url} aria-label={name} title={collapsed?name:undefined}><Icon size={18}/><span className="nav-label">{name}</span></Link>)}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar" aria-hidden="true">{actor.name.split(' ').map(s=>s[0]).join('')}</span>
        <div><strong>{actor.name}</strong><small>{actor.role.replaceAll('_',' ')}</small></div>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={async()=>{await api('auth/logout',{});location.href='/login';}}><LogOut size={18}/></button>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" type="button" aria-expanded={menu} aria-controls="primary-navigation" aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}><Menu size={20}/></button>
        <span>Sales operations <span className="muted">/ {pathname.split('/').filter(Boolean)[0]??'home'}</span></span>
        <div><StatusBadge status={mode}/><span className="top-date">{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span></div>
      </header>
      <main id="main">
        {message&&<div className="notice" role="status">{message}<button type="button" onClick={()=>setMessage('')} aria-label="Dismiss notification">×</button></div>}
        {error&&<div role="alert" className="error">{error}<Button onClick={()=>{setError('');reload().catch(reason=>setError(reason instanceof Error?reason.message:'Retry failed.'));}}>Retry</Button></div>}
        {actor.role==='CUSTOMER'?<CustomerPortal path={pathname}/>:!data?<p className="inline-loading" role="status">Loading business records…</p>:pathname==='/home'?<Home ctx={ctx}/>:pathname.startsWith('/quotes')||pathname==='/pipeline'||pathname.startsWith('/approvals')?<Quotes ctx={ctx}/>:pathname.startsWith('/products')||pathname.startsWith('/settings')||pathname==='/policies'||pathname==='/price-lists'?<Setup ctx={ctx}/>:['/fulfillment','/subscriptions','/invoices','/health','/reports'].some(p=>pathname.startsWith(p))?<Operations ctx={ctx}/>:<><Heading title="Page not found" description="This route does not exist."/><Link href="/home">Return to overview</Link></>}
      </main>
    </div>
  </div>;
}

function Auth({path,mode,error,onLogin}:{path:string;mode:string;error:string;onLogin:(actor:Actor,mode?:string)=>void}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [issue,setIssue]=useState(error);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [publicMenuOpen,setPublicMenuOpen]=useState(false);
  const [recovery,setRecovery]=useState<'none'|'request'|'confirm'>('none');
  const [resetToken,setResetToken]=useState('');
  const [resetPassword,setResetPassword]=useState('');
  const [recoveryMsg,setRecoveryMsg]=useState('');
  const [recoveryOk,setRecoveryOk]=useState(false);
  const landing=path==='/';
  return <div className={`auth-page ${landing?'auth-landing':''}`} data-public-panel-open={publicMenuOpen}>
    <PublicHeader key={path} landing={landing} onOpenChange={setPublicMenuOpen}/>
    {landing?<main className="auth-body landing-body" id="product" inert={publicMenuOpen}>
      <div className="auth-copy">
        <h1>Every deal.<br/>Every detail.<br/><em>In sync.</em></h1>
        <p>Unify people, process, and data across your revenue engine so deals move forward with clarity and confidence.</p>
        <Link className="primary-link" href="/login">Open your workspace</Link>
        <div className="auth-facts" id="process">
          <article className="auth-step"><b className="auth-step-number">01</b><div className="auth-step-detail"><div className="auth-step-icon"><Settings2 size={22} strokeWidth={1.6}/></div><div className="auth-step-copy"><strong>Configure</strong><small>Tailor your pipeline, stages, and workflows to your go-to-market.</small></div></div></article>
          <article className="auth-step"><b className="auth-step-number">02</b><div className="auth-step-detail"><div className="auth-step-icon"><UsersRound size={22} strokeWidth={1.6}/></div><div className="auth-step-copy"><strong>Agree</strong><small>Align teams and stakeholders with shared visibility.</small></div></div></article>
          <article className="auth-step"><b className="auth-step-number">03</b><div className="auth-step-detail"><div className="auth-step-icon"><CircleCheck size={22} strokeWidth={1.6}/></div><div className="auth-step-copy"><strong>Deliver</strong><small>Execute with confidence and keep deals moving forward.</small></div></div></article>
        </div>
      </div>
    </main>:<main className="auth-body login-body" id="access" inert={publicMenuOpen}>
      <div className="auth-form">
        <span className="eyebrow">DEALFLOW360 WORKSPACE</span>
        <h1>{path==='/signup'?'Request an account':'Welcome back'}</h1>
        <p>{path==='/signup'?'Your administrator will verify your access.':'Sign in with your assigned company account.'}</p>
        <p className="dev-copy">{mode==='DEV FIXTURE'?'DEV FIXTURE · Local JSON store accounts':'LIVE · Use seeded company accounts from the README'}</p>
        {done?<div className="notice" role="status">Account requested. Your administrator must activate access.<Link href="/login">Return to sign in</Link></div>:<form onSubmit={async event=>{
          event.preventDefault();setBusy(true);setIssue('');
          try{if(path==='/signup'){await api('auth/signup',{name,email,password});setDone(true);}else{const result=await api<{actor?:Actor;mode?:string;id?:string;name?:string;email?:string;role?:Role;active?:boolean;customerId?:string}>('auth/login',{email,password});const actor=result.actor??sessionToActor(result);if(!actor)throw new Error('Sign in could not be completed.');onLogin(actor,result.mode??'LIVE');}}
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
        <small className="auth-recovery">{recovery==='none'&&recoveryOk?<span>Password updated. Sign in with your new password.</span>:recovery==='none'&&<button type="button" onClick={()=>{setRecovery('request');setRecoveryOk(false);setRecoveryMsg('');}}>Forgot password?</button>}{recovery==='request'&&<form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api('auth/password-reset',{email});setRecovery('confirm');setRecoveryMsg('If that account exists, a reset request was recorded. Email delivery is not configured; use the token from the server log (development) or ask your administrator.');}catch(reason){setIssue(reason instanceof Error?reason.message:'Reset request failed.');}finally{setBusy(false);}}} aria-label="Password recovery"><Input label="Work email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="username"/><Button type="submit" disabled={busy}>{busy?'Please wait…':'Send reset request'}</Button> <button type="button" onClick={()=>setRecovery('none')}>Cancel</button></form>}{recovery==='confirm'&&<div><div className="notice" role="status">{recoveryMsg}</div><form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api('auth/password-reset/confirm',{token:resetToken.trim(),newPassword:resetPassword});setRecovery('none');setResetToken('');setResetPassword('');setRecoveryOk(true);}catch(reason){setIssue(reason instanceof Error?reason.message:'Reset failed; check the token and try again.');}finally{setBusy(false);}}} aria-label="Set new password"><Input label="Reset token" value={resetToken} onChange={event=>setResetToken(event.target.value)} required/><Input label="New password" type="password" value={resetPassword} onChange={event=>setResetPassword(event.target.value)} required minLength={8} autoComplete="new-password"/><Button type="submit" disabled={busy}>{busy?'Please wait…':'Set new password'}</Button></form></div>}</small>
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
