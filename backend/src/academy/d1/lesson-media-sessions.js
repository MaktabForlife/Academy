import {publishedSessionRange} from './published-sessions.js';
import {managementError as fail,same} from './management-store.js';
import {validDate} from './assessment-store.js';
import {addDays} from '../entrance.js';
import {scheduledLessons} from '../../programs/attendance-model.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {historicalPublications} from './historical-timetable.js';

// Resolve only the selected learning area's saved/published sessions. Client
// supplied dates, teachers and class names never become authoritative media data.
export async function mediaSessions(repository,activity,input,actor,admin){
 const p=(sql,...v)=>repository.db.prepare(sql).bind(...v);
 if(repository.features?.mediaSeparation){
  const result=await publishedSessionRange(repository,activity,input.startDate,input.endDate,{runId:input.runId||''}),map=new Map();
  for(const row of result.lessons){const key=activity.kind==='PROGRAM'?JSON.stringify(['PROGRAM',row.date,row.sourceAnchor||row.anchor]):JSON.stringify(['COURSE',row.runId,row.sourceSessionId]);
   if(!map.has(key))map.set(key,{sessionKey:key,date:row.date,title:row.moduleName||row.subjectName||activity.name,startTime:row.startTime,endTime:row.endTime,classIds:[],classNames:[],teacherIds:row.teacherIds,teacherName:row.teacherNames.join(', '),publicationId:row.publicationId,sourceSessionId:row.sourceSessionId||row.sourceAnchor||row.anchor,sourceAnchor:row.sourceAnchor||row.anchor,runId:row.runId||'',timezone:row.timezone});
   const session=map.get(key);for(const [i,id] of row.classIds.entries())if(!session.classIds.includes(id)){session.classIds.push(id);session.classNames.push(row.classNames[i]);}
  }
  const rows=[...map.values()].filter(r=>admin||r.teacherIds.some(id=>same(id,actor)));if(rows.length>400)throw fail('Choose a shorter session period.');
  const runs=result.runs.map(r=>({id:r.run_id,name:r.name,stage:r.stage})),runId=input.runId||(input.allRuns?'':runs[0]?.id)||'';
  return {sessions:await Promise.all(rows.filter(r=>activity.kind==='PROGRAM'||!runId||r.runId===runId).map(async r=>({...r,sessionVersion:await payloadHash(r)}))),runs,runId};
 }

 let sessions=[],runs=[],runId='';
 if(activity.kind==='PROGRAM'){
  if(!validDate(input.startDate)||!validDate(input.endDate)||input.endDate<input.startDate||input.endDate>addDays(input.startDate,30))throw fail('Choose a session period of up to 31 days.');
  const publications=(await p("SELECT * FROM timetable_publications WHERE activity_key=? AND pattern IN ('WEEKLY','DATED') AND effective_from<=? ORDER BY version_no DESC LIMIT 201",activity.activity_key,input.endDate).all()).results;
  if(publications.length>200)throw fail('This timetable history needs a narrower publication query.',409);
  const historical=await historicalPublications(repository,input.startDate,input.endDate);
  const rows=[...publications,...historical.filter(r=>same(r.activity_key,activity.activity_key))].map(r=>({PublicationID:r.publication_id,VersionNo:r.version_no,SnapshotJSON:r.snapshot_json,PublishedDate:r.published_at}));
  for(let date=input.startDate;date<=input.endDate;date=addDays(date,1))for(const row of scheduledLessons(rows,{id:activity.activity_id},date)){
   sessions.push({sessionKey:JSON.stringify(['PROGRAM',date,row.anchor]),date,title:row.moduleName||row.subjectName||activity.name,startTime:row.startTime,endTime:row.endTime,classIds:row.classIds,classNames:row.classNames,teacherIds:row.teacherIds,teacherName:row.teacherNames.join(', '),publicationId:row.publicationId,sourceSessionId:row.anchor,runId:''});
  }
 }else{
  if(input.runId!==undefined&&(typeof input.runId!=='string'||input.runId.length>160))throw fail('Choose a Course offering.');
  const records=(await p('SELECT run_id,details_json,stage FROM course_management_drafts WHERE activity_key=? ORDER BY updated_at DESC LIMIT 100',activity.activity_key).all()).results;
  const deliveries=(await p('SELECT run_id,name FROM course_runs WHERE activity_key=? ORDER BY start_date DESC LIMIT 100',activity.activity_key).all()).results;
  runs=[...new Map([...records.map(r=>({id:r.run_id,name:JSON.parse(r.details_json).name||activity.name,stage:r.stage})),...deliveries.map(r=>({id:r.run_id,name:r.name||activity.name,stage:''}))].map(r=>[r.id,r])).values()];
  runId=input.runId||runs[0]?.id||'';
  if(runId&&!runs.some(r=>same(r.id,runId)))throw fail('Choose an existing Course offering.',404);
  const draft=records.find(r=>same(r.run_id,runId));
  if(draft&&['CANCELLED','ARCHIVED'].includes(draft.stage))return {sessions:[],runs,runId};
  const rows=draft?JSON.parse(draft.details_json).sessions:(await p(`SELECT session_id id,session_date date,start_time startTime,end_time endTime,teacher_account_id teacherId,description title FROM course_draft_sessions WHERE activity_key=? AND run_id=? AND session_kind='LESSON' ORDER BY session_date,start_time LIMIT 401`,activity.activity_key,runId).all()).results;
  if(!Array.isArray(rows)||rows.length>400)throw fail('Use up to 400 saved Course sessions.',409);
  const teachers=(await p('SELECT account_id,display_name FROM accounts WHERE account_id IN (SELECT value FROM json_each(?))',JSON.stringify([...new Set(rows.map(r=>r.teacherId).filter(Boolean))])).all()).results;
  sessions=rows.filter(r=>r.status!=='CANCELLED'&&validDate(r.date)).map(r=>({sessionKey:JSON.stringify(['COURSE',runId,r.id]),date:r.date,title:r.title||activity.name,startTime:r.startTime,endTime:r.endTime,classIds:[],classNames:[],teacherIds:[r.teacherId].filter(Boolean),teacherName:teachers.find(t=>same(t.account_id,r.teacherId))?.display_name||'',publicationId:null,sourceSessionId:r.id,runId}));
 }
 sessions=sessions.filter(r=>admin||r.teacherIds.some(id=>same(id,actor))).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.sessionKey.localeCompare(b.sessionKey));
 if(sessions.length>400)throw fail('Choose a shorter session period.');
 return {sessions:await Promise.all(sessions.map(async r=>({...r,sessionVersion:await payloadHash(r)}))),runs,runId};
}
