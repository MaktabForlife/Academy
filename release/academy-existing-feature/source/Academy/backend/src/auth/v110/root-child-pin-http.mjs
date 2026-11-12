// Source-only Root child-PIN HTTP composition. Actual native PIN verifier owns
// attempts/lockout and supplies its private one-use proof. No Master issuance.
import {authorizeNativeRootChildPINLookup,prepareNativeRootChildPINForm,produceNativeChildPINUnlock} from './root-child-pin-producer.mjs';
import {verifyRootChildPINCSRF} from './root-child-pin-csrf.mjs';
import {verifyNativePINForChild} from '../../academy/d1/worker.js';
import {academyD1Repository} from '../../academy/d1/repository.js';
const paths=new Set(['/auth/v110/child-pin/prepare','/auth/v110/child-pin/verify']),origin='https://ummabbadacademy.app';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
const fail=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
async function read(request,verify){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail('INVALID_CHILD_PIN_BODY');
 const reader=request.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{
  if(!reader)fail('INVALID_CHILD_PIN_BODY');
  for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>16384){await reader.cancel();fail('INVALID_CHILD_PIN_BODY');}text+=decoder.decode(item.value,{stream:true});}
  text+=decoder.decode();const value=JSON.parse(text),fields=verify?['app','intentId','pin']:['app','intentId'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k))||!['studio','hifz'].includes(value.app)||typeof value.intentId!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(value.intentId)||verify&&(typeof value.pin!=='string'||!/^\d{4}$/.test(value.pin)))fail('INVALID_CHILD_PIN_BODY');
  return value;
 }catch(error){if(error.code)throw error;fail('INVALID_CHILD_PIN_BODY');}finally{reader?.releaseLock();}
}
export function createRootChildPINHTTP({peers,clock=Date.now}={}){
 // Private code composition only. Outer fixed driver attests peer source and
 // finite bindings. Request body never chooses a URL/callback/identity.
 const deliver=Object.freeze({studio:peers?.studio?.deliverProof,hifz:peers?.hifz?.deliverProof}),intents=Object.freeze({studio:peers?.studio?.readIntent,hifz:peers?.hifz?.readIntent});
 if([...Object.values(deliver),...Object.values(intents)].some(fn=>typeof fn!=='function')||typeof clock!=='function')throw Error('CHILD_PIN_PRIVATE_PEERS_UNBOUND');
 return Object.freeze({async fetch(request,env){
  const u=new URL(request.url);
  if(!paths.has(u.pathname))return reply({code:'NOT_FOUND'},404);
  if(request.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
  if(u.origin!==origin||u.search||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Authorization'))return reply({code:'CHILD_PIN_ORIGIN_REJECTED'},403);
  if(env.JWT_LOCAL_CHILD_PIN!=='1')return reply({code:'CHILD_PIN_NOT_ENABLED'},404);
  try{
   const verify=u.pathname.endsWith('/verify'),input=await read(request,verify);
   // Authenticate current Root parent and bound metadata budget BEFORE peer IO.
   await authorizeNativeRootChildPINLookup({request,env,app:input.app,clock});
   // Signed private intent never passes through a browser form or URL.
   const controller=new AbortController();let timer;
   const packet=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('CHILD_PIN_INTENT_UNAVAILABLE'),{status:503}));},5000);
    Promise.resolve().then(()=>intents[input.app]({app:input.app,intentId:input.intentId,signal:controller.signal,deadlineMs:5000})).then(resolve,reject);
   }).finally(()=>clearTimeout(timer));
   if(!packet||typeof packet.body!=='string'||packet.body.length>8192||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail('CHILD_PIN_INTENT_UNAVAILABLE',503);
   const signed={app:input.app,intentBody:packet.body,intentSignature:packet.signature};
   let intent;try{intent=JSON.parse(packet.body);}catch{fail('CHILD_PIN_INTENT_UNAVAILABLE',503);}
   if(intent.intentId!==input.intentId)fail('CHILD_PIN_INTENT_UNAVAILABLE',503);
   if(!verify)return reply(await prepareNativeRootChildPINForm({request,env,...signed,clock}));
   return await produceNativeChildPINUnlock({request,env,repository:academyD1Repository(env),...signed,pin:input.pin,clock,
    authorize:({parent,intent})=>verifyRootChildPINCSRF(request,env,{parent,intent}),
    verifyNativePIN:value=>verifyNativePINForChild(env,value),
    deliver:packet=>deliver[input.app](packet),
    prepareClient:value=>reply(value)
   });
  }catch(error){
   const cookieRejected=['AMBIGUOUS_OR_MISSING_COOKIE','INVALID_COOKIE_HEADER'].includes(error.code);
   const status=cookieRejected?401:[400,401,403,404,409,429].includes(error.status)?error.status:503;
   // No native error text/PIN/signature/intent/claims in public failures.
   return reply({code:status===503?'CHILD_PIN_UNAVAILABLE':error.code||'CHILD_PIN_REJECTED'},status);
  }
 }});
}
