import {assessmentOperations,timingFields,collectionPolicy,readyEligibility} from './assessment-timing.js';
import {appTimezone,academyDate,dayStart,nextDate,localInstant} from './academy-clock.js';
import {isAdminWorkspace} from './workspace-access.js';
import {assessmentStore,cleanText,validDate,paperAvailable} from './assessment-store.js';
import {administers,viewedClass,readerPreview} from './workspace-access.js';
import {managementError as fail,same} from './management-store.js';
import {registerList,createRegister,saveRegister,validateRegister,releaseRegister,legacyRegisterPlan,requireRegisterClass,newRegisterStatements} from './assessment-register.js';

export function d1Assessments(repository,auth){
 const s=assessmentStore(repository,auth),{p,actor}=s,native=assessmentOperations(repository);
 const collection=a=>native?p('SELECT * FROM assessment_collection WHERE assessment_id=?',a.assessment_id).first():Promise.resolve(null);
 const metadata=(a,c=null)=>{c||=a.collection_revision?{effective_due_at:a.effective_due_at,closed_at:a.closed_at,revision:a.collection_revision}:null;return native?{assessmentKind:a.assessment_kind||'EXAM',timingMode:a.timing_mode||'TIMED',availableFrom:a.available_from,dueAt:c?.effective_due_at||a.due_at,timezone:a.timezone||'Africa/Johannesburg',collectionClosed:Boolean(c?.closed_at),collectionRevision:c?.revision||0,...(auth.workspace==='LEARN'?{}:{allowanceMinutes:a.allowance_minutes,paperSHA256:a.paper_sha256})}:{};};
 async function catalogue(){
  const subjects=(await p("SELECT subject_key,name FROM subject_catalog WHERE source_namespace='ACADEMY' AND active=1 ORDER BY name").all()).results;
  const modules=(await p("SELECT m.module_id,m.name,s.name subject_name FROM academy_module_catalogue m LEFT JOIN subject_catalog s ON s.subject_key=m.subject_key WHERE m.active=1 AND (s.subject_key IS NULL OR s.active=1 AND s.source_namespace='ACADEMY') ORDER BY s.name,m.name").all()).results;
  return [...subjects.map(s=>({key:'SUBJECT:'+s.subject_key,label:s.name,kind:'SUBJECT'})),...modules.map(m=>({key:'MODULE:ACADEMY:'+m.module_id,label:m.subject_name?m.subject_name+' · '+m.name:m.name,kind:'MODULE'}))];
 }
 const fields=async(input,current=null)=>{
  const descriptor=cleanText(input.subjectDescriptor??current?.subject_descriptor??'',160,'a subject descriptor',true);
  const title=cleanText(input.title,160,'an assessment title'),options=await catalogue(),choice=input.catalogueKey?options.find(c=>c.key===input.catalogueKey):options.find(c=>c.label===input.subject);
  const subject=choice?.label||(current&&input.subject===current.subject&&!input.catalogueKey?current.subject:'');
  if(!subject)throw fail('Choose an active Academy subject or module.');
  const timing=native?await timingFields(repository,input,current):null;
  if((!native&&(!validDate(input.examDate)||!Number.isInteger(input.durationMinutes)||input.durationMinutes<1||input.durationMinutes>1440))||typeof input.maximumMark!=='number'||!Number.isFinite(input.maximumMark)||input.maximumMark<=0||input.maximumMark>1000000)throw fail('Enter a valid exam date, duration and maximum mark.');
  return {title,subject,descriptor,date:timing?timing.date:input.examDate,duration:timing?timing.duration:input.durationMinutes,maximum:input.maximumMark,timing};
 };
 async function phaseFor(id,activityKey){
  if(id===undefined||id===null||id==='')return null;
  if(typeof id!=='string'||!await p('SELECT 1 ok FROM assessment_phases WHERE phase_id=? AND activity_key=?',id,activityKey).first())throw fail('Choose an assessment phase in this learning area.',403);
  return id;
 }
 async function createPhase(input){cleanText(input.activityKey,200,'a learning area');return s.change('phase-create',input,input.activityKey,async()=>{
  if(!(await s.classes('admin',input.activityKey)).length)throw fail('This learning area is outside your assessment administration access.',403);
  const name=cleanText(input.name,160,'an assessment phase name'),normalised=name.toLocaleLowerCase('en').replace(/\s+/g,' ');
  if(await p('SELECT 1 ok FROM assessment_phases WHERE activity_key=? AND name_normalised=?',input.activityKey,normalised).first())throw fail('An assessment phase with this name already exists in this learning area.',409);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  return {statements:[p('INSERT INTO assessment_phases VALUES(?,?,?,?,?,?)',id,input.activityKey,name,normalised,now,actor),...newRegisterStatements(s,{id,name,keys:[input.activityKey],phaseId:id}),s.event({activity_key:input.activityKey},'phase-create',{phaseId:id,name})],result:{phaseId:id}};
 });}
 const rosterStatement=(a,rows)=>p(`INSERT INTO assessment_recipients(assessment_id,account_id,display_name) SELECT ?,json_extract(value,'$.account_id'),json_extract(value,'$.display_name') FROM json_each(?) WHERE 1 ON CONFLICT(assessment_id,account_id) DO NOTHING`,a.assessment_id,JSON.stringify(rows));
 async function learnerList(input){
  const classes=await s.classes('learner',input.activityKey||''),visible=[];
  const rows=(await p(`SELECT x.*${native?',col.effective_due_at,col.closed_at,col.revision collection_revision':''},c.name class_name,a.name activity_name FROM assessments x ${native?'LEFT JOIN assessment_collection col ON col.assessment_id=x.assessment_id':''} JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.deleted_at IS NULL AND x.schedule_published=1 AND (?='' OR x.activity_key=?) ORDER BY x.exam_date,x.title LIMIT 1001`,input.activityKey||'',input.activityKey||'').all()).results;
  const own=new Set((await p('SELECT assessment_id FROM assessment_recipients WHERE account_id=?',actor).all()).results.map(r=>r.assessment_id));
  for(const a of rows){if(viewedClass(auth,a.activity_key)&&!same(viewedClass(auth,a.activity_key),a.class_id)||!classes.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))||input.kind&&a.activity_key.split(':')[0]!==input.kind||!own.has(a.assessment_id)&&!administers(auth,a.activity_key))continue;
   visible.push({...metadata(a),id:a.assessment_id,activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,examDate:a.exam_date,published:true,paperAvailable:paperAvailable(a),paperState:paperAvailable(a)?'AVAILABLE':'WAITING',canAdmin:false,canTeach:false,isExaminer:false,canModerate:false});
  }
  return {assessments:visible,phases:[],classes:[],registers:[],catalogue:[],canAdmin:false,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
 }
 async function list(input){
  if(auth.workspace==='LEARN')return learnerList(input);
  const filter=rows=>['PROGRAM','COURSE'].includes(input.kind)?rows.filter(c=>c.kind===input.kind):rows;
  const staff=filter(await s.classes('staff',input.activityKey||'')),admin=filter(await s.classes('admin',input.activityKey||'')),learner=filter(await s.classes('learner',input.activityKey||''));
  const actualStaff=auth.workspace==='TEACH'?await s.classes('staff',input.activityKey||'',false):staff;
  const preview=input.view==='learner';if(preview&&!admin.length)throw fail('Learner preview requires this learning area’s Admin access.',403,'FORBIDDEN');
  const rows=(await p(`SELECT x.*${native?',col.effective_due_at,col.closed_at,col.revision collection_revision':''},COALESCE(ar.name,ph.name) phase_name,c.name class_name,a.name activity_name,(SELECT display_name FROM accounts u WHERE u.account_id=x.examiner_id) examiner_name FROM assessments x ${native?'LEFT JOIN assessment_collection col ON col.assessment_id=x.assessment_id':''} LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id LEFT JOIN assessment_registers ar ON ar.register_id=x.register_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.deleted_at IS NULL AND (?='' OR x.activity_key=?) AND (EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.activity_key')=x.activity_key AND json_extract(j.value,'$.class_id')=x.class_id) OR x.schedule_published=1 AND EXISTS(SELECT 1 FROM assessment_recipients r WHERE r.assessment_id=x.assessment_id AND r.account_id=?) AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.activity_key')=x.activity_key AND json_extract(j.value,'$.class_id')=x.class_id)) ORDER BY x.exam_date,x.title LIMIT 1001`,input.activityKey||'',input.activityKey||'',JSON.stringify(staff),actor,JSON.stringify(learner)).all()).results;
  if(rows.length>1000)throw fail('Choose a learning area to narrow the assessment list.',409);
  const ids=staff.length?rows.map(a=>a.assessment_id):[],results=ids.length?(await p(`SELECT r.assessment_id,
   sum(CASE WHEN r.latest_submission_id IS NOT NULL THEN 1 ELSE 0 END) uploaded,
   sum(CASE WHEN r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NOT NULL THEN 1 ELSE 0 END) checked,
   sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state IN('IN_REVIEW','APPROVED') THEN 1 ELSE 0 END) assessed,
   sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state='APPROVED' THEN 1 ELSE 0 END) moderated,
   sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state='APPROVED' AND r.released_mark_id=m.mark_id THEN 1 ELSE 0 END) released
   FROM assessment_recipients r LEFT JOIN assessment_markings m ON m.mark_id=r.latest_mark_id LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id
   WHERE r.assessment_id IN(SELECT value FROM json_each(?)) GROUP BY r.assessment_id`,JSON.stringify(ids)).all()).results:[];
  const resultById=new Map(results.map(r=>[r.assessment_id,r]));
  const own=(await p('SELECT * FROM assessment_recipients WHERE account_id=?',actor).all()).results;
  const assessments=rows.filter(a=>preview?a.schedule_published&&admin.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id)):staff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))||a.schedule_published&&own.some(r=>r.assessment_id===a.assessment_id)&&learner.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))).map(a=>{
   const canAdmin=!preview&&admin.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id)),canTeach=!preview&&staff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id));
   const readOnly=canTeach&&!actualStaff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id));
   const result=resultById.get(a.assessment_id),uploaded=Number(result?.uploaded||0);
   const resultsStatus=!canTeach?null:!uploaded?a.ready_for_assessment_at?'READY_FOR_ASSESSMENT':'WAITING':result.released===uploaded?'RELEASED':result.moderated===uploaded?'MODERATED':result.assessed===uploaded?'ASSESSED':a.ready_for_assessment_at?'READY_FOR_ASSESSMENT':native&&result.checked===uploaded?'CHECKED':'UPLOADED';
   const paperStatus=!canTeach?null:!a.paper_file_id?'WAITING_FOR_SUBMISSION':a.paper_state==='RETURNED'?'RETURNED':a.paper_state!=='APPROVED'?'DRAFTED':!a.paper_released_at?'APPROVED':paperAvailable(a)?'PAPER_RELEASED':'PUBLISHED';
   return {...metadata(a),id:a.assessment_id,activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',examDate:a.exam_date,durationMinutes:a.duration_minutes,maximumMark:a.maximum_mark,published:Boolean(a.schedule_published),examinerName:a.examiner_name||'',paperState:canTeach?(a.paper_file_id?a.paper_state:'NONE'):paperAvailable(a)?'AVAILABLE':'WAITING',paperStatus,resultsStatus,paperReleased:canTeach?Boolean(a.paper_released_at):paperAvailable(a),paperAvailable:paperAvailable(a),revision:a.revision,canAdmin,canTeach,readOnly,isExaminer:!preview&&!readOnly&&same(a.examiner_id,actor),canModerate:canAdmin&&!same(a.examiner_id,actor)};
  });
  const phases=(await p(`SELECT ph.*,a.name activity_name FROM assessment_phases ph JOIN activities a USING(activity_key) WHERE ph.activity_key IN(SELECT json_extract(value,'$.activity_key') FROM json_each(?)) OR ph.phase_id IN(SELECT json_extract(value,'$.phaseId') FROM json_each(?)) ORDER BY ph.created_at DESC,ph.name LIMIT 501`,JSON.stringify(admin),JSON.stringify(assessments)).all()).results;
  if(phases.length>500)throw fail('Choose a learning area to narrow the phase list.',409);
  if(preview)return {assessments,phases:[],classes:[],registers:[],catalogue:[],canAdmin:false,learnerPreview:true,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
  return {...(admin.length?await registerList(s,input):{registers:[],registerClasses:[],registerStatuses:[],imtihaanStatuses:[]}),phases:phases.map(ph=>({id:ph.phase_id,name:ph.name,activityKey:ph.activity_key,activityName:ph.activity_name})),assessments,classes:input.view==='admin'?admin:staff,catalogue:admin.length?await catalogue():[],canAdmin:admin.length>0,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
 }
 async function detail(input){
  const a=await s.assessment(input.assessmentId);await s.requireReader(a);
  const admin=await s.allowed(a.activity_key,a.class_id,'admin'),examiner=same(a.examiner_id,actor)&&await s.allowed(a.activity_key,a.class_id);
  const learn=auth.workspace==='LEARN',preview=learn?readerPreview(auth,a.activity_key)||!await s.recipient(a.assessment_id):input.view==='learner';if(preview&&!learn){await s.requireClass(a.activity_key,a.class_id,'admin');if(!a.schedule_published)throw fail('This assessment has not been published to learners.',403,'FORBIDDEN');}
  const canTeach=!learn&&!preview&&await s.readStaff(a),staff=canTeach,readOnly=canTeach&&!await s.allowed(a.activity_key,a.class_id);
  const recipients=(await p(`SELECT r.*,u.display_name current_name,b.submitted_at,b.submission_number,b.file_id answer_file_id,b.confirmed_at,b.confirmed_by,m.mark,m.feedback,m.state mark_state,m.script_file_id,m.moderation_comment,m.mark_id,m.submission_id marked_submission_id${native?',rm.state released_mark_state,rm.mark released_mark,rf.state released_feedback_state,rf.feedback released_feedback,rs.state released_script_state,rs.script_file_id released_script_file_id,b.is_late,b.deadline_used':''} FROM assessment_recipients r JOIN accounts u ON u.account_id=r.account_id LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id LEFT JOIN assessment_markings m ON m.mark_id=r.latest_mark_id ${native?'LEFT JOIN assessment_markings rm ON rm.mark_id=r.released_mark_id LEFT JOIN assessment_markings rf ON rf.mark_id=r.released_feedback_id LEFT JOIN assessment_markings rs ON rs.mark_id=r.released_script_id':''} WHERE r.assessment_id=? ${staff?'':'AND r.account_id=?'} ORDER BY r.display_name,r.account_id`,a.assessment_id,...(staff?[]:[actor])).all()).results;
  const learners=(preview?[]:recipients).map(r=>{
   if(native){r.ownReleasedMark=r.released_mark_state==='APPROVED';r.ownReleasedFeedback=r.released_feedback_state==='APPROVED';r.ownReleasedScript=r.released_script_state==='APPROVED';}
   const approved=r.mark_state==='APPROVED'&&r.marked_submission_id===r.latest_submission_id;
   return {...(native?{late:Boolean(r.is_late),...(staff?{releasedMarkIsCurrent:Boolean(approved&&r.released_mark_id===r.mark_id)}:{})}:{}),accountId:r.account_id,name:r.display_name,revision:r.revision,firstAccessedAt:r.first_accessed_at,submittedAt:r.submitted_at,submissionNumber:r.submission_number||0,submissionId:r.latest_submission_id,answerFileId:r.answer_file_id,submissionConfirmedAt:r.confirmed_at,submissionConfirmedBy:staff?r.confirmed_by:null,resubmissionAuthorised:Boolean(r.resubmit_authorised),
    markState:staff?r.mark_state:(native?r.ownReleasedMark:approved&&r.released_mark_id===r.mark_id)?'RELEASED':r.latest_submission_id?'PENDING':'NOT_SUBMITTED',
    mark:staff?r.mark:native?r.ownReleasedMark?r.released_mark:null:approved&&r.released_mark_id===r.mark_id?r.mark:null,feedback:staff?r.feedback:native?r.ownReleasedFeedback?r.released_feedback:'':approved&&r.released_feedback_id===r.mark_id?r.feedback:'',scriptFileId:staff?r.script_file_id:native?r.ownReleasedScript?r.released_script_file_id:null:approved&&r.released_script_id===r.mark_id?r.script_file_id:null,
    markId:staff?r.mark_id:null,moderationComment:staff?r.moderation_comment:'',marksReleased:native?r.ownReleasedMark:approved&&r.released_mark_id===r.mark_id,feedbackReleased:native?r.ownReleasedFeedback:approved&&r.released_feedback_id===r.mark_id,scriptReleased:native?r.ownReleasedScript:approved&&r.released_script_id===r.mark_id};
  });
  const history=staff?(await p('SELECT action,account_id,details_json,occurred_at FROM assessment_events WHERE assessment_id=? ORDER BY occurred_at DESC,event_id DESC LIMIT 100',a.assessment_id).all()).results:[];
  const ownAttempt=native&&learn&&!preview?await p('SELECT deadline_at FROM assessment_attempts WHERE assessment_id=? AND account_id=?',a.assessment_id,actor).first():null;
  const currentCollection=await collection(a),policy=native?collectionPolicy(a,currentCollection):null,counts={expected:recipients.length,received:recipients.filter(r=>r.latest_submission_id).length,unchecked:recipients.filter(r=>r.latest_submission_id&&!r.confirmed_at).length,replacements:recipients.filter(r=>r.resubmit_authorised).length},ready=native?readyEligibility(a,counts,currentCollection):null;
  const result={assessment:{...metadata(a,currentCollection),...(native?{canUpload:!preview&&policy.open&&paperAvailable(a),...(learn?{attemptDeadline:ownAttempt?.deadline_at||null,serverNow:new Date().toISOString()}:{}),readyAvailable:!readOnly&&ready.available,readyUnchecked:ready.unchecked,canDirectAdmin:admin&&!preview}:{}),id:a.assessment_id,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',examDate:a.exam_date,...(!learn?{durationMinutes:a.duration_minutes,maximumMark:a.maximum_mark}:{}),activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,revision:a.revision,published:Boolean(a.schedule_published),paperAvailable:paperAvailable(a),paperState:canTeach?(a.paper_file_id?a.paper_state:'NONE'):paperAvailable(a)?'AVAILABLE':'WAITING',paperComment:canTeach?a.paper_comment:'',paperFileId:canTeach||paperAvailable(a)?a.paper_file_id:null,paperReleased:canTeach?Boolean(a.paper_released_at):paperAvailable(a),readyForAssessmentAt:canTeach?a.ready_for_assessment_at:null,readyForAssessmentBy:canTeach?a.ready_for_assessment_by:null,learnerPreview:preview,readOnly,canAdmin:!preview&&admin,canTeach,isExaminer:!preview&&examiner,canModerate:!preview&&admin&&!same(a.examiner_id,actor),canSubmitPaper:!preview&&await s.allowed(a.activity_key,a.class_id)&&(!a.examiner_id||examiner||admin)},learners,history:preview?[]:admin?history:history.filter(e=>['upload-ANSWER','view-answer','confirm-submission','ready-assessment','mark'].includes(e.action)).map(({action,account_id,occurred_at})=>({action,account_id,occurred_at})),store:'D1'};
  if(learn)for(const r of result.learners)for(const key of ['mark','markId','moderationComment','submissionConfirmedBy'])delete r[key];
  return result;
 }
 async function create(input){
  return s.change('create',input,input.activityKey,async()=>{
   await s.requireClass(input.activityKey,input.classId,'admin');const v=await fields(input),phaseId=await phaseFor(input.phaseId,input.activityKey),id=crypto.randomUUID(),now=new Date().toISOString();
   const register=input.registerId?{id:(await requireRegisterClass(s,input.registerId,input.activityKey,input.classId)).register_id,statements:[]}:await legacyRegisterPlan(s,{activityKey:input.activityKey,classId:input.classId,title:v.title,phaseId});
   return {statements:[...register.statements,p(`INSERT INTO assessments(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,phase_id,subject_descriptor,created_at,created_by,updated_at,register_id${native?',assessment_kind,timing_mode,timezone,available_from,due_at,exam_cutoff,allowance_minutes':''}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?${native?',?,?,?,?,?,?,?':''})`,id,input.activityKey,input.classId,v.title,v.subject,v.date,v.duration,v.maximum,phaseId,v.descriptor,now,actor,now,register.id,...(native?[v.timing.kind,v.timing.mode,v.timing.timezone,v.timing.opens,v.timing.due,v.timing.cutoff,v.timing.allowance]:[])),s.event({assessment_id:id,activity_key:input.activityKey},'CREATED',{title:v.title})],result:{assessmentId:id}};
  });
 }
 async function mutate(action,input){
  const initial=await s.assessment(input.assessmentId);
  return s.change(action,input,initial.assessment_id,async()=>{
   const a=await s.assessment(initial.assessment_id),now=new Date().toISOString(),statements=[];
   s.revision(a,input);
   if(['save','publish','roster','review-paper','authorise-resubmission','release','finalise','withdraw-release','collection-save'].includes(action))await s.requireClass(a.activity_key,a.class_id,'admin');
   if(action==='collection-save'&&native){
    const c=await collection(a);if((c?.revision||0)!==input.collectionRevision)throw fail('Submission settings changed. Refresh before saving.',409,'ROW_CHANGED');
    if(a.assessment_kind!=='ASSIGNMENT')throw fail('Exam submissions retain their exam-day cutoff.');
    if(typeof input.closed!=='boolean')throw fail('Choose open or closed submissions.');
    const t=await timingFields(repository,{...a,assessmentKind:'ASSIGNMENT',timingMode:a.timing_mode,durationMinutes:a.duration_minutes,allowanceMinutes:a.allowance_minutes,availableFrom:a.available_from,dueAt:input.dueAt??c?.effective_due_at??a.due_at},a);
    const effectiveDue=c?.effective_due_at||a.due_at;if(effectiveDue&&(!t.due||t.due<effectiveDue))throw fail('Keep the existing due date or extend it. Use Close to stop learner submissions.');
    statements.push(p('INSERT INTO assessment_collection VALUES(?,?,?,?,?,?) ON CONFLICT(assessment_id) DO UPDATE SET effective_due_at=excluded.effective_due_at,closed_at=excluded.closed_at,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',a.assessment_id,t.due,input.closed?(c?.closed_at||now):null,(c?.revision||0)+1,now,actor));
   }else if(action==='save'){
    if(a.paper_state!=='DRAFT'||a.schedule_published)throw fail('Published assessments retain their schedule. Create a new assessment for a replacement schedule.',409);
    const v=await fields(input,a),phaseId=await phaseFor(input.phaseId===undefined?a.phase_id:input.phaseId,a.activity_key);
    const register=input.registerId?{id:(await requireRegisterClass(s,input.registerId,a.activity_key,a.class_id)).register_id,statements:[]}:phaseId===a.phase_id&&a.register_id?{id:a.register_id,statements:[]}:await legacyRegisterPlan(s,{activityKey:a.activity_key,classId:a.class_id,title:v.title,phaseId});
    statements.push(...register.statements,p(`UPDATE assessments SET title=?,subject=?,exam_date=?,duration_minutes=?,maximum_mark=?,phase_id=?,subject_descriptor=?,register_id=?${native?',assessment_kind=?,timing_mode=?,timezone=?,available_from=?,due_at=?,exam_cutoff=?,allowance_minutes=?':''} WHERE assessment_id=?`,v.title,v.subject,v.date,v.duration,v.maximum,phaseId,v.descriptor,register.id,...(native?[v.timing.kind,v.timing.mode,v.timing.timezone,v.timing.opens,v.timing.due,v.timing.cutoff,v.timing.allowance]:[]),a.assessment_id));
   }else if(action==='paper-details'){
    await s.requireExaminer(a);
    if(a.paper_released_at||await p('SELECT 1 found FROM assessment_submissions WHERE assessment_id=? LIMIT 1',a.assessment_id).first())throw fail('Paper details are fixed after release.',409);
    const v=await fields({...input,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,examDate:a.exam_date},a);
    statements.push(p(`UPDATE assessments SET duration_minutes=?,maximum_mark=?,paper_state=CASE WHEN paper_file_id IS NOT NULL THEN 'IN_REVIEW' ELSE paper_state END,paper_released_at=NULL${native?',timing_mode=?,allowance_minutes=?':''} WHERE assessment_id=?`,v.duration,v.maximum,...(native?[v.timing.mode,v.timing.allowance]:[]),a.assessment_id));
   }else if(action==='publish'||action==='roster'){
    if(await p('SELECT 1 found FROM assessment_submissions WHERE assessment_id=? LIMIT 1',a.assessment_id).first())throw fail('The learner list is preserved after submissions begin.',409);
    const rows=await s.roster(a);if(!rows.length)throw fail('This class has no eligible learners. Check its enrolments before publishing.',409);if(rows.length>2000)throw fail('Split this class into smaller assessment groups.',409);
    // Preserve first-access evidence if a roster is refreshed before submission.
    statements.push(p(`DELETE FROM assessment_recipients WHERE assessment_id=? AND first_accessed_at IS NULL AND account_id NOT IN(SELECT json_extract(value,'$.account_id') FROM json_each(?))`,a.assessment_id,JSON.stringify(rows)),rosterStatement(a,rows),p('UPDATE assessments SET schedule_published=1 WHERE assessment_id=?',a.assessment_id));
   }else if(action==='review-paper'){
    await s.moderator(a);if(a.paper_state!=='IN_REVIEW')throw fail('This paper is not awaiting moderation.',409);
    if(!['APPROVE','RETURN'].includes(input.decision))throw fail('Choose Approve or Return.');const comment=cleanText(input.comment||'',4000,'moderation comments',input.decision==='APPROVE');
    if(native&&input.decision==='APPROVE'){if(input.paperReview?.fileId!==a.paper_file_id||(input.paperReview?.sha256??null)!==(a.paper_sha256??null))throw fail('Review the exact learner paper before approval.',409,'PAPER_REVIEW_REQUIRED');statements.push(p('INSERT OR REPLACE INTO assessment_paper_review VALUES(?,?,?,?,?,?)',a.paper_file_id,a.assessment_id,a.paper_sha256||null,a.revision,now,actor));}
    statements.push(p('UPDATE assessments SET paper_state=?,paper_comment=?,paper_released_at=NULL WHERE assessment_id=?',input.decision==='APPROVE'?'APPROVED':'RETURNED',comment,a.assessment_id));
   }else if(action==='authorise-resubmission'){
    const rows=await selected(a,input);if(rows.some(r=>!r.latest_submission_id))throw fail('Choose learners who have already submitted.',409);
    statements.push(p(`UPDATE assessment_recipients SET resubmit_authorised=1,revision=revision+1 WHERE assessment_id=? AND account_id IN(SELECT value FROM json_each(?))`,a.assessment_id,JSON.stringify(rows.map(r=>r.account_id))),p('UPDATE assessments SET ready_for_assessment_at=NULL,ready_for_assessment_by=NULL WHERE assessment_id=?',a.assessment_id));
   }else if(action==='confirm-submission'){
    await s.requireClass(a.activity_key,a.class_id);
    const r=await s.recipient(a.assessment_id,input.accountId);s.recipientRevision(r,input);
    if(!r.latest_submission_id||r.latest_submission_id!==input.submissionId)throw fail('Open the latest learner submission before confirming it.',409);
    const submission=await p('SELECT confirmed_at FROM assessment_submissions WHERE submission_id=?',r.latest_submission_id).first();
    if(submission?.confirmed_at)throw fail('This submission has already been confirmed.',409);
    const viewed=await p("SELECT 1 ok FROM assessment_events WHERE assessment_id=? AND actor_id=? AND action='view-answer' AND json_extract(details_json,'$.submissionId')=? LIMIT 1",a.assessment_id,actor,r.latest_submission_id).first();
    if(!viewed)throw fail('View this PDF before confirming that it is correct and legible.',409);
    statements.push(p('UPDATE assessment_submissions SET confirmed_at=?,confirmed_by=? WHERE submission_id=? AND confirmed_at IS NULL',now,actor,r.latest_submission_id),p('UPDATE assessment_recipients SET revision=revision+1 WHERE assessment_id=? AND account_id=?',a.assessment_id,r.account_id));
   }else if(action==='ready-assessment'){
    await s.requireClass(a.activity_key,a.class_id);
    const counts=await p(`SELECT count(*) expected,sum(CASE WHEN r.latest_submission_id IS NOT NULL THEN 1 ELSE 0 END) received,
     sum(CASE WHEN r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NULL THEN 1 ELSE 0 END) unchecked,
     sum(CASE WHEN r.resubmit_authorised=1 THEN 1 ELSE 0 END) replacements
     FROM assessment_recipients r LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id WHERE r.assessment_id=?`,a.assessment_id).first();
    if(native){const eligibility=readyEligibility(a,counts,await collection(a));if(!eligibility.available)throw fail('Ready is available after all expected submissions are uploaded and checked, or on the next day after the exam or effective due date.',409,'ASSESSMENT_NOT_READY');if(counts.unchecked&&(!await s.allowed(a.activity_key,a.class_id,'admin')||input.confirmUnchecked!==true))throw fail('Some received answers have not been checked. Admin may cancel or explicitly continue.',409,'UNCHECKED_SUBMISSIONS_WARNING');}
    if(!native&&!counts?.received)throw fail('No learner submissions have been received yet.',409);
    if(!native&&counts.unchecked)throw fail('View and confirm every received latest PDF before marking the assessment ready.',409);
    if(!native&&counts.replacements)throw fail('An authorised replacement is still outstanding.',409);
    if(a.ready_for_assessment_at)throw fail('This assessment is already ready for marking.',409);
    statements.push(p('UPDATE assessments SET ready_for_assessment_at=?,ready_for_assessment_by=? WHERE assessment_id=?',now,actor,a.assessment_id));
   }else if(action==='mark'){
    await s.requireExaminer(a);const r=await s.recipient(a.assessment_id,input.accountId);s.recipientRevision(r,input);
    const directAdmin=native&&await s.allowed(a.activity_key,a.class_id,'admin');
    if(!directAdmin&&!a.ready_for_assessment_at)throw fail('A teacher or admin must confirm all received submissions and mark this assessment ready before marking.',409);
    if(!r.latest_submission_id||r.latest_submission_id!==input.submissionId)throw fail('Open the latest submission before marking.',409);
    if(native&&!directAdmin&&(a.paper_state!=='APPROVED'||!a.paper_released_at))throw fail('Approve and release the paper before ordinary marking.',409);
    if(native&&!directAdmin&&!await p('SELECT 1 ok FROM assessment_submissions WHERE submission_id=? AND confirmed_at IS NOT NULL',r.latest_submission_id).first())throw fail('Check this received answer before assessing it.',409);
    if(typeof input.mark!=='number'||!Number.isFinite(input.mark)||input.mark<0||input.mark>a.maximum_mark)throw fail('Enter a mark between zero and the maximum.');
    const feedback=cleanText(input.feedback||'',12000,'feedback',true),id=crypto.randomUUID();
    if(native&&input.scriptFileId&&!await p('SELECT 1 ok FROM assessment_script_sources WHERE file_id=? AND submission_id=? AND paper_file_id IS ? AND maximum_mark=?',input.scriptFileId,r.latest_submission_id,a.paper_file_id,a.maximum_mark).first())throw fail('This marked PDF belongs to a different answer or paper. Review and upload the correct script.',409,'SCRIPT_SOURCE_CHANGED');
    if(input.scriptFileId){const f=await p("SELECT 1 ok FROM assessment_files WHERE file_id=? AND assessment_id=? AND owner_id=? AND uploaded_by=? AND kind='SCRIPT'",input.scriptFileId,a.assessment_id,r.account_id,actor).first();if(!f)throw fail('Attach this learner’s marked PDF.',403);}
    statements.push(p(`INSERT INTO assessment_markings(mark_id,assessment_id,account_id,submission_id,mark,feedback,script_file_id,state,examiner_id,created_at) VALUES(?,?,?,?,?,?,?,'IN_REVIEW',?,?)`,id,a.assessment_id,r.account_id,r.latest_submission_id,input.mark,feedback,input.scriptFileId||null,actor,now),p(`UPDATE assessment_recipients SET latest_mark_id=?,${native?'':'released_mark_id=NULL,released_feedback_id=NULL,released_script_id=NULL,'}revision=revision+1 WHERE assessment_id=? AND account_id=?`,id,a.assessment_id,r.account_id));
   }else if(action==='finalise'&&native){
    const r=await s.recipient(a.assessment_id,input.accountId);s.recipientRevision(r,input);const mark=await p('SELECT * FROM assessment_markings WHERE mark_id=?',r.latest_mark_id).first();
    if(!mark||mark.mark_id!==input.markId||mark.submission_id!==r.latest_submission_id)throw fail('Choose the latest actual marking for this answer.',409);
    statements.push(p("UPDATE assessment_markings SET state='APPROVED',moderator_id=?,moderated_at=?,moderation_comment=? WHERE mark_id=?",actor,now,'Manually finalised by Admin',mark.mark_id),p('UPDATE assessment_recipients SET revision=revision+1 WHERE assessment_id=? AND account_id=?',a.assessment_id,r.account_id));
   }else if(action==='withdraw-release'&&native){
    if(!['marks','feedback','scripts'].includes(input.category)||input.selection!=='SELECTED'||!input.accountIds?.length)throw fail('Select learners and the released category to withdraw.');const rows=await selected(a,input),column={marks:'released_mark_id',feedback:'released_feedback_id',scripts:'released_script_id'}[input.category];
    statements.push(p(`UPDATE assessment_recipients SET ${column}=NULL,revision=revision+1 WHERE assessment_id=? AND account_id IN(SELECT value FROM json_each(?))`,a.assessment_id,JSON.stringify(rows.map(r=>r.account_id))));
   }else if(action==='review-mark'){
    await s.moderator(a);const r=await s.recipient(a.assessment_id,input.accountId);s.recipientRevision(r,input);
    const m=await p('SELECT * FROM assessment_markings WHERE mark_id=?',r.latest_mark_id).first();
    if(!m||m.state!=='IN_REVIEW'||m.mark_id!==input.markId||m.submission_id!==r.latest_submission_id)throw fail('This marking changed or is not awaiting moderation.',409);
    if(!['APPROVE','RETURN'].includes(input.decision))throw fail('Choose Approve or Return.');const comment=cleanText(input.comment||'',4000,'moderation comments',input.decision==='APPROVE');
    statements.push(p('UPDATE assessment_markings SET state=?,moderator_id=?,moderated_at=?,moderation_comment=? WHERE mark_id=?',input.decision==='APPROVE'?'APPROVED':'RETURNED',actor,now,comment,m.mark_id),p('UPDATE assessment_recipients SET revision=revision+1 WHERE assessment_id=? AND account_id=?',a.assessment_id,r.account_id));
   }else if(action==='release'){
    if(!['marks','feedback','scripts'].includes(input.category))throw fail('Choose marks, feedback or scripts.');
    if(!native&&input.category==='marks'&&input.accountIds?.length)throw fail('Marks are released to the whole class together.');
    if(native&&(!['CLASS','SELECTED'].includes(input.selection)||input.selection==='SELECTED'&&!input.accountIds?.length||input.selection==='CLASS'&&input.accountIds?.length))throw fail('Choose the whole class or a nonempty learner selection explicitly.');
    const rows=await selected(a,input),ready=rows.filter(r=>r.latest_submission_id);
    if(!ready.length)throw fail('There are no assessed submissions to release.',409);
    if(ready.some(r=>r.state!=='APPROVED'||r.submission_id!==r.latest_submission_id))throw fail('Moderate every selected submitted assessment before release.',409);
    if(input.category==='scripts'&&ready.some(r=>!r.script_file_id))throw fail('A selected learner has no marked script attached.',409);
    const column={marks:'released_mark_id',feedback:'released_feedback_id',scripts:'released_script_id'}[input.category];
    statements.push(p(`UPDATE assessment_recipients SET ${column}=latest_mark_id,revision=revision+1 WHERE assessment_id=? AND account_id IN(SELECT value FROM json_each(?))`,a.assessment_id,JSON.stringify(ready.map(r=>r.account_id))));
   }else throw fail('Unknown assessment action.',404);
   statements.push(s.touch(a),s.event(a,action,{...(input.decision?{decision:input.decision,comment:input.comment||''}:{}),...(input.category?{category:input.category,accountIds:input.accountIds||'CLASS'}:{}),...(input.accountId?{accountId:input.accountId}:{}),...(['mark','confirm-submission'].includes(action)?{submissionId:input.submissionId}:{}),...(action==='mark'?{mark:input.mark}:{}),...(action==='paper-details'?{durationMinutes:input.durationMinutes,maximumMark:input.maximumMark}:{})},input.accountId||null));
   return {statements,result:{assessmentId:a.assessment_id,revision:a.revision+1,...((action==='publish'||action==='review-paper'&&input.decision==='APPROVE')?{setupScopes:[a.activity_key]}:{})}};
  });
 }
 async function selected(a,input){
  const ids=input.accountIds;
  if(ids!==undefined&&(!Array.isArray(ids)||ids.length>2000||new Set(ids).size!==ids.length||ids.some(v=>typeof v!=='string')))throw fail('Choose valid learners.');
  const rows=(await p(`SELECT r.*,m.state,m.submission_id,m.script_file_id FROM assessment_recipients r LEFT JOIN assessment_markings m ON m.mark_id=r.latest_mark_id WHERE r.assessment_id=?`,a.assessment_id).all()).results;
  if(!ids?.length)return rows;
  if(ids.some(id=>!rows.some(r=>r.account_id===id)))throw fail('Choose learners in this assessment.',403);
  return rows.filter(r=>ids.includes(r.account_id));
 }
 async function deleteSession(input){
  const id=cleanText(input.assessmentId,200,'a session identifier');
  return s.change('session-delete',input,id,async()=>{
   const a=await s.assessment(id);await s.requireClass(a.activity_key,a.class_id,'admin');s.revision(a,input);
   const evidence=await p(`SELECT 1 found FROM assessment_recipients WHERE assessment_id=? AND (first_accessed_at IS NOT NULL OR latest_submission_id IS NOT NULL OR latest_mark_id IS NOT NULL)
    UNION ALL SELECT 1 FROM assessment_submissions WHERE assessment_id=?
    UNION ALL SELECT 1 FROM assessment_markings WHERE assessment_id=? LIMIT 1`,id,id,id).first();
   if(evidence)throw fail('This session has learner access, submissions or marks and cannot be deleted. Its assessment record must be retained.',409,'SESSION_IN_USE');
   const now=new Date().toISOString();
   return {statements:[p('UPDATE assessments SET deleted_at=?,deleted_by=?,revision=revision+1,updated_at=? WHERE assessment_id=?',now,actor,now,id),s.event(a,'session-delete',{registerId:a.register_id,title:a.title,subject:a.subject,examDate:a.exam_date})],result:{assessmentId:id,deleted:true}};
  });
 }
 async function releasePapers(input){
  if(!Array.isArray(input.papers)||!input.papers.length||input.papers.length>30||new Set(input.papers.map(a=>a.id)).size!==input.papers.length)throw fail('Choose between 1 and 30 approved papers.');
  return s.change('release-papers',input,'PAPERS:'+actor,async()=>{
   const statements=[],now=new Date().toISOString();
   const papers=(await p('SELECT * FROM assessments WHERE deleted_at IS NULL AND assessment_id IN(SELECT json_extract(value,\'$.id\') FROM json_each(?))',JSON.stringify(input.papers)).all()).results;
   if(papers.length!==input.papers.length)throw fail('An assessment was not found.',404);
   for(const a of papers){const item=input.papers.find(item=>item.id===a.assessment_id);await s.requireClass(a.activity_key,a.class_id,'admin');s.revision(a,{revision:item.revision});if(!a.schedule_published||a.paper_state!=='APPROVED'||!a.paper_file_id)throw fail('Publish the schedule and approve every selected paper before release.',409);statements.push(p('UPDATE assessments SET paper_released_at=? WHERE assessment_id=?',now,a.assessment_id),s.touch(a),s.event(a,'release-paper'));}
   return {statements,result:{released:input.papers.length}};
  });
 }
 return {store:s,run:async(action,input)=>{
  if(action==='register-release')return releaseRegister(s,input);if(action==='register-create')return createRegister(s,input);if(action==='register-save')return saveRegister(s,input);if(action==='register-validate')return validateRegister(s,input);if(action==='session-delete')return deleteSession(input);if(action==='phase-create')return createPhase(input);if(action==='list')return list(input);if(action==='get')return detail(input);if(action==='create')return create(input);if(action==='release-papers')return releasePapers(input);return mutate(action,input);
 }};
}
