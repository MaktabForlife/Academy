import {publicationRecord,publicationSchedule} from '../../../programs/weekly-timetable.js';
import {resolveCurrentPublishedGlobalTimetable} from '../../../lib/global-timetable.js';
import {addDays,lessonTimes} from '../../entrance.js';
import {currentProgramZoom,programZoomKey} from '../program-zoom.js';
import {noTeachingCalendarEvents,holidayOnDate} from '../calendar-holidays.js';
import {annualKey} from '../calendar-annual.js';
import {sha256} from './protocol.mjs';
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const bounded=(rows,max,label)=>{if(rows.length>max)throw Error(label);return rows;};
const zoom=value=>{if(!value)return '';const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='zoom.us'||u.hostname.endsWith('.zoom.us')))throw Error('UNSUPPORTED_ZOOM_HOST');return u.href;};
export const projectedSessionId=async key=>'ws-'+await sha256(JSON.stringify(key));
// Reuse the exact native media-session anchor used by the projector. The
// reference is routing metadata; Target still checks its current paid/live gate.
export async function dashboardStudioSessionId(activityKey,mediaSessionKey,date){
 let key;try{key=JSON.parse(mediaSessionKey);}catch{return null;}
 if(!Array.isArray(key)||key.length!==3||typeof activityKey!=='string')return null;
 if(key[0]==='PROGRAM'&&activityKey.startsWith('PROGRAM:')&&key[1]===date&&typeof key[2]==='string'&&key[2].length<=2000)return projectedSessionId(['PROGRAM',activityKey,date,key[2]]);
 if(key[0]==='COURSE'&&activityKey.startsWith('COURSE:')&&key.slice(1).every(v=>typeof v==='string'&&v.length>0&&v.length<=180))return projectedSessionId(['COURSE',activityKey,key[1],key[2]]);
 return null;
}
// Only current and scheduled publications for one explicitly mapped offering.
// Visitors, rosters, payment registers and historical publication bodies are absent.
export async function projectTimetable(db,scope,{now=Date.now()}={}){
 const activity=await db.prepare(`SELECT a.activity_key,a.activity_id,a.kind,COALESCE(h.title,NULLIF(n.published_title,''),a.name) name,a.active,a.lifecycle,h.registration_id completed_registration FROM activities a LEFT JOIN website_platform_completed_courses h USING(activity_key) LEFT JOIN website_platform_new_courses n USING(activity_key) WHERE a.activity_key=?`).bind(scope.activity_key).first();
 if(!activity)throw Error('SOURCE_OFFERING_MISSING');
 const start=addDays(new Date(now).toISOString().slice(0,10),-1),end=addDays(start,57),sessions=[];
 if(activity.kind==='COURSE'&&scope.kind!=='COURSE'||activity.kind==='PROGRAM'&&scope.kind==='COURSE')throw Error('INVALID_OFFERING_MAPPING');
 const event={type:'timetable',mode:'snapshot',offering:{id:scope.offering_id,kind:scope.kind,title:activity.name,active:true},sessions};
 // Source retirement stops live delivery, never a former purchaser's retained material rights.
 if(activity.completed_registration||!activity.active||activity.lifecycle!=='ACTIVE')return event;
 const calendar=bounded(await all(db,"SELECT * FROM academy_calendar_events WHERE scope_key IN ('ACADEMY',?) AND teaching_impact='NO_TEACHING' AND active=1 AND start_date<=? LIMIT 501",activity.activity_key,end),500,'CALENDAR_SCOPE_TOO_LARGE');
 const settings=await all(db,'SELECT * FROM academy_settings WHERE setting_key IN(SELECT value FROM json_each(?))',JSON.stringify([...new Set(calendar.map(annualKey))]));
 const suppressions=await all(db,'SELECT * FROM academy_calendar_suppressions WHERE calendar_date>=? AND calendar_date<=?',start,end);
 const holidays=noTeachingCalendarEvents({calendar,suppressions,settings},start,end,activity.activity_key);
 const classLabels=new Map();
 const append=async(key,title,date,startTime,endTime,timezone,meeting,cancelled=false,classIds=[],teacherIds=[])=>{
  const times=lessonTimes({date,startTime,endTime,timezone});if(!Number.isSafeInteger(times.startsAt)||!Number.isSafeInteger(times.endsAt)||times.endsAt<=times.startsAt)throw Error('INVALID_PUBLISHED_CLOCK');
  const off=Boolean(cancelled||holidayOnDate(holidays,date));sessions.push({id:await projectedSessionId(key),title,startsAt:times.startsAt,endsAt:times.endsAt,timezone,classes:classIds.map(id=>({id,label:classLabels.get(id)||null})),zoomUrl:off?'':zoom(meeting),cancelled:off,classIds,teacherIds});
  bounded(sessions,200,'TIMETABLE_WINDOW_TOO_LARGE');
 };
 if(activity.kind==='PROGRAM'){
  const select=`SELECT p.*,COALESCE(l.status,'') lifecycle FROM timetable_publications p LEFT JOIN program_publication_lifecycle l ON l.activity_key=p.activity_key AND l.publication_id=p.publication_id WHERE p.activity_key=? AND p.scope_key=?`;
  const base=await all(db,select.replace('timetable_publications p','timetable_publications p INDEXED BY website_platform_program_versions')+' AND p.effective_from<=? ORDER BY p.version_no DESC LIMIT 1',activity.activity_key,activity.activity_key,start);
  const future=bounded(await all(db,select+' AND p.effective_from>? AND p.effective_from<=? AND p.version_no>? ORDER BY p.effective_from LIMIT 51',activity.activity_key,activity.activity_key,start,end,base[0]?.version_no||0),50,'TOO_MANY_SCHEDULED_PUBLICATIONS');
  const history=[...base,...future].map(p=>publicationRecord({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,Lifecycle:p.lifecycle}, {id:activity.activity_id})).map((p,i)=>({...p,sourceTimezone:[...base,...future][i].timezone}));
  const classIds=[...new Set(history.flatMap(p=>p.occurrences.flatMap(r=>r.classIds||[])))];
  const classes=await all(db,'SELECT class_id,name,zoom_link FROM classes WHERE activity_key=? AND class_id IN(SELECT value FROM json_each(?))',activity.activity_key,JSON.stringify(classIds));
  for(const c of classes)if(c.name)classLabels.set(c.class_id,c.name);
  const override=await db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').bind(programZoomKey(activity.activity_key)).first('setting_value');
  for(let date=start;date<=end;date=addDays(date,1)){
   const chosen=publicationSchedule(history,date),pub=history.find(p=>p.id===chosen.currentPublicationId);if(!pub)continue;
   for(const row of pub.occurrences){if(row.kind==='BREAK'||!(pub.pattern==='WEEKLY'?row.weekday===new Date(date+'T12:00:00Z').getUTCDay():row.date===date))continue;
    await append(['PROGRAM',activity.activity_key,date,row.anchor],row.moduleName||row.subjectName||activity.name,date,row.startTime,row.endTime,pub.snapshot.timezone||pub.sourceTimezone,currentProgramZoom(override??undefined,row,pub,classes),row.status==='CANCELLED',row.classIds||[],row.teacherIds||[row.teacherId].filter(Boolean));
   }
  }
 }else if(activity.kind==='COURSE'){
  const runs=bounded(await all(db,`SELECT s.*,p.snapshot_json FROM course_runs r JOIN course_run_state s USING(activity_key,run_id) JOIN timetable_publications p ON p.activity_key=s.activity_key AND p.publication_id=s.current_publication_id WHERE r.activity_key=? AND r.active=1 LIMIT 51`,activity.activity_key),50,'TOO_MANY_CURRENT_RUNS');
  const lifecycles=await all(db,'SELECT * FROM lesson_lifecycle WHERE activity_key=? AND publication_id IN(SELECT value FROM json_each(?))',activity.activity_key,JSON.stringify(runs.map(r=>r.current_publication_id)));
  for(const run of runs){const snapshot=JSON.parse(run.snapshot_json),resolved=resolveCurrentPublishedGlobalTimetable({GlobalTimetableRunState:[{RunID:run.run_id,Stage:run.stage,CurrentPublicationID:run.current_publication_id}],GlobalTimetablePublications:[snapshot.publication],PublishedGlobalTimetableSessions:snapshot.sessions,GlobalTimetableSessionLifecycle:lifecycles.map(l=>({SessionLifecycleID:l.lifecycle_id,SessionID:l.source_session_id,PublicationID:l.publication_id,Status:l.status,RescheduledFromSessionID:l.previous_source_session_id||'',RescheduledToSessionID:l.replacement_source_session_id||''}))},run.run_id,{startDate:start,endDate:end});
   if(!resolved.ok)throw Error('INVALID_CURRENT_COURSE_PUBLICATION');
   const states=new Map(resolved.lifecycles.map(l=>[l.sessionid.toUpperCase(),l.status]));
   for(const s of resolved.sessions)await append(['COURSE',activity.activity_key,run.run_id,s.sourcesessionid],s.sessiondescription||s.modulename||s.runname,s.sessiondate,s.starttime,s.endtime,s.timezone,s.zoomlink,states.get(s.sourcesessionid.toUpperCase())!=='SCHEDULED',[],[s.teacheraccountid].filter(Boolean));
  }
 }else throw Error('UNSUPPORTED_SOURCE_KIND');
 if(new Set(sessions.map(s=>s.id)).size!==sessions.length)throw Error('DUPLICATE_SOURCE_SESSION');
 if(new TextEncoder().encode(JSON.stringify(event)).length>240_000)throw Error('TIMETABLE_PAYLOAD_TOO_LARGE');
 return event;
}
export async function queueTimetables(db,{limit=2,now=Date.now()}={}){
 const scopes=await all(db,'SELECT * FROM website_platform_timetable_scopes WHERE next_attempt<=? ORDER BY next_attempt,activity_key LIMIT ?',now,Math.max(1,Math.min(4,limit)));
 for(const scope of scopes){try{
  // Keep at most one unacknowledged timetable per scope. New source edits
  // remain dirty and coalesce until its exact predecessor is acknowledged.
  if(await db.prepare('SELECT 1 FROM website_platform_outbox WHERE stream=? AND acknowledged=0 ORDER BY version LIMIT 1').bind('timetable:'+scope.offering_id).first())continue;
  let event,problem=null;
  try{event=await projectTimetable(db,scope,{now});}catch(error){
   // Invalid/oversized facts must close live joining instead of leaving an old
   // meeting usable. Retained content rights are untouched; retry is bounded.
   if(error.message==='INVALID_OFFERING_MAPPING')throw error;
   const title=await db.prepare('SELECT name FROM activities WHERE activity_key=?').bind(scope.activity_key).first('name');if(!title)throw error;
   problem=/^[A-Z_]+$/.test(error.message)?error.message:'INVALID_SOURCE_FACTS';event={type:'timetable',mode:'snapshot',offering:{id:scope.offering_id,kind:scope.kind,title,active:true},sessions:[]};
  }
  const stream='timetable:'+scope.offering_id,guard=crypto.randomUUID();
  // Dirty revision is rechecked atomically: a publication/Zoom/calendar change
  // during projection cannot be acknowledged as the newer source revision.
  await db.batch([
   db.prepare('INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_timetable_scopes WHERE activity_key=? AND revision=? AND (SELECT enabled FROM website_platform_control WHERE singleton=1)=1))').bind(guard,scope.activity_key,scope.revision),
   db.prepare('INSERT INTO website_platform_streams VALUES(?,1) ON CONFLICT(stream) DO UPDATE SET version=version+1').bind(stream),
   db.prepare('INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT ?,stream,version,? FROM website_platform_streams WHERE stream=?').bind(crypto.randomUUID(),JSON.stringify(event),stream),
   db.prepare('UPDATE website_platform_timetable_scopes SET exported_revision=revision,next_attempt=?,attempts=0,last_error=? WHERE activity_key=?').bind(now+(problem?300_000:86400_000),problem,scope.activity_key),
   db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard)
  ]);
 }catch(error){await db.prepare('UPDATE website_platform_timetable_scopes SET attempts=attempts+1,next_attempt=?,last_error=? WHERE activity_key=? AND revision=?').bind(now+Math.min(3600_000,5000*2**Math.min(scope.attempts,9)),/^[A-Z_]+$/.test(error.message)?error.message:'PROJECTION_RETRY',scope.activity_key,scope.revision).run();}}
}
