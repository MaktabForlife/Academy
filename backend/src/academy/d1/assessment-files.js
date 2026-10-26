import {assessmentGroup,groupRevisions} from './assessment-group.js';
import {reportDefinitionHash} from './assessment-report-source.js';
import {assessmentOperations,collectionPolicy} from './assessment-timing.js';
import {isAdminWorkspace,readerPreview} from './workspace-access.js';
import {assessmentStore,paperAvailable,paperReplacementOpen,cleanText,adminClause,learnerClause} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';

export const ASSESSMENT_FILE_LIMIT=16*1024*1024;
export function assessmentFiles(repository,auth,env){
 const s=assessmentStore(repository,auth),{p,actor}=s,native=assessmentOperations(repository);
 const bucket=()=>{if(!env.ASSESSMENT_BUCKET?.put||!env.ASSESSMENT_BUCKET?.get)throw fail('Private assessment storage is not configured.',503,'ASSESSMENT_STORAGE_REQUIRED');return env.ASSESSMENT_BUCKET;};
 async function upload(request,input){
  const kind=input.kind;if(!['PAPER','ANSWER','SCRIPT','TEMPLATE','REPORT'].includes(kind))throw fail('Choose a supported assessment attachment.');
  if(!Number.isSafeInteger(input.size)||input.size<5||input.size>ASSESSMENT_FILE_LIMIT)throw fail('Choose a file up to 16 MB.',413);
  if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('The upload needs its file checksum.');
  const filename=cleanText(input.filename,180,'a filename').replace(/[\r\n\x00-\x1f\\/]/g,'_');
  const mime=input.mimeType,template=kind==='TEMPLATE';
  if(!(template?['application/pdf','image/png','image/jpeg']:['application/pdf']).includes(mime))throw fail(template?'Choose a PDF, PNG or JPG design.':'Choose a PDF attachment.');
  const a=template?null:await s.assessment(input.assessmentId),scope=a?.activity_key||input.activityKey,classId=a?.class_id||input.classId;
  const manual=native&&kind==='ANSWER'&&isAdminWorkspace(auth)&&Boolean(input.accountId);
  const owner=kind==='ANSWER'&&manual||['SCRIPT','REPORT'].includes(kind)?String(input.accountId||''):actor;
  let paperMode,paperDuration,paperAllowance,paperExaminer=null,paperDescriptor=null,submissionPolicy,paperTargets;
  async function authority(){
   if(kind==='TEMPLATE'||kind==='REPORT')await s.requireClass(scope,classId,'admin');
   if(kind==='PAPER'){
    const current=await s.assessment(a.assessment_id),group=await assessmentGroup(s,current);paperTargets=group||[current];
    if(group)groupRevisions(group,input);else s.revision(current,input);
    await s.requireAssessmentStaffGroup(paperTargets);
    if(input.examinerId!==undefined){await s.requireAdminClasses(paperTargets.map(a=>({activityKey:a.activity_key,classId:a.class_id})));for(const key of new Set(paperTargets.map(a=>a.activity_key))){const teacher=await s.examinerChoice(input.examinerId,key);paperExaminer=teacher.id||actor;paperDescriptor=teacher.name||current.subject_descriptor;}}
    const mode=native?(input.timingMode||current.timing_mode||'TIMED'):'TIMED',duration=mode==='UNTIMED'?null:input.durationMinutes??current.duration_minutes,allowance=mode==='UNTIMED'?null:input.allowanceMinutes??current.allowance_minutes??15,maximum=input.maximumMark??current.maximum_mark;
    if(!['TIMED','UNTIMED'].includes(mode)||mode==='TIMED'&&(!Number.isInteger(duration)||duration<1||duration>1440||!Number.isInteger(allowance)||allowance<0||allowance>1440)||typeof maximum!=='number'||!Number.isFinite(maximum)||maximum<=0||maximum>1000000)throw fail('Enter a valid paper duration and total mark.');
    paperMode=mode;paperDuration=duration;paperAllowance=allowance;
    if(await p('SELECT 1 found FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) AND latest_mark_id IS NOT NULL LIMIT 1',JSON.stringify(paperTargets.map(a=>a.assessment_id))).first())throw fail('A paper with entered marks cannot be replaced.',409);
    if(paperTargets.some(a=>a.paper_released_at)){if(paperTargets.some(a=>!paperReplacementOpen(a)))throw fail('This paper is already available to students and cannot be replaced.',409,'PAPER_ALREADY_AVAILABLE');await s.requireAdminClasses(paperTargets.map(a=>({activityKey:a.activity_key,classId:a.class_id})));}
    if(await p('SELECT 1 ok FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) AND (first_accessed_at IS NOT NULL OR latest_submission_id IS NOT NULL) LIMIT 1',JSON.stringify(paperTargets.map(a=>a.assessment_id))).first())throw fail('A paper accessed by students cannot be replaced.',409);
    if(paperTargets.some(member=>member.examiner_id&&!same(member.examiner_id,actor)))await s.requireAdminClasses(paperTargets.map(a=>({activityKey:a.activity_key,classId:a.class_id})));
   }
   if(kind==='SCRIPT'){await s.requireExaminer(await s.assessment(a.assessment_id));if(native){const r=await s.recipient(a.assessment_id,owner);if(!r?.latest_submission_id||r.latest_submission_id!==input.submissionId)throw fail('Attach a marked PDF to this learner’s exact latest answer.',409,'SCRIPT_SOURCE_CHANGED');}}
   if(kind==='ANSWER'){
    if(!manual&&readerPreview(auth,scope))throw fail('Student class viewing is read only.',403,'PREVIEW_READ_ONLY');
    const current=await s.assessment(a.assessment_id);await s.requireReader(current);const r=await s.recipient(a.assessment_id,owner);
    if(manual){await s.requireClass(scope,classId,'admin');if(!r)throw fail('Choose an existing learner in this assessment.',403);s.recipientRevision(r,input);return;}
    if(native){const [c,attempt]=await Promise.all([p('SELECT * FROM assessment_collection WHERE assessment_id=?',a.assessment_id).first(),p('SELECT * FROM assessment_attempts WHERE assessment_id=? AND account_id=?',a.assessment_id,owner).first()]);submissionPolicy=collectionPolicy(current,c,attempt);if(!submissionPolicy.open)throw fail('Submissions are closed. Ask Admin for manual assistance.',403,'SUBMISSIONS_CLOSED');}
    if(!r||!paperAvailable(current))throw fail('This paper is not available for submission.',403);
    s.recipientRevision(r,input);if(r.latest_submission_id&&!r.resubmit_authorised)throw fail('An administrator must authorise resubmission.',403,'RESUBMISSION_NOT_AUTHORISED');
   }
  }
  if(['SCRIPT','REPORT'].includes(kind)&&!await s.recipient(a.assessment_id,owner))throw fail('Choose a learner in this assessment.',403);
  const receipt=await p('SELECT file_id FROM assessment_files WHERE uploaded_by=? AND operation_id=?',actor,input.operationId).first();
  const id=crypto.randomUUID(),key=(env.ACADEMY_OBJECT_NAMESPACE||'')+'assessments/'+scope.replace(/[^A-Za-z0-9:_-]/g,'_')+'/'+id;
  const meta={...input,filename,mimeType:mime};
  if(receipt)return s.change('upload-'+kind,meta,a?.assessment_id||scope,async()=>{throw fail('This retry identifier belongs to another upload.',409,'OPERATION_ID_REUSED');});
  await authority();
  const storage=bucket();
  let stored=false;
  try{
   if(!receipt){
    const reader=request.body?.getReader();if(!reader)throw fail('Choose a file to upload.');
    const chunks=[];let prefixSize=0;
    while(prefixSize<8){const next=await reader.read();if(next.done)break;chunks.push(next.value);prefixSize+=next.value.byteLength;if(prefixSize>input.size){await reader.cancel();throw fail('The file size changed during upload.');}}
    const prefix=new Uint8Array(Math.min(prefixSize,8));let offset=0;for(const chunk of chunks){const take=Math.min(chunk.length,prefix.length-offset);if(take>0)prefix.set(chunk.subarray(0,take),offset);offset+=take;}
    const pdf=new TextDecoder().decode(prefix.subarray(0,5))==='%PDF-',png=prefix.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>prefix[i]===v),jpg=prefix[0]===255&&prefix[1]===216&&prefix[2]===255;
    if(!(mime==='application/pdf'?pdf:mime==='image/png'?png:jpg)){await reader.cancel();throw fail('The attachment does not match its file type.');}
    // Workers preserves a known length while R2 checks the SHA-256 checksum.
    const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(input.size):new TransformStream();
    const writer=stream.writable.getWriter();
    const copy=(async()=>{let count=0;try{for(const chunk of chunks){count+=chunk.byteLength;await writer.write(chunk);}while(true){const next=await reader.read();if(next.done)break;count+=next.value.byteLength;if(count>input.size)throw fail('The file size changed during upload.');await writer.write(next.value);}if(count!==input.size)throw fail('The upload was interrupted. Please retry.');await writer.close();}catch(e){await reader.cancel().catch(()=>{});await writer.abort(e).catch(()=>{});throw e;}})();
    const uploadPromise=storage.put(key,stream.readable,{sha256:input.sha256,httpMetadata:{contentType:mime},customMetadata:{fileId:id}}).catch(async e=>{await writer.abort(e).catch(()=>{});await reader.cancel().catch(()=>{});throw e;});
    const outcomes=await Promise.allSettled([copy,uploadPromise]);const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;stored=true;
   }
   const result=await s.change('upload-'+kind,meta,a?.assessment_id||scope,async()=>{
    await authority();const now=new Date().toISOString(),statements=[p('INSERT INTO assessment_files(file_id,assessment_id,activity_key,owner_id,uploaded_by,kind,filename,mime_type,byte_size,object_key,uploaded_at,operation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,a?.assessment_id||null,scope,owner,actor,kind,filename,mime,input.size,key,now,input.operationId)];
    if(native)statements.push(p('INSERT INTO assessment_file_integrity VALUES(?,?)',id,input.sha256));
    if(native&&kind==='SCRIPT')statements.push(p('INSERT INTO assessment_script_sources VALUES(?,?,?,?)',id,input.submissionId,a.paper_file_id,a.maximum_mark));
    let submissionId=null;
    if(kind==='PAPER')statements.push(...paperTargets.map(a=>s.event(a,'marks-moderated',{approved:false,mode:'EXTERNAL',revision:a.revision+1})),p(`UPDATE assessments SET paper_file_id=?,examiner_id=COALESCE(?,examiner_id,?),subject_descriptor=COALESCE(?,subject_descriptor),paper_state='IN_REVIEW',paper_comment='',paper_released_at=NULL,duration_minutes=?,maximum_mark=?${native?',timing_mode=?,allowance_minutes=?':''} WHERE assessment_id IN(SELECT value FROM json_each(?))`,id,paperExaminer,actor,paperDescriptor,paperDuration,input.maximumMark??a.maximum_mark,...(native?[paperMode,paperAllowance]:[]),JSON.stringify(paperTargets.map(a=>a.assessment_id))));
    if(kind==='ANSWER'){
    if(!manual&&readerPreview(auth,scope))throw fail('Student class viewing is read only.',403,'PREVIEW_READ_ONLY');
     const r=await s.recipient(a.assessment_id,owner),number=(await p('SELECT coalesce(max(submission_number),0)+1 n FROM assessment_submissions WHERE assessment_id=? AND account_id=?',a.assessment_id,owner).first()).n;
     submissionId=crypto.randomUUID();statements.push(p(`INSERT INTO assessment_submissions(submission_id,assessment_id,account_id,file_id,submitted_at,submission_number${native?',is_late,deadline_used,collection_revision':''}) VALUES(?,?,?,?,?,?${native?',?,?,?':''})`,submissionId,a.assessment_id,owner,id,now,number,...(native?[Number(!manual&&submissionPolicy.late),manual?null:submissionPolicy.deadline,manual?null:submissionPolicy.revision]:[])),p(`UPDATE assessment_recipients SET latest_submission_id=?,latest_mark_id=NULL,resubmit_authorised=0,${native?'':'released_mark_id=NULL,released_feedback_id=NULL,released_script_id=NULL,'}revision=revision+1 WHERE assessment_id=? AND account_id=?`,submissionId,a.assessment_id,r.account_id),p('UPDATE assessments SET ready_for_assessment_at=NULL,ready_for_assessment_by=NULL WHERE assessment_id=?',a.assessment_id));
    }
    if(kind==='PAPER'){for(const member of paperTargets)if(member.assessment_id!==a.assessment_id)statements.push(s.touch(member),s.event(member,'upload-PAPER',{fileId:id,filename,sharedPaper:true}));}
    if(a)statements.push(s.touch(a));
    statements.push(s.event(a||{activity_key:scope},'upload-'+kind,{fileId:id,filename,...(native&&kind==='ANSWER'?{manual,learnerId:owner,late:Boolean(!manual&&submissionPolicy.late),deadlineUsed:manual?null:submissionPolicy.deadline}:{})},['ANSWER','SCRIPT','REPORT'].includes(kind)?owner:null));
    const commitGuard=native&&kind==='ANSWER'?{sql:`EXISTS(SELECT 1 FROM activities a JOIN classes c USING(activity_key) WHERE a.activity_key=? AND c.class_id=? AND a.active=1 AND a.lifecycle='ACTIVE' AND c.active=1 AND ${manual?adminClause:learnerClause}) ${manual?'':"AND julianday('now')>=julianday(?) AND (? IS NULL OR julianday('now')<julianday(?)) AND NOT EXISTS(SELECT 1 FROM assessment_collection WHERE assessment_id=? AND closed_at IS NOT NULL)"}`,values:[scope,classId,actor,actor,...(manual?[]:[submissionPolicy.opens,submissionPolicy.cutoff,submissionPolicy.cutoff,a.assessment_id])]}:null;
    return {statements:kind==='PAPER'&&paperTargets.length>1?s.combine(statements):statements,commitGuard,result:{fileId:id,submissionId,filename,...(kind==='PAPER'?{appliedClasses:paperTargets.length}:{}),...(native?{sha256:input.sha256}:{})}};
   });
   if(stored&&result.fileId!==id)await bucket().delete(key);
   return result;
  }catch(e){/* A lost acknowledgement may already have committed the file reference. Retain its immutable object for exact retry recovery. */throw e;}
 }
 async function download(input){
  const f=await p('SELECT * FROM assessment_files WHERE file_id=?',String(input.fileId||'')).first();if(!f)throw fail('Attachment not found.',404);
  let a=null,studentPaper=false,staffAnswer=null;
  if(f.kind==='TEMPLATE'){
   const classes=await s.classes('admin',f.activity_key);if(!classes.length)throw fail('This template is outside your access.',403);
  }else{
   a=await s.assessment(f.kind==='PAPER'&&input.assessmentId?input.assessmentId:f.assessment_id);await s.requireReader(a);
   let paperGroup=null;if(f.kind==='PAPER'&&a.assessment_id!==f.assessment_id){paperGroup=await assessmentGroup(s,a);if(a.paper_file_id!==f.file_id||!paperGroup?.some(member=>member.assessment_id===f.assessment_id))throw fail('This paper is outside this class assessment.',403);}
    const staff=await s.allowed(a.activity_key,a.class_id,'admin')||same(a.examiner_id,actor)&&await s.canWork(a);
    if(native&&f.kind==='PAPER'&&!staff){const integrity=await p('SELECT sha256 FROM assessment_file_integrity WHERE file_id=?',f.file_id).first();if(integrity){const review=await p('SELECT assessment_id FROM assessment_paper_review WHERE file_id=? AND sha256=?',f.file_id,integrity.sha256).first();if(review&&review.assessment_id!==a.assessment_id)paperGroup||=await assessmentGroup(s,a);if(!review||review.assessment_id!==a.assessment_id&&!paperGroup?.some(member=>member.assessment_id===review.assessment_id))throw fail('The learner paper needs its exact-file approval.',403,'PAPER_REVIEW_REQUIRED');}}
    const answerReviewer=f.kind==='ANSWER'&&await s.readStaff(a);
   if(!staff&&!answerReviewer){
    if(f.kind==='PAPER'&&auth.workspace==='TEACH'){
     if(f.file_id!==a.paper_file_id||!paperAvailable(a))throw fail('This paper is not available yet.',403);
     const object=await bucket().get(f.object_key);if(!object)throw fail('This attachment is temporarily unavailable.',404);return fileResponse(object,f);
    }
    const r=readerPreview(auth,a.activity_key)?null:await s.recipient(a.assessment_id);
    if(!r){
     // An authorised preview has no learner record and starts no timer.
     if(f.kind==='PAPER'&&f.file_id===a.paper_file_id&&paperAvailable(a)){
      const object=await bucket().get(f.object_key);if(!object)throw fail('This attachment is temporarily unavailable.',404);
      return fileResponse(object,f);
     }
     throw fail('This attachment is outside your access.',403);
    }
    if(f.kind==='PAPER'){if(f.file_id!==a.paper_file_id||!paperAvailable(a))throw fail('This paper is not available yet.',403);studentPaper=true;}
    else if(f.kind==='ANSWER'){if(!same(f.owner_id,actor)||!await p('SELECT 1 ok FROM assessment_submissions WHERE assessment_id=? AND account_id=? AND file_id=?',a.assessment_id,actor,f.file_id).first())throw fail('This submission is outside your access.',403);}
    else if(f.kind==='SCRIPT'){
     if(!same(f.owner_id,actor)||!await p(`SELECT 1 ok FROM assessment_markings m WHERE m.mark_id=? AND m.script_file_id=? AND m.state='APPROVED' ${native?'':'AND m.submission_id=?'}`,r.released_script_id,f.file_id,...(native?[]:[r.latest_submission_id])).first())throw fail('An administrator has not released this script to you.',403);
    }else if(f.kind==='REPORT'){
     if(native&&!await p('SELECT 1 ok FROM assessment_report_evidence WHERE report_id=(SELECT report_id FROM assessment_reports WHERE file_id=?)',f.file_id).first())throw fail('Ask Admin to issue a reviewed learner report.',403,'REPORT_REVIEW_REQUIRED');
     const report=await p('SELECT * FROM assessment_reports WHERE file_id=? AND account_id=?',f.file_id,actor).first();if(!report)throw fail('This report is outside your access.',403);
     const source=JSON.parse(report.source_json),records=(await p('SELECT a.*,r.released_mark_id FROM assessment_recipients r JOIN assessments a USING(assessment_id) WHERE r.account_id=? AND a.assessment_id IN(SELECT json_extract(value,\'$.assessmentId\') FROM json_each(?))',actor,report.source_json).all()).results;
     if(native)for(const row of records)if(source.find(e=>e.assessmentId===row.assessment_id)?.definitionHash!==await reportDefinitionHash(row))throw fail('This report has been superseded. Ask Admin for a reviewed report.',409,'REPORT_SOURCE_CHANGED');
     if(records.length!==source.length||records.some(r=>r.released_mark_id!==(source.find(e=>e.assessmentId===r.assessment_id).markId??null)))throw fail('This report has been superseded. Ask an administrator for an updated report.',409);
    }else throw fail('This attachment is outside your access.',403);
   }
   if(f.kind==='ANSWER'&&(staff||answerReviewer)&&await s.allowed(a.activity_key,a.class_id))staffAnswer=await p('SELECT submission_id,account_id FROM assessment_submissions WHERE assessment_id=? AND file_id=?',a.assessment_id,f.file_id).first();
  }
  const object=await bucket().get(f.object_key);if(!object)throw fail('This attachment is temporarily unavailable.',404);
  if(staffAnswer){await s.change('view-answer',{fileId:f.file_id,operationId:input.operationId},a.assessment_id,async()=>{
   await s.requireClass(a.activity_key,a.class_id);
   return {statements:[s.event(a,'view-answer',{submissionId:staffAnswer.submission_id},staffAnswer.account_id)],result:{viewed:true}};
  });}
  if(studentPaper){await s.change('access-paper',{fileId:f.file_id,operationId:input.operationId},a.assessment_id,async()=>{
   const current=await s.assessment(a.assessment_id);await s.requireReader(current);if(current.paper_file_id!==f.file_id||!paperAvailable(current))throw fail('This paper is not available.',403);
   const r=await s.recipient(a.assessment_id);if(!r)throw fail('This assessment is outside your access.',403);
   const first=r.first_accessed_at||new Date().toISOString(),mode=current.timing_mode||'TIMED',duration=mode==='UNTIMED'?null:current.duration_minutes,allowance=mode==='UNTIMED'?null:current.allowance_minutes??15,deadline=mode==='UNTIMED'?null:new Date(Date.parse(first)+(duration+allowance)*60000).toISOString();
   const attempt=native?[p('INSERT INTO assessment_attempts VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,account_id) DO NOTHING',a.assessment_id,actor,first,mode,duration,allowance,deadline,current.timezone||'Africa/Johannesburg',current.revision)]:[];
   return {statements:[...attempt,...(r.first_accessed_at?[]:[p('UPDATE assessment_recipients SET first_accessed_at=? WHERE assessment_id=? AND account_id=? AND first_accessed_at IS NULL',new Date().toISOString(),a.assessment_id,actor),s.event(a,'first-access',{},actor)])],result:{accessed:true}};
  });}
  return fileResponse(object,f);
 }
 return {upload,download};
}
function fileResponse(object,f){return new Response(object.body,{headers:{'Content-Type':f.mime_type,'Content-Length':String(f.byte_size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});}
