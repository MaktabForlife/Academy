import {trustedCookieFacts} from '../../auth/v110/academy-cookie-auth.mjs';
import {academyClaimsCSRF} from '../../auth/v110/academy-display-csrf.mjs';
import {academyCookieOptions} from '../../auth/v110/academy-cookie-engine.mjs';
// Native Academy homepage adapter. Cached display data never grants access.
import {hosting} from '../hosting.mjs';
import {bodyJSON,fail,id,random,signedHeaders,websiteServerOrigin,sha256} from './web-platform/protocol.mjs';
import {enqueueAccount,pendingAccount,completeSignIn,sourceSession} from './web-platform/bridge.mjs';
import {prepareAccountAccess} from './web-platform/access.mjs';
import {programmeChoice} from './web-platform/navigation.mjs';
import {dashboardChoice,dashboardSummary,dashboardJoinInput,dashboardTimetableAudience} from './web-platform/dashboard.mjs';
import {nativeJoinOwnership} from './web-platform/native-join.mjs';
import {verifySessionToken} from '../../lib/auth-primitives.js';
const only=(value,keys)=>{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw fail('Choose a valid Academy action.');return value;};
export function portalDashboardLinks(value,summary){
 const data=structuredClone(value);if(data.mode!=='learn')return data;
 const websites=summary?.websites||[],allowed=new Set((summary?.rights?.websites||[]).filter(w=>w.canOpen&&!w.needsRefresh).map(w=>w.websiteId));
 if(!Array.isArray(websites)||websites.length>100)throw fail('Studio dashboard links need review.',503);
 for(const area of data.activities||[]){
  if(area.accessOwner!=='STUDIO')continue;
  if(area.navigationKey==='mothers')area.destinationHref='/studio/?classroom=mothers';
  else if(area.websiteKind==='TAFSEER')area.destinationHref='/studio/?view=collections&collection=tafseer';
  else if(area.websiteKind==='COURSE'){
   delete area.destinationHref;
   const matches=websites.filter(w=>w.offeringId===area.websiteOfferingId&&w.kind==='COURSE'&&allowed.has(w.websiteId));
   if(matches.length===1)area.destinationHref='/studio/?website='+encodeURIComponent(id(matches[0].websiteId));
  }
 }
 return data;
}
const permissionKey=state=>JSON.stringify([state.account.account_id,state.account.credential_epoch,state.account.global_admin,state.roles,state.contexts,state.subscriptions,state.monthlyMedia]);
export function portalConfiguration(env={}){const h=hosting(),profile=env.JWT_V110_NATIVE_COOKIE==='1'?academyCookieOptions(env):null;return {academyOrigin:profile?.academyCookieMode==='HOST_ONLY_PREVIEW'?profile.academyPreviewOrigin:h.academyPortalOrigin,studioOrigin:h.studioOrigin,hifzOrigin:h.hifzOrigin,authorityMode:'ACADEMY',nativePortal:true};}

const readOnlyNativePaths=new Set(['/api/academy/entrance','/api/academy/assessments/list','/api/academy/class-notes/timetable','/api/academy/messaging/summary','/api/admin/platform/enrolment/get']);
export async function portalNativeReadRequest(path,body,mode,request,auth,env){
 const headers=new Headers({'Content-Type':'application/json'});
 for(const name of ['Authorization','Cookie','Origin','Sec-Fetch-Site','X-UAA-CSRF'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
 if(mode)headers.set('X-Academy-Workspace',mode.toUpperCase());
 if(env.JWT_V110_NATIVE_COOKIE==='1'&&request.method==='GET'){
  const origin=portalConfiguration(env).academyOrigin,actual=request.headers.get('Origin'),facts=trustedCookieFacts(auth);
  if(!readOnlyNativePaths.has(path)||request.headers.get('Sec-Fetch-Site')!=='same-origin'||new URL(request.url).origin!==origin||actual!==null&&actual!==origin)throw fail('Choose a native read action.',403,'ORIGIN_REQUIRED');
  if(!facts)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
  // This is an internal dispatch from an already authenticated safe GET, not
  // a new browser request or a general CSRF bypass. Mutations are excluded.
  headers.set('Origin',origin);headers.set('X-UAA-CSRF',await academyClaimsCSRF(env,facts));
 }
 return new Request(new URL(path,request.url),{method:'POST',headers,body:JSON.stringify(body)});
}

async function sendDeliveries(env,db,result,fetcher){
 for(const item of result.deliveries||[]){
  const response=await fetcher(websiteServerOrigin(env).origin+'/internal/academy/events',{method:'POST',headers:{'Content-Type':'application/json','X-Maktab-Signature':item.signature},body:JSON.stringify(item.delivery),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok){await response.body?.cancel();throw fail('Your account is still being connected. Please retry.',503,'ACCOUNT_DELIVERY_PENDING');}await response.body?.cancel();
 }
 if(result.acknowledge?.length)await db.prepare('UPDATE website_platform_outbox SET acknowledged=1 WHERE operation_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(result.acknowledge)).run();
}
export async function synchronizePortalAccount(env,db,accountId,fetcher=fetch){
 await enqueueAccount(db,accountId,env);await prepareAccountAccess(db,accountId);
 for(let page=0;page<4;page++){const result=await pendingAccount(env,db,accountId);await sendDeliveries(env,db,result,fetcher);if(!result.more)return;}
 throw fail('Older account changes are still being connected. Please retry.',503,'ACCOUNT_DELIVERY_PENDING');
}
export async function portalStudioSummary(env,auth,{action='bootstrap',websiteIds,offeringId,sessionId}={},fetcher=fetch){
 const state=auth.authority||auth.state;
 const value={issuedAt:Date.now(),accountId:state.account.account_id,epoch:state.account.credential_epoch,globalAdmin:Boolean(state.account.global_admin),sessionId:auth.sid,...(action==='join'?{}:{action}),...(websiteIds?{websiteIds}:{}),...(offeringId?{offeringId,lessonSessionId:sessionId}:{})};
 const path=action==='join'?'/internal/studio/hub-join':'/internal/studio/hub-summary',signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,path,value);
 const response=await fetcher(websiteServerOrigin(env).origin+path,{method:'POST',headers:signed.headers,body:signed.payload,redirect:'manual',signal:AbortSignal.timeout(8000)}),result=await bodyJSON(response.body,262144);
 if(!response.ok)throw fail(result.error||'Studio access could not be checked.',response.status>=500?503:response.status,result.code||'STUDIO_UNAVAILABLE');
 return result;
}
export async function nativePortal(request,env,{repository,authenticate,read,mint,login,fetcher=env.WEBSITE_PLATFORM_SERVICE?.fetch.bind(env.WEBSITE_PLATFORM_SERVICE)||fetch}){
 // Legacy Studio summary/management transport is unselected in first hands-on
 // V110. Root's local native dashboard still resolves through Promise.allSettled.
 // Never invoke a passed private target or fall back to global fetch here.
 if(['AUTH_PIN_READONLY_V1','NATIVE_WEBSITE_HIFZ_V1'].includes(env.JWT_LOCAL_TEST_ROUTE_POLICY))fetcher=async()=>{throw Object.assign(Error('This connection is unavailable in this local test.'),{status:503,code:'LOCAL_PREVIEW_ACTION_UNAVAILABLE'});};
 const path=new URL(request.url).pathname,config=portalConfiguration(env);
 if(path==='/api/academy/hub/config'&&request.method==='GET')return config;
 const conditionalGET=request.method==='GET'&&path==='/api/academy/hub/read';
 if(request.method!=='POST'&&!conditionalGET)throw fail('Use a POST request.',405);
 const origin=request.headers.get('Origin'),allowed=new Set([config.academyOrigin,...hosting().academyLegacyOrigins]);
 const ownRead=conditionalGET&&env.JWT_V110_NATIVE_COOKIE==='1'&&origin===null&&request.headers.get('Sec-Fetch-Site')==='same-origin'&&new URL(request.url).origin===config.academyOrigin;
 if(!allowed.has(origin)&&!ownRead)throw fail('Reopen this action from Academy.',403,'ORIGIN_REQUIRED');
 let input;if(conditionalGET){const raw=new URL(request.url).searchParams.get('request');if(!raw||raw.length>8192)throw fail('Choose a bounded Academy view.');try{input=JSON.parse(raw);}catch{throw fail('Invalid Academy request.');}if(!input||Array.isArray(input)||typeof input!=='object')throw fail('Invalid Academy request.');}else input=await bodyJSON(request.body,8192);
 if(path==='/api/academy/hub/login'){
  if(env.JWT_V110_NATIVE_COOKIE==='1')throw fail('Use the cookie sign-in endpoint.',409,'COOKIE_LOGIN_REQUIRED');
  only(input,['uniqueid','pin','setup','pinConfirmation']);
  const result=await login(input),header='Bearer '+result.token;
  const auth=await authenticate(new Request(request.url,{headers:{Authorization:header}}));
  try{await admitted(repository,auth);await synchronizePortalAccount(env,repository.coreDb,auth.state.account.account_id,fetcher);}catch(error){await repository.revoke(auth.sid,auth.state.account.account_id);throw error;}
  return result;
 }
 const auth=await authenticate(request),state=auth.authority||auth.state;
 await admitted(repository,auth);
 const before=permissionKey(state),current=async()=>{
  const latest=await authenticate(request);await admitted(repository,latest);
  if(latest.sid!==auth.sid||permissionKey(latest.authority||latest.state)!==before)throw fail('Your Academy account or permissions changed. Reopen this page.',409,'ACCESS_REFRESH_REQUIRED');
 };
 const studio=async options=>{const result=await portalStudioSummary(env,auth,options,fetcher);await current();return result;};
 const nativeScopes=async()=>(await repository.coreDb.prepare('SELECT s.activity_key,m.offering_id,m.kind,o.state access_owner FROM json_each(?) a JOIN website_platform_access_scopes s ON s.activity_key=a.value COLLATE NOCASE JOIN website_platform_timetable_scopes m USING(activity_key) LEFT JOIN website_platform_access_ownership o INDEXED BY website_platform_ownership_nocase ON o.activity_key=s.activity_key COLLATE NOCASE WHERE s.enabled=1').bind(JSON.stringify(state.activities.slice(0,100).map(a=>a.activity_key))).all()).results;
 const dashboard=async value=>{
  only(value,['mode','refresh','date','weekStart']);
  const {refresh,...selection}=value;if(refresh!==undefined&&typeof refresh!=='boolean')throw fail('Choose a valid refresh action.');
  const produce=async()=>dashboardSummary(state,env,selection,(p,b,m)=>read(p,b,m,request,auth),await nativeScopes());
  // Preserve the existing native snapshot readers. A combined cache needs a
  // proven Core/Admin revision vector covering notes, messages and enrolment.
  const data=await produce();
  await current();return {...data,serverTime:Date.now()};
 };
 if(path==='/api/academy/hub/refresh'){only(input,[]);await synchronizePortalAccount(env,repository.coreDb,state.account.account_id,fetcher);await current();return {verifiedAt:Date.now()};}
 if(path==='/api/academy/hub/studio-join'){only(input,['offeringId','sessionId']);return studio({action:'join',offeringId:id(input.offeringId),sessionId:id(input.sessionId)});}
 if(path==='/api/academy/hub/read'){
  only(input,['kind','input']);const value=input.input||{};
  if(input.kind==='navigation'){only(value,[]);return (await studio({action:'navigation'})).navigation;}
  if(input.kind==='access'){only(value,['websiteIds']);return (await studio({action:'access',websiteIds:value.websiteIds})).rights;}
  if(input.kind==='dashboard'){
   const isolatedOwnApp=env.JWT_V110_NATIVE_COOKIE==='1'&&academyCookieOptions(env).academyCookieMode==='HOST_ONLY_PREVIEW';
   if(isolatedOwnApp){const data=await dashboard(value);if(!(data.activities||[]).some(area=>area.accessOwner==='STUDIO'))return portalDashboardLinks(data,null);return portalDashboardLinks(data,await studio({action:'bootstrap'}));}
   const [data,summary]=await Promise.all([dashboard(value),studio({action:'bootstrap'})]);return portalDashboardLinks(data,summary);
  }
  if(input.kind!=='bootstrap')throw fail('Choose a valid Academy view.');
  only(value,['mode','preferredMode','preferredAccount']);
  const mode=value.mode||value.preferredAccount===state.account.account_id&&value.preferredMode||undefined;
  const claims=auth.cookieClaims||await verifySessionToken((request.headers.get('Authorization')||'').slice(7),env);
  const account={accountId:state.account.account_id,displayName:state.account.display_name,globalAdmin:Boolean(state.account.global_admin),cacheSession:await sha256(auth.sid),verifiedAt:Math.min(Date.now(),claims.iat*1000),sessionExpiresAt:claims.exp*1000};
  const parts=await Promise.allSettled([studio({action:'bootstrap'}),dashboard(mode?{mode}:{})]),errors={};
  for(const [i,key]of ['navigation','dashboard'].entries())if(parts[i].status==='rejected'){const e=parts[i].reason;if(e.status===401||e.code==='ACCESS_REFRESH_REQUIRED')throw e;errors[key]={status:e.status||503,code:e.code||'UNAVAILABLE'};}
  await current();return {configuration:config,account,navigation:parts[0].status==='fulfilled'?parts[0].value.navigation:null,dashboard:parts[1].status==='fulfilled'?portalDashboardLinks(parts[1].value,parts[0].status==='fulfilled'?parts[0].value:null):null,errors};
 }
 if(path==='/api/academy/hub/open'){
  only(input,['navigation','dashboard']);if(Boolean(input.navigation)===Boolean(input.dashboard))throw fail('Choose one destination.');
  const choice=input.dashboard?dashboardChoice(state,input.dashboard):programmeChoice(state,input.navigation,env);
  await current();return {...(auth.cookieClaims?{cookieSession:true,sessionKey:await mint(auth,choice.context||auth.context)}:{token:await mint(auth,choice.context||auth.context)}),destination:choice.destination,circles:{mode:input.dashboard?.mode||'learn',returnUrl:config.academyOrigin+'/?workspace='+(input.dashboard?.mode||'learn')}};
 }
 if(path==='/api/academy/hub/join'){
  const selected=dashboardJoinInput(state,input);await nativeJoinOwnership(repository.coreDb,state.account.account_id,selected.target);
  let result;try{result=await read('/api/academy/lesson/join',{joinKey:selected.joinKey,date:selected.date},dashboardTimetableAudience(state,selected.mode),request,auth);}
  catch(error){if(error.status!==403||error.code!=='LESSON_UNAVAILABLE')throw error;result=await read('/api/academy/public-lesson/join',{joinKey:selected.joinKey,date:selected.date},'learn',request,auth);}
  await current();await nativeJoinOwnership(repository.coreDb,state.account.account_id,selected.target);return result;
 }
 if(path==='/api/academy/hub/legacy-open'){
  only(input,['navigation','challenge','state']);if(input.navigation!=='hifz'||![input.challenge,input.state].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v||'')))throw fail('Reopen Hifz from your dashboard.');
  programmeChoice(state,'hifz',env);await current();const db=repository.coreDb,sourceRef=random(),code=random();
  await db.prepare('INSERT INTO website_platform_sessions VALUES(?,?,?,?,?,?,?,?)').bind(sourceRef,state.account.account_id,auth.sid,state.account.credential_epoch,JSON.stringify(auth.context),Date.now()+7*86400_000,input.challenge,input.state).run();
  await db.prepare('INSERT INTO website_platform_return_codes(code_hash,source_ref,challenge,state,expires_at,used,return_context) VALUES(?,?,?,?,?,0,?)').bind(await sha256(code),sourceRef,input.challenge,input.state,Date.now()+60000,JSON.stringify({navigation:'hifz',entry:'portal'})).run();
  await current();return {code};
 }
 if(path==='/api/academy/hub/studio-start'){
  only(input,['challenge','state','sourceRef']);if(![input.challenge,input.state].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v||'')))throw fail('Reopen Studio from Academy.');
  const db=repository.coreDb;let session=null;
  if(input.sourceRef&&/^[A-Za-z0-9_-]{43}$/.test(input.sourceRef))try{const candidate=await sourceSession(db,input.sourceRef);if(candidate.session_id===auth.sid&&candidate.account_id===state.account.account_id&&candidate.epoch===state.account.credential_epoch)session=candidate;}catch{/* A stale hint is never authority. */}
  if(!session){const sourceRef=random();await db.prepare('INSERT INTO website_platform_sessions VALUES(?,?,?,?,?,?,?,?)').bind(sourceRef,state.account.account_id,auth.sid,state.account.credential_epoch,JSON.stringify(auth.context),Date.now()+7*86400_000,input.challenge,input.state).run();session=await sourceSession(db,sourceRef);}
  // Normal return visits need no new identity/access outbox. Refresh once only
  // if the destination reports stale master proof, using existing native gates.
  try{await portalStudioSummary(env,auth,{action:'navigation'},fetcher);}catch(error){
   if(!['ACCESS_REFRESH_REQUIRED','STATUS_EXPIRED','SIGN_IN_REQUIRED'].includes(error.code))throw error;
   await synchronizePortalAccount(env,db,state.account.account_id,fetcher);
   await portalStudioSummary(env,auth,{action:'navigation'},fetcher);
  }
  await current();const result=await completeSignIn(env,db,{...session,challenge:input.challenge,state:input.state});if(result.more)throw fail('Your account connection is still being prepared.',503);
  await sendDeliveries(env,db,result,fetcher);await current();return {code:result.code,sourceRef:session.source_ref};
 }
 throw fail('This Academy action is unavailable.',404);
}
async function admitted(repository,auth){
 const state=auth.authority||auth.state;
 const row=await repository.coreDb.prepare('SELECT active,admitted,epoch,global_admin FROM website_platform_account_state WHERE account_id=?').bind(state.account.account_id).first();
 if(!row?.active||!row.admitted||row.epoch!==state.account.credential_epoch||Boolean(row.global_admin)!==Boolean(state.account.global_admin))throw fail('Your Academy account is unavailable or changed.',401,'SESSION_ENDED');
}

export async function portalReadReply(request,data,auth){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Access-Control-Expose-Headers':'ETag, X-Maktab-Server-Time','X-Maktab-Server-Time':String(Date.now())};
 if(Object.keys(data.errors||{}).length)return Response.json(data,{headers});
 const state=auth.authority||auth.state,stable=JSON.stringify(data,(key,value)=>['serverTime','checkedAt'].includes(key)?undefined:value);
 const tag='"pv1-'+await sha256(JSON.stringify(['ACADEMY_PORTAL_V1',auth.sid,state.account.account_id,state.account.credential_epoch,state.account.global_admin,state.roles,state.subscriptions,state.monthlyMedia,stable]))+'"';
 headers.ETag=tag;
 if(request.method==='GET'&&request.headers.get('If-None-Match')===tag)return new Response(null,{status:304,headers});
 return Response.json(data,{headers});
}
