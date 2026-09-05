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
export function Fields({fields,value,set,d}:{fields:Field[];value:Record<string,unknown>;set:(v:Record<string,unknown>)=>void;d?:DataState}){return <div className="form-grid">{fields.map(f=>{const update=(v:unknown)=>set({...value,[f.key]:v});if(f.type==='checkbox')return <label className="check" key={f.key}><input type="checkbox" checked={value[f.key]===true} onChange={e=>update(e.target.checked)}/>{f.label}</label>;const source=f.source==='reps'?d?.users.filter(u=>u.role==='SALES_REP'):d?.[f.source as 'products'];const opts=f.options?.map(s=>({id:s,name:label(s)}))??source??[];if(f.type==='select')return <Select key={f.key} label={f.label} required={f.required} value={String(value[f.key]??'')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{opts.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</Select>;if(f.type==='textarea')return <label key={f.key}>{f.label}<textarea value={String(value[f.key]??'')} required={f.required} onChange={e=>update(e.target.value)}/></label>;return <Input key={f.key} label={f.label} type={f.type??'text'} step={f.type==='number'?'any':undefined} required={f.required} min={f.min} max={f.max} value={String(value[f.key]??'')} onChange={e=>update(f.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>;})}</div>;}
export function FormAction({title,fields=[],initial={},onSubmit,d,button=title,danger=false,description}:{title:string;fields?:Field[];initial?:Record<string,unknown>;onSubmit:(v:Record<string,unknown>)=>Promise<unknown>;d?:DataState;button?:string;danger?:boolean;description?:string}){const [open,setOpen]=useState(false),[value,set]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState('');return <><Button variant={danger?'danger':'secondary'} onClick={()=>{set(initial);setError('');setKey(newId());setOpen(true);}}>{button}</Button><Dialog open={open} onClose={()=>!busy&&setOpen(false)} title={title}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSubmit({...value,requestKey:key});setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{description&&<p>{description}</p>}<Fields fields={fields} value={value} set={v=>{set(v);setKey(newId());}} d={d}/>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><Button type="submit" disabled={busy} variant={danger?'danger':'primary'}>{busy?'Saving…':'Confirm'}</Button></div></form></Dialog></>;}
export function Events({events}:{events:{id:string;at:string;text:string;actor?:string;senderName?:string;revision?:string}[]}){return <ol className="timeline">{events.length?events.map(e=><li key={e.id}><strong>{e.text}</strong><small>{e.actor??e.senderName} · {new Date(e.at).toLocaleString()} {e.revision&&`· ${e.revision}`}</small></li>):<li>No activity yet.</li>}</ol>;}
export function Filter({search,setSearch,status,setStatus,statuses}:{search:string;setSearch:(s:string)=>void;status:string;setStatus:(s:string)=>void;statuses:string[]}){return <div className="filters"><Input label="Search records" placeholder="Search by name or reference…" value={search} onChange={e=>setSearch(e.target.value)}/><Select label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{[...new Set(statuses)].map(s=><option key={s}>{s}</option>)}</Select></div>;}
export function productLabel(description:string){return description.split('·')[0]?.trim()||description;}
function namesFromLines(lines:{description:string}[]){return [...new Set(lines.map(l=>productLabel(l.description)).filter(Boolean))];}
function namedList(names:string[],fallback:string){if(!names.length)return fallback;if(names.length===1)return names[0];return `${names[0]} + ${names.length-1} more`;}
export function quoteTitle(q:{revision:string;name?:string;lines?:{description:string}[]}){const names=q.lines?namesFromLines(q.lines):[];const version=`Version ${q.revision}`;if(names.length)return `${namedList(names,'Quotation')} · ${version}`;if(q.name?.trim())return `${q.name} · ${version}`;return `Quotation · ${version}`;}
export function orderTitle(order:{lines?:{description:string}[];status?:string},quote?:{revision:string;name?:string;lines?:{description:string}[]}){const fromQuote=quote?quoteTitle(quote).replace(/ · Version .+$/,''):'';if(fromQuote&&fromQuote!=='Quotation')return `${fromQuote} · delivery`;const names=order.lines?namesFromLines(order.lines):[];if(names.length)return `${namedList(names,'Delivery')} · delivery`;return 'Delivery';}
export function invoiceTitle(invoice:{dueDate:string;lines?:{description:string}[]}){const names=invoice.lines?namesFromLines(invoice.lines):[];if(names.length)return `${namedList(names,'Invoice')} · due ${invoice.dueDate}`;return `Invoice due ${invoice.dueDate}`;}
export function OpenLink({href,children='Open',variant='primary'}:{href:string;children?:ReactNode;variant?:'primary'|'secondary'}){return <Link href={href} className={`df-button df-button--${variant}`}>{children}</Link>;}
export function BackLink({href,children='Back'}:{href:string;children?:ReactNode}){return <OpenLink href={href} variant="secondary">{children}</OpenLink>;}
export function RowActions({children}:{children:ReactNode}){return <div className="row-actions">{children}</div>;}
