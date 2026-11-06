// Cookie identity boundary for the isolated native Academy integration.
// The full JWT rights are not a replacement for current native resource guards.
import {AuthContractError,cookieNames,parseUniqueCookie} from './claims.mjs';
import {base64url} from 'jose';
import {academyCookieOptions,createAcademyCookieEngine} from './academy-cookie-engine.mjs';
const issuer='https://ummabbadacademy.app';
const cookieVerified=Symbol('native verified cookie');
const cookieState=Symbol('native cookie state');
const fail=(code,status=401)=>{throw Object.assign(new AuthContractError(code),{status});};
export function cookieSessionKey(claims,context){
 if(!context)return 'uaa-session:'+claims.sid+':'+claims.ue;
 const body=base64url.encode(new TextEncoder().encode(JSON.stringify({sid:claims.sid,ue:claims.ue,scope:context.scope,courseId:context.courseId,role:context.role})));
 return 'uaa-context:'+body;
}
export function cookieContextSelector(header,claims){
 if(!header)return null;
 if(!header.startsWith('Bearer ')||header.length>2048)fail('SESSION_ENDED');
 const value=header.slice(7);
 if(value==='uaa-session:'+claims.sid+':'+claims.ue)return null;
 if(!value.startsWith('uaa-context:'))fail('SESSION_ENDED');
 let p;try{const raw=value.slice(12);if(!/^[-A-Za-z0-9_]+$/.test(raw))fail('SESSION_ENDED');p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(base64url.decode(raw)));}catch{fail('SESSION_ENDED');}
 if(!p||Object.getPrototypeOf(p)!==Object.prototype||Object.keys(p).sort().join(',')!=='courseId,role,scope,sid,ue'||p.sid!==claims.sid||p.ue!==claims.ue||!['scope','courseId','role'].every(k=>typeof p[k]==='string'&&p[k].length<=180))fail('SESSION_ENDED');
 return {scope:p.scope,courseId:p.courseId,role:p.role};
}
async function verifiedCookie(request,env,now){
 const expected=env.JWT_V110_REQUEST_ORIGIN||issuer;let configured;try{configured=new URL(expected);}catch{fail('AUTH_CONFIG_UNAVAILABLE',503);}
 if(configured.origin!==expected||configured.protocol!=='https:')fail('AUTH_CONFIG_UNAVAILABLE',503);
 if(new URL(request.url).origin!==expected||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.get('Origin')&&request.headers.get('Origin')!==expected)fail('ORIGIN_NOT_ALLOWED',403);
 let publicKeys;try{publicKeys=JSON.parse(env.JWT_V110_PUBLIC_KEYS_JSON);}catch{fail('AUTH_CONFIG_UNAVAILABLE',503);}
 const engine=await createAcademyCookieEngine({app:'academy',issuer,academyCookieDomain:'ummabbadacademy.app',publicKeys,...academyCookieOptions(env)});
 const token=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames.academy.access),verified=await engine.verify(token,now),claims=verified.claims;
 if(!['GET','HEAD'].includes(request.method)){
  if(request.headers.get('Origin')!==expected)fail('ORIGIN_NOT_ALLOWED',403);
  const raw=env.JWT_V110_CSRF_SECRET,proof=request.headers.get('X-UAA-CSRF');
  if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))fail('AUTH_CONFIG_UNAVAILABLE',503);
  if(typeof proof!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(proof))fail('CSRF_REQUIRED',403);
  const secret=base64url.decode(raw),mac=base64url.decode(proof);if(secret.byteLength!==32||base64url.encode(secret)!==raw)fail('AUTH_CONFIG_UNAVAILABLE',503);
  if(mac.byteLength!==32||base64url.encode(mac)!==proof)fail('CSRF_REQUIRED',403);
  const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const c=claims,packet=['uaa-csrf-v1','academy',issuer,c.sid,c.sub,c.psid,c.bsid,c.bv,c.ce,c.ue,c.s_iat,c.s_exp];
  if(!await crypto.subtle.verify('HMAC',key,mac,new TextEncoder().encode(JSON.stringify(packet))))fail('CSRF_REQUIRED',403);
 }
 Object.defineProperty(claims,cookieVerified,{value:true});
 return {claims,selected:cookieContextSelector(request.headers.get('Authorization')||'',claims)};
}
// Added to the EXISTING primary native session gate, rather than a second
// per-request D1 lookup. Call only after strict cookie signature validation.
export function jwtSessionPredicate(c,nowMs){
 const now=Math.floor(nowMs/1000);
 if(!c||!Number.isSafeInteger(now)||!Number.isSafeInteger(c.exp)||c.exp<=now)fail('ACCESS_EXPIRED');
 const sql=" AND EXISTS(SELECT 1 FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id) JOIN jwt_v110_browser_heads b USING(browser_id) WHERE f.family_id=? AND f.account_id=a.account_id AND f.parent_session_id=? AND f.browser_id=? AND f.browser_generation=? AND f.credential_epoch=? AND f.unlock_generation=? AND f.original_signed_in_at_s=? AND f.original_expires_at_s=? AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=? AND b.generation=f.browser_generation AND f.original_expires_at_s>? AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND f.last_fg_refresh_s<=? AND ?-f.last_fg_refresh_s<5400 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id))";
 return {sql,values:[c.sid,c.psid,c.bsid,c.bv,c.ce,c.ue,c.s_iat,c.s_exp,c.pv,now,now,now]};
}

export async function verifiedAcademyCookie(request,env,now=Math.floor(Date.now()/1000)){
 try{return await verifiedCookie(request,env,now);}catch(error){if(error instanceof AuthContractError){error.status??=['INVALID_CONFIG','INVALID_KEY_REGISTRY','INVALID_COOKIE_CONFIG'].includes(error.code)?503:401;throw error;}throw Object.assign(Error('Cookie authentication is temporarily unavailable.'),{status:503,code:'AUTH_UNAVAILABLE'});}
}

export function bindCookieState(state,claims){
 if(claims?.[cookieVerified]!==true)fail('SESSION_ENDED');
 Object.defineProperty(state,cookieState,{value:claims});
}
export function trustedCookieFacts(auth){
 const c=auth.cookieClaims||auth.authority?.[cookieState]||auth.state?.[cookieState];
 if(c?.[cookieVerified]!==true)return null;
 return Object.fromEntries(['sub','sid','psid','bsid','bv','ce','pv','ue','iat','exp','s_iat','s_exp'].map(k=>[k,c[k]]));
}
