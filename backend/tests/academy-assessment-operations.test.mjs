import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../src/academy-runtime.js';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},operation=()=>({operationId:crypto.randomUUID()}),today=()=>academyDate(new Date(),'Africa/Johannesburg');
async function use(fn){
 const f=await separationFixture();try{
  for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
  await initialiseAcceptedSetup(f.env.ACADEMY_DB);f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';
  const tokens={admin:await f.actor('global'),teacher:await f.login('0003'),student:await f.login('0002')};
  f.request=async(action,input={},who='admin',workspace=who==='admin'?'ADMIN':who==='teacher'?'TEACH':'LEARN',bytes)=>{
   const path=action.startsWith('/')?action:'/api/academy/assessments/'+action,headers={Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})};
   const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:bytes||JSON.stringify(input)}),f.env);
   return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
  };
  f.accept=async()=>{const input={scopes:[scopes.programA]},review=ok(await f.request('/api/admin/platform/setup/review',input)),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...input,digest:review.digest}));ok(await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest}));};
  f.create=async(input={})=>ok(await f.request('create',{...operation(),activityKey:scopes.programA,classId:'class-1',title:'Native assessment',subject:'Qasas',examDate:today(),durationMinutes:60,maximumMark:100,...input})).assessmentId;
  f.detail=async(id,who='admin')=>ok(await f.request('get',{assessmentId:id},who));
  f.change=async(id,action,input={},who='admin')=>f.request(action,{...operation(),assessmentId:id,revision:(await f.detail(id)).assessment.revision,...input},who);
  f.uploadNative=async(id,kind,input={},who='admin')=>{
   const bytes=Buffer.from('%PDF-1.4\n% native '+(input.label||'fixture')+'\n%%EOF'),metadata={...operation(),kind,assessmentId:id,mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),filename:'answer.pdf',revision:(await f.detail(id)).assessment.revision,...input};
   return f.request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,who==='admin'?'ADMIN':who==='teacher'?'TEACH':'LEARN',bytes);
  };
  f.publish=async id=>{ok(await f.change(id,'publish'));await f.accept();};
  f.releasePaper=async id=>{const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:f.db.prepare('SELECT sha256 FROM assessment_file_integrity WHERE file_id=?').get(paper.fileId).sha256}}));await f.accept();ok(await f.request('release-papers',{...operation(),papers:[{id,revision:(await f.detail(id)).assessment.revision}]}));return paper;};
  await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
}
test('untimed six-week assignments store a real null duration and retain a separate future due date',()=>use(async f=>{
 const id=await f.create({assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-60000).toISOString(),dueDate:nextDate(today(),42)}),row=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
 assert.equal(row.duration_minutes,null);assert.equal(row.allowance_minutes,null);assert.equal(row.exam_date,null);assert.equal(row.timing_mode,'UNTIMED');assert(row.due_at>row.available_from);
 await f.publish(id);await f.releasePaper(id);const learner=await f.detail(id,'student');assert.equal(learner.assessment.canUpload,true);assert(!Object.hasOwn(learner.assessment,'durationMinutes'));assert(!Object.hasOwn(learner.assessment,'maximumMark'));assert(!Object.hasOwn(learner.assessment,'allowanceMinutes'));
}));
test('late assignments remain open, record acceptance facts, and Admin can extend or explicitly close',()=>use(async f=>{
 const id=await f.create({assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-7*86400000).toISOString(),dueDate:nextDate(today(),-1)});await f.publish(id);await f.releasePaper(id);
 let d=await f.detail(id,'student');ok(await f.uploadNative(id,'ANSWER',{recipientRevision:d.learners[0].revision},'student'));
 const submission=f.db.prepare('SELECT * FROM assessment_submissions WHERE assessment_id=?').get(id);assert.equal(submission.is_late,1);assert(submission.deadline_used);
 d=await f.detail(id);ok(await f.change(id,'collection-save',{collectionRevision:d.assessment.collectionRevision,dueAt:new Date(Date.now()+42*86400000).toISOString(),closed:false}));
 assert.equal(f.db.prepare('SELECT is_late FROM assessment_submissions WHERE submission_id=?').get(submission.submission_id).is_late,1);
 d=await f.detail(id);ok(await f.change(id,'collection-save',{collectionRevision:d.assessment.collectionRevision,closed:true}));assert.equal((await f.detail(id,'student')).assessment.canUpload,false);
 const r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');ok(await f.uploadNative(id,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision,label:'manual'},'admin'));
 const file=f.db.prepare('SELECT * FROM assessment_files WHERE file_id=(SELECT file_id FROM assessment_submissions WHERE assessment_id=? ORDER BY submission_number DESC LIMIT 1)').get(id);assert.equal(file.owner_id,'account-0002');assert.equal(file.uploaded_by,f.actors.global);
 assert.equal(f.db.prepare('SELECT first_accessed_at FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(id,'account-0002').first_accessed_at,null);
}));
test('Ready is manual: all expected checked today or next day, with an unchecked Admin warning',()=>use(async f=>{
 const current=await f.create();await f.publish(current);assert.equal((await f.change(current,'ready-assessment')).body.code,'ASSESSMENT_NOT_READY');
 const past=await f.create({examDate:nextDate(today(),-1)});await f.publish(past);ok(await f.change(past,'ready-assessment'));assert((await f.detail(past)).assessment.readyForAssessmentAt);
 const emptyRelease=await f.change(past,'release',{category:'marks',selection:'CLASS'});assert.equal(emptyRelease.status,409);
 const r=(await f.detail(current)).learners[0];ok(await f.uploadNative(current,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision}));
 f.db.prepare('UPDATE assessments SET exam_date=? WHERE assessment_id=?').run(nextDate(today(),-1),current);
 assert.equal((await f.change(current,'ready-assessment')).body.code,'UNCHECKED_SUBMISSIONS_WARNING');ok(await f.change(current,'ready-assessment',{confirmUnchecked:true}));
}));
test('Admin can finalise direct marking and explicitly release; a replacement preserves released work until a manual decision',()=>use(async f=>{
 const id=await f.create({examDate:nextDate(today(),-1)});await f.publish(id);let r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 ok(await f.uploadNative(id,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 ok(await f.change(id,'mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:0,feedback:'Manually reviewed'}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 assert.equal(r.marksReleased,false);ok(await f.change(id,'finalise',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId}));
 ok(await f.change(id,'release',{category:'marks',selection:'SELECTED',accountIds:[r.accountId]}));ok(await f.change(id,'release',{category:'feedback',selection:'SELECTED',accountIds:[r.accountId]}));
 const released=f.db.prepare('SELECT released_mark_id,released_feedback_id FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(id,r.accountId);r=(await f.detail(id)).learners.find(r=>r.accountId===r.accountId);
 ok(await f.uploadNative(id,'ANSWER',{accountId:'account-0002',recipientRevision:f.db.prepare('SELECT revision FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(id,'account-0002').revision,label:'replacement'}));
 const current=f.db.prepare('SELECT released_mark_id,released_feedback_id,latest_mark_id FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(id,'account-0002');assert.equal(current.released_mark_id,released.released_mark_id);assert.equal(current.released_feedback_id,released.released_feedback_id);assert.equal(current.latest_mark_id,null);
 const learner=await f.detail(id,'student');assert.equal(learner.learners[0].marksReleased,true);assert.equal(learner.learners[0].feedback,'Manually reviewed');assert(!Object.hasOwn(learner.learners[0],'mark'));
 ok(await f.change(id,'withdraw-release',{category:'marks',selection:'SELECTED',accountIds:['account-0002']}));assert.equal((await f.detail(id,'student')).learners[0].marksReleased,false);
}));
test('a timed paper starts one immutable attempt on actual learner access and accepts late exam-day work',()=>use(async f=>{
 const id=await f.create();await f.publish(id);const paper=await f.releasePaper(id);
 f.db.prepare('UPDATE assessment_recipients SET first_accessed_at=? WHERE assessment_id=? AND account_id=?').run(new Date(Date.now()-120*60000).toISOString(),id,'account-0002');
 ok(await f.request('download',{fileId:paper.fileId,...operation()},'student'));const attempt=f.db.prepare('SELECT * FROM assessment_attempts WHERE assessment_id=?').get(id);assert(attempt.deadline_at<new Date().toISOString());
 ok(await f.request('download',{fileId:paper.fileId,...operation()},'student'));assert.deepEqual(f.db.prepare('SELECT * FROM assessment_attempts WHERE assessment_id=?').get(id),attempt);
 const d=await f.detail(id,'student');assert.equal(d.assessment.attemptDeadline,attempt.deadline_at);assert.equal(d.assessment.canUpload,true);ok(await f.uploadNative(id,'ANSWER',{recipientRevision:d.learners[0].revision},'student'));assert.equal(f.db.prepare('SELECT is_late FROM assessment_submissions WHERE assessment_id=?').get(id).is_late,1);
 assert.throws(()=>f.db.exec('UPDATE assessment_attempts SET duration_minutes=999'),/immutable/);
}));
test('paper approval and marked PDF reuse bind the exact file and current answer',()=>use(async f=>{
 const id=await f.create();await f.publish(id);const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));
 assert.equal((await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:'0'.repeat(64)}})).body.code,'PAPER_REVIEW_REQUIRED');
 let r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');ok(await f.uploadNative(id,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 const script=ok(await f.uploadNative(id,'SCRIPT',{accountId:r.accountId,submissionId:r.submissionId}));ok(await f.uploadNative(id,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision,label:'replacement'}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 assert.equal((await f.change(id,'mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,scriptFileId:script.fileId,mark:80,feedback:''})).body.code,'SCRIPT_SOURCE_CHANGED');
 assert.equal((await f.change(id,'finalise',{accountId:r.accountId,recipientRevision:r.revision},'teacher')).status,403);
}));
test('achieved-only reports bind the reviewed PDF, definition and explicitly released result',()=>use(async f=>{
 const id=await f.create();await f.publish(id);let r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');ok(await f.uploadNative(id,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');
 ok(await f.change(id,'mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:0,feedback:''}));r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');ok(await f.change(id,'finalise',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId}));ok(await f.change(id,'release',{category:'marks',selection:'SELECTED',accountIds:[r.accountId]}));
 const data=ok(await f.request('report-data',{activityKey:scopes.programA,classId:'class-1',assessmentIds:[id]})),learner=data.learners.find(l=>l.id==='account-0002');assert.equal(learner.results[0].mark,0);assert(!Object.hasOwn(learner.results[0],'maximumMark'));assert(learner.results[0].definitionHash);
 const file=ok(await f.uploadNative(id,'REPORT',{accountId:learner.id})),source=learner.results.map(({assessmentId,markId,definitionHash})=>({assessmentId,markId,definitionHash})),layout={fields:[{key:'learner',x:0,y:0,width:1,height:.1,fontSize:12},{key:'results',x:0,y:.1,width:1,height:.7,fontSize:12},{key:'total',x:0,y:.8,width:1,height:.1,fontSize:12}]};
 const body={activityKey:scopes.programA,classId:'class-1',accountId:learner.id,fileId:file.fileId,source};assert.equal((await f.request('report-save',{...operation(),...body})).body.code,'REPORT_REVIEW_REQUIRED');
 ok(await f.request('report-save',{...operation(),...body,review:{sha256:file.sha256,layout}}));assert.equal(ok(await f.request('report-list',{assessmentId:id},'student')).reports.length,1);ok(await f.request('download',{fileId:file.fileId,...operation()},'student'));
 ok(await f.change(id,'withdraw-release',{category:'marks',selection:'SELECTED',accountIds:[learner.id]}));assert.equal(ok(await f.request('report-list',{assessmentId:id},'student')).reports.length,0);assert.equal((await f.request('download',{fileId:file.fileId,...operation()},'student')).status,409);
}));

test('multi-class native assignments retain untimed future due dates and remain private until explicit release',()=>use(async f=>{
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'multi-native','Second native class',1)").run(scopes.programA);
 const input={...operation(),activityKey:scopes.programA,classId:'class-1',classes:[{activityKey:scopes.programA,classId:'class-1'},{activityKey:scopes.programA,classId:'multi-native'}],title:'Shared assignment',subject:'Qasas',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',availableFrom:today()+'T09:00',dueDate:nextDate(today()),maximumMark:100};
 const result=ok(await f.request('create',input));assert.equal(result.assessmentIds.length,2);assert.deepEqual(ok(await f.request('create',input)).assessmentIds,result.assessmentIds);
 for(const id of result.assessmentIds){const row=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);assert.equal(row.timing_mode,'UNTIMED');assert.equal(row.duration_minutes,null);assert(row.due_at);assert.equal(row.schedule_published,0);assert.equal(row.paper_released_at,null);}
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients').get().n,0);
 const learn=await f.request('list',{},'admin','ADMIN_LEARN');assert.equal(learn.status,200);assert(!learn.body.assessments.some(a=>result.assessmentIds.includes(a.id)));
}));
