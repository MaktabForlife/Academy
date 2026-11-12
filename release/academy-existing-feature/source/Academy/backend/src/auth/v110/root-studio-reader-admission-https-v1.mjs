// SOURCE ONLY default-off exact reader route. Root derives every resource ID.
// Studio owns acquired-rights authorization; selectors never grant permission.
import {requirePortableNativeMethod,verifyPortableNativeProfile,portableNativeOrigins} from './portable-native-profile-v5.mjs';
import {exactRecord} from './native-https-contract-v1.mjs';
import {createStudioReaderHTTPSPeers} from './studio-reader-https-peers-v1.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {parseChildAdmission} from './child-admission-contract.mjs';
import {randomRefresh} from './store.mjs';
import {studioReaderAdmissionPurpose,parseStudioReaderResource,signAdmissionPacket,admissionPacketDigest} from './studio-reader-admission-contract-portable-v1.mjs';
import {verifyStudioReaderACK} from './studio-reader-admission-ack-v2.mjs';
import {refreshCurrentNativeStudioReaderAccount} from './root-studio-reader-account-status-https-v1.mjs';
import {nativeStudioReaderSource,nativeStudioReaderSourceFence} from './root-studio-reader-source-https-v1.mjs';
const root=portableNativeOrigins.academy,studio=portableNativeOrigins.studio;
export const studioReaderHandoffPath='/api/academy/website-studio/reader-handoff';
const fail=(code='STUDIO_READER_UNCONFIRMED',status=503)=>{throw Object.assign(Error(code),{code,status});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const time=clock=>{const ms=clock();if(!Number.isSafeInteger(ms)||ms<0||Math.floor(ms/1000)>253401695999)fail();return {ms,s:Math.floor(ms/1000)};};
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
function current(c,at,version,mapping,cap){
 const scope=nativeStudioReaderSourceFence(cap,at.ms);
 const jwt=jwtSessionPredicate(c,at.ms);
 return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?"+jwt.sql+" AND (SELECT version FROM split_read_state WHERE singleton=1)=?) AND ("+mapping.sql+") AND ("+scope.sql+")",
  args:[c.sub,c.ce,c.sid,new Date(at.ms).toISOString(),...jwt.values,version,...mapping.args,...scope.args]};
}
async function deliver(send,packet){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>send({...packet,signal:controller.signal,deadlineMs:5000})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('STUDIO_READER_UNCONFIRMED'),{status:503}));},5000);})]);}
 finally{clearTimeout(timer);controller.abort();}
}
export async function produceRootHTTPSStudioReaderAdmission(packet,env,{request,clock=Date.now}={}){
 try{
 const profile=requirePortableNativeMethod(env,'academy','reader');await verifyPortableNativeProfile();
 if(packet.from!=='studio'||packet.to!=='academy'||packet.purpose!=='admission.request'||!(request instanceof Request))fail('STUDIO_READER_ORIGIN',403);
 let raw;try{raw=JSON.parse(packet.body);exactRecord(raw,['identityJWT','challenge','state','reader']);exactRecord(raw.reader,['activityKey','surahId']);}catch{fail('STUDIO_READER_BODY',400);}
 if(!stable(raw.reader.activityKey)||!(raw.reader.surahId===null||uuid(raw.reader.surahId))||![raw.challenge,raw.state].every(v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v))||typeof raw.identityJWT!=='string'||raw.identityJWT.length>8192)fail('STUDIO_READER_BODY',400);
 const input={activityKey:raw.reader.activityKey,...(raw.reader.surahId===null?{}:{surahId:raw.reader.surahId}),codeChallenge:raw.challenge,state:raw.state,identityJWT:raw.identityJWT};
 const peers=createStudioReaderHTTPSPeers(env,{clock});
 const status=await refreshCurrentNativeStudioReaderAccount({request,env,input,peer:peers}),cap=status.readerAuthority,captured=nativeStudioReaderSource(cap),start=time(clock);
 const {c,version,resource,mapping}=captured,db=env.ACADEMY_DB.withSession('first-primary'),run=profile.deploymentIds.academy,childRunId=profile.deploymentIds.studio,secret=env.JWT_V110_CHILD_ADMISSION_SECRET_STUDIO;
 if(captured.workspace!=='LEARN'||captured.parentGlobalAdmin!==false||typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret)||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function')fail();
 const budget=await signAdmissionPacket({secret,kind:'ack',value:['studio-reader-budget-v1',c.sid,c.bv]});
 if((await env.JWT_V110_RATE_LIMITER.limit({key:'v110-studio-reader-'+budget.signature}))?.success!==true)fail('STUDIO_READER_RATE_LIMITED',429);
 const prepared=time(clock);if(prepared.ms<start.ms||prepared.ms-start.ms>5000)fail();
 const operationId=packet.requestId,code=randomRefresh(),codeHash=await admissionPacketDigest(code);
 const admission=parseChildAdmission({ver:1,purpose:'uaa-child-admission-v1',app:'studio',origin:studio,kind:'admit',operationId,challenge:input.codeChallenge,state:input.state,parentAccountId:c.sub,parentId:c.sid,browserId:c.bsid,browserGeneration:c.bv,parentCredentialEpoch:c.ce,parentPermissionVersion:c.pv,parentUnlockGeneration:c.ue,originalSignedAtS:c.s_iat,originalExpiresAtS:c.s_exp,issuedAtS:prepared.s,expiresAtS:Math.min(prepared.s+60,c.s_exp)},{app:'studio',origin:studio,kind:'admit',challenge:input.codeChallenge,state:input.state,now:prepared.s});
 const signed=await signAdmissionPacket({secret,value:{ver:1,purpose:studioReaderAdmissionPurpose,app:'studio',rootRunId:run,childRunId,codeHash,admission,parentGlobalAdmin:captured.parentGlobalAdmin,resource}}),packetDigest=await admissionPacketDigest(signed.body);
 const at=time(clock);if(at.ms<prepared.ms||at.ms-start.ms>5000||at.s>=admission.expiresAtS)fail();
 const fence=current(c,at,version,mapping,cap),guardId=crypto.randomUUID(),result=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+fence.sql+')').bind(guardId,...fence.args),
  db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) VALUES(?,?,'child-admission-staged',?) RETURNING operation_id").bind(operationId,c.sid,at.s),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)
 ]);
 if(result?.[1]?.results?.length!==1||result[1].results[0].operation_id!==operationId)fail();
 const ack=await peers.stageAdmission({app:'studio',...signed,deadlineMs:5000}),decision=await verifyStudioReaderACK({packet:ack,secret,expected:{app:'studio',operationId,codeHash,packetDigest}});
 const final=time(clock);if(final.ms<at.ms||final.s>=admission.expiresAtS)fail();
 const last=current(c,final,version,mapping,cap);
 if((await db.prepare('SELECT ('+last.sql+') accepted').bind(...last.args).first('accepted'))!==1)fail('STUDIO_READER_CHANGED',409);
 if(decision.resourceDenied)fail('RESOURCE_ACCESS_REQUIRED',403);
 const target=new URL('/studio/',studio);target.searchParams.set('website',resource.websiteId);
 // Identity admission is NOT an entitlement grant. Original consume and every
 // native resource read retain their own current authority/revocation checks.
 return JSON.stringify({code,state:input.state,expiresAtS:admission.expiresAtS});
 }catch(error){
  // Preserve verified native business outcomes inside the authenticated response.
  // An unsigned transport failure remains UNCONFIRMED; no automatic resend.
  if(error?.code==='RESOURCE_ACCESS_REQUIRED'&&error.status===403)return JSON.stringify({code:'RESOURCE_ACCESS_REQUIRED'});
  if(error?.status===401)return JSON.stringify({code:'ACADEMY_RENEWAL_REQUIRED'});
  if(error?.code==='STUDIO_READER_PERSONAL_WORKSPACE_REQUIRED'&&error.status===403)return JSON.stringify({code:error.code});
  if(error?.code==='STUDIO_READER_MAPPING_REQUIRED'&&error.status===409)return JSON.stringify({code:error.code});
  throw error;
 }
}
