import {attendanceStore,attendanceGeneration} from './attendance-store.js';
import {assessmentRolesSQL,validDate} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {dayStart,nextDate,academyDate,appTimezone} from './academy-clock.js';

export function attendanceAdmin(repository,auth,load,now=()=>new Date()){
 const p=(sql,...v)=>repository.db.prepare(sql).bind(...v);
 async function roster(a,input){
  const store=attendanceStore(repository,auth,a);if(!store.admin||a.kind!=='COURSE')throw fail('Only this Course’s Admin can manage a delivery roster.',403,'FORBIDDEN');
  const run=await p('SELECT * FROM course_runs WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE',a.activity_key,String(input.runId||'')).first();if(!run)throw fail('Choose an accepted Course delivery.',404);
  const result=await repository.db.batch([
   p('SELECT * FROM attendance_delivery_rosters WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE',a.activity_key,run.run_id),
   p('SELECT m.*,a.display_name FROM attendance_delivery_members m JOIN accounts a USING(account_id) WHERE m.activity_key=? COLLATE NOCASE AND m.run_id=? COLLATE NOCASE ORDER BY m.account_id,m.join_date',a.activity_key,run.run_id),
   p(`SELECT DISTINCT a.account_id,a.display_name FROM accounts a JOIN (${assessmentRolesSQL}) r USING(account_id) WHERE a.active=1 AND r.activity_key=? COLLATE NOCASE AND r.role='STUDENT' ORDER BY a.display_name`,a.activity_key)
  ]),[headers,members,people]=result.map(r=>r.results),revision=headers[0]?.revision||0;
  const prefillRevision=await payloadHash({run,revision,members,people});
  return {generation:attendanceGeneration,runId:run.run_id,runName:run.name,revision,prefillRevision,reviewedAt:headers[0]?.reviewed_at||null,
   intervals:members.map(m=>({id:m.interval_id,accountId:m.account_id,name:m.display_name,joinDate:m.join_date,leaveDate:m.leave_date||'',state:m.state,revision:m.revision})),
   prefill:people.map(m=>({accountId:m.account_id,name:m.display_name,joinDate:run.start_date||'',leaveDate:run.end_date||'',state:'VALID',revision:0}))};
 }
 async function saveRoster(a,input){return attendanceStore(repository,auth,a).change('roster-save',input,async()=>{
  const current=await roster(a,input);if(input.revision!==current.revision||input.prefillRevision!==current.prefillRevision)throw fail('The delivery roster or its prefill changed. Review it again.',409,'ROW_CHANGED');
  if(!Array.isArray(input.intervals)||input.intervals.length>1000)throw fail('Use up to 1,000 dated roster intervals.');
  const rows=[],ids=new Set(),timestamp=now().toISOString(),today=academyDate(now(),await appTimezone(repository));
  const accounts=(await p('SELECT account_id,login_link_id,active FROM accounts WHERE account_id IN(SELECT json_extract(value,\'$.accountId\') FROM json_each(?)) OR login_link_id IN(SELECT json_extract(value,\'$.accountLink\') FROM json_each(?))',JSON.stringify(input.intervals),JSON.stringify(input.intervals)).all()).results;
  for(const row of input.intervals){
   const previous=row.id?current.intervals.find(m=>m.id===row.id):null;
   if(row.id&&(!previous||row.revision!==previous.revision)||row.id&&ids.has(row.id))throw fail('A roster interval changed. Review again.',409,'ROW_CHANGED');
   const account=accounts.find(a=>same(a.account_id,row.accountId)||row.accountLink&&same(a.login_link_id,row.accountLink));
   if(!account||!validDate(row.joinDate)||row.leaveDate&&!validDate(row.leaveDate)||row.leaveDate&&row.leaveDate<row.joinDate||!['VALID','VOID'].includes(row.state||'VALID'))throw fail('Choose a valid learner and inclusive join/leave dates.');
   if(!account.active&&(!row.leaveDate||row.leaveDate>=today))throw fail('An inactive learner may retain a dated historical interval; use a past leave date.');
   if(previous&&!same(previous.accountId,account.account_id))throw fail('Void the original interval and add the other learner separately.');
   const id=previous?.id||crypto.randomUUID();ids.add(id);
   rows.push({interval_id:id,activity_key:a.activity_key,run_id:current.runId,account_id:account.account_id,join_date:row.joinDate,leave_date:row.leaveDate||null,state:row.state||'VALID',revision:(previous?.revision||0)+1,created_at:timestamp,created_by:auth.user.accountid});
  }
  const valid=rows.filter(r=>r.state==='VALID').sort((x,y)=>x.account_id.localeCompare(y.account_id)||x.join_date.localeCompare(y.join_date));
  for(let i=1;i<valid.length;i++)if(same(valid[i].account_id,valid[i-1].account_id)&&(valid[i-1].leave_date||'9999-12-31')>=valid[i].join_date)throw fail('A learner’s dated intervals must not overlap.');
  const statements=[p('INSERT INTO attendance_delivery_rosters VALUES(?,?,?,?,?) ON CONFLICT(activity_key,run_id) DO UPDATE SET revision=excluded.revision,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by',a.activity_key,current.runId,current.revision+1,timestamp,auth.user.accountid),p("UPDATE attendance_delivery_members SET state='VOID' WHERE activity_key=? COLLATE NOCASE AND run_id=? COLLATE NOCASE AND state='VALID'",a.activity_key,current.runId)];
  if(rows.length)statements.push(p(`INSERT INTO attendance_delivery_members(interval_id,activity_key,run_id,account_id,join_date,leave_date,state,revision,created_at,created_by) SELECT json_extract(value,'$.interval_id'),json_extract(value,'$.activity_key'),json_extract(value,'$.run_id'),json_extract(value,'$.account_id'),json_extract(value,'$.join_date'),json_extract(value,'$.leave_date'),json_extract(value,'$.state'),json_extract(value,'$.revision'),json_extract(value,'$.created_at'),json_extract(value,'$.created_by') FROM json_each(?) WHERE 1 ON CONFLICT(interval_id) DO UPDATE SET join_date=excluded.join_date,leave_date=excluded.leave_date,state=excluded.state,revision=excluded.revision`,JSON.stringify(rows)));
  const affected=(await p('SELECT count(*) n FROM attendance_day_contexts c JOIN attendance_days d USING(day_id) WHERE d.activity_key=? COLLATE NOCASE AND c.run_id=?',a.activity_key,current.runId).first()).n;
  return {statements,result:{runId:current.runId,revision:current.revision+1,affectedRecordedContexts:affected,generation:attendanceGeneration},audit:{runId:current.runId,before:current.intervals,after:rows}};
 },{adminOnly:true});}
 async function substitute(a,action,input){return attendanceStore(repository,auth,a).change(action,input,async()=>{
  const store=attendanceStore(repository,auth,a),timestamp=now().toISOString();if(!store.admin)throw fail('Only this area’s Admin can manage substitutes.',403,'FORBIDDEN');
  const previous=input.assignmentId?await p('SELECT * FROM attendance_substitutes WHERE assignment_id=? AND activity_key=? COLLATE NOCASE',input.assignmentId,a.activity_key).first():null;
  if(input.assignmentId&&(!previous||previous.revision!==input.revision))throw fail('This substitute assignment changed. Refresh before saving.',409,'ROW_CHANGED');
  if(action==='substitute-revoke'){
   if(!previous)throw fail('Choose an existing substitute assignment.');
   return {statements:[p('UPDATE attendance_substitutes SET revoked_at=?,revision=revision+1 WHERE assignment_id=?',timestamp,previous.assignment_id)],result:{assignmentId:previous.assignment_id,revoked:true},audit:{before:previous}};
  }
  if(action==='substitute-reopen'){
   if(!previous||previous.revoked_at||!Number.isInteger(input.hours)||input.hours<1||input.hours>24)throw fail('Choose an active assignment and a correction window of up to 24 hours.');
   const registered=await p('SELECT 1 ok FROM attendance_days d JOIN attendance_series s USING(day_id) WHERE d.activity_key=? COLLATE NOCASE AND d.attendance_date=? AND s.stable_key=? AND s.latest_version_id IS NOT NULL',a.activity_key,previous.attendance_date,previous.stable_key).first();
   if(!registered)throw fail('Correction reopening requires an existing submitted register. It does not permit FIRST.',409);
   const until=new Date(now().getTime()+input.hours*3600000).toISOString();
   return {statements:[p('UPDATE attendance_substitutes SET correction_reopen_until=?,revision=revision+1 WHERE assignment_id=?',until,previous.assignment_id)],result:{assignmentId:previous.assignment_id,correctionUntil:until},audit:{before:previous,correctionReopenUntil:until}};
  }
  const data=await load(a,input.date),lesson=data.lessons.find(l=>l.stableKey===input.stableKey);if(!lesson)throw fail('Choose an accepted dated session.');
  const account=await p('SELECT account_id FROM accounts WHERE active=1 AND (account_id=? COLLATE NOCASE OR login_link_id=? COLLATE NOCASE)',String(input.accountId||''),String(input.accountLink||'')).first();if(!account)throw fail('Choose an active existing account.');
  const existing=await p('SELECT assignment_id FROM attendance_substitutes WHERE activity_key=? COLLATE NOCASE AND attendance_date=? AND stable_key=? AND revoked_at IS NULL',a.activity_key,lesson.date,lesson.stableKey).first();
  if(existing&&existing.assignment_id!==previous?.assignment_id)throw fail('This session already has a substitute. Refresh to replace that assignment.',409,'ROW_CHANGED');
  const id=crypto.randomUUID(),timezone=lesson.timezone||data.timezone,firstUntil=dayStart(nextDate(lesson.date),timezone),correctionUntil=dayStart(nextDate(lesson.date,2),timezone);
  return {statements:[...(previous?[p('UPDATE attendance_substitutes SET revoked_at=?,revision=revision+1 WHERE assignment_id=?',timestamp,previous.assignment_id)]:[]),p('INSERT INTO attendance_substitutes(assignment_id,activity_key,attendance_date,stable_key,account_id,starts_at,first_until,correction_until,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',id,a.activity_key,lesson.date,lesson.stableKey,account.account_id,timestamp,firstUntil,correctionUntil,timestamp,auth.user.accountid)],result:{assignmentId:id,firstUntil,correctionUntil},audit:{before:previous,after:{assignmentId:id,accountId:account.account_id,date:lesson.date,stableKey:lesson.stableKey,firstUntil,correctionUntil}}};
 },{adminOnly:true});}
 return {run:(a,action,input)=>action==='roster-get'?roster(a,input):action==='roster-save'?saveRoster(a,input):substitute(a,action,input)};
}
