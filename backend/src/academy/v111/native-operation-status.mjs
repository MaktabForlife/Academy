import {studioAccessOperationStatus} from './studio-access-operation-status.mjs';
import {nativeRequestContext} from './native-context.js';
import {primaryWriteCondition} from '../../../../security/v2/primary-write-guard.mjs';
import {canonical,requireThat,uuid,bytes} from '../../../../security/v2/codec.mjs';

// A closed native resource chooses its receipt namespace. Callers never select
// SQL, a dataset, an actor or a scope independently of that owning resource.
function namespace(r,sub){
 const area=r.activityKey,program=r.programId?'PROGRAM:'+r.programId.toUpperCase():null;
 switch(r.type){
  case 'academy-memorisation-personal':return {datasets:['MEMORISATION'],scope:'LEARNER:'+sub,memorisationTasks:true};
  case 'academy-memorisation-class':return {datasets:['MEMORISATION'],scope:r.activityKey+':'+r.classId,memorisationTasks:true};
  case 'academy-memorisation-catalogue':return {datasets:['MEMORISATION'],scope:'ACADEMY',ordinary:{sql:"(json_type(r.result_json,'$.moduleId')='text' OR json_type(r.result_json,'$.sets')='array')",args:[]}};
  case 'academy-memorisation-user-card':return {datasets:['MEMORISATION'],scope:'ACADEMY',ordinary:{sql:"json_extract(r.result_json,'$.accountId')=? COLLATE BINARY",args:[r.accountId]}};
  case 'academy-memorisation-activity':return {datasets:['MEMORISATION'],scope:'ACADEMY',ordinary:{sql:"json_extract(r.result_json,'$.activityKey')=? COLLATE BINARY",args:[r.activityKey]}};
  case 'academy-studio-access':return {external:true};
  case 'academy-program':return {datasets:['PROGRAM_REGISTRY'],scope:r.mode==='edit'?program:'ACADEMY',target:r.mode==='edit'?{table:'activities',column:'activity_id',value:r.programId}:null};
  case 'academy-program-setup':return {datasets:['PROGRAM_MANAGEMENT'],scope:program};
  case 'academy-program-management':return {datasets:[r.kind==='library'?'PROGRAM_LIBRARY':'PROGRAM_MANAGEMENT'],scope:program};
  case 'academy-program-timetable':return {datasets:['PROGRAM_TIMETABLE'],scope:program};
  case 'academy-website':return {datasets:['COURSE_WEBSITE'],scope:area,target:{table:r.surahId?'program_surah_website_documents':'course_website_documents',column:r.surahId?'surah_id':'activity_key',value:r.surahId||area}};
  case 'academy-enrolment-catalogue':return {datasets:['ENROLMENT'],scope:area,target:{table:'academy_enrolment_catalogue',column:'entry_id',value:r.entryId}};
  case 'academy-program-surah-table':case 'academy-program-subscriptions':case 'academy-program-surah-grants':case 'academy-program-subscription-policy':return {datasets:['PROGRAM_MONTHLY_SUBSCRIPTIONS'],scope:area};
  case 'academy-learning-catalogue':return {datasets:[r.kind==='subject'?'ACADEMY_SUBJECTS':'ACADEMY_MODULES'],scope:'ACADEMY',...r.recordId?{ordinary:{sql:"json_extract(r.result_json,?)=? COLLATE BINARY",args:[r.kind==='subject'?'$.subject.SubjectID':'$.module.id',r.recordId]}}:{}};
  case 'academy-course-management':return {datasets:['COURSE_MANAGEMENT'],scope:r.courseId?'COURSE:'+r.courseId:'ACADEMY'};
  case 'academy-users':return {datasets:['USER_PROFILES'],scope:'ACADEMY'};
  case 'academy-app-settings':return {datasets:['GLOBAL_SETTINGS'],scope:'ACADEMY'};
  case 'academy-pdf-defaults':return {datasets:['PDF_TOOL_DEFAULTS'],scope:'ACADEMY'};
  case 'academy-announcement':return {datasets:['ANNOUNCEMENTS'],scope:'ACADEMY',...r.announcementId?{ordinary:{sql:"json_extract(r.result_json,'$.announcement.id')=? COLLATE BINARY",args:[r.announcementId]}}:{}};
  case 'academy-announcements-feed':return {datasets:['ANNOUNCEMENTS'],scope:'ACADEMY'};
  case 'academy-calendar':return {datasets:['ACADEMY_CALENDAR'],scope:r.scopeKey};
  case 'academy-teacher-availability':return {datasets:['TEACHER_AVAILABILITY'],scope:'ACADEMY',ordinary:{sql:"json_extract(r.result_json,'$.accountId')=? COLLATE BINARY",args:[r.accountId]}};
  case 'academy-planning-requirements':return {datasets:['LESSON_PLAN_ADMIN'],scope:'GLOBAL'};
  case 'academy-planning':return {datasets:['LESSON_PLANS'],scope:area};
  case 'academy-lesson-note':return {datasets:['LESSON_NOTES'],scope:area,note:{id:r.noteId,lesson:r.lessonId,session:r.sourceSessionKey,date:r.sourceDate}};
  case 'academy-historical-media':case 'academy-program-recording':return {datasets:['LESSON_MEDIA'],scope:area};
  case 'academy-program-playlist':return {datasets:['MEDIA_PLAYLISTS'],scope:area};
  case 'academy-lesson-media':return {datasets:['LESSON_MEDIA'],scope:area,target:{table:'lesson_media_lessons',column:'lesson_id',value:r.lessonId}};
  case 'academy-assessment-template':return {datasets:['ASSESSMENT'],scope:area,...r.templateId?{ordinary:{sql:"json_extract(r.result_json,'$.templateId')=? COLLATE BINARY",args:[r.templateId]}}:{}};
  case 'academy-assessment':return {datasets:['ASSESSMENT'],scope:r.assessmentId,target:{table:'assessments',column:'assessment_id',value:r.assessmentId}};
  case 'academy-assessment-register':return {datasets:['ASSESSMENT'],scope:r.registerId||'REGISTER:'+sub};
  default:requireThat(false,'NATIVE_OPERATION_RESOURCE_UNSUPPORTED',400);
 }
}
export async function nativeOperationStatus(repository,request,input){
 requireThat(input&&Object.keys(input).sort().join(',')==='operationId,resource'&&uuid(input.operationId)&&input.resource&&typeof input.resource==='object'&&!Array.isArray(input.resource)&&bytes(canonical(input.resource)).length<=1024,'NATIVE_OPERATION_STATUS_INVALID',400);
 const context=nativeRequestContext(request);requireThat(context&&!context.serviceProof,'ACADEMY_V2_RUNTIME_REQUIRED',403);
 const {runtime,cap}=context,meta=runtime.assertCapability(cap),r=input.resource,n=namespace(r,cap.binding.sub);
 const native=await runtime.native.draftGuard({runtime,request,cap,binding:cap.binding,rights:cap.rights,resource:r});
 requireThat(native&&typeof native.sql==='string'&&Array.isArray(native.args),'NATIVE_OPERATION_RESOURCE_REQUIRED',403);
 const primary=primaryWriteCondition({binding:cap.binding,app:runtime.app,env:runtime.config.env,now:runtime.clock(),kid:meta.kid});
 const guarded=async()=>{runtime.assertCapability(cap);requireThat(await runtime.store.first('SELECT 1 WHERE EXISTS('+primary.sql+') AND EXISTS('+native.sql+')',...primary.args,...native.args),'NATIVE_OPERATION_AUTHORITY_CHANGED',403);};
 await guarded();
 if(n.memorisationTasks){const ids=native.operationFacts?.taskIds;requireThat(Array.isArray(ids)&&ids.length>0&&ids.length<=100&&ids.every(x=>typeof x==='string'),'NATIVE_OPERATION_RESOURCE_REQUIRED',403);n.ordinary={sql:"json_type(r.result_json,'$.records')='array' AND json_array_length(r.result_json,'$.records')>0 AND NOT EXISTS(SELECT 1 FROM json_each(r.result_json,'$.records') item WHERE NOT EXISTS(SELECT 1 FROM json_each(?) allowed WHERE allowed.value=json_extract(item.value,'$.taskId') COLLATE BINARY))",args:[canonical(ids)]};}
 if(n.external){const result=await studioAccessOperationStatus(repository,request,input);await guarded();return result;}
 // Project only immutable completion facts. Never load or return the private
 // native saved DTO, receipt hash, contacts, answers or before/after snapshots.
 const target=n.target,note=n.note,ordinary=n.ordinary;
 const noteMatch="EXISTS(SELECT 1 FROM lesson_note_versions v JOIN lesson_note_entries n USING(note_id) WHERE v.version_id=json_extract(r.result_json,'$.versionId') AND v.note_id=json_extract(r.result_json,'$.noteId') AND n.activity_key=r.scope_key COLLATE NOCASE AND (? IS NULL OR n.note_id=? COLLATE BINARY) AND (? IS NULL OR n.container_id=? COLLATE BINARY) AND json_extract(v.source_json,'$.sessionKey')=? COLLATE BINARY AND json_extract(v.source_json,'$.date')=? COLLATE BINARY)";
 const matches=ordinary?ordinary.sql:note?noteMatch:target?"EXISTS(SELECT 1 FROM json_each(r.result_json,'$._acceptedChange.tables') t,json_each(t.value,'$.after') a WHERE json_extract(t.value,'$.table')=? AND json_extract(a.value,?)=? COLLATE NOCASE)":"1";
 const rows=(await repository.db.prepare("SELECT r.dataset_key,r.scope_key,json_extract(r.result_json,'$.acceptedChange') reference_json,json_type(r.result_json,'$._acceptedChange') change_type,json_extract(r.result_json,'$._acceptedHead') accepted_head,"+matches+" resource_matches FROM operation_receipts r WHERE r.actor_account_id=? COLLATE BINARY AND r.operation_id=? AND r.dataset_key IN(SELECT value FROM json_each(?)) AND r.scope_key=? COLLATE NOCASE LIMIT 2").bind(...ordinary?ordinary.args:note?[note.id,note.id,note.lesson,note.lesson,note.session,note.date]:target?[target.table,'$.row.'+target.column,target.value]:[],cap.binding.sub,input.operationId,canonical(n.datasets),n.scope).all()).results;
 await guarded();requireThat(rows.length<=1,'NATIVE_OPERATION_AMBIGUOUS',409);
 const missing={operationId:input.operationId,committed:false,acceptedChange:null,head:null,published:false};
 const row=rows[0];if(!row)return missing;
 requireThat(!(ordinary||note||row.change_type==='object')||Number(row.resource_matches)===1,'NATIVE_OPERATION_RESOURCE_MISMATCH',403);
 let reference=null;
 if(row.change_type==='object'){
  try{reference=JSON.parse(row.reference_json);}catch{requireThat(false,'NATIVE_OPERATION_RECEIPT_INVALID',503);}
  requireThat(reference&&Object.keys(reference).sort().join(',')==='dataset,operationId,scope'&&reference.dataset===row.dataset_key&&reference.scope===row.scope_key&&reference.operationId===input.operationId,'NATIVE_OPERATION_RECEIPT_INVALID',503);
 }
 const head=typeof row.accepted_head==='string'?row.accepted_head:null;
 return {operationId:input.operationId,committed:true,acceptedChange:reference,head,published:Boolean(reference&&head)};
}
export const nativeOperationStatusBoundary=Object.freeze({readOnly:true,missing:'UNKNOWN is not permission to resend.',authority:'Exact current native resource guard and same-primary full family/credential/lifecycle/key floors before and after an actor-bound bounded receipt read.',disclosure:'Only committed/accepted-reference/head; no native saved payload or private contact data.'});
