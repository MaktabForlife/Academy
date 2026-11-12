// New opt-in first-admission + foreground outbox composition.
// Existing source entries and accepted launchers stay unchanged.
import {createOperationalV110ChildPINRootEntry} from './jwt-local-v110-child-pin-entry.mjs';
import {operationalV110Environment} from './jwt-local-v110-operational-entry.mjs';
import {withoutChildPINServices} from '../auth/v110/child-pin-service-rpc.mjs';
import {withoutChildAuthServices,createNativeChildAuthPeers,deliverPendingNativeMasterEvents} from '../auth/v110/native-child-auth-service-rpc.mjs';
import {produceRootNativeChildAdmission} from '../auth/v110/root-native-child-admission.mjs';
const origin='https://ummabbadacademy.app';
const paths={'/api/academy/website-studio/handoff':'studio','/api/academy/hifz/sign-in':'hifz'};
const reply=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
async function input(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))throw Object.assign(Error('INVALID_ADMISSION_BODY'),{status:400});
 const reader=request.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});if(!reader)throw Object.assign(Error('INVALID_ADMISSION_BODY'),{status:400});
 let size=0,text='';
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>1024){await reader.cancel();throw Object.assign(Error('INVALID_ADMISSION_BODY'),{status:400});}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
 catch(error){throw Object.assign(Error('INVALID_ADMISSION_BODY'),{status:400});}finally{reader.releaseLock();}
}
export function createOperationalV110NativeAuthRootEntry(options){
 const base=createOperationalV110ChildPINRootEntry(options);
 return Object.freeze({async fetch(request,env,ctx){
  const url=new URL(request.url),isolated=withoutChildAuthServices(env);
  if(url.origin!==origin||url.username||url.password||request.headers.has('Host')&&request.headers.get('Host')!==url.host)return reply({code:'LOCAL_AUTH_UNAVAILABLE'},503);
  if(Object.hasOwn(paths,url.pathname)){
   if(env.JWT_LOCAL_CHILD_ADMISSION!=='1')return reply({code:'NOT_FOUND'},404);
   if(request.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
   if(url.search||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply({code:'ORIGIN_NOT_ALLOWED'},403);
   try{
    const selected=operationalV110Environment(withoutChildPINServices(isolated)),peers=createNativeChildAuthPeers(env),app=paths[url.pathname];
    const result=await produceRootNativeChildAdmission({request,env:selected,app,input:await input(request),send:peers[app].stageAdmission});
    if(app==='studio')return reply({success:true,url:result.origin+'/connect#'+new URLSearchParams({code:result.code,state:result.state}),expiresIn:60},200);
    return reply({success:true,code:result.code,state:result.state,expiresIn:60},200);
   }catch(error){const status=[400,401,403,409,429].includes(error?.status)?error.status:503;return reply({code:status===503?'LOCAL_AUTH_UNAVAILABLE':'CHILD_ADMISSION_REJECTED'},status);}
  }
  const response=await base.fetch(request,isolated,ctx);
  const foreground=request.method==='POST'&&response.ok&&(url.pathname.startsWith('/api/')||['/auth/v110/login','/auth/v110/logout','/auth/v110/setup-pin'].includes(url.pathname));
  if(!foreground||env.JWT_LOCAL_OUTBOX!=='1')return response;
  try{
   const selected=operationalV110Environment(withoutChildPINServices(isolated));
   const delivered=await deliverPendingNativeMasterEvents({...selected,JWT_LOCAL_STUDIO_AUTH_SERVICE:env.JWT_LOCAL_STUDIO_AUTH_SERVICE,JWT_LOCAL_HIFZ_AUTH_SERVICE:env.JWT_LOCAL_HIFZ_AUTH_SERVICE});
   if(delivered.retry===0)return response;
  }catch{}
  // Native mutation may already be committed. Preserve its cookie effects and
  // immutable outbox; never report successful cross-app completion without ACK.
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json');headers.delete('Content-Length');headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify({code:'LOCAL_AUTH_DELIVERY_PENDING'}),{status:503,headers});
 }});
}
