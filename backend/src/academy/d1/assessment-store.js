import {managementError as fail,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';

export const assessmentRolesSQL=`SELECT account_id,activity_key,role FROM effective_activity_roles UNION SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED'`;
const globalSQL=`EXISTS(SELECT 1 FROM global_role_assignments WHERE account_id=? AND active=1 AND role='GLOBAL_ADMIN' AND review_state='CONFIRMED')`;
export const adminClause=`(${globalSQL} OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='PROGRAM_ADMIN'))`;
export const teacherClause=`(${adminClause} OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='TEACHER' AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=c.activity_key AND t.class_id=c.class_id AND t.account_id=r.account_id) OR EXISTS(SELECT 1 FROM program_publication_state ps JOIN published_lesson_classes lc ON lc.activity_key=ps.activity_key AND lc.publication_id=ps.latest_publication_id JOIN published_lesson_teachers lt ON lt.activity_key=lc.activity_key AND lt.publication_id=lc.publication_id AND lt.lesson_anchor=lc.lesson_anchor WHERE lc.activity_key=c.activity_key AND lc.class_id=c.class_id AND lt.account_id=r.account_id))))`;
export const learnerClause=`(EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='STUDENT') OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=? AND s.activity_key=a.activity_key))`;
export const cleanText=(value,max,label,optional=false)=>{if(typeof value!=='string'||value.trim().length>max||!optional&&!value.trim())throw fail(`Enter ${label} of up to ${max} characters.`);return value.trim();};
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const paperAvailable=a=>Boolean(a.schedule_published&&a.paper_released_at&&a.paper_state==='APPROVED'&&a.paper_file_id&&Date.now()>=Date.parse(a.exam_date+'T03:00:00+02:00'));

export function assessmentStore(repository,auth){
 const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),actor=auth.user.accountid;
 const clause=(mode)=>mode==='admin'?adminClause:mode==='staff'?teacherClause:learnerClause;
 const values=mode=>Array(mode==='staff'?3:2).fill(actor);
 async function classes(mode='staff',activityKey=''){
  return (await p(`SELECT c.activity_key,c.class_id,c.name,a.name activity_name,a.kind FROM classes c JOIN activities a USING(activity_key) WHERE c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND ${clause(mode)} ${activityKey?'AND a.activity_key=?':''} ORDER BY a.name,c.name LIMIT 501`,...values(mode),...(activityKey?[activityKey]:[])).all()).results;
 }
 async function allowed(activityKey,classId,mode='staff'){
  return Boolean(await p(`SELECT 1 ok FROM classes c JOIN activities a USING(activity_key) WHERE c.activity_key=? AND c.class_id=? AND c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND ${clause(mode)}`,activityKey,classId,...values(mode)).first());
 }
 async function requireClass(activityKey,classId,mode='staff'){
  if(!await allowed(activityKey,classId,mode))throw fail('This class is outside your assessment access.',403,'FORBIDDEN');
 }
 async function assessment(id){const a=await p(`SELECT x.*,ph.name phase_name,c.name class_name,a.name activity_name FROM assessments x LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE assessment_id=?`,String(id||'')).first();if(!a)throw fail('Assessment not found.',404);return a;}
 const recipient=(id,accountId=actor)=>p('SELECT * FROM assessment_recipients WHERE assessment_id=? AND account_id=?',id,accountId).first();
 async function requireReader(a){
  if(await allowed(a.activity_key,a.class_id,'staff'))return;
  if(!a.schedule_published||!await allowed(a.activity_key,a.class_id,'learner')||!await recipient(a.assessment_id))throw fail('This assessment is outside your access.',403,'FORBIDDEN');
 }
 async function requireExaminer(a){await requireClass(a.activity_key,a.class_id);if(!same(a.examiner_id,actor))throw fail('Only the examiner can assess this paper.',403,'FORBIDDEN');}
 async function moderator(a){await requireClass(a.activity_key,a.class_id,'admin');if(same(a.examiner_id,actor))throw fail('An examiner cannot moderate their own assessment.',403,'SELF_MODERATION');}
 async function roster(a){return (await p(`SELECT DISTINCT u.account_id,u.display_name FROM accounts u JOIN class_memberships m ON m.account_id=u.account_id AND m.activity_key=? AND m.class_id=? WHERE u.active=1 AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=?) AND (m.end_date IS NULL OR m.end_date>=?) AND (EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=u.account_id AND r.activity_key=m.activity_key AND r.role='STUDENT') OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=u.account_id AND s.activity_key=m.activity_key)) ORDER BY u.display_name,u.account_id LIMIT 2001`,a.activity_key,a.class_id,a.exam_date,a.exam_date).all()).results;}
 const event=(a,action,details={},accountId=null)=>p('INSERT INTO assessment_events VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),a.assessment_id||null,a.activity_key,actor,action,accountId,JSON.stringify(details),new Date().toISOString());
 function revision(a,input){if(!Number.isInteger(input.revision)||input.revision!==a.revision)throw fail('This assessment changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');}
 function recipientRevision(r,input){if(!r||!Number.isInteger(input.recipientRevision)||input.recipientRevision!==r.revision)throw fail('This learner record changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');}
 async function change(action,input,scope,plan){
  if(!/^[0-9a-f-]{36}$/i.test(input.operationId||''))throw fail('This action needs its retry identifier.');
  const hash=await payloadHash({action,input});
  const receipt=async()=>{const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='ASSESSMENT' AND scope_key=? AND operation_id=?",scope,input.operationId).first();if(!r)return null;if(r.actor_account_id!==actor||r.payload_sha256!==hash)throw fail('This retry identifier belongs to another change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};};
  for(let attempt=0;attempt<3;attempt++){
   const saved=await receipt();if(saved)return saved;
   const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
   const {statements,result}=await plan(),guard=crypto.randomUUID(),now=new Date().toISOString();
   try{
    await db.batch([p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?))`,guard,version.version,actor,auth.state.account.credential_epoch,auth.sid,now),...statements,
     p(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),now,actor,auth.user.role,scope,action,'ASSESSMENT',input.operationId,JSON.stringify({action})),
     p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('ASSESSMENT',?,?,?,?,?,?)",scope,input.operationId,hash,JSON.stringify(result),actor,now),p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
    return result;
   }catch(e){const recovered=await receipt();if(recovered)return recovered;if(!/academy_management_stale/.test(e.message))throw e;if(!await repository.session(auth.sid,actor,auth.state.account.credential_epoch))throw fail('Your Academy session has ended.',401);if(attempt===2)throw fail('Assessment information changed. Refresh before saving.',409,'ROW_CHANGED');}
  }
 }
 const touch=a=>p('UPDATE assessments SET revision=revision+1,updated_at=? WHERE assessment_id=?',new Date().toISOString(),a.assessment_id);
 return {db,p,actor,classes,allowed,requireClass,assessment,recipient,requireReader,requireExaminer,moderator,roster,event,revision,recipientRevision,change,touch};
}
