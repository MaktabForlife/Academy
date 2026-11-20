import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {canonical,requireThat,safeInt,bytes} from './codec.mjs';
const activity=v=>typeof v==='string'&&/^(PROGRAM|COURSE):[^:]{1,160}$/.test(v)&&!/[\u0000-\u0020\u007f]/.test(v);
const id=v=>typeof v==='string'&&bytes(v).length>0&&bytes(v).length<=180&&!/[\u0000-\u0020\u007f]/.test(v);
const monday=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v&&d.getUTCDay()===1;};
const role=(rights,key,adminOnly=false)=>rights?.nativeState?.account?.global_admin===1&&rights.globalAdmin===true||rights?.nativeState?.roles?.some(r=>String(r.activity_key).toUpperCase()===key.toUpperCase()&&(adminOnly?r.role==='PROGRAM_ADMIN':['TEACHER','PROGRAM_ADMIN'].includes(r.role)));
const currentRole=`(EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts ga ON ga.account_id=g.account_id COLLATE NOCASE WHERE ga.account_id=? COLLATE BINARY AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts ra ON ra.account_id=r.account_id COLLATE NOCASE WHERE ra.account_id=? COLLATE BINARY AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role IN (SELECT value FROM json_each(?))))`;
// Role foreign keys are native NOCASE; resolve the canonical parent first,
// then match the exact bound subject. A cached role is the upper bound. The real native reader and final SQL both
// retain current native eligibility; no JSON boolean substitutes for authority.
export async function academyPlanningDraftGuard(input){
 const {resource,binding,rights}=input;if(!['academy-planning','academy-planning-requirements'].includes(resource?.type))return null;
 requireThat(rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 if(resource.type==='academy-planning-requirements'){
  requireThat(Object.keys(resource).join(',')==='type','ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  return readNativeDraftResource(input,{path:'/api/academy/planning/list',workspace:'ADMIN',body:{view:'admin'},accept:dto=>{
   requireThat(dto.canAdmin===true&&Array.isArray(dto.areas)&&dto.areas.length>0&&dto.areas.every(a=>activity(a.key)&&typeof a.plansRequired==='boolean'&&role(rights,a.key,true)),'ACADEMY_DRAFT_FORBIDDEN',403);
   // plans_required belongs to Admin; comparing a Core compatibility default
   // would reject valid disabled-register drafts. readNativeDraftResource pins
   // this exact native DTO with the owning split version/head/vector at release.
   const scopes=dto.areas.map(a=>({key:a.key,required:Number(a.plansRequired)}));
   return {sql:`SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=json_extract(j.value,'$.key') COLLATE BINARY AND x.active=1 AND x.lifecycle='ACTIVE' AND x.kind IN ('PROGRAM','COURSE') AND ${currentRole}))`,args:[canonical(scopes),binding.sub,binding.sub,canonical(['PROGRAM_ADMIN'])]};
  }});
 }
 const r=resource,program=String(r.activityKey).startsWith('PROGRAM:');
 requireThat(Object.keys(r).sort().join(',')==='activityKey,period,runId,teacherId,type,weekStart'&&activity(r.activityKey)&&id(r.teacherId)&&r.teacherId===binding.sub&&(program?r.runId==='':id(r.runId))&&['WEEKLY','ENTIRE'].includes(r.period)&&(!program||r.period==='WEEKLY')&&(r.period==='WEEKLY'?monday(r.weekStart):r.weekStart===''),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(role(rights,r.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
 const admin=role(rights,r.activityKey,true);
 return readNativeDraftResource(input,{path:'/api/academy/planning/get',workspace:admin?'ADMIN':'TEACH',body:{activityKey:r.activityKey,runId:r.runId,teacherId:r.teacherId,period:r.period,weekStart:r.weekStart},accept:dto=>{
  requireThat(dto.canEdit===true&&dto.canSubmit===true&&safeInt(dto.revision)&&['activityKey','runId','teacherId','period','weekStart'].every(k=>dto[k]===r[k]),'ACADEMY_DRAFT_FORBIDDEN',403);
  const capturedGlobal=rights.globalAdmin===true&&rights.nativeState.account.global_admin===1;
  const roles=rights.nativeState.roles.filter(row=>String(row.activity_key).toUpperCase()===r.activityKey.toUpperCase()&&['TEACHER','PROGRAM_ADMIN'].includes(row.role)).map(row=>row.role);
  // A fresh Global Admin promotion must not widen an older Teacher snapshot.
  const authority=capturedGlobal?currentRole:`EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts ra ON ra.account_id=r.account_id COLLATE NOCASE WHERE ra.account_id=? COLLATE BINARY AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role IN (SELECT value FROM json_each(?)))`;
  const authorityArgs=capturedGlobal?[binding.sub,binding.sub,canonical(roles)]:[binding.sub,canonical(roles)];
  // Requirement and Course editor stage belong to Admin, not Core defaults.
  // The branded literal native get enforces required/canEdit/canSubmit; its
  // actual decision is pinned through key release by the enclosing primary
  // split version, accepted-head and complete dependency-vector witness.
  // Current native Core plan revision and run identity/active remain guarded.
  // Only the native plan child tuple uses its declared NOCASE identity. The
  // enclosing canonical actor, actual scope/run and exact revision stay pinned.
  const planKey=[r.activityKey,r.runId,r.teacherId,r.period,r.weekStart];
  return {sql:`SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE BINARY AND x.active=1 AND x.lifecycle='ACTIVE' AND x.kind=? AND ${authority} AND COALESCE((SELECT revision FROM lesson_plans p WHERE p.activity_key=? COLLATE NOCASE AND p.run_id=? COLLATE NOCASE AND p.teacher_id=? COLLATE NOCASE AND p.period=? AND p.week_start=?),0)=?`+(program?'':` AND EXISTS(SELECT 1 FROM course_runs r WHERE r.activity_key=x.activity_key AND r.run_id=? COLLATE BINARY AND r.active=1)`),args:[r.activityKey,program?'PROGRAM':'COURSE',...authorityArgs,...planKey,dto.revision,...program?[]:[r.runId]]};
 }});
}
