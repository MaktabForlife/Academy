import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,bytes,canonical,safeInt} from './codec.mjs';
const actor=(rights,binding)=>requireThat(rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
const global=rights=>rights.globalAdmin===true&&rights.nativeState.account.global_admin===1;
const adminKeys=rights=>rights.nativeState.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>String(r.activity_key).toUpperCase());
export async function academyCalendarDraftGuard(input){
 const {resource:r,binding,rights}=input;if(!['academy-calendar','academy-teacher-availability'].includes(r?.type))return null;actor(rights,binding);
 if(r.type==='academy-calendar'){
  requireThat(Object.keys(r).sort().join(',')==='scopeKey,type,year'&&typeof r.scopeKey==='string'&&(r.scopeKey==='ACADEMY'||/^PROGRAM:[^:]{1,160}$/.test(r.scopeKey))&&safeInt(r.year,2025)&&r.year<=2100,'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  const capturedGlobal=global(rights),capturedAdmin=adminKeys(rights).includes(r.scopeKey.toUpperCase());requireThat(capturedGlobal||capturedAdmin,'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:'/api/academy/calendar/get',workspace:'ADMIN',body:{scopeKey:r.scopeKey,year:r.year,month:1,view:'admin',teacherId:''},accept:dto=>{
   requireThat(dto.view==='admin'&&dto.scopes?.some(s=>String(s.key).toUpperCase()===r.scopeKey.toUpperCase()&&s.editable===true),'ACADEMY_DRAFT_FORBIDDEN',403);
   const actual=r.scopeKey==='ACADEMY'?'1':"EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE')";
   return {sql:'SELECT 1 WHERE '+actual+" AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')) OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts role_owner ON role_owner.account_id=r.account_id COLLATE NOCASE WHERE role_owner.account_id=? COLLATE BINARY AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN')))",args:[...r.scopeKey==='ACADEMY'?[]:[r.scopeKey],Number(capturedGlobal),binding.sub,Number(capturedAdmin),binding.sub,r.scopeKey]};
  }});
 }
 requireThat(Object.keys(r).sort().join(',')==='accountId,type'&&typeof r.accountId==='string'&&bytes(r.accountId).length>0&&bytes(r.accountId).length<=128&&!/[\u0000-\u0020\u007f]/.test(r.accountId),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 const capturedGlobal=global(rights),captured=adminKeys(rights);requireThat(capturedGlobal||captured.length>0,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/academy/teacher-availability/get',workspace:'ADMIN',body:{accountId:r.accountId},accept:dto=>{
  requireThat(dto.accountId===r.accountId&&dto.available===true&&safeInt(dto.revision)&&Array.isArray(dto.editableScopes),'ACADEMY_DRAFT_FORBIDDEN',403);
  const scopes=dto.editableScopes.filter(scope=>captured.includes(String(scope).toUpperCase()));requireThat(capturedGlobal&&dto.editableScopes.includes('GLOBAL')||scopes.length>0,'ACADEMY_DRAFT_FORBIDDEN',403);
  // Actual native target eligibility is captured by the coherent source read.
  // Only captured Admin scopes may justify a current scoped relationship.
  return {sql:"SELECT 1 FROM accounts target WHERE target.account_id=? COLLATE BINARY AND target.active=1 AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')) OR EXISTS(SELECT 1 FROM effective_activity_roles r JOIN accounts role_owner ON role_owner.account_id=r.account_id COLLATE NOCASE JOIN json_each(?) j ON r.activity_key=j.value COLLATE NOCASE WHERE role_owner.account_id=? COLLATE BINARY AND r.role='PROGRAM_ADMIN'))",args:[r.accountId,Number(capturedGlobal&&dto.editableScopes.includes('GLOBAL')),binding.sub,canonical(scopes),binding.sub]};
 }});
}
