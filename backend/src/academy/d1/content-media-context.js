import {payloadHash} from '../../programs/timetable-model.js';
import {managementError as fail,same} from './management-store.js';
import {validDate,cleanText} from './assessment-store.js';
import {recordedOptions} from './lesson-recorded-options.js';
import {lessonContextRead} from './lesson-context-reads.js';
export const CONTENT_MEDIA_SCHEMA='ACADEMY_MEDIA_CONTEXT_V2';
export const contentMediaContext=row=>{const source=JSON.parse(row.source_lessons_json||'[]');return source.length===1&&source[0]?.schema===CONTENT_MEDIA_SCHEMA?source[0]:null;};
export const contentNoteKey=id=>JSON.stringify(['MEDIA',id]);
export const contentBoundSQL=alias=>`json_extract(${alias}.source_lessons_json,'$[0].schema')='${CONTENT_MEDIA_SCHEMA}'`;
export function contentMediaDto(row){const source=contentMediaContext(row);return source?{schema:source.schema,kind:source.binding,recordingDate:row.lesson_date,classIds:source.classIds||[],subject:source.recordedContext?.subject,teacherIds:source.recordedContext?.teacherIds||[],teacherRequired:true,attributionSource:'NATIVE_TEACHER_ACCOUNT',noteKey:contentNoteKey(row.lesson_id)}:null;}
export async function contentMediaOptions(repository,activity,{classId='',actor,epoch,owner=null,surahsAvailable=false}={}){
 const db=repository.db,key=activity.activity_key;if(owner&&['STUDIO','FROZEN'].includes(owner.state))throw fail('This offering’s media is managed by its native Studio owner.',409,'STUDIO_MEDIA_MANAGED');
 const [subjects,modules,teachers]=activity.kind==='COURSE'?[[],[],(await lessonContextRead(db,'teachers',key).all()).results]:await recordedOptions(db,key),classes=activity.kind==='PROGRAM'?(await lessonContextRead(db,'classes',key).all()).results:[],surahs=activity.kind==='PROGRAM'&&surahsAvailable?(await lessonContextRead(db,'surahs',key).all()).results:[];
 if(classes.length>200||surahs.length>200||subjects.length>400||modules.length>400||teachers.length>200)throw fail('Choose a smaller media curriculum or Teacher scope.',409,'CONTEXT_OPTIONS_LIMIT');
 if(activity.kind==='COURSE'&&classId)throw fail('Course media attaches directly to the Course.');
 const selected=classId?classes.find(c=>same(c.class_id,classId)):null;if(classId&&!selected)throw fail('Choose an active native class in this Programme.');
 const choices=activity.kind==='COURSE'?[{key:'COURSE:'+activity.activity_id,courseId:activity.activity_id,name:activity.name}]:[...subjects.map(s=>({key:'SUBJECT:'+s.program_subject_id,programSubjectId:s.program_subject_id,moduleId:'',name:s.name})),...modules.map(m=>({key:'MODULE:'+m.module_id,moduleId:m.module_id,programSubjectId:m.program_subject_id||'',name:m.name})),...surahs.map(s=>({key:'SURAH:'+s.surah_id,surahId:s.surah_id,name:s.name}))];
 const result={schema:CONTENT_MEDIA_SCHEMA,activityKey:key,kind:activity.kind,classes:classes.map(c=>({id:c.class_id,name:c.name,academicYear:c.academic_year||''})),classId:selected?.class_id||'',subjects:choices,teachers:teachers.map(t=>({id:t.account_id,name:t.display_name})),teacherRequired:true,timetableRequired:false};
 return {...result,optionsRevision:await payloadHash([result,actor,epoch,owner?.state||'ACADEMY',owner?.generation||0])};
}
export async function selectedContentMedia(activity,options,input,actor){
 if(input.optionsRevision!==options.optionsRevision)throw fail('Native media choices changed. Refresh the selectors before creating the draft.',409,'CONTEXT_OPTIONS_CHANGED');
 if(!validDate(input.recordingDate))throw fail('Choose the recording date.');
 const klass=activity.kind==='PROGRAM'?options.classes.find(c=>same(c.id,input.classId)):null;if(activity.kind==='PROGRAM'&&!klass)throw fail('Choose a native class for this Programme.');
 const subject=options.subjects.find(s=>s.key===(activity.kind==='COURSE'?'COURSE:'+activity.activity_id:input.subjectKey)),ids=input.teacherIds;
 if(!subject||!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids.map(id=>String(id).toUpperCase())).size!==ids.length||ids.some(id=>typeof id!=='string'||!options.teachers.some(t=>same(t.id,id))))throw fail('Choose the native subject and registered Teacher account(s).');
 const selected=ids.map(id=>options.teachers.find(t=>same(t.id,id))).sort((a,b)=>a.id.localeCompare(b.id)),id='LM-CONTENT-'+await payloadHash([activity.activity_key,input.operationId]);
 const context={schema:CONTENT_MEDIA_SCHEMA,binding:activity.kind==='PROGRAM'?'PROGRAMME_SUBJECT':'COURSE',activityKey:activity.activity_key,recordingDate:input.recordingDate,date:input.recordingDate,classIds:klass?[klass.id]:[],classNames:klass?[klass.name]:[],title:subject.name,attributionSource:'NATIVE_TEACHER_ACCOUNT',recordedContext:{schema:'RECORDED_LESSON_CONTEXT_V1',subject,teacherIds:selected.map(t=>t.id),teacherName:selected.map(t=>t.name).join(', '),teachers:selected.map(t=>({id:t.id,name:t.name})),reason:'Initial native recorded context',changedBy:actor,changedAt:new Date().toISOString()}};
 return {lesson_id:id,activity_key:activity.activity_key,class_id:klass?.id||null,lesson_date:input.recordingDate,title:cleanText(input.title||subject.name,180,'a media title'),start_time:'',end_time:'',teacher_id:null,teacher_name:'',teacher_ids_json:'[]',source_publication_id:null,source_lessons_json:JSON.stringify([context]),session_key:null,run_id:'',media_scope:'SESSION',isNew:true,contentInput:true};
}
// Run after the lesson mutation so the split planner evaluates this guard in
// the final Core commit, preserving native ownership and current references.
export function contentMediaGuard(row,{ownershipAvailable=false,previous=null}={}){
 const source=contentMediaContext(row);if(!source)return null;const subject=source.recordedContext.subject,ids=source.recordedContext.teacherIds,old=contentMediaContext(previous||{})?.recordedContext.teacherIds||[],values=[row.activity_key,source.binding==='COURSE'?'COURSE':'PROGRAM'],clauses=["EXISTS(SELECT 1 FROM activities WHERE activity_key=? AND kind=? AND active=1 AND lifecycle='ACTIVE')"];
 if(source.binding==='PROGRAMME_SUBJECT'){clauses.push('EXISTS(SELECT 1 FROM classes WHERE activity_key=? AND class_id=? AND active=1)');values.push(row.activity_key,row.class_id);}
 if(subject.moduleId){clauses.push('EXISTS(SELECT 1 FROM modules m WHERE m.activity_key=? AND m.module_id=? AND coalesce(m.program_subject_id,\'\')=? AND m.active=1 AND (m.program_subject_id IS NULL OR EXISTS(SELECT 1 FROM program_subjects ps JOIN subject_catalog c USING(subject_key) WHERE ps.activity_key=m.activity_key AND ps.program_subject_id=m.program_subject_id AND ps.active=1 AND c.active=1)) AND (m.level_id IS NULL OR EXISTS(SELECT 1 FROM program_levels pl WHERE pl.activity_key=m.activity_key AND pl.level_id=m.level_id AND pl.active=1)))');values.push(row.activity_key,subject.moduleId,subject.programSubjectId||'');}
 else if(subject.programSubjectId){clauses.push('EXISTS(SELECT 1 FROM program_subjects ps JOIN subject_catalog c USING(subject_key) WHERE ps.activity_key=? AND ps.program_subject_id=? AND ps.active=1 AND c.active=1)');values.push(row.activity_key,subject.programSubjectId);}
 else if(subject.surahId){clauses.push('EXISTS(SELECT 1 FROM program_surahs WHERE activity_key=? AND surah_id=? AND active=1)');values.push(row.activity_key,subject.surahId);}
 clauses.push("NOT EXISTS(SELECT 1 FROM json_each(?) chosen WHERE NOT EXISTS(SELECT 1 FROM json_each(?) original WHERE original.value=chosen.value COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.account_id=chosen.value COLLATE NOCASE AND a.active=1 AND (EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.activity_key=? AND r.account_id=a.account_id AND r.role='TEACHER') OR EXISTS(SELECT 1 FROM academy_teacher_designations t WHERE t.account_id=a.account_id AND t.active=1))))");values.push(JSON.stringify(ids),JSON.stringify(old),row.activity_key);
 if(ownershipAvailable){clauses.push("NOT EXISTS(SELECT 1 FROM main.website_platform_access_ownership WHERE activity_key=? AND state IN('STUDIO','FROZEN'))");values.push(row.activity_key);}
 return {sql:clauses.map(c=>'('+c+')').join(' AND '),values};
}
