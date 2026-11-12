// Dedicated own-child PIN HTTP. Refresh ownership yields metadata only;
// signed actual Root PIN proof + current native predicates own the unlock CAS.
import {localChildProfile} from './local-child-profile.mjs';
import {createChildAccessEngine} from './child-access-engine.mjs';
import {cookieNames,parseUniqueCookie} from './claims.mjs';
import {nativeChildCSRFKey,verifyNativeChildCSRF,nativeChildCSRFValue,nativeChildPrimaryStore,nativeChildResponse} from './child-auth-http.mjs';
import {prepareNativeChildPINIntent,consumeNativeChildPINUnlock} from './native-child-pin-unlock.mjs';
const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
const reply=(body,status=200,cookies=[])=>{const response=Response.json(body,{status});for(const value of cookies)response.headers.append('Set-Cookie',value);return nativeChildResponse(response);};
const fail=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
async function bounded(request,consume){
 const reader=request.body?.getReader();if(!reader)fail('CHILD_PIN_BODY_REJECTED');
 let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
 try{
  for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>1024){await reader.cancel();fail('CHILD_PIN_BODY_REJECTED');}text+=decoder.decode(p.value,{stream:true});}
  text+=decoder.decode();const value=JSON.parse(text),keys=consume?['code','verifier','state']:['challenge','state'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!opaque(value[k])))fail('CHILD_PIN_BODY_REJECTED');
  return value;
 }catch(e){if(e.code)throw e;fail('CHILD_PIN_BODY_REJECTED');}finally{reader.releaseLock();}
}
export async function handleNativeChildPINHTTP(request,env,{app,clock=Date.now}={}){
 if(env.JWT_V110_CHILD_NATIVE_AUTH!=='1'||env.JWT_V110_CHILD_PIN!=='NATIVE_ROOT_V1')return reply({code:'CHILD_PIN_NOT_ENABLED'},404);
 try{
  const profile=localChildProfile(env,app),url=new URL(request.url),consume=url.pathname==='/api/auth/v110/pin/consume';
  if(!consume&&url.pathname!=='/api/auth/v110/pin/prepare')return reply({code:'NOT_FOUND'},404);
  if(url.origin!==profile.origin||url.search||request.method!=='POST'||request.headers.get('Origin')!==profile.origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Authorization')||request.headers.has('Host')&&request.headers.get('Host')!==url.host||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail('CHILD_PIN_ORIGIN_REJECTED',403);
  const input=await bounded(request,consume),store=nativeChildPrimaryStore(env),key=await nativeChildCSRFKey(env);
  const raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames[app].refresh);
  const config={store,app,raw,secret:env.JWT_V110_CHILD_PIN_SECRET,rootRunId:env.JWT_LOCAL_ROOT_RUN_ID,childRunId:env.JWT_LOCAL_NATIVE_RUN_ID,clock,authorize:({family})=>verifyNativeChildCSRF(request,key,profile,family)};
  if(!consume)return reply(await prepareNativeChildPINIntent({...config,...input}));
  const engine=await createChildAccessEngine(env,{app,signing:true});
  const result=await consumeNativeChildPINUnlock({...config,...input,engine,prepareClient:async({claims:c,family,cookies,actor,lastForegroundRefreshS,serverNowS,pinVerifiedAtS})=>{
   const csrf=await nativeChildCSRFValue(key,profile,family);
   const session={app,accountId:c.sub,sessionId:c.sid,parentId:c.psid,browserId:c.bsid,browserGeneration:c.bv,credentialEpoch:c.ce,securityVersion:c.pv,unlockGeneration:c.ue,originalSignedAtMs:c.s_iat*1000,originalExpiresAtMs:c.s_exp*1000,lastForegroundRefreshMs:lastForegroundRefreshS*1000,serverNowMs:serverNowS*1000};
   return reply({unlocked:true,session,actor,initialViews:[],accessExpiresAtMs:c.exp*1000,csrf,pinVerifiedAtMs:pinVerifiedAtS*1000},200,cookies);
  }});
  return result.clientResponse;
 }catch(error){
  const status=[400,401,403,409,503].includes(error.status)?error.status:503;
  return reply({code:status===503?'CHILD_PIN_UNAVAILABLE':error.code||'CHILD_PIN_REJECTED'},status);
 }
}
