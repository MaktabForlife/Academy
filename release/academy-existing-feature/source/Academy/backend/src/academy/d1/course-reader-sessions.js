import {d1Entrance} from './entrance.js';
import {viewedClass} from './workspace-access.js';
import {validDate} from './assessment-store.js';

// Read the current accepted publications for this course, then reuse the normal
// account/class timetable projection. No draft or meeting URL reaches the reader.
export async function courseReaderSessions(repository,auth,activity,{entrance=d1Entrance}={}){
 const classId=viewedClass(auth,activity.activity_key)||'';
 const range=await repository.db.prepare(`SELECT min(json_extract(s.value,'$.SessionDate')) start_date,max(json_extract(s.value,'$.SessionDate')) end_date
  FROM course_runs r JOIN course_run_state rs USING(activity_key,run_id)
  JOIN timetable_publications p ON p.activity_key=r.activity_key AND p.publication_id=rs.current_publication_id
  JOIN json_each(p.snapshot_json,'$.sessions') s
  WHERE r.activity_key=? AND r.active=1 AND rs.stage IN ('PUBLISHED','ACTIVE')
  AND (?='' OR r.run_id=? COLLATE NOCASE) AND coalesce(json_extract(s.value,'$.SessionKind'),'LESSON')<>'BREAK'`)
  .bind(activity.activity_key,classId,classId).first();
 if(!range?.start_date||!range.end_date)return {sessions:[]};
 const days=(Date.parse(range.end_date)-Date.parse(range.start_date))/86400000+1;
 if(!validDate(range.start_date)||!validDate(range.end_date)||!Number.isInteger(days)||days<1||days>366)return {sessions:[],unavailable:true};
 const data=await entrance(repository,auth.state,auth.user,{kind:'COURSE',id:activity.activity_id,startDate:range.start_date},undefined,{days,detailed:true,auth});
 if(!data.activity||data.activity.unavailable)return {sessions:[],unavailable:true};
 const sessions=(data.personalTimetable||[]).filter(row=>row.kind==='COURSE'&&String(row.activityId).toUpperCase()===String(activity.activity_id).toUpperCase())
  .map(({joinUrl:_,...row})=>row);
 return {sessions,timezone:data.timezone};
}
