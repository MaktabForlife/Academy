import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat} from './codec.mjs';
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(v);
export async function academyCourseManagementDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-course-management')return null;
 requireThat(Object.keys(r).sort().join(',')==='courseId,runId,type'&&(r.courseId===null&&r.runId===null||id(r.courseId)&&id(r.runId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 const state=rights?.nativeState;requireThat(state?.account?.account_id===binding.sub&&state.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 const global=rights.globalAdmin===true&&state.account.global_admin===1,area=r.courseId?'COURSE:'+r.courseId:null,scoped=area&&state.roles?.some(x=>x.role==='PROGRAM_ADMIN'&&x.activity_key.toUpperCase()===area.toUpperCase());
 requireThat(global||scoped,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/admin/platform/courses/'+(area?'get':'list'),workspace:'ADMIN',body:area?{courseId:r.courseId,runId:r.runId}:{},accept:dto=>{
  if(!area){requireThat(dto.capabilities?.create===true,'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:"SELECT 1 FROM global_role_assignments g JOIN accounts owner ON owner.account_id=g.account_id COLLATE NOCASE WHERE owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED'",args:[binding.sub]};}
  requireThat(dto.course?.courseId?.toUpperCase()===r.courseId.toUpperCase()&&dto.course?.runId?.toUpperCase()===r.runId.toUpperCase(),'ACADEMY_DRAFT_FORBIDDEN',403);
  // The owning reader checks real Admin stage/revision and exact delivery. Core
  // compatibility placeholders do not carry those values. Fence its coherent
  // read; retain canonical Course identity and current native role in Core.
  return {sql:"SELECT 1 FROM activities x WHERE x.kind='COURSE' AND x.activity_key=? COLLATE NOCASE AND (EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts owner ON owner.account_id=g.account_id COLLATE NOCASE WHERE owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') OR EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts owner ON owner.account_id=r.account_id COLLATE NOCASE WHERE owner.account_id=? COLLATE BINARY AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN'))",args:[area,binding.sub,binding.sub]};
 }});
}
