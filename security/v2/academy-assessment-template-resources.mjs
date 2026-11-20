import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,safeInt,bytes} from './codec.mjs';
const identity=v=>typeof v==='string'&&bytes(v).length>0&&bytes(v).length<=200&&!/[\u0000-\u0020\u007f]/.test(v);
export async function academyAssessmentTemplateDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-assessment-template')return null;
 requireThat(Object.keys(r).sort().join(',')==='activityKey,classId,templateId,type'&&typeof r.activityKey==='string'&&/^(PROGRAM|COURSE):[^:]{1,160}$/.test(r.activityKey)&&identity(r.classId)&&(r.templateId===null||identity(r.templateId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 const global=rights.globalAdmin===true&&rights.nativeState.account.global_admin===1,admin=rights.nativeState.roles.some(row=>row.role==='PROGRAM_ADMIN'&&String(row.activity_key).toUpperCase()===r.activityKey.toUpperCase());requireThat(global||admin,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/academy/assessments/templates',workspace:'ADMIN',body:{activityKey:r.activityKey,classId:r.classId},accept:dto=>{
  requireThat(Array.isArray(dto.templates),'ACADEMY_DRAFT_FORBIDDEN',403);const row=dto.templates.find(t=>t.id===r.templateId);requireThat(r.templateId===null||row&&safeInt(row.revision,1),'ACADEMY_DRAFT_FORBIDDEN',403);
  // Template revisions/layouts are Admin-owned. The owning reader and final
  // source/head/vector fence preserve that row CAS; Core is an identity index.
  const template=r.templateId===null?'':" AND EXISTS(SELECT 1 FROM assessment_report_templates t WHERE t.template_id=? COLLATE BINARY AND t.activity_key=c.activity_key COLLATE NOCASE)";
  return {sql:"SELECT 1 FROM classes c JOIN activities x USING(activity_key) WHERE c.activity_key=? COLLATE NOCASE AND c.class_id=? COLLATE NOCASE AND c.active=1 AND x.active=1 AND x.lifecycle='ACTIVE' AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')) OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts role_owner ON role_owner.account_id=r.account_id COLLATE NOCASE WHERE role_owner.account_id=? COLLATE BINARY AND r.activity_key=c.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')))"+template,args:[r.activityKey,r.classId,Number(global),binding.sub,Number(admin),binding.sub,...r.templateId===null?[]:[r.templateId]]};
 }});
}
