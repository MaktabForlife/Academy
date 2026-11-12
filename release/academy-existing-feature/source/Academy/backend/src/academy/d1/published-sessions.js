import {calendarFacts,holidaySettings} from './published-facts-cache.js';
import {scheduledLessons,classLesson} from '../../programs/attendance-model.js';
import {same,managementError as fail} from './management-store.js';
import {validDate} from './assessment-store.js';
import {noTeachingCalendarEvents,holidayOnDate} from './calendar-holidays.js';

// Accepted dated teaching facts, shared by attendance and narrow contributions.
// Editor sessions, draft JSON and caller-supplied teachers are never a source.
export const publishedSessions=async(repository,activity,date,options={})=>{const result=await publishedSessionRange(repository,activity,date,date,options);return {lessons:result.lessons,runs:result.runs};};
export async function publishedSessionFacts(repository,activityKeys){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),keys=JSON.stringify(activityKeys);
 const [result,facts]=await Promise.all([db.batch([
  p('SELECT * FROM classes WHERE activity_key IN(SELECT value FROM json_each(?)) AND active=1',keys),
  p('SELECT p.*,l.status publication_lifecycle FROM timetable_publications p LEFT JOIN program_publication_lifecycle l USING(activity_key,publication_id) WHERE p.activity_key IN(SELECT value FROM json_each(?)) ORDER BY p.version_no',keys),
  p('SELECT r.*,s.stage,s.current_publication_id FROM course_runs r JOIN course_run_state s USING(activity_key,run_id) WHERE r.activity_key IN(SELECT value FROM json_each(?))',keys),
  p('SELECT * FROM lesson_lifecycle WHERE activity_key IN(SELECT value FROM json_each(?))',keys)
 ]),calendarFacts(repository)]);
 const [classes,publications,runs,lifecycles]=result.map(r=>r.results),{calendar,suppressions}=facts,settings=holidaySettings(facts);
 return new Map(activityKeys.map(key=>[key.toUpperCase(),{classes:classes.filter(r=>same(r.activity_key,key)),publications:publications.filter(r=>same(r.activity_key,key)),runs:runs.filter(r=>same(r.activity_key,key)),lifecycles:lifecycles.filter(r=>same(r.activity_key,key)),calendar,suppressions,settings}]));
}
export async function publishedSessionRange(repository,activity,startDate,endDate,{runId='',maxDays=31,classId='',facts=null}={}){
 const date=startDate;
 if(!validDate(startDate)||!validDate(endDate)||endDate<startDate||Date.parse(endDate)-Date.parse(startDate)>Math.min(maxDays,366)*86400000)throw fail('Choose a valid bounded session period.');
 const {classes,publications,runs,lifecycles,calendar,suppressions,settings}=facts||(await publishedSessionFacts(repository,[activity.activity_key])).get(activity.activity_key.toUpperCase());
 function dated(date){
 if(holidayOnDate(noTeachingCalendarEvents({calendar,suppressions,settings},date,date,activity.activity_key),date))return {lessons:[],runs};
 if(activity.kind==='PROGRAM'){
  const source=publications.map(p=>({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,PublishedDate:p.published_at,Lifecycle:p.publication_lifecycle||''}));
  const lessons=scheduledLessons(source,{id:activity.activity_id},date).flatMap(lesson=>lesson.classIds.flatMap((id,i)=>{
   if(classId&&!same(id,classId))return [];
   const klass=classes.find(c=>same(c.class_id,id));if(!klass)return [];
   const scoped=classLesson(lesson,id,klass.name||lesson.classNames[i]);
   return [{...scoped,runId:'',timezone:publications.find(p=>same(p.publication_id,lesson.publicationId)).timezone,stableKey:JSON.stringify(['PROGRAM',lesson.ruleId||lesson.anchor,id])}];
  }));
  return {lessons,runs:[]};
 }
 const lessons=[];
 for(const run of runs.filter(r=>(!runId||same(r.run_id,runId))&&(!classId||same(r.run_id,classId))&&r.stage!=='CANCELLED'&&r.current_publication_id)){
  const publication=publications.find(p=>same(p.publication_id,run.current_publication_id));if(!publication)throw fail('The accepted Course timetable is incomplete.',503,'SETUP_COMPONENT_MISSING');
  const snapshot=JSON.parse(publication.snapshot_json);
  for(const row of snapshot.sessions||[]){
   const source=row.SourceSessionID||row.PublishedSessionID;
   if(row.SessionDate!==date||row.SessionKind==='BREAK'||lifecycles.some(l=>same(l.publication_id,publication.publication_id)&&same(l.source_session_id,source)&&['CANCELLED','REPLACED'].includes(l.status)))continue;
   lessons.push({publicationId:publication.publication_id,anchor:source,sourceAnchor:row.PublishedSessionID||source,sourceSessionId:source,ruleId:source,date,runId:run.run_id,runName:run.name,
    moduleId:row.ModuleID||'',moduleName:row.ModuleName||row.SessionDescription||run.name,subjectId:activity.activity_id,subjectName:row.SubjectName||'',startTime:row.StartTime,endTime:row.EndTime,
    teacherId:row.TeacherAccountID||'',teacherName:row.TeacherName||'',teacherIds:[row.TeacherAccountID].filter(Boolean),teacherNames:[row.TeacherName].filter(Boolean),
    classId:run.run_id,classIds:[run.run_id],classNames:[run.name],className:run.name,timezone:row.Timezone||run.timezone,stableKey:JSON.stringify(['COURSE',run.run_id,source])});
  }
 }
 return {lessons:lessons.sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.anchor.localeCompare(b.anchor)),runs};
 }
 const lessons=[];for(let date=startDate;date<=endDate;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10))lessons.push(...dated(date).lessons);return {lessons,runs};
}
