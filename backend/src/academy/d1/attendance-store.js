import {payloadHash} from '../../programs/timetable-model.js';
import {managementError as fail} from './management-store.js';
import {assessmentRolesSQL} from './assessment-store.js';
import {isAdminWorkspace,actualRole,administers,actualState} from './workspace-access.js';

export const attendanceGeneration='NATIVE_V1';
export function attendanceStore(repository,auth,activity){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
 const admin=isAdminWorkspace(auth)&&administers(auth,activity.activity_key),teacher=auth.workspace==='TEACH'&&actualRole(auth,activity.activity_key,'TEACHER');
 async function change(action,input,plan,{adminOnly=false}={}){
  if(input.generation!==attendanceGeneration)throw fail('Refresh Attendance before submitting. Earlier attendance retries cannot write the new register.',409,'ATTENDANCE_GENERATION_CHANGED');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.operationId||''))throw fail('This action needs its retry identifier.');
  if(adminOnly&&!admin)throw fail('Open Admin to manage this attendance setup.',403,'FORBIDDEN');
  const hash=await payloadHash({generation:attendanceGeneration,action,input}),scope=activity.activity_key;
  const receipt=async()=>{const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='NATIVE_ATTENDANCE' AND scope_key=? AND operation_id=?",scope,input.operationId).first();if(!r)return null;if(r.actor_account_id!==actor||r.payload_sha256!==hash)throw fail('This retry identifier belongs to another change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};};
  const saved=await receipt();if(saved)return saved;
  const version=(await p('SELECT version FROM academy_write_state WHERE singleton=1').first()).version;
  const {statements,result,targets=[],audit={}}=await plan(),guard=crypto.randomUUID(),now=new Date().toISOString();
  if(!adminOnly&&!targets.length)throw fail('Choose a permitted session.',403,'FORBIDDEN');
  if(statements.length>32)throw fail('Submit fewer sessions together.',413,'ATTENDANCE_BATCH_TOO_LARGE');
  const scopeAdmin=`EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN')`;
  const ordinaryTeacher=`EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='TEACHER') AND (EXISTS(SELECT 1 FROM class_teacher_assignments c WHERE c.activity_key=? COLLATE NOCASE AND c.class_id=json_extract(t.value,'$.classId') COLLATE NOCASE AND c.account_id=a.account_id) OR EXISTS(SELECT 1 FROM published_lesson_teachers lt WHERE lt.activity_key=? COLLATE NOCASE AND lt.publication_id=json_extract(t.value,'$.publicationId') COLLATE NOCASE AND lt.lesson_anchor=json_extract(t.value,'$.sourceAnchor') AND lt.account_id=a.account_id))`;
  const substitute=`EXISTS(SELECT 1 FROM attendance_substitutes g WHERE g.activity_key=? COLLATE NOCASE AND g.account_id=a.account_id AND g.attendance_date=json_extract(t.value,'$.date') AND g.stable_key=json_extract(t.value,'$.stableKey') AND g.revoked_at IS NULL AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND CASE WHEN json_extract(t.value,'$.first')=1 THEN g.first_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE max(g.correction_until,coalesce(g.correction_reopen_until,''))>strftime('%Y-%m-%dT%H:%M:%fZ','now') END)`;
  const firstGuard=`(json_extract(t.value,'$.first')<>1 OR (julianday('now')>=julianday(json_extract(t.value,'$.dayStart')) AND NOT EXISTS(SELECT 1 FROM program_publication_lifecycle l WHERE l.activity_key=? COLLATE NOCASE AND l.publication_id=json_extract(t.value,'$.publicationId') COLLATE NOCASE AND l.status IN('CANCELLED','ARCHIVED')) AND NOT EXISTS(SELECT 1 FROM lesson_lifecycle l WHERE l.activity_key=? COLLATE NOCASE AND l.publication_id=json_extract(t.value,'$.publicationId') COLLATE NOCASE AND l.source_session_id=json_extract(t.value,'$.sourceSessionId') AND l.status IN('CANCELLED','REPLACED')) ${activity.kind==='PROGRAM'?"AND EXISTS(SELECT 1 FROM classes c WHERE c.activity_key=? COLLATE NOCASE AND c.class_id=json_extract(t.value,'$.classId') COLLATE NOCASE AND c.active=1)":"AND NOT EXISTS(SELECT 1 FROM course_run_state r WHERE r.activity_key=? COLLATE NOCASE AND r.run_id=json_extract(t.value,'$.runId') COLLATE NOCASE AND r.stage IN('CANCELLED','ARCHIVED'))"}))`;
  const authority=adminOnly?`(?=1 AND (${scopeAdmin}))`:`NOT EXISTS(SELECT 1 FROM json_each(?) t WHERE NOT (((?=1 AND (${scopeAdmin})) OR (?=1 AND ((${ordinaryTeacher}) OR (${substitute})))) AND ${firstGuard}))`;
  const authorityValues=adminOnly?[Number(admin),scope]:[JSON.stringify(targets),Number(admin),scope,Number(auth.workspace==='TEACH'),scope,scope,scope,scope,scope,scope,scope];
  try{
   await db.batch([
    p(`INSERT INTO academy_write_guards VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND (SELECT generation=? FROM attendance_generation WHERE singleton=1) AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.credential_epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.active=1 AND x.lifecycle='ACTIVE') AND ${authority}))`,guard,version,attendanceGeneration,actor,auth.state.account.credential_epoch,auth.sid,now,scope,...authorityValues),
    ...statements,
    p("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,'NATIVE_ATTENDANCE',?,?)",crypto.randomUUID(),now,actor,admin?(actualState(auth).account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN'):teacher?'TEACHER':'SUBSTITUTE',scope,action,input.operationId,JSON.stringify({...audit,generation:attendanceGeneration,targets:targets.map(t=>({date:t.date,stableKey:t.stableKey,first:t.first}))})),
    p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('NATIVE_ATTENDANCE',?,?,?,?,?,?)",scope,input.operationId,hash,JSON.stringify(result),actor,now),
    p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
   ]);return result;
  }catch(error){const recovered=await receipt();if(recovered)return recovered;if(/academy_management_stale|attendance_interval_overlap/.test(error.message))throw fail('Attendance, roster or access changed. Your entries are kept; refresh before submitting.',409,'ATTENDANCE_CHANGED');throw error;}
 }
 return {db,p,actor,admin,teacher,change};
}
