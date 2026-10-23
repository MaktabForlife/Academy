// An explicit active/unarchived selection. Never infer deletion of the source.
import {digest,restoreSnapshot,identifier} from './snapshot.mjs';
export const excludedTables=Object.freeze([
 'academy_admissions','academy_import_schema','activity_source_bindings','source_record_map','legacy_identity_links',
 'library_access_policies','library_exclusions','program_library_destinations','program_library_roots','program_legacy_teachers',
 'attendance_registers','attendance_marks','lesson_media_comments',
 'migration_runs','migration_checks','learning_imports','course_workflow_imports','activity_policy_imports',
 'legacy_access_evidence','role_import_reviews','role_mapping_decisions','data_ownership',
 'd1_migrations'
]);
const key=v=>String(v||'').toUpperCase(),same=(a,b)=>key(a)===key(b);
const currentPolicyTables=new Set(['memorisation_account_settings','memorisation_activity_settings','course_session_state']);
const parentKeys={class_memberships:['classes',['activity_key','class_id']],class_teacher_assignments:['classes',['activity_key','class_id']],class_module_progress:['classes',['activity_key','class_id']],
 course_draft_sessions:['course_runs',['activity_key','run_id']],course_run_state:['course_runs',['activity_key','run_id']],course_run_access:['course_runs',['activity_key','run_id']],course_session_state:['course_runs',['activity_key','run_id']],course_draft_lifecycle:['course_runs',['activity_key','run_id']],course_management_drafts:['course_runs',['activity_key','run_id']],lesson_lifecycle:['timetable_publications',['activity_key','publication_id']],
 assessment_recipients:['assessments',['assessment_id']],assessment_submissions:['assessments',['assessment_id']],assessment_markings:['assessments',['assessment_id']],assessment_events:['assessments',['assessment_id']],assessment_collection:['assessments',['assessment_id']],assessment_attempts:['assessments',['assessment_id']],
 attendance_day_contexts:['attendance_days',['day_id']],attendance_series:['attendance_days',['day_id']],attendance_register_versions:['attendance_series',['series_id']],attendance_absences:['attendance_register_versions',['version_id']],attendance_delivery_rosters:['course_runs',['activity_key','run_id']],attendance_delivery_members:['course_runs',['activity_key','run_id']],
 lesson_plan_revisions:['lesson_plans',['plan_id']],lesson_plan_comments:['lesson_plans',['plan_id']],lesson_plan_deadlines:['lesson_plans',['plan_id']],lesson_note_versions:['lesson_note_entries',['note_id']],lesson_media_links:['lesson_media_lessons',['lesson_id']],lesson_media_visibility:['lesson_media_lessons',['lesson_id']]};
function identityFields(table){
 // Recorder/provenance references are not current ownership. Missing recorder
 // references are reported separately, never replaced by the importer actor.
 if(table==='accounts')return [];
 return ['account_id','owner_id','learner_account_id','teacher_account_id','teacher_id'].filter(k=>!(table==='teacher_availability'&&k!=='account_id'));
}
export function selectActiveSnapshot(snapshot,{at=new Date().toISOString()}={}){
 const db=restoreSnapshot(snapshot);
 try{
  const source=Object.fromEntries(snapshot.records.filter(r=>r.kind==='DATA').map(r=>[r.name,JSON.parse(r.data)]));
  const timezone=(source.academy_settings||[]).find(r=>r.setting_key==='PlatformTimezone')?.setting_value;if(!timezone)throw Error('Source app timezone is required.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
  const accounts=new Set((source.accounts||[]).filter(r=>r.active===1).map(r=>key(r.account_id)));
  const areas=new Set((source.activities||[]).filter(r=>r.active===1&&r.lifecycle==='ACTIVE'&&['PROGRAM','COURSE'].includes(r.kind)).map(r=>key(r.activity_key)));
  const runActive=new Set((source.course_runs||[]).filter(r=>r.active===1&&areas.has(key(r.activity_key))&&!(source.course_run_state||[]).some(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id)&&['ARCHIVED','CANCELLED'].includes(s.stage))).map(r=>key(r.activity_key)+'|'+key(r.run_id)));
  let rows={};const reasons={};
  for(const [table,values] of Object.entries(source)){
   if(excludedTables.includes(table)){reasons[table]='Retired workflow, old import/provenance or replaced compatibility authority; retain only in original/recovery source.';continue;}
   if(table.startsWith('setup_')){reasons[table]='Accepted inputs and referenced head history are selected separately; no blind candidate/history copy.';continue;}
   rows[table]=values.filter(r=>{
    if(table==='accounts')return accounts.has(key(r.account_id));
    if(r.activity_key&&!areas.has(key(r.activity_key)))return false;
    if(r.active===0&&!currentPolicyTables.has(table)||r.deleted_at||r.revoked_at||r.state==='ARCHIVED'||r.status==='ARCHIVED'||r.stage==='ARCHIVED')return false;
    if(r.run_id&&r.activity_key&&!runActive.has(key(r.activity_key)+'|'+key(r.run_id)))return false;
    if(identityFields(table).some(field=>r[field]&&!accounts.has(key(r[field]))))return false;
    if(table==='account_sessions'&&r.expires_at<=at)return false;
    if(table==='attendance_substitutes'&&Math.max(Date.parse(r.correction_until)||0,Date.parse(r.correction_reopen_until)||0)<=Date.parse(at))return false;
    if(table==='class_memberships'&&r.end_date&&r.end_date<today)return false;
    if(table==='academy_settings'&&(/^AcademyRefresh:|^AcademyWrite:/.test(r.setting_key)||['LessonMediaPilot','GlobalResourceDriveRootFolderID'].includes(r.setting_key)))return false;
    if(table==='operation_receipts')return accounts.has(key(r.actor_account_id))&&(!/^(PROGRAM|COURSE):/.test(r.scope_key)||areas.has(key(r.scope_key)))&&r.dataset_key!=='PROGRAM_ATTENDANCE';
    if(table==='academy_write_guards'||table==='audit_events'||table==='management_revisions')return false;
    return true;
   });
  }
  // Fixed-point parent filtering handles multi-level selected business records.
  let changed=true;
  while(changed){changed=false;for(const [table,[parent,fields]]of Object.entries(parentKeys))if(rows[table]){
   const filtered=rows[table].filter(row=>(rows[parent]||[]).some(p=>fields.every(f=>same(p[f],row[f]))));if(filtered.length!==rows[table].length){rows[table]=filtered;changed=true;}
  }}
  // Remove publications of excluded deliveries and publication dependants.
  if(rows.timetable_publications)rows.timetable_publications=rows.timetable_publications.filter(p=>p.pattern!=='COURSE'||runActive.has(key(p.activity_key)+'|'+key(p.scope_key)));
  const needed=new Set([...(rows.program_publication_state||[]).map(r=>r.latest_publication_id),...(rows.course_run_state||[]).map(r=>r.current_publication_id),...(rows.lesson_media_lessons||[]).map(r=>r.source_publication_id)].filter(Boolean));
  for(const publication of rows.timetable_publications||[])if(publication.effective_from>today)needed.add(publication.publication_id);
  // Current work may refer to an older immutable lesson version. Select that
  // exact reference, rather than every superseded publication in its area.
  function reference(value){if(!value||typeof value!=='object')return;for(const [name,child]of Object.entries(value)){if(/publication_?id/i.test(name)&&typeof child==='string')needed.add(child);else if(typeof child==='object')reference(child);else if(typeof child==='string'&&/json$/.test(name)){try{reference(JSON.parse(child));}catch{}}}}
  for(const table of ['lesson_plans','lesson_plan_revisions','attendance_day_contexts','lesson_note_versions'])for(const row of rows[table]||[])reference(row);
  if(rows.timetable_publications)rows.timetable_publications=rows.timetable_publications.filter(p=>needed.has(p.publication_id));
  if(rows.program_timetable_records)rows.program_timetable_records=rows.program_timetable_records.filter(r=>r.status!=='PUBLISHED'||!r.publication_id||needed.has(r.publication_id));
  const publications=new Set((rows.timetable_publications||[]).map(p=>key(p.activity_key)+'|'+key(p.publication_id)));
  for(const table of ['published_lessons','published_lesson_classes','published_lesson_teachers','program_publication_lifecycle','program_historical_extensions'])if(rows[table])rows[table]=rows[table].filter(r=>publications.has(key(r.activity_key)+'|'+key(r.publication_id)));
  if(rows.lesson_lifecycle)rows.lesson_lifecycle=rows.lesson_lifecycle.filter(r=>publications.has(key(r.activity_key)+'|'+key(r.publication_id)));
  // Materialise only permissions effective at the source, removing dependency
  // on historical imports. No new grant is inferred from a designation/roster.
  const effective=db.prepare("SELECT account_id,activity_key,role FROM effective_activity_roles UNION SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_role IN('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED'").all().filter(r=>accounts.has(key(r.account_id))&&areas.has(key(r.activity_key)));
  rows.role_assignments=effective.map(r=>{
   const explicit=source.role_assignments.find(s=>same(s.account_id,r.account_id)&&same(s.activity_key,r.activity_key)&&s.role===r.role&&s.active===1&&s.review_state==='CONFIRMED');if(explicit)return {...explicit,grant_source:'EXPLICIT',legacy_source_role:null};
   const evidence=source.legacy_access_evidence.find(e=>same(e.account_id,r.account_id)&&same(e.activity_key,r.activity_key)&&e.source_effective&&source.role_mapping_decisions.some(m=>m.source_role===e.source_role&&m.target_role===r.role));if(!evidence)throw Error('Current role provenance is missing.');
   return {assignment_id:'SPLIT-'+digest([key(r.account_id),key(r.activity_key),r.role]),account_id:r.account_id,activity_key:r.activity_key,role:r.role,active:1,review_state:'CONFIRMED',granted_at:null,granted_by_account_id:null,revision:1,grant_source:'LEGACY_MAPPED',legacy_source_role:evidence.source_role};
  });
  const subscriptions=db.prepare('SELECT account_id,activity_key FROM effective_course_subscriptions').all().filter(r=>accounts.has(key(r.account_id))&&areas.has(key(r.activity_key)));
  // Null recorder is explicit imported source provenance, never a fictitious
  // Administrator. The clean target subscription schema permits this import.
  rows.course_subscription_decisions=subscriptions.map(r=>source.course_subscription_decisions.find(s=>same(s.account_id,r.account_id)&&same(s.activity_key,r.activity_key)&&s.active===1)||{...r,active:1,revision:1,updated_at:snapshot.at,updated_by_account_id:null});
  rows.academy_write_state=[{singleton:1,version:1}];
  // Canonical current Program access replaces old policy-import joins.
  const settings=rows.academy_settings||(rows.academy_settings=[]);
  for(const p of source.activity_policy_imports||[])if(areas.has(key(p.activity_key))&&!settings.some(s=>s.setting_key==='ProgramAccess:'+key(p.activity_key)))settings.push({setting_key:'ProgramAccess:'+key(p.activity_key),setting_value:p.source_access_model,updated_at:snapshot.at,updated_by_account_id:null});
  const counts=Object.fromEntries(Object.entries(source).map(([table,values])=>[table,{source:values.length,selected:rows[table]?.length||0,excluded:values.length-(rows[table]?.length||0),reason:reasons[table]||'Active/unarchived owning record, current membership/session or required selected parent.'}]));
  const foreignKeyBlockers=[],actorReferences=new Set();
  for(const table of Object.keys(rows)){
   const groups=new Map();for(const fk of db.prepare('PRAGMA foreign_key_list('+identifier(table)+')').all()){if(!groups.has(fk.id))groups.set(fk.id,[]);groups.get(fk.id).push(fk);}
   for(const columns of groups.values()){
    const parent=columns[0].table;if(excludedTables.includes(parent)||parent.startsWith('setup_'))continue;
    for(const row of rows[table]){
     if(columns.some(c=>row[c.from]===null||row[c.from]===undefined))continue;
     if((rows[parent]||[]).some(p=>columns.every(c=>same(p[c.to],row[c.from]))))continue;
     if(parent==='accounts'&&columns.every(c=>/(?:by|actor|recorder|examiner|moderator)_?(?:account_)?id$|^(?:created|updated|uploaded|reviewed|submitted|confirmed|deleted)_by$|^ready_for_assessment_by$/.test(c.from))){for(const c of columns)actorReferences.add(row[c.from]);continue;}
     foreignKeyBlockers.push({table,columns:columns.map(c=>c.from),parentTable:parent,sourceKeyDigest:digest(columns.map(c=>row[c.from]))});
    }
   }
  }
  const manifest={format:'ACADEMY_SPLIT_SELECTION_V1',at,sourceAt:snapshot.at,sourceDigest:digest(snapshot),policy:'ACTIVE_UNARCHIVED_WITH_EXPLICIT_REFERENCES',counts,selectedAccounts:accounts.size,selectedAreas:areas.size,selectedDeliveries:runActive.size,canonicalRoles:effective.length,canonicalSubscriptions:subscriptions.length,opaqueHistoricalActorReferences:actorReferences.size,foreignKeyBlockers};
  return {rows,manifest,actorReferences:[...actorReferences],sourceSchema:snapshot.records.filter(r=>r.kind==='SCHEMA')};
 }finally{db.close();}
}
