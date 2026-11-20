import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,uuid,safeInt} from './codec.mjs';
export async function academyEnrolmentDraftGuard(input){
 const {resource,binding,rights}=input;if(resource?.type!=='academy-enrolment-catalogue')return null;
 requireThat(Object.keys(resource).sort().join(',')==='activityKey,entryId,type'&&typeof resource.activityKey==='string'&&/^(?:PROGRAM|COURSE):[^:]{1,160}$/.test(resource.activityKey)&&uuid(resource.entryId),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 const native=rights.nativeState;
 requireThat(native?.account?.account_id===binding.sub&&native.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 const captured=rights.globalAdmin===true&&native.account.global_admin===1||native.roles?.some(row=>row.role==='PROGRAM_ADMIN'&&String(row.activity_key).toUpperCase()===resource.activityKey.toUpperCase());
 requireThat(captured,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/admin/platform/enrolment/get',body:{activityKey:resource.activityKey},workspace:'ADMIN',accept:dto=>{
  const area=dto.activities?.find(row=>String(row.key).toUpperCase()===resource.activityKey.toUpperCase()),entry=dto.entries?.find(row=>row.id===resource.entryId);
  requireThat(area&&(!entry||String(entry.activityKey).toUpperCase()===resource.activityKey.toUpperCase()&&safeInt(entry.revision,1)),'ACADEMY_DRAFT_FORBIDDEN',403);
  // Revision lives in Admin; Core retains only identity/activity references.
  // readNativeDraftResource fences the coherent Admin read with exact source
  // version/head/vector. Native Save alone compares the actual Admin row CAS.
  const exists=entry?"EXISTS(SELECT 1 FROM academy_enrolment_catalogue e WHERE e.entry_id=? AND e.activity_key=x.activity_key COLLATE NOCASE)":"NOT EXISTS(SELECT 1 FROM academy_enrolment_catalogue e WHERE e.entry_id=?)";
  return {sql:"SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.active=1 AND x.lifecycle IN('ACTIVE','DRAFT') AND (EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') OR EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts role_owner ON role_owner.account_id=r.account_id COLLATE NOCASE WHERE role_owner.account_id=? COLLATE BINARY AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')) AND "+exists,args:[resource.activityKey,binding.sub,binding.sub,resource.entryId]};
 }});
}
