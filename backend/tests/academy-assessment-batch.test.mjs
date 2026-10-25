import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessmentFixture,assessmentScope as scope} from './fixtures/academy-assessment-fixture.mjs';
const op=()=>({operationId:crypto.randomUUID()}),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const paper=(i=0,extra={})=>({activityKey:scope,classId:'class-1',title:'Paper '+i,subject:'Qasas',examDate:'2099-11-09',durationMinutes:60,maximumMark:100,...extra});
async function use(fn){const f=await assessmentFixture();try{const admin=await f.login('0001'),registerId=ok(await f.call('register-create',{...op(),name:'Batch Imtihaan',activityKeys:[scope],classMode:'ALL',status:'REGISTERED'},admin)).registerId;await fn(f,admin,registerId);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.db.close();}}
const batch=(registerId,rows,revision=1)=>({...op(),registerId,revision,rows});
test('many assessment drafts save together, retry exactly once, then validate and publish the whole Imtihaan',()=>use(async(f,admin,registerId)=>{
 const body=batch(registerId,Array.from({length:30},(_,i)=>paper(i))),saved=ok(await f.call('schedule-batch',body,admin));
 assert.equal(saved.saved,30);assert.equal(saved.revision,2);assert.equal(saved.assessmentIds.length,30);assert.equal(ok(await f.call('schedule-batch',body,admin)).replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments WHERE schedule_published=0').get().n,30);
 assert.equal(f.db.prepare("SELECT count(*) n FROM operation_receipts WHERE scope_key=? AND dataset_key='ASSESSMENT'").get(registerId).n,1);
 assert.equal((await f.call('schedule-batch',{...body,rows:[paper(99)]},admin)).body.code,'OPERATION_ID_REUSED');
 const validation=ok(await f.call('register-validate',{registerId,revision:2,name:'Batch Imtihaan',activityKeys:[scope],classMode:'ALL',status:'SCHEDULED'},admin));assert.equal(validation.valid,true);
 const released=ok(await f.call('register-release',{...op(),registerId,revision:2},admin));assert.equal(released.released,30);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments WHERE schedule_published=1').get().n,30);
 assert.equal((await f.call('schedule-batch',batch(registerId,[paper(1,{assessmentId:saved.assessmentIds[0],revision:2})],3),admin)).status,409);
}));
test('one batch edits an original shared selection and creates another paper without regrouping other subjects',()=>use(async(f,admin,registerId)=>{
 const initial=ok(await f.call('schedule-batch',batch(registerId,[paper(1,{classes:[{activityKey:scope,classId:'class-1'},{activityKey:scope,classId:'class-shared'}]}),paper(2)]),admin));
 const [first,second,other]=initial.assessmentIds,edit=paper(1,{assessmentId:first,revision:1,title:'Revised shared paper',groupRevisions:[{id:first,revision:1},{id:second,revision:1}]});
 ok(await f.call('schedule-batch',batch(registerId,[edit,paper(3)],2),admin));
 const rows=f.db.prepare('SELECT assessment_id,title,revision FROM assessments ORDER BY assessment_id').all();
 assert.equal(rows.find(a=>a.assessment_id===first).title,'Revised shared paper');assert.equal(rows.find(a=>a.assessment_id===second).title,'Revised shared paper');assert.equal(rows.find(a=>a.assessment_id===other).title,'Paper 2');
 assert.equal((await f.call('schedule-batch',batch(registerId,[edit],3),admin)).body.code,'ASSESSMENT_GROUP_CHANGED');
 const current={...edit,revision:2,groupRevisions:[{id:first,revision:2},{id:second,revision:2}]};
 assert.equal((await f.call('schedule-batch',batch(registerId,[current,{...current,assessmentId:second}],3),admin)).status,400);
}));
test('bulk save rejects stale registers, unavailable classes, partial authority and non-Admin workspaces atomically',()=>use(async(f,admin,registerId)=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),scoped=await f.login('0004');
 for(const token of [teacher,student])assert.equal((await f.call('schedule-batch',batch(registerId,[paper()]),token)).status,403);
 for(const rows of [[],[paper(),paper(1,{classId:'missing'})],[paper(),paper(1,{maximumMark:0})]])assert.ok((await f.call('schedule-batch',batch(registerId,rows),admin)).status>=400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,0);
 const saved=ok(await f.call('schedule-batch',batch(registerId,[paper()]),scoped));assert.equal(saved.revision,2);
 assert.equal((await f.call('schedule-batch',batch(registerId,[paper(1)]),admin)).body.code,'ROW_CHANGED');
 const before=f.db.prepare('SELECT * FROM assessments').all();
 const other=f.db.prepare("SELECT activity_key,class_id FROM classes WHERE activity_key<>? AND active=1 LIMIT 1").get(scope);
 const multi=ok(await f.call('register-create',{...op(),name:'Other scope',activityKeys:[scope,other.activity_key],classMode:'ALL',status:'REGISTERED'},admin)).registerId;
 assert.equal((await f.call('schedule-batch',batch(multi,[paper()]),scoped)).status,403);
 assert.deepEqual(f.db.prepare('SELECT * FROM assessments').all(),before);
}));
test('one failing write rolls the draft batch, events, register revision and receipt back',()=>use(async(f,admin,registerId)=>{
 f.db.exec("CREATE TRIGGER reject_batch_paper BEFORE INSERT ON assessments WHEN NEW.title='Paper 2' BEGIN SELECT RAISE(ABORT,'synthetic batch failure'); END;");
 const before=f.db.prepare('SELECT * FROM assessment_registers').all(),receipts=f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
 assert.equal((await f.call('schedule-batch',batch(registerId,[paper(1),paper(2)]),admin)).status,503);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='CREATED'").get().n,0);
 assert.deepEqual(f.db.prepare('SELECT * FROM assessment_registers').all(),before);assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
}));
