// Same-origin nonsecret family state. No identity, JWT, CSRF, resource or clock.
import {localChildProfile} from './local-child-profile.mjs';
import {cookieNames,parseUniqueCookie} from './claims.mjs';
import {nativeChildRefreshFingerprint} from './native-child-refresh-fingerprint.mjs';
import {nativeChildResponse} from './child-auth-http.mjs';
const reply=(body,status=200)=>nativeChildResponse(Response.json(body,{status}));
export async function nativeChildAdmissionStatus(request,env,app){
 if(env.JWT_V110_CHILD_ADMISSION!=='NATIVE_ROOT_V1')return reply({code:'NOT_FOUND'},404);
 try{
  const p=localChildProfile(env,app),u=new URL(request.url);
  if(u.origin!==p.origin||u.pathname!=='/api/auth/v110/admission/status'||u.search||request.method!=='GET'||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.get('Origin')&&request.headers.get('Origin')!==p.origin||request.headers.has('Authorization')||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return reply({code:'ORIGIN_NOT_ALLOWED'},403);
  const header=request.headers.get('Cookie')||'',name=cookieNames[app].refresh;
  if(!header.split(';').some(part=>part.trim().startsWith(name+'=')))return reply({state:'REQUIRED'});
  const raw=parseUniqueCookie(header,name),fp=await nativeChildRefreshFingerprint(app,raw),now=Math.floor(Date.now()/1000),db=env.DB.withSession('first-primary');
  const family=await db.prepare('SELECT f.revoked,f.original_expires_at_s,f.browser_generation,b.generation current_generation,t.parent_session_id tombstoned FROM jwt_v110_families f JOIN jwt_v110_browser_heads b USING(browser_id) LEFT JOIN jwt_v110_parent_tombstones t ON t.parent_session_id=f.parent_session_id WHERE f.refresh_fp=? OR f.previous_fp=?').bind(fp,fp).first();
  const existing=family&&family.revoked===0&&family.original_expires_at_s>now&&family.browser_generation===family.current_generation&&!family.tombstoned;
  // Idle/current native rights never become authority here. A still-existing
  // family must use own PIN; actual first admission remains guarded by Root.
  return reply({state:existing?'EXISTING':'REQUIRED'});
 }catch{return reply({code:'ADMISSION_STATE_UNAVAILABLE'},503);}
}
