'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Actor,DataState} from '../../contracts/application';
import type {Field} from '../../contracts/forms';
import {Button,Dialog,Input,Select,StatusBadge,Money} from '../ui';
export {Button,Input,Select,StatusBadge,Money,Link};
export const today=()=>new Date().toISOString().slice(0,10);
export const label=(s:string)=>s.replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
/** Request keys on HTTP LAN (e.g. 172.x) — `crypto.randomUUID` is secure-context only. */
export function newId(): string {
  const web = globalThis.crypto;
  if (web && typeof web.randomUUID === 'function') return web.randomUUID();
  if (web && typeof web.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    web.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
export async function api<T=unknown>(path:string,body?:unknown):Promise<T>{const r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const json=await r.json();if(!r.ok)throw new Error(`${json.error?.code??r.status}: ${json.error?.message??'Request failed'}`);return json.data as T;}
export interface Context {d:DataState;actor:Actor;path:string;reload:()=>Promise<void>;run:(action:string,body?:Record<string,unknown>)=>Promise<unknown>;notice:(s:string)=>void;}
export function Table({head,rows}:{head:string[];rows:ReactNode[][]}){return <div className="table-wrap" tabIndex={0} role="region" aria-label={head.join(', ')}><table><thead><tr>{head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={head.length}><div className="empty">No matching records. Adjust your filters or create a record to get started.</div></td></tr>}</tbody></table></div>;}
export function Section({title,children,actions}:{title:string;children:ReactNode;actions?:ReactNode}){return <section className="panel"><header><h2>{title}</h2>{actions}</header>{children}</section>;}
export function Heading({title,description,children}:{title:string;description?:string;children?:ReactNode}){return <div className="heading"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="actions">{children}</div></div>;}
function variantChoices(d?:DataState){return d?.products.filter(p=>p.stockTracked).flatMap(p=>p.variants.map(v=>({id:v.id,name:`${p.name} · ${v.name}`})))??[];}
function namedChoice(d:DataState|undefined,id:string){const variant=variantChoices(d).find(v=>v.id===id);if(variant)return variant.name;const product=d?.products.find(p=>p.id===id);if(product)return product.name;const customer=d?.customers.find(c=>c.id===id);if(customer)return customer.name;const warehouse=d?.warehouses.find(w=>w.id===id);if(warehouse)return warehouse.name;const plan=d?.plans.find(p=>p.id===id);if(plan)return plan.name;const user=d?.users.find(u=>u.id===id);if(user)return user.name;return label(id);}
function selectChoices(f:Field,d?:DataState){if(f.source==='reps')return (d?.users.filter(u=>u.role==='SALES_REP')??[]).map(u=>({id:u.id,name:u.name}));if(f.source==='variants')return variantChoices(d);if(f.source){const rows=d?.[f.source as 'products'];return (rows??[]).map(row=>({id:row.id,name:row.name}));}return (f.options??[]).map(id=>({id,name:namedChoice(d,id)}));}
export function Fields({fields,value,set,d}:{fields:Field[];value:Record<string,unknown>;set:(v:Record<string,unknown>)=>void;d?:DataState}){return <div className="form-grid">{fields.map(f=>{const update=(v:unknown)=>set({...value,[f.key]:v});if(f.type==='checkbox')return <label className="check" key={f.key}><input type="checkbox" checked={value[f.key]===true} onChange={e=>update(e.target.checked)}/>{f.label}</label>;const opts=selectChoices(f,d);if(f.type==='select')return <Select key={f.key} name={f.key} label={f.label} required={f.required} value={String(value[f.key]??'')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{opts.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</Select>;if(f.type==='textarea')return <label key={f.key}>{f.label}<textarea value={String(value[f.key]??'')} required={f.required} onChange={e=>update(e.target.value)}/></label>;return <Input key={f.key} label={f.label} type={f.type??'text'} step={f.type==='number'?(f.key==='quantity'?1:'any'):undefined} required={f.required} min={f.min} max={f.max} value={String(value[f.key]??'')} onChange={e=>update(f.type==='number'&&e.target.value!==''?(f.key==='quantity'?Math.max(f.min??1,Math.round(Number(e.target.value)||1)):Number(e.target.value)):e.target.value)}/>;})}</div>;}
export function FormAction({title,fields=[],initial={},onSubmit,d,button=title,danger=false,description}:{title:string;fields?:Field[];initial?:Record<string,unknown>;onSubmit:(v:Record<string,unknown>)=>Promise<unknown>;d?:DataState;button?:string;danger?:boolean;description?:string}){const [open,setOpen]=useState(false),[value,set]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState('');return <><Button variant={danger?'danger':'secondary'} onClick={()=>{set(initial);setError('');setKey(newId());setOpen(true);}}>{button}</Button><Dialog open={open} onClose={()=>!busy&&setOpen(false)} title={title}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const posted={...value};const data=new FormData(e.currentTarget);for(const field of fields){if(field.type!=='select')continue;const next=data.get(field.key);if(typeof next==='string'&&next.trim()!=='')posted[field.key]=next;}try{await onSubmit({...posted,requestKey:key});setOpen(false);}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>{description&&<p>{description}</p>}<Fields fields={fields} value={value} set={v=>{set(v);setKey(newId());}} d={d}/>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><Button type="submit" disabled={busy} variant={danger?'danger':'primary'}>{busy?'Saving…':'Confirm'}</Button></div></form></Dialog></>;}
export function revisionTitle(revision?: string | number | null): string {
  if (revision == null || revision === '') return 'Version 1';
  const raw = String(revision).trim();
  const prefixed = raw.match(/^r(\d+)$/i);
  if (prefixed) return `Version ${Number(prefixed[1])}`;
  const named = raw.match(/^version\s+(\d+)$/i);
  if (named) return `Version ${Number(named[1])}`;
  if (/^\d+$/.test(raw)) return `Version ${Number(raw)}`;
  return `Version ${raw}`;
}
export function Events({events}:{events:{id:string;at:string;text:string;actor?:string;senderName?:string;revision?:string}[]}){return <ol className="timeline">{events.length?events.map(e=><li key={e.id}><strong>{e.text}</strong><small>{e.actor??e.senderName} · {new Date(e.at).toLocaleString()} {e.revision&&`· ${revisionTitle(e.revision)}`}</small></li>):<li>No activity yet.</li>}</ol>;}
export function Filter({search,setSearch,status,setStatus,statuses}:{search:string;setSearch:(s:string)=>void;status:string;setStatus:(s:string)=>void;statuses:string[]}){return <div className="filters"><Input label="Search records" placeholder="Search by name or reference…" value={search} onChange={e=>setSearch(e.target.value)}/><Select label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{[...new Set(statuses)].map(s=><option key={s}>{s}</option>)}</Select></div>;}
export function productLabel(description:string){return description.split('·')[0]?.trim()||description;}
function namesFromLines(lines:{description:string}[]){return [...new Set(lines.map(l=>productLabel(l.description)).filter(Boolean))];}
function namedList(names:string[],fallback:string){if(!names.length)return fallback;if(names.length===1)return names[0];return `${names[0]} + ${names.length-1} more`;}
export function quoteTitle(q:{revision:string;name?:string;lines?:{description:string}[]}){const names=q.lines?namesFromLines(q.lines):[];const version=revisionTitle(q.revision);if(names.length)return `${namedList(names,'Quotation')} · ${version}`;if(q.name?.trim())return `${q.name} · ${version}`;return `Quotation · ${version}`;}
export function orderTitle(order:{lines?:{description:string}[];status?:string},quote?:{revision:string;name?:string;lines?:{description:string}[]}){const fromQuote=quote?quoteTitle(quote).replace(/ · Version .+$/,''):'';if(fromQuote&&fromQuote!=='Quotation')return `${fromQuote} · delivery`;const names=order.lines?namesFromLines(order.lines):[];if(names.length)return `${namedList(names,'Delivery')} · delivery`;return 'Delivery';}
export function invoiceTitle(invoice:{dueDate:string;lines?:{description:string}[]}){const names=invoice.lines?namesFromLines(invoice.lines):[];if(names.length)return `${namedList(names,'Invoice')} · due ${invoice.dueDate}`;return `Invoice due ${invoice.dueDate}`;}
export function OpenLink({href,children='Open',variant='primary'}:{href:string;children?:ReactNode;variant?:'primary'|'secondary'}){const label=children??'Open';const isOpen=typeof label==='string'&&/^Open(\s|$)/i.test(label.trim());return <Link href={href} className={isOpen?'df-button df-open':`df-button df-button--${variant}`}>{label}</Link>;}
export function BackLink({href,children='Back'}:{href:string;children?:ReactNode}){return <OpenLink href={href} variant="secondary">{children}</OpenLink>;}
export function RowActions({children}:{children:ReactNode}){return <div className="row-actions">{children}</div>;}
