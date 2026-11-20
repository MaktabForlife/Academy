import {resolveStudioBusinessSource} from './studio-authority-source.mjs';
import {nativeBusinessIdentity} from './native-identity.mjs';
import {nativeBusinessProof,businessParentCondition} from './native-business.mjs';
import {bindNativeAuth,bindNativeBusinessRequest} from './native-context.js';
import {academyD1Repository} from '../d1/repository.js';
import {selectWorkspace} from '../d1/workspace-access.js';
import {nativeMediaTeachers} from '../d1/native-media-teachers.js';
import {nativeCoursePlaylistPlacements} from '../d1/native-course-playlist-placements.js';
import {dashboardSummary,dashboardJoinInput,dashboardTimetableAudience} from '../d1/web-platform/dashboard.mjs';
import {nativeJoinOwnership} from '../d1/web-platform/native-join.mjs';
import {requireThat,canonical} from '../../../../security/v2/codec.mjs';
const upper=v=>String(v||'').toUpperCase(),fail=(code,status=403)=>Object.assign(Error(code),{code,status});
export function intersectStudioSourceState(fresh,authority,mappings,binding){
 const global=authority.globalAdmin&&Boolean(fresh.account.global_admin),scopes=new Map(mappings.flatMap(row=>{const scope=authority.scopes.find(s=>s.offering_id===row.offering_id);return scope&&scope.active===1&&scope.source?.enabled===1?[[upper(row.activity_key),scope]]:[];}));
 const roles=fresh.roles.filter(row=>{const s=scopes.get(upper(row.activity_key));return global||s&&(row.role==='PROGRAM_ADMIN'&&s.role==='ADMIN'||row.role==='TEACHER'&&s.role==='TEACHER'||row.role==='STUDENT'&&s.enrolled===1);});
 const subscriptions=fresh.subscriptions.filter(row=>global||scopes.get(upper(row.activity_key))?.purchased===1);
 const activities=fresh.activities.filter(row=>global||scopes.has(upper(row.activity_key))),keys=new Set(activities.map(a=>upper(a.activity_key)));
 const monthlyMedia=(fresh.monthlyMedia||[]).filter(row=>{const s=scopes.get(upper(row.activity_key));return global||s&&[...s.paidMonths,...s.websiteMonths].some(m=>m.month===row.lesson_month);});
 const contexts=fresh.contexts.filter(c=>{if(global&&c.role==='GLOBAL_ADMIN')return true;const a=activities.find(a=>upper(a.activity_id)===upper(c.courseId)&&a.kind===c.scope);if(!a)return false;return roles.some(r=>upper(r.activity_key)===upper(a.activity_key)&&r.role===c.role)||c.role==='MEDIA_READER'&&monthlyMedia.some(m=>upper(m.activity_key)===upper(a.activity_key));});
 return {...fresh,account:{...fresh.account,credential_epoch:binding.ce,global_admin:Number(global),substitute_grants:'[]'},activities,roles,subscriptions,contexts,monthlyMedia,surahGrants:[],memorisation:{personalActive:false,disabledActivityKeys:fresh.activities.map(x=>x.activity_key)},publishedTeacherClasses:[],scopes,allowedActivityKeys:[...keys]};
}
function executionContext(proof,state,env,clock){
 requireThat(nativeBusinessProof(proof),'NATIVE_RPC_BRANDED_PROOF_REQUIRED',503);const nativeState={...state};delete nativeState.scopes;delete nativeState.allowedActivityKeys;
 const cap=Object.freeze({binding:proof.body.binding,rights:Object.freeze({globalAdmin:Boolean(state.account.global_admin),nativeState}),deadline:proof.body.expiresAt,kid:proof.keyId});
 const runtime={clock,assertCapability(value){requireThat(value===cap&&nativeBusinessProof(proof)&&clock()<proof.body.expiresAt,'NATIVE_RPC_LEASE_EXPIRED',401);},coordinatorCapability(value){this.assertCapability(value);return value;}};
 return {runtime,cap,env,serviceProof:proof};
}
export function createNativeBusinessDispatcher({runtime,env,requestNative}){
 return async proof=>{
  requireThat(nativeBusinessProof(proof),'NATIVE_RPC_BRANDED_PROOF_REQUIRED',503);const {body}=proof,b=body.binding,clock=runtime.clock;
  const checkParent=async()=>{const g=businessParentCondition(proof,{now:clock()});requireThat(await runtime.store.first(g.sql,...g.args),'NATIVE_RPC_PARENT_UNAVAILABLE',401);};await checkParent();
  const complete=body.authority.schema===3?await (await import('./studio-portal.mjs')).resolveRootPortalSource(runtime,body):body.authority.schema===2?await resolveStudioBusinessSource(runtime,body):null;
  if(body.command==='/internal/website/identity'){const authority=complete?{globalAdmin:complete.rights.globalAdmin,scopes:complete.studioProjection.map(p=>({offering_id:p.scope.offering.id,active:Number(p.scope.enabled),kind:p.scope.offering.kind,role:p.person.role,can_create_account:Number(p.person.role==='ADMIN'&&p.scope.offering.kind==='COURSE'),source:{enabled:Number(p.scope.enabled)}}))}:body.authority;return nativeBusinessIdentity(runtime,proof,{authority});}
  const repository=academyD1Repository(env);await repository.ready();
  const capture=await runtime.nativeCapture(b),fresh={...capture.rights.nativeState,...Object.fromEntries(['classMemberships','classTeacherAssignments','substituteGrants'].map(k=>[k,capture.rights[k]||[]]))};requireThat(fresh?.account?.account_id===b.sub,'NATIVE_RPC_NATIVE_STATE_REQUIRED',503);
  const mappings=(await repository.coreDb.prepare(`SELECT t.offering_id,t.activity_key,t.kind,o.state access_owner FROM website_platform_timetable_scopes t JOIN website_platform_access_scopes s USING(activity_key) LEFT JOIN website_platform_access_ownership o USING(activity_key) WHERE s.enabled=1 AND COALESCE(o.state,'ACADEMY')<>'FROZEN' AND (?=1 OR t.offering_id IN(SELECT value FROM json_each(?)))`).bind(Number(complete?1:body.authority.globalAdmin),JSON.stringify(complete?[]:body.authority.scopes.map(s=>s.offering_id))).all()).results;
  const state=complete?intersectCompleteSourceState(fresh,{...complete.rights.nativeState,...Object.fromEntries(['classMemberships','classTeacherAssignments','substituteGrants'].map(k=>[k,complete.rights[k]||[]]))},b):intersectStudioSourceState(fresh,body.authority,mappings,b),context=executionContext(proof,state,env,clock);
  const authorise=(mode='ADMIN')=>{const auth=bindNativeAuth(selectWorkspace(new Request('https://ummabbadacademy.app/api/academy/entrance',{headers:{'X-Academy-Workspace':mode}}),{state,sid:b.sid,context:state.contexts[0],user:{accountid:b.sub}}),context);repository.bindActor(auth);return auth;};
  const admin=key=>Boolean(state.account.global_admin||state.roles.some(r=>upper(r.activity_key)===upper(key)&&r.role==='PROGRAM_ADMIN'));
  const mapped=input=>{const found=mappings.find(r=>r.offering_id===input.offeringId);requireThat(found&&admin(found.activity_key),'NATIVE_RPC_CAPTURED_ADMIN_REQUIRED',403);return found;};
  const read=async(path,input,mode)=>{const request=bindNativeBusinessRequest(new Request('https://ummabbadacademy.app'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':String(mode||'LEARN').toUpperCase()},body:JSON.stringify(input)}),context),response=await requestNative(request,env),value=await response.json();if(!response.ok)throw fail(value.code||'NATIVE_RPC_NATIVE_ACTION_UNAVAILABLE',response.status);if(path==='/api/academy/entrance'&&!state.account.global_admin){const allowed=new Set(state.allowedActivityKeys);value.personalActivities=(value.personalActivities||[]).filter(a=>allowed.has(upper(a.kind+':'+a.id)));value.personalTimetable=(value.personalTimetable||[]).filter(a=>allowed.has(upper(a.kind+':'+a.activityId)));}return value;};
  let result;
  if(body.command==='/internal/website/media-teachers'){
   const mapping=mapped(body.input);requireThat(body.input.purpose==='ADMIN_MEDIA','NATIVE_RPC_PURPOSE_INVALID',403);authorise();
   result={schema:'NATIVE_MEDIA_TEACHERS_V1',offeringId:body.input.offeringId,activityKey:mapping.activity_key,...await nativeMediaTeachers(repository.authoringRepository().db,mapping.activity_key,body.input.teacherIds),checkedAt:clock()*1000};
  }else if(body.command==='/internal/website/course-playlist-placements'){
   mapped(body.input);authorise();result=await nativeCoursePlaylistPlacements(repository,{account_id:b.sub,session_id:b.sid,epoch:b.ce},body.input,{stateFor:async()=>state,allowedActivityKeys:state.allowedActivityKeys});
  }else if(body.command==='/internal/website/dashboard'){
   requireThat(Object.keys(body.input).every(k=>['mode','date','weekStart'].includes(k)),'NATIVE_RPC_INPUT_INVALID',400);result={dashboard:await dashboardSummary(state,env,body.input,read,mappings)};
  }else if(body.command==='/internal/website/lesson-join'){
   const selected=dashboardJoinInput(state,body.input);requireThat(complete||!selected.target.assignmentId,'NATIVE_RPC_SUBSTITUTE_RECEIPT_REQUIRED',503);
   if(selected.target.assignmentId){
    let captured=[];try{captured=JSON.parse(state.account.substitute_grants||'[]');}catch{}
    requireThat(Array.isArray(captured)&&captured.some(g=>g.id===selected.target.assignmentId),'NATIVE_RPC_CAPTURED_SUBSTITUTE_REQUIRED',403);
   }
   const key=selected.target.activityKey,scope=state.scopes.get(upper(key));requireThat(complete||state.account.global_admin||scope&&(scope.role==='TEACHER'||scope.role==='ADMIN'||scope.enrolled===1&&scope.liveEntitled),'NATIVE_RPC_CAPTURED_JOIN_REQUIRED',403);
   await nativeJoinOwnership(repository.coreDb,b.sub,selected.target);result=await read('/api/academy/lesson/join',{joinKey:selected.joinKey,date:selected.date},dashboardTimetableAudience(state,selected.mode));await nativeJoinOwnership(repository.coreDb,b.sub,selected.target);
  }else throw fail('NATIVE_RPC_IDENTITY_DISPATCH_REQUIRED',503);
  const after=await runtime.nativeCapture(b);requireThat(canonical(after.ownerVector)===canonical(capture.ownerVector),'NATIVE_RPC_AUTHORITY_CHANGED',409);await checkParent();return result;
 };
}

export function intersectCompleteSourceState(fresh,captured,binding){
 const intersect=(a,b)=>{const keys=new Set((b||[]).map(canonical));return (a||[]).filter(row=>keys.has(canonical(row)));},global=Boolean(fresh.account.global_admin&&captured.account.global_admin),activities=intersect(fresh.activities,captured.activities),roles=intersect(fresh.roles,captured.roles),subscriptions=intersect(fresh.subscriptions,captured.subscriptions),contexts=intersect(fresh.contexts,captured.contexts).filter(c=>c.role!=='GLOBAL_ADMIN'||global),substitutes=intersect(JSON.parse(fresh.account.substitute_grants||'[]'),JSON.parse(captured.account.substitute_grants||'[]'));
 return {...fresh,account:{...fresh.account,credential_epoch:binding.ce,global_admin:Number(global),substitute_grants:JSON.stringify(substitutes)},activities,roles,subscriptions,contexts,monthlyMedia:intersect(fresh.monthlyMedia,captured.monthlyMedia),surahGrants:intersect(fresh.surahGrants,captured.surahGrants),classMemberships:intersect(fresh.classMemberships,captured.classMemberships),classTeacherAssignments:intersect(fresh.classTeacherAssignments,captured.classTeacherAssignments),publishedTeacherClasses:intersect(fresh.publishedTeacherClasses,captured.publishedTeacherClasses),memorisation:{personalActive:fresh.memorisation?.personalActive===true&&captured.memorisation?.personalActive===true,disabledActivityKeys:[...new Set([...(fresh.memorisation?.disabledActivityKeys||fresh.activities.map(x=>x.activity_key)),...(captured.memorisation?.disabledActivityKeys||captured.activities.map(x=>x.activity_key))])]},substituteGrants:intersect(fresh.substituteGrants,captured.substituteGrants),scopes:new Map(),allowedActivityKeys:activities.map(a=>upper(a.activity_key))};
}
