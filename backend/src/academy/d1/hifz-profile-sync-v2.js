import {canonical,requireThat,safeInt,digest,strictJSON} from '../../../../security/v2/codec.mjs';
import {dependencyScope} from '../../../../security/v2/issuance-floors.mjs';
import {PROFILE_ID,PROFILE_PURPOSE,sendNativeProfile,validateNativeProfile} from '../../../../security/v2/profile-service.mjs';
const sourceFrom=`FROM hifz_profile_sync q JOIN accounts a ON a.account_id=q.account_id JOIN hifz_profile_sync_projection p ON p.account_id=a.account_id JOIN account_credentials c ON c.account_id=a.account_id JOIN jwt_v2_dependencies d ON d.id=? AND d.scope=('ACCOUNT:'||a.account_id) COLLATE BINARY`;
const sourceFence=`SELECT 1 ${sourceFrom} WHERE a.account_id=? COLLATE BINARY AND q.revision=? AND q.pin_reset_version=? AND c.credential_epoch=? AND p.display_name IS ? AND p.login_link_id IS ? AND p.whatsapp_number IS ? AND p.role IS ? AND p.active=? AND d.owner_epoch=? AND d.revision=? AND (SELECT version FROM split_read_state WHERE singleton=1)=? AND NOT EXISTS(SELECT 1 FROM split_write_fence)`;
function record(row){return validateNativeProfile({academyUserId:row.account_id,revision:row.revision,pinResetVersion:row.pin_reset_version,name:row.display_name,loginId:row.login_link_id,whatsappNumber:row.whatsapp_number,role:row.role,active:row.active,credentialEpoch:row.credential_epoch});}
export async function deliverV2HifzProfiles(env,{limit=8,fetcher=globalThis.fetch,now=Date.now(),runtime:injectedRuntime}={}){
 requireThat(env.UAA_V2_ENABLED==='1'&&safeInt(now)&&Number.isSafeInteger(limit)&&limit>=1&&limit<=40,'INVALID_PROFILE_DELIVERY_CONTEXT',503);
 const runtime=injectedRuntime??await (await import('../../../../security/v2/runtime.mjs')).runtimeFor(env,{app:'academy'});
 requireThat(runtime?.app==='academy'&&runtime.env===env&&runtime.settings.raw.nativeTables.includes('hifz_profile_sync'),'HIFZ_PROFILE_CAPTURE_NOT_INSTALLED',503);
 const {store}=runtime,ownerEpoch=runtime.settings.raw.nativeOwnerEpoch;
 const candidates=await store.all('SELECT a.account_id FROM hifz_profile_sync q JOIN accounts a ON a.account_id=q.account_id WHERE q.revision>q.delivered_revision AND q.next_attempt_at<=? ORDER BY q.updated_at,a.account_id LIMIT ?',now,Math.min(8,limit));
 let attempted=0,delivered=0;
 for(const candidate of candidates){
  await runtime.ensureDependencies(candidate.account_id);
  const row=await store.first(`SELECT a.account_id,q.revision,q.pin_reset_version,p.display_name,p.login_link_id,p.whatsapp_number,p.role,p.active,c.credential_epoch,d.owner_epoch,d.revision dependency_revision,(SELECT version FROM split_read_state WHERE singleton=1) split_version ${sourceFrom} WHERE a.account_id=? COLLATE BINARY AND d.owner_epoch=? AND NOT EXISTS(SELECT 1 FROM split_write_fence)`,PROFILE_ID,candidate.account_id,ownerEpoch);
  requireThat(row&&safeInt(row.split_version)&&safeInt(row.dependency_revision,1),'HIFZ_PROFILE_SOURCE_UNAVAILABLE',503);
  const profile=record(row),scope=dependencyScope(profile.academyUserId),projectionDigest=await digest(profile),dependency={type:'dependency',id:PROFILE_ID,ownerEpoch,revision:row.dependency_revision,effect:'INVALIDATE',deniedActions:[]};
  let saved=await store.first('SELECT * FROM jwt_v2_profile_deliveries WHERE scope=? AND owner_epoch=? AND dependency_revision=?',scope,ownerEpoch,row.dependency_revision);
  if(!saved){
   const operationId=crypto.randomUUID(),packet={schema:2,purpose:PROFILE_PURPOSE,env:runtime.config.env,sourceApp:'academy',targetApp:'hifz',operationId,dependency,commitRef:'profile:'+operationId,projectionDigest,profile},encoded=canonical(packet),packetDigest=await digest(packet);
   const args=[PROFILE_ID,profile.academyUserId,profile.revision,profile.pinResetVersion,profile.credentialEpoch,profile.name,profile.loginId,profile.whatsappNumber,profile.role,profile.active,ownerEpoch,row.dependency_revision,row.split_version],[guard,clear]=store.guard(sourceFence,args);
   try{await store.batch([guard,store.stmt('INSERT INTO jwt_v2_profile_deliveries(operation_id,scope,owner_epoch,dependency_revision,profile_revision,packet_json,packet_digest) VALUES(?,?,?,?,?,?,?)',operationId,scope,ownerEpoch,row.dependency_revision,profile.revision,encoded,packetDigest),clear]);}catch(error){saved=await store.first('SELECT * FROM jwt_v2_profile_deliveries WHERE scope=? AND owner_epoch=? AND dependency_revision=?',scope,ownerEpoch,row.dependency_revision);if(!saved)throw error;}
   saved??=await store.first('SELECT * FROM jwt_v2_profile_deliveries WHERE operation_id=?',operationId);
  }
  const packet=strictJSON(saved.packet_json);requireThat(await digest(packet)===saved.packet_digest&&packet.profile.academyUserId===profile.academyUserId&&packet.projectionDigest===projectionDigest&&canonical(packet.dependency)===canonical(dependency)&&canonical(packet.profile)===canonical(profile),'HIFZ_PROFILE_UNCAPTURED_PROJECTION_CHANGE',409);
  if(saved.receipt_json){await acknowledge(store,packet,saved.receipt_json);continue;}
  if(saved.next_attempt_at>now)continue;attempted++;
  try{const receipt=await sendNativeProfile(runtime,packet,{fetcher}),reply=canonical(receipt);await store.batch([store.stmt('UPDATE jwt_v2_profile_deliveries SET receipt_json=? WHERE operation_id=? AND packet_digest=? AND receipt_json IS NULL',reply,saved.operation_id,saved.packet_digest)]);await acknowledge(store,packet,reply);delivered++;}
  catch(error){requireThat(safeInt(saved.attempts)&&saved.attempts<Number.MAX_SAFE_INTEGER,'PROFILE_RETRY_COUNTER_EXHAUSTED',503);const delay=Math.min(900000,60000*2**Math.min(saved.attempts,4)),retryAt=now+delay;requireThat(safeInt(retryAt),'PROFILE_RETRY_TIME_EXHAUSTED',503);await store.batch([store.stmt('UPDATE jwt_v2_profile_deliveries SET attempts=attempts+1,next_attempt_at=? WHERE operation_id=? AND receipt_json IS NULL',retryAt,saved.operation_id),store.stmt("UPDATE hifz_profile_sync SET attempts=attempts+1,next_attempt_at=?,last_error_code='V2_DELIVERY_PENDING' WHERE account_id=? AND revision=?",retryAt,profile.academyUserId,profile.revision)]);}
 }
 return {enabled:true,mode:'V2',attempted,delivered};
}
async function acknowledge(store,packet,receipt){
 const r=strictJSON(receipt);requireThat(r.status==='COMMITTED'&&r.operationId===packet.operationId&&r.projectionDigest===packet.projectionDigest&&r.commitRef===packet.commitRef&&canonical(r.dependency)===canonical(packet.dependency),'PROFILE_COMMIT_RECEIPT_CONFLICT',409);
 await store.stmt('UPDATE hifz_profile_sync SET delivered_revision=MAX(delivered_revision,?),attempts=0,next_attempt_at=0,last_error_code=NULL WHERE account_id=?',packet.profile.revision,packet.profile.academyUserId).run();
}
