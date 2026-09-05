import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '../../../server/adapters';
import { AppError } from '../../../server/errors';
import { portalData,propose,confirm,customerActor } from '../../../features/portal/server';
import { suggestions,addSuggested,saveRecommendationRules } from '../../../features/recommendations/server';
import { exportFile } from '../../../server/export';
import { scopeWorkspace } from '../../../server/scope';
import { assertPostOrigin } from '../../../server/origin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(req:NextRequest) {
  try {
    const adapter=await getAdapter(), path=req.nextUrl.pathname.slice(5).split('/');
    const token=req.cookies.get('dealflow_session')?.value ?? req.cookies.get('dealflow-session')?.value;
    assertPostOrigin(req.url,req.headers,req.method);
    const body=req.method==='POST'?await req.json().catch(()=>{throw new AppError(400,'INVALID_JSON','Invalid request body');}):{};
    const publicActor=(actor: {id:string;name:string;email:string;role:string;active:boolean;customerId?:string})=>({id:actor.id,name:actor.name,email:actor.email,role:actor.role,active:actor.active,customerId:actor.customerId});
    const ok=(data:unknown)=>NextResponse.json({data,mode:adapter.mode},{headers:{'Cache-Control':'no-store'}});
    if(path.join('/')==='auth/login'&&req.method==='POST') {const result=await adapter.login(String(body.email??''),String(body.password??''));const response=ok({actor:publicActor(result.actor)});response.cookies.set('dealflow_session',result.token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:28800});response.cookies.set('dealflow-session',result.token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:28800});return response;}
    if(path.join('/')==='auth/signup'&&req.method==='POST'){await adapter.signup(String(body.name??''),String(body.email??''),String(body.password??''));return ok({message:'Account requested. An administrator must activate access.'});}
    const actor=await adapter.authenticate(token);
    if(!actor)throw new AppError(401,'UNAUTHENTICATED','Sign in to continue');
    if(path.join('/')==='auth/me')return ok({actor:publicActor(actor)});
    if(path.join('/')==='auth/logout'&&req.method==='POST'){await adapter.logout(token!);const response=ok({});response.cookies.delete('dealflow_session');response.cookies.delete('dealflow-session');return response;}
    if(path[0]==='portal') {
      if(req.method==='GET'){const result=portalData(actor,await adapter.readCustomer(customerActor(actor)));if(path[1]){const collection=path[1] as 'quotes'|'orders'|'invoices';if(!['quotes','orders','invoices'].includes(collection))throw new AppError(404,'NOT_FOUND','Page unavailable');const record=result[collection].find(x=>x.id===path[2]);if(!record)throw new AppError(404,'NOT_FOUND','Record unavailable');return ok(record);}return ok(result);}
      if(path[1]==='quotes'&&path[3]==='proposals')return ok(await propose(adapter,actor,path[2],body));
      if(path[1]==='quotes'&&path[3]==='confirm')return ok(await confirm(adapter,actor,path[2],body));
    }
    if(path[0]==='export'&&req.method==='GET')return exportFile(actor,await adapter.read(),req.nextUrl.searchParams,adapter.mode);
    if(path[0]==='fulfillment'&&path[2]==='preview'&&req.method==='GET')return ok(await adapter.fulfillmentPreview(actor,path[1]));
    if(actor.role==='CUSTOMER')throw new AppError(403,'FORBIDDEN','Staff access required');
    if(path[0]==='workspace'&&req.method==='GET'){return ok(scopeWorkspace(actor,await adapter.read()));}
    if(path[0]==='recommendations'){
      if(req.method==='GET')return ok(await suggestions(adapter,actor,path[1]));
      if(path[1]==='rules')return ok(await saveRecommendationRules(adapter,actor,body.rules));
      if(path[2]==='add')return ok(await addSuggested(adapter,actor,path[1],body));
    }
    if(path[0]==='actions'&&req.method==='POST')return ok(await adapter.command(actor,String(body.action),body));
    throw new AppError(404,'NOT_FOUND','Endpoint unavailable');
  } catch(error) {const e=error instanceof AppError?error:new AppError(500,'INTERNAL','The request could not be completed');return NextResponse.json({error:{code:e.code,message:e.message,details:e.details}},{status:e.status});}
}
export const GET=handle;export const POST=handle;
