import {assessmentStore,paperAvailable,cleanText} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';

export const ASSESSMENT_FILE_LIMIT=16*1024*1024;
export function assessmentFiles(repository,auth,env){
 const s=assessmentStore(repository,auth),{p,actor}=s;
 const bucket=()=>{if(!env.ASSESSMENT_BUCKET?.put||!env.ASSESSMENT_BUCKET?.get)throw fail('Private assessment storage is not configured.',503,'ASSESSMENT_STORAGE_REQUIRED');return env.ASSESSMENT_BUCKET;};
 async function upload(request,input){
  const kind=input.kind;if(!['PAPER','ANSWER','SCRIPT','TEMPLATE','REPORT'].includes(kind))throw fail('Choose a supported assessment attachment.');
  if(!Number.isSafeInteger(input.size)||input.size<5||input.size>ASSESSMENT_FILE_LIMIT)throw fail('Choose a file up to 16 MB.',413);
  if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('The upload needs its file checksum.');
  const filename=cleanText(input.filename,180,'a filename').replace(/[\r\n\x00-\x1f\\/]/g,'_');
  const mime=input.mimeType,template=kind==='TEMPLATE';
  if(!(template?['application/pdf','image/png','image/jpeg']:['application/pdf']).includes(mime))throw fail(template?'Choose a PDF, PNG or JPG design.':'Choose a PDF attachment.');
  const a=template?null:await s.assessment(input.assessmentId),scope=a?.activity_key||input.activityKey,classId=a?.class_id||input.classId;
  async function authority(){
   if(kind==='TEMPLATE'||kind==='REPORT')await s.requireClass(scope,classId,'admin');
   if(kind==='PAPER'){
    await s.requireClass(scope,classId);const current=await s.assessment(a.assessment_id);s.revision(current,input);
    const duration=input.durationMinutes??current.duration_minutes,maximum=input.maximumMark??current.maximum_mark;
    if(!Number.isInteger(duration)||duration<1||duration>1440||typeof maximum!=='number'||!Number.isFinite(maximum)||maximum<=0||maximum>1000000)throw fail('Enter a valid paper duration and total mark.');
    if(current.paper_released_at||await p('SELECT 1 ok FROM assessment_submissions WHERE assessment_id=? LIMIT 1',a.assessment_id).first())throw fail('A released paper cannot be replaced. Create a new assessment.',409);
    if(current.examiner_id&&!same(current.examiner_id,actor)&&!await s.allowed(scope,classId,'admin'))throw fail('Only the examiner can revise this paper.',403);
   }
   if(kind==='SCRIPT')await s.requireExaminer(await s.assessment(a.assessment_id));
   if(kind==='ANSWER'){
    const current=await s.assessment(a.assessment_id);await s.requireReader(current);const r=await s.recipient(a.assessment_id);
    if(!r||!paperAvailable(current))throw fail('This paper is not available for submission.',403);
    s.recipientRevision(r,input);if(r.latest_submission_id&&!r.resubmit_authorised)throw fail('An administrator must authorise resubmission.',403,'RESUBMISSION_NOT_AUTHORISED');
   }
  }
  const owner=['SCRIPT','REPORT'].includes(kind)?String(input.accountId||''):actor;
  if(['SCRIPT','REPORT'].includes(kind)&&!await s.recipient(a.assessment_id,owner))throw fail('Choose a learner in this assessment.',403);
  const receipt=await p('SELECT file_id FROM assessment_files WHERE uploaded_by=? AND operation_id=?',actor,input.operationId).first();
  const id=crypto.randomUUID(),key='assessments/'+scope.replace(/[^A-Za-z0-9:_-]/g,'_')+'/'+id;
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
    await authority();const now=new Date().toISOString(),statements=[p('INSERT INTO assessment_files VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,a?.assessment_id||null,scope,owner,actor,kind,filename,mime,input.size,key,now,input.operationId)];
    let submissionId=null;
    if(kind==='PAPER')statements.push(p("UPDATE assessments SET paper_file_id=?,examiner_id=?,paper_state='IN_REVIEW',paper_comment='',paper_released_at=NULL,duration_minutes=?,maximum_mark=? WHERE assessment_id=?",id,actor,input.durationMinutes??a.duration_minutes,input.maximumMark??a.maximum_mark,a.assessment_id));
    if(kind==='ANSWER'){
     const r=await s.recipient(a.assessment_id),number=(await p('SELECT coalesce(max(submission_number),0)+1 n FROM assessment_submissions WHERE assessment_id=? AND account_id=?',a.assessment_id,actor).first()).n;
     submissionId=crypto.randomUUID();statements.push(p('INSERT INTO assessment_submissions VALUES(?,?,?,?,?,?)',submissionId,a.assessment_id,actor,id,now,number),p('UPDATE assessment_recipients SET latest_submission_id=?,latest_mark_id=NULL,resubmit_authorised=0,released_mark_id=NULL,released_feedback_id=NULL,released_script_id=NULL,revision=revision+1 WHERE assessment_id=? AND account_id=?',submissionId,a.assessment_id,r.account_id));
    }
    if(a)statements.push(s.touch(a));
    statements.push(s.event(a||{activity_key:scope},'upload-'+kind,{fileId:id,filename},['ANSWER','SCRIPT','REPORT'].includes(kind)?owner:null));
    return {statements,result:{fileId:id,submissionId,filename}};
   });
   if(stored&&result.fileId!==id)await bucket().delete(key);
   return result;
  }catch(e){if(stored)await bucket().delete(key).catch(()=>{});throw e;}
 }
 async function download(input){
  const f=await p('SELECT * FROM assessment_files WHERE file_id=?',String(input.fileId||'')).first();if(!f)throw fail('Attachment not found.',404);
  let a=null,studentPaper=false;
  if(f.kind==='TEMPLATE'){
   const classes=await s.classes('admin',f.activity_key);if(!classes.length)throw fail('This template is outside your access.',403);
  }else{
   a=await s.assessment(f.assessment_id);await s.requireReader(a);
   const staff=await s.allowed(a.activity_key,a.class_id,'admin')||same(a.examiner_id,actor)&&await s.allowed(a.activity_key,a.class_id);
   if(!staff){
    const r=await s.recipient(a.assessment_id);
    if(!r)throw fail('This attachment is outside your access.',403);
    if(f.kind==='PAPER'){if(f.file_id!==a.paper_file_id||!paperAvailable(a))throw fail('This paper is not available yet.',403);studentPaper=true;}
    else if(f.kind==='ANSWER'){if(!same(f.owner_id,actor)||!await p('SELECT 1 ok FROM assessment_submissions WHERE assessment_id=? AND account_id=? AND file_id=?',a.assessment_id,actor,f.file_id).first())throw fail('This submission is outside your access.',403);}
    else if(f.kind==='SCRIPT'){
     if(!same(f.owner_id,actor)||!await p("SELECT 1 ok FROM assessment_markings m WHERE m.mark_id=? AND m.script_file_id=? AND m.state='APPROVED' AND m.submission_id=?",r.released_script_id,f.file_id,r.latest_submission_id).first())throw fail('An administrator has not released this script to you.',403);
    }else if(f.kind==='REPORT'){
     const report=await p('SELECT * FROM assessment_reports WHERE file_id=? AND account_id=?',f.file_id,actor).first();if(!report)throw fail('This report is outside your access.',403);
     const source=JSON.parse(report.source_json),records=(await p('SELECT assessment_id,released_mark_id FROM assessment_recipients WHERE account_id=? AND assessment_id IN(SELECT json_extract(value,\'$.assessmentId\') FROM json_each(?))',actor,report.source_json).all()).results;
     if(records.length!==source.length||records.some(r=>r.released_mark_id!==(source.find(e=>e.assessmentId===r.assessment_id).markId??null)))throw fail('This report has been superseded. Ask an administrator for an updated report.',409);
    }else throw fail('This attachment is outside your access.',403);
   }
  }
  const object=await bucket().get(f.object_key);if(!object)throw fail('This attachment is temporarily unavailable.',404);
  if(studentPaper){await s.change('access-paper',{fileId:f.file_id,operationId:input.operationId},a.assessment_id,async()=>{
   const current=await s.assessment(a.assessment_id);await s.requireReader(current);if(current.paper_file_id!==f.file_id||!paperAvailable(current))throw fail('This paper is not available.',403);
   const r=await s.recipient(a.assessment_id);if(!r)throw fail('This assessment is outside your access.',403);
   return {statements:r.first_accessed_at?[]:[p('UPDATE assessment_recipients SET first_accessed_at=? WHERE assessment_id=? AND account_id=? AND first_accessed_at IS NULL',new Date().toISOString(),a.assessment_id,actor),s.event(a,'first-access',{},actor)],result:{accessed:true}};
  });}
  return new Response(object.body,{headers:{'Content-Type':f.mime_type,'Content-Length':String(f.byte_size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox"}});
 }
 return {upload,download};
}
