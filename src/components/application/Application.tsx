'use client';

import {Suspense,useCallback,useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {BarChart3,Boxes,CircleCheck,CreditCard,FileText,HeartPulse,LayoutDashboard,LogOut,Menu,Package,PanelLeft,PanelLeftClose,Repeat,Settings,Settings2,ShieldCheck,UsersRound} from 'lucide-react';
import type {Actor,DataState,Role} from '../../contracts/application';
import {api,Button,Heading,Input,Link,Money,Section,StatusBadge,Table,newId,quoteTitle,OpenLink,type Context} from './shared';
import Quotes from './Quotes';
import Operations from './Operations';
import Setup from './Setup';
import CustomerPortal from './CustomerPortal';
import {clearPortalCache,rememberPortal} from './portal-cache';
import PublicHeader from './PublicHeader';
import {FulfillmentList} from '@/features/inventory/ui/FulfillmentList';
import {FulfillmentDetailView} from '@/features/inventory/ui/FulfillmentDetailView';
import {ReportsDashboard} from '@/features/reports/ui/ReportsDashboard';

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

type ShellMemory={actor:Actor;mode:string;data:DataState|null};
const SHELL_KEY='dealflow-shell';
const SIGNED_OUT_KEY='dealflow-signed-out';
let shellMemory:ShellMemory|null=null;

function wasSignedOut(){
  if(typeof window==='undefined')return false;
  try{return window.sessionStorage.getItem(SIGNED_OUT_KEY)==='1';}catch{return false;}
}

function markSignedOut(){
  shellMemory=null;
  if(typeof window==='undefined')return;
  try{
    window.sessionStorage.removeItem(SHELL_KEY);
    window.sessionStorage.setItem(SIGNED_OUT_KEY,'1');
  }catch{/* quota is optional */}
}

function readShell():ShellMemory|null{
  if(typeof window==='undefined')return null;
  if(wasSignedOut()){shellMemory=null;return null;}
  if(shellMemory)return shellMemory;
  try{
    const raw=window.sessionStorage.getItem(SHELL_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as ShellMemory;
    if(!parsed?.actor||typeof parsed.actor.id!=='string')return null;
    shellMemory=parsed;
    return parsed;
  }catch{
    return null;
  }
}

function writeShell(next:ShellMemory|null){
  shellMemory=next;
  if(typeof window==='undefined')return;
  try{
    if(!next)window.sessionStorage.removeItem(SHELL_KEY);
    else{
      window.sessionStorage.removeItem(SIGNED_OUT_KEY);
      window.sessionStorage.setItem(SHELL_KEY,JSON.stringify(next));
    }
  }catch{/* quota is optional */}
}

function isAuthPath(path:string){return path==='/'||path==='/login'||path==='/signup';}
function isPortalPath(path:string){return path==='/portal'||path.startsWith('/portal/');}
function homeFor(next:Actor){return next.role==='CUSTOMER'?'/portal':'/home';}
function viewPathFor(next:Actor|null,path:string){
  if(!next)return isAuthPath(path)?path:'/login';
  if(next.role==='CUSTOMER')return isPortalPath(path)?path:'/portal';
  if(isAuthPath(path)||isPortalPath(path))return '/home';
  return path;
}

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
    companyId: typeof nested.companyId === 'string' ? nested.companyId : undefined,
  };
}

export default function Application(){
  const pathname=usePathname()??'/';
  const router=useRouter();
  const remembered=readShell();
  const [actor,setActor]=useState<Actor|null>(remembered?.actor??null);
  const [data,setData]=useState<DataState|null>(remembered?.data??null);
  const [mode,setMode]=useState(remembered?.mode??'NOT CONNECTED');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [menu,setMenu]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const sessionActor=wasSignedOut()?null:actor;
  const viewPath=viewPathFor(sessionActor,pathname);
  const showAuth=!sessionActor&&(isAuthPath(pathname)||wasSignedOut());

  const reload=useCallback(async()=>{
    if(actor&&actor.role!=='CUSTOMER')setData(await api<DataState>('workspace'));
  },[actor]);

  useEffect(()=>{
    if(!sessionActor){
      if(wasSignedOut()&&!isAuthPath(pathname)) router.replace('/login');
      return;
    }
    if(viewPath!==pathname) router.replace(viewPath);
  },[sessionActor,pathname,router,viewPath]);

  useEffect(()=>{
    const onShow=(event:PageTransitionEvent)=>{
      if(!event.persisted)return;
      if(wasSignedOut()){
        writeShell(null);
        setActor(null);
        setData(null);
        clearPortalCache();
        router.replace('/login');
        return;
      }
      fetch('/api/auth/me',{cache:'no-store'}).then(async response=>{
        const result=await response.json();
        if(response.status===401){
          markSignedOut();
          setActor(null);
          setData(null);
          clearPortalCache();
          router.replace('/login');
          return;
        }
        if(response.ok){
          const next=sessionToActor(result.data);
          if(next){setActor(next);setMode(result.mode??'LIVE');}
        }
      }).catch(()=>{/* pageshow recheck is best-effort */});
    };
    window.addEventListener('pageshow',onShow);
    return()=>window.removeEventListener('pageshow',onShow);
  },[router]);

  useEffect(()=>{
    let cancelled=false;
    if(showAuth)return;
    fetch('/api/auth/me',{cache:'no-store'}).then(async response=>{
      const result=await response.json();
      if(cancelled)return;
      if(response.ok){
        const next=sessionToActor(result.data);
        if(next){setActor(next);setMode(result.mode??'LIVE');}
      }else if(response.status===401){
        markSignedOut();
        writeShell(null);
        setActor(null);
        setData(null);
        clearPortalCache();
      }else setError(result.error?.message??'The session could not be checked.');
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'The session could not be checked.');});
    return()=>{cancelled=true;};
  },[showAuth]);

  useEffect(()=>{reload().catch(reason=>setError(reason instanceof Error?reason.message:'The workspace could not be loaded.'));},[reload]);
  useEffect(()=>{
    if(wasSignedOut()&&actor){
      setActor(null);
      setData(null);
      clearPortalCache();
    }
  },[actor]);
  useEffect(()=>{
    if(sessionActor)writeShell({actor:sessionActor,mode,data});
  },[sessionActor,mode,data]);
  useEffect(()=>{setMenu(false);},[pathname]);
  useEffect(()=>{
    try{setCollapsed(window.localStorage.getItem('dealflow-sidebar')==='collapsed');}catch{/* local preference is optional */}
  },[]);

  const setSidebarCollapsed=(value:boolean)=>{
    setCollapsed(value);
    try{window.localStorage.setItem('dealflow-sidebar',value?'collapsed':'expanded');}catch{/* local preference is optional */}
  };
  const run=async(action:string,body:Record<string,unknown>={})=>{
    const result=await api('actions',{...body,action,requestKey:body.requestKey??newId()});
    await reload();
    setMessage(mode==='DEV FIXTURE'?'Development record updated.':'Record updated.');
    return result;
  };

  if(showAuth||!sessionActor)return showAuth?<Auth path={isAuthPath(pathname)?pathname:'/login'} mode={mode} error={error} onLogin={async(nextActor,nextMode)=>{
    const nextModeValue=nextMode??'LIVE';
    setError('');
    if(nextActor.role==='CUSTOMER'){
      try{rememberPortal(await api('portal'));}
      catch(reason){clearPortalCache();setError(reason instanceof Error?reason.message:'The customer workspace could not be loaded.');}
      setData(null);
      writeShell({actor:nextActor,mode:nextModeValue,data:null});
    }else{
      clearPortalCache();
      try{
        const workspace=await api<DataState>('workspace');
        setData(workspace);
        writeShell({actor:nextActor,mode:nextModeValue,data:workspace});
      }catch(reason){
        writeShell({actor:nextActor,mode:nextModeValue,data:null});
        setError(reason instanceof Error?reason.message:'The workspace could not be loaded.');
      }
    }
    setActor(nextActor);
    setMode(nextModeValue);
    router.replace(homeFor(nextActor));
  }}/>:null;
  const shellPath=viewPath;

  const ctx:Context={d:data!,actor:sessionActor,path:shellPath,reload,run,notice:setMessage};
  const shellClass=`application ${sessionActor.role==='CUSTOMER'?'customer-app ':''}${collapsed?'is-collapsed':''}`;
  return <div className={shellClass}>
    <a className="skip" href="#main">Skip to main content</a>
    <aside className={menu?'sidebar visible':'sidebar'} aria-label="Primary navigation">
      <div className="sidebar-head">
        <Link className="brand wordmark" href={sessionActor.role==='CUSTOMER'?'/portal':'/home'} aria-label="DealFlow360 home">DealFlow<span>360</span></Link>
        <button className="sidebar-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setSidebarCollapsed(!collapsed)}>
          {collapsed?<PanelLeft size={18}/>:<PanelLeftClose size={18}/>}
        </button>
      </div>
      <p className="nav-caption">{sessionActor.role==='CUSTOMER'?'YOUR BUSINESS':'WORKSPACE'}</p>
      <nav id="primary-navigation">
        {sessionActor.role==='CUSTOMER'?<Link className={shellPath.startsWith('/portal')?'active':''} href="/portal" aria-label="Your deals" title="Your deals"><FileText size={18}/><span className="nav-label">Your deals</span></Link>:navigation.filter(([url])=>sessionActor.role!=='SALES_REP'||url!=='/settings/customers').map(([url,name,Icon])=><Link key={url} className={shellPath.startsWith(url)?'active':''} href={url} aria-label={name} title={collapsed?name:undefined}><Icon size={18}/><span className="nav-label">{name}</span></Link>)}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar" aria-hidden="true">{sessionActor.name.split(' ').map(s=>s[0]).join('')}</span>
        <div><strong>{sessionActor.name}</strong><small>{sessionActor.role.replaceAll('_',' ')}</small></div>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={async()=>{markSignedOut();writeShell(null);setActor(null);setData(null);clearPortalCache();try{await api('auth/logout',{});}catch{/* leave locally even if the server call fails */}window.location.replace('/login');}}><LogOut size={18}/></button>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" type="button" aria-expanded={menu} aria-controls="primary-navigation" aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}><Menu size={20}/></button>
        <div className="topbar-end"><StatusBadge status={mode}/><span className="top-date">{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span></div>
      </header>
      <main id="main">
        {message&&<div className="notice" role="status">{message}<button type="button" onClick={()=>setMessage('')} aria-label="Dismiss notification">×</button></div>}
        {error&&<div role="alert" className="error">{error}<Button onClick={()=>{setError('');reload().catch(reason=>setError(reason instanceof Error?reason.message:'Retry failed.'));}}>Retry</Button></div>}
        {sessionActor.role==='CUSTOMER'?<CustomerPortal path={shellPath}/>:!data?null:shellPath==='/home'?<Home ctx={ctx}/>:shellPath.startsWith('/quotes')||shellPath==='/pipeline'||shellPath.startsWith('/approvals')?<Quotes ctx={ctx}/>:shellPath.startsWith('/products')||shellPath.startsWith('/settings')||shellPath==='/policies'||shellPath==='/price-lists'?<Setup ctx={ctx}/>:shellPath.startsWith('/fulfillment')?(shellPath.split('/')[2]?<FulfillmentDetailView orderId={shellPath.split('/')[2]}/>:<FulfillmentList/>):shellPath.startsWith('/reports')?<Suspense fallback={<p className="hint">Loading reports…</p>}><ReportsDashboard/></Suspense>:['/subscriptions','/invoices','/health'].some(p=>shellPath.startsWith(p))?<Operations ctx={ctx}/>:<><Heading title="Page not found" description="This route does not exist."/><Link href="/home">Return to overview</Link></>}
      </main>
    </div>
  </div>;
}

function Auth({path,mode,error,onLogin}:{path:string;mode:string;error:string;onLogin:(actor:Actor,mode?:string)=>void|Promise<void>}){
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
        <p className="dev-copy">{mode==='DEV FIXTURE'?'DEV FIXTURE · Local JSON store accounts':'LIVE · Seeded sales demo below — do not use password123'}</p>
        {path!=='/signup'&&<small className="auth-demo">Email <code>arjun@nexa.example</code> · password <code>arjun-nexa-2026!</code>{' '}<button type="button" onClick={()=>{setEmail('arjun@nexa.example');setPassword('arjun-nexa-2026!');setIssue('');}}>Fill demo</button></small>}
        {done?<div className="notice" role="status">Account requested. Your administrator must activate access.<Link href="/login">Return to sign in</Link></div>:<form onSubmit={async event=>{
          event.preventDefault();setBusy(true);setIssue('');
          const submitted=new FormData(event.currentTarget);
          const nextEmail=String(submitted.get('email')??email).trim();
          const nextPassword=String(submitted.get('password')??password);
          const nextName=String(submitted.get('name')??name).trim();
          try{if(path==='/signup'){await api('auth/signup',{name:nextName,email:nextEmail,password:nextPassword});setDone(true);}else{const result=await api<{actor?:Actor;mode?:string;id?:string;name?:string;email?:string;role?:Role;active?:boolean;customerId?:string}>('auth/login',{email:nextEmail,password:nextPassword});const actor=result.actor??sessionToActor(result);if(!actor)throw new Error('Sign in could not be completed.');await onLogin(actor,result.mode??'LIVE');}}
          catch(reason){setIssue(reason instanceof Error?reason.message:'Sign in could not be completed.');}
          finally{setBusy(false);}
        }}>
          {path==='/signup'&&<Input label="Full name" name="name" value={name} onChange={event=>setName(event.target.value)} required autoComplete="name"/>}
          <Input label="Work email" name="email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="username"/>
          <Input label="Password" name="password" type="password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8} autoComplete={path==='/signup'?'new-password':'off'}/>
          {issue&&<p role="alert" className="error">{issue}</p>}
          <Button type="submit" disabled={busy}>{busy?'Please wait…':path==='/signup'?'Request access':'Sign in'}</Button>
        </form>}
        <p className="auth-switch">{path==='/signup'?'Already have access?':'Need an account?'} <Link href={path==='/signup'?'/login':'/signup'}>{path==='/signup'?'Sign in':'Request access'}</Link></p>
        {path!=='/signup'&&<GoogleSsoLink/>}
        <small className="auth-recovery">{recovery==='none'&&recoveryOk?<span>Password updated. Sign in with your new password.</span>:recovery==='none'&&<button type="button" onClick={()=>{setRecovery('request');setRecoveryOk(false);setRecoveryMsg('');}}>Forgot password?</button>}{recovery==='request'&&<form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api('auth/password-reset',{email});setRecovery('confirm');setRecoveryMsg('If that account exists, a reset was recorded. With RESEND_API_KEY or MAIL_WEBHOOK_URL the token is emailed; otherwise it is printed in the server log in development.');}catch(reason){setIssue(reason instanceof Error?reason.message:'Reset request failed.');}finally{setBusy(false);}}} aria-label="Password recovery"><Input label="Work email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="username"/><Button type="submit" disabled={busy}>{busy?'Please wait…':'Send reset request'}</Button> <button type="button" onClick={()=>setRecovery('none')}>Cancel</button></form>}{recovery==='confirm'&&<div><div className="notice" role="status">{recoveryMsg}</div><form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api('auth/password-reset/confirm',{token:resetToken.trim(),newPassword:resetPassword});setRecovery('none');setResetToken('');setResetPassword('');setRecoveryOk(true);}catch(reason){setIssue(reason instanceof Error?reason.message:'Reset failed; check the token and try again.');}finally{setBusy(false);}}} aria-label="Set new password"><Input label="Reset token" value={resetToken} onChange={event=>setResetToken(event.target.value)} required/><Input label="New password" type="password" value={resetPassword} onChange={event=>setResetPassword(event.target.value)} required minLength={8} autoComplete="new-password"/><Button type="submit" disabled={busy}>{busy?'Please wait…':'Set new password'}</Button></form></div>}</small>
      </div>
    </main>}
  </div>;
}

function GoogleSsoLink(){
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    fetch('/api/integrations/public',{cache:'no-store'}).then(async response=>{
      const result=await response.json();
      if(response.ok&&result.data?.googleSso)setEnabled(true);
    }).catch(()=>{/* optional vendor */});
  },[]);
  if(!enabled)return null;
  return <p className="auth-switch"><a href="/api/auth/sso/google">Sign in with Google</a></p>;
}

function Home({ctx}:{ctx:Context}){
  const {d,actor}=ctx;
  const metrics=[['Active quotations',d.quotes.filter(q=>q.stage!=='CONFIRMED').length,'/quotes'],['Awaiting approval',d.quotes.filter(q=>q.evaluation.status==='PENDING').length,'/approvals'],['Open invoices',d.invoices.filter(i=>i.status!=='PAID').length,'/invoices'],['Deals needing attention',d.flags.filter(f=>f.status==='OPEN').length,'/health']];
  return <>
    <Heading title={`Good to see you, ${actor.name.split(' ')[0]}`} description="A clear view of your pipeline and the work that needs you next."><Link className="primary-link" href="/quotes/new">New quotation</Link></Heading>
    <div className="metrics">{metrics.map(([name,value,url])=><Link className="metric" href={String(url)} key={name}><span>{name}</span><strong>{value}</strong><small>View details</small></Link>)}</div>
    <Section title="Your recent quotations" actions={<OpenLink href="/quotes" variant="secondary">View all</OpenLink>}><Table head={['Quotation','Customer','Status','One-time total','Next step','']} rows={d.quotes.slice(0,5).map(q=>[quoteTitle(q),d.customers.find(c=>c.id===q.customerId)?.name,<StatusBadge status={q.stage}/>,<Money amount={q.totals.find(t=>t.interval==='ONE_TIME')?.total??'0.00'} currency={q.currency}/>,q.stage==='CONFIRMED'?'Allocate stock':q.evaluation.status==='PENDING'?'Review approval':q.sent?'Await customer acceptance':'Review and send',<OpenLink key={q.id} href={'/quotes/'+q.id}/>])}/></Section>
    <div className="two-columns home-guides">
      <Section title="Warehouse and delivery">
        <p>After a customer accepts, this is where stock is received, split across warehouses, and shipped. Previews do not reserve inventory until you allocate.</p>
        <OpenLink href="/fulfillment">Open fulfillment</OpenLink>
      </Section>
      <Section title="Deals that need attention">
        {d.tasks.filter(t=>t.status==='OPEN').length?d.tasks.filter(t=>t.status==='OPEN').map(t=>{const q=d.quotes.find(item=>item.id===t.quoteId);return <p key={t.id}>{t.text} · {t.dueDate} {q?<OpenLink href={'/quotes/'+t.quoteId} variant="secondary">Open</OpenLink>:null}</p>;}):<p>Stalled quotes and owner-assigned follow-ups show here so a deal does not sit without a next step.</p>}
        <OpenLink href="/health">Open deal health</OpenLink>
      </Section>
    </div>
  </>;
}
