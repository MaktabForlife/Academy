// Explicit opt-in HTTP composition imported by native entrypoints.
// All shipping/local configs remain disabled until reviewed composition.
import {localChildProfile} from './local-child-profile.mjs';
import {createChildAccessEngine} from './child-access-engine.mjs';
import {cookieNames,parseUniqueCookie} from './claims.mjs';
import {authenticateNativeChildAccess,nativeChildDisplayContext,nativeChildOwnRefreshFamily,refreshNativeChild,cancelNativeChildFamily,invokeNativeChildHandler} from './native-child-authority.mjs';
const fail=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const headers={'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin, Sec-Fetch-Site'};
const reply=(value,status=200,cookies=[])=>{const h=new Headers(headers);h.set('Content-Type','application/json');for(const cookie of cookies)h.append('Set-Cookie',cookie);return new Response(JSON.stringify(value),{status,headers:h});};
// Enabled dynamic native responses use the same private same-origin policy.
// Legacy responses are untouched because only enabled dispatch calls this.
export function nativeChildResponse(response){
 if(!(response instanceof Response))fail('CHILD_AUTH_CONFIG',503);
 const h=new Headers(response.headers);
 for(const name of [...h.keys()])if(name.toLowerCase().startsWith('access-control-'))h.delete(name);
 h.set('Cache-Control','private, no-store');h.set('Pragma','no-cache');h.set('X-Content-Type-Options','nosniff');
 const vary=new Set((h.get('Vary')||'').split(',').map(x=>x.trim()).filter(Boolean));
 for(const name of ['Cookie','Origin','Sec-Fetch-Site'])vary.add(name);h.set('Vary',[...vary].join(', '));
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
function checkRequest(request,profile,method,json=true){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 if(url.origin!==profile.origin||request.headers.get('Host')&&request.headers.get('Host')!==url.host||request.headers.get('Sec-Fetch-Site')!=='same-origin'||origin&&origin!==profile.origin||request.headers.has('Authorization'))fail('CHILD_ORIGIN_NOT_ALLOWED');
 if(request.method!==method)fail('METHOD_NOT_ALLOWED',405);
 if(!['GET','HEAD'].includes(method)&&(origin!==profile.origin||json&&request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json'))fail('CHILD_ORIGIN_NOT_ALLOWED');
}
async function emptyBody(request){
 // Bound reads independently of untrusted Content-Length or chunking.
 const reader=request.body?.getReader();if(!reader)fail('CHILD_BODY_INVALID',400);
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>64){await reader.cancel();fail('CHILD_BODY_INVALID',400);}chunks.push(value);}}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{fail('CHILD_BODY_INVALID',400);}
 if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).length)fail('CHILD_BODY_INVALID',400);
}
function primaryStore(env){
 const db=env.DB.withSession('first-primary');
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('CHILD_AUTH_CONFIG',503);
 return {first:(sql,args=[])=>db.prepare(sql).bind(...args).first(),statement:(sql,args=[])=>db.prepare(sql).bind(...args),batch:list=>db.batch(list)};
}
async function csrfKey(env){
 const raw=env.JWT_V110_CHILD_CSRF_SECRET;
 if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))fail('CHILD_AUTH_CONFIG',503);
 let bytes;try{bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail('CHILD_AUTH_CONFIG',503);}
 if(bytes.length!==32||encode(bytes)!==raw)fail('CHILD_AUTH_CONFIG',503);
 return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const packet=(profile,f)=>new TextEncoder().encode(JSON.stringify(['uaa-child-csrf-v1',profile.app,profile.origin,f.family_id,f.account_id,f.parent_session_id,f.browser_id,f.browser_generation,f.credential_epoch,f.unlock_generation,f.original_signed_in_at_s,f.original_expires_at_s]));
async function csrfValue(key,profile,f){return encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,packet(profile,f))));}
async function verifyCSRF(request,key,profile,f,token=request.headers.get('X-UAA-CSRF')){
 if(typeof token!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(token))fail('CHILD_CSRF_REQUIRED');
 let bytes;try{bytes=Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail('CHILD_CSRF_REQUIRED');}
 if(bytes.length!==32||encode(bytes)!==token||!await crypto.subtle.verify('HMAC',key,bytes,packet(profile,f)))fail('CHILD_CSRF_REQUIRED');
}
function sameFamily(session,f){const s=session;
    if(f.family_id!==s.sessionId||f.account_id!==s.accountId||f.parent_session_id!==s.parentId||f.browser_id!==s.browserId||f.browser_generation!==s.browserGeneration||f.credential_epoch!==s.credentialEpoch||f.unlock_generation!==s.unlockGeneration||f.original_signed_in_at_s*1000!==s.originalSignedAtMs||f.original_expires_at_s*1000!==s.originalExpiresAtMs)fail('CHILD_SESSION_REQUIRED',401);}
const sessionFrom=(app,c,last,now)=>({app,accountId:c.sub,sessionId:c.sid,parentId:c.psid,browserId:c.bsid,browserGeneration:c.bv,credentialEpoch:c.ce,securityVersion:c.pv,unlockGeneration:c.ue,originalSignedAtMs:c.s_iat*1000,originalExpiresAtMs:c.s_exp*1000,lastForegroundRefreshMs:last*1000,serverNowMs:now*1000});
export async function handleNativeChildAuthHTTP(request,env,{app,clock=Date.now,foregroundPolicy=()=>false}={}){
 // Caller must dispatch here exclusively when enabled. A malformed enabled
 // profile fails closed; a disabled profile returns no native legacy authority.
 if(env.JWT_V110_CHILD_NATIVE_AUTH!=='1')return reply({code:'V110_NOT_ENABLED'},404);
 try{
  const profile=localChildProfile(env,app),path=new URL(request.url).pathname;
  if(!['/api/auth/v110/context','/api/auth/v110/csrf','/api/auth/v110/refresh','/api/auth/v110/logout'].includes(path))return reply({code:'NOT_FOUND'},404);
  const context=path.endsWith('/context'),bootstrap=path.endsWith('/csrf');checkRequest(request,profile,context||bootstrap?'GET':'POST');
  if(!context&&!bootstrap)await emptyBody(request);
  // All origin/body rejection occurs before primary store or signing.
  const key=await csrfKey(env),store=primaryStore(env),cookies=request.headers.get('Cookie')||'';
  const raw=parseUniqueCookie(cookies,cookieNames[app].refresh);
  if(bootstrap){
   // Same-origin refresh possession yields ONLY an anti-CSRF token. No JWT,
   // identity, display/private context, authority, new family or clock write.
   const family=await nativeChildOwnRefreshFamily({store,app,raw,authorize:()=>{}});
   return reply({csrf:await csrfValue(key,profile,family)});
  }
  if(path.endsWith('/logout')){
   const clear=Object.values(cookieNames[app]).map(name=>name+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
   const response=reply({cancelled:true},200,clear);
   await cancelNativeChildFamily({store,app,raw,clock,authorize:f=>verifyCSRF(request,key,profile,f)});
   return response;
  }
  const engine=await createChildAccessEngine(env,{app,signing:!context});
  if(context){
   const token=parseUniqueCookie(cookies,cookieNames[app].access),cap=await authenticateNativeChildAccess({store,app,engine,token,clock});
   const value=await nativeChildDisplayContext(cap);
   const family=await nativeChildOwnRefreshFamily({store,app,raw,authorize:f=>{
    sameFamily(value.session,f);
   }});
   const csrf=await csrfValue(key,profile,family);
   // Final current proof after asynchronous refresh possession/HMAC work.
   return reply({...await nativeChildDisplayContext(cap),csrf});
  }
  if(typeof foregroundPolicy!=='function')fail('CHILD_AUTH_CONFIG',503);
  const foreground=await foregroundPolicy(request);if(typeof foreground!=='boolean')fail('CHILD_AUTH_CONFIG',503);
  let familyCSRF;
  const result=await refreshNativeChild({store,app,engine,raw,clock,foreground,
   authorizeRotation:async({family})=>{await verifyCSRF(request,key,profile,family);familyCSRF=await csrfValue(key,profile,family);},
   prepareClient:({claims,cookies,actor,lastForegroundRefreshS,serverNowS})=>reply({session:sessionFrom(app,claims,lastForegroundRefreshS,serverNowS),actor,initialViews:[],accessExpiresAtMs:claims.exp*1000,csrf:familyCSRF},200,cookies)
  });
  return result.kind==='rotated'?result.clientResponse:reply({code:result.kind==='in_progress'?'CHILD_REFRESH_IN_PROGRESS':'CHILD_READMIT_REQUIRED'},409);
 }catch(error){
  const status=Number.isInteger(error?.status)&&[400,401,403,405,409,503].includes(error.status)?error.status:401;
  const safe=new Set(['CHILD_ORIGIN_NOT_ALLOWED','METHOD_NOT_ALLOWED','CHILD_BODY_INVALID','CHILD_CSRF_REQUIRED','CHILD_PIN_REQUIRED','CHILD_TOKEN_UPDATE_REQUIRED','CHILD_REFRESH_CONFLICT','CHILD_REFRESH_REQUIRED']);
  return reply({code:status===503?'CHILD_AUTH_UNAVAILABLE':safe.has(error?.code)?error.code:'CHILD_SESSION_REQUIRED'},status);
 }
}

// Native entrypoint composition only. The callback is closed-over server code,
// never a request supplied actor/SQL/handler. No legacy cookie is synthesized.
export async function dispatchNativeChildHTTP(request,env,{app,clock=Date.now,handleNative}={}){
 const profile=localChildProfile(env,app),mutating=!['GET','HEAD'].includes(request.method);
 if(typeof handleNative!=='function')fail('CHILD_AUTH_CONFIG',503);
 checkRequest(request,profile,request.method,false);
 const store=primaryStore(env),engine=await createChildAccessEngine(env,{app});
 const token=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames[app].access);
 const cap=await authenticateNativeChildAccess({store,app,engine,token,clock});
 if(mutating){
  const key=await csrfKey(env),context=await nativeChildDisplayContext(cap);
  const raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames[app].refresh);
  await nativeChildOwnRefreshFamily({store,app,raw,authorize:async f=>{
   sameFamily(context.session,f);
   await verifyCSRF(request,key,profile,f);
  }});
 }
 return nativeChildResponse(await invokeNativeChildHandler(cap,handleNative,{mutating}));
}

// Shared only by exact selected-child native HTTP compositions.
export {csrfKey as nativeChildCSRFKey,verifyCSRF as verifyNativeChildCSRF,primaryStore as nativeChildPrimaryStore,csrfValue as nativeChildCSRFValue};
