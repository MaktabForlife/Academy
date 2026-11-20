import {academyMemorisationDraftGuard} from './academy-memorisation-resources.mjs';
import {academyCatalogueDraftGuard} from './academy-catalogue-resources.mjs';
import {academyCourseManagementDraftGuard} from './academy-course-management-resources.mjs';
import {academyPersonalLinksDraftGuard} from './academy-personal-links-resources.mjs';
import {academyReaderDraftGuard} from './academy-reader-resources.mjs';
import {academyUsersDraftGuard} from './academy-users-resources.mjs';
import {academyAdminFormDraftGuard} from './academy-admin-form-resources.mjs';
import {academyStudioAccessDraftGuard} from './academy-studio-access-resources.mjs';
import {academyAssessmentTemplateDraftGuard} from './academy-assessment-template-resources.mjs';
import {academyCalendarDraftGuard} from './academy-calendar-resources.mjs';
import {academyLibraryDraftGuard} from './academy-library-resources.mjs';
import {academyPlanningDraftGuard} from './academy-planning-resources.mjs';
import {academyEnrolmentDraftGuard} from './academy-enrolment-resources.mjs';
import {academyPaidGridDraftGuard} from './academy-paid-grid-resources.mjs';
import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,uuid} from './codec.mjs';
// Key identity is the semantic native website, independent of content revision.
// The existing native save/commit owns its source row CAS and split-store fence.
const safeRevision=n=>Number.isSafeInteger(n)&&n>=0;
const ownAccountGuard=({binding,rights})=>{
 const state=rights?.nativeState;requireThat(state?.account?.account_id===binding?.sub&&state.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 return {sql:'SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? COLLATE BINARY AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND NOT EXISTS(SELECT 1 FROM split_write_fence)',args:[binding.sub,binding.ce]};
};
export async function academyDraftGuard(input){
 const {store,env,binding,rights,resource}=input;
 requireThat(store?.app==='academy'&&binding&&rights&&resource&&typeof resource==='object'&&!Array.isArray(resource),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 const memorisation=await academyMemorisationDraftGuard(input);if(memorisation)return memorisation;
 const catalogue=await academyCatalogueDraftGuard(input);if(catalogue)return catalogue;
 const course=await academyCourseManagementDraftGuard(input);if(course)return course;
 const personal=await academyPersonalLinksDraftGuard(input);if(personal)return personal;
 const reader=await academyReaderDraftGuard(input);if(reader)return reader;
 const users=await academyUsersDraftGuard(input);if(users)return users;
 const adminForm=await academyAdminFormDraftGuard(input);if(adminForm)return adminForm;
 const studioAccess=await academyStudioAccessDraftGuard(input);if(studioAccess)return studioAccess;
 const template=await academyAssessmentTemplateDraftGuard(input);if(template)return template;
 const calendar=await academyCalendarDraftGuard(input);if(calendar)return calendar;
 const library=await academyLibraryDraftGuard(input);if(library)return library;
 const planning=await academyPlanningDraftGuard(input);if(planning)return planning;
 const enrolment=await academyEnrolmentDraftGuard(input);if(enrolment)return enrolment;
 const paid=await academyPaidGridDraftGuard(input);if(paid)return paid;
 const fields=Object.keys(resource).sort().join(',');
 if(resource.type==='academy-bookmarks'){
  requireThat(fields==='type','ACADEMY_DRAFT_RESOURCE_REQUIRED',403);return ownAccountGuard({binding,rights});
 }
 if(resource.type==='academy-pdf-annotations'){
  requireThat(fields==='sha256,source,type'&&['public','local'].includes(resource.source)&&/^[a-f0-9]{64}$/.test(resource.sha256),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  // Only this account's browser annotations. This is never a file/download grant.
  return ownAccountGuard({binding,rights});
 }
 const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u0020\u007f]/.test(value),validActivity=value=>typeof value==='string'&&/^(PROGRAM|COURSE):[^:]{1,160}$/.test(value),date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
 const capturedRole=(key,role)=>rights.nativeState?.roles?.some(r=>r.role===role&&String(r.activity_key).toUpperCase()===String(key).toUpperCase());
 const capturedLearner=key=>capturedRole(key,'STUDENT')||rights.nativeState?.subscriptions?.some(r=>String(r.activity_key).toUpperCase()===String(key).toUpperCase());
 const capturedAreaAdmin=key=>rights.globalAdmin===true&&rights.nativeState?.account?.global_admin===1||rights.nativeState?.roles?.some(r=>r.role==='PROGRAM_ADMIN'&&String(r.activity_key).toUpperCase()===String(key).toUpperCase());
 const requireFields=expected=>requireThat(fields===expected,'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);



 if(resource.type==='academy-historical-media'){
  requireFields('activityKey,type');requireThat(validActivity(resource.activityKey)&&resource.activityKey.startsWith('PROGRAM:'),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});requireThat(capturedAreaAdmin(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:'/api/academy/lesson-media/feed',body:{activityKey:resource.activityKey,contentFlow:true},workspace:'ADMIN',accept:async dto=>{requireThat(dto.kind==='PROGRAM'&&dto.canCreateContent===true&&dto.monthlyPolicy,'ACADEMY_DRAFT_FORBIDDEN',403);const policy=await store.first('SELECT revision FROM program_monthly_media_policies WHERE activity_key=? COLLATE NOCASE',resource.activityKey);requireThat(policy&&safeRevision(policy.revision),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:"SELECT 1 FROM activities x JOIN program_monthly_media_policies p USING(activity_key) WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE' AND p.revision=? AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? AND r.activity_key=x.activity_key AND r.role='PROGRAM_ADMIN'))",args:[resource.activityKey,policy.revision,binding.sub,binding.sub]};}});
 }
 if(resource.type==='academy-lesson-note'){
  requireFields('activityKey,lessonId,noteId,sourceDate,sourceSessionKey,type,workspace');requireThat(validActivity(resource.activityKey)&&['ADMIN','TEACH','LEARN'].includes(resource.workspace)&&(resource.noteId===null||id(resource.noteId))&&(resource.lessonId===null||id(resource.lessonId))&&date(resource.sourceDate)&&typeof resource.sourceSessionKey==='string'&&resource.sourceSessionKey.length>0&&resource.sourceSessionKey.length<=1200,'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  const body={activityKey:resource.activityKey,...resource.lessonId?{lessonId:resource.lessonId}:{},...resource.noteId?{noteId:resource.noteId}:{},sessionKey:resource.sourceSessionKey,date:resource.sourceDate};
  return readNativeDraftResource(input,{path:'/api/academy/lesson-media/note-options',body,workspace:resource.workspace,accept:async dto=>{
   const session=dto.session,curates=dto.canCurateNotes===true&&resource.noteId!==null&&capturedAreaAdmin(resource.activityKey);requireThat(session&&session.sessionKey===resource.sourceSessionKey&&session.date===resource.sourceDate&&(dto.canContribute===true||curates),'ACADEMY_DRAFT_FORBIDDEN',403);
   if(!curates){requireThat(resource.workspace==='TEACH'&&capturedRole(resource.activityKey,'TEACHER'),'ACADEMY_DRAFT_FORBIDDEN',403);const assignment=rights.classTeacherAssignments?.some(r=>String(r.activity_key).toUpperCase()===resource.activityKey.toUpperCase()&&session.classIds?.some(id=>String(id).toUpperCase()===String(r.class_id).toUpperCase()));
    if(!capturedAreaAdmin(resource.activityKey)&&!assignment){requireThat(rights.nativeState.acceptedHead,'ACADEMY_DRAFT_CAPTURE_HEAD_REQUIRED',503);await readNativeDraftResource(input,{path:'/api/academy/lesson-media/note-options',body,workspace:'TEACH',setupHead:rights.nativeState.acceptedHead,accept:old=>{requireThat(old.canContribute===true&&old.session?.sessionKey===session.sessionKey&&old.session.teacherIds?.some(id=>String(id).toUpperCase()===binding.sub.toUpperCase()),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:'SELECT 1 FROM setup_heads WHERE head_id=?',args:[rights.nativeState.acceptedHead]};}});}
   }
   return resource.noteId===null?{sql:"SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.active=1 AND x.lifecycle='ACTIVE'",args:[resource.activityKey]}:{sql:'SELECT 1 FROM lesson_note_entries n WHERE n.note_id=? AND n.activity_key=? COLLATE NOCASE'+(curates?'':' AND n.owner_id=? COLLATE BINARY'),args:[resource.noteId,resource.activityKey,...curates?[]:[binding.sub]]};
  }});
 }
 if(resource.type==='academy-program-playlist'||resource.type==='academy-program-recording'){
  const playlist=resource.type==='academy-program-playlist';requireFields(playlist?'activityKey,creating,editor,playlistId,type':'activityKey,playlistId,type');requireThat(validActivity(resource.activityKey)&&resource.activityKey.startsWith('PROGRAM:')&&(playlist?typeof resource.creating==='boolean'&&(resource.creating?resource.playlistId===null:id(resource.playlistId))&&['context','settings','artwork'].includes(resource.editor):resource.playlistId===null||id(resource.playlistId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});requireThat(capturedAreaAdmin(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  const creating=playlist&&resource.creating,existing=resource.playlistId!==null&&!creating;
  return readNativeDraftResource(input,{path:playlist?(existing?'/api/academy/media-playlists/get':'/api/academy/media-playlists/options'):'/api/academy/lesson-media/binding-options',body:{activityKey:resource.activityKey,...existing?{playlistId:resource.playlistId}:{}},workspace:'ADMIN',accept:dto=>{
   const row=dto.playlist;if(existing)requireThat(row&&row.id===resource.playlistId&&row.canManage===true&&row.canEdit!==false,'ACADEMY_DRAFT_FORBIDDEN',403);else requireThat(Array.isArray(dto.classes)&&Array.isArray(dto.subjects)&&Array.isArray(dto.teachers),'ACADEMY_DRAFT_FORBIDDEN',403);
   const scope="SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE' AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')) AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=x.activity_key COLLATE NOCASE AND o.state IN('STUDIO','FROZEN'))";
   return {sql:scope+(existing?' AND EXISTS(SELECT 1 FROM academy_media_playlists m WHERE m.activity_key=x.activity_key COLLATE NOCASE AND m.playlist_id=? AND m.revision=?)':''),args:[resource.activityKey,binding.sub,binding.sub,...existing?[resource.playlistId,row.revision]:[]]};
  }});
 }
 if(resource.type==='academy-lesson-media'){
  requireFields('activityKey,assetId,editor,lessonId,type');requireThat(validActivity(resource.activityKey)&&id(resource.lessonId)&&(resource.assetId===null||id(resource.assetId))&&['details','context','companion'].includes(resource.editor)&&(resource.editor==='companion'?resource.assetId!==null:resource.assetId===null),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  // Selected native setup grants media management only to actual scoped Admin.
  // The native get/companion reader below remains the owning authorizer.
  requireThat(capturedAreaAdmin(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  const lessonGuard=await readNativeDraftResource(input,{path:'/api/academy/lesson-media/get',body:{activityKey:resource.activityKey,lessonId:resource.lessonId},workspace:'ADMIN',accept:dto=>{const row=dto.lesson;requireThat(row&&row.id===resource.lessonId&&String(row.activityKey).toUpperCase()===resource.activityKey.toUpperCase()&&row.canManage===true&&row.readOnly!==true&&(resource.editor!=='context'||row.canCorrectContext===true),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:"SELECT 1 FROM lesson_media_lessons l WHERE l.lesson_id=? AND l.activity_key=? COLLATE NOCASE AND l.revision=? AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=l.activity_key AND o.state IN('STUDIO','FROZEN'))",args:[row.id,resource.activityKey,row.revision]};}});
  if(resource.editor!=='companion')return lessonGuard;
  const companionGuard=await readNativeDraftResource(input,{path:'/api/academy/lesson-media/companion-editor',body:{activityKey:resource.activityKey,lessonId:resource.lessonId,assetId:resource.assetId},workspace:'ADMIN',accept:dto=>{const until=Date.parse(dto.companionExpiresAt);requireThat(dto.lessonId===resource.lessonId&&dto.assetId===resource.assetId&&Number.isFinite(until)&&until>input.runtime.clock()*1000,'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:"SELECT 1 FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND (a.kind='MP4' OR a.kind IS NULL) AND unixepoch('now')*1000<? AND coalesce((SELECT c.revision FROM lesson_recording_companions c WHERE c.lesson_id=l.lesson_id AND c.asset_id=a.asset_id),0)=?",args:[resource.lessonId,resource.assetId,until,dto.companionRevision]};}});
  return {sql:'SELECT 1 WHERE EXISTS('+lessonGuard.sql+') AND EXISTS('+companionGuard.sql+')',args:[...lessonGuard.args,...companionGuard.args]};
 }
 if(resource.type==='academy-program'){
  requireFields('mode,programId,type');requireThat(['create','copy','edit'].includes(resource.mode)&&(resource.mode==='create'?resource.programId===null:id(resource.programId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  if(resource.mode!=='edit')requireThat(rights.globalAdmin===true&&rights.nativeState.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:'/api/admin/platform/programs/list',body:{},workspace:'ADMIN',accept:dto=>{
   const row=(dto.programs||[]).find(p=>p.id===resource.programId);requireThat(resource.mode==='create'||row,'ACADEMY_DRAFT_FORBIDDEN',403);
   const key=row?'PROGRAM:'+row.id:null;if(resource.mode==='edit')requireThat(capturedAreaAdmin(key),'ACADEMY_DRAFT_FORBIDDEN',403);
   const sql=resource.mode==='edit'?"SELECT 1 FROM activities x WHERE x.activity_id=? COLLATE NOCASE AND x.kind='PROGRAM' AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN'))":"SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED'";
   return {sql,args:resource.mode==='edit'?[row.id,binding.sub,binding.sub]:[binding.sub]};
  }});
 }
 if(['academy-program-timetable','academy-program-management','academy-program-setup'].includes(resource.type)){
  const timetable=resource.type==='academy-program-timetable',setup=resource.type==='academy-program-setup';requireFields(timetable||setup?'programId,type':'kind,programId,type');requireThat(id(resource.programId)&&(timetable||setup||['subjects','levels','modules','tasks','progress','classes','teachers','enrollments','student-classes'].includes(resource.kind)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});const activityKey='PROGRAM:'+resource.programId;requireThat(capturedAreaAdmin(activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:timetable||setup?'/api/admin/platform/program-timetable/get':'/api/admin/platform/program-timetable/manage-get',body:{id:resource.programId},workspace:'ADMIN',accept:dto=>{
   requireThat(dto.coordinatorAvailable===true&&dto.managementEditable===true&&dto.program&&String(dto.program.id).toUpperCase()===resource.programId.toUpperCase(),'ACADEMY_DRAFT_FORBIDDEN',403);
   if(timetable)requireThat((dto.timetableEditable??dto.program.timetableEditable)===true&&dto.workspaceReady!==false,'ACADEMY_DRAFT_FORBIDDEN',403);
   const shared=!timetable&&!setup&&resource.kind==='subjects';if(shared)requireThat(dto.sharedSubjectsEditable===true&&rights.globalAdmin===true&&rights.nativeState.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
   return {sql:"SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND x.lifecycle<>'ARCHIVED' AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')"+(shared?'':" OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')")+")",args:[activityKey,binding.sub,...shared?[]:[binding.sub]]};
  }});
 }
 if(resource.type==='academy-class-note'){
  requireFields('action,activityKey,noteId,sourceClassId,sourceDate,sourceSessionKey,type,workspace');requireThat(validActivity(resource.activityKey)&&['ADMIN','TEACH','LEARN'].includes(resource.workspace)&&['post','revise','withdraw','relink'].includes(resource.action)&&(resource.action==='post'?resource.noteId===null:id(resource.noteId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  const hasSource=resource.sourceDate!==null||resource.sourceSessionKey!==null||resource.sourceClassId!==null;
  if(hasSource)requireThat(date(resource.sourceDate)&&id(resource.sourceClassId)&&typeof resource.sourceSessionKey==='string'&&resource.sourceSessionKey.length>0&&resource.sourceSessionKey.length<=1200,'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  requireThat(['post','relink'].includes(resource.action)?hasSource:!hasSource,'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  return readNativeDraftResource(input,{path:'/api/academy/class-notes/get',body:{activityKey:resource.activityKey,...resource.noteId?{noteId:resource.noteId}:{source:{date:resource.sourceDate,sessionKey:resource.sourceSessionKey,classId:resource.sourceClassId}}},workspace:resource.workspace,accept:async dto=>{
   const source=dto.source,note=(dto.notes||[]).find(n=>n.id===resource.noteId);requireThat(source&&String(source.activityKey).toUpperCase()===resource.activityKey.toUpperCase(),'ACADEMY_DRAFT_FORBIDDEN',403);
   const permission=resource.action==='post'?source.canPost===true:note&&note[resource.action==='revise'?'canEdit':resource.action==='withdraw'?'canWithdraw':'canRelink']===true;requireThat(permission,'ACADEMY_DRAFT_FORBIDDEN',403);
   const extras=[];
   if(resource.workspace==='LEARN'){requireThat(capturedLearner(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);if(source.kind==='PROGRAM')requireThat(Array.isArray(rights.classMemberships)&&rights.classMemberships.some(m=>String(m.activity_key).toUpperCase()===resource.activityKey.toUpperCase()&&String(m.class_id).toUpperCase()===String(source.classId).toUpperCase()&&m.active===1&&(!m.start_date||m.start_date<=source.date)&&(!m.end_date||m.end_date>=source.date)),'ACADEMY_DRAFT_FORBIDDEN',403);}
   if(resource.workspace==='ADMIN')requireThat(capturedAreaAdmin(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
   if(resource.workspace==='TEACH'&&!capturedAreaAdmin(resource.activityKey)){
    requireThat(rights.nativeState.roles.some(r=>r.role==='TEACHER'&&String(r.activity_key).toUpperCase()===resource.activityKey.toUpperCase()),'ACADEMY_DRAFT_FORBIDDEN',403);
    const assigned=Array.isArray(rights.classTeacherAssignments)&&rights.classTeacherAssignments.some(r=>String(r.activity_key).toUpperCase()===resource.activityKey.toUpperCase()&&String(r.class_id).toUpperCase()===String(source.classId).toUpperCase());
    if(!assigned){requireThat(rights.nativeState.acceptedHead,'ACADEMY_DRAFT_CAPTURE_HEAD_REQUIRED',503);extras.push(await readNativeDraftResource(input,{path:'/api/academy/class-notes/get',body:{activityKey:resource.activityKey,...resource.noteId?{noteId:resource.noteId}:{source:{date:resource.sourceDate,sessionKey:resource.sourceSessionKey,classId:resource.sourceClassId}}},workspace:'TEACH',setupHead:rights.nativeState.acceptedHead,accept:old=>{requireThat(old.source?.stableKey===source.stableKey&&String(old.source.classId).toUpperCase()===String(source.classId).toUpperCase()&&old.source.teacherIds?.some(id=>String(id).toUpperCase()===binding.sub.toUpperCase()),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:'SELECT 1 FROM setup_heads WHERE head_id=?',args:[rights.nativeState.acceptedHead]};}}));}
   }
   if(resource.action==='relink')extras.push(await readNativeDraftResource(input,{path:'/api/academy/class-notes/get',body:{activityKey:resource.activityKey,source:{date:resource.sourceDate,sessionKey:resource.sourceSessionKey,classId:resource.sourceClassId}},workspace:resource.workspace,accept:target=>{requireThat(target.source?.canModerate===true&&!target.source.unresolved&&String(target.source.classId).toUpperCase()===String(source.classId).toUpperCase(),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:'SELECT 1',args:[]};}}));
   const base=note?{sql:"SELECT 1 FROM class_notes WHERE note_id=? AND activity_key=? COLLATE NOCASE AND revision=? AND state='ACTIVE'",args:[note.id,resource.activityKey,note.revision]}:{sql:"SELECT 1 FROM activities WHERE activity_key=? COLLATE NOCASE AND active=1 AND lifecycle='ACTIVE'",args:[resource.activityKey]};return {sql:base.sql+extras.map(g=>' AND EXISTS('+g.sql+')').join(''),args:[...base.args,...extras.flatMap(g=>g.args)]};
  }});
 }
 if(resource.type==='academy-assessment-register'){
  requireFields('activityKey,classId,registerId,type,workspace');requireThat(resource.workspace==='ADMIN'&&validActivity(resource.activityKey)&&(resource.classId===null||id(resource.classId))&&(resource.registerId===null||id(resource.registerId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  return readNativeDraftResource(input,{path:'/api/academy/assessments/list',body:{view:'admin'},workspace:'ADMIN',accept:dto=>{
   const row=(dto.registers||[]).find(r=>r.id===resource.registerId);requireThat(capturedAreaAdmin(resource.activityKey)&&(!row||row.areas?.every(a=>capturedAreaAdmin(a.key))),'ACADEMY_DRAFT_FORBIDDEN',403);requireThat(resource.registerId?row?.canEdit===true:dto.canAdmin===true&&dto.classes?.some(c=>String(c.activity_key||c.activityKey).toUpperCase()===resource.activityKey.toUpperCase()&&(resource.classId===null||String(c.class_id||c.classId).toUpperCase()===resource.classId.toUpperCase())),'ACADEMY_DRAFT_FORBIDDEN',403);
   return row?{sql:'SELECT 1 FROM assessment_registers WHERE register_id=? AND revision=?',args:[row.id,row.revision]}:{sql:'SELECT 1',args:[]};
  }});
 }
 if(resource.type==='academy-assessment'){
  requireFields('assessmentId,mode,type,workspace');requireThat(id(resource.assessmentId)&&['details','paper','answer','marks'].includes(resource.mode)&&['ADMIN','TEACH','LEARN'].includes(resource.workspace),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  return readNativeDraftResource(input,{path:'/api/academy/assessments/get',body:{assessmentId:resource.assessmentId,...resource.workspace==='LEARN'?{view:'learner'}:{}},workspace:resource.workspace,accept:async dto=>{
   const a=dto.assessment,own=(dto.learners||[]).find(r=>r.accountId===binding.sub);requireThat(a?.id===resource.assessmentId&&!a.learnerPreview&&!a.readOnly,'ACADEMY_DRAFT_FORBIDDEN',403);
   requireThat(resource.mode==='answer'?capturedLearner(a.activityKey):capturedAreaAdmin(a.activityKey)||resource.mode!=='details'&&capturedRole(a.activityKey,'TEACHER'),'ACADEMY_DRAFT_FORBIDDEN',403);
   const allowed=resource.mode==='details'?a.canAdmin===true:resource.mode==='paper'?a.canSubmitPaper===true:resource.mode==='marks'?a.canEnterMarks===true:resource.workspace==='LEARN'&&a.canUpload===true&&own;requireThat(allowed,'ACADEMY_DRAFT_FORBIDDEN',403);
   const deadlines=resource.mode==='answer'?[a.attemptDeadline,a.dueAt].filter(value=>typeof value==='string'&&value.length).map(value=>Math.floor(Date.parse(value)/1000)):[];requireThat(deadlines.every(Number.isSafeInteger),'ACADEMY_DRAFT_TIME_INVALID',503);const until=deadlines.length?Math.min(...deadlines):null;requireThat(until===null||until>input.runtime.clock(),'ACADEMY_DRAFT_FORBIDDEN',403);
   const details=resource.mode==='details'?await readNativeDraftResource(input,{path:'/api/academy/assessments/list',body:{view:'admin',activityKey:a.activityKey},workspace:resource.workspace,accept:list=>{requireThat(list.assessments?.find(row=>row.id===a.id)?.canEditDetails===true,'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:'SELECT 1',args:[]};}}):null;
   return {sql:'SELECT 1 FROM assessments WHERE assessment_id=? AND revision=? AND deleted_at IS NULL'+(resource.mode==='answer'?' AND EXISTS(SELECT 1 FROM assessment_recipients WHERE assessment_id=? AND account_id=? COLLATE BINARY AND revision=?)':'')+(details?' AND EXISTS('+details.sql+')':'')+(until===null?'':' AND unixepoch()<?'),args:[a.id,a.revision,...resource.mode==='answer'?[a.id,binding.sub,own.revision]:[],...details?details.args:[],...until===null?[]:[until]]};
  }});
 }
 if(resource.type==='academy-attendance-roster'){
  requireFields('activityKey,runId,type,workspace');requireThat(validActivity(resource.activityKey)&&resource.activityKey.startsWith('COURSE:')&&id(resource.runId)&&resource.workspace==='ADMIN','ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});requireThat(capturedAreaAdmin(resource.activityKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  return readNativeDraftResource(input,{path:'/api/academy/attendance/roster-get',body:{activityKey:resource.activityKey,runId:resource.runId},workspace:'ADMIN',accept:dto=>{
   requireThat(dto.runId&&safeRevision(dto.revision),'ACADEMY_DRAFT_FORBIDDEN',403);return dto.revision?{sql:'SELECT 1 FROM attendance_delivery_rosters WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE AND revision=?',args:[resource.activityKey,dto.runId,dto.revision]}:{sql:'SELECT 1 FROM course_runs WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE AND NOT EXISTS(SELECT 1 FROM attendance_delivery_rosters WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE)',args:[resource.activityKey,dto.runId,resource.activityKey,dto.runId]};
  }});
 }
 if(resource.type==='academy-attendance'){
  requireFields('activityKey,anchor,classId,date,scope,type,workspace');requireThat(validActivity(resource.activityKey)&&date(resource.date)&&id(resource.classId)&&['ADMIN','TEACH'].includes(resource.workspace)&&['day','lesson'].includes(resource.scope)&&(resource.scope==='lesson'?id(resource.anchor):resource.anchor===null),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);ownAccountGuard({binding,rights});
  return readNativeDraftResource(input,{path:'/api/academy/attendance/get',body:{activityKey:resource.activityKey,date:resource.date},workspace:resource.workspace,accept:async dto=>{
   const rows=(dto.lessons||[]).filter(r=>String(r.lesson?.classId).toUpperCase()===resource.classId.toUpperCase()&&(resource.scope==='day'||r.lesson.anchor===resource.anchor));requireThat(!dto.readOnly&&rows.length>0&&rows.every(r=>r.canSubmit===true),'ACADEMY_DRAFT_FORBIDDEN',403);
   const admin=capturedAreaAdmin(resource.activityKey),teacher=rights.nativeState.roles.some(r=>r.role==='TEACHER'&&String(r.activity_key).toUpperCase()===resource.activityKey.toUpperCase());
   const assigned=Array.isArray(rights.classTeacherAssignments)&&rights.classTeacherAssignments.some(r=>String(r.activity_key).toUpperCase()===resource.activityKey.toUpperCase()&&String(r.class_id).toUpperCase()===resource.classId.toUpperCase());
   let original=null;if(!admin&&teacher&&!assigned){requireThat(rights.nativeState.acceptedHead,'ACADEMY_DRAFT_CAPTURE_HEAD_REQUIRED',503);original=await readNativeDraftResource(input,{path:'/api/academy/attendance/get',body:{activityKey:resource.activityKey,date:resource.date},workspace:resource.workspace,setupHead:rights.nativeState.acceptedHead,accept:old=>{requireThat(rows.every(row=>old.lessons?.some(r=>r.lesson?.stableKey===row.lesson.stableKey&&String(r.lesson.classId).toUpperCase()===resource.classId.toUpperCase()&&r.lesson.teacherIds?.some(id=>String(id).toUpperCase()===binding.sub.toUpperCase()))),'ACADEMY_DRAFT_FORBIDDEN',403);return {sql:'SELECT 1 FROM setup_heads WHERE head_id=?',args:[rights.nativeState.acceptedHead]};}});}
   let until=null;if(!admin&&!(teacher&&(assigned||original))){
    requireThat(Array.isArray(rights.substituteGrants),'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);const deadlines=rows.map(r=>{const matching=rights.substituteGrants.filter(g=>String(g.activity_key).toUpperCase()===resource.activityKey.toUpperCase()&&g.attendance_date===resource.date&&g.stable_key===r.lesson.stableKey);requireThat(matching.length>0,'ACADEMY_DRAFT_FORBIDDEN',403);return Math.max(...matching.map(g=>Date.parse(r.submitted?[g.correction_until,g.correction_reopen_until||''].sort().at(-1):g.first_until)));});until=Math.floor(Math.min(...deadlines)/1000);requireThat(Number.isSafeInteger(until)&&until>input.runtime.clock(),'ACADEMY_DRAFT_FORBIDDEN',403);
   }
   return {sql:"SELECT 1 FROM activities WHERE activity_key=? COLLATE NOCASE AND active=1 AND lifecycle='ACTIVE'"+(until===null?'':' AND unixepoch()<?')+(original?' AND EXISTS('+original.sql+')':''),args:[resource.activityKey,...until===null?[]:[until],...original?original.args:[]]};
  }});
 }
 if(resource.type==='academy-course-media'){
  requireThat(fields==='activityKey,type'&&typeof resource.activityKey==='string'&&/^COURSE:[^:]{1,160}$/.test(resource.activityKey),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
  const activity=resource.activityKey.toUpperCase(),state=rights.nativeState;ownAccountGuard({binding,rights});
  requireThat(typeof rights.globalAdmin==='boolean'&&Array.isArray(state.roles),'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
  const global=rights.globalAdmin&&Boolean(state.account.global_admin),admin=state.roles.some(r=>String(r.activity_key).toUpperCase()===activity&&r.role==='PROGRAM_ADMIN');
  requireThat(global||admin,'ACADEMY_DRAFT_FORBIDDEN',403);
  return {sql:`SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN activities x ON x.activity_key=? COLLATE NOCASE
   JOIN website_platform_timetable_scopes m ON m.activity_key=x.activity_key COLLATE NOCASE
   JOIN website_platform_access_scopes s ON s.activity_key=x.activity_key COLLATE NOCASE
   JOIN website_platform_access_ownership o ON o.activity_key=x.activity_key COLLATE NOCASE
   WHERE a.account_id=? COLLATE BINARY AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
   AND x.kind='COURSE' AND m.kind='COURSE' AND length(trim(m.offering_id))>0 AND s.enabled=1 AND o.state='STUDIO'
   AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN')) OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')))
   AND NOT EXISTS(SELECT 1 FROM split_write_fence)`,args:[activity,binding.sub,binding.ce,Number(global),Number(admin)]};
 }

 requireThat(store?.app==='academy'&&binding&&rights&&resource&&Object.keys(resource).sort().join(',')==='activityKey,surahId,type'&&resource.type==='academy-website'&&typeof resource.activityKey==='string'&&/^(?:COURSE|PROGRAM):[^:]{1,160}$/.test(resource.activityKey)&&((resource.activityKey.startsWith('COURSE:')&&resource.surahId===null)||(resource.activityKey.startsWith('PROGRAM:')&&uuid(resource.surahId))),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 if(resource.surahId!==null)requireThat(env?.ACADEMY_MONTHLY_SUBSCRIPTIONS==='1','ACADEMY_MONTHLY_ACCESS_REQUIRED',503);
 const activity=resource.activityKey.toUpperCase(),surah=resource.surahId?.toLowerCase()||null,website=surah?'SURAH:'+surah:activity,state=rights.nativeState;
 requireThat(state?.account?.account_id===binding.sub&&state.account.active===1&&typeof rights.globalAdmin==='boolean'&&Array.isArray(state.roles),'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 const capturedGlobal=rights.globalAdmin&&Boolean(state.account.global_admin),capturedAdmin=state.roles.some(r=>String(r.activity_key).toUpperCase()===activity&&r.role==='PROGRAM_ADMIN');
 requireThat(capturedGlobal||capturedAdmin,'ACADEMY_DRAFT_FORBIDDEN',403);
 return {sql:`SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN activities x ON x.activity_key=? COLLATE NOCASE
 LEFT JOIN website_studio_state w ON w.website_id=?
 WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
 AND x.active=1 AND x.lifecycle='ACTIVE' AND (w.website_id IS NULL OR w.revision>=0 AND w.activity_key=x.activity_key COLLATE NOCASE)
 AND ((? IS NULL AND x.kind='COURSE' AND (w.website_id IS NULL OR w.surah_id IS NULL)) OR (? IS NOT NULL AND x.kind='PROGRAM' AND (w.website_id IS NULL OR w.surah_id=? COLLATE NOCASE) AND EXISTS(SELECT 1 FROM program_surahs s JOIN program_monthly_media_policies p USING(activity_key) WHERE s.surah_id=? COLLATE NOCASE AND s.activity_key=x.activity_key COLLATE NOCASE)))
 AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN')) OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=x.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')))`,args:[activity,website,binding.sub,binding.ce,surah,surah,surah,surah,Number(capturedGlobal),Number(capturedAdmin)]};
}
export const academyDraftResourceBoundary=Object.freeze({type:'academy-website',identity:'Existing native Course/Surah authoring identity, with absent metadata permitted and conflicting saved Core mapping denied. Published/enabled state is editorial, not an Admin draft gate.',revision:'Encrypted baseRevision is compared by the native editor and guarded native commit. It is not part of the wrapping-key resource ID.',unsupported:'Other form families require their own explicit resource grammar and native guard; listed selected V2 resources reuse native authorizers and exact source fences.'});
