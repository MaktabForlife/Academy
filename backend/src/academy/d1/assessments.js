import {imtihaanPaperValidation} from './assessment-imtihaan-workflow.js';
import {publishedAssessmentRows} from './published-assessments.js';
import {assessmentTableStates,assessmentTablePlan,assessmentRegisterMarks} from './assessment-table.js';
import {assessmentResultsSQL} from './assessment-results.js';
import {assessmentGroup,assessmentListGroups,assessmentSelections,groupRevisions,sharedAssessmentAction} from './assessment-group.js';
import {insertRecords} from './insert-records.js';
import {assessmentOperations,timingFields,collectionPolicy,readyEligibility} from './assessment-timing.js';
import {appTimezone,academyDate,dayStart,nextDate,localInstant} from './academy-clock.js';
import {isAdminWorkspace} from './workspace-access.js';
import {assessmentStore,cleanText,validDate,paperAvailable,paperReplacementOpen} from './assessment-store.js';
import {administers,viewedClass,readerPreview,actualState} from './workspace-access.js';
import {managementError as fail,same} from './management-store.js';
import {registerList,createRegister,saveRegister,validateRegister,releaseRegister,legacyRegisterPlan,requireRegisterClass,newRegisterStatements,registerRecord} from './assessment-register.js';

export function d1Assessments(repository,auth){
 const s=assessmentStore(repository,auth),{p,actor}=s,native=assessmentOperations(repository);
 const collection=a=>native?p('SELECT * FROM assessment_collection WHERE assessment_id=?',a.assessment_id).first():Promise.resolve(null);
 const metadata=(a,c=null)=>{c||=a.collection_revision?{effective_due_at:a.effective_due_at,closed_at:a.closed_at,revision:a.collection_revision}:null;return native?{assessmentKind:a.assessment_kind||'EXAM',timingMode:a.timing_mode||'TIMED',availableFrom:a.available_from,dueAt:c?.effective_due_at||a.due_at,timezone:a.timezone||'Africa/Johannesburg',collectionClosed:Boolean(c?.closed_at),collectionRevision:c?.revision||0,...(auth.workspace==='LEARN'?{}:{allowanceMinutes:a.allowance_minutes,paperSHA256:a.paper_sha256})}:{};};
 const listColumns=input=>input.dashboard===true?"x.assessment_id,x.activity_key,x.class_id,x.title,x.register_id,x.phase_id,x.exam_date,x.schedule_published,x.examiner_id"+(native?',x.assessment_kind':''):'x.*';
 const dashboardAssessment=a=>({activityKey:a.activity_key,title:a.title,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',registerStatus:a.register_status||'',examDate:a.exam_date,assessmentKind:a.assessment_kind||'EXAM',published:Boolean(a.schedule_published)});
 async function catalogue(){
  const subjects=(await p("SELECT subject_key,name FROM subject_catalog WHERE source_namespace='ACADEMY' AND active=1 ORDER BY name").all()).results;
  const modules=(await p("SELECT m.module_id,m.name,s.name subject_name FROM academy_module_catalogue m LEFT JOIN subject_catalog s ON s.subject_key=m.subject_key WHERE m.active=1 AND (s.subject_key IS NULL OR s.active=1 AND s.source_namespace='ACADEMY') ORDER BY s.name,m.name").all()).results;
  return [...subjects.map(s=>({key:'SUBJECT:'+s.subject_key,label:s.name,kind:'SUBJECT'})),...modules.map(m=>({key:'MODULE:ACADEMY:'+m.module_id,label:m.subject_name?m.subject_name+' · '+m.name:m.name,kind:'MODULE'}))];
 }
 const fields=async(input,current=null,choices=null,examiners=null,timezone=null)=>{
  let examiner=input.examinerId===undefined?{id:current?.examiner_id||null,name:''}:examiners?(input.examinerId===null||input.examinerId===''?{id:null,name:''}:examiners.find(t=>t.id===input.examinerId&&t.activity_key===(input.activityKey||current?.activity_key))):await s.examinerChoice(input.examinerId,input.activityKey||current?.activity_key);
  if(!examiner)throw fail('Choose an active teacher from this Program or Course as examiner.',403,'EXAMINER_OUTSIDE_PROGRAM');
  const descriptor=examiner.name||cleanText(input.subjectDescriptor??current?.subject_descriptor??'',160,'a subject descriptor',true);
  const title=cleanText(input.title,160,'an assessment title'),options=choices||await catalogue(),choice=input.catalogueKey?options.find(c=>c.key===input.catalogueKey):options.find(c=>c.label===input.subject);
  const subject=choice?.label||(current&&input.subject===current.subject&&!input.catalogueKey?current.subject:'');
  if(!subject)throw fail('Choose an active Academy subject or module.');
  const timing=native?await timingFields(repository,input,current,timezone):null;
  if((!native&&(!validDate(input.examDate)||!Number.isInteger(input.durationMinutes)||input.durationMinutes<1||input.durationMinutes>1440))||typeof input.maximumMark!=='number'||!Number.isFinite(input.maximumMark)||input.maximumMark<=0||input.maximumMark>1000000)throw fail('Enter a valid exam date, duration and maximum mark.');
  return {title,subject,descriptor,examinerId:examiner.id,date:timing?timing.date:input.examDate,duration:timing?timing.duration:input.durationMinutes,maximum:input.maximumMark,timing};
 };
 async function phaseFor(id,activityKey,phases=null){
  if(id===undefined||id===null||id==='')return null;
  if(phases){if(!phases.has(JSON.stringify([id,activityKey])))throw fail('Choose an assessment phase in this learning area.',403);return id;}
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
  const own=new Map((await p(input.dashboard===true?'SELECT assessment_id FROM assessment_recipients WHERE account_id=?':`SELECT r.assessment_id,r.latest_submission_id,m.mark,m.state,m.submission_id,m.manual FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.released_mark_id AND m.assessment_id=r.assessment_id AND m.account_id=r.account_id WHERE r.account_id=?`,actor).all()).results.map(r=>[r.assessment_id,r]));
  const snapshotIds=classes.some(c=>administers(auth,c.activity_key))?undefined:[...own.keys()];
  const saved=input.dashboard===true?null:await publishedAssessmentRows(repository,auth,{activityKey:input.activityKey||'',ids:snapshotIds,publishedOnly:true,limit:1001});
  const rows=saved??(await p(`SELECT ${listColumns(input)}${native&&input.dashboard!==true?',col.effective_due_at,col.closed_at,col.revision collection_revision':''},COALESCE(ar.name,ph.name) phase_name,ar.status register_status,c.name class_name,a.name activity_name FROM assessments x ${native&&input.dashboard!==true?'LEFT JOIN assessment_collection col ON col.assessment_id=x.assessment_id':''} LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id LEFT JOIN assessment_registers ar ON ar.register_id=x.register_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.deleted_at IS NULL AND x.schedule_published=1 AND (?='' OR x.activity_key=?) ORDER BY x.exam_date,x.title LIMIT 1001`,input.activityKey||'',input.activityKey||'').all()).results;
  for(const a of rows){if(viewedClass(auth,a.activity_key)&&!same(viewedClass(auth,a.activity_key),a.class_id)||!classes.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))||input.kind&&a.activity_key.split(':')[0]!==input.kind||!own.has(a.assessment_id)&&!administers(auth,a.activity_key))continue;
   if(input.dashboard===true){if((a.assessment_kind||'EXAM')==='EXAM')visible.push(dashboardAssessment(a));continue;}
   const result=own.get(a.assessment_id),preview=readerPreview(auth,a.activity_key)||!own.has(a.assessment_id),released=!preview&&result?.state==='APPROVED'&&(native||result.manual===1||result.submission_id===result.latest_submission_id);
   visible.push({...metadata(a),learnerPreview:preview,...(released?{releasedMark:result.mark,releasedMaximumMark:a.maximum_mark}:{}),id:a.assessment_id,activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',registerStatus:a.register_status||'',examDate:a.exam_date,published:true,paperAvailable:paperAvailable(a),paperState:paperAvailable(a)?'AVAILABLE':'WAITING',canAdmin:false,canTeach:false,isExaminer:false,canModerate:false});
  }
  if(input.dashboard===true)return {assessments:visible,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
  return {assessments:visible,phases:[],classes:[],registers:[],catalogue:[],canAdmin:false,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
 }
 async function list(input){
  if(auth.workspace==='LEARN')return learnerList(input);
  const filter=rows=>['PROGRAM','COURSE'].includes(input.kind)?rows.filter(c=>c.kind===input.kind):rows;
  const staff=filter(await s.classes('staff',input.activityKey||'')),admin=filter(await s.classes('admin',input.activityKey||'')),learner=filter(await s.classes('learner',input.activityKey||''));
  const actualStaff=auth.workspace==='TEACH'?await s.classes('staff',input.activityKey||'',false):staff;
  const examinerAreas=auth.workspace==='TEACH'&&!auth.adminView?actualState(auth).roles.filter(r=>r.role==='TEACHER').map(r=>r.activity_key):[];
  const preview=input.view==='learner';if(preview&&!admin.length)throw fail('Learner preview requires this learning area’s Admin access.',403,'FORBIDDEN');
  const rows=(await p(`SELECT ${listColumns(input)}${native&&input.dashboard!==true?',col.effective_due_at,col.closed_at,col.revision collection_revision':''},COALESCE(ar.name,ph.name) phase_name,ar.status register_status,c.name class_name,a.name activity_name${input.dashboard===true?'':',(SELECT display_name FROM accounts u WHERE u.account_id=x.examiner_id) examiner_name,(SELECT u.display_name FROM assessment_files f JOIN accounts u ON u.account_id=f.uploaded_by WHERE f.file_id=x.paper_file_id) paper_uploader_name'} FROM assessments x ${native&&input.dashboard!==true?'LEFT JOIN assessment_collection col ON col.assessment_id=x.assessment_id':''} LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id LEFT JOIN assessment_registers ar ON ar.register_id=x.register_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.deleted_at IS NULL AND (?='' OR x.activity_key=?) AND (EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.activity_key')=x.activity_key AND json_extract(j.value,'$.class_id')=x.class_id) OR x.schedule_published=1 AND EXISTS(SELECT 1 FROM assessment_recipients r WHERE r.assessment_id=x.assessment_id AND r.account_id=?) AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.activity_key')=x.activity_key AND json_extract(j.value,'$.class_id')=x.class_id) OR x.examiner_id=? AND x.activity_key IN(SELECT value FROM json_each(?)) AND c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE') ORDER BY x.exam_date,x.title LIMIT 1001`,input.activityKey||'',input.activityKey||'',JSON.stringify(staff),actor,JSON.stringify(learner),actor,JSON.stringify(examinerAreas)).all()).results;
  if(rows.length>1000)throw fail('Choose a learning area to narrow the assessment list.',409);
  const ids=input.dashboard!==true&&(staff.length||examinerAreas.length)?rows.map(a=>a.assessment_id):[],results=ids.length?(await p(`SELECT r.assessment_id,
   sum(CASE WHEN r.latest_submission_id IS NOT NULL OR m.manual=1 THEN 1 ELSE 0 END) uploaded,
   sum(CASE WHEN r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NOT NULL THEN 1 ELSE 0 END) checked,
   sum(CASE WHEN (m.manual=1 OR r.latest_submission_id=m.submission_id) AND m.state IN('IN_REVIEW','APPROVED') THEN 1 ELSE 0 END) assessed,
   sum(CASE WHEN (m.manual=1 OR r.latest_submission_id=m.submission_id) AND m.state='APPROVED' THEN 1 ELSE 0 END) moderated,
   sum(CASE WHEN (m.manual=1 OR r.latest_submission_id=m.submission_id) AND m.state='APPROVED' AND r.released_mark_id=m.mark_id THEN 1 ELSE 0 END) released
   FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id
   WHERE r.assessment_id IN(SELECT value FROM json_each(?)) GROUP BY r.assessment_id`,JSON.stringify(ids)).all()).results:[];
  const resultById=new Map(results.map(r=>[r.assessment_id,r]));
  const tableStates=input.dashboard===true?new Map():await assessmentTableStates(s,rows);
  const files=input.dashboard===true||!native?new Map():new Map((await p('SELECT f.file_id,i.sha256 FROM assessment_files f LEFT JOIN assessment_file_integrity i USING(file_id) WHERE f.file_id IN(SELECT value FROM json_each(?))',JSON.stringify([...new Set(rows.map(a=>a.paper_file_id).filter(Boolean))])).all()).results.map(f=>[f.file_id,f.sha256]));
  const own=(await p(input.dashboard===true?'SELECT assessment_id FROM assessment_recipients WHERE account_id=?':'SELECT * FROM assessment_recipients WHERE account_id=?',actor).all()).results;
  const assessments=rows.filter(a=>preview?a.schedule_published&&admin.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id)):(staff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))||s.isAssignedExaminer(a))||a.schedule_published&&own.some(r=>r.assessment_id===a.assessment_id)&&learner.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))).map(a=>{
   const canAdmin=!preview&&admin.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id)),canTeach=!preview&&(staff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))||s.isAssignedExaminer(a));
   if(input.dashboard===true)return {...dashboardAssessment(a),canAdmin,canTeach};
   const canAssess=canTeach&&(canAdmin||s.isAssignedExaminer(a)||auth.adminView&&administers(auth,a.activity_key)||same(a.examiner_id,actor)&&actualStaff.some(c=>same(c.activity_key,a.activity_key)&&same(c.class_id,a.class_id))),readOnly=canTeach&&!canAssess;
   const result=resultById.get(a.assessment_id),uploaded=Number(result?.uploaded||0);
   const resultsStatus=!canTeach?null:!uploaded?a.ready_for_assessment_at?'READY_FOR_ASSESSMENT':'WAITING':result.released===uploaded?'RELEASED':result.moderated===uploaded?'MODERATED':result.assessed===uploaded?'ASSESSED':a.ready_for_assessment_at?'READY_FOR_ASSESSMENT':native&&result.checked===uploaded?'CHECKED':'UPLOADED';
   const tableState=tableStates.get(a.assessment_id);
   const paperStatus=!canTeach?null:!a.paper_file_id?'WAITING_FOR_SUBMISSION':a.paper_state==='RETURNED'?'RETURNED':a.paper_state!=='APPROVED'?'DRAFTED':!a.paper_released_at?'APPROVED':paperAvailable(a)?'PAPER_RELEASED':'PUBLISHED';
   return {...metadata(a),id:a.assessment_id,activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',registerStatus:a.register_status||'',examDate:a.exam_date,durationMinutes:a.duration_minutes,maximumMark:a.maximum_mark,published:Boolean(a.schedule_published),examinerId:canTeach?a.examiner_id:null,examinerName:canTeach?a.examiner_name||'':'',paperUploaderName:canTeach?a.paper_uploader_name||'':'',paperState:canTeach?(a.paper_file_id?a.paper_state:'NONE'):paperAvailable(a)?'AVAILABLE':'WAITING',paperStatus,resultsStatus,...(canTeach?{paperFileId:canAssess?a.paper_file_id:null,paperSHA256:canAssess?files.get(a.paper_file_id)||null:null,canOpenPaper:canAssess,canViewSubmissions:canAssess,marksModerated:Boolean(tableState?.moderated),canEditDetails:canAdmin&&paperReplacementOpen(a)&&!tableState?.accessed&&!tableState?.entered,canEnterMarks:canAssess,canReplacePaper:canAdmin||canAssess&&a.paper_state!=='APPROVED'&&!a.paper_released_at}:{}),...(canTeach?{readyForAssessmentAt:a.ready_for_assessment_at}:{}),paperReleased:canTeach?Boolean(a.paper_released_at):paperAvailable(a),paperAvailable:paperAvailable(a),revision:a.revision,canAdmin,canTeach,readOnly,isExaminer:!preview&&!readOnly&&same(a.examiner_id,actor),canModeratePaper:canAdmin,canModerate:canAdmin&&!same(a.examiner_id,actor)};
  });
  if(input.dashboard===true)return {assessments:assessments.filter(a=>a.assessmentKind==='EXAM'),timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
  if(!preview&&assessments.some(a=>a.canTeach)){const groups=await assessmentListGroups(s,rows,assessments,input.view!=='admin');for(const a of assessments)Object.assign(a,groups.get(a.id)||{});}
  const phases=(await p(`SELECT ph.*,a.name activity_name FROM assessment_phases ph JOIN activities a USING(activity_key) WHERE ph.activity_key IN(SELECT json_extract(value,'$.activity_key') FROM json_each(?)) OR ph.phase_id IN(SELECT json_extract(value,'$.phaseId') FROM json_each(?)) ORDER BY ph.created_at DESC,ph.name LIMIT 501`,JSON.stringify(admin),JSON.stringify(assessments)).all()).results;
  if(phases.length>500)throw fail('Choose a learning area to narrow the phase list.',409);
  if(preview)return {assessments,phases:[],classes:[],registers:[],catalogue:[],canAdmin:false,learnerPreview:true,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
  return {...(admin.length?await registerList(s,input):{registers:[],registerClasses:[],registerStatuses:[],imtihaanStatuses:[]}),phases:phases.map(ph=>({id:ph.phase_id,name:ph.name,activityKey:ph.activity_key,activityName:ph.activity_name})),assessments,multiClassSelection:true,sharedClassProcess:true,classes:input.view==='admin'?admin:staff,catalogue:admin.length?await catalogue():[],examiners:admin.length?await s.examinerTeachers([...new Set(admin.map(c=>c.activity_key))]):[],canAdmin:admin.length>0,timezone:native?await appTimezone(repository):'Africa/Johannesburg',store:'D1'};
 }
 async function detail(input){
  const a=await s.assessment(input.assessmentId);await s.requireReader(a);
  const admin=await s.allowed(a.activity_key,a.class_id,'admin'),examiner=same(a.examiner_id,actor)&&await s.canWork(a);
  const learn=auth.workspace==='LEARN',preview=learn?readerPreview(auth,a.activity_key)||!await s.recipient(a.assessment_id):input.view==='learner';if(preview&&!learn){await s.requireClass(a.activity_key,a.class_id,'admin');if(!a.schedule_published)throw fail('This assessment has not been published to learners.',403,'FORBIDDEN');}
  const canTeach=!learn&&!preview&&await s.readStaff(a),staff=canTeach&&await s.canAssess(a),readOnly=canTeach&&!staff;
  const recipients=canTeach&&!staff||preview?[]:(await p(`SELECT r.*,u.display_name current_name,b.submitted_at,b.submission_number,b.file_id answer_file_id,b.confirmed_at,b.confirmed_by,m.mark,m.manual manual_mark,m.feedback,m.state mark_state,m.script_file_id,m.moderation_comment,m.mark_id,m.submission_id marked_submission_id${native?',rm.state released_mark_state,rm.mark released_mark,rf.state released_feedback_state,rf.feedback released_feedback,rs.state released_script_state,rs.script_file_id released_script_file_id,b.is_late,b.deadline_used':''} FROM assessment_recipients r JOIN accounts u ON u.account_id=r.account_id LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id ${native?`LEFT JOIN (${assessmentResultsSQL}) rm ON rm.mark_id=r.released_mark_id LEFT JOIN (${assessmentResultsSQL}) rf ON rf.mark_id=r.released_feedback_id LEFT JOIN (${assessmentResultsSQL}) rs ON rs.mark_id=r.released_script_id`:''} WHERE r.assessment_id=? ${staff?'':'AND r.account_id=?'} ORDER BY r.display_name,r.account_id`,a.assessment_id,...(staff?[]:[actor])).all()).results;
  const learners=(preview?[]:recipients).map(r=>{
   if(native){r.ownReleasedMark=r.released_mark_state==='APPROVED';r.ownReleasedFeedback=r.released_feedback_state==='APPROVED';r.ownReleasedScript=r.released_script_state==='APPROVED';}
   const approved=r.mark_state==='APPROVED'&&(r.manual_mark===1||r.marked_submission_id===r.latest_submission_id);
   return {...(native?{late:Boolean(r.is_late),...(staff?{releasedMarkIsCurrent:Boolean(approved&&r.released_mark_id===r.mark_id)}:{})}:{}),accountId:r.account_id,name:r.display_name,revision:r.revision,firstAccessedAt:r.first_accessed_at,submittedAt:r.submitted_at,submissionNumber:r.submission_number||0,submissionId:r.latest_submission_id,answerFileId:r.answer_file_id,submissionConfirmedAt:r.confirmed_at,submissionConfirmedBy:staff?r.confirmed_by:null,resubmissionAuthorised:Boolean(r.resubmit_authorised),
    markState:staff?r.mark_state:(native?r.ownReleasedMark:approved&&r.released_mark_id===r.mark_id)?'RELEASED':r.latest_submission_id?'PENDING':'NOT_SUBMITTED',
    mark:staff?r.mark:native?r.ownReleasedMark?r.released_mark:null:approved&&r.released_mark_id===r.mark_id?r.mark:null,feedback:staff?r.feedback:native?r.ownReleasedFeedback?r.released_feedback:'':approved&&r.released_feedback_id===r.mark_id?r.feedback:'',scriptFileId:staff?r.script_file_id:native?r.ownReleasedScript?r.released_script_file_id:null:approved&&r.released_script_id===r.mark_id?r.script_file_id:null,
    markId:staff?r.mark_id:null,moderationComment:staff?r.moderation_comment:'',marksReleased:native?r.ownReleasedMark:approved&&r.released_mark_id===r.mark_id,feedbackReleased:native?r.ownReleasedFeedback:approved&&r.released_feedback_id===r.mark_id,scriptReleased:native?r.ownReleasedScript:approved&&r.released_script_id===r.mark_id};
  });
  const history=staff?(await p('SELECT action,account_id,details_json,occurred_at FROM assessment_events WHERE assessment_id=? ORDER BY occurred_at DESC,event_id DESC LIMIT 100',a.assessment_id).all()).results:[];
  const ownAttempt=native&&learn&&!preview?await p('SELECT deadline_at FROM assessment_attempts WHERE assessment_id=? AND account_id=?',a.assessment_id,actor).first():null;
  const currentCollection=await collection(a),policy=native?collectionPolicy(a,currentCollection):null,counts={expected:recipients.length,received:recipients.filter(r=>r.latest_submission_id).length,unchecked:recipients.filter(r=>r.latest_submission_id&&!r.confirmed_at).length,replacements:recipients.filter(r=>r.resubmit_authorised).length},ready=native?readyEligibility(a,counts,currentCollection):null;
  const result={assessment:{...metadata(a,currentCollection),...(native?{canUpload:!preview&&policy.open&&paperAvailable(a),...(learn?{attemptDeadline:ownAttempt?.deadline_at||null,serverNow:new Date().toISOString()}:{}),readyAvailable:staff&&ready.available,readyUnchecked:ready.unchecked,canDirectAdmin:admin&&!preview}:{}),id:a.assessment_id,examinerId:canTeach?a.examiner_id:null,examinerName:canTeach?a.examiner_name||'':'',paperUploaderName:canTeach?a.paper_uploader_name||'':'',title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,registerId:a.register_id,phaseId:a.phase_id,phaseName:a.phase_name||'',examDate:a.exam_date,...(!learn?{durationMinutes:a.duration_minutes,maximumMark:a.maximum_mark}:{}),activityKey:a.activity_key,activityName:a.activity_name,classId:a.class_id,className:a.class_name,revision:a.revision,published:Boolean(a.schedule_published),paperAvailable:paperAvailable(a),paperState:canTeach?(a.paper_file_id?a.paper_state:'NONE'):paperAvailable(a)?'AVAILABLE':'WAITING',paperComment:canTeach?a.paper_comment:'',paperFileId:staff||!canTeach&&paperAvailable(a)?a.paper_file_id:null,canOpenPaper:staff||!canTeach&&paperAvailable(a),canViewSubmissions:staff,canEnterMarks:staff,canReplacePaper:admin||staff&&a.paper_state!=='APPROVED'&&!a.paper_released_at,paperReleased:canTeach?Boolean(a.paper_released_at):paperAvailable(a),readyForAssessmentAt:canTeach?a.ready_for_assessment_at:null,readyForAssessmentBy:canTeach?a.ready_for_assessment_by:null,learnerPreview:preview,readOnly,canAdmin:!preview&&admin,canTeach,isExaminer:!preview&&examiner,canModeratePaper:!preview&&admin,canModerate:!preview&&admin&&!same(a.examiner_id,actor),canSubmitPaper:staff&&(!a.examiner_id||examiner||admin||auth.adminView&&administers(auth,a.activity_key))},learners,history:preview?[]:admin?history:history.filter(e=>['upload-ANSWER','view-answer','confirm-submission','ready-assessment','mark'].includes(e.action)).map(({action,account_id,occurred_at})=>({action,account_id,occurred_at})),store:'D1'};
  if(staff&&!preview){const group=await assessmentGroup(s,a);if(group){
   let canManage=true;try{await s.requireAssessorGroup(group);}catch(e){if(e.status!==403)throw e;canManage=false;}
   result.group={shared:true,canManage,members:[]};
   if(canManage){const ids=JSON.stringify(group.map(a=>a.assessment_id)),counts=(await p(`SELECT r.assessment_id,count(*) expected,sum(r.latest_submission_id IS NOT NULL) received,sum(r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NULL) unchecked,sum(r.resubmit_authorised=1) replacements FROM assessment_recipients r LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id WHERE r.assessment_id IN(SELECT value FROM json_each(?)) GROUP BY r.assessment_id`,ids).all()).results,collections=native?(await p('SELECT * FROM assessment_collection WHERE assessment_id IN(SELECT value FROM json_each(?))',ids).all()).results:[];
    result.group.members=group.map(m=>({id:m.assessment_id,revision:m.revision,className:m.class_name,activityName:m.activity_name,activityKey:m.activity_key,classId:m.class_id,paperFileId:m.paper_file_id,collectionRevision:collections.find(c=>c.assessment_id===m.assessment_id)?.revision||0}));
    result.group.readyAvailable=group.every(m=>m.ready_for_assessment_at||(native?readyEligibility(m,counts.find(c=>c.assessment_id===m.assessment_id)||{expected:0,received:0,unchecked:0,replacements:0},collections.find(c=>c.assessment_id===m.assessment_id)).available:true));
    result.group.readyUnchecked=counts.reduce((n,c)=>n+Number(c.unchecked||0),0);
    result.group.ready=group.every(m=>m.ready_for_assessment_at);
   }
   result.assessment.canSubmitPaper&&=canManage;result.assessment.canModerate&&=canManage;result.assessment.canModeratePaper&&=canManage;
  }}
  if(learn)for(const r of result.learners)for(const key of ['mark','markId','moderationComment','submissionConfirmedBy'])delete r[key];
  return result;
 }
 async function saveScheduleBatch(input){
  if(!isAdminWorkspace(auth))throw fail('Assessment setup requires Admin access.',403,'FORBIDDEN');
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100||input.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw fail('Save between one and 100 assessment edits together.');
  return s.change(input.table?'table-save':'schedule-batch',input,String(input.registerId||''),async()=>{
   const register=await registerRecord(s,input.registerId);
   if(input.revision!==register.revision)throw fail('This Imtihaan changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');
   if(['CANCELLED','ARCHIVED'].includes(register.status))throw fail('This Imtihaan is not available for assessment setup.',409);
   const allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
   if(register.activityKeys.some(key=>!allowed.has(key)))throw fail('This Imtihaan includes a learning area outside your administration access.',403,'FORBIDDEN');
   const current=(await p('SELECT * FROM assessments WHERE register_id=? AND deleted_at IS NULL LIMIT 1001',register.register_id).all()).results;
   if(current.length>1000)throw fail('This Imtihaan has too many assessments to save together.',409);
   if(input.table&&native){const hashes=new Map((await p('SELECT file_id,sha256 FROM assessment_file_integrity WHERE file_id IN(SELECT value FROM json_each(?))',JSON.stringify(current.map(a=>a.paper_file_id).filter(Boolean))).all()).results.map(f=>[f.file_id,f.sha256]));for(const a of current)a.paper_sha256=hashes.get(a.paper_file_id)||null;}
   const records=new Map(current.map(a=>[a.assessment_id,a])),existing=input.rows.filter(r=>r.assessmentId),original=await assessmentSelections(s,existing.map(r=>r.assessmentId));
   const entries=[],targets=[],seen=new Set();let newCount=0;
   for(const row of input.rows){
    let members,classes;
    if(row.assessmentId){
     const a=records.get(row.assessmentId);if(!a)throw fail('An assessment is outside this Imtihaan.',403,'FORBIDDEN');
     const selected=original.get(a.assessment_id),ids=Array.isArray(selected)&&selected.length>1?selected:[a.assessment_id];
     if(ids.length>50||new Set(ids).size!==ids.length||!ids.includes(a.assessment_id))throw fail('Refresh the shared assessment selection.',409,'ASSESSMENT_GROUP_CHANGED');
     members=ids.map(id=>records.get(id));if(members.some(a=>!a))throw fail('A shared assessment class is unavailable.',409,'ASSESSMENT_GROUP_CHANGED');
     if(members.length>1)groupRevisions(members,row);else s.revision(a,row);
     for(const member of members){if(seen.has(member.assessment_id))throw fail('An assessment appears more than once in this save.');seen.add(member.assessment_id);}
     classes=members.map(a=>({activityKey:a.activity_key,classId:a.class_id}));
    }else{
     classes=row.classes||[{activityKey:row.activityKey,classId:row.classId}];
     if(!Array.isArray(classes)||!classes.length||classes.length>50||classes.some(c=>!c||typeof c.activityKey!=='string'||typeof c.classId!=='string')||new Set(classes.map(c=>JSON.stringify([c.activityKey,c.classId]))).size!==classes.length)throw fail('Choose between one and 50 different classes for each assessment.');
     newCount+=classes.length;
    }
    for(const c of classes)await requireRegisterClass(s,register.register_id,c.activityKey,c.classId,register);
    targets.push(...classes);entries.push({row,members,classes});
   }
   if(current.length+newCount>1000)throw fail('Keep this Imtihaan within 1,000 class assessments.',409);
   await s.requireAdminClasses([...new Map(targets.map(c=>[JSON.stringify([c.activityKey,c.classId]),c])).values()]);
   const keys=[...new Set(targets.map(c=>c.activityKey))],choices=await catalogue(),examiners=await s.examinerTeachers(keys),timezone=native?await appTimezone(repository):null;
   const phaseIds=[...new Set(entries.flatMap(e=>e.members?.map(a=>e.row.phaseId===undefined?a.phase_id:e.row.phaseId)||[e.row.phaseId]).filter(Boolean))];
   const phaseRows=phaseIds.length?(await p('SELECT phase_id,activity_key FROM assessment_phases WHERE phase_id IN(SELECT value FROM json_each(?))',JSON.stringify(phaseIds)).all()).results:[];
   const phases=new Set(phaseRows.map(ph=>JSON.stringify([ph.phase_id,ph.activity_key]))),context={catalogue:choices,examiners,phases,timezone,registers:new Map([[register.register_id,register]])};
   context.fields=fields;context.native=native;if(input.table){context.tableStates=await assessmentTableStates(s,current);context.collections=new Map(native?(await p('SELECT * FROM assessment_collection WHERE assessment_id IN(SELECT value FROM json_each(?))',JSON.stringify(current.map(a=>a.assessment_id))).all()).results.map(c=>[c.assessment_id,c]):[]);}
   const statements=[],created=[],changed=[],now=new Date().toISOString();
   for(const {row,members,classes} of entries){
    if(row.examinerId&&classes.some(c=>!examiners.some(t=>t.id===row.examinerId&&t.activity_key===c.activityKey)))throw fail('Choose an examiner who teaches in every selected learning area.',403,'EXAMINER_OUTSIDE_PROGRAM');
    if(members){
     context.groupHasMarks=input.table&&members.some(a=>context.tableStates.get(a.assessment_id)?.entered);
     for(const a of members){const plan=input.table&&row.changes?await assessmentTablePlan(s,a,row,context):await mutationPlan('save',{...row,registerId:register.register_id,activityKey:a.activity_key,assessmentId:a.assessment_id,revision:a.revision},a,context);statements.push(...plan.statements);changed.push(a.assessment_id);}
    }else{
     const v=await fields({...row,activityKey:classes[0].activityKey},null,choices,examiners,timezone),ids=classes.map(()=>crypto.randomUUID());
     for(const [i,c] of classes.entries()){
      const phaseId=await phaseFor(row.phaseId,c.activityKey,phases),id=ids[i];
      created.push({assessment_id:id,activity_key:c.activityKey,class_id:c.classId,title:v.title,subject:v.subject,exam_date:v.date,duration_minutes:v.duration,maximum_mark:v.maximum,phase_id:phaseId,subject_descriptor:v.descriptor,created_at:now,created_by:actor,updated_at:now,register_id:register.register_id,examiner_id:v.examinerId,...(native?{assessment_kind:v.timing.kind,timing_mode:v.timing.mode,timezone:v.timing.timezone,available_from:v.timing.opens,due_at:v.timing.due,exam_cutoff:v.timing.cutoff,allowance_minutes:v.timing.allowance}:{})});
      statements.push(s.event({assessment_id:id,activity_key:c.activityKey},'CREATED',{title:v.title,assessmentIds:ids}));changed.push(id);
     }
    }
   }
   statements.unshift(...insertRecords(p,'assessments',created));
   statements.push(p('UPDATE assessment_registers SET revision=revision+1,updated_at=? WHERE register_id=?',now,register.register_id));
   return {statements:s.combine(statements),result:{registerId:register.register_id,revision:register.revision+1,saved:entries.length,assessmentIds:changed}};
  });
 }
 async function create(input){
  const targets=input.classes===undefined?[{activityKey:input.activityKey,classId:input.classId}]:input.classes;
  if(!Array.isArray(targets)||!targets.length||targets.length>50||targets.some(c=>!c||typeof c.activityKey!=='string'||typeof c.classId!=='string'||!c.activityKey||!c.classId||c.activityKey.length>200||c.classId.length>200)||new Set(targets.map(c=>JSON.stringify([c.activityKey.toLowerCase(),c.classId.toLowerCase()]))).size!==targets.length)throw fail('Choose between one and 50 different classes.');
  if(targets[0].activityKey!==input.activityKey)throw fail('Choose a class in the selected learning area.');
  return s.change('create',input,input.activityKey,async()=>{
   await s.requireAdminClasses(targets);
   const selectedRegister=input.registerId?await requireRegisterClass(s,input.registerId,targets[0].activityKey,targets[0].classId):null;
   const v=await fields(input),now=new Date().toISOString(),statements=[],ids=targets.map(()=>crypto.randomUUID()),registers=new Map(),phases=new Map();
   let shared=null;
   if(targets.length>1&&!input.registerId&&!input.phaseId){shared=crypto.randomUUID();statements.push(...newRegisterStatements(s,{id:shared,name:v.title,keys:[...new Set(targets.map(c=>c.activityKey))]}));}
   if(v.examinerId)for(const key of new Set(targets.map(t=>t.activityKey)))await s.examinerChoice(v.examinerId,key);
   for(const [index,target] of targets.entries()){
    if(!phases.has(target.activityKey))phases.set(target.activityKey,await phaseFor(input.phaseId,target.activityKey));
    const phaseId=phases.get(target.activityKey),id=ids[index];
    let register;
    if(input.registerId)register={id:(await requireRegisterClass(s,input.registerId,target.activityKey,target.classId,selectedRegister)).register_id,statements:[]};
    else if(shared)register={id:shared,statements:[]};
    else{const key=phaseId||JSON.stringify([target.activityKey,target.classId]);register=registers.get(key);if(!register){register=await legacyRegisterPlan(s,{...target,title:v.title,phaseId});registers.set(key,{id:register.id,statements:[]});}}
    statements.push(...register.statements,p(`INSERT INTO assessments(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,phase_id,subject_descriptor,created_at,created_by,updated_at,register_id,examiner_id${native?',assessment_kind,timing_mode,timezone,available_from,due_at,exam_cutoff,allowance_minutes':''}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${native?',?,?,?,?,?,?,?':''})`,id,target.activityKey,target.classId,v.title,v.subject,v.date,v.duration,v.maximum,phaseId,v.descriptor,now,actor,now,register.id,v.examinerId,...(native?[v.timing.kind,v.timing.mode,v.timing.timezone,v.timing.opens,v.timing.due,v.timing.cutoff,v.timing.allowance]:[])),s.event({assessment_id:id,activity_key:target.activityKey},'CREATED',{title:v.title,assessmentIds:ids}));
   }
   return {statements:ids.length>1?s.combine(statements):statements,result:{assessmentId:ids[0],...(input.classes===undefined?{}:{assessmentIds:ids})}};
  });
 }
 async function mutate(action,input){
  const initial=await s.assessment(input.assessmentId);
  return s.change(action,input,initial.assessment_id,async()=>{
   const a=await s.assessment(initial.assessment_id),group=sharedAssessmentAction(action,input)?await assessmentGroup(s,a):null;
   if(!group)return mutationPlan(action,{...input,skipPaperEvidence:false},a);
   groupRevisions(group,input);
   if(['paper-details','ready-assessment'].includes(action)){await s.requireAssessorGroup(group);}else await s.requireAdminClasses(group.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
   if(action==='paper-details'){try{await s.requireAdminClasses(group.map(a=>({activityKey:a.activity_key,classId:a.class_id})));}catch(e){if(e.status!==403)throw e;}}
   if(action==='ready-assessment'&&input.confirmUnchecked===true)await s.requireAdminClasses(group.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
   if(action==='collection-save'&&(!Array.isArray(input.groupCollections)||input.groupCollections.some(c=>!c||typeof c.id!=='string'||!Number.isInteger(c.revision))))throw fail('Refresh the shared submission settings before saving.',409,'ROW_CHANGED');
   if(action==='review-paper'&&input.decision==='APPROVE'){
    if(input.paperReview?.fileId!==a.paper_file_id||(input.paperReview?.sha256??null)!==(a.paper_sha256??null))throw fail('Review the exact shared learner paper before approval.',409,'PAPER_REVIEW_REQUIRED');
    const files=(await p('SELECT file_id,object_key FROM assessment_files WHERE file_id IN(SELECT value FROM json_each(?))',JSON.stringify(group.map(a=>a.paper_file_id))).all()).results;
    if(files.length!==1||new Set(group.map(a=>a.paper_file_id)).size!==1||new Set(files.map(f=>f.object_key)).size!==1||new Set(group.map(a=>a.paper_sha256)).size!==1)throw fail('These classes do not have the same uploaded paper. Upload the shared paper before reviewing.',409,'PAPER_REVIEW_REQUIRED');
   }
   const statements=[],scopes=[],context={},ids=JSON.stringify(group.map(a=>a.assessment_id));let changed=0;
   if(['save','paper-details'].includes(action)){context.catalogue=await catalogue();context.registers=new Map();}
   if(['publish','roster','paper-details'].includes(action))context.submitted=new Set((await p('SELECT DISTINCT assessment_id FROM assessment_submissions WHERE assessment_id IN(SELECT value FROM json_each(?))',ids).all()).results.map(r=>r.assessment_id));
   if(['publish','roster'].includes(action))context.rosters=await s.rosters(group);
   if(native&&['ready-assessment','collection-save'].includes(action))context.collections=(await p('SELECT * FROM assessment_collection WHERE assessment_id IN(SELECT value FROM json_each(?))',ids).all()).results;
   if(action==='ready-assessment')context.counts=(await p(`SELECT r.assessment_id,count(*) expected,sum(r.latest_submission_id IS NOT NULL) received,sum(r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NULL) unchecked,sum(r.resubmit_authorised=1) replacements FROM assessment_recipients r LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id WHERE r.assessment_id IN(SELECT value FROM json_each(?)) GROUP BY r.assessment_id`,ids).all()).results;
   if(action==='release')context.recipients=(await p(`SELECT r.*,m.state,m.submission_id,m.script_file_id,m.manual FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id WHERE r.assessment_id IN(SELECT value FROM json_each(?))`,ids).all()).results;

   for(const member of group){
    if(action==='ready-assessment'&&member.ready_for_assessment_at)continue;
    if(action==='release'&&!context.recipients.some(r=>r.assessment_id===member.assessment_id&&(r.latest_submission_id||r.manual===1)))continue;
    const c=action==='collection-save'?context.collections.find(c=>c.assessment_id===member.assessment_id):null;
    if(action==='collection-save'&&(input.groupCollections?.find(r=>r.id===member.assessment_id)?.revision??-1)!==(c?.revision||0))throw fail('Submission settings changed in a selected class. Refresh before saving.',409,'ROW_CHANGED');
    const plan=await mutationPlan(action,{...input,assessmentId:member.assessment_id,revision:member.revision,...(action==='review-paper'?{skipPaperEvidence:member.assessment_id!==a.assessment_id,paperReview:{fileId:member.paper_file_id,sha256:member.paper_sha256||null}}:{}),...(action==='collection-save'?{collectionRevision:c?.revision||0}:{})},member,context);
    statements.push(...plan.statements);scopes.push(member.activity_key);changed++;
   }
   if(!changed)throw fail(action==='release'?'There are no assessed submissions to release.':'This shared assessment is already ready.',409);
   return {statements:s.combine(statements),result:{assessmentId:a.assessment_id,revision:a.revision+1,appliedClasses:changed,setupScopes:[...new Set(scopes)]}};
  });
 }
 async function mutationPlan(action,input,a,context={}){
   const currentCollection=()=>context.collections?context.collections.find(c=>c.assessment_id===a.assessment_id):collection(a);
   const now=new Date().toISOString(),statements=[];
   s.revision(a,input);
   if(['save','publish','roster','review-paper','authorise-resubmission','release','finalise','withdraw-release','collection-save'].includes(action))await s.requireClass(a.activity_key,a.class_id,'admin');
   if(action==='collection-save'&&native){
    const c=await currentCollection();if((c?.revision||0)!==input.collectionRevision)throw fail('Submission settings changed. Refresh before saving.',409,'ROW_CHANGED');
    if(typeof input.closed!=='boolean')throw fail('Choose open or closed submissions.');
    if(a.assessment_kind==='EXAM'&&input.dueAt)throw fail('Exam submissions retain their exam-day cutoff.');
    const t=a.assessment_kind==='EXAM'?{due:null}:await timingFields(repository,{...a,assessmentKind:'ASSIGNMENT',timingMode:a.timing_mode,durationMinutes:a.duration_minutes,allowanceMinutes:a.allowance_minutes,availableFrom:a.available_from,dueAt:input.dueAt??c?.effective_due_at??a.due_at},a);
    const effectiveDue=c?.effective_due_at||a.due_at;if(effectiveDue&&(!t.due||t.due<effectiveDue))throw fail('Keep the existing due date or extend it. Use Close to stop learner submissions.');
    statements.push(p('INSERT INTO assessment_collection VALUES(?,?,?,?,?,?) ON CONFLICT(assessment_id) DO UPDATE SET effective_due_at=excluded.effective_due_at,closed_at=excluded.closed_at,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',a.assessment_id,t.due,input.closed?(c?.closed_at||now):null,(c?.revision||0)+1,now,actor));
   }else if(action==='save'){
    if(a.paper_state!=='DRAFT'||a.schedule_published)throw fail('Published assessments retain their schedule. Create a new assessment for a replacement schedule.',409);
    const v=await fields(input,a,context.catalogue,context.examiners,context.timezone),phaseId=await phaseFor(input.phaseId===undefined?a.phase_id:input.phaseId,a.activity_key,context.phases);
    if(input.registerId&&context.registers&&!context.registers.has(input.registerId))context.registers.set(input.registerId,await registerRecord(s,input.registerId));
    const register=input.registerId?{id:(await requireRegisterClass(s,input.registerId,a.activity_key,a.class_id,context.registers?.get(input.registerId))).register_id,statements:[]}:phaseId===a.phase_id&&a.register_id?{id:a.register_id,statements:[]}:await legacyRegisterPlan(s,{activityKey:a.activity_key,classId:a.class_id,title:v.title,phaseId});
    statements.push(...register.statements,p(`UPDATE assessments SET title=?,subject=?,exam_date=?,duration_minutes=?,maximum_mark=?,phase_id=?,subject_descriptor=?,register_id=?,examiner_id=?${native?',assessment_kind=?,timing_mode=?,timezone=?,available_from=?,due_at=?,exam_cutoff=?,allowance_minutes=?':''} WHERE assessment_id=?`,v.title,v.subject,v.date,v.duration,v.maximum,phaseId,v.descriptor,register.id,v.examinerId,...(native?[v.timing.kind,v.timing.mode,v.timing.timezone,v.timing.opens,v.timing.due,v.timing.cutoff,v.timing.allowance]:[]),a.assessment_id));
   }else if(action==='paper-details'){
    await s.requireExaminer(a);
    if(input.examinerId!==undefined&&!same(input.examinerId,a.examiner_id))await s.requireClass(a.activity_key,a.class_id,'admin');
    if(await p('SELECT 1 found FROM assessment_recipients WHERE assessment_id=? AND latest_mark_id IS NOT NULL LIMIT 1',a.assessment_id).first())throw fail('Paper details are fixed after marks have been entered.',409);
    if(a.paper_released_at||(context.submitted?context.submitted.has(a.assessment_id):await p('SELECT 1 found FROM assessment_submissions WHERE assessment_id=? LIMIT 1',a.assessment_id).first()))throw fail('Paper details are fixed after release.',409);
    const v=await fields({...input,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,examDate:a.exam_date},a,context.catalogue);
    statements.push(p(`UPDATE assessments SET duration_minutes=?,maximum_mark=?,examiner_id=?,subject_descriptor=?,paper_state=CASE WHEN paper_file_id IS NOT NULL THEN 'IN_REVIEW' ELSE paper_state END,paper_released_at=NULL${native?',timing_mode=?,allowance_minutes=?':''} WHERE assessment_id=?`,v.duration,v.maximum,v.examinerId,v.descriptor,...(native?[v.timing.mode,v.timing.allowance]:[]),a.assessment_id));
   }else if(action==='publish'||action==='roster'){
    if(context.submitted?context.submitted.has(a.assessment_id):await p('SELECT 1 found FROM assessment_submissions WHERE assessment_id=? LIMIT 1',a.assessment_id).first())throw fail('The learner list is preserved after submissions begin.',409);
    const rows=context.rosters?context.rosters.filter(r=>r.assessment_id===a.assessment_id):await s.roster(a);if(!rows.length)throw fail('This class has no eligible learners. Check its enrolments before publishing.',409);if(rows.length>2000)throw fail('Split this class into smaller assessment groups.',409);
    // Preserve first-access evidence if a roster is refreshed before submission.
    statements.push(p(`DELETE FROM assessment_recipients WHERE assessment_id=? AND first_accessed_at IS NULL AND account_id NOT IN(SELECT json_extract(value,'$.account_id') FROM json_each(?))`,a.assessment_id,JSON.stringify(rows)),rosterStatement(a,rows),p('UPDATE assessments SET schedule_published=1 WHERE assessment_id=?',a.assessment_id));
   }else if(action==='review-paper'){
    await s.moderator(a,{paper:true});if(a.paper_state!=='IN_REVIEW')throw fail('This paper is not awaiting moderation.',409);
    if(!['APPROVE','RETURN'].includes(input.decision))throw fail('Choose Approve or Return.');const comment=cleanText(input.comment||'',4000,'moderation comments',input.decision==='APPROVE');
    if(native&&input.decision==='APPROVE'){if(input.paperReview?.fileId!==a.paper_file_id||(input.paperReview?.sha256??null)!==(a.paper_sha256??null))throw fail('Review the exact learner paper before approval.',409,'PAPER_REVIEW_REQUIRED');if(!input.skipPaperEvidence)statements.push(p('INSERT OR REPLACE INTO assessment_paper_review VALUES(?,?,?,?,?,?)',a.paper_file_id,a.assessment_id,a.paper_sha256||null,a.revision,now,actor));}
    statements.push(p('UPDATE assessments SET paper_state=?,paper_comment=?,paper_released_at=NULL WHERE assessment_id=?',input.decision==='APPROVE'?'APPROVED':'RETURNED',comment,a.assessment_id));
   }else if(action==='authorise-resubmission'){
    const rows=await selected(a,input);if(rows.some(r=>!r.latest_submission_id))throw fail('Choose learners who have already submitted.',409);
    statements.push(p(`UPDATE assessment_recipients SET resubmit_authorised=1,revision=revision+1 WHERE assessment_id=? AND account_id IN(SELECT value FROM json_each(?))`,a.assessment_id,JSON.stringify(rows.map(r=>r.account_id))),p('UPDATE assessments SET ready_for_assessment_at=NULL,ready_for_assessment_by=NULL WHERE assessment_id=?',a.assessment_id));
   }else if(action==='confirm-submission'){
    await s.requireAssessor(a);
    const r=await s.recipient(a.assessment_id,input.accountId);s.recipientRevision(r,input);
    if(!r.latest_submission_id||r.latest_submission_id!==input.submissionId)throw fail('Open the latest learner submission before confirming it.',409);
    const submission=await p('SELECT confirmed_at FROM assessment_submissions WHERE submission_id=?',r.latest_submission_id).first();
    if(submission?.confirmed_at)throw fail('This submission has already been confirmed.',409);
    const viewed=await p("SELECT 1 ok FROM assessment_events WHERE assessment_id=? AND actor_id=? AND action='view-answer' AND json_extract(details_json,'$.submissionId')=? LIMIT 1",a.assessment_id,actor,r.latest_submission_id).first();
    if(!viewed)throw fail('View this PDF before confirming that it is correct and legible.',409);
    statements.push(p('UPDATE assessment_submissions SET confirmed_at=?,confirmed_by=? WHERE submission_id=? AND confirmed_at IS NULL',now,actor,r.latest_submission_id),p('UPDATE assessment_recipients SET revision=revision+1 WHERE assessment_id=? AND account_id=?',a.assessment_id,r.account_id));
   }else if(action==='ready-assessment'){
    await s.requireClass(a.activity_key,a.class_id);
    const counts=context.counts?(context.counts.find(c=>c.assessment_id===a.assessment_id)||{expected:0,received:0,unchecked:0,replacements:0}):await p(`SELECT count(*) expected,sum(CASE WHEN r.latest_submission_id IS NOT NULL THEN 1 ELSE 0 END) received,
     sum(CASE WHEN r.latest_submission_id IS NOT NULL AND b.confirmed_at IS NULL THEN 1 ELSE 0 END) unchecked,
     sum(CASE WHEN r.resubmit_authorised=1 THEN 1 ELSE 0 END) replacements
     FROM assessment_recipients r LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id WHERE r.assessment_id=?`,a.assessment_id).first();
    if(native){const eligibility=readyEligibility(a,counts,await currentCollection());if(!eligibility.available)throw fail('Ready is available after all expected submissions are uploaded and checked, or on the next day after the exam or effective due date.',409,'ASSESSMENT_NOT_READY');if(counts.unchecked&&(!await s.allowed(a.activity_key,a.class_id,'admin')||input.confirmUnchecked!==true))throw fail('Some received answers have not been checked. Admin may cancel or explicitly continue.',409,'UNCHECKED_SUBMISSIONS_WARNING');}
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
    if(native&&input.category==='marks')throw fail('Release marks for the whole Imtihaan from the register after validation and report generation.',409,'IMTIHAAN_RELEASE_REQUIRED');
    if(!['marks','feedback','scripts'].includes(input.category))throw fail('Choose marks, feedback or scripts.');
    if(!native&&input.category==='marks'&&input.accountIds?.length)throw fail('Marks are released to the whole class together.');
    if(native&&(!['CLASS','SELECTED'].includes(input.selection)||input.selection==='SELECTED'&&!input.accountIds?.length||input.selection==='CLASS'&&input.accountIds?.length))throw fail('Choose the whole class or a nonempty learner selection explicitly.');
    const rows=await selected(a,input,context.recipients),ready=rows.filter(r=>r.latest_submission_id||r.manual===1);
    if(!ready.length)throw fail('There are no assessed submissions to release.',409);
    if(ready.some(r=>r.state!=='APPROVED'||r.manual!==1&&r.submission_id!==r.latest_submission_id))throw fail('Moderate every selected submitted assessment before release.',409);
    if(input.category==='scripts'&&ready.some(r=>!r.script_file_id))throw fail('A selected learner has no marked script attached.',409);
    const column={marks:'released_mark_id',feedback:'released_feedback_id',scripts:'released_script_id'}[input.category];
    statements.push(p(`UPDATE assessment_recipients SET ${column}=latest_mark_id,revision=revision+1 WHERE assessment_id=? AND account_id IN(SELECT value FROM json_each(?))`,a.assessment_id,JSON.stringify(ready.map(r=>r.account_id))));
   }else throw fail('Unknown assessment action.',404);
   statements.push(s.touch(a),s.event(a,action,{...(input.decision?{decision:input.decision,comment:input.comment||''}:{}),...(input.category?{category:input.category,accountIds:input.accountIds||'CLASS'}:{}),...(input.accountId?{accountId:input.accountId}:{}),...(['mark','confirm-submission'].includes(action)?{submissionId:input.submissionId}:{}),...(action==='mark'?{mark:input.mark}:{}),...(action==='paper-details'?{durationMinutes:input.durationMinutes,maximumMark:input.maximumMark,...(input.examinerId!==undefined?{examinerId:input.examinerId}:{})}:{})},input.accountId||null));
   return {statements,result:{assessmentId:a.assessment_id,revision:a.revision+1,...((action==='publish'||action==='review-paper'&&input.decision==='APPROVE')?{setupScopes:[a.activity_key]}:{})}};
 }
 async function selected(a,input,provided=null){
  const ids=input.accountIds;
  if(ids!==undefined&&(!Array.isArray(ids)||ids.length>2000||new Set(ids).size!==ids.length||ids.some(v=>typeof v!=='string')))throw fail('Choose valid learners.');
  const rows=provided?provided.filter(r=>r.assessment_id===a.assessment_id):(await p(`SELECT r.*,m.state,m.submission_id,m.script_file_id,m.manual FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id WHERE r.assessment_id=?`,a.assessment_id).all()).results;
  if(!ids?.length)return rows;
  if(ids.some(id=>!rows.some(r=>r.account_id===id)))throw fail('Choose learners in this assessment.',403);
  return rows.filter(r=>ids.includes(r.account_id));
 }
 async function deleteSession(input){
  const id=cleanText(input.assessmentId,200,'a session identifier');
  return s.change('session-delete',input,id,async()=>{
   const initial=await s.assessment(id),group=await assessmentGroup(s,initial),rows=group||[initial];
   if(group)groupRevisions(group,input);else s.revision(initial,input);
   await s.requireAdminClasses(rows.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
   const ids=JSON.stringify(rows.map(a=>a.assessment_id)),evidence=await p(`SELECT 1 found FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) AND (first_accessed_at IS NOT NULL OR latest_submission_id IS NOT NULL OR latest_mark_id IS NOT NULL)
    UNION ALL SELECT 1 FROM assessment_submissions WHERE assessment_id IN(SELECT value FROM json_each(?))
    UNION ALL SELECT 1 FROM assessment_markings WHERE assessment_id IN(SELECT value FROM json_each(?)) LIMIT 1`,ids,ids,ids).first();
   if(evidence)throw fail('A selected class has learner access, submissions or marks. The shared assessment must be retained.',409,'SESSION_IN_USE');
   const now=new Date().toISOString();
   return {statements:s.combine([p('UPDATE assessments SET deleted_at=?,deleted_by=?,revision=revision+1,updated_at=? WHERE assessment_id IN(SELECT value FROM json_each(?))',now,actor,now,ids),...rows.map(a=>s.event(a,'session-delete',{registerId:a.register_id,title:a.title,subject:a.subject,examDate:a.exam_date}))]),result:{assessmentId:id,deleted:true,appliedClasses:rows.length}};
  });
 }
 async function releasePapers(input,prepare=false){
  if(!Array.isArray(input.papers)||!input.papers.length||input.papers.length>200||new Set(input.papers.map(a=>a.id)).size!==input.papers.length)throw fail('Choose between 1 and 200 approved class papers.');
  return s.change(prepare?'prepare-papers':'release-papers',input,'PAPERS:'+actor,async()=>{
   const statements=[],now=new Date().toISOString();
   const papers=(await p('SELECT * FROM assessments WHERE deleted_at IS NULL AND assessment_id IN(SELECT json_extract(value,\'$.id\') FROM json_each(?))',JSON.stringify(input.papers)).all()).results;
   if(papers.length!==input.papers.length)throw fail('An assessment was not found.',404);
   if(prepare){
    if(typeof input.registerId!=='string'||papers.some(a=>a.register_id!==input.registerId))throw fail('Choose papers from this Imtihaan.',403);
    const validation=await imtihaanPaperValidation(s,input,native),eligible=new Set(validation.eligible.map(a=>a.id));
    const waiting=papers.filter(a=>eligible.has(a.assessment_id));
    await s.requireAdminClasses(waiting.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
    if(validation.eligible.length!==papers.length||waiting.length!==papers.length||waiting.some(a=>!papers.some(row=>row.assessment_id===a.assessment_id)||a.paper_state!=='APPROVED'||!a.schedule_published||!a.paper_file_id))throw fail('Publish the current approved papers together. Refresh if their approvals changed.',409,'PAPERS_NOT_READY');
   }
   if(!prepare&&input.preparedOperation&&repository.setup?.enabled){
    const receipt=await p("SELECT result_json FROM operation_receipts WHERE dataset_key='ASSESSMENT' AND scope_key=? AND operation_id=? AND actor_account_id=?",'PAPERS:'+actor,input.preparedOperation,actor).first(),saved=receipt?JSON.parse(receipt.result_json):null;
    const accepted=saved?.prepared&&typeof saved._acceptedHead==='string'&&saved.acceptedChange?.operationId===input.preparedOperation;
    if(!accepted||saved.papers.length!==input.papers.length||saved.papers.some(a=>!input.papers.some(row=>row.id===a.id&&row.revision===a.revision)))throw fail('Complete the approved paper publication before releasing these papers.',409,'PAPERS_NOT_PREPARED');
   }
   const checked=new Set();for(const a of papers){if(checked.has(a.assessment_id))continue;const group=await assessmentGroup(s,a);if(group&&group.some(member=>!input.papers.some(p=>p.id===member.assessment_id)))throw fail('Release the shared paper for every selected class together.',409,'ASSESSMENT_GROUP_CHANGED');for(const member of group||[a])checked.add(member.assessment_id);}
   await s.requireAdminClasses(papers.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
   for(const a of papers){const item=input.papers.find(item=>item.id===a.assessment_id);await s.requireClass(a.activity_key,a.class_id,'admin');s.revision(a,{revision:item.revision});if(!a.schedule_published||a.paper_state!=='APPROVED'||!a.paper_file_id)throw fail('Publish the schedule and approve every selected paper before release.',409);if(prepare)statements.push(s.touch(a),s.event(a,'prepare-papers',{registerId:input.registerId}));else statements.push(p('UPDATE assessments SET paper_released_at=? WHERE assessment_id=?',now,a.assessment_id),s.touch(a),s.event(a,'release-paper'));}
   return {statements:input.papers.length>1?s.combine(statements):statements,result:prepare?{prepared:true,papers:papers.map(a=>({id:a.assessment_id,revision:a.revision+1})),setupScopes:[...new Set(papers.map(a=>a.activity_key))]}:{released:input.papers.length}};
  });
 }
 return {store:s,run:async(action,input)=>{
  if(action==='table-save')return saveScheduleBatch({...input,table:true});
  if(action==='register-marks-preview'||action==='register-marks-release')return assessmentRegisterMarks(s,input,action==='register-marks-preview',auth);
  if(action==='schedule-batch')return saveScheduleBatch(input);
  if(action==='register-release')return releaseRegister(s,input);if(action==='register-create')return createRegister(s,input);if(action==='register-save')return saveRegister(s,input);if(action==='register-validate')return validateRegister(s,input);if(action==='session-delete')return deleteSession(input);if(action==='phase-create')return createPhase(input);if(action==='list')return list(input);if(action==='get')return detail(input);if(action==='create')return create(input);if(action==='release-papers')return releasePapers(input);if(action==='prepare-papers')return releasePapers(input,true);return mutate(action,input);
 }};
}
