// SOURCE ONLY. Genuine personal reader authority; an unforgeable in-process capability.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {parseStudioReaderResource} from './studio-reader-admission-contract-v1.mjs';
const fail=(code='STUDIO_READER_UNCONFIRMED',status=503)=>{throw Object.assign(Error(code),{code,status});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const mappingSQL=[
 'SELECT a.activity_key,a.kind source_kind,t.kind,t.offering_id,o.state owner,s.enabled,c.website_id course_website,m.website_id surah_website,p.active surah_active,b.programme_key,b.enabled programme_enabled,mp.enabled monthly_enabled',
 'FROM activities a JOIN website_platform_timetable_scopes t USING(activity_key)',
 'JOIN website_platform_access_scopes s USING(activity_key)',
 'JOIN website_platform_access_ownership o USING(activity_key)',
 'LEFT JOIN website_platform_completed_courses c USING(activity_key)',
 'LEFT JOIN website_platform_surah_maps m ON m.activity_key=a.activity_key AND m.surah_id=?',
 'LEFT JOIN program_surahs p ON p.activity_key=m.activity_key AND p.surah_id=m.surah_id',
 'LEFT JOIN website_platform_programmes b USING(activity_key)',
 'LEFT JOIN program_monthly_media_policies mp USING(activity_key)',
 "WHERE a.activity_key=? COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE'"
].join(' ');
const mappingKeys=['activity_key','source_kind','kind','offering_id','owner','enabled','course_website','surah_website','surah_active','programme_key','programme_enabled','monthly_enabled'];
function mappingFence(row,args){
 return {sql:'(SELECT json_object('+mappingKeys.map(k=>"'"+k+"',q."+k).join(',')+') FROM ('+mappingSQL+') q LIMIT 1) IS ?',args:[...args,JSON.stringify(row)]};
}
const capabilities=new WeakMap();
export async function captureNativeStudioReaderSource({request,env,input}){
 assertLocalIntegrationProfile(env);
 const u=new URL(request.url),origin='https://ummabbadacademy.app';
 if(env.JWT_LOCAL_STUDIO_READER_ADMISSION!=='NATIVE_RESOURCE_V1'||env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_LOCAL_CHILD_ADMISSION!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_LOCAL_OUTBOX!=='1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||['JWT_LOCAL_AI','JWT_LOCAL_PROVIDERS','JWT_LOCAL_TRANSCRIPTION','JWT_LOCAL_SCHEDULES'].some(k=>env[k]!=='OFF')||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')fail();
 if(u.origin!==origin||u.pathname!=='/api/academy/website-studio/reader-handoff'||u.search||u.href.includes('?')||u.hash||u.username||u.password||request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)fail('STUDIO_READER_ORIGIN',403);
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||!stable(input.activityKey)||Object.keys(input).some(k=>!['activityKey','surahId','codeChallenge','state'].includes(k))||!['codeChallenge','state'].every(k=>typeof input[k]==='string'&&/^[-A-Za-z0-9_]{43}$/.test(input[k]))||input.surahId!==undefined&&!uuid(input.surahId))fail('STUDIO_READER_BODY',400);
 const db=env.ACADEMY_DB.withSession('first-primary'),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
 if(!Number.isSafeInteger(version)||version<0)fail();
 const repository=academyD1Repository(env),auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);
 const c=trustedCookieFacts(auth),state=actualState(auth);
 if(!c||c.sid!==c.psid||state.account.account_id!==c.sub||state.account.credential_epoch!==c.ce)fail('STUDIO_READER_SESSION_REQUIRED',401);
 if(!['LEARN','TEACH'].includes(auth.workspace)||auth.adminView||auth.classView||state.account.global_admin||state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===input.activityKey.toUpperCase()))fail('STUDIO_READER_PERSONAL_WORKSPACE_REQUIRED',403);
 const args=[input.surahId||'',input.activityKey],row=await db.prepare(mappingSQL).bind(...args).first();
 if(!row||Object.keys(row).join(',')!==mappingKeys.join(',')||row.owner!=='STUDIO'||row.enabled!==1||!stable(row.offering_id)||row.programme_enabled===0)fail('STUDIO_READER_MAPPING_REQUIRED',409);
 const course=row.source_kind==='COURSE'&&row.kind==='COURSE';
 if(course&&input.surahId!==undefined||!course&&(!input.surahId||row.source_kind!=='PROGRAM'||row.kind!=='TAFSEER'||row.surah_active!==1||row.monthly_enabled!==1||repository.features?.monthlySubscriptions!==true||row.programme_key==='mothers'))fail('STUDIO_READER_MAPPING_REQUIRED',409);
 if(auth.workspace==='TEACH'&&!state.roles.some(r=>r.role==='TEACHER'&&r.activity_key.toUpperCase()===row.activity_key.toUpperCase()))fail('STUDIO_READER_TEACHER_REQUIRED',403);
 const resource=parseStudioReaderResource({activityKey:row.activity_key,offeringId:row.offering_id,websiteId:course?row.course_website:row.surah_website,surahId:course?null:input.surahId}),mapping=mappingFence(row,args),cap=Object.freeze({kind:'NATIVE_CURRENT_PERSONAL_READER'});
 capabilities.set(cap,Object.freeze({c,version,resource,workspace:auth.workspace,mapping:Object.freeze({sql:mapping.sql,args:Object.freeze([...mapping.args])})}));return cap;
}
export function nativeStudioReaderSource(cap){const v=capabilities.get(cap);if(!v)fail();return v;}
export function nativeStudioReaderSourceFence(cap,now){
 const v=nativeStudioReaderSource(cap),c=v.c,jwt=jwtSessionPredicate(c,now);
 const teacher=v.workspace==='TEACH'?" AND EXISTS(SELECT 1 FROM role_assignments role WHERE role.account_id=a.account_id AND role.activity_key=? COLLATE NOCASE AND role.role='TEACHER' AND role.active=1 AND role.review_state='CONFIRMED')":"";
 return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND a.global_admin=0 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?"+jwt.sql+" AND NOT EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AND NOT EXISTS(SELECT 1 FROM role_assignments role WHERE role.account_id=a.account_id AND role.activity_key=? COLLATE NOCASE AND role.role='PROGRAM_ADMIN' AND role.active=1 AND role.review_state='CONFIRMED')"+teacher+" AND (SELECT version FROM split_read_state WHERE singleton=1)=?) AND ("+v.mapping.sql+")",args:[c.sub,c.ce,c.sid,new Date(now).toISOString(),...jwt.values,v.resource.activityKey,...(v.workspace==='TEACH'?[v.resource.activityKey]:[]),v.version,...v.mapping.args]};
}
