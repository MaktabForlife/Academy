// SOURCE ONLY default-off exact reader route. Root derives every resource ID.
// Studio owns acquired-rights authorization; selectors never grant permission.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {parseChildAdmission} from './child-admission-contract.mjs';
import {randomRefresh} from './store.mjs';
import {studioReaderAdmissionPurpose,parseStudioReaderResource,signAdmissionPacket,admissionPacketDigest} from './studio-reader-admission-contract-v1.mjs';
import {verifyStudioReaderACK} from './studio-reader-admission-ack-v1.mjs';
const root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app';
export const studioReaderHandoffPath='/api/academy/website-studio/reader-handoff';
const fail=(code='STUDIO_READER_UNCONFIRMED',status=503)=>{throw Object.assign(Error(code),{code,status});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const time=clock=>{const ms=clock();if(!Number.isSafeInteger(ms)||ms<0||Math.floor(ms/1000)>253401695999)fail();return {ms,s:Math.floor(ms/1000)};};
const mappingSQL=[
 'SELECT a.activity_key,a.kind source_kind,t.kind,t.offering_id,o.state owner,s.enabled,c.website_id course_website,m.website_id surah_website,p.active surah_active,b.programme_key,b.enabled programme_enabled',
 'FROM activities a JOIN website_platform_timetable_scopes t USING(activity_key)',
 'JOIN website_platform_access_scopes s USING(activity_key)',
 'JOIN website_platform_access_ownership o USING(activity_key)',
 'LEFT JOIN website_platform_completed_courses c USING(activity_key)',
 'LEFT JOIN website_platform_surah_maps m ON m.activity_key=a.activity_key AND m.surah_id=?',
 'LEFT JOIN program_surahs p ON p.activity_key=m.activity_key AND p.surah_id=m.surah_id',
 'LEFT JOIN website_platform_programmes b USING(activity_key)',
 "WHERE a.activity_key=? COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE'"
].join(' ');
const mappingKeys=['activity_key','source_kind','kind','offering_id','owner','enabled','course_website','surah_website','surah_active','programme_key','programme_enabled'];
function mappingFence(row,args){
 return {sql:'(SELECT json_object('+mappingKeys.map(k=>"'"+k+"',q."+k).join(',')+') FROM ('+mappingSQL+') q LIMIT 1) IS ?',args:[...args,JSON.stringify(row)]};
}
function current(c,at,version,mapping){
 const jwt=jwtSessionPredicate(c,at.ms);
 return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND a.global_admin=0 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?"+jwt.sql+" AND (SELECT version FROM split_read_state WHERE singleton=1)=?) AND ("+mapping.sql+")",
  args:[c.sub,c.ce,c.sid,new Date(at.ms).toISOString(),...jwt.values,version,...mapping.args]};
}
async function deliver(send,packet){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>send({...packet,signal:controller.signal,deadlineMs:5000})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('STUDIO_READER_UNCONFIRMED'),{status:503}));},5000);})]);}
 finally{clearTimeout(timer);controller.abort();}
}
export async function produceRootNativeStudioReaderAdmission({request,env,input,send,clock=Date.now}){
 assertLocalIntegrationProfile(env);
 const u=new URL(request.url),run=env.JWT_LOCAL_NATIVE_RUN_ID;
 if(env.JWT_LOCAL_STUDIO_READER_ADMISSION!=='NATIVE_RESOURCE_V1'||env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_LOCAL_CHILD_ADMISSION!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_LOCAL_OUTBOX!=='1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0'||typeof send!=='function'||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function'||!/^[a-f0-9]{64}$/.test(run||'')||env.ACADEMY_D1_RUN_ID!==run||env.JWT_LOCAL_APP_BINDING!=='academy:'+run)fail();
 if(u.origin!==root||u.username||u.password||u.pathname!==studioReaderHandoffPath||u.search||request.method!=='POST'||request.headers.get('Origin')!==root||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)fail('STUDIO_READER_ORIGIN',403);
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||!stable(input.activityKey)||Object.keys(input).some(k=>!['activityKey','surahId','codeChallenge','state'].includes(k))||!['codeChallenge','state'].every(k=>typeof input[k]==='string'&&/^[-A-Za-z0-9_]{43}$/.test(input[k]))||input.surahId!==undefined&&!uuid(input.surahId))fail('STUDIO_READER_BODY',400);
 const secret=env.JWT_LOCAL_CHILD_ADMISSION_SECRET_STUDIO,childRunId=env.JWT_LOCAL_CHILD_RUN_ID_STUDIO;
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret)||!/^[a-f0-9]{64}$/.test(childRunId||''))fail();
 const db=env.ACADEMY_DB.withSession('first-primary'),start=time(clock),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
 if(!Number.isSafeInteger(version)||version<0)fail();
 const repository=academyD1Repository(env),auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);
 const c=trustedCookieFacts(auth),state=actualState(auth);
 if(!c||c.sid!==c.psid||state.account.account_id!==c.sub||state.account.credential_epoch!==c.ce)fail('STUDIO_READER_SESSION_REQUIRED',401);
 if(!['LEARN','TEACH'].includes(auth.workspace)||auth.adminView||auth.classView||state.account.global_admin||state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===input.activityKey.toUpperCase()))fail('STUDIO_READER_PERSONAL_WORKSPACE_REQUIRED',403);
 const args=[input.surahId||'',input.activityKey],row=await db.prepare(mappingSQL).bind(...args).first();
 if(!row||Object.keys(row).join(',')!==mappingKeys.join(',')||row.owner!=='STUDIO'||row.enabled!==1||!stable(row.offering_id)||row.programme_enabled===0)fail('STUDIO_READER_MAPPING_REQUIRED',409);
 const course=row.source_kind==='COURSE'&&row.kind==='COURSE';
 if(course&&input.surahId!==undefined||!course&&(!input.surahId||row.source_kind!=='PROGRAM'||row.kind!=='TAFSEER'||row.surah_active!==1||row.programme_key==='mothers'))fail('STUDIO_READER_MAPPING_REQUIRED',409);
 // Teach requires a genuine current source Teacher role. Learn may retain
 // Studio-owned acquired rights without a current Source subscription/role.
 if(auth.workspace==='TEACH'&&!state.roles.some(r=>r.role==='TEACHER'&&r.activity_key.toUpperCase()===row.activity_key.toUpperCase()))fail('STUDIO_READER_TEACHER_REQUIRED',403);
 const resource=parseStudioReaderResource({activityKey:row.activity_key,offeringId:row.offering_id,websiteId:course?row.course_website:row.surah_website,surahId:course?null:input.surahId}),mapping=mappingFence(row,args);
 const budget=await signAdmissionPacket({secret,kind:'ack',value:['studio-reader-budget-v1',c.sid,c.bv]});
 if((await env.JWT_V110_RATE_LIMITER.limit({key:'v110-studio-reader-'+budget.signature}))?.success!==true)fail('STUDIO_READER_RATE_LIMITED',429);
 const prepared=time(clock);if(prepared.ms<start.ms||prepared.ms-start.ms>5000)fail();
 const operationId=crypto.randomUUID(),code=randomRefresh(),codeHash=await admissionPacketDigest(code);
 const admission=parseChildAdmission({ver:1,purpose:'uaa-child-admission-v1',app:'studio',origin:studio,kind:'admit',operationId,challenge:input.codeChallenge,state:input.state,parentAccountId:c.sub,parentId:c.sid,browserId:c.bsid,browserGeneration:c.bv,parentCredentialEpoch:c.ce,parentPermissionVersion:c.pv,parentUnlockGeneration:c.ue,originalSignedAtS:c.s_iat,originalExpiresAtS:c.s_exp,issuedAtS:prepared.s,expiresAtS:Math.min(prepared.s+60,c.s_exp)},{app:'studio',origin:studio,kind:'admit',challenge:input.codeChallenge,state:input.state,now:prepared.s});
 const packet=await signAdmissionPacket({secret,value:{ver:1,purpose:studioReaderAdmissionPurpose,app:'studio',rootRunId:run,childRunId,codeHash,admission,parentGlobalAdmin:Boolean(state.account.global_admin),resource}}),packetDigest=await admissionPacketDigest(packet.body);
 const at=time(clock);if(at.ms<prepared.ms||at.ms-start.ms>5000||at.s>=admission.expiresAtS)fail();
 const fence=current(c,at,version,mapping),guardId=crypto.randomUUID(),result=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+fence.sql+')').bind(guardId,...fence.args),
  db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) VALUES(?,?,'child-admission-staged',?) RETURNING operation_id").bind(operationId,c.sid,at.s),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)
 ]);
 if(result?.[1]?.results?.length!==1||result[1].results[0].operation_id!==operationId)fail();
 const ack=await deliver(send,{app:'studio',...packet}),decision=await verifyStudioReaderACK({packet:ack,secret,expected:{app:'studio',operationId,codeHash,packetDigest}});
 const final=time(clock);if(final.ms<at.ms||final.s>=admission.expiresAtS)fail();
 const last=current(c,final,version,mapping);
 if((await db.prepare('SELECT ('+last.sql+') accepted').bind(...last.args).first('accepted'))!==1)fail('STUDIO_READER_CHANGED',409);
 if(decision.resourceDenied)fail('RESOURCE_ACCESS_REQUIRED',403);
 const target=new URL('/studio/',studio);target.searchParams.set('website',resource.websiteId);
 // Identity admission is NOT an entitlement grant. Original consume and every
 // native resource read retain their own current authority/revocation checks.
 return Object.freeze({app:'studio',code,state:input.state,expiresAtS:admission.expiresAtS,origin:studio,destination:target.href});
}
