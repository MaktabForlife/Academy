import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,safeInt,scalar,bytes} from './codec.mjs';
const owned=new Set(['academy-program-subscriptions','academy-program-surah-grants','academy-program-subscription-policy']);
const activity=value=>typeof value==='string'&&/^PROGRAM:[^:]{1,160}$/.test(value)&&!/[\u0000-\u0020\u007f]/.test(value);
const identity=value=>typeof value==='string'&&bytes(value).length>0&&bytes(value).length<=180&&!/[\u0000-\u0020\u007f]/.test(value);
const scopeSQL="SELECT 1 FROM activities x JOIN program_monthly_media_policies p USING(activity_key) WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE' AND p.revision=? AND (EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts role_owner ON role_owner.account_id=r.account_id COLLATE NOCASE WHERE role_owner.account_id=? COLLATE BINARY AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN'))";
export async function academyPaidGridDraftGuard(input){
 const {resource,binding,rights}=input;if(!owned.has(resource?.type))return null;
 if(resource.type==='academy-program-subscription-policy'){
  requireThat(Object.keys(resource).sort().join(',')==='activityKey,mode,type'&&activity(resource.activityKey)&&['prepare','activate'].includes(resource.mode),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  const native=rights?.nativeState;requireThat(native?.account?.account_id===binding.sub&&native.account.active===1&&rights.globalAdmin===true&&native.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:'/api/admin/platform/program-monthly-subscriptions/grid',workspace:'ADMIN',body:{activityKey:resource.activityKey,years:[new Date(input.runtime.clock()*1000).getUTCFullYear()]},accept:dto=>{
   requireThat(dto.available===true&&dto.canConfigure===true&&(dto.prepared===false||dto.prepared===true&&safeInt(dto.policy?.revision,1)),'ACADEMY_DRAFT_FORBIDDEN',403);
   const revision=dto.prepared?dto.policy.revision:0;
   return {sql:"SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE' AND EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AND coalesce((SELECT revision FROM program_monthly_media_policies p WHERE p.activity_key=x.activity_key),0)=?"+(!dto.prepared?" AND lower(trim(x.name))='tafseer'":""),args:[resource.activityKey,binding.sub,revision]};
  }});
 }
 const months=resource.type==='academy-program-subscriptions',keys=Object.keys(resource).sort().join(',');
 requireThat(keys===(months?'activityKey,editor,type':'accountId,activityKey,type')&&activity(resource.activityKey)&&(months?resource.editor==='months':identity(resource.accountId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 if(!months)scalar(resource.accountId);
 const native=rights?.nativeState;
 requireThat(native?.account?.account_id===binding.sub&&native.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 const captured=rights.globalAdmin===true&&native.account.global_admin===1||native.roles?.some(row=>row.role==='PROGRAM_ADMIN'&&String(row.activity_key).toUpperCase()===resource.activityKey.toUpperCase());
 requireThat(captured,'ACADEMY_DRAFT_FORBIDDEN',403);
 const prefix='/api/admin/platform/program-monthly-subscriptions/';
 return readNativeDraftResource(input,{
  path:prefix+(months?'grid':'surah-grants'),workspace:'ADMIN',
  body:{activityKey:resource.activityKey,...months?{years:[new Date(input.runtime.clock()*1000).getUTCFullYear()]}:{accountId:resource.accountId}},
  accept:dto=>{
   const revision=months?dto.policy?.revision:dto.policyRevision;
   // Native Save permits a prepared disabled register too. Do not turn
   // enabled into an invented prerequisite or conflate monthly and Surah grants.
   requireThat(safeInt(revision,1)&&(months?dto.available===true&&dto.prepared===true&&Array.isArray(dto.students)&&Array.isArray(dto.classes):dto.student?.accountId===resource.accountId&&typeof dto.student.active==='boolean'&&Array.isArray(dto.surahs)),'ACADEMY_DRAFT_FORBIDDEN',403);
   const args=[resource.activityKey,revision,binding.sub,binding.sub];
   if(months)return {sql:scopeSQL,args};
   // The actual native reader checked the participant relationship. The
   // generic source/vector fence and this exact canonical account predicate
   // retain that decision through the key-issuance transaction.
   return {sql:scopeSQL+" AND EXISTS(SELECT 1 FROM accounts target WHERE target.account_id=? COLLATE BINARY AND target.active=? AND (EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=target.account_id AND r.activity_key=x.activity_key AND r.role='STUDENT') OR EXISTS(SELECT 1 FROM class_memberships m WHERE m.account_id=target.account_id AND m.activity_key=x.activity_key) OR EXISTS(SELECT 1 FROM program_monthly_subscriptions m WHERE m.account_id=target.account_id AND m.activity_key=x.activity_key) OR EXISTS(SELECT 1 FROM program_surah_grants g WHERE g.account_id=target.account_id AND g.activity_key=x.activity_key)))",args:[...args,resource.accountId,Number(dto.student.active)]};
  }
 });
}
