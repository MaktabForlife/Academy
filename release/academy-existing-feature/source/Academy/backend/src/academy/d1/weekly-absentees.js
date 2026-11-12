import {academyD1Repository,rehearsalError as fail} from './repository.js';
import {isAdminWorkspace} from './workspace-access.js';

export const weeklyAbsenteeCron='0,15,30,45 5-6 * * MON'; // Monday 08:00 Riyadh, bounded recovery until 09:45.
const prefix='weekly-absentees:';
export const isWeeklyAbsenteeNotice=id=>typeof id==='string'&&id.startsWith(prefix);
export function previousAttendanceWeek(now){
 const local=new Date(now.getTime()+3*3600000),day=local.toISOString().slice(0,10),monday=new Date(day+'T00:00:00Z');
 monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7)-7);
 const end=new Date(monday);end.setUTCDate(end.getUTCDate()+6);
 return {start:monday.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
// Core facts only. The scheduled snapshot never resolves live class membership,
// reconstructs a roster, or expands accepted JSON table projections.
const globalSQL=actor=>`EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=${actor} COLLATE NOCASE AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')`;
const adminRolesSQL="SELECT account_id,activity_key,role FROM effective_activity_roles WHERE role='PROGRAM_ADMIN' UNION SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_role IN('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED' AND m.target_role='PROGRAM_ADMIN'";
const scopedSQL=(actor,scope)=>`EXISTS(SELECT 1 FROM (${adminRolesSQL}) wr JOIN main.activities x USING(activity_key) WHERE wr.account_id=${actor} COLLATE NOCASE AND wr.role='PROGRAM_ADMIN' AND x.active=1 AND x.lifecycle='ACTIVE' ${scope?`AND wr.activity_key=${scope} COLLATE NOCASE`:''})`;
export const weeklyAdminSQL=actor=>`(${globalSQL(actor)} OR ${scopedSQL(actor)})`;

export async function recoverWeeklyAbsentees(env,now=new Date()){
 if(env.ACADEMY_WEEKLY_ABSENTEES!=='1')return {skipped:true};
 const local=new Date(now.getTime()+3*3600000);
 if(local.getUTCDay()!==1||local.getUTCHours()<8||local.getUTCHours()>9)return {skipped:true};
 const {start,end}=previousAttendanceWeek(now),repository=academyD1Repository(env),db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v);
 const saved=await p('SELECT week_start FROM weekly_absentee_reports WHERE week_start=?',start).first();
 if(saved)return {weekStart:start,replayed:true};
 const version=(await p('SELECT version FROM academy_write_state WHERE singleton=1').first()).version,guard=crypto.randomUUID();
 try{
  await db.batch([
   p('INSERT INTO academy_write_guards VALUES(?,(SELECT version FROM academy_write_state WHERE singleton=1)=? AND NOT EXISTS(SELECT 1 FROM weekly_absentee_reports WHERE week_start=?))',guard,version,start),
   p('INSERT INTO weekly_absentee_reports VALUES(?,?,?)',start,end,now.toISOString()),
   p(`INSERT INTO weekly_absentee_rows SELECT ?,d.activity_key,s.series_id,m.account_id,m.display_name,d.attendance_date,c.lesson_json FROM attendance_days d JOIN attendance_series s USING(day_id) JOIN attendance_day_contexts c USING(series_id) JOIN attendance_register_versions v ON v.version_id=s.latest_version_id JOIN attendance_absences ab ON ab.version_id=v.version_id JOIN attendance_roster_members m ON m.roster_id=v.roster_id AND m.account_id=ab.account_id WHERE d.attendance_date BETWEEN ? AND ? AND c.required=1`,start,start,end),
   p(`INSERT INTO weekly_absentee_recipients(week_start,account_id) SELECT ?,a.account_id FROM accounts a WHERE a.active=1 AND ${weeklyAdminSQL('a.account_id')}`,start),
   p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),
   p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
  ]);
  return {weekStart:start};
 }catch(error){
  if(await p('SELECT week_start FROM weekly_absentee_reports WHERE week_start=?',start).first())return {weekStart:start,replayed:true};
  throw error; // Atomic failure leaves no report or receipts; the next weekly tick retries.
 }
}

// A shared inbox projection keeps sorting, filtering and pagination identical
// for normal notices and system reports. No learner rows are read here.
export function messageInboxSQL(auth,enabled=false){
 const fields={notice_id:'n.notice_id',draft_id:'n.draft_id',actor_id:'n.actor_id',sender_name:'n.sender_name',workspace:'n.workspace',subject:'n.subject',body:'n.body',audience_json:'n.audience_json',link_json:'n.link_json',requires_ack:'n.requires_ack',recipient_count:'n.recipient_count',state:'n.state',created_at:'n.created_at',issued_at:'n.issued_at',scheduled_for:'n.scheduled_for',withdrawn_at:'n.withdrawn_at',withdrawal_reason:'n.withdrawal_reason',previous_notice_id:'n.previous_notice_id',account_id:'r.account_id',first_opened_at:'r.first_opened_at',unread:'r.unread',acknowledged_at:'r.acknowledged_at',archived_at:'r.archived_at'};
 const normal='SELECT '+Object.entries(fields).map(([key,value])=>value+' AS '+key).join(',')+" FROM messaging_recipients r JOIN messaging_notices n USING(notice_id) WHERE n.state IN('SENT','WITHDRAWN')";
 if(!enabled||!isAdminWorkspace(auth))return normal;
 const system={notice_id:`'${prefix}'||w.week_start`,draft_id:'NULL',actor_id:'NULL',sender_name:"'Academy'",workspace:"'ADMIN'",subject:"'Weekly absentees · '||w.week_start||' – '||w.week_end",body:"''",audience_json:"'[]'",link_json:"'null'",requires_ack:'0',recipient_count:'1',state:"'SENT'",created_at:'w.created_at',issued_at:'w.created_at',scheduled_for:'w.created_at',withdrawn_at:'NULL',withdrawal_reason:"''",previous_notice_id:'NULL',account_id:'r.account_id',first_opened_at:'r.first_opened_at',unread:'r.unread',acknowledged_at:'NULL',archived_at:'r.archived_at'};
 return normal+' UNION ALL SELECT '+Object.keys(fields).map(key=>system[key]+' AS '+key).join(',')+' FROM weekly_absentee_recipients r JOIN weekly_absentee_reports w USING(week_start) WHERE '+weeklyAdminSQL('r.account_id')+' AND EXISTS(SELECT 1 FROM accounts a WHERE a.account_id=r.account_id AND a.active=1)';
}

export function weeklyAbsentees(repository,auth){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
 function period(id){const value=String(id||'').slice(prefix.length);if(!isWeeklyAbsenteeNotice(id)||!/^\d{4}-\d\d-\d\d$/.test(value))throw fail('Weekly report not found.',404,'MESSAGING_NOT_FOUND');return value;}
 async function authority(){
  if(!repository.features?.weeklyAbsentees||!isAdminWorkspace(auth))throw fail('Open Admin to read the weekly absentee list.',403,'ADMIN_WORKSPACE_REQUIRED');
  const row=await p(`SELECT ${globalSQL('a.account_id')} global_admin FROM accounts a WHERE a.account_id=? COLLATE NOCASE AND a.active=1 AND ${weeklyAdminSQL('a.account_id')}`,actor).first();
  if(!row)throw fail('Weekly absentee lists require current Admin authority.',403,'FORBIDDEN');
  return row;
 }
 async function receiptPlan(action,input,stamp){
  await authority();const start=period(input.noticeId);
  if(!await p('SELECT week_start FROM weekly_absentee_recipients WHERE week_start=? AND account_id=? COLLATE NOCASE',start,actor).first())throw fail('Weekly report not found in your inbox.',404,'MESSAGING_NOT_FOUND');
  const set=action==='open'?'first_opened_at=coalesce(first_opened_at,?),unread=0':action==='unread'?'unread=1':action==='archive'?'archived_at=?':action==='restore'?'archived_at=NULL':null;
  if(!set)throw fail('This report does not need acknowledgement.');
  return {statements:[p(`UPDATE weekly_absentee_recipients SET ${set} WHERE week_start=? AND account_id=? COLLATE NOCASE`,...(['open','archive'].includes(action)?[stamp]:[]),start,actor)],result:{noticeId:input.noticeId},condition:weeklyAdminSQL('?'),values:[actor,actor]};
 }
 async function body(input){
  await authority();const start=period(input.noticeId);
  // Read only absent snapshot rows in CURRENT scope, including role revocations.
  // Activity labels come from accepted setup; frozen names/lessons come from registers.
  const rows=(await p(`SELECT r.*,a.name activity_name FROM weekly_absentee_rows r LEFT JOIN activities a USING(activity_key) WHERE r.week_start=? AND (${globalSQL('?')} OR ${scopedSQL('?','r.activity_key')}) ORDER BY r.display_name COLLATE NOCASE,r.account_id,r.attendance_date,r.activity_key,r.series_id`,start,actor,actor).all()).results;
  const lines=['Confirmed absences from submitted registers for '+start+' to '+previousEnd(start)+'.','Scheduled for Monday at 08:00 Riyadh. Unsubmitted registers are not counted. Later register corrections appear in the attendance tools.',''];
  for(const row of rows){const lesson=JSON.parse(row.lesson_json);lines.push(row.display_name+' ('+row.account_id+') · '+(row.activity_name||row.activity_key)+' · '+[row.attendance_date,lesson.className||lesson.classNames?.join(', '),lesson.moduleName||lesson.subjectName,lesson.startTime].filter(Boolean).join(' · '));}
  if(!rows.length)lines.push('No recorded absentees in your current areas for this week.');
  return lines.join('\n');
 }
 return {receiptPlan,body};
}
function previousEnd(start){const end=new Date(start+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);return end.toISOString().slice(0,10);}
