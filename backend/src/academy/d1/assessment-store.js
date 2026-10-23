import {managementError as fail,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {isAdminWorkspace,administers,actualState,viewedClass,readerPreview} from './workspace-access.js';

export const assessmentRolesSQL=`SELECT account_id,activity_key,role FROM effective_activity_roles UNION SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED'`;
const globalSQL=`EXISTS(SELECT 1 FROM global_role_assignments WHERE account_id=? AND active=1 AND role='GLOBAL_ADMIN' AND review_state='CONFIRMED')`;
export const adminClause=`(${globalSQL} OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='PROGRAM_ADMIN'))`;
export const teacherClause=`(${adminClause} OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='TEACHER' AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=c.activity_key AND t.class_id=c.class_id AND t.account_id=r.account_id) OR EXISTS(SELECT 1 FROM program_publication_state ps JOIN published_lesson_classes lc ON lc.activity_key=ps.activity_key AND lc.publication_id=ps.latest_publication_id JOIN published_lesson_teachers lt ON lt.activity_key=lc.activity_key AND lt.publication_id=lc.publication_id AND lt.lesson_anchor=lc.lesson_anchor WHERE lc.activity_key=c.activity_key AND lc.class_id=c.class_id AND lt.account_id=r.account_id))))`;
export const learnerClause=`(EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role='STUDENT') OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=? AND s.activity_key=a.activity_key))`;
export const cleanText=(value,max,label,optional=false)=>{if(typeof value!=='string'||value.trim().length>max||!optional&&!value.trim())throw fail(`Enter ${label} of up to ${max} characters.`);return value.trim();};
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const paperAvailable=a=>Boolean(a.schedule_published&&a.paper_released_at&&a.paper_state==='APPROVED'&&a.paper_file_id&&Date.now()>=Date.parse(a.available_from||a.exam_date+'T03:00:00+02:00'));

export function assessmentStore(repository,auth){
 const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),actor=auth.user.accountid;
 const clause=mode=>{
  if(mode==='admin')return isAdminWorkspace(auth)?adminClause:'(? IS NULL AND ? IS NULL)';
  if(mode==='staff')return isAdminWorkspace(auth)?teacherClause:auth.workspace!=='TEACH'?'(? IS NULL AND ? IS NULL AND ? IS NULL)':auth.adminView?`(${adminClause} AND ? IS NOT NULL)`:teacherClause.replace(adminClause,'(? IS NULL AND ? IS NULL)');
  return auth.workspace==='TEACH'||auth.adminView?'(? IS NULL AND ? IS NULL)':learnerClause;
 };
 const values=mode=>Array(mode==='staff'?3:2).fill(actor);
 async function classes(mode='staff',activityKey='',includePreview=true){
  const preview=includePreview&&auth.adminView&&((mode==='learner'&&auth.workspace==='LEARN')||(mode==='staff'&&auth.workspace==='TEACH'));
  const real=actualState(auth),keys=real.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key);
  return (await p(`SELECT c.activity_key,c.class_id,c.name,a.name activity_name,a.kind FROM classes c JOIN activities a USING(activity_key) WHERE c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (${clause(mode)} ${preview?'OR ?=1 OR a.activity_key IN(SELECT value FROM json_each(?))':''}) ${activityKey?'AND a.activity_key=?':''} ORDER BY a.name,c.name LIMIT 501`,...values(mode),...(preview?[Number(Boolean(real.account.global_admin)),JSON.stringify(keys)]:[]),...(activityKey?[activityKey]:[])).all()).results;
 }
 async function allowed(activityKey,classId,mode='staff'){
  return Boolean(await p(`SELECT 1 ok FROM classes c JOIN activities a USING(activity_key) WHERE c.activity_key=? AND c.class_id=? AND c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND ${clause(mode)}`,activityKey,classId,...values(mode)).first());
 }
 async function requireClass(activityKey,classId,mode='staff'){
  if(!await allowed(activityKey,classId,mode))throw fail('This class is outside your assessment access.',403,'FORBIDDEN');
 }
 async function assessment(id){const a=await p(`SELECT x.*${repository.features?.nativeAttendance&&auth.workspace==='TEACH'?',current.duration_minutes,current.maximum_mark,current.timing_mode,current.allowance_minutes':''}${repository.features?.nativeAttendance?',f.sha256 paper_sha256':''},COALESCE(ar.name,ph.name) phase_name,c.name class_name,a.name activity_name FROM assessments x ${repository.features?.nativeAttendance&&auth.workspace==='TEACH'?'JOIN main.assessments current ON current.assessment_id=x.assessment_id':''} ${repository.features?.nativeAttendance?'LEFT JOIN assessment_file_integrity f ON f.file_id=x.paper_file_id':''} LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id LEFT JOIN assessment_registers ar ON ar.register_id=x.register_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.assessment_id=? AND x.deleted_at IS NULL`,String(id||'')).first();if(!a)throw fail('Assessment not found.',404);return a;}
 const recipient=(id,accountId=actor)=>p('SELECT * FROM assessment_recipients WHERE assessment_id=? AND account_id=?',id,accountId).first();
 async function requireReader(a){
  if(await readStaff(a))return;
  if(auth.workspace==='LEARN'&&administers(auth,a.activity_key)&&a.schedule_published){if(viewedClass(auth,a.activity_key)&&!same(viewedClass(auth,a.activity_key),a.class_id))throw fail('Choose this assessment’s class in Learn.',403,'CLASS_VIEW_REQUIRED');return;}
  if(!a.schedule_published||!await allowed(a.activity_key,a.class_id,'learner')||!await recipient(a.assessment_id))throw fail('This assessment is outside your access.',403,'FORBIDDEN');
 }
 const readStaff=a=>auth.workspace==='TEACH'&&administers(auth,a.activity_key)?Promise.resolve(true):allowed(a.activity_key,a.class_id,'staff');
 async function requireExaminer(a){if(repository.features?.nativeAttendance&&await allowed(a.activity_key,a.class_id,'admin'))return;await requireClass(a.activity_key,a.class_id);if(!same(a.examiner_id,actor))throw fail('Only the examiner can assess this paper.',403,'FORBIDDEN');}
 async function moderator(a){await requireClass(a.activity_key,a.class_id,'admin');if(same(a.examiner_id,actor))throw fail('An examiner cannot moderate their own assessment.',403,'SELF_MODERATION');}
 async function roster(a){return (await p(`SELECT DISTINCT u.account_id,u.display_name FROM accounts u JOIN class_memberships m ON m.account_id=u.account_id AND m.activity_key=? AND m.class_id=? WHERE u.active=1 AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=?) AND (m.end_date IS NULL OR m.end_date>=?) AND (EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=u.account_id AND r.activity_key=m.activity_key AND r.role='STUDENT') OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=u.account_id AND s.activity_key=m.activity_key)) ORDER BY u.display_name,u.account_id LIMIT 2001`,a.activity_key,a.class_id,a.exam_date||a.available_from?.slice(0,10)||new Date().toISOString().slice(0,10),a.exam_date||a.available_from?.slice(0,10)||new Date().toISOString().slice(0,10)).all()).results;}
 const event=(a,action,details={},accountId=null)=>p('INSERT INTO assessment_events VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),a.assessment_id||null,a.activity_key,actor,action,accountId,JSON.stringify(details),new Date().toISOString());
 function revision(a,input){if(!Number.isInteger(input.revision)||input.revision!==a.revision)throw fail('This assessment changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');}
 function recipientRevision(r,input){if(!r||!Number.isInteger(input.recipientRevision)||input.recipientRevision!==r.revision)throw fail('This learner record changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');}
 async function change(action,input,scope,plan){
  if(!isAdminWorkspace(auth)){
   const a=await assessment(input.assessmentId||scope);
   if(['access-paper','upload-ANSWER'].includes(action)){
    if(auth.workspace!=='LEARN'||readerPreview(auth,a.activity_key)||!await allowed(a.activity_key,a.class_id,'learner')||!await recipient(a.assessment_id))throw fail('Preview cannot submit or start a learner paper.',403,'PREVIEW_READ_ONLY');
   }else await requireClass(a.activity_key,a.class_id);
  }
  if(!/^[0-9a-f-]{36}$/i.test(input.operationId||''))throw fail('This action needs its retry identifier.');
  const hash=await payloadHash({action,input});
  const receipt=async()=>{const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='ASSESSMENT' AND scope_key=? AND operation_id=?",scope,input.operationId).first();if(!r)return null;if(r.actor_account_id!==actor||r.payload_sha256!==hash)throw fail('This retry identifier belongs to another change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};};
  for(let attempt=0;attempt<3;attempt++){
   const saved=await receipt();if(saved)return saved;
   const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
   const {statements,result,commitGuard}=await plan(),guard=crypto.randomUUID(),now=new Date().toISOString();
   if(repository.setup?.enabled&&(['publish','register-release'].includes(action)||action==='review-paper'&&input.decision==='APPROVE'))result.setupPublication={dataset:'ASSESSMENT',scope,operationId:input.operationId,sourceVersion:version.version+1,scopes:result.setupScopes};
   delete result.setupScopes;
   try{
    await db.batch([p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?) AND (${commitGuard?.sql||'1'}))`,guard,version.version,actor,auth.state.account.credential_epoch,auth.sid,now,...(commitGuard?.values||[])),...statements,
     p(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),now,actor,auth.user.role,scope,action,'ASSESSMENT',input.operationId,JSON.stringify({action})),
     p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('ASSESSMENT',?,?,?,?,?,?)",scope,input.operationId,hash,JSON.stringify(result),actor,now),p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
    return result;
   }catch(e){const recovered=await receipt();if(recovered)return recovered;if(!/academy_management_stale/.test(e.message))throw e;if(!await repository.session(auth.sid,actor,auth.state.account.credential_epoch))throw fail('Your Academy session has ended.',401);if(attempt===2)throw fail('Assessment information changed. Refresh before saving.',409,'ROW_CHANGED');}
  }
 }
 const touch=a=>p('UPDATE assessments SET revision=revision+1,updated_at=? WHERE assessment_id=?',new Date().toISOString(),a.assessment_id);
 return {db,p,actor,classes,allowed,readStaff,requireClass,assessment,recipient,requireReader,requireExaminer,moderator,roster,event,revision,recipientRevision,change,touch};
}
