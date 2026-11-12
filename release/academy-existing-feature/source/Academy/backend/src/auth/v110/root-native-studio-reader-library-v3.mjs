// SOURCE ONLY. Native personal library metadata; no grant, ticket or status write.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {parseStudioReaderResource} from './studio-reader-admission-contract-v1.mjs';
import {sign,verify,sha256} from '../../academy/d1/web-platform/protocol.mjs';
import {readerLibraryPurpose,readerLibraryACKPurpose,readerLibraryACK} from './native-reader-library-contract-v1.mjs';
export const studioReaderLibraryPath='/api/academy/website-studio/reader-library';
const root='https://ummabbadacademy.app',fail=(code='STUDIO_READER_LIBRARY_UNCONFIRMED',status=503)=>{throw Object.assign(Error(code),{code,status});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const pageSQL=[
 'SELECT a.activity_key,a.kind source_kind,t.kind,t.offering_id,o.state owner,s.enabled,c.website_id course_website,b.programme_key,b.enabled programme_enabled',
 'FROM activities a JOIN website_platform_timetable_scopes t USING(activity_key)',
 'JOIN website_platform_access_scopes s USING(activity_key)',
 'JOIN website_platform_access_ownership o USING(activity_key)',
 'JOIN website_platform_completed_courses c USING(activity_key)',
 'LEFT JOIN website_platform_programmes b USING(activity_key)',
 "WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.kind='COURSE' AND t.kind='COURSE' AND o.state='STUDIO' AND s.enabled=1 AND COALESCE(b.enabled,1)=1",
 'ORDER BY a.activity_key COLLATE NOCASE LIMIT 5 OFFSET ?'
].join(' ');
const keys=['activity_key','source_kind','kind','offering_id','owner','enabled','course_website','programme_key','programme_enabled'];
const exact=(v,k)=>Boolean(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join()===k.slice().sort().join());
export async function readRootNativeStudioReaderLibrary({request,env,input,peer}){
 assertLocalIntegrationProfile(env);
 const u=new URL(request.url);
 if(env.JWT_LOCAL_STUDIO_READER_ADMISSION!=='NATIVE_RESOURCE_V1'||env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_LOCAL_CHILD_ADMISSION!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_LOCAL_OUTBOX!=='1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||['JWT_LOCAL_AI','JWT_LOCAL_PROVIDERS','JWT_LOCAL_TRANSCRIPTION','JWT_LOCAL_SCHEDULES'].some(k=>env[k]!=='OFF')||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0'||typeof peer?.readCurrentAccountReceipt!=='function')fail();
 if(u.origin!==root||u.pathname!==studioReaderLibraryPath||u.search||u.href.includes('?')||u.hash||u.username||u.password||request.method!=='POST'||request.headers.get('Origin')!==root||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)fail('STUDIO_READER_ORIGIN',403);
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>k!=='page')||input.page!==undefined&&(!Number.isSafeInteger(input.page)||input.page<0||input.page>12))fail('STUDIO_READER_BODY',400);
 const started=Date.now(),db=env.ACADEMY_DB.withSession('first-primary'),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
 if(!Number.isSafeInteger(version)||version<0)fail();
 const repository=academyD1Repository(env),auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);
 const c=trustedCookieFacts(auth),state=actualState(auth);
 if(!c||c.sid!==c.psid||state.account.account_id!==c.sub||state.account.credential_epoch!==c.ce)fail('STUDIO_READER_SESSION_REQUIRED',401);
 if(!['LEARN','TEACH'].includes(auth.workspace)||auth.adminView||auth.classView||state.account.global_admin)fail('STUDIO_READER_PERSONAL_WORKSPACE_REQUIRED',403);
 const pageNumber=input.page||0,offset=pageNumber*4,rows=(await db.prepare(pageSQL).bind(offset).all())?.results;
 if(!Array.isArray(rows)||rows.length>5||rows.some(r=>!exact(r,keys)||!stable(r.activity_key)||!r.activity_key.startsWith('COURSE:')||!stable(r.offering_id)||!stable(r.course_website)))fail();
 if(pageNumber===12&&rows.length===5)fail('STUDIO_READER_LIBRARY_PAGE_BOUND');
 const page=rows.slice(0,4),resources=page.filter(r=>!state.roles.some(role=>role.role==='PROGRAM_ADMIN'&&role.activity_key.toUpperCase()===r.activity_key.toUpperCase())&&(auth.workspace!=='TEACH'||state.roles.some(role=>role.role==='TEACHER'&&role.activity_key.toUpperCase()===r.activity_key.toUpperCase()))).map(r=>parseStudioReaderResource({activityKey:r.activity_key,offeringId:r.offering_id,websiteId:r.course_website,surahId:null}));
 if(new Set(resources.map(r=>r.websiteId)).size!==resources.length)fail();
 const profile=await db.prepare('SELECT display_name,active,admitted,epoch,global_admin FROM website_platform_account_state WHERE account_id=?').bind(c.sub).first();
 if(!profile||profile.active!==1||profile.admitted!==1||profile.epoch!==c.ce||profile.global_admin!==0||typeof profile.display_name!=='string')fail();
 function fence(now){
  const jwt=jwtSessionPredicate(c,now),mapping='(SELECT json_group_array(json_object('+keys.map(k=>"'"+k+"',q."+k).join(',')+')) FROM ('+pageSQL+') q) IS ?';
  const personal="NOT EXISTS(SELECT 1 FROM json_each(?) r JOIN role_assignments role ON role.activity_key=json_extract(r.value,'$.activityKey') COLLATE NOCASE WHERE role.account_id=? AND role.role='PROGRAM_ADMIN' AND role.active=1 AND role.review_state='CONFIRMED')"+(auth.workspace==='TEACH'?" AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM role_assignments role WHERE role.account_id=? AND role.activity_key=json_extract(r.value,'$.activityKey') COLLATE NOCASE AND role.role='TEACHER' AND role.active=1 AND role.review_state='CONFIRMED'))":"");
  return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND a.global_admin=0 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?"+jwt.sql+" AND NOT EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AND (SELECT version FROM split_read_state WHERE singleton=1)=?) AND ("+mapping+") AND ("+personal+") AND EXISTS(SELECT 1 FROM website_platform_account_state w WHERE w.account_id=? AND w.display_name=? AND w.active=1 AND w.admitted=1 AND w.epoch=? AND w.global_admin=0)",args:[c.sub,c.ce,c.sid,new Date(now).toISOString(),...jwt.values,version,offset,JSON.stringify(rows),JSON.stringify(resources),c.sub,...(auth.workspace==='TEACH'?[JSON.stringify(resources),c.sub]:[]),c.sub,profile.display_name,c.ce]};
 }
 async function current(){
  const now=Date.now();if(now<started||now-started>5000)fail();const f=fence(now);
  if((await db.prepare('SELECT ('+f.sql+') accepted').bind(...f.args).first('accepted'))!==1)fail('STUDIO_READER_CHANGED',409);
  const settled=Date.now();if(settled<now||settled-started>5000)fail();
 }
 await current();let items=[];
 if(resources.length){
  const frame={ver:1,purpose:'uaa-native-current-reader-library-v1',source:{accountId:c.sub,credentialEpoch:c.ce,permissionVersion:c.pv,coreRevision:version,startedAtMs:started,parentId:c.sid,browserId:c.bsid,browserGeneration:c.bv,originalSignedAtS:c.s_iat,originalExpiresAtS:c.s_exp},account:{accountId:c.sub,displayName:profile.display_name,active:true,admitted:true,epoch:profile.epoch,globalAdmin:false},workspace:auth.workspace,resources},body=JSON.stringify(frame);
  if(new TextEncoder().encode(body).length>16384)fail();
  const packet={app:'studio',body,signature:await sign(env.ACADEMY_TO_WEBSITE_SECRET,readerLibraryPurpose,body),deadlineMs:5000},controller=new AbortController();let timer,answer;
  try{answer=await Promise.race([peer.readCurrentAccountReceipt({...packet,signal:controller.signal}),new Promise((_ok,no)=>{timer=setTimeout(()=>{controller.abort();no(Error('STUDIO_READER_LIBRARY_TIMEOUT'));},Math.max(1,5000-(Date.now()-started)));})]);}finally{clearTimeout(timer);controller.abort();}
  await current();
  if(!answer||typeof answer.body!=='string'||new TextEncoder().encode(answer.body).length>4096||!await verify(env.WEBSITE_TO_ACADEMY_SECRET,readerLibraryACKPurpose,answer.body,answer.signature))fail();
  const proof=readerLibraryACK(answer.body);
  if(proof.requestDigest!==await sha256(body)||proof.accountId!==c.sub||proof.credentialEpoch!==c.ce||proof.permissionVersion!==c.pv||proof.coreRevision!==version||proof.items.some(item=>!resources.some(r=>JSON.stringify(r)===JSON.stringify(item.resource))))fail();
  items=proof.items.map(item=>Object.freeze({selection:Object.freeze({activityKey:item.resource.activityKey}),label:item.label}));
 }
 await current();
 // Selection metadata is never an entitlement token. The unchanged original
 // reader-handoff/consume/existing-family private resource read rechecks it.
 return Object.freeze({items:Object.freeze(items),next:rows.length===5?pageNumber+1:null});
}
