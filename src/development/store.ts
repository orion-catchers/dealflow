import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { join } from 'node:path';
import { scryptSync,randomBytes,timingSafeEqual } from 'node:crypto';
import type { DataState } from '../contracts/application';
import { seed } from './seed';
export interface DevelopmentStore { data:DataState; credentials:Record<string,{salt:string;hash:string}>;sessions:Record<string,{userId:string;expires:number}>;requests:Record<string,{fingerprint:string;result:unknown}> }
const root=join(process.cwd(),'.dealflow-development');const file=join(root,process.env.DEALFLOW_TEST_STORE==='1'?'test-store.json':'store.json');
export function passwordHash(password:string,salt=randomBytes(16).toString('hex')) {return {salt,hash:scryptSync(password,salt,64).toString('hex')};}
export function passwordMatches(password:string,record:{salt:string;hash:string}){return timingSafeEqual(Buffer.from(record.hash,'hex'),scryptSync(password,record.salt,64));}
export function freshStore():DevelopmentStore {const data=seed();return {data,credentials:Object.fromEntries(data.users.map(u=>[u.id,passwordHash('DealFlow2026!')])),sessions:{},requests:{}};}
type GlobalStore = typeof globalThis & { dealflowQueue?:Promise<unknown> };
export async function access<T>(write:boolean,perform:(s:DevelopmentStore)=>T|Promise<T>):Promise<T>{
  if(process.env.NODE_ENV==='production')throw new Error('Development storage is forbidden in production');
  const g=globalThis as GlobalStore;const task=(g.dealflowQueue??Promise.resolve()).catch(()=>{}).then(async()=>{
    await mkdir(root,{recursive:true});let state:DevelopmentStore;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state=freshStore();await writeFile(file,JSON.stringify(state));}
    const result=await perform(state);if(write){const temp=file+'.next';await writeFile(temp,JSON.stringify(state));await rename(temp,file);}return structuredClone(result);
  });g.dealflowQueue=task;return task;
}
