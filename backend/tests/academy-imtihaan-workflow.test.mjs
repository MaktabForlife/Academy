import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeImtihaan,ok,operation} from './fixtures/native-imtihaan-fixture.mjs';
import {separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';

async function setup(f){f.db.prepare('INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,?,?,?,1)').run(scopes.programA,'workflow-second-student','class-1','sep-student-a');const registerId=ok(await f.request('register-create',{...operation(),name:'Workflow Imtihaan',activityKeys:[scopes.programA],classMode:'ALL',status:'REGISTERED'})).registerId,id=await f.create({registerId});await f.publish(id);return {registerId,id};}
async function mark(f,id,value=0){const list=ok(await f.request('marks-list',{assessmentId:id},'teacher')),c=list.classes[0],r=c.students.find(r=>r.accountId==='account-0002')||c.students[0];ok(await f.request('marks-save',{...operation(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:value}]},'teacher'));return r;}
const validate=(f,registerId)=>f.request('register-marking-validate',{registerId}).then(ok);
async function override(f,registerId){const v=await validate(f,registerId);if(v.missing||v.unconfirmed)ok(await f.request('register-marking-override',{...operation(),registerId,fingerprint:v.fingerprint,confirm:true,reason:'The remaining learners will be handled individually.'}));return validate(f,registerId);}
const layout={fields:[{key:'learner',x:.1,y:.1,width:.8,height:.1,fontSize:14},{key:'results',x:.1,y:.3,width:.8,height:.4,fontSize:12},{key:'total',x:.1,y:.8,width:.8,height:.1,fontSize:14}]};
async function generate(f,registerId){const plan=ok(await f.request('register-reports-plan',{registerId})),reports=[],designs=[];for(const c of plan.classes){designs.push({activityKey:c.activityKey,classId:c.classId,layout});for(const person of c.learners){const file=ok(await f.uploadNative(c.assessments[0],'REPORT',{accountId:person.id,label:'Reviewed learner '+person.id}));reports.push({activityKey:c.activityKey,classId:c.classId,accountId:person.id,fileId:file.fileId,sha256:file.sha256});}}const body={...operation(),registerId,fingerprint:plan.fingerprint,reviewed:true,reports,designs};return {body,result:await f.request('register-reports-generate',body),reports};}

test('Teachers enter marks before moderation; changing a mark invalidates its moderation and proof',()=>nativeImtihaan(async f=>{
 const {registerId,id}=await setup(f);await mark(f,id,0);
 let summary=await validate(f,registerId);assert.equal(summary.entered,1);assert.equal(summary.valid,false);assert.deepEqual(summary.unmoderated,['Native assessment']);
 assert.equal((await f.request('register-marking-override',{...operation(),registerId,fingerprint:summary.fingerprint,confirm:true,reason:'Cannot bypass moderation'})).body.code,'MARKING_NOT_READY');
 await f.allowMarks(id);summary=await validate(f,registerId);assert.deepEqual(summary.unmoderated,[]);const prior=summary.fingerprint;
 await mark(f,id,45);summary=await validate(f,registerId);assert.notEqual(summary.fingerprint,prior);assert(summary.unmoderated.length);
}));

test('Only Global admin may override missing marks and receipts, with a reason, proof and audit',()=>nativeImtihaan(async f=>{
 const {registerId,id}=await setup(f);await mark(f,id,62);await f.allowMarks(id);
 let summary=await validate(f,registerId);assert(summary.missing>0);
 const body={...operation(),registerId,fingerprint:summary.fingerprint,confirm:true,reason:'Keep missing marks pending'};
 assert.equal((await f.request('register-marking-override',body,'programAdmin')).body.code,'GLOBAL_ADMIN_REQUIRED');
 assert.equal((await f.request('register-marking-override',{...body,operationId:crypto.randomUUID(),reason:''})).status,400);
 assert.equal((await f.request('register-marking-override',{...body,operationId:crypto.randomUUID(),fingerprint:'stale'})).body.code,'ROW_CHANGED');
 ok(await f.request('register-marking-override',body));assert.equal(ok(await f.request('register-marking-override',body)).replayed,true);
 summary=await validate(f,registerId);assert.equal(summary.valid,true);assert.match(summary.override.reason,/pending/);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='register-marking-override'").get().n,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_recipients WHERE latest_mark_id IS NOT NULL').get().n,1);
}));

test('Reports are generated before marks release, stay private, then release with marks or afterwards',()=>nativeImtihaan(async f=>{
 const {registerId,id}=await setup(f);await mark(f,id,0);await f.allowMarks(id);await override(f,registerId);
 let summary=await validate(f,registerId);assert.equal((await f.request('register-marks-release',{...operation(),...summary,confirm:true})).body.code,'REPORTS_REQUIRED');
 const made=await generate(f,registerId);ok(made.result);assert.equal(ok(await f.request('register-reports-generate',made.body)).replayed,true);
 summary=await validate(f,registerId);assert.equal(summary.reportsReady,true);assert.equal(summary.reportsReleased,false);
 assert.equal(ok(await f.request('report-list',{assessmentId:id},'student')).reports.length,0);
 const learnerFile=made.reports.find(r=>r.accountId==='account-0002');assert(learnerFile);assert.equal((await f.request('download',{fileId:learnerFile.fileId,...operation()},'student')).body.code,'REPORT_NOT_RELEASED');
 ok(await f.request('register-marks-release',{...operation(),...summary,confirm:true,releaseReports:false}));
 const list=ok(await f.request('list',{view:'learner'},'student'));assert.equal(list.assessments.find(a=>a.id===id).releasedMark,0);
 assert.equal(ok(await f.request('report-list',{assessmentId:id},'student')).reports.length,0);
 summary=await validate(f,registerId);assert.equal(summary.reportsReady,true);assert.equal(summary.marksReleased,true);
 ok(await f.request('register-reports-release',{...operation(),registerId,fingerprint:summary.fingerprint,confirm:true}));
 assert.equal(ok(await f.request('report-list',{assessmentId:id},'student')).reports.length,1);
 assert.equal((await f.request('download',{fileId:learnerFile.fileId,...operation()},'student')).status,200);
 await mark(f,id,55);summary=await validate(f,registerId);assert.equal(summary.reportsReady,false);assert.equal(summary.override,null);assert(summary.unmoderated.length);
}));

test('A staged report batch rejects missing learners, changed sources and incorrect PDF evidence atomically',()=>nativeImtihaan(async f=>{
 const {registerId,id}=await setup(f);await mark(f,id,80);await f.allowMarks(id);await override(f,registerId);
 const made=await generate(f,registerId);ok(made.result);const count=f.db.prepare('SELECT count(*) n FROM assessment_reports').get().n;
 const wrong={...made.body,operationId:crypto.randomUUID(),reports:made.body.reports.map((r,i)=>i? r:{...r,sha256:'0'.repeat(64)})};assert.equal((await f.request('register-reports-generate',wrong)).body.code,'REPORT_REVIEW_REQUIRED');assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_reports').get().n,count);
 const partial={...made.body,operationId:crypto.randomUUID(),reports:made.body.reports.slice(0,1)};assert.equal((await f.request('register-reports-generate',partial)).body.code,'REPORTS_INCOMPLETE');
 await mark(f,id,81);assert.equal((await f.request('register-reports-generate',{...made.body,operationId:crypto.randomUUID()})).body.code,'MARKING_NOT_READY');
}));

test('Admin can replace an accessed released paper, with a fresh impact confirmation, while keeping submissions',()=>nativeImtihaan(async f=>{
 const {id}=await setup(f),old=await f.releasePaper(id);ok(await f.request('download',{...operation(),fileId:old.fileId,assessmentId:id},'student'));
 const d=await f.detail(id,'student');const answer=ok(await f.uploadNative(id,'ANSWER',{recipientRevision:d.learners[0].revision},'student'));
 const impact=ok(await f.request('paper-replacement-preview',{assessmentId:id}));assert(impact.accessed);assert(impact.submitted);
 assert.equal((await f.uploadNative(id,'PAPER',{label:'No confirmation'},'programAdmin')).body.code,'PAPER_REPLACEMENT_CONFIRMATION');
 const replacement=ok(await f.uploadNative(id,'PAPER',{label:'New version',confirmReplacement:true,replacementFingerprint:impact.fingerprint,replacementNotice:'The paper was updated; your submission is retained.'},'programAdmin'));
 assert.notEqual(replacement.fileId,old.fileId);const current=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);assert.equal(current.paper_state,'IN_REVIEW');assert.equal(current.paper_released_at,null);
 assert.equal(f.db.prepare('SELECT latest_submission_id FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(id,'account-0002').latest_submission_id,answer.submissionId);
 assert(f.db.prepare('SELECT file_id FROM assessment_files WHERE file_id=?').get(old.fileId));
 assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='paper-replacement'").get().n,1);
}));

test('Personal Teach and Admin-Teach cannot use register workflow or override authority',()=>nativeImtihaan(async f=>{
 const {registerId}=await setup(f);for(const workspace of ['TEACH','ADMIN_TEACH'])assert.equal((await f.request('register-marking-validate',{registerId},'admin',workspace)).body.code,'ADMIN_WORKSPACE_REQUIRED');
}));

test('Only the examiner and scoped Admins can open papers, attach PDFs, inspect submissions and enter marks',()=>nativeImtihaan(async f=>{
 const {id}=await setup(f);
 f.db.prepare("INSERT OR IGNORE INTO class_teacher_assignments VALUES(?,'class-1',?,'ADDITIONAL')").run(scopes.programA,f.actors.teacherA);
 let other=ok(await f.request('list',{activityKey:scopes.programA},'examiner')).assessments.find(a=>a.id===id);
 assert(other.canTeach);for(const key of ['canOpenPaper','canReplacePaper','canEnterMarks','canViewSubmissions'])assert.equal(other[key],false,key);
 assert.equal(other.paperFileId,null);const details=await f.detail(id,'examiner');assert.equal(details.assessment.title,'Native assessment');assert.deepEqual(details.learners,[]);assert.deepEqual(details.history,[]);assert.equal(details.assessment.canSubmitPaper,false);
 assert.equal((await f.uploadNative(id,'PAPER',{},'examiner')).status,403);
 assert.equal((await f.change(id,'paper-details',{durationMinutes:45,maximumMark:80},'teacher')).status,403);
 assert.equal((await f.uploadNative(id,'PAPER',{durationMinutes:45},'teacher')).status,403);
 const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));
 assert.equal((await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'examiner')).status,403);
 assert.equal((await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'teacher')).status,200);
 ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:paper.sha256}}));await f.accept();ok(await f.request('release-papers',{...operation(),papers:[{id,revision:(await f.detail(id)).assessment.revision}]}));
 ok(await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'student'));
 const own=(await f.detail(id,'student')).learners[0],answer=ok(await f.uploadNative(id,'ANSWER',{recipientRevision:own.revision},'student'));
 for(const action of ['marks-list','progress-list'])assert.equal((await f.request(action,{assessmentId:id},'examiner')).status,403,action);
 assert.equal((await f.request('marks-save',{...operation(),assessmentId:id,groupRevisions:[],entries:[{assessmentId:id,accountId:'account-0002',mark:55}]},'examiner')).status,403);
 assert.equal((await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'examiner')).status,403,'Publication does not grant other teachers PDF access');
 assert.equal((await f.request('download',{...operation(),fileId:answer.fileId,assessmentId:id},'examiner')).status,403);
 assert.equal((await f.change(id,'confirm-submission',{accountId:'account-0002',submissionId:answer.submissionId,recipientRevision:(await f.detail(id,'student')).learners[0].revision},'examiner')).status,403);
 for(const who of ['teacher','admin','programAdmin']){assert.equal((await f.request('download',{...operation(),fileId:answer.fileId,assessmentId:id},who)).status,200,who);assert.equal((await f.request('marks-list',{assessmentId:id},who)).status,200,who);}
 assert.equal((await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'admin','TEACH')).status,403,'Personal Teach does not inherit Admin workspace authority');
 assert.equal((await f.request('marks-list',{assessmentId:id},'programAdmin','ADMIN_TEACH')).status,200);
}));

test('Global receipt override retains the unchecked submission and invalidates when its receipt changes',()=>nativeImtihaan(async f=>{
 const {id,registerId}=await setup(f),paper=await f.releasePaper(id);ok(await f.request('download',{...operation(),fileId:paper.fileId,assessmentId:id},'student'));
 const own=(await f.detail(id,'student')).learners[0],answer=ok(await f.uploadNative(id,'ANSWER',{recipientRevision:own.revision},'student'));await mark(f,id,70);await f.allowMarks(id);
 let v=await validate(f,registerId);assert.equal(v.unconfirmed,1);await override(f,registerId);v=await validate(f,registerId);assert(v.valid);assert(v.override);assert.equal((await f.detail(id)).learners.find(r=>r.accountId==='account-0002').submissionConfirmedAt,null);
 ok(await f.request('download',{...operation(),fileId:answer.fileId,assessmentId:id},'teacher'));const r=(await f.detail(id)).learners.find(r=>r.accountId==='account-0002');ok(await f.change(id,'confirm-submission',{accountId:r.accountId,submissionId:r.submissionId,recipientRevision:r.revision},'teacher'));
 v=await validate(f,registerId);assert.equal(v.unconfirmed,0);assert.equal(v.override,null);
}));
