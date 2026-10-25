import {publishedSessionRange,publishedSessionFacts} from './published-sessions.js';
import {assessmentRolesSQL,validDate,cleanText} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';
import {actualState,isAdminWorkspace,viewedClass} from './workspace-access.js';
import {academyDate,appTimezone,nextDate} from './academy-clock.js';
import {payloadHash} from '../../programs/timetable-model.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const teacherKey=source=>[...new Set(source.teacherIds.map(id=>id.toUpperCase()))].sort().join('|');
const unitKey=source=>source.moduleId?'MODULE:'+source.moduleId.toUpperCase():source.subjectId?'SUBJECT:'+source.subjectId.toUpperCase():'';
const sameTrack=(a,b)=>same(a.activityKey,b.activityKey)&&same(a.classId,b.classId)&&unitKey(a)&&unitKey(a)===unitKey(b)&&teacherKey(a)&&teacherKey(a)===teacherKey(b);

// One request-owned service. Permission queries always use current Core facts;
// accepted timetable facts supply context, never a caller's Teacher or class.
export function classNotes(repository,auth,now=()=>new Date()){
 const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),actor=auth.user.accountid;
 const areas=new Map(),ranges=new Map(),resolved=new Map(),facts=new Map();let timezone,today;
 async function ready(){
  if(!repository.setup?.head)throw fail('Class Notes needs the accepted timetable.',503,'SETUP_PUBLICATION_REQUIRED');
  try{await p('SELECT note_id FROM class_notes WHERE 0').all();}catch(error){if(/no such table/.test(error.message))throw fail('Class Notes is being prepared. Please try again shortly.',503,'CLASS_NOTES_SCHEMA_REQUIRED');throw error;}
  timezone=await appTimezone(repository);today=academyDate(now(),timezone);
 }
 async function area(key){
  if(typeof key!=='string'||key.length>200||!/^(PROGRAM|COURSE):[^:]+$/i.test(key))throw fail('Choose a Program or Course.');
  if(!areas.has(key.toUpperCase()))areas.set(key.toUpperCase(),await p("SELECT * FROM activities WHERE activity_key=? COLLATE NOCASE AND active=1 AND lifecycle='ACTIVE'",key).first());
  const value=areas.get(key.toUpperCase());if(!value)throw fail('These Class Notes are outside your current access.',403,'CLASS_NOTES_FORBIDDEN');return value;
 }
 async function factsFor(a){if(!facts.has(a.activity_key.toUpperCase()))for(const [key,value]of await publishedSessionFacts(repository,[a.activity_key]))facts.set(key,value);return facts.get(a.activity_key.toUpperCase());}
 async function range(a,start,end){
  const key=JSON.stringify([a.activity_key,start,end]);
  for(const [prior,promise]of ranges){const [activity,from,to]=JSON.parse(prior);if(activity===a.activity_key&&from<=start&&to>=end)return (await promise).filter(row=>row.date>=start&&row.date<=end);}
  if(!ranges.has(key))ranges.set(key,publishedSessionRange(repository,a,start,end,{maxDays:366,facts:await factsFor(a)}).then(result=>Promise.all(result.lessons.map(lesson=>context(a,lesson)))));
  return ranges.get(key);
 }
 async function context(a,lesson){
  const value={activityKey:a.activity_key,activityName:a.name,kind:a.kind,date:lesson.date,classId:lesson.classId,className:lesson.className||lesson.classNames?.[0]||'',runId:lesson.runId||'',stableKey:lesson.stableKey,
   publicationId:lesson.publicationId,anchor:lesson.anchor,sourceAnchor:lesson.sourceAnchor||lesson.anchor,sourceSessionId:lesson.sourceSessionId||'',moduleId:lesson.moduleId||'',subjectId:lesson.programSubjectId||lesson.subjectId||'',
   title:lesson.moduleName||lesson.subjectName||a.name,subjectName:lesson.subjectName||'',teacherIds:lesson.teacherIds||[],teacherNames:lesson.teacherNames||[],startTime:lesson.startTime,endTime:lesson.endTime,timezone,
   sessionKey:JSON.stringify(a.kind==='PROGRAM'?['PROGRAM',lesson.date,lesson.sourceAnchor||lesson.anchor]:['COURSE',lesson.runId,lesson.sourceSessionId])};
  value.id='CNC-'+await payloadHash([a.activity_key.toUpperCase(),...(a.kind==='PROGRAM'?[lesson.date]:[]),lesson.stableKey]);value.token=await payloadHash(value);return value;
 }
 function accessClause(mode){
  const values=[],bind=value=>{values.push(value);return '?';},field=name=>`json_extract(j.value,'$.${name}')`;
  const key=field('activityKey'),klass=field('classId'),date=field('date'),run=field('runId');
  const role=value=>`EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) role WHERE role.account_id=me.account_id AND role.activity_key=${key} COLLATE NOCASE AND role.role='${value}')`;
  const scopeAdmin=`(EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=me.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR ${role('PROGRAM_ADMIN')})`;
  const teacher=`(${role('TEACHER')} AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=${key} COLLATE NOCASE AND t.class_id=${klass} COLLATE NOCASE AND t.account_id=me.account_id) OR EXISTS(SELECT 1 FROM json_each(j.value,'$.teacherIds') t WHERE t.value=me.account_id COLLATE NOCASE)))`;
  const programLearner=`(${role('STUDENT')} AND EXISTS(SELECT 1 FROM class_memberships m JOIN classes c ON c.activity_key=m.activity_key AND c.class_id=m.class_id WHERE m.account_id=me.account_id AND m.activity_key=${key} COLLATE NOCASE AND m.class_id=${klass} COLLATE NOCASE AND c.active=1 AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=min(${date},${bind(today)})) AND (m.end_date IS NULL OR m.end_date>=max(${date},${bind(today)}))))`;
  const courseLearner=`((${role('STUDENT')} OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=me.account_id AND s.activity_key=${key} COLLATE NOCASE) OR EXISTS(SELECT 1 FROM course_settings cs WHERE cs.activity_key=${key} COLLATE NOCASE AND cs.legacy_access_model='FREE' AND cs.policy_review_state='CONFIRMED')) AND EXISTS(SELECT 1 FROM attendance_delivery_members m JOIN course_runs cr ON cr.activity_key=m.activity_key AND cr.run_id=m.run_id JOIN course_run_state rs ON rs.activity_key=cr.activity_key AND rs.run_id=cr.run_id WHERE m.activity_key=${key} COLLATE NOCASE AND m.run_id=${run} COLLATE NOCASE AND m.account_id=me.account_id AND m.state='VALID' AND cr.active=1 AND coalesce(rs.stage,'') NOT IN('CANCELLED','ARCHIVED') AND m.join_date<=min(${date},${bind(today)}) AND (m.leave_date IS NULL OR m.leave_date>=max(${date},${bind(today)}))))`;
  // Keep the fixed parameter layout even on surfaces that cannot use a branch.
  const learner=`CASE WHEN ${field('kind')}='PROGRAM' THEN ${programLearner} ELSE ${courseLearner} END`;
  let surface;
  if(auth.adminView&&auth.workspace==='LEARN')surface=mode==='read'?scopeAdmin:'0';
  else if(isAdminWorkspace(auth))surface=scopeAdmin;
  else if(auth.workspace==='TEACH')surface=auth.adminView?scopeAdmin:teacher;
  else surface=mode==='moderate'?'0':learner;
  // Learner parameters are included only when that expression is used.
  const used=surface===learner?values:[];
  let sql=`EXISTS(SELECT 1 FROM accounts me WHERE me.account_id=? COLLATE NOCASE AND me.active=1 AND EXISTS(SELECT 1 FROM activities a WHERE a.activity_key=${key} COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE') AND (${surface}))`;
  const selected=viewedClass(auth,'')||auth.classView;
  if(auth.adminView&&auth.workspace==='LEARN'&&selected&&typeof selected==='object'){
   sql+=` AND (${key}<>? COLLATE NOCASE OR ${klass}=? COLLATE NOCASE)`;used.push(selected.activityKey,selected.classId);
  }
  return {sql,values:[actor,...used]};
 }
 async function rights(contexts){
  if(!contexts.length)return new Map();
  const read=accessClause('read'),write=accessClause('write'),moderate=accessClause('moderate');
  const rows=(await p(`SELECT json_extract(j.value,'$.id') id,(${read.sql}) canRead,(${write.sql}) canWrite,(${moderate.sql}) canModerate FROM json_each(?) j`,...read.values,...write.values,...moderate.values,JSON.stringify(contexts)).all()).results;
  return new Map(rows.map(row=>[row.id,{canRead:Boolean(row.canRead),canPost:Boolean(row.canWrite),canModerate:Boolean(row.canModerate)}]));
 }
 async function requireAccess(source,mode='read'){
  const value=(await rights([source])).get(source.id);
  if(!value?.[mode==='read'?'canRead':mode==='moderate'?'canModerate':'canPost'])throw fail('These Class Notes are outside your current class or teaching access.',403,'CLASS_NOTES_FORBIDDEN');return value;
 }
 async function live(stored){
  if(resolved.has(stored.id))return resolved.get(stored.id);
  const a=await area(stored.activityKey);let date=stored.date;
  if(a.kind==='COURSE'){
   const accepted=await factsFor(a),run=accepted.runs.find(row=>same(row.run_id,stored.runId)),publication=accepted.publications.find(row=>same(row.publication_id,run?.current_publication_id));
   const row=publication&&JSON.parse(publication.snapshot_json).sessions?.find(row=>(row.SourceSessionID||row.PublishedSessionID)===stored.sourceSessionId);
   if(row)date=row.SessionDate;
  }
  const found=validDate(date)&&(await range(a,date,date)).find(row=>row.stableKey===stored.stableKey);
  const result=found?{...found,id:stored.id,originalDate:stored.date,moved:found.date!==stored.date,contextChanged:!sameTrack(found,stored)}:{...stored,teacherIds:[],unresolved:true};
  resolved.set(stored.id,result);return result;
 }
 async function storedContext(id){
  const row=await p('SELECT * FROM class_note_contexts WHERE context_id=?',id).first();if(!row)throw fail('Class Note lesson not found.',404,'CLASS_NOTE_NOT_FOUND');return JSON.parse(row.source_json);
 }
 async function selection(a,input){
  if(input.contextId){const stored=await storedContext(input.contextId);if(!same(stored.activityKey,a.activity_key))throw fail('Choose a lesson in this learning area.',403);return live(stored);}
  const source=input.source||input;
  if(!validDate(source.date)||typeof source.sessionKey!=='string'||source.sessionKey.length>1200)throw fail('Choose a lesson from the timetable.');
  const candidates=(await range(a,source.date,source.date)).filter(row=>row.sessionKey===source.sessionKey&&(!source.classId||same(row.classId,source.classId)));
  const permissions=await rights(candidates),allowed=candidates.filter(row=>permissions.get(row.id)?.canRead);
  if(allowed.length!==1)throw fail(allowed.length?'Choose your class for this lesson.':'This lesson is outside your current class or teaching access.',allowed.length?409:403,allowed.length?'CLASS_NOTE_CLASS_REQUIRED':'CLASS_NOTES_FORBIDDEN');return allowed[0];
 }
 async function nextDue(a,source){
  if(!unitKey(source)||!teacherKey(source))return null;
  const upcoming=(await publishedSessionRange(repository,a,source.date,nextDate(source.date,366),{maxDays:366,classId:source.classId,facts:await factsFor(a)})).lessons;
  const target=upcoming.filter(row=>sameTrack({...row,activityKey:a.activity_key,subjectId:row.programSubjectId||row.subjectId||'',teacherIds:row.teacherIds||[]},source)&&(row.date>source.date||row.date===source.date&&row.startTime>source.startTime)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.stableKey.localeCompare(b.stableKey))[0];
  return target?dueValue('NEXT',target.date,await context(a,target)):null;
 }
 async function dueValue(mode,date,target){
  const value={mode,date,target:target||null};return {...value,token:await payloadHash({mode,date,target:target?.token||''})};
 }
 async function resolveDue(a,source,input){
  const choice=input.due||{},mode=choice.mode;
  if(mode==='NEXT'){
   const value=await nextDue(a,source);if(!value)throw fail('No next matching session is available. Select a due date.',409,'CLASS_NOTE_DUE_REQUIRED');return value;
  }
  if(mode!=='DATE'||!validDate(choice.date)||choice.date<source.date)throw fail('Select a due date on or after this lesson’s date.');
  const target=(await range(a,choice.date,choice.date)).filter(row=>sameTrack(row,source)).sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id))[0];
  return dueValue('DATE',choice.date,target);
 }
 async function effectiveDue(row){
  const saved=JSON.parse(row.due_json);if(!saved.target)return saved;
  const current=await live(saved.target);
  if(saved.mode==='NEXT'){const needsReview=current.unresolved||!sameTrack(saved.target,current);return {...saved,date:needsReview?saved.date:current.date,target:current,needsReview:Boolean(needsReview),originalDate:saved.date};}
  const target=(await range(await area(saved.target.activityKey),saved.date,saved.date)).find(value=>sameTrack(value,saved.target));
  return {...saved,target:target||null};
 }
 const joined=`SELECT n.*,v.body,v.due_mode,v.due_date,v.due_context_id,v.due_json,v.reason,v.previous_version_id,v.created_by editor_id,v.created_at edited_at,a.display_name author_name,e.display_name editor_name,u.display_name updater_name FROM class_notes n JOIN class_note_versions v ON v.version_id=n.current_version_id JOIN accounts a ON a.account_id=n.created_by JOIN accounts e ON e.account_id=v.created_by JOIN accounts u ON u.account_id=n.updated_by`;
 async function noteRow(id){const row=await p(joined+' WHERE n.note_id=?',cleanText(id,200,'a Class Note')).first();if(!row)throw fail('Class Note not found.',404,'CLASS_NOTE_NOT_FOUND');return row;}
 async function dto(row,permission){
  return {id:row.note_id,activityKey:row.activity_key,contextId:row.context_id,versionId:row.current_version_id,revision:row.revision,authorId:row.created_by,author:row.author_name,createdAt:row.created_at,updatedAt:row.updated_at,editor:row.state==='WITHDRAWN'?row.updater_name:row.editor_name,state:row.state,
   ...(row.state==='ACTIVE'||permission.canModerate?{body:row.body,due:await effectiveDue(row)}:{}),canEdit:row.state==='ACTIVE'&&permission.canPost&&(same(row.created_by,actor)||permission.canModerate),canWithdraw:row.state==='ACTIVE'&&permission.canModerate,canRelink:row.state==='ACTIVE'&&permission.canModerate,withdrawnAt:row.withdrawn_at};
 }
 async function lessonView(a,source,focus='',input={}){
  const permission=await requireAccess(source),before=input.before;
  if(before&&(typeof before.createdAt!=='string'||before.createdAt.length>40||typeof before.id!=='string'||before.id.length>200))throw fail('Choose a valid notes page.');
  const rows=(await p(joined+' WHERE n.activity_key=? COLLATE NOCASE AND n.context_id=?'+(before?' AND (n.created_at<? OR (n.created_at=? AND n.note_id<?))':'')+' ORDER BY n.created_at DESC,n.note_id DESC LIMIT 51',a.activity_key,source.id,...(before?[before.createdAt,before.createdAt,before.id]:[])).all()).results;
  const more=rows.length>50,page=rows.slice(0,50),last=page.at(-1);
  if(focus&&!page.some(row=>row.note_id===focus)){const focused=await noteRow(focus);if(focused.context_id===source.id)page.unshift(focused);}
  return {source:{...source,...permission,canPost:permission.canPost&&!source.unresolved},notes:await Promise.all(page.map(row=>dto(row,permission))),before:more?{createdAt:last.created_at,id:last.note_id}:null,nextDue:source.unresolved?null:await nextDue(a,source),focusNoteId:focus,today,timezone};
 }
 async function timetable(input){
  if(!Array.isArray(input.sessions)||input.sessions.length>200)throw fail('Choose up to 200 timetable lessons.');
  const refs=input.sessions.filter(r=>r&&typeof r.activityKey==='string'&&validDate(r.date)&&typeof r.sessionKey==='string'&&r.sessionKey.length<=1200);
  if(refs.length!==input.sessions.length)throw fail('Choose valid timetable lessons.');
  const groups=new Map();for(const ref of refs){const key=ref.activityKey.toUpperCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(ref);}
  const missing=[...groups.keys()].filter(key=>!facts.has(key));for(const key of missing)await area(key);if(missing.length)for(const [key,value]of await publishedSessionFacts(repository,missing))facts.set(key,value);
  const contexts=[];
  for(const group of groups.values()){
   const a=await area(group[0].activityKey),dates=group.map(r=>r.date).sort();if(Date.parse(dates.at(-1))-Date.parse(dates[0])>31*86400000)throw fail('Choose a timetable period of up to 31 days.');
   const accepted=await range(a,dates[0],dates.at(-1));contexts.push(...accepted.filter(row=>group.some(r=>r.date===row.date&&r.sessionKey===row.sessionKey)));
  }
  const permissions=await rights(contexts),allowed=contexts.filter(row=>permissions.get(row.id)?.canRead),keys=[...new Set(allowed.map(row=>row.activityKey))];
  const timetableJoined=joined.replace('n.*,v.body,v.due_mode,v.due_date,v.due_context_id,v.due_json,v.reason,v.previous_version_id,v.created_by editor_id,v.created_at edited_at','n.note_id,n.activity_key,n.context_id,n.state,v.due_mode,v.due_date,v.due_context_id,v.due_json');
  const rows=keys.length?(await p(timetableJoined+" WHERE n.activity_key IN(SELECT value FROM json_each(?)) AND n.state='ACTIVE' AND (n.context_id IN(SELECT value FROM json_each(?)) OR v.due_date BETWEEN ? AND ? OR (v.due_mode='NEXT' AND json_extract(v.due_json,'$.target.kind')='COURSE' AND json_extract(v.due_json,'$.target.stableKey') IN(SELECT value FROM json_each(?)))) ORDER BY n.created_at DESC LIMIT 5001",JSON.stringify(keys),JSON.stringify(allowed.map(row=>row.id)),refs.map(r=>r.date).sort()[0],refs.map(r=>r.date).sort().at(-1),JSON.stringify(allowed.filter(row=>row.kind==='COURSE').map(row=>row.stableKey))).all()).results:[];
  if(rows.length>5000)throw fail('Choose a smaller timetable period for Class Notes.',409,'CLASS_NOTE_LIST_LIMIT');
  const sourceIds=[...new Set(rows.map(row=>row.context_id))],stored=sourceIds.length?(await p('SELECT source_json FROM class_note_contexts WHERE context_id IN(SELECT value FROM json_each(?))',JSON.stringify(sourceIds)).all()).results:[];
  const originals=await Promise.all(stored.map(row=>live(JSON.parse(row.source_json)))),sourceRights=await rights(originals),dueRows=[];
  for(const row of rows)if(sourceRights.get(row.context_id)?.canRead){const due=await effectiveDue(row);if(due.target&&!due.needsReview)dueRows.push({row,due});}
  return {today,timezone,sessions:refs.map(ref=>{
   const sources=allowed.filter(row=>row.activityKey.toUpperCase()===ref.activityKey.toUpperCase()&&row.date===ref.date&&row.sessionKey===ref.sessionKey);
   const reminders=dueRows.filter(({due})=>sources.some(source=>same(source.classId,due.target.classId)&&same(source.activityKey,due.target.activityKey)&&source.stableKey===due.target.stableKey&&source.date===due.date));
   return {ref:JSON.stringify([ref.activityKey,ref.date,ref.sessionKey]),sources:sources.map(source=>({...source,...permissions.get(source.id),noteCount:rows.filter(row=>row.context_id===source.id).length})),noteCount:rows.filter(row=>sources.some(source=>source.id===row.context_id)).length,dueNotes:reminders.map(({row,due})=>({id:row.note_id,author:row.author_name,title:originals.find(source=>source.id===row.context_id)?.title||'Class Note',date:due.date,sourceContextId:row.context_id}))};
  })};
 }
 function contextInsert(source,timestamp){
  return p('INSERT INTO class_note_contexts(context_id,activity_key,class_id,lesson_date,stable_key,source_json,source_head,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(context_id) DO NOTHING',source.id,source.activityKey,source.classId,source.date,source.stableKey,JSON.stringify(source),repository.setup.head,timestamp);
 }
 async function mutate(action,input){
  if(!uuid.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  if(auth.adminView&&auth.workspace==='LEARN')throw fail('Student class viewing is read only.',403,'PREVIEW_READ_ONLY');
  const version=(await p('SELECT version FROM academy_write_state WHERE singleton=1').first()).version;
  const a=await area(input.activityKey);
  const hash=await payloadHash({action,input}),receipt=async()=>{
   const row=await p("SELECT * FROM operation_receipts WHERE dataset_key='CLASS_NOTES' AND scope_key=? AND operation_id=?",a.activity_key,input.operationId).first();
   if(!row)return null;if(!same(row.actor_account_id,actor)||row.payload_sha256!==hash)throw fail('This retry belongs to another change.',409,'OPERATION_ID_REUSED');const result=JSON.parse(row.result_json),note=await noteRow(result.noteId);await requireAccess(await live(await storedContext(note.context_id)),action==='withdraw'||action==='relink'?'moderate':'write');return {...result,replayed:true};
  };
  const saved=await receipt();if(saved)return saved;
  const old=action==='post'?null:await noteRow(input.noteId);
  if(old&&!same(old.activity_key,a.activity_key))throw fail('This note is outside this learning area.',403);
  const oldSource=old?await live(await storedContext(old.context_id)):null,source=action==='post'||action==='relink'?await selection(a,input):oldSource;
  if(action==='relink')await requireAccess(source,'moderate');
  const permission=await requireAccess(oldSource||source,action==='withdraw'||action==='relink'?'moderate':'write');
  if(old&&action==='revise'&&!same(old.created_by,actor)&&!permission.canModerate)throw fail('You can correct only your own Class Notes.',403,'CLASS_NOTES_FORBIDDEN');
  if(old&&(old.revision!==input.revision||old.state!=='ACTIVE'))throw fail('This note changed. Your text is kept; refresh before saving.',409,'CLASS_NOTE_CHANGED');
  if(action==='post'&&(source.unresolved||input.sourceToken!==source.token))throw fail('The lesson changed. Refresh before posting your note.',409,'CLASS_NOTE_SOURCE_CHANGED');
  if(action==='relink'&&(source.unresolved||!same(source.classId,oldSource.classId)||input.sourceToken!==source.token))throw fail('Choose an accepted lesson in the same class.',409,'CLASS_NOTE_SOURCE_CHANGED');
  let body,due,reason='';
  if(action!=='withdraw'){
   body=action==='relink'?old.body:cleanText(input.body,12000,'a Class Note');
   reason=action==='relink'?cleanText(input.reason,1000,'a reason for changing the linked lesson'):'';
   if(old&&action!=='relink'&&input.due?.keep===true)due=JSON.parse(old.due_json);
   else {due=await resolveDue(a,source,input);if(input.due?.token!==due.token)throw fail('The due lesson changed. Review the updated date before saving.',409,'CLASS_NOTE_DUE_CHANGED');}
  }
  const timestamp=now().toISOString(),noteId=old?.note_id||crypto.randomUUID(),versionId=action==='withdraw'?old.current_version_id:crypto.randomUUID(),revision=old?old.revision+1:1,guard=crypto.randomUUID(),statements=[];
  if(action!=='withdraw'){
   statements.push(contextInsert(source,timestamp));if(due.target)statements.push(contextInsert(due.target,timestamp));
   if(!old)statements.push(p("INSERT INTO class_notes(note_id,activity_key,context_id,created_by,created_at,current_version_id,state,revision,updated_at,updated_by) VALUES(?,?,?,?,?,NULL,'ACTIVE',1,?,?)",noteId,a.activity_key,source.id,actor,timestamp,timestamp,actor));
   statements.push(p('INSERT INTO class_note_versions(version_id,note_id,revision,context_id,body,due_mode,due_date,due_context_id,due_json,source_head,previous_version_id,reason,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',versionId,noteId,revision,source.id,body,due.mode,due.date,due.target?.id||null,JSON.stringify(due),repository.setup.head,old?.current_version_id||null,reason,timestamp,actor),p('UPDATE class_notes SET context_id=?,current_version_id=?,revision=?,updated_at=?,updated_by=? WHERE note_id=?',source.id,versionId,revision,timestamp,actor,noteId));
  }else statements.push(p("UPDATE class_notes SET state='WITHDRAWN',revision=?,updated_at=?,updated_by=?,withdrawn_at=? WHERE note_id=?",revision,timestamp,actor,timestamp,noteId));
  const mode=action==='withdraw'||action==='relink'?'moderate':'write',access=accessClause(mode),result={noteId,contextId:source.id,versionId,revision};
  const expected=old?'AND EXISTS(SELECT 1 FROM class_notes n WHERE n.note_id=? AND n.revision=? AND n.state=\'ACTIVE\')':'';
  try{
   await db.batch([
    p(`INSERT INTO academy_write_guards VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND (SELECT head_id FROM setup_head_state WHERE singleton=1)=? AND EXISTS(SELECT 1 FROM account_sessions s JOIN account_credentials c USING(account_id) WHERE s.session_id=? AND s.account_id=? COLLATE NOCASE AND c.credential_epoch=? AND s.credential_epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT (${access.sql})) ${expected})`,guard,version,repository.setup.head,auth.sid,actor,actualState(auth).account.credential_epoch,JSON.stringify(action==='relink'?[oldSource,source]:[oldSource||source]),...access.values,...(old?[old.note_id,old.revision]:[])),
    ...statements,
    p("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,'CLASS_NOTE',?,?)",crypto.randomUUID(),timestamp,actor,permission.canModerate?'CLASS_STAFF':'STUDENT',a.activity_key,action,noteId,JSON.stringify({contextId:source.id,previousContextId:old?.context_id||null,versionId,revision,dueDate:due?.date||null,reason})),
    p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('CLASS_NOTES',?,?,?,?,?,?)",a.activity_key,input.operationId,hash,JSON.stringify(result),actor,timestamp),
    p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
   ]);return result;
  }catch(error){const recovered=await receipt();if(recovered)return recovered;if(/academy_management_stale|split_write_busy|class_note_version_mismatch|UNIQUE constraint/.test(error.message))throw fail('The note, timetable or your access changed. Your text is kept; refresh before saving.',409,'CLASS_NOTE_CHANGED');throw error;}
 }
 return {async run(action,input={}){
  await ready();
  if(action==='timetable')return timetable(input);
  const a=await area(input.activityKey);
  if(['post','revise','withdraw','relink'].includes(action))return mutate(action,input);
  if(action==='sessions'){
   if(!validDate(input.date))throw fail('Choose a lesson date.');const candidates=await range(a,input.date,input.date),permissions=await rights(candidates);
   return {sources:candidates.filter(row=>permissions.get(row.id)?.canRead).map(row=>({...row,...permissions.get(row.id)})),today,timezone};
  }
  if(action==='history'){
   const note=await noteRow(input.noteId);if(!same(note.activity_key,a.activity_key))throw fail('Class Note not found.',404);const source=await live(await storedContext(note.context_id)),permission=await requireAccess(source);
   if(note.state==='WITHDRAWN'&&!permission.canModerate)return {versions:[]};
   if(input.beforeRevision!==undefined&&(!Number.isInteger(input.beforeRevision)||input.beforeRevision<1))throw fail('Choose a valid history page.');
   const rows=(await p('SELECT v.*,a.display_name editor_name FROM class_note_versions v JOIN accounts a ON a.account_id=v.created_by WHERE v.note_id=?'+(input.beforeRevision?' AND v.revision<?':'')+' ORDER BY v.revision DESC LIMIT 51',note.note_id,...(input.beforeRevision?[input.beforeRevision]:[])).all()).results;
   return {beforeRevision:rows.length>50?rows[49].revision:null,versions:rows.slice(0,50).map(v=>({id:v.version_id,revision:v.revision,body:v.body,createdAt:v.created_at,editor:v.editor_name,due:JSON.parse(v.due_json),contextId:v.context_id,reason:v.reason})),timezone};
  }
  let source;
  if(input.noteId){const note=await noteRow(input.noteId);if(!same(note.activity_key,a.activity_key))throw fail('Class Note not found.',404);source=await live(await storedContext(note.context_id));}
  else source=await selection(a,input);
  if(action==='get')return lessonView(a,source,input.noteId||'',input);
  if(action==='due'){await requireAccess(source);return {due:await resolveDue(a,source,input)};}
  throw fail('Unknown Class Notes action.',404);
 }};
}
