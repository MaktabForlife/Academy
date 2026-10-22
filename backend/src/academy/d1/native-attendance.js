import {attendanceAdmin} from './attendance-admin.js';
import {attendanceStore,attendanceGeneration} from './attendance-store.js';
import {publishedSessions} from './published-sessions.js';
import {academyDate,appTimezone,dayStart} from './academy-clock.js';
import {assessmentRolesSQL,validDate} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';
import {isAdminWorkspace,administers,actualRole} from './workspace-access.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {dayView} from '../../programs/attendance-model.js';
import {insertRecords} from './insert-records.js';

const byId=rows=>new Map(rows.map(r=>[r.accountId,r]));
const sorted=rows=>rows.sort((a,b)=>a.accountId.localeCompare(b.accountId));
const canSubstitute=(grant,lesson,correction,now)=>same(grant.activity_key,lesson.activityKey)&&grant.attendance_date===lesson.date&&grant.stable_key===lesson.stableKey&&!grant.revoked_at&&grant.starts_at<=now&&(correction?[grant.correction_until,grant.correction_reopen_until||''].sort().at(-1):grant.first_until)>now;

export function nativeAttendance(repository,auth,now=()=>new Date()){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
 async function activity(input){
  const key=input.activityKey||'PROGRAM:'+String(input.id||'');
  if(typeof key!=='string'||key.length>200||!/^(PROGRAM|COURSE):[^:]+$/i.test(key))throw fail('Choose a Program or Course.');
  const row=await p("SELECT * FROM activities WHERE activity_key=? COLLATE NOCASE AND active=1 AND lifecycle='ACTIVE'",key).first();
  if(!row)throw fail('This learning area is unavailable.',403,'FORBIDDEN');return row;
 }
 async function options(){
  if(auth.workspace==='LEARN')throw fail('Open Teach or Admin for attendance.',403,'TEACH_WORKSPACE_REQUIRED');
  const rows=(await p("SELECT activity_key,activity_id,kind,name FROM activities WHERE active=1 AND lifecycle='ACTIVE' ORDER BY name").all()).results;
  const grants=(await p("SELECT * FROM attendance_substitutes WHERE account_id=? AND revoked_at IS NULL AND starts_at<=? AND max(correction_until,coalesce(correction_reopen_until,''))>?",actor,now().toISOString(),now().toISOString()).all()).results;
  return {generation:attendanceGeneration,store:'D1',programs:rows.filter(a=>isAdminWorkspace(auth)?administers(auth,a.activity_key):actualRole(auth,a.activity_key,'TEACHER')||administers(auth,a.activity_key)||grants.some(g=>same(g.activity_key,a.activity_key))).map(a=>({id:a.activity_id,kind:a.kind,activityKey:a.activity_key,name:a.name,role:isAdminWorkspace(auth)?'PROGRAM_ADMIN':actualRole(auth,a.activity_key,'TEACHER')?'TEACHER':grants.some(g=>same(g.activity_key,a.activity_key))?'SUBSTITUTE':'TEACHER'}))};
 }
 async function load(a,date){
  const timezone=await appTimezone(repository),today=academyDate(now(),timezone),scope=a.activity_key;
  if(!validDate(date||today))throw fail('Choose a valid attendance date.');date ||=today;
  const store=attendanceStore(repository,auth,a),schedule=await publishedSessions(repository,a,date),result=await db.batch([
   p('SELECT * FROM attendance_days WHERE activity_key=? COLLATE NOCASE AND attendance_date=?',scope,date),
   p(`SELECT c.*,s.stable_key,s.latest_version_id,v.absence_count,v.submitted_at,v.submitted_by FROM attendance_day_contexts c JOIN attendance_series s USING(series_id) JOIN attendance_days d USING(day_id) LEFT JOIN attendance_register_versions v ON v.version_id=s.latest_version_id WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date=?`,scope,date),
   p(`SELECT DISTINCT m.* FROM attendance_roster_members m JOIN attendance_day_contexts c USING(roster_id) JOIN attendance_days d USING(day_id) WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date=?`,scope,date),
   p(`SELECT a.version_id,a.account_id FROM attendance_absences a JOIN attendance_series s ON s.latest_version_id=a.version_id JOIN attendance_days d USING(day_id) WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date=?`,scope,date),
   p('SELECT * FROM class_teacher_assignments WHERE activity_key=? COLLATE NOCASE',scope),
   p(`SELECT m.*,a.account_id canonical_account_id,a.display_name,a.active account_active,EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=m.account_id AND r.activity_key=m.activity_key AND r.role='STUDENT') student_role FROM class_memberships m JOIN accounts a USING(account_id) WHERE m.activity_key=? COLLATE NOCASE`,scope),
   p('SELECT * FROM attendance_delivery_rosters WHERE activity_key=? COLLATE NOCASE',scope),
   p('SELECT m.*,a.account_id canonical_account_id,a.display_name,a.active account_active FROM attendance_delivery_members m JOIN accounts a USING(account_id) WHERE m.activity_key=? COLLATE NOCASE AND m.state=\'VALID\'',scope),
   p('SELECT g.*,a.display_name FROM attendance_substitutes g JOIN accounts a USING(account_id) WHERE g.activity_key=? COLLATE NOCASE AND g.attendance_date=?',scope,date)
  ]);
  const [days,contexts,members,absences,teachers,enrolments,deliveryRosters,deliveryMembers,substitutes]=result.map(r=>r.results),day=days[0];
  const lessons=new Map((day?[]:schedule.lessons).map(l=>[l.stableKey,{...l,activityKey:scope}]));
  for(const context of contexts)lessons.set(context.stable_key,{...JSON.parse(context.lesson_json),activityKey:scope,stableKey:context.stable_key,context});
  const ordinary=lesson=>store.admin||store.teacher&&(lesson.teacherIds.some(id=>same(id,actor))||teachers.some(t=>same(t.class_id,lesson.classId)&&same(t.account_id,actor)));
  const preview=auth.workspace==='TEACH'&&administers(auth,scope)&&!store.teacher&&!substitutes.some(g=>same(g.account_id,actor));
  const permitted=(lesson,correction=false)=>ordinary(lesson)||auth.workspace==='TEACH'&&substitutes.some(g=>same(g.account_id,actor)&&canSubstitute(g,lesson,correction,now().toISOString()));
  function roster(lesson){
   if(lesson.context?.roster_id)return {reliable:true,rosterId:lesson.context.roster_id,members:members.filter(m=>m.roster_id===lesson.context.roster_id).map(m=>({accountId:m.account_id,name:m.display_name}))};
   let source,reliable=true;
   if(a.kind==='COURSE'){
    reliable=deliveryRosters.some(r=>same(r.run_id,lesson.runId));source=deliveryMembers.filter(m=>same(m.run_id,lesson.runId)&&m.join_date<=date&&(!m.leave_date||m.leave_date>=date)&&(date<today||m.account_active));
   }else{
    const classMembers=enrolments.filter(m=>same(m.class_id,lesson.classId));
    if(date<today)reliable=classMembers.length>0&&classMembers.every(m=>m.start_date&&(!m.active?Boolean(m.end_date):true));
    source=classMembers.filter(m=>(!m.start_date||m.start_date<=date)&&(!m.end_date||m.end_date>=date)&&(date<today?m.active||m.end_date:m.active&&m.account_active&&m.student_role));
   }
   return {reliable,members:sorted([...byId(source.map(m=>({accountId:m.canonical_account_id||m.account_id,name:m.display_name}))).values()])};
  }
  const visible=[...lessons.values()].filter(l=>preview||ordinary(l)||permitted(l,Boolean(l.context?.latest_version_id)));
  if(!store.admin&&!store.teacher&&!preview&&!visible.length)throw fail('Attendance is outside your current access.',403,'FORBIDDEN');
  return {a,date,today,timezone,store,day,contexts,members,absences,lessons:[...lessons.values()],visible,roster,permitted,ordinary,preview,substitutes,runs:schedule.runs};
 }
 function view(data){
  const index=new Map();
  for(const lesson of data.visible){const c=lesson.context;if(!c?.latest_version_id)continue;
   const absent=new Set(data.absences.filter(r=>r.version_id===c.latest_version_id).map(r=>r.account_id));
   index.set(`${data.date}|${lesson.publicationId}|${lesson.anchor}`,{id:c.latest_version_id,submittedAt:c.submitted_at,marks:data.roster(lesson).members.map(m=>({...m,status:absent.has(m.accountId)?'ABSENT':'PRESENT'}))});
  }
  const result=dayView(data.date,data.visible,index,l=>data.roster(l).reliable?data.roster(l).members:[]);
  result.lessons=result.lessons.map(row=>({...row,canSubmit:!data.preview&&data.date<=data.today&&data.permitted(row.lesson,row.submitted)&&(row.submitted||data.roster(row.lesson).reliable),rosterReliable:data.roster(row.lesson).reliable}));
  result.learners=result.learners.map(r=>({...r,dayFraction:r.complete&&r.scheduled?r.present/r.scheduled:null}));
  return {program:{id:data.a.activity_id,name:data.a.name,kind:data.a.kind},activityKey:data.a.activity_key,generation:attendanceGeneration,prepared:true,today:data.today,timezone:data.timezone,readOnly:data.preview,
   classes:[...new Map(data.visible.map(l=>[l.classId,{id:l.classId,name:l.className||l.classNames[0]}])).values()],...result,
   canAdmin:data.store.admin,runs:data.runs.map(r=>({id:r.run_id,name:r.name})),...(data.store.admin?{substitutes:data.substitutes.map(g=>({id:g.assignment_id,stableKey:g.stable_key,name:g.display_name,revision:g.revision,revoked:Boolean(g.revoked_at),firstUntil:g.first_until,correctionUntil:g.correction_until,reopenUntil:g.correction_reopen_until}))}:{}),store:'D1'};
 }
 async function submit(a,input){
  return attendanceStore(repository,auth,a).change('submit',input,async()=>{
   const data=await load(a,input.date);if(data.preview)throw fail('Teacher preview cannot submit attendance.',403,'PREVIEW_READ_ONLY');
   if(data.date>data.today)throw fail('Future attendance cannot be submitted.',409,'FUTURE_ATTENDANCE');
   if(!['day','lesson'].includes(input.scope)||!input.baseRegisterIds||typeof input.baseRegisterIds!=='object'||Array.isArray(input.baseRegisterIds))throw fail('Refresh the selected attendance registers.');
   const selected=data.visible.filter(l=>(!input.classId||same(l.classId,input.classId))&&(input.scope==='day'||l.anchor===input.anchor));
   if(!selected.length||input.scope==='lesson'&&selected.length!==1||selected.length>100)throw fail('Choose a valid class/session selection.');
   if(!input.exceptions||typeof input.exceptions!=='object'||Array.isArray(input.exceptions)||Object.keys(input.exceptions).some(k=>!selected.some(l=>l.anchor===k)))throw fail('An attendance exception is outside this selection.');
   const timestamp=now().toISOString(),dayId=data.day?.day_id||crypto.randomUUID(),newRosters=new Map(),series=[],contexts=[],aliases=[],versions=[],absenceRows=[],updates=[],targets=[];
   let submitted=0,edited=0,unchanged=0;
   async function seal(lesson){
    const roster=data.roster(lesson);if(!roster.reliable)return null;if(roster.rosterId)return roster;
    const hash=await payloadHash(sorted(roster.members));if(!newRosters.has(hash))newRosters.set(hash,{id:crypto.randomUUID(),hash,members:roster.members});
    return {...roster,rosterId:newRosters.get(hash).id,hash};
   }
   // One day records every required accepted session. Unknown historical roster
   // evidence remains pending; it is never silently recorded as an empty class.
   const material=new Map();
   for(const lesson of data.lessons){
    const roster=await seal(lesson),context=lesson.context,seriesId=context?.series_id||crypto.randomUUID();material.set(lesson.stableKey,{roster,seriesId,context});
    if(!context){series.push({series_id:seriesId,day_id:dayId,stable_key:lesson.stableKey,latest_version_id:null});contexts.push({context_id:crypto.randomUUID(),day_id:dayId,series_id:seriesId,class_id:lesson.classId,run_id:lesson.runId||null,lesson_json:JSON.stringify({...lesson,context:undefined}),roster_id:roster?.rosterId||null,required:1});aliases.push({activity_key:a.activity_key,attendance_date:data.date,publication_id:lesson.publicationId,lesson_anchor:lesson.anchor,class_id:lesson.classId,series_id:seriesId});}
   }
   for(const lesson of selected){
    const {roster,seriesId,context}=material.get(lesson.stableKey),previous=context?.latest_version_id||'';
    if(input.baseRegisterIds[lesson.anchor]!==previous)throw fail('A selected register changed. Refresh before submitting.',409,'ROW_CHANGED');
    if(!data.permitted(lesson,Boolean(previous)))throw fail('This session is outside your current attendance assignment or time window.',403,'FORBIDDEN');
    if(!roster)throw fail(a.kind==='COURSE'?'Admin must review this delivery’s attendance roster first.':'A reliable dated class roster is required. Ask Admin to correct the membership dates.',409,'ATTENDANCE_ROSTER_REQUIRED');
    const exceptions=input.exceptions[lesson.anchor]||[];if(!Array.isArray(exceptions)||exceptions.length>2000)throw fail('Choose valid absent learners.');
    const members=byId(roster.members),absent=new Set();for(const item of exceptions){if(item.status!=='ABSENT'||!members.has(item.accountId)||absent.has(item.accountId))throw fail('Each absence must identify one learner in the sealed roster.');absent.add(item.accountId);}
    const oldAbsent=new Set(data.absences.filter(r=>r.version_id===previous).map(r=>r.account_id));
    targets.push({date:data.date,stableKey:lesson.stableKey,classId:lesson.classId,runId:lesson.runId||'',publicationId:lesson.publicationId,sourceAnchor:lesson.sourceAnchor||lesson.anchor,sourceSessionId:lesson.sourceSessionId||lesson.sourceAnchor||lesson.anchor,dayStart:dayStart(lesson.date,lesson.timezone||data.timezone),first:!previous});
    if(previous&&oldAbsent.size===absent.size&&[...absent].every(id=>oldAbsent.has(id))){unchanged++;continue;}
    const versionId=crypto.randomUUID();versions.push({version_id:versionId,series_id:seriesId,previous_version_id:previous||null,roster_id:roster.rosterId,absence_count:absent.size,submitted_at:timestamp,submitted_by:actor,operation_id:input.operationId,generation:attendanceGeneration});
    for(const accountId of absent)absenceRows.push({version_id:versionId,roster_id:roster.rosterId,account_id:accountId});
    updates.push({seriesId,versionId});if(previous)edited++;else submitted++;
    if(context&&!context.roster_id)context.proposedRoster=roster.rosterId;
   }
   const hashes=[...newRosters.keys()],existing=hashes.length?(await p('SELECT roster_id,roster_hash FROM attendance_roster_versions WHERE activity_key=? COLLATE NOCASE AND roster_hash IN(SELECT value FROM json_each(?))',a.activity_key,JSON.stringify(hashes)).all()).results:[],replace=new Map();
   for(const row of existing){const candidate=newRosters.get(row.roster_hash);replace.set(candidate.id,row.roster_id);newRosters.delete(row.roster_hash);}
   for(const row of [...contexts,...versions,...absenceRows])if(replace.has(row.roster_id))row.roster_id=replace.get(row.roster_id);
   const statements=[...(!data.day?[p('INSERT INTO attendance_days VALUES(?,?,?,?,?,?)',dayId,a.activity_key,data.date,data.timezone,repository.setup?.head||'LEGACY_ACCEPTED',timestamp)]:[])];
   statements.push(...insertRecords(p,'attendance_roster_versions',[...newRosters.values()].map(r=>({roster_id:r.id,activity_key:a.activity_key,roster_hash:r.hash,member_count:r.members.length,created_at:timestamp}))),...insertRecords(p,'attendance_roster_members',[...newRosters.values()].flatMap(r=>r.members.map(m=>({roster_id:r.id,account_id:m.accountId,display_name:m.name})))),...insertRecords(p,'attendance_series',series),...insertRecords(p,'attendance_day_contexts',contexts),...insertRecords(p,'attendance_series_aliases',aliases));
   for(const c of data.contexts.filter(c=>c.proposedRoster))statements.push(p('UPDATE attendance_day_contexts SET roster_id=? WHERE context_id=? AND roster_id IS NULL',replace.get(c.proposedRoster)||c.proposedRoster,c.context_id));
   statements.push(...insertRecords(p,'attendance_register_versions',versions),...insertRecords(p,'attendance_absences',absenceRows));
   if(updates.length)statements.push(p("UPDATE attendance_series SET latest_version_id=(SELECT json_extract(value,'$.versionId') FROM json_each(?) WHERE json_extract(value,'$.seriesId')=attendance_series.series_id) WHERE series_id IN(SELECT json_extract(value,'$.seriesId') FROM json_each(?))",JSON.stringify(updates),JSON.stringify(updates)));
   return {statements,targets,result:{date:data.date,generation:attendanceGeneration,submittedLessons:submitted,editedLessons:edited,unchangedLessons:unchanged,submittedAnchors:selected.filter(l=>updates.some(u=>u.seriesId===material.get(l.stableKey).seriesId)).map(l=>l.anchor),alreadySubmittedLessons:0}};
  });
 }
 async function report(a,input){
  const start=input.startDate,end=input.endDate;if(!validDate(start)||!validDate(end)||end<start||Date.parse(end)-Date.parse(start)>366*86400000)throw fail('Choose a report period of up to one year.');
  const admin=isAdminWorkspace(auth)&&administers(auth,a.activity_key),own=auth.workspace==='LEARN';
  if(!admin&&!own&&!actualRole(auth,a.activity_key,'TEACHER'))throw fail('Attendance reports are outside your current access.',403,'FORBIDDEN');
  const rows=(await p(`SELECT d.attendance_date,c.class_id,c.lesson_json,c.required,s.latest_version_id,m.account_id,m.display_name,CASE WHEN ab.account_id IS NULL THEN 1 ELSE 0 END present FROM attendance_days d JOIN attendance_day_contexts c USING(day_id) JOIN attendance_series s USING(series_id) JOIN attendance_roster_members m USING(roster_id) LEFT JOIN attendance_absences ab ON ab.version_id=s.latest_version_id AND ab.account_id=m.account_id WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date BETWEEN ? AND ? AND c.required=1 ${own?'AND m.account_id=? COLLATE NOCASE':''} ORDER BY d.attendance_date,m.account_id`,a.activity_key,start,end,...(own?[actor]:[])).all()).results;
  const unknown=new Set((await p(`SELECT DISTINCT d.attendance_date FROM attendance_days d JOIN attendance_day_contexts c USING(day_id) WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date BETWEEN ? AND ? AND c.required=1 AND c.roster_id IS NULL`,a.activity_key,start,end).all()).results.map(r=>r.attendance_date));
  const teaching=admin||own?[]:(await p('SELECT class_id FROM class_teacher_assignments WHERE activity_key=? COLLATE NOCASE AND account_id=?',a.activity_key,actor).all()).results;
  const grouped=new Map();
  for(const row of rows){const lesson=JSON.parse(row.lesson_json);if(!admin&&!own&&!lesson.teacherIds.some(id=>same(id,actor))&&!teaching.some(t=>same(t.class_id,row.class_id)))continue;if(input.accountId&&!same(input.accountId,own?actor:row.account_id))continue;
   const key=row.account_id+'|'+row.attendance_date;if(!grouped.has(key))grouped.set(key,{accountId:row.account_id,name:row.display_name,date:row.attendance_date,requiredSessions:0,recordedSessions:0,presentSessions:0});const day=grouped.get(key);day.requiredSessions++;if(row.latest_version_id){day.recordedSessions++;day.presentSessions+=row.present;}
  }
  const days=[...grouped.values()].map(d=>({...d,dayFraction:!unknown.has(d.date)&&d.requiredSessions&&d.recordedSessions===d.requiredSessions?d.presentSessions/d.requiredSessions:null})),people=new Map();
  for(const day of days){if(!people.has(day.accountId))people.set(day.accountId,{accountId:day.accountId,name:day.name,recordedDays:0,attendedDays:0,pendingDays:0});const person=people.get(day.accountId);if(day.dayFraction===null)person.pendingDays++;else{person.recordedDays++;person.attendedDays+=day.dayFraction;}}
  return {generation:attendanceGeneration,days,learners:[...people.values()].map(p=>({...p,percentage:p.recordedDays&&!p.pendingDays?100*p.attendedDays/p.recordedDays:null}))};
 }
 return {async run(action,input={}){
  if(!repository.setup?.head)throw fail('Attendance needs accepted setup before it can open.',503,'SETUP_PUBLICATION_REQUIRED');
  if(action==='options')return options();
  const a=await activity(input);
  if(action==='report')return report(a,input);
  if(auth.workspace==='LEARN')throw fail('Attendance recording is available in Teach and Admin.',403,'TEACH_WORKSPACE_REQUIRED');
  if(['roster-get','roster-save','substitute-save','substitute-revoke','substitute-reopen'].includes(action))return attendanceAdmin(repository,auth,load,now).run(a,action,input);
  if(action==='submit')return submit(a,input);
  if(action==='get')return view(await load(a,input.date));
  if(action==='prepare')return {prepared:true,generation:attendanceGeneration};
  if(action==='recover')return {recovered:false,generation:attendanceGeneration};
  throw fail('Unknown attendance action.',404);
 },load,view};
}
