'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ChevronDown,Menu,X} from 'lucide-react';
import styles from './PublicHeader.module.css';

const sections = [
  {id:'product',label:'Product'},
  {id:'process',label:'How it works'},
  {id:'access',label:'Access'},
] as const;
type SectionId = typeof sections[number]['id'];

export default function PublicHeader({landing,onOpenChange}:{landing:boolean;onOpenChange:(open:boolean)=>void}){
  const [panel,setPanel]=useState<SectionId|null>(null);
  const [mobileOpen,setMobileOpen]=useState(false);
  const header=useRef<HTMLElement>(null);
  const mobileTrigger=useRef<HTMLButtonElement>(null);
  const triggers=useRef<Partial<Record<SectionId,HTMLButtonElement|null>>>({});

  const close=()=>{setPanel(null);setMobileOpen(false);};

  useEffect(()=>{onOpenChange(Boolean(panel||mobileOpen));},[panel,mobileOpen,onOpenChange]);

  useEffect(()=>{
    if(!panel&&!mobileOpen)return;
    const outside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!header.current?.contains(event.target)){
        setPanel(null);setMobileOpen(false);
      }
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      if(panel){triggers.current[panel]?.focus();setPanel(null);}
      else{mobileTrigger.current?.focus();setMobileOpen(false);}
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
    };
  },[panel,mobileOpen]);

  return <header ref={header} className={`${styles.header} ${landing?styles.landing:styles.login}`} onBlur={event=>{
    if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))close();
  }}>
    <Link className={styles.wordmark} href="/" aria-label="DealFlow360 home" onClick={close}>DealFlow360</Link>
    {landing?<>
      <div className={styles.mobileActions}>
        <Link href="/login" onClick={close}>Sign in</Link>
        <button ref={mobileTrigger} type="button" aria-expanded={mobileOpen} aria-controls="public-navigation" onClick={()=>{
          setMobileOpen(!mobileOpen);setPanel(null);
        }}>{mobileOpen?<X size={18} aria-hidden="true"/>:<Menu size={18} aria-hidden="true"/>}Menu</button>
      </div>
      <nav id="public-navigation" className={`${styles.navigation} ${mobileOpen?styles.mobileOpen:''}`} aria-label="Landing page navigation">
        <div className={styles.navItems}>
          {sections.map(section=><button key={section.id} ref={element=>{triggers.current[section.id]=element;}}
            id={`public-trigger-${section.id}`} type="button" className={styles.trigger}
            aria-expanded={panel===section.id} aria-controls={`public-panel-${section.id}`}
            onClick={()=>setPanel(panel===section.id?null:section.id)}
            onKeyDown={event=>{
              if(event.key==='ArrowDown'){event.preventDefault();setPanel(section.id);}
            }}>
            {section.label}<ChevronDown size={14} aria-hidden="true"/>
          </button>)}
          <Link className={styles.signIn} href="/login" onClick={close}>Sign in</Link>
          <Link className={styles.primary} href="/login" onClick={close}>Get started</Link>
        </div>
        {sections.map(section=><section key={section.id} className={styles.panel} id={`public-panel-${section.id}`}
          hidden={panel!==section.id} aria-labelledby={`public-trigger-${section.id}`}>
          <div className={styles.panelHeading}>
            <h2>{section.id==='product'?'One connected sales workspace':section.id==='process'?'From a quote to a commitment':'Access for your business'}</h2>
            <button type="button" className={styles.close} onClick={()=>{
              setPanel(null);triggers.current[section.id]?.focus();
            }}>Close<X size={14} aria-hidden="true"/></button>
          </div>
          {section.id==='product'?<>
            <p>Keep the people, terms, and next steps of every deal together.</p>
            <dl className={styles.features}>
              <div><dt>Quotations & recommendations</dt><dd>Build product and service quotes, compare discounts, and review qualifying add-ons.</dd></div>
              <div><dt>Approvals & customer negotiation</dt><dd>Discuss changes, preserve revisions, and approve the exact terms before acceptance.</dd></div>
              <div><dt>Fulfillment & billing</dt><dd>Follow accepted orders through stock allocation, recurring billing, and payment records.</dd></div>
            </dl>
            <Link className={styles.panelAction} href="/login" onClick={close}>Sign in to your workspace</Link>
          </>:section.id==='process'?<>
            <ol className={styles.journey}>
              <li><strong>Configure the quote</strong><p>Select the customer, products, quantities, and discounts. Review current prices and relevant recommendations.</p></li>
              <li><strong>Agree on the current revision</strong><p>Review proposals and required approvals. A change to the terms requires a fresh review and customer acceptance.</p></li>
              <li><strong>Confirm, allocate, and deliver</strong><p>Accept the approved revision to create the order, then explicitly allocate stock and continue to billing.</p></li>
            </ol>
            <p className={styles.rule}>Warehouse and billing previews do not reserve stock or create invoices.</p>
            <Link className={styles.panelAction} href="/login" onClick={close}>Start in your workspace</Link>
          </>:<>
            <p>Use your assigned company account. Your signed-in session determines the records and actions available to you.</p>
            <dl className={styles.features}>
              <div><dt>Staff workspace</dt><dd>Manage sales and operations with permissions assigned by your administrator.</dd></div>
              <div><dt>Customer portal</dt><dd>View your business’s quotes, orders, and invoices. Discuss proposed terms and accept approved revisions.</dd></div>
            </dl>
            <div className={styles.accessActions}>
              <Link className={styles.panelAction} href="/login" onClick={close}>Sign in with your account</Link>
              <Link href="/signup" onClick={close}>Request an account</Link>
            </div>
          </>}
        </section>)}
      </nav>
    </>:<Link className={styles.back} href="/">Back to home</Link>}
  </header>;
}
