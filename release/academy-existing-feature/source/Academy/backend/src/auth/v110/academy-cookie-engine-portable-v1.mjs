// SOURCE ONLY explicit portable Root cookie composition, DEFAULT OFF.
// Incoming requests, claims, SQL/native proof, keys and MSI guards are untouched.
import {createNativeCookieEngine} from './native-rights.mjs';
import {cookieNames} from './claims.mjs';
import {requirePortableNativeMethod} from './portable-native-profile-v2.mjs';
const fail=()=>{throw Object.assign(Error('PORTABLE_ROOT_COOKIE_CONFIG'),{code:'PORTABLE_ROOT_COOKIE_CONFIG',status:503});};
function context(env){
 const p=requirePortableNativeMethod(env,'academy','cookie');
 const domain=new URL(p.origins.academy).hostname;
 if(p.issuers.academy!==p.origins.academy||!['HOST_ONLY','APPROVED_SHARED_PARENT'].includes(p.rootCookieMode))fail();
 return {p,domain};
}
export function portableRootCookieOptions(env){
 const {p,domain}=context(env);
 return Object.freeze({academyCookieMode:'PORTABLE_NATIVE_FEATURE_V1',academyPortableProfile:p.profileId,academyPortableOrigin:p.origins.academy,academyCookieDomain:domain});
}
export async function createPortableRootCookieEngine(env,config){
 const {p,domain}=context(env);
 if(!config||config.app!=='academy'||config.issuer!==p.issuers.academy||config.academyCookieMode!=='PORTABLE_NATIVE_FEATURE_V1'||config.academyPortableProfile!==p.profileId||config.academyPortableOrigin!==p.origins.academy||config.academyCookieDomain!==domain)fail();
 // Native cryptography, compact rights, exact claim/lifetime/size checks and
 // refresh-cookie implementation remain the actual owning native engine.
 const engine=await createNativeCookieEngine(config);
 context(env);
 const access=value=>{
  context(env);
  const suffix='; Domain='+domain;
  if(typeof value!=='string'||!value.endsWith(suffix))fail();
  // Strip only the configured FEATURE Root domain for explicit host-only mode.
  // No canonical-production cookie, issuer, URL or Origin is substituted.
  if(p.rootCookieMode==='HOST_ONLY')return value.slice(0,-suffix.length);
  if(p.rootCookieDomain!==domain)fail();
  return value;
 };
 return Object.freeze({
  async issue(input,rights,now){context(env);const issued=await engine.issue(input,rights,now);context(env);return {...issued,setCookie:access(issued.setCookie)};},
  verify(token,now){context(env);return engine.verify(token,now);},
  accessCookie(token,expiresAt,now){context(env);return access(engine.accessCookie(token,expiresAt,now));},
  refreshCookie(token,expiresAt,now){context(env);return engine.refreshCookie(token,expiresAt,now);}
 });
}
export function clearPortableRootCookies(env){
 const {p,domain}=context(env),base='; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
 return Object.freeze([
  cookieNames.academy.access+'='+base+(p.rootCookieMode==='APPROVED_SHARED_PARENT'?'; Domain='+domain:''),
  // The native __Host refresh cookie always remains host-only.
  cookieNames.academy.refresh+'='+base
 ]);
}
