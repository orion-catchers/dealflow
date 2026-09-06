'use client';

import {Suspense,useCallback,useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {BarChart3,Boxes,CircleCheck,CreditCard,FileText,HeartPulse,LayoutDashboard,LogOut,Menu,Package,PanelLeft,PanelLeftClose,Repeat,Settings,Settings2,ShieldCheck,UsersRound} from 'lucide-react';
import type {Actor,DataState,Role} from '../../contracts/application';
import {api,Button,Heading,Input,Link,Money,Section,StatusBadge,Table,newId,quoteTitle,OpenLink,type Context} from './shared';
import {approvalOk,attentionItems,canDecide,nextStepHref,nextStepLabel} from './DealFlow';
import Quotes from './Quotes';
import Operations from './Operations';
import Setup from './Setup';
import CustomerPortal from './CustomerPortal';
import {clearPortalCache,rememberPortal} from './portal-cache';
import PublicHeader from './PublicHeader';
import {FulfillmentList} from '@/features/inventory/ui/FulfillmentList';
import {FulfillmentDetailView} from '@/features/inventory/ui/FulfillmentDetailView';
import {ReportsDashboard} from '@/features/reports/ui/ReportsDashboard';
import {ProductDashboard} from '@/features/catalog/ui/ProductDashboard';
import {ProductEditor} from '@/features/catalog/ui/ProductEditor';
import {CustomersMaster} from '@/features/catalog/ui/CustomersMaster';
import {PriceListsManager} from '@/features/catalog/ui/PriceListsManager';
import {WarehousesScreen} from '@/features/inventory/ui/warehouses/WarehousesScreen';
import {UsersAdmin} from '@/features/users/ui/UsersAdmin';
import {InvoicesList} from '@/features/billing/ui/InvoicesList';
import {InvoiceDetail} from '@/features/billing/ui/InvoiceDetail';
import {SubscriptionsList} from '@/features/billing/ui/SubscriptionsList';
import {SubscriptionDetail} from '@/features/billing/ui/SubscriptionDetail';
import {ApprovalsList} from '@/features/approval-ui/ui/ApprovalsList';
import {ApprovalDetail} from '@/features/approval-ui/ui/ApprovalDetail';

export function navigationFor(role: Role) {
  const allNav = [
    { href: '/home', name: 'Overview', icon: LayoutDashboard, roles: ['ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE_OPS'] as Role[] },
    { href: '/quotes', name: 'Quotations', icon: FileText, roles: ['ADMIN', 'SALES_REP', 'SALES_MANAGER'] as Role[] },
    { href: '/approvals', name: 'Approvals', icon: ShieldCheck, roles: ['ADMIN', 'SALES_MANAGER', 'FINANCE_OPS'] as Role[] },
    { href: '/fulfillment', name: 'Fulfillment', icon: Package, roles: ['ADMIN', 'FINANCE_OPS'] as Role[] },
    { href: '/subscriptions', name: 'Subscriptions', icon: Repeat, roles: ['ADMIN', 'FINANCE_OPS'] as Role[] },
    { href: '/invoices', name: 'Invoices', icon: CreditCard, roles: ['ADMIN', 'FINANCE_OPS'] as Role[] },
    { href: '/health', name: 'Deal health', icon: HeartPulse, roles: ['ADMIN', 'SALES_REP', 'SALES_MANAGER'] as Role[] },
    { href: '/reports', name: 'Reports', icon: BarChart3, roles: ['ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE_OPS'] as Role[] },
    { href: '/products', name: 'Catalog', icon: Boxes, roles: ['ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE_OPS'] as Role[] },
  ];

  const items = allNav.filter((item) => item.roles.includes(role));

  if (role === 'ADMIN') {
    items.push({ href: '/settings/customers', name: 'Setup', icon: Settings, roles: ['ADMIN'] });
  } else if (role === 'SALES_MANAGER') {
    items.push({ href: '/policies', name: 'Setup', icon: Settings, roles: ['SALES_MANAGER'] });
  } else if (role === 'FINANCE_OPS') {
    items.push({ href: '/settings/warehouses', name: 'Setup', icon: Settings, roles: ['FINANCE_OPS'] });
  }

  return items;
}

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

export function canAccessRoute(role: Role, path: string): boolean {
  if (role === 'CUSTOMER') {
    return isPortalPath(path);
  }
  if (role === 'ADMIN') {
    return !isPortalPath(path);
  }
  const cleanPath = path.split('?')[0].split('#')[0];
  const parts = cleanPath.split('/').filter(Boolean);
  const first = parts[0];
  const second = parts[1];

  if (cleanPath === '/home') return true;

  if (role === 'SALES_REP') {
    if (first === 'quotes' || cleanPath === '/pipeline') {
      return true;
    }
    if (first === 'health') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    return false;
  }

  if (role === 'SALES_MANAGER') {
    if (first === 'quotes' || cleanPath === '/pipeline') {
      return second !== 'new';
    }
    if (first === 'approvals') return true;
    if (first === 'health') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    if (cleanPath === '/policies') return true;
    if (cleanPath === '/settings/recommendations' || cleanPath === '/settings/health') return true;
    return false;
  }

  if (role === 'FINANCE_OPS') {
    if (first === 'approvals') return true;
    if (first === 'fulfillment') return true;
    if (first === 'subscriptions') return true;
    if (first === 'invoices') return true;
    if (first === 'reports') return true;
    if (first === 'products') {
      return second !== 'new';
    }
    if (first === 'warehouses' || cleanPath === '/settings/warehouses') return true;
    if (cleanPath === '/settings/plans') return true;
    return false;
  }

  return false;
}

function viewPathFor(next:Actor|null,path:string){
  if(!next)return isAuthPath(path)?path:'/login';
  if(next.role==='CUSTOMER')return isPortalPath(path)?path:'/portal';
  if(isAuthPath(path)||isPortalPath(path))return '/home';
  if(!canAccessRoute(next.role,path))return homeFor(next);
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
  const run=async(action:string,body:Record<string,unknown>={},notice?:string)=>{
    const result=await api('actions',{...body,action,requestKey:body.requestKey??newId()});
    await reload();
    setMessage(notice??(mode==='DEV FIXTURE'?'Development record updated.':'Saved.'));
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
        <Link className="brand wordmark" href={sessionActor.role==='CUSTOMER'?'/portal':'/home'} aria-label="DealFlow360 home">DealFlow360</Link>
        <button className="sidebar-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setSidebarCollapsed(!collapsed)}>
          {collapsed?<PanelLeft size={18}/>:<PanelLeftClose size={18}/>}
        </button>
      </div>
      <p className="nav-caption">{sessionActor.role==='CUSTOMER'?'YOUR BUSINESS':'WORKSPACE'}</p>
      <nav id="primary-navigation">
        {sessionActor.role === 'CUSTOMER' ? (
          <Link
            className={shellPath.startsWith('/portal') ? 'active' : ''}
            href="/portal"
            aria-label="Your deals"
            title="Your deals"
          >
            <FileText size={18} />
            <span className="nav-label">Your deals</span>
          </Link>
        ) : (
          navigationFor(sessionActor.role).map(({ href, name, icon: Icon }) => {
            const isActive =
              href === '/home'
                ? shellPath === '/home'
                : href.startsWith('/settings') || href === '/policies'
                ? shellPath.startsWith('/settings') || shellPath === '/policies' || shellPath.startsWith('/warehouses')
                : shellPath.startsWith(href) || (href === '/quotes' && shellPath === '/pipeline');
            return (
              <Link
                key={href}
                className={isActive ? 'active' : ''}
                href={href}
                aria-label={name}
                title={collapsed ? name : undefined}
              >
                <Icon size={18} />
                <span className="nav-label">{name}</span>
              </Link>
            );
          })
        )}
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
        {sessionActor.role==='CUSTOMER'?<CustomerPortal path={shellPath}/>:!data?null:<WorkspaceBody path={shellPath} ctx={ctx}/>}
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
    <div className="auth-photo" aria-hidden="true"/>
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
        {path!=='/signup'&&<div className="auth-demo"><span>Demo fill</span><div className="auth-personas">{[['Rep','arjun@nexa.example','arjun-nexa-2026!'],['Manager','sana@nexa.example','sana-nexa-2026!'],['Finance','farah@nexa.example','farah-nexa-2026!'],['Customer','neha@acme.example','neha-acme-2026!']].map(([label,mail,pass])=><button type="button" key={label} onClick={()=>{setEmail(mail);setPassword(pass);setIssue('');}}>{label}</button>)}</div></div>}
        {done?<div className="notice" role="status">Account requested. Your administrator must activate access.<Link href="/login">Return to sign in</Link></div>:<form onSubmit={async event=>{
          event.preventDefault();setBusy(true);setIssue('');
          const submitted=new FormData(event.currentTarget);
          const passwordField=event.currentTarget.elements.namedItem('password');
          const emailField=event.currentTarget.elements.namedItem('email');
          const nextEmail=String(submitted.get('email')??(emailField instanceof HTMLInputElement?emailField.value:email)).trim();
          const nextPassword=String(submitted.get('password')??(passwordField instanceof HTMLInputElement?passwordField.value:password)).replace(/\r?\n/g,'');
          const nextName=String(submitted.get('name')??name).trim();
          try{if(path==='/signup'){await api('auth/signup',{name:nextName,email:nextEmail,password:nextPassword});setDone(true);}else{const result=await api<{actor?:Actor;mode?:string;id?:string;name?:string;email?:string;role?:Role;active?:boolean;customerId?:string}>('auth/login',{email:nextEmail,password:nextPassword});const actor=result.actor??sessionToActor(result);if(!actor)throw new Error('Sign in could not be completed.');await onLogin(actor,result.mode??'LIVE');}}
          catch(reason){setIssue(reason instanceof Error?reason.message:'Sign in could not be completed.');}
          finally{setBusy(false);};
        }}>
          {path==='/signup'&&<Input label="Full name" name="name" value={name} onChange={event=>setName(event.target.value)} required autoComplete="name"/>}
          <Input label="Work email" name="email" type="email" value={email} onChange={event=>setEmail(event.target.value)} onInput={event=>setEmail(event.currentTarget.value)} required autoComplete="username"/>
          <Input label="Password" name="password" type="password" value={password} onChange={event=>setPassword(event.target.value)} onInput={event=>setPassword(event.currentTarget.value)} required minLength={8} autoComplete={path==='/signup'?'new-password':'current-password'}/>
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
  const canQuote=['ADMIN','SALES_REP'].includes(actor.role);
  const canAccessQuotes=['ADMIN','SALES_REP','SALES_MANAGER'].includes(actor.role);
  const approver=['SALES_MANAGER','FINANCE_OPS','ADMIN'].includes(actor.role);
  const finance=['FINANCE_OPS','ADMIN'].includes(actor.role);
  const awaitingMe=d.quotes.filter(q=>q.stage==='PENDING_APPROVAL'&&canDecide(q,actor)).length;

  const metrics:[string,number,string][]=[];
  if(canAccessQuotes){
    metrics.push(['Open quotations',d.quotes.filter(q=>q.stage!=='CONFIRMED'&&q.stage!=='REJECTED').length,'/quotes']);
  }
  if(approver){
    metrics.push(['Awaiting my decision',awaitingMe,'/approvals']);
  }
  if(actor.role==='SALES_REP'){
    metrics.push(['Waiting on customers',d.quotes.filter(q=>q.sent&&q.stage!=='CONFIRMED'&&approvalOk(q)).length,'/quotes']);
  }
  if(finance){
    metrics.push(['Orders to allocate',d.orders.filter(o=>!['SHIPPED','DELIVERED','CANCELLED'].includes(o.status)&&o.allocations.length===0).length,'/fulfillment']);
    metrics.push(['Open invoices',d.invoices.filter(i=>i.status!=='PAID').length,'/invoices']);
  }
  if(canAccessQuotes){
    metrics.push(['Health flags',d.flags.filter(f=>f.status==='OPEN').length,'/health']);
  }

  const attention=attentionItems(d,actor);
  const recent=[...d.quotes].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,6);

  return <>
    <Heading title={`Good to see you, ${actor.name.split(' ')[0]}`} description={attention.length?`${attention.length} item${attention.length===1?'':'s'} need${attention.length===1?'s':''} you. Everything else is moving.`:'Nothing is waiting on you right now.'}>{canQuote&&<Link className="primary-link" href="/quotes/new">New quotation</Link>}</Heading>
    <div className="metrics">{metrics.map(([name,value,url])=><Link className="metric" href={url} key={name}><span>{name}</span><strong>{value}</strong><small>Open</small></Link>)}</div>
    <div className="home-grid">
      <Section title="Needs you">
        {attention.length?<ol className="attention">{attention.map(item=><li key={item.id}><Link href={item.href}><span className={`attention-kind is-${item.kind}`} aria-hidden="true"/><span className="attention-text"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="attention-go" aria-hidden="true">→</span></Link></li>)}</ol>:<p className="empty">Nothing is waiting on you. New requests appear here as soon as a customer, approver, or teammate acts.</p>}
      </Section>
      {canAccessQuotes ? (
        <Section title="Recent quotations" actions={<OpenLink href="/quotes" variant="secondary">All quotations</OpenLink>}>
          <Table head={['Quotation','Customer','Stage','Next step','']} rows={recent.map(q=>[quoteTitle(q),d.customers.find(c=>c.id===q.customerId)?.name,<StatusBadge status={q.stage}/>,nextStepLabel(q,actor),<OpenLink key={q.id} href={nextStepHref(q,actor)}/>])}/>
        </Section>
      ) : (
        <Section title="Recent invoices" actions={<OpenLink href="/invoices" variant="secondary">All invoices</OpenLink>}>
          <Table head={['Invoice','Customer','Status','Due date','Outstanding','']} rows={d.invoices.slice(0, 6).map(i=>[i.id,d.customers.find(c=>c.id===i.customerId)?.name,<StatusBadge status={i.status}/>,i.dueDate,<Money amount={i.outstanding} currency={i.currency}/>,<OpenLink key={i.id} href={`/invoices/${i.id}`}/>])}/>
        </Section>
      )}
    </div>
  </>;
}

function WorkspaceBody({path, ctx}:{path:string; ctx:Context}){
  if (!canAccessRoute(ctx.actor.role, path)) {
    return (
      <div style={{padding:'2rem'}}>
        <Heading title="Access restricted" description="Your role does not have access to this workflow."/>
        <p style={{marginTop:'1rem'}}><Link className="df-button df-button--primary" href="/home">Return to overview</Link></p>
      </div>
    );
  }
  const parts=path.split('/').filter(Boolean);
  const first=parts[0];
  const second=parts[1];
  if(path==='/home')return <Home ctx={ctx}/>;
  if(first==='quotes'||path==='/pipeline')return <Quotes ctx={ctx}/>;
  if(first==='approvals')return second?<ApprovalDetail revisionId={second}/>:<ApprovalsList/>;
  if(first==='products'){
    if(second==='new')return ctx.actor.role === 'ADMIN' ? <ProductEditor productId={null}/> : <Heading title="Access restricted" description="Only administrators can create products."/>;
    if(second)return <ProductEditor productId={second} readOnly={ctx.actor.role !== 'ADMIN'}/>;
    return <ProductDashboard readOnly={ctx.actor.role !== 'ADMIN'}/>;
  }
  if(path==='/price-lists')return <PriceListsManager/>;
  if(path==='/customers'||path==='/settings/customers')return <CustomersMaster/>;
  if(path==='/users'||path==='/settings/users')return <UsersAdmin/>;
  if(path==='/warehouses'||path==='/settings/warehouses')return <WarehousesScreen/>;
  if(first==='fulfillment')return second?<FulfillmentDetailView orderId={second}/>:<FulfillmentList/>;
  if(first==='reports')return <Suspense fallback={<p className="hint">Loading reports…</p>}><ReportsDashboard/></Suspense>;
  if(first==='invoices')return second?<InvoiceDetail id={second}/>:<InvoicesList/>;
  if(first==='subscriptions')return second?<SubscriptionDetail id={second}/>:<SubscriptionsList/>;
  if(first==='health')return <Operations ctx={ctx}/>;
  if(path.startsWith('/settings')||path==='/policies')return <Setup ctx={ctx}/>;
  return <><Heading title="Page not found" description="This route does not exist."/><Link href="/home">Return to overview</Link></>;
}
