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
  const tokens={admin:await f.actor('global'),programAdmin:await f.actor('adminA'),teacher:await f.login('0003'),examiner:await f.actor('teacherA'),student:await f.login('0002')};
  f.request=async(action,input={},who='admin',workspace=['admin','programAdmin'].includes(who)?'ADMIN':['teacher','examiner'].includes(who)?'TEACH':'LEARN',bytes)=>{
   const path=action.startsWith('/')?action:'/api/academy/assessments/'+action,headers={Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})};
   const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:bytes||JSON.stringify(input)}),f.env);
   return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
  };
  f.accept=async()=>{const input={scopes:[scopes.programA]},review=ok(await f.request('/api/admin/platform/setup/review',input)),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...input,digest:review.digest}));ok(await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest}));};
  f.create=async(input={})=>ok(await f.request('create',{...operation(),activityKey:scopes.programA,classId:'class-1',title:'Native assessment',subject:'Qasas',examDate:today(),durationMinutes:60,maximumMark:100,...input})).assessmentId;
  f.detail=async(id,who='admin')=>ok(await f.request('get',{assessmentId:id},who));
  f.change=async(id,action,input={},who='admin')=>{const d=await f.detail(id);return f.request(action,{...operation(),assessmentId:id,revision:d.assessment.revision,...(d.group?.canManage?{groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision})),groupCollections:d.group.members.map(m=>({id:m.id,revision:m.collectionRevision}))}:{}),...input},who);};
  f.uploadNative=async(id,kind,input={},who='admin')=>{
   const detail=await f.detail(id),bytes=Buffer.from('%PDF-1.4\n% native '+(input.label||'fixture')+'\n%%EOF'),metadata={...operation(),kind,assessmentId:id,mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),filename:'answer.pdf',revision:detail.assessment.revision,...(kind==='PAPER'&&detail.group?{groupRevisions:detail.group.members.map(m=>({id:m.id,revision:m.revision}))}:{}),...input};
   return f.request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,['admin','programAdmin'].includes(who)?'ADMIN':['teacher','examiner'].includes(who)?'TEACH':'LEARN',bytes);
  };
  f.allowMarks=async id=>{const d=await f.detail(id),registerId=d.assessment.registerId;return ok(await f.request('table-save',{...operation(),registerId,revision:f.db.prepare('SELECT revision FROM assessment_registers WHERE register_id=?').get(registerId).revision,rows:[{assessmentId:id,revision:d.assessment.revision,...(d.group?{groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision}))}:{}),changes:{marksModerated:true}}]}));};
  f.publish=async id=>{ok(await f.change(id,'publish'));await f.accept();};
  f.releasePaper=async id=>{const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:f.db.prepare('SELECT sha256 FROM assessment_file_integrity WHERE file_id=?').get(paper.fileId).sha256}}));await f.accept();ok(await f.request('release-papers',{...operation(),papers:(await f.detail(id)).group?.members.map(m=>({id:m.id,revision:m.revision}))||[{id,revision:(await f.detail(id)).assessment.revision}]}));return paper;};
  await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
}
test('untimed six-week assignments store a real null duration and retain a separate future due date',()=>use(async f=>{
 const id=await f.create({assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-60000).toISOString(),dueDate:nextDate(today(),42)}),row=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
 assert.equal(row.duration_minutes,null);assert.equal(row.allowance_minutes,null);assert.equal(row.exam_date,null);assert.equal(row.timing_mode,'UNTIMED');assert(row.due_at>row.available_from);
 await f.publish(id);await f.releasePaper(id);const learner=await f.detail(id,'student');assert.equal(learner.assessment.canUpload,true);assert(!Object.hasOwn(learner.assessment,'durationMinutes'));assert(!Object.hasOwn(learner.assessment,'maximumMark'));assert(!Object.hasOwn(learner.assessment,'allowanceMinutes'));
}));
test('Global Admin can approve their exact uploaded PDF for every shared class without releasing it',()=>use(async f=>{
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'global-paper','Second assessment class',1)").run(scopes.programA);
 const id=await f.create({classes:[{activityKey:scopes.programA,classId:'class-1'},{activityKey:scopes.programA,classId:'global-paper'}]}),file=ok(await f.uploadNative(id,'PAPER'));
 const detail=await f.detail(id);assert.equal(detail.assessment.isExaminer,true);assert.equal(detail.assessment.canModeratePaper,true);assert.equal(detail.assessment.canModerate,false);
 const list=ok(await f.request('list',{view:'admin'}));assert(list.assessments.every(a=>a.canModeratePaper&&!a.canModerate));
 assert.equal((await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:file.fileId,sha256:'0'.repeat(64)}})).body.code,'PAPER_REVIEW_REQUIRED');
 ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:file.fileId,sha256:file.sha256}}));
 const rows=f.db.prepare('SELECT paper_state,paper_released_at,examiner_id FROM assessments').all();assert(rows.every(a=>a.paper_state==='APPROVED'&&!a.paper_released_at&&a.examiner_id===f.actors.global));
 assert.equal(f.db.prepare('SELECT reviewed_by FROM assessment_paper_review').get().reviewed_by,f.actors.global);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients').get().n,0);
}));
test('Program Admin can upload and moderate their paper only within their own scope',()=>use(async f=>{
 const id=await f.create(),file=ok(await f.uploadNative(id,'PAPER',{},'programAdmin')),detail=await f.detail(id,'programAdmin');
 assert.equal(detail.assessment.canModeratePaper,true);assert.equal(detail.assessment.isExaminer,true);assert.equal(detail.assessment.canModerate,false);
 ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:file.fileId,sha256:file.sha256}},'programAdmin'));
 assert.equal(f.db.prepare('SELECT paper_state FROM assessments WHERE assessment_id=?').get(id).paper_state,'APPROVED');
 const otherClass=f.db.prepare('SELECT activity_key,class_id FROM classes WHERE activity_key=? AND active=1 LIMIT 1').get(scopes.programB),other=await f.create({activityKey:otherClass.activity_key,classId:otherClass.class_id});
 const outside=ok(await f.uploadNative(other,'PAPER'));
 assert.equal((await f.uploadNative(other,'PAPER',{},'programAdmin')).status,403);
 assert.equal((await f.change(other,'review-paper',{decision:'APPROVE',paperReview:{fileId:outside.fileId,sha256:outside.sha256}},'programAdmin')).status,403);
 assert.equal(f.db.prepare('SELECT paper_state FROM assessments WHERE assessment_id=?').get(other).paper_state,'IN_REVIEW');
}));
for(const [kind,mode,due] of [['EXAM','TIMED',true],['EXAM','UNTIMED',true],['ASSIGNMENT','TIMED',true],['ASSIGNMENT','UNTIMED',true],['ASSIGNMENT','UNTIMED',false]])test(`Imtihaan schedules release ${mode.toLowerCase()} ${kind.toLowerCase()}s${due?'':' without a due date'}`,()=>use(async f=>{
 const fields={name:'Reboot 2026',activityKeys:[scopes.programA],classMode:'ONE',classActivityKey:scopes.programA,classId:'class-1',status:'REGISTERED'};
 const registerId=ok(await f.request('register-create',{...operation(),...fields})).registerId;
 const id=await f.create({registerId,assessmentKind:kind,timingMode:mode,examDate:kind==='EXAM'?nextDate(today(),7):null,durationMinutes:mode==='TIMED'?60:null,...(kind==='ASSIGNMENT'?{availableFrom:new Date(Date.now()-86400000).toISOString(),...(due?{dueDate:nextDate(today(),42)}:{})}:{})});
 const before=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
 assert.equal(ok(await f.request('register-validate',{...fields,registerId,revision:1,status:'SCHEDULED'})).valid,true);
 assert.deepEqual(f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id),before,'Validate must remain read only');
 const save=kind==='ASSIGNMENT'&&mode==='UNTIMED'&&due,action=save?'register-save':'register-release',body={...operation(),registerId,revision:1,...(save?{...fields,status:'SCHEDULED'}:{})};
 ok(await f.request(action,body));assert.equal(ok(await f.request(action,body)).replayed,true);
 const list=ok(await f.request('list',{view:'admin'})),register=list.registers.find(r=>r.id===registerId),after=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
 assert.equal(register.status,'SCHEDULED');assert.equal(register.imtihaanStatus,'SCHEDULED');assert.equal(register.scheduleReleased,true);
 assert.equal(after.schedule_published,1);assert.equal(after.duration_minutes,before.duration_minutes);assert.equal(after.exam_date,before.exam_date);assert.equal(after.due_at,before.due_at);assert.equal(after.paper_released_at,null);
 assert(f.db.prepare('SELECT count(*) n FROM assessment_recipients WHERE assessment_id=?').get(id).n>0);
}));
test('invalid assignment schedules still block the whole Imtihaan release without changes',()=>use(async f=>{
 const fields={name:'Reboot 2026',activityKeys:[scopes.programA],classMode:'ONE',classActivityKey:scopes.programA,classId:'class-1',status:'REGISTERED'};
 const registerId=ok(await f.request('register-create',{...operation(),...fields})).registerId;
 const id=await f.create({registerId,assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:'2026-10-01T08:00:00Z',dueDate:'2026-12-05'});
 const original=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
 for(const invalid of [{subject:''},{available_from:'invalid'},{due_at:'invalid'},{due_at:'2026-09-01T08:00:00Z'},{maximum_mark:1000001}]){
  const row={...original,...invalid};f.db.prepare('UPDATE assessments SET subject=?,available_from=?,due_at=?,maximum_mark=? WHERE assessment_id=?').run(row.subject,row.available_from,row.due_at,row.maximum_mark,id);
  const before=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);
  assert.equal(ok(await f.request('register-validate',{...fields,registerId,revision:1,status:'SCHEDULED'})).valid,false,JSON.stringify(invalid));
  assert.equal((await f.request('register-release',{...operation(),registerId,revision:1})).body.code,'STATUS_NOT_READY');
  assert.deepEqual(f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id),before);
  assert.equal(f.db.prepare('SELECT status FROM assessment_registers WHERE register_id=?').get(registerId).status,'REGISTERED');assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients').get().n,0);
 }
}));
test('assignment status validation uses its opening time without requiring an exam date or learner access',()=>use(async f=>{
 const id=await f.create({assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-86400000).toISOString(),dueDate:nextDate(today(),42)});
 await f.publish(id);await f.releasePaper(id);
 const registerId=f.db.prepare('SELECT register_id FROM assessments WHERE assessment_id=?').get(id).register_id,register=f.db.prepare('SELECT * FROM assessment_registers WHERE register_id=?').get(registerId);
 const input={registerId,revision:register.revision,name:register.name,activityKeys:[scopes.programA],classMode:'ONE',classActivityKey:scopes.programA,classId:'class-1',status:'IN_PROGRESS'};
 assert.equal(ok(await f.request('register-validate',input)).valid,true);
 assert(f.db.prepare('SELECT first_accessed_at FROM assessment_recipients').all().every(r=>!r.first_accessed_at));
 f.db.prepare('UPDATE assessments SET available_from=? WHERE assessment_id=?').run(new Date(Date.now()+86400000).toISOString(),id);
 const future=ok(await f.request('register-validate',input));assert.equal(future.valid,false);assert(future.checks.some(c=>c.label==='An assessment has started'&&!c.ok));
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

async function shared(f,extra={}){
 f.db.prepare("INSERT OR IGNORE INTO class_teacher_assignments VALUES(?,'class-shared','account-0003','ADDITIONAL')").run(scopes.programA);
 const id=await f.create({classes:[{activityKey:scopes.programA,classId:'class-1'},{activityKey:scopes.programA,classId:'class-shared'}],...extra});
 await f.accept();return id;
}
test('shared list identity groups only the original selection and keeps separate matching papers distinct',()=>use(async f=>{
 const id=await shared(f),detail=await f.detail(id),ids=detail.group.members.map(m=>m.id),separate=await f.create({registerId:detail.assessment.registerId,title:'Native assessment'});
 const list=ok(await f.request('list',{view:'admin'})).assessments;
 for(const key of ids){const row=list.find(a=>a.id===key);assert.equal(row.sharedAssessmentId,id);assert.equal(row.sharedClassCount,2);}
 assert.equal(list.find(a=>a.id===separate).sharedAssessmentId,undefined);
 await f.accept();const teacher=ok(await f.request('list',{},'teacher')).assessments;assert(teacher.filter(a=>a.sharedAssessmentId).every(a=>a.sharedClassCount<=teacher.filter(r=>r.sharedAssessmentId===a.sharedAssessmentId).length),'Teacher grouping includes only authorised visible classes');
}));
test('shared assessment uploads once, reviews and releases for every class, with separate learner access and submissions',()=>use(async f=>{
 const id=await shared(f),d=await f.detail(id);assert.equal(d.group.members.length,2);const second=d.group.members.find(m=>m.id!==id).id;
 await f.publish(id);const paper=await f.releasePaper(id);
 assert.equal(f.objects.size,1);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_files WHERE kind='PAPER'").get().n,1);
 const rows=f.db.prepare('SELECT * FROM assessments').all();assert(rows.every(a=>a.paper_file_id===paper.fileId&&a.paper_state==='APPROVED'&&a.paper_released_at));
 assert.equal((await f.detail(id,'student')).assessment.id,id);assert(!Object.hasOwn(await f.detail(id,'student'),'group'));
 assert.equal((await f.request('get',{assessmentId:second},'student')).status,403);
 ok(await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'student'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_attempts').get().n,1);
 const token=await f.login('0008'),response=await worker.fetch(new Request('http://localhost/api/academy/assessments/download',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':'LEARN'},body:JSON.stringify({...operation(),fileId:paper.fileId,assessmentId:second})}),f.env);assert.equal(response.status,200);await response.arrayBuffer();
 const attempts=f.db.prepare('SELECT assessment_id,account_id FROM assessment_attempts ORDER BY account_id').all();assert.deepEqual(attempts.map(r=>({...r})),[{assessment_id:id,account_id:'account-0002'},{assessment_id:second,account_id:'account-0008'}]);
 let r=(await f.detail(id,'student')).learners[0];ok(await f.uploadNative(id,'ANSWER',{recipientRevision:r.revision},'student'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_submissions WHERE assessment_id=?').get(second).n,0);
 const blocked=await f.uploadNative(id,'PAPER',{},'teacher');assert.equal(blocked.status,409);
}));
test('shared controls cover details, schedule, readiness and explicit class releases while marks remain per learner',()=>use(async f=>{
 const id=await shared(f,{examDate:nextDate(today(),-1)});await f.publish(id);
 const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));ok(await f.change(id,'paper-details',{timingMode:'TIMED',durationMinutes:45,allowanceMinutes:10,maximumMark:90},'teacher'));
 assert(f.db.prepare('SELECT duration_minutes,maximum_mark FROM assessments').all().every(a=>a.duration_minutes===45&&a.maximum_mark===90));
 const second=(await f.detail(id)).group.members.find(m=>m.id!==id).id;
 ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:paper.sha256}}));await f.accept();
 const members=(await f.detail(id)).group.members;assert.equal((await f.request('release-papers',{...operation(),papers:[{id,revision:members.find(m=>m.id===id).revision}]})).body.code,'ASSESSMENT_GROUP_CHANGED');
 ok(await f.request('release-papers',{...operation(),papers:members.map(m=>({id:m.id,revision:m.revision}))}));
 for(const assessmentId of [id,second]){let r=(await f.detail(assessmentId)).learners[0];ok(await f.uploadNative(assessmentId,'ANSWER',{accountId:r.accountId,recipientRevision:r.revision}));}
 assert.equal((await f.change(id,'ready-assessment')).body.code,'UNCHECKED_SUBMISSIONS_WARNING');ok(await f.change(id,'ready-assessment',{confirmUnchecked:true}));assert(f.db.prepare('SELECT ready_for_assessment_at FROM assessments').all().every(a=>a.ready_for_assessment_at));
 for(const [assessmentId,mark] of [[id,71],[second,83]]){let r=(await f.detail(assessmentId)).learners[0];ok(await f.change(assessmentId,'mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark,feedback:'Own class marking'}));r=(await f.detail(assessmentId)).learners[0];ok(await f.change(assessmentId,'finalise',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId}));}
 assert(f.db.prepare('SELECT released_mark_id FROM assessment_recipients').all().every(r=>r.released_mark_id===null));
 ok(await f.change(id,'release',{category:'marks',selection:'CLASS'}));assert(f.db.prepare('SELECT released_mark_id FROM assessment_recipients').all().every(r=>r.released_mark_id));assert.deepEqual(f.db.prepare('SELECT mark FROM assessment_markings ORDER BY mark').all().map(r=>r.mark),[71,83]);
}));
test('shared paper retries are exact and any stale member or failed class rolls back the whole upload reference',()=>use(async f=>{
 const id=await shared(f),d=await f.detail(id),second=d.group.members.find(m=>m.id!==id).id,expected=d.group.members.map(m=>({id:m.id,revision:m.revision})),bytes=Buffer.from('%PDF-1.4\n% shared retry\n%%EOF'),metadata={...operation(),kind:'PAPER',assessmentId:id,revision:d.assessment.revision,groupRevisions:expected,filename:'once.pdf',mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const upload=()=>f.request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},'teacher','TEACH',bytes);
 f.db.exec(`CREATE TRIGGER fail_shared_paper BEFORE UPDATE OF paper_file_id ON assessments WHEN NEW.assessment_id='${second}' BEGIN SELECT RAISE(ABORT,'synthetic group failure'); END;`);
 assert.equal((await upload()).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_files').get().n,0);assert(f.db.prepare('SELECT paper_file_id FROM assessments').all().every(a=>!a.paper_file_id));
 f.db.exec('DROP TRIGGER fail_shared_paper');const saved=ok(await upload()),objectCount=f.objects.size;assert.equal(ok(await upload()).fileId,saved.fileId);assert.equal(ok(await upload()).replayed,true);assert.equal(f.objects.size,objectCount);
 assert.equal((await f.change(id,'paper-details',{groupRevisions:expected,durationMinutes:30,maximumMark:100},'teacher')).body.code,'ASSESSMENT_GROUP_CHANGED');
}));
test('legacy multiple-class creation receipts retain the exact selection and never group matching names',()=>use(async f=>{
 const id=await shared(f),ids=(await f.detail(id)).group.members.map(m=>m.id);for(const key of ids)f.db.prepare("UPDATE assessment_events SET details_json=? WHERE assessment_id=? AND action='CREATED'").run(JSON.stringify({title:'Native assessment'}),key);
 assert.equal((await f.detail(id)).group.members.length,2);
 const separate=await f.create({title:'Native assessment'});assert(!Object.hasOwn(await f.detail(separate),'group'));
 const list=ok(await f.request('list',{view:'admin'})).assessments;assert(ids.every(key=>list.find(a=>a.id===key).sharedAssessmentId===id));assert.equal(list.find(a=>a.id===separate).sharedAssessmentId,undefined);
 const original=ok(await f.uploadNative(id,'PAPER',{},'teacher'));assert(f.db.prepare('SELECT paper_file_id FROM assessments WHERE assessment_id IN (?,?)').all(...ids).every(a=>a.paper_file_id===original.fileId));assert.equal(f.db.prepare('SELECT paper_file_id FROM assessments WHERE assessment_id=?').get(separate).paper_file_id,null);
}));
test('Teacher cannot use one class endpoint to mutate a shared assessment beyond current assignments',()=>use(async f=>{
 const id=await shared(f);f.db.prepare("INSERT OR IGNORE INTO class_teacher_assignments VALUES(?,'class-1',?,'ADDITIONAL')").run(scopes.programA,f.actors.teacherA);
 const token=await f.actor('teacherA'),request=async(path,input,bytes)=>{const r=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'TEACH',...(!bytes?{'Content-Type':'application/json'}:{})},body:bytes||JSON.stringify(input)}),f.env);return {status:r.status,body:await r.json()};};
 const detail=ok(await request('/api/academy/assessments/get',{assessmentId:id}));assert.equal(detail.group.canManage,false);assert.equal(detail.group.members.length,0);assert.equal(detail.assessment.canSubmitPaper,false);
 const bytes=Buffer.from('%PDF-1.4\n% forbidden shared upload\n%%EOF'),d=await f.detail(id),metadata={...operation(),kind:'PAPER',assessmentId:id,revision:d.assessment.revision,groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision})),filename:'shared.pdf',mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 assert.equal((await request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},bytes)).status,403);assert(f.db.prepare('SELECT paper_file_id FROM assessments').all().every(a=>!a.paper_file_id));
}));

test('shared assignment collection settings and unpublished edits apply atomically to every class',()=>use(async f=>{
 const id=await shared(f,{assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-86400000).toISOString(),dueDate:nextDate(today(),7)});
 ok(await f.change(id,'save',{title:'Shared assignment revision',subject:'Qasas',subjectDescriptor:'',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,durationMinutes:null,availableFrom:new Date(Date.now()-86400000).toISOString(),dueDate:nextDate(today(),7),maximumMark:100}));
 assert(f.db.prepare('SELECT title FROM assessments').all().every(a=>a.title==='Shared assignment revision'));
 const due=new Date(Date.now()+42*86400000).toISOString();ok(await f.change(id,'collection-save',{dueAt:due,closed:true}));
 const saved=f.db.prepare('SELECT * FROM assessment_collection').all();assert.equal(saved.length,2);assert(saved.every(c=>c.effective_due_at===due&&c.closed_at));
 const stale=(await f.detail(id)).group.members.map(m=>({id:m.id,revision:m.collectionRevision-1}));assert.equal((await f.change(id,'collection-save',{groupCollections:stale,dueAt:due,closed:false})).status,409);assert(f.db.prepare('SELECT closed_at FROM assessment_collection').all().every(c=>c.closed_at));
 ok(await f.change(id,'collection-save',{dueAt:due,closed:false}));assert(f.db.prepare('SELECT closed_at FROM assessment_collection').all().every(c=>!c.closed_at));
}));
test('scoped publication includes only the required shared parent and preserves unrelated private registers',()=>use(async f=>{
 const id=await f.create({classes:[{activityKey:scopes.programA,classId:'class-1'},{activityKey:scopes.programA,classId:'class-shared'}]}),own=f.db.prepare('SELECT register_id FROM assessments WHERE assessment_id=?').get(id).register_id;
 const unrelated=ok(await f.request('register-create',{...operation(),name:'Unrelated private register',activityKeys:[scopes.programB],classMode:'ALL',status:'REGISTERED'})).registerId,token=await f.actor('adminA');
 const request=async(action,input)=>{const response=await worker.fetch(new Request('http://localhost/api/admin/platform/setup/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN','Content-Type':'application/json'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 const selection={scopes:[scopes.programA],families:['assessment']},review=ok(await request('review',selection)),frozen=ok(await request('freeze',{...selection,digest:review.digest}));ok(await request('publish',{batchId:frozen.batchId,digest:frozen.digest}));
 const rows=f.db.prepare("SELECT c.rows_json FROM setup_head_components v JOIN setup_components c USING(component_id) WHERE v.head_id=(SELECT head_id FROM setup_head_state WHERE singleton=1) AND c.table_name='assessment_registers' AND c.scope_key='GLOBAL'").all().flatMap(r=>JSON.parse(r.rows_json));assert(rows.some(r=>r.register_id===own));assert(!rows.some(r=>r.register_id===unrelated));assert(f.db.prepare('SELECT 1 FROM assessment_registers WHERE register_id=?').get(unrelated));assert.equal((await request('review',{scopes:[scopes.programB]})).status,403);
}));

test('deleting an unused shared assessment removes every selected class together and retains its audit',()=>use(async f=>{
 const id=await shared(f);ok(await f.change(id,'session-delete'));assert(f.db.prepare('SELECT deleted_at FROM assessments').all().every(a=>a.deleted_at));assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='session-delete'").get().n,2);assert.equal((await f.request('get',{assessmentId:id})).status,404);
}));

test('examiner choices are actual teachers; an Admin remains the separate uploader',()=>use(async f=>{
 const list=ok(await f.request('list',{view:'admin'}));assert(list.examiners.some(t=>t.id===f.actors.teacherA&&t.activity_key===scopes.programA));assert(!list.examiners.some(t=>t.id===f.actors.global||t.id===f.actors.studentA));
 const id=await f.create({examinerId:f.actors.teacherA}),file=ok(await f.uploadNative(id,'PAPER'));
 const a=(await f.detail(id)).assessment;assert.equal(a.examinerId,f.actors.teacherA);assert.equal(a.examinerName,'Synthetic teacherA');assert.equal(a.subjectDescriptor,'Synthetic teacherA');assert.equal(a.paperUploaderName,'Synthetic global');
 assert.equal(f.db.prepare('SELECT uploaded_by FROM assessment_files WHERE file_id=?').get(file.fileId).uploaded_by,f.actors.global);
 await f.publish(id);const examiner=await f.detail(id,'examiner');assert.equal(examiner.assessment.isExaminer,true);assert.equal(examiner.assessment.readOnly,false);assert.equal(examiner.assessment.canSubmitPaper,true);assert.equal(examiner.assessment.canAdmin,false);
 assert(ok(await f.request('list',{},'examiner')).assessments.some(a=>a.id===id));
 const unrelated=await f.create();assert([403,404].includes((await f.request('get',{assessmentId:unrelated},'examiner')).status));
 const changed=await f.change(id,'paper-details',{examinerId:'account-0003',durationMinutes:60,maximumMark:100},'examiner');assert.equal(changed.status,403);
 const invalid=await f.request('create',{...operation(),activityKey:scopes.programA,classId:'class-1',title:'Invalid examiner',subject:'Qasas',examDate:today(),durationMinutes:60,maximumMark:100,examinerId:f.actors.teacherB});assert.equal(invalid.status,403);assert.equal(invalid.body.code,'EXAMINER_OUTSIDE_PROGRAM');
 ok(await f.change(id,'paper-details',{examinerId:'account-0003',durationMinutes:60,maximumMark:100}));assert.equal((await f.detail(id)).assessment.examinerId,'account-0003');
 assert.equal((await f.request('get',{assessmentId:id},'examiner')).status,403,'Reassignment revokes narrow examiner access');
}));
test('closing and reopening exam submissions retains the fixed exam cutoff',()=>use(async f=>{
 const id=await f.create(),before=f.db.prepare('SELECT exam_cutoff FROM assessments WHERE assessment_id=?').get(id).exam_cutoff;
 ok(await f.change(id,'collection-save',{closed:true,collectionRevision:0}));assert.equal((await f.detail(id)).assessment.collectionClosed,true);
 assert.equal((await f.change(id,'collection-save',{closed:false,collectionRevision:0})).body.code,'ROW_CHANGED');
 ok(await f.change(id,'collection-save',{closed:false,collectionRevision:1}));assert.equal((await f.detail(id)).assessment.collectionClosed,false);
 assert.equal(f.db.prepare('SELECT exam_cutoff FROM assessments WHERE assessment_id=?').get(id).exam_cutoff,before);
 assert.equal((await f.change(id,'collection-save',{closed:true,collectionRevision:2},'teacher')).status,403);
}));

test('learner timetable returns only that learner’s explicitly released mark, including zero',()=>use(async f=>{
 const id=await f.create();await f.publish(id);const account='account-0002',file=ok(await f.uploadNative(id,'PAPER')),submission=crypto.randomUUID(),mark=crypto.randomUUID();
 f.db.prepare('INSERT INTO assessment_submissions(submission_id,assessment_id,account_id,file_id,submitted_at,submission_number) VALUES(?,?,?,?,?,1)').run(submission,id,account,file.fileId,new Date().toISOString());
 f.db.prepare("INSERT INTO assessment_markings(mark_id,assessment_id,account_id,submission_id,mark,feedback,state,examiner_id,created_at) VALUES(?,?,?,?,0,'','APPROVED',?,?)").run(mark,id,account,submission,'account-0003',new Date().toISOString());
 f.db.prepare('UPDATE assessment_recipients SET latest_submission_id=?,latest_mark_id=? WHERE assessment_id=? AND account_id=?').run(submission,mark,id,account);
 const before=ok(await f.request('list',{},'student')).assessments.find(a=>a.id===id);assert(!Object.hasOwn(before,'releasedMark'));assert(!Object.hasOwn(before,'releasedMaximumMark'));
 ok(await f.change(id,'release',{category:'marks',selection:'CLASS'}));const after=ok(await f.request('list',{},'student')).assessments.find(a=>a.id===id);assert.equal(after.releasedMark,0);assert.equal(after.releasedMaximumMark,100);
 const preview=ok(await f.request('list',{view:'learner'}));assert(preview.assessments.every(a=>!Object.hasOwn(a,'releasedMark')));
 ok(await f.change(id,'withdraw-release',{category:'marks',selection:'SELECTED',accountIds:[account]}));assert(!Object.hasOwn(ok(await f.request('list',{},'student')).assessments.find(a=>a.id===id),'releasedMark'));
}));

test('manual marks group students by class and name, save without submissions, and release only explicitly',()=>use(async f=>{
 const scope=scopes.programA;f.db.prepare("UPDATE classes SET name='Class B' WHERE activity_key=? AND class_id='class-1'").run(scope);
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'marks-a','Class A',1)").run(scope);f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,'marks-a','account-0003','ADDITIONAL')").run(scope);
 f.db.prepare("UPDATE accounts SET display_name='Zulu Student' WHERE account_id='account-0002'").run();f.db.prepare("UPDATE accounts SET display_name='amy Student' WHERE account_id=?").run(f.actors.studentA);
 for(const [classId,account] of [['class-1',f.actors.studentA],['marks-a','account-0002'],['marks-a',f.actors.studentA]])f.db.prepare('INSERT OR IGNORE INTO class_memberships VALUES(?,?,?,?,NULL,NULL,1)').run(scope,crypto.randomUUID(),classId,account);
 const id=await f.create({classes:[{activityKey:scope,classId:'class-1'},{activityKey:scope,classId:'marks-a'}]});await f.publish(id);await f.allowMarks(id);
 const list=ok(await f.request('marks-list',{assessmentId:id},'teacher'));assert.deepEqual(list.classes.map(c=>c.className),['Class A','Class B']);assert(list.classes.every(c=>c.students.findIndex(r=>r.name==='amy Student')<c.students.findIndex(r=>r.name==='Zulu Student')));
 const entries=list.classes.map((c,i)=>{const r=c.students.find(r=>r.accountId==='account-0002');return {assessmentId:c.assessmentId,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:i?92:0};}),input={...operation(),assessmentId:id,groupRevisions:list.classes.map(c=>({id:c.assessmentId,revision:c.revision})),entries};
 const saved=ok(await f.request('marks-save',input,'teacher'));assert.equal(saved.saved,2);assert.equal(ok(await f.request('marks-save',input,'teacher')).replayed,true);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_submissions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_files').get().n,0);
 assert(ok(await f.request('list',{},'student')).assessments.every(a=>!Object.hasOwn(a,'releasedMark')));
 ok(await f.change(id,'release',{category:'marks',selection:'CLASS'}));const released=ok(await f.request('list',{},'student')).assessments;assert.deepEqual(released.map(a=>a.releasedMark).sort((a,b)=>a-b),[0,92]);
 const report=ok(await f.request('report-data',{activityKey:scope,classId:'class-1',assessmentIds:[id]}));assert.equal(report.learners.find(r=>r.id==='account-0002').results[0].mark,92);
 const next=ok(await f.request('marks-list',{assessmentId:id})),c=next.classes.find(c=>c.assessmentId===id),r=c.students.find(r=>r.accountId==='account-0002');ok(await f.request('marks-save',{...operation(),assessmentId:id,groupRevisions:next.classes.map(c=>({id:c.assessmentId,revision:c.revision})),entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:80.5}]}));assert.equal(ok(await f.request('list',{},'student')).assessments.find(a=>a.id===id).releasedMark,92,'Corrections stay private until another release');
}));

test('manual marks reject learners, outside teachers, stale edits and invalid totals without partial changes',()=>use(async f=>{
 const id=await f.create();await f.publish(id);await f.allowMarks(id);const list=ok(await f.request('marks-list',{assessmentId:id})),c=list.classes[0],r=c.students[0],base={...operation(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:60}]};
 assert.equal((await f.request('marks-list',{assessmentId:id},'student')).status,403);assert.equal((await f.request('marks-save',base,'student')).status,403);assert.equal((await f.request('marks-list',{assessmentId:id},'examiner')).status,403);
 for(const mark of [-1,101,'70',null])assert.equal((await f.request('marks-save',{...base,...operation(),entries:[{...base.entries[0],mark}]})).status,400);
 assert.equal((await f.request('marks-save',{...base,...operation(),entries:[base.entries[0],{...base.entries[0],accountId:f.actors.studentB}]})).status,403);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,0);
 ok(await f.request('marks-save',base));assert.equal((await f.request('marks-save',{...base,...operation()})).body.code,'ROW_CHANGED');
 assert.equal((await f.change(id,'paper-details',{durationMinutes:45,maximumMark:50})).status,409);
}));

test('paper approvals save individually without publication, then one preparation publishes the whole approved set',()=>use(async f=>{
 const scope=scopes.programA,registerId=ok(await f.request('register-create',{...operation(),name:'One publication',activityKeys:[scope],classMode:'ONE',classActivityKey:scope,classId:'class-1',status:'REGISTERED'})).registerId;
 const ids=[await f.create({registerId,title:'Paper A'}),await f.create({registerId,title:'Paper B'})];for(const id of ids)await f.publish(id);
 const uploaded=[];for(const id of ids)uploaded.push(ok(await f.uploadNative(id,'PAPER')));
 const first=ok(await f.change(ids[0],'review-paper',{decision:'APPROVE',paperReview:{fileId:uploaded[0].fileId,sha256:uploaded[0].sha256}}));assert(!first.setupPublication);assert.equal(f.db.prepare('SELECT paper_released_at FROM assessments WHERE assessment_id=?').get(ids[0]).paper_released_at,null);
 assert.equal(ok(await f.request('prepare-papers',{...operation(),registerId,papers:[{id:ids[0],revision:(await f.detail(ids[0])).assessment.revision}]})).prepared,true,'An approved paper can be prepared while another awaits approval');
 const second=ok(await f.change(ids[1],'review-paper',{decision:'APPROVE',paperReview:{fileId:uploaded[1].fileId,sha256:uploaded[1].sha256}}));assert(!second.setupPublication);
 const body={...operation(),registerId,papers:await Promise.all(ids.map(async id=>({id,revision:(await f.detail(id)).assessment.revision})))},prepared=ok(await f.request('prepare-papers',body));assert(prepared.setupPublication);assert(f.db.prepare('SELECT paper_released_at FROM assessments').all().every(a=>!a.paper_released_at));
 assert.equal((await f.request('release-papers',{...operation(),preparedOperation:body.operationId,papers:prepared.papers})).body.code,'SETUP_REVIEW_REQUIRED');
 const selection={sourceOperation:prepared.setupPublication},review=ok(await f.request('/api/admin/platform/setup/review',selection)),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...selection,digest:review.digest}));ok(await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest}));
 const release={...operation(),preparedOperation:body.operationId,papers:prepared.papers};assert.equal(ok(await f.request('release-papers',release)).released,2);assert.equal(ok(await f.request('release-papers',release)).replayed,true);assert(f.db.prepare('SELECT paper_released_at FROM assessments').all().every(a=>a.paper_released_at));
}));

test('a Teacher sees and edits only their own classes in a shared marks popup',()=>use(async f=>{
 const scope=scopes.programA;f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'other-mark-class','Other class',1)").run(scope);f.db.prepare('INSERT INTO class_memberships VALUES(?,?,?,?,NULL,NULL,1)').run(scope,crypto.randomUUID(),'other-mark-class','account-0002');
 const id=await f.create({classes:[{activityKey:scope,classId:'class-1'},{activityKey:scope,classId:'other-mark-class'}]});await f.publish(id);await f.allowMarks(id);
 const teacher=ok(await f.request('marks-list',{assessmentId:id},'teacher'));assert.equal(teacher.classes.length,1);assert.equal(teacher.classes[0].classId,'class-1');const admin=ok(await f.request('marks-list',{assessmentId:id})),outside=admin.classes.find(c=>c.classId==='other-mark-class'),r=outside.students[0];
 assert.equal((await f.request('marks-save',{...operation(),assessmentId:id,groupRevisions:admin.classes.map(c=>({id:c.assessmentId,revision:c.revision})),entries:[{assessmentId:outside.assessmentId,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:50}]},'teacher')).status,403);
 assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,0);
}));

test('a failed manual marks batch rolls back every student and exact retry saves once',()=>use(async f=>{
 f.db.prepare('INSERT OR IGNORE INTO class_memberships VALUES(?,?,?,?,NULL,NULL,1)').run(scopes.programA,crypto.randomUUID(),'class-1',f.actors.studentA);const id=await f.create();await f.publish(id);await f.allowMarks(id);const list=ok(await f.request('marks-list',{assessmentId:id})),c=list.classes[0],entries=c.students.map(r=>({assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:55})),input={...operation(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries};assert(entries.length>=2);
 f.db.exec("CREATE TRIGGER fail_manual_batch BEFORE INSERT ON assessment_events WHEN NEW.action='manual-mark' AND NEW.account_id='account-0002' BEGIN SELECT RAISE(ABORT,'synthetic_manual_failure'); END");assert.equal((await f.request('marks-save',input)).status,503);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients WHERE latest_mark_id IS NOT NULL').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts WHERE operation_id=?').get(input.operationId).n,0);
 f.db.exec('DROP TRIGGER fail_manual_batch');assert.equal(ok(await f.request('marks-save',input)).saved,entries.length);assert.equal(ok(await f.request('marks-save',input)).replayed,true);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,entries.length);
}));

test('revoking a designated examiner during a marks save prevents the whole commit',()=>use(async f=>{
 const id=await f.create({examinerId:f.actors.teacherA});await f.publish(id);await f.allowMarks(id);const list=ok(await f.request('marks-list',{assessmentId:id},'examiner')),c=list.classes[0],r=c.students[0],input={...operation(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:66}]};
 const db=f.env.ACADEMY_DB,withSession=db.withSession.bind(db);let intercepted=false;db.withSession=(...args)=>{const session=withSession(...args);return {...session,prepare(sql){if(!intercepted&&sql.startsWith('INSERT INTO academy_write_guards')){intercepted=true;f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND role='TEACHER'").run(f.actors.teacherA);f.db.exec('UPDATE academy_write_state SET version=version+1 WHERE singleton=1');}return session.prepare(sql);},batch:session.batch.bind(session)};};
 const result=await f.request('marks-save',input,'examiner');assert(intercepted);assert([401,403,409].includes(result.status),JSON.stringify(result));assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='manual-mark'").get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients WHERE latest_mark_id IS NOT NULL').get().n,0);
}));
