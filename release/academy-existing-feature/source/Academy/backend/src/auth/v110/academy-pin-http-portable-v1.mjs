// Exact same-origin PIN composition. Existing native PIN handler owns attempts,
// PIN setup/verification and native permission/context selection.
import {base64url,importJWK} from 'jose';
import {AuthContractError} from './claims.mjs';
import {portableRootCookieOptions,createPortableRootCookieEngine} from './academy-cookie-engine-portable-v1.mjs';
import {portableNativeOrigins,portableNativeHTTPRequest,requirePortableNativeMethod} from './portable-native-profile-v2.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {issueAcademySessionFromNativePIN} from './academy-master-issuer-v3.mjs';
const issuer=portableNativeOrigins.academy,fail=code=>{throw new AuthContractError(code);};
const reply=(body,status=200,more={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff',...more}});
async function bounded(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail('INVALID_PIN_BODY');
 const reader=request.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
 try{if(reader)for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>4096){await reader.cancel();fail('INVALID_PIN_BODY');}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();
  const value=JSON.parse(text||'{}');if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['uniqueid','pin','pinConfirmation'].includes(k)))fail('INVALID_PIN_BODY');return value;
 }catch(e){if(e instanceof AuthContractError)throw e;fail('INVALID_PIN_BODY');}finally{reader?.releaseLock();}
}
export async function handleAcademyPIN(request,env,{performNativeLogin,clock=()=>Math.floor(Date.now()/1000)}={}){
 if(env.JWT_V110_MASTER!=='1')return reply({success:false,code:'V110_NOT_ENABLED'},404);
 const url=new URL(request.url),setup=url.pathname==='/auth/v110/setup-pin';
 if(!['/auth/v110/login','/auth/v110/setup-pin'].includes(url.pathname))return reply({success:false,code:'NOT_FOUND'},404);
 if(request.method!=='POST')return reply({success:false,code:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
 try{
  const profile=portableNativeHTTPRequest(request,env,'academy'),expected=profile.origins.academy;
  if(url.origin!==expected||url.search||request.headers.get('Origin')!==expected||request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply({success:false,code:'ORIGIN_NOT_ALLOWED'},403);
  if(typeof performNativeLogin!=='function'||!env.ACADEMY_DB?.withSession)fail('SIGN_IN_UNAVAILABLE');
  let publics,privateJWK;try{publics=JSON.parse(env.JWT_V110_PUBLIC_KEYS_JSON);privateJWK=JSON.parse(env.JWT_V110_PRIVATE_KEY_JSON);}catch{fail('SIGN_IN_UNAVAILABLE');}
  const pub=Array.isArray(publics)&&publics.find(k=>k.kid===env.JWT_V110_SIGNING_KID);
  if(!privateJWK||privateJWK.kty!=='EC'||privateJWK.crv!=='P-256'||!privateJWK.d||privateJWK.kid!==env.JWT_V110_SIGNING_KID||!pub||pub.x!==privateJWK.x||pub.y!==privateJWK.y)fail('SIGN_IN_UNAVAILABLE');
  const secret=env.JWT_V110_CSRF_SECRET;if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail('SIGN_IN_UNAVAILABLE');
  const bytes=base64url.decode(secret);if(bytes.byteLength!==32||base64url.encode(bytes)!==secret)fail('SIGN_IN_UNAVAILABLE');
  const config={app:'academy',issuer,...portableRootCookieOptions(env),publicKeys:publics,signingKey:await importJWK(privateJWK,'ES256'),signingKid:env.JWT_V110_SIGNING_KID};
  await createPortableRootCookieEngine(env,config); // Configuration failures precede PIN effects.
  const input=await bounded(request),repository=academyD1Repository(env);
  // The callback invokes the real native dispatch and captures only its
  // server-side checked state/context/session. Its legacy token stays in RAM.
  const csrfKey=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const {native,publicResult}=await performNativeLogin(input,{setup});
  config.prepareClient=async({claims:c,state})=>{
   const packet=['uaa-csrf-v1','academy',issuer,c.sid,c.sub,c.psid,c.bsid,c.bv,c.ce,c.ue,c.s_iat,c.s_exp];
   const csrf=base64url.encode(new Uint8Array(await crypto.subtle.sign('HMAC',csrfKey,new TextEncoder().encode(JSON.stringify(packet)))));
   return ({claims:c,cookies,committedAt,lastForegroundRefreshS})=>{
    const browserContext={app:'academy',accountId:c.sub,sessionId:c.sid,parentId:c.psid,browserId:c.bsid,browserGeneration:c.bv,credentialEpoch:c.ce,securityVersion:c.pv,unlockGeneration:c.ue,originalSignedAtMs:c.s_iat*1000,originalExpiresAtMs:c.s_exp*1000,lastForegroundRefreshMs:lastForegroundRefreshS*1000,serverNowMs:committedAt*1000};
    const body={success:true,account:{...publicResult.account,accountId:c.sub},context:publicResult.context,contexts:publicResult.contexts,courseManagement:publicResult.courseManagement,sessionStore:'D1',operationalAccessActive:publicResult.operationalAccessActive,cookieSession:true,sessionKey:'uaa-session:'+c.sid+':'+c.ue,accessExpiresAtMs:c.exp*1000,csrf,browserContext};
    const response=reply(body);for(const value of cookies)response.headers.append('Set-Cookie',value);return response;
   };
  };
  const issued=await issueAcademySessionFromNativePIN({request,env,repository,native,config,clock});
  if(!(issued.clientResponse instanceof Response))fail('SIGN_IN_UNAVAILABLE');
  return issued.clientResponse;
 }catch(error){
  const code=error instanceof AuthContractError?error.code:error.code;
  if(code==='INVALID_PIN_BODY')return reply({success:false,code},400);
  if(error.status&&[400,401,403,404,429].includes(error.status))return reply({success:false,code:code||'SIGN_IN_REJECTED',error:error.message},error.status,error.status===429?{'Retry-After':'60'}:{});
  if(['SESSION_ENDED','SIGN_IN_RETRY_REQUIRED'].includes(code))return reply({success:false,code},401);
  return reply({success:false,code:'SIGN_IN_UNAVAILABLE'},503);
 }
}
