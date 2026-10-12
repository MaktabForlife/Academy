import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessmentFixture,assessmentScope as scope} from './fixtures/academy-assessment-fixture.mjs';
const op=()=>({operationId:crypto.randomUUID()}),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const values={name:'Final 2026',activityKeys:[scope],classMode:'ONE',classActivityKey:scope,classId:'class-1',status:'REGISTERED'};
async function use(fn){const f=await assessmentFixture();try{await fn(f,await f.login('0001'));assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.db.close();}}
const registers=async(f,token)=>ok(await f.call('list',{view:'admin'},token)).registers;
const otherClass=f=>f.db.prepare("SELECT c.activity_key,c.class_id FROM classes c JOIN activities a USING(activity_key) WHERE a.kind='PROGRAM' AND a.activity_key<>? AND c.active=1 AND a.lifecycle='ACTIVE' LIMIT 1").get(scope);
test('assessment register supports multiple areas, one/all classes, statuses and exact retries',()=>use(async(f,admin)=>{
 const other=otherClass(f),body={...values,...op(),activityKeys:[scope,other.activity_key],classMode:'ALL',classActivityKey:null,classId:null};
 const id=ok(await f.call('register-create',body,admin)).registerId;assert.equal(ok(await f.call('register-create',body,admin)).replayed,true);
 const rows=await registers(f,admin);assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].classMode,'ALL');assert.equal(rows[0].areas.length,2);assert.equal(rows[0].status,'REGISTERED');assert.equal(rows[0].canEdit,true);
 assert.equal((await f.call('register-create',{...body,...op(),classMode:'SOME'},admin)).status,400);
 assert.equal((await f.call('register-create',{...values,...op(),name:''},admin)).status,400);
 assert.equal((await f.call('register-create',{...values,...op(),activityKeys:[]},admin)).status,400);
 assert.equal((await f.call('register-create',{...values,...op(),status:'INVENTED'},admin)).status,400);
 assert.equal((await f.call('register-create',{...values,...op(),classActivityKey:other.activity_key,classId:other.class_id},admin)).status,400);
}));
test('register editing enforces area authority and does not grant access through a shared row',()=>use(async(f,admin)=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),scoped=await f.login('0004'),other=otherClass(f);
 for(const token of [teacher,student])assert.equal((await f.call('register-create',{...values,...op()},token)).status,403);
 const id=ok(await f.call('register-create',{...values,...op(),activityKeys:[scope,other.activity_key]},admin)).registerId;
 assert.equal((await registers(f,scoped)).find(r=>r.id===id).canEdit,false);
 assert.equal((await f.call('register-save',{...values,...op(),registerId:id,revision:1,name:'Outside scope'},scoped)).status,403);
 assert.deepEqual(await registers(f,student),[]);assert.deepEqual(await registers(f,teacher),[]);
}));
test('renaming an Imtihaan preserves each assessment name, date and paper',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId,ids=[];
 for(const [i,title] of ['Final 2026','Custom paper'].entries())ids.push(ok(await f.call('create',{...op(),registerId:id,activityKey:scope,classId:'class-1',title,subject:'Qasas',examDate:'2026-11-'+(9+i*7).toString().padStart(2,'0'),durationMinutes:60,maximumMark:100},admin)).assessmentId);
 const before=f.db.prepare('SELECT * FROM assessments ORDER BY assessment_id').all();
 const body={...values,...op(),registerId:id,revision:1,name:'Final examinations 2026',status:'SCHEDULED'};
 ok(await f.call('register-save',body,admin));assert.equal(ok(await f.call('register-save',body,admin)).replayed,true);
 const after=f.db.prepare('SELECT * FROM assessments ORDER BY assessment_id').all();
 assert.deepEqual(after,before);
 for(const paper of after){assert.equal(paper.schedule_published,0);assert.equal(paper.paper_file_id,null);}
 assert.equal((await registers(f,admin))[0].name,'Final examinations 2026');
 assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='register-save'").get().n,1);
 assert.equal(ok(await f.call('get',{assessmentId:ids[0]},admin)).assessment.paperAvailable,false);
 assert.equal((await f.call('register-save',{...body,...op(),name:'Stale'},admin)).status,409);
}));
test('class and area edits cannot orphan saved dates; new dates use the selected register scope',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId,other=otherClass(f);
 const input={...op(),registerId:id,activityKey:scope,classId:'class-1',title:'Final 2026',subject:'Fiqh',examDate:'2026-11-09',durationMinutes:60,maximumMark:100};
 ok(await f.call('create',input,admin));assert.equal((await f.call('create',{...input,...op(),activityKey:other.activity_key,classId:other.class_id},admin)).status,403);
 assert.equal((await f.call('register-save',{...values,...op(),registerId:id,revision:1,activityKeys:[other.activity_key],classActivityKey:other.activity_key,classId:other.class_id},admin)).status,409);
 ok(await f.call('register-save',{...values,...op(),registerId:id,revision:1,activityKeys:[scope,other.activity_key],classMode:'ALL'},admin));
 ok(await f.call('create',{...input,...op(),activityKey:other.activity_key,classId:other.class_id},admin));
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments WHERE register_id=?').get(id).n,2);
}));
test('register save rolls back names, areas and receipts when any statement fails',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId,before=f.db.prepare('SELECT * FROM assessment_registers').all(),receipts=f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
 f.db.exec("CREATE TRIGGER fail_register_area BEFORE INSERT ON assessment_register_areas BEGIN SELECT RAISE(ABORT,'synthetic register failure'); END;");
 assert.equal((await f.call('register-save',{...values,...op(),registerId:id,revision:1,name:'Must roll back'},admin)).status,503);
 assert.deepEqual(f.db.prepare('SELECT * FROM assessment_registers').all(),before);assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_register_areas').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
}));
test('concurrent register edits cannot silently overwrite another admin',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId;
 assert.equal((await registers(f,admin))[0].imtihaanStatus,'REGISTERED');
 const results=await Promise.all(['First','Second'].map(name=>f.call('register-save',{...values,...op(),registerId:id,revision:1,name},admin)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await registers(f,admin))[0].revision,2);
}));
test('migration groups earlier schedules while preserving every original assessment field',async()=>{
 const f=await assessmentFixture({registry:false});try{
  f.db.prepare("INSERT INTO assessment_phases VALUES('phase-existing',?,'Named final','named final','2026-10-12','account-0001')").run(scope);
  for(const [id,title,phase] of [['legacy-a','Earlier final',null],['legacy-b','Earlier final',null],['phase-a','Named final','phase-existing']])f.db.prepare('INSERT INTO assessments(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,phase_id,created_at,created_by,updated_at) VALUES(?,?,\'class-1\',?,\'Qasas\',\'2026-11-09\',60,100,?,\'2026-10-12\',\'account-0001\',\'2026-10-12\')').run(id,scope,title,phase);
  const before=f.db.prepare('SELECT * FROM assessments ORDER BY assessment_id').all();f.db.exec(readFileSync(new URL('../migrations/academy/0020_assessment_register.sql',import.meta.url),'utf8'));
  const after=f.db.prepare('SELECT * FROM assessments ORDER BY assessment_id').all();assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_registers').get().n,2);
  assert.deepEqual(after.map(({register_id,deleted_at,deleted_by,...a})=>a),before.map(a=>({...a})));assert.equal(after[0].register_id,after[1].register_id);assert.notEqual(after[0].register_id,after[2].register_id);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});

test('status validation checks actual workflow prerequisites and saving revalidates without releasing anything',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId;
 let current={...values,registerId:id,revision:1,status:'SCHEDULED'};
 let checked=ok(await f.call('register-validate',current,admin));assert.equal(checked.valid,false);
 assert.equal((await f.call('register-save',{...current,...op()},admin)).body.code,'STATUS_NOT_READY');
 const session=ok(await f.call('create',{...op(),registerId:id,activityKey:scope,classId:'class-1',title:values.name,subject:'Qasas',examDate:'2026-01-01',durationMinutes:60,maximumMark:100},admin)).assessmentId;
 const listed=async()=>ok(await f.call('list',{view:'admin'},admin)).assessments.find(a=>a.id===session);
 assert.equal((await listed()).paperStatus,'WAITING_FOR_SUBMISSION');
 const teacher=await f.login('0003'),student=await f.login('0002');
 assert.equal((await f.call('register-validate',current,teacher)).status,403);
 for(const status of ['REGISTERED','DRAFT','SCHEDULED','CANCELLED','ARCHIVED'])assert.equal(ok(await f.call('register-validate',{...current,status},admin)).valid,true,status);
 for(const status of ['SCHEDULE_RELEASED','AWAITING_MODERATION','APPROVED','PUBLISHED','IN_PROGRESS','READY_FOR_ASSESSMENT','ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE'])assert.equal(ok(await f.call('register-validate',{...current,status},admin)).valid,false,status);
 ok(await f.call('register-save',{...current,...op()},admin));current.revision++;
 assert.equal((await registers(f,admin))[0].imtihaanStatus,'SCHEDULED');
 const detail=async(token=admin)=>ok(await f.call('get',{assessmentId:session},token));
 const change=async(action,input={},token=admin)=>ok(await f.call(action,{...op(),assessmentId:session,revision:(await detail()).assessment.revision,...input},token));
 await change('publish');assert.equal(ok(await f.call('register-validate',{...current,status:'SCHEDULE_RELEASED'},admin)).valid,true);
 ok(await f.upload({kind:'PAPER',assessmentId:session,revision:(await detail()).assessment.revision},teacher));
 assert.equal((await listed()).paperStatus,'DRAFTED');
 assert.equal(ok(await f.call('register-validate',{...current,status:'AWAITING_MODERATION'},admin)).valid,true);
 await change('review-paper',{decision:'APPROVE'});assert.equal(ok(await f.call('register-validate',{...current,status:'APPROVED'},admin)).valid,true);
 assert.equal((await listed()).paperStatus,'APPROVED');
 assert.equal(ok(await f.call('register-validate',{...current,status:'PUBLISHED'},admin)).valid,false);
 ok(await f.call('release-papers',{...op(),papers:[{id:session,revision:(await detail()).assessment.revision}]},admin));
 assert.equal((await listed()).paperStatus,'PAPER_RELEASED');
 assert.equal((await registers(f,admin))[0].imtihaanStatus,'BEING_ASSESSED');
 for(const status of ['PUBLISHED','IN_PROGRESS'])assert.equal(ok(await f.call('register-validate',{...current,status},admin)).valid,true,status);
 const d=await detail(student);ok(await f.upload({kind:'ANSWER',assessmentId:session,recipientRevision:d.learners[0].revision},student));
 assert.equal((await listed()).resultsStatus,'UPLOADED');
 assert.equal(ok(await f.call('register-validate',{...current,status:'READY_FOR_ASSESSMENT'},admin)).valid,false);
 let r=(await detail()).learners[0];assert.equal((await f.call('confirm-submission',{...op(),assessmentId:session,revision:(await detail()).assessment.revision,accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId},teacher)).status,409);
 assert.equal((await f.download(r.answerFileId,teacher)).status,200);
 await change('confirm-submission',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId},teacher);
 await change('ready-assessment',{},teacher);
 assert.equal((await listed()).resultsStatus,'READY_FOR_ASSESSMENT');
 assert.equal(ok(await f.call('register-validate',{...current,status:'READY_FOR_ASSESSMENT'},admin)).valid,true);
 assert.equal(ok(await f.call('register-validate',{...current,status:'ASSESSED'},admin)).valid,false);
 r=(await detail()).learners[0];await change('mark',{accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId,mark:80,feedback:'Good work.'},teacher);
 assert.equal((await listed()).resultsStatus,'ASSESSED');
 assert.equal(ok(await f.call('register-validate',{...current,status:'ASSESSED'},admin)).valid,true);
 r=(await detail()).learners[0];await change('review-mark',{accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,decision:'APPROVE'});
 assert.equal((await listed()).resultsStatus,'MODERATED');
 assert.equal((await registers(f,admin))[0].imtihaanStatus,'BEING_ASSESSED');
 for(const status of ['MODERATED','READY_FOR_RELEASE'])assert.equal(ok(await f.call('register-validate',{...current,status},admin)).valid,true,status);
 assert.equal(ok(await f.call('register-validate',{...current,status:'RELEASED'},admin)).valid,false);
 await change('release',{category:'marks'});
 assert.equal((await listed()).resultsStatus,'RELEASED');
 assert.equal((await registers(f,admin))[0].imtihaanStatus,'COMPLETE');
 for(const status of ['RELEASED','COMPLETE'])assert.equal(ok(await f.call('register-validate',{...current,status},admin)).valid,true,status);
 // A successful Validate is informational: later changes are checked again atomically on Save.
 await change('authorise-resubmission',{accountIds:[r.accountId]});
 assert.equal((await f.call('register-save',{...current,...op(),status:'COMPLETE'},admin)).body.code,'STATUS_NOT_READY');
 assert.equal((await registers(f,admin))[0].status,'SCHEDULED');
 assert.equal((await detail(student)).learners[0].feedback,'','Register validation never releases feedback');
}));
test('publishing a future paper starts an Imtihaan without opening the paper early',()=>use(async(f,admin)=>{
 const id=ok(await f.call('register-create',{...values,...op()},admin)).registerId;
 const paper=ok(await f.call('create',{...op(),registerId:id,activityKey:scope,classId:'class-1',title:'Future paper',subject:'Qasas',examDate:'2099-01-01',durationMinutes:60,maximumMark:100},admin)).assessmentId;
 ok(await f.call('register-save',{...values,...op(),registerId:id,revision:1,status:'SCHEDULED'},admin));
 ok(await f.call('publish',{...op(),assessmentId:paper,revision:1},admin));
 const teacher=await f.login('0003');ok(await f.upload({kind:'PAPER',assessmentId:paper,revision:2},teacher));
 ok(await f.call('review-paper',{...op(),assessmentId:paper,revision:3,decision:'APPROVE'},admin));
 ok(await f.call('release-papers',{...op(),papers:[{id:paper,revision:4}]},admin));
 const list=ok(await f.call('list',{view:'admin'},admin));
 assert.equal(list.registers[0].imtihaanStatus,'IN_PROGRESS');
 assert.equal(list.assessments[0].paperStatus,'PUBLISHED');
 assert.equal(list.assessments[0].paperAvailable,false);
}));
test('session deletion is scoped, revision checked, retry safe and preserves audit and private attachments',()=>use(async(f,admin)=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),other=await f.login('0008');
 const id=ok(await f.call('create',{...op(),activityKey:scope,classId:'class-1',title:'Delete me',subject:'Qasas',examDate:'2026-01-01',durationMinutes:60,maximumMark:100},admin)).assessmentId;
 let input={...op(),assessmentId:id,revision:1};
 for(const token of [teacher,student,other])assert.equal((await f.call('session-delete',input,token)).status,403);
 const file=ok(await f.upload({kind:'PAPER',assessmentId:id,revision:1},teacher));
 assert.equal((await f.call('session-delete',input,admin)).body.code,'ROW_CHANGED');
 input={...op(),assessmentId:id,revision:2};ok(await f.call('session-delete',input,admin));assert.equal(ok(await f.call('session-delete',input,admin)).replayed,true);
 assert.equal(ok(await f.call('list',{},admin)).assessments.length,0);
 for(const token of [admin,teacher,student]){assert.equal((await f.call('get',{assessmentId:id},token)).status,404);assert.equal((await f.download(file.fileId,token)).status,404);}
 assert.ok(f.db.prepare('SELECT deleted_at FROM assessments WHERE assessment_id=?').get(id).deleted_at);assert.equal(f.objects.size,1);assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE assessment_id=? AND action='session-delete'").get(id).n,1);
 assert.equal((await f.call('release-papers',{...op(),papers:[{id,revision:3}]},admin)).status,404);
}));
test('deletion cannot erase learner access or submissions and failed deletion rolls back',()=>use(async(f,admin)=>{
 const id=ok(await f.call('create',{...op(),activityKey:scope,classId:'class-1',title:'Preserve me',subject:'Qasas',examDate:'2026-01-01',durationMinutes:60,maximumMark:100},admin)).assessmentId;
 const input={...op(),assessmentId:id,revision:1},before=f.db.prepare('SELECT * FROM assessments').get();
 f.db.exec("CREATE TRIGGER fail_delete BEFORE UPDATE OF deleted_at ON assessments BEGIN SELECT RAISE(ABORT,'synthetic delete failure'); END;");
 assert.equal((await f.call('session-delete',input,admin)).status,503);assert.deepEqual(f.db.prepare('SELECT * FROM assessments').get(),before);
 f.db.exec('DROP TRIGGER fail_delete');ok(await f.call('publish',{...op(),assessmentId:id,revision:1},admin));
 f.db.prepare("UPDATE assessment_recipients SET first_accessed_at='2026-01-01' WHERE assessment_id=?").run(id);
 assert.equal((await f.call('session-delete',{...op(),assessmentId:id,revision:2},admin)).body.code,'SESSION_IN_USE');assert.equal(f.db.prepare('SELECT deleted_at FROM assessments').get().deleted_at,null);
}));
