import {requireThat,safeInt} from '../../../../security/v2/codec.mjs';
import {markSessionCovered,worksetApplied} from '../../../../security/v2/publication.mjs';
// The native reset receipt owns the credential change. This bounded tail does
// not reset a PIN again, mint credentials, or claim child delivery completion.
export async function finishNativePinReset(runtime,result){
 requireThat(result?.reset===true&&typeof result.accountId==='string'&&safeInt(result.credentialEpoch,1),'PIN_RESET_RECEIPT_REQUIRED',503);
 const work=await runtime.store.first("SELECT work_id FROM jwt_v2_worksets WHERE scope_sub=? AND json_extract(target_json,'$.type')='credentialEpoch' AND json_extract(target_json,'$.newCe')=? AND json_extract(target_json,'$.reason')='ADMIN_PIN_RESET' ORDER BY created_at DESC LIMIT 1",result.accountId,result.credentialEpoch);
 requireThat(work,'PIN_RESET_SECURITY_WORK_REQUIRED',503);
 const rows=await runtime.store.all('SELECT sid FROM jwt_v2_publications WHERE work_id=? AND published_cr IS NULL AND covered_by_expiry=0 ORDER BY sid LIMIT 21',work.work_id);
 let pending=rows.length>20;
 for(const row of rows.slice(0,20)){
  try{const family=await runtime.store.family(row.sid);requireThat(family,'PIN_RESET_FAMILY_UNAVAILABLE',503);if(runtime.clock()>=family.s_exp)await markSessionCovered(runtime.store,{workId:work.work_id,sid:row.sid,now:runtime.clock()});else{const projection=await runtime.publishFamily(row.sid);await markSessionCovered(runtime.store,{workId:work.work_id,sid:row.sid,projection,controlKey:runtime.cache.key('security/session/'+row.sid),now:runtime.clock()});}}
  catch(error){if(error.code&&!['SECURITY_TRANSPORT_UNAVAILABLE','PUBLICATION_RETRY','SECURITY_SEED_UNCONFIRMED'].includes(error.code))throw error;pending=true;break;}
 }
 if(!pending)pending=!await worksetApplied(runtime.store,work.work_id);
 return {...result,securityPublication:pending?'PENDING':'READY',securityNotifications:'QUEUED'};
}
