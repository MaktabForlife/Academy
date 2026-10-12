import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessmentFixture,assessmentScope as scope,pdf} from './fixtures/academy-assessment-fixture.mjs';
import {paperAvailable} from '../src/academy/d1/assessment-store.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const op=()=>({operationId:crypto.randomUUID()});
test('scheduling resolves active Academy subjects and modules while retaining existing draft labels',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),key=f.db.prepare("SELECT subject_key FROM subject_catalog WHERE source_namespace='ACADEMY' AND name='Qasas'").get().subject_key;
 f.db.prepare("INSERT INTO academy_module_catalogue VALUES('ASSESSMENT-MODULE',?,'Qasas module','qasas module',1,1)").run(key);
 f.db.prepare("INSERT INTO academy_module_catalogue VALUES('ASSESSMENT-ARCHIVED',?,'Old module','old module',0,1)").run(key);
 const options=ok(await f.call('list',{view:'admin'},admin)).catalogue;
 assert.ok(options.some(c=>c.key==='SUBJECT:'+key&&c.label==='Qasas'));
 assert.ok(options.some(c=>c.key==='MODULE:ACADEMY:ASSESSMENT-MODULE'&&c.label==='Qasas · Qasas module'));
 assert.ok(!options.some(c=>c.key.includes('ARCHIVED')));
 assert.deepEqual(ok(await f.call('list',{},student)).catalogue,[]);
 const body={...op(),activityKey:scope,classId:'class-1',title:'Final assessment',examDate:'2026-10-12',durationMinutes:60,maximumMark:100};
 assert.equal((await f.call('create',{...body,catalogueKey:'MODULE:ACADEMY:ASSESSMENT-ARCHIVED'},admin)).status,400);
 assert.equal((await f.call('create',{...body,subject:'Invented subject'},admin)).status,400);
 const id=ok(await f.call('create',{...body,catalogueKey:'MODULE:ACADEMY:ASSESSMENT-MODULE',subject:'Ignored input'},admin)).assessmentId;
 assert.equal(ok(await f.call('get',{assessmentId:id},admin)).assessment.subject,'Qasas · Qasas module');
 f.db.prepare("UPDATE assessments SET subject='Existing imported label' WHERE assessment_id=?").run(id);
 ok(await f.call('save',{...body,...op(),assessmentId:id,revision:1,subject:'Existing imported label'},admin));
 assert.equal(ok(await f.call('get',{assessmentId:id},admin)).assessment.subject,'Existing imported label');
}));
test('the examiner can revise paper details before release with renewed moderation and stale-edit protection',()=>use(async f=>{
 const x=await setup(f);ok(await x.change('review-paper',{decision:'APPROVE'}));
 assert.equal((await x.change('paper-details',{durationMinutes:90,maximumMark:120},x.student)).status,403);
 assert.equal((await x.change('paper-details',{durationMinutes:90,maximumMark:120},x.admin)).status,403);
 assert.equal((await x.change('paper-details',{durationMinutes:0,maximumMark:120},x.teacher)).status,400);
 const revision=(await x.detail()).assessment.revision;
 ok(await x.change('paper-details',{durationMinutes:90,maximumMark:120},x.teacher));
 const a=(await x.detail()).assessment;assert.equal(a.durationMinutes,90);assert.equal(a.maximumMark,120);assert.equal(a.paperState,'IN_REVIEW');
 assert.equal((await f.call('paper-details',{...op(),assessmentId:x.id,revision,durationMinutes:30,maximumMark:50},x.teacher)).status,409);
 assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE assessment_id=? AND action='paper-details'").get(x.id).n,1);
 await available(f,x);
 assert.equal((await x.change('paper-details',{durationMinutes:30,maximumMark:50},x.teacher)).status,409);
}));
async function use(fn){const f=await assessmentFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
async function setup(f,{examDate='2026-01-01',examiner='0003'}={}){
 const admin=await f.login('0001'),teacher=await f.login(examiner),student=await f.login('0002'),other=await f.login('0008');
 const id=ok(await f.call('create',{...op(),activityKey:scope,classId:'class-1',title:'Final assessment',subject:'Qasas',examDate,durationMinutes:60,maximumMark:100},admin)).assessmentId;
 const detail=async(token=admin)=>ok(await f.call('get',{assessmentId:id},token));
 const change=async(action,input={},token=admin)=>f.call(action,{...op(),assessmentId:id,revision:(await detail()).assessment.revision,...input},token);
 ok(await change('publish'));const uploaded=ok(await f.upload({kind:'PAPER',assessmentId:id,revision:(await detail()).assessment.revision},teacher));
 return {id,admin,teacher,student,other,detail,change,paperId:uploaded.fileId};
}
async function available(f,x){ok(await x.change('review-paper',{decision:'APPROVE'}));const a=(await x.detail()).assessment;ok(await f.call('release-papers',{...op(),papers:[{id:x.id,revision:a.revision}]},x.admin));}
async function submit(f,x){const d=await x.detail(x.student);return ok(await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:d.learners[0].revision},x.student));}
test('schedule, examiner ownership and private PDF moderation enforce scoped authority and exact retries',()=>use(async f=>{
 const x=await setup(f);assert.equal((await x.detail()).assessment.paperState,'IN_REVIEW');
 assert.equal((await f.call('list',{activityKey:scope},x.other)).body.assessments.length,0);
 assert.equal((await f.call('get',{assessmentId:x.id},x.other)).status,403);
 assert.equal((await x.change('review-paper',{decision:'APPROVE'},x.teacher)).status,403);
 assert.equal((await f.download(x.paperId,x.student)).status,403);
 ok(await x.change('review-paper',{decision:'RETURN',comment:'Please revise question 2.'}));
 assert.equal((await x.detail(x.teacher)).assessment.paperComment,'Please revise question 2.');
 const revision=(await x.detail()).assessment.revision,operationId=crypto.randomUUID();
 const uploaded=ok(await f.upload({operationId,kind:'PAPER',assessmentId:x.id,revision},x.teacher));
 assert.equal(ok(await f.upload({operationId,kind:'PAPER',assessmentId:x.id,revision},x.teacher)).replayed,true);
 assert.equal(f.objects.size,2);assert.equal((await x.detail()).assessment.paperFileId,uploaded.fileId);
 assert.equal((await x.change('review-paper',{decision:'RETURN'})).status,400);
 await available(f,x);assert.equal((await f.download(uploaded.fileId,x.student)).status,200);
 assert.equal((await f.download(x.paperId,x.student)).status,403,'Old paper versions stay private');
 const d=await x.detail(x.student);assert.ok(d.learners[0].firstAccessedAt);
 await f.download(uploaded.fileId,x.student);assert.equal((await x.detail(x.student)).learners[0].firstAccessedAt,d.learners[0].firstAccessedAt);
 assert.equal((await f.call('create',{...op(),activityKey:scope,classId:'class-1',title:'Bad',subject:'Bad',examDate:'2026-02-30',durationMinutes:60,maximumMark:100},x.admin)).status,400);
}));
test('an administrator who submits a paper becomes examiner and cannot moderate paper or marks',()=>use(async f=>{
 const x=await setup(f,{examiner:'0001'}),moderator=await f.login('0004');
 assert.equal((await x.change('review-paper',{decision:'APPROVE'})).body.code,'SELF_MODERATION');
 ok(await x.change('review-paper',{decision:'APPROVE'},moderator));
 const a=(await x.detail()).assessment;ok(await f.call('release-papers',{...op(),papers:[{id:x.id,revision:a.revision}]},x.admin));await submit(f,x);
 let r=(await x.detail()).learners[0];ok(await x.change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:75,feedback:'Well done.'},x.admin));
 r=(await x.detail()).learners[0];assert.equal((await x.change('review-mark',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,decision:'APPROVE'})).body.code,'SELF_MODERATION');
 ok(await x.change('review-mark',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,decision:'APPROVE'},moderator));
}));
test('03:00 Johannesburg gate and expected duration never block later submissions',()=>use(async f=>{
 const x=await setup(f,{examDate:'2999-01-01'});await available(f,x);assert.equal((await f.download(x.paperId,x.student)).status,403);assert.equal((await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:0},x.student)).status,403);
 const a={schedule_published:1,paper_released_at:'x',paper_state:'APPROVED',paper_file_id:'x',exam_date:'2999-01-01'},before=Date.now;
 try{Date.now=()=>Date.parse('2999-01-01T00:59:59Z');assert.equal(paperAvailable(a),false);Date.now=()=>Date.parse('2999-01-01T01:00:00Z');assert.equal(paperAvailable(a),true);}finally{Date.now=before;}
 f.db.prepare("UPDATE assessments SET exam_date='2026-01-01' WHERE assessment_id=?").run(x.id);
 await f.download(x.paperId,x.student);f.db.prepare("UPDATE assessment_recipients SET first_accessed_at='2026-01-01T01:00:00Z' WHERE assessment_id=?").run(x.id);
 await submit(f,x);assert.ok((await x.detail()).learners[0].submittedAt);
}));
test('resubmission needs explicit admin authority; failed uploads and stale forms preserve the last successful submission',()=>use(async f=>{
 const x=await setup(f);await available(f,x);const first=await submit(f,x),d=await x.detail(x.student);
 assert.equal((await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:d.learners[0].revision},x.student)).body.code,'RESUBMISSION_NOT_AUTHORISED');
 ok(await x.change('authorise-resubmission',{accountIds:['account-0002']}));
 let r=(await x.detail(x.student)).learners[0];const size=f.objects.size;
 assert.equal((await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:r.revision,sha256:'0'.repeat(64)},x.student)).status,503);
 assert.equal(f.objects.size,size);assert.equal((await x.detail()).learners[0].submissionId,first.submissionId);
 const second=ok(await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:r.revision},x.student));
 assert.notEqual(second.submissionId,first.submissionId);assert.equal((await x.detail()).learners[0].submissionNumber,2);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_submissions').get().n,2);
 assert.equal((await x.change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:first.submissionId,mark:50},x.teacher)).status,409);
 assert.equal((await f.download(first.fileId,x.other)).status,403);assert.equal((await f.download(first.fileId,x.student)).status,200);
}));
test('mark moderation and marks, feedback and scripts have independent releases and student privacy',()=>use(async f=>{
 const x=await setup(f);await available(f,x);await submit(f,x);
 const script=ok(await f.upload({kind:'SCRIPT',assessmentId:x.id,accountId:'account-0002'},x.teacher));
 let r=(await x.detail()).learners[0];ok(await x.change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:83.5,feedback:'Clear answers',scriptFileId:script.fileId},x.teacher));
 assert.equal((await x.detail(x.student)).learners[0].mark,null);assert.equal((await f.download(script.fileId,x.student)).status,403);
 assert.equal((await x.change('release',{category:'marks'})).status,409);
 r=(await x.detail()).learners[0];ok(await x.change('review-mark',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,decision:'RETURN',comment:'Check question 3'}));
 r=(await x.detail()).learners[0];ok(await x.change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:85,feedback:'Corrected',scriptFileId:script.fileId},x.teacher));
 r=(await x.detail()).learners[0];ok(await x.change('review-mark',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,decision:'APPROVE'}));
 assert.equal((await x.change('release',{category:'marks',accountIds:['account-0002']})).status,400);
 ok(await x.change('release',{category:'feedback',accountIds:['account-0002']}));let own=(await x.detail(x.student)).learners[0];assert.equal(own.mark,null);assert.equal(own.feedback,'Corrected');assert.equal(own.scriptFileId,null);
 ok(await x.change('release',{category:'marks'}));own=(await x.detail(x.student)).learners[0];assert.equal(own.mark,85);assert.equal(own.scriptFileId,null);
 ok(await x.change('release',{category:'scripts'}));assert.equal((await f.download(script.fileId,x.student)).status,200);assert.equal((await f.download(script.fileId,x.other)).status,403);
 r=(await x.detail()).learners[0];ok(await x.change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:86,feedback:'Revised',scriptFileId:script.fileId},x.teacher));assert.equal((await x.detail(x.student)).learners[0].mark,null);assert.equal((await f.download(script.fileId,x.student)).status,403);
}));
test('database failures roll back submissions, audit and receipts and remove uploaded orphan objects',()=>use(async f=>{
 const x=await setup(f);await available(f,x);const size=f.objects.size,receipts=f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
 f.db.exec("CREATE TRIGGER fail_answer BEFORE INSERT ON assessment_submissions BEGIN SELECT RAISE(ABORT,'synthetic assessment failure'); END;");
 assert.equal((await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:0},x.student)).status,503);
 assert.equal(f.objects.size,size);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_submissions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
 assert.equal((await x.detail()).learners[0].submissionId,null);
 delete f.env.ASSESSMENT_BUCKET;assert.equal((await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:0},x.student)).status,503);
}));
async function approvedMark(f,x,accountId='account-0002'){
 let r=(await x.detail()).learners.find(r=>r.accountId===accountId);ok(await x.change('mark',{accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:80,feedback:'Reviewed'},x.teacher));
 r=(await x.detail()).learners.find(r=>r.accountId===accountId);ok(await x.change('review-mark',{accountId,recipientRevision:r.revision,markId:r.markId,decision:'APPROVE'}));return (await x.detail()).learners.find(r=>r.accountId===accountId);
}
test('whole-class marks wait for all received scripts; selected feedback reaches only its owner',()=>use(async f=>{
 const x=await setup(f);f.db.exec(`INSERT INTO class_memberships(enrollment_id,activity_key,class_id,account_id,active) VALUES('assessment-second','${scope}','class-1','account-0008',1)`);ok(await x.change('roster'));await available(f,x);await submit(f,x);
 const second=await f.login('0008');ok(await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:0},second));await approvedMark(f,x);
 assert.equal((await x.change('release',{category:'marks'})).status,409);
 ok(await x.change('release',{category:'feedback',accountIds:['account-0002']}));assert.equal((await x.detail(x.student)).learners[0].feedback,'Reviewed');assert.equal((await x.detail(second)).learners[0].feedback,'');
 await approvedMark(f,x,'account-0008');ok(await x.change('release',{category:'marks'}));assert.equal((await x.detail(x.student)).learners[0].mark,80);assert.equal((await x.detail(second)).learners[0].mark,80);assert.equal((await x.detail(second)).learners.length,1);
}));
test('simultaneous changes conflict and batch paper release is atomic',()=>use(async f=>{
 const x=await setup(f);const revision=(await x.detail()).assessment.revision,make=()=>({...op(),assessmentId:x.id,revision,decision:'APPROVE'});
 const results=await Promise.all([f.call('review-paper',make(),x.admin),f.call('review-paper',make(),x.admin)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const other=await setup(f),a=(await x.detail()).assessment,b=(await other.detail()).assessment;
 assert.equal((await f.call('release-papers',{...op(),papers:[{id:x.id,revision:a.revision},{id:other.id,revision:b.revision}]},x.admin)).status,409);
 assert.equal((await x.detail()).assessment.paperReleased,false);
}));
test('Arabic template layouts and issued partial reports preserve scoped results and invalidate superseded marks',()=>use(async f=>{
 const x=await setup(f);await available(f,x);await submit(f,x);await approvedMark(f,x);
 const pending=await setup(f);const input={activityKey:scope,classId:'class-1',assessmentIds:[x.id,pending.id]};assert.equal(ok(await f.call('report-data',input,x.admin)).learners[0].results[0].mark,null);
 ok(await x.change('release',{category:'marks'}));const data=ok(await f.call('report-data',input,x.admin));assert.equal(data.learners[0].results[0].mark,80);assert.equal((await f.call('report-data',input,x.student)).status,403);
 const layout={fields:[{key:'learner',x:.1,y:.1,width:.8,height:.1,fontSize:14},{key:'results',x:.1,y:.3,width:.8,height:.4,fontSize:12},{key:'total',x:.1,y:.8,width:.8,height:.1,fontSize:14}]};
 const file=ok(await f.upload({kind:'TEMPLATE',activityKey:scope,classId:'class-1'},x.admin));
 const templateBody={...op(),activityKey:scope,classId:'class-1',name:'Arabic report',fileId:file.fileId,layout};const t=ok(await f.call('template-save',templateBody,x.admin));assert.equal(ok(await f.call('template-save',templateBody,x.admin)).replayed,true);assert.equal(ok(await f.call('templates',input,x.admin)).templates[0].layout.rtl,true);
 assert.equal((await f.call('template-save',{...templateBody,...op(),layout:{fields:[...layout.fields,{key:'evil',x:0,y:0,width:1,height:1,fontSize:12}]}},x.admin)).status,400);assert.equal((await f.download(file.fileId,x.student)).status,403);
 const uploaded=ok(await f.upload({kind:'REPORT',assessmentId:x.id,accountId:'account-0002'},x.admin)),source=data.learners[0].results.map(r=>({assessmentId:r.assessmentId,markId:r.markId}));
 const body={...op(),activityKey:scope,classId:'class-1',accountId:'account-0002',fileId:uploaded.fileId,source};ok(await f.call('report-save',body,x.admin));assert.equal((await f.download(uploaded.fileId,x.student)).status,200);assert.equal((await f.download(uploaded.fileId,x.other)).status,403);
 ok(await x.change('authorise-resubmission',{accountIds:['account-0002']}));await submit(f,x);assert.equal((await f.download(uploaded.fileId,x.student)).status,409);
 assert.equal((await f.call('template-save',{...templateBody,...op(),templateId:t.templateId,revision:0},x.admin)).status,409);
}));
test('Global Admin inherits every area while scoped admins, teachers and students cannot cross assessment authority',()=>use(async f=>{
 const x=await setup(f),scoped=await f.login('0004'),unassigned=await f.login('0005');
 const other=f.db.prepare("SELECT c.activity_key,c.class_id FROM classes c JOIN activities a USING(activity_key) WHERE a.kind='PROGRAM' AND a.activity_key<>? AND c.active=1 AND a.lifecycle='ACTIVE' LIMIT 1").get(scope);assert.ok(other);
 const body={...op(),activityKey:other.activity_key,classId:other.class_id,title:'Other area',subject:'Fiqh',examDate:'2026-01-01',durationMinutes:30,maximumMark:50};
 assert.equal((await f.call('create',body,scoped)).status,403);assert.equal((await f.call('create',body,x.teacher)).status,403);assert.equal((await f.call('create',body,x.student)).status,403);
 const id=ok(await f.call('create',body,x.admin)).assessmentId;
 assert.equal((await f.call('get',{assessmentId:id},scoped)).status,403);assert.equal((await f.call('get',{assessmentId:x.id},unassigned)).status,403);
 assert.equal((await x.change('authorise-resubmission',{accountIds:['account-0002']},x.teacher)).status,403);
 assert.ok(ok(await f.call('list',{},x.admin)).assessments.some(a=>a.id===id));assert.ok(!ok(await f.call('list',{},scoped)).assessments.some(a=>a.id===id));assert.equal(ok(await f.call('list',{kind:'COURSE'},x.admin)).assessments.some(a=>a.id===x.id),false);
}));
