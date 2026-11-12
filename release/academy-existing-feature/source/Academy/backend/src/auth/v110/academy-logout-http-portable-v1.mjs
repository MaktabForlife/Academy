import {portableMasterOutboxEnabled} from './portable-master-outbox-profile-v1.mjs';
import {nativeMasterLifecycleCapture} from './master-lifecycle-capture.mjs';
// Own-family cancellation. Possession of the opaque HttpOnly refresh cookie and
// its same-family CSRF proof permits revocation, never admission or renewal.
// It remains usable after access expiry/idle lock and needs no signing key.
import {base64url} from 'jose';
import {AuthContractError,cookieNames,parseUniqueCookie} from './claims.mjs';
import {clearPortableRootCookies} from './academy-cookie-engine-portable-v1.mjs';
import {portableNativeOrigins,portableNativeHTTPRequest,requirePortableNativeMethod} from './portable-native-profile-v2.mjs';
import {fingerprint} from './store.mjs';
const issuer=portableNativeOrigins.academy;
const fail=code=>{throw new AuthContractError(code);};
const reply=(body,status=200,more={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff',...more}});
function bytes(value,code){
 if(typeof value!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(value))fail(code);
 const raw=base64url.decode(value);if(raw.byteLength!==32||base64url.encode(raw)!==value)fail(code);return raw;
}
const packet=f=>new TextEncoder().encode(JSON.stringify(['uaa-csrf-v1','academy',issuer,f.family_id,f.account_id,f.parent_session_id,f.browser_id,f.browser_generation,f.credential_epoch,f.unlock_generation,f.original_signed_in_at_s,f.original_expires_at_s]));
const where='family_id=? AND account_id=? AND parent_session_id=? AND browser_id=? AND browser_generation=? AND credential_epoch=? AND unlock_generation=? AND original_signed_in_at_s=? AND original_expires_at_s=? AND (refresh_fp=? OR previous_fp=?)';
const values=(f,fp)=>[f.family_id,f.account_id,f.parent_session_id,f.browser_id,f.browser_generation,f.credential_epoch,f.unlock_generation,f.original_signed_in_at_s,f.original_expires_at_s,fp,fp];
export async function handleAcademyLogout(request,env,{clock=()=>Math.floor(Date.now()/1000)}={}){
 const url=new URL(request.url),nonce=url.pathname==='/auth/v110/logout-csrf';
 if(!nonce&&url.pathname!=='/auth/v110/logout')return reply({code:'NOT_FOUND'},404);
 if(env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1')return reply({code:'V110_NOT_ENABLED'},404);
 const method=nonce?'GET':'POST';if(request.method!==method)return reply({code:'METHOD_NOT_ALLOWED'},405,{Allow:method});
 try{
  const profile=portableNativeHTTPRequest(request,env,'academy'),expected=profile.origins.academy;
  portableMasterOutboxEnabled(env);
  if(url.origin!==expected||url.search||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.get('Origin')&&request.headers.get('Origin')!==expected||!nonce&&request.headers.get('Origin')!==expected)return reply({code:'ORIGIN_NOT_ALLOWED'},403);
  if(!env.ACADEMY_DB?.withSession)fail('LOGOUT_UNAVAILABLE');
  const key=await crypto.subtle.importKey('raw',bytes(env.JWT_V110_CSRF_SECRET,'LOGOUT_UNAVAILABLE'),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames.academy.refresh),fp=await fingerprint('academy',raw),db=env.ACADEMY_DB.withSession('first-primary');
  // A spent predecessor may cancel its OWN immutable family, but can never
  // rotate, name another family/account or issue any credential.
  const family=(await db.prepare('SELECT * FROM jwt_v110_families WHERE refresh_fp=? OR previous_fp=?').bind(fp,fp).all()).results[0];
  if(!family)fail('SESSION_ENDED');
  if(nonce)return reply({csrf:base64url.encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,packet(family))))});
  const proof=bytes(request.headers.get('X-UAA-CSRF'),'CSRF_REQUIRED');
  if(!await crypto.subtle.verify('HMAC',key,proof,packet(family)))fail('CSRF_REQUIRED');
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail('INVALID_LOGOUT_BODY');
  const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
  try{if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024){await reader.cancel();fail('INVALID_LOGOUT_BODY');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();const body=JSON.parse(text||'{}');if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).length)fail('INVALID_LOGOUT_BODY');}catch(error){if(error instanceof AuthContractError)throw error;fail('INVALID_LOGOUT_BODY');}finally{reader?.releaseLock();}
  const now=clock();if(!Number.isSafeInteger(now)||now<0)fail('LOGOUT_UNAVAILABLE');
  const response=reply({success:true,cancelled:true});
  for(const value of clearPortableRootCookies(env))response.headers.append('Set-Cookie',value);
  const result=await db.batch([
   db.prepare('INSERT INTO jwt_v110_parent_tombstones(parent_session_id,expires_at_s) SELECT parent_session_id,original_expires_at_s FROM jwt_v110_families WHERE '+where+' ON CONFLICT(parent_session_id) DO UPDATE SET expires_at_s=max(expires_at_s,excluded.expires_at_s) RETURNING parent_session_id').bind(...values(family,fp)),
   db.prepare('UPDATE account_sessions SET revoked_at=coalesce(revoked_at,?) WHERE session_id=? AND account_id=? AND EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones WHERE parent_session_id=?)').bind(new Date(now*1000).toISOString(),family.family_id,family.account_id,family.parent_session_id),
   db.prepare('UPDATE jwt_v110_families SET revoked=1 WHERE family_id=? AND account_id=? AND EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones WHERE parent_session_id=?)').bind(family.family_id,family.account_id,family.parent_session_id),
   db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) SELECT ?,?,'NATIVE_LOGOUT',? WHERE EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones WHERE parent_session_id=?) ON CONFLICT(operation_id) DO NOTHING").bind('logout:'+family.family_id,family.family_id,now,family.parent_session_id),
   ...nativeMasterLifecycleCapture(db,{enabled:portableMasterOutboxEnabled(env),kind:'parent-revoked',familyId:family.family_id,accountId:family.account_id,operationId:'logout:'+family.family_id,now})
  ]);
  if(result[0].results?.length!==1)return reply({code:'CANCELLATION_CHANGED'},409);
  return response;
 }catch(error){
  const code=error instanceof AuthContractError?error.code:'LOGOUT_UNAVAILABLE';
  if(code==='CSRF_REQUIRED')return reply({code},403);
  if(code==='INVALID_LOGOUT_BODY')return reply({code},400);
  if(['LOGOUT_UNAVAILABLE','INVALID_COOKIE_CONFIG'].includes(code))return reply({code:'LOGOUT_UNAVAILABLE'},503);
  return reply({code:'CANCELLATION_REQUIRED'},401);
 }
}
