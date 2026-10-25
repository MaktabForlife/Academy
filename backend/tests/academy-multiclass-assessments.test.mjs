import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessmentFixture,assessmentScope as scope} from './fixtures/academy-assessment-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()});
async function use(fn){const f=await assessmentFixture();try{
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'multi-second','Second selected class',1)").run(scope);
 await fn(f,await f.login('0001'));assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{f.db.close();}}
const targets=[{activityKey:scope,classId:'class-1'},{activityKey:scope,classId:'multi-second'}];
const input=()=>({...op(),activityKey:scope,classId:'class-1',classes:targets,title:'Shared assessment choice',subject:'Qasas',examDate:'2026-11-09',durationMinutes:60,maximumMark:100});
const register=async(f,admin,extra={})=>ok(await f.call('register-create',{...op(),name:'Selected classes',activityKeys:[scope],classMode:'ALL',status:'REGISTERED',...extra},admin)).registerId;
test('one selection creates independent class assessments atomically without publishing, recipients or learner work',()=>use(async(f,admin)=>{
 const body={...input(),registerId:await register(f,admin)},memberships=f.db.prepare('SELECT * FROM class_memberships').all(),version=f.db.prepare('SELECT version FROM academy_write_state').get().version;
 const saved=ok(await f.call('create',body,admin));assert.equal(saved.assessmentIds.length,2);assert.equal(saved.assessmentId,saved.assessmentIds[0]);
 assert.deepEqual(ok(await f.call('create',body,admin)).assessmentIds,saved.assessmentIds);assert.equal(ok(await f.call('create',body,admin)).replayed,true);
 const rows=f.db.prepare('SELECT * FROM assessments WHERE register_id=? ORDER BY class_id').all(body.registerId);assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(r=>r.class_id)),new Set(targets.map(c=>c.classId)));
 for(const row of rows){assert.equal(row.title,body.title);assert.equal(row.schedule_published,0);assert.equal(row.paper_file_id,null);assert.equal(row.paper_released_at,null);}
 for(const table of ['assessment_recipients','assessment_submissions','assessment_markings'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 assert.deepEqual(f.db.prepare('SELECT * FROM class_memberships').all(),memberships);assert.equal(f.db.prepare('SELECT version FROM academy_write_state').get().version,version+1);
 assert.equal((await f.call('create',{...body,title:'Changed retry'},admin)).status,409);
}));
test('class keys include their learning area and scoped Admin cannot add any outside target',()=>use(async(f,admin)=>{
 const other=f.db.prepare("SELECT c.activity_key,c.class_id FROM classes c JOIN activities a USING(activity_key) WHERE a.kind='PROGRAM' AND c.activity_key<>? AND c.active=1 LIMIT 1").get(scope),classes=[targets[0],{activityKey:other.activity_key,classId:other.class_id}];
 const body={...input(),classes,registerId:await register(f,admin,{activityKeys:[scope,other.activity_key]})},scoped=await f.login('0004'),before=f.db.prepare('SELECT count(*) n FROM assessments').get().n;
 assert.equal((await f.call('create',body,scoped)).status,403);assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,before);
 const result=ok(await f.call('create',body,admin));assert.equal(result.assessmentIds.length,2);assert.equal(new Set(f.db.prepare('SELECT activity_key FROM assessments').all().map(r=>r.activity_key)).size,2);
 const scopedRows=ok(await f.call('list',{view:'admin'},scoped)).assessments;assert.equal(scopedRows.length,1);assert.equal(scopedRows[0].sharedAssessmentId,undefined,'Partial authority must not expose a shared identity for another area');
 const complete=ok(await f.call('list',{view:'admin'},admin)).assessments;assert(complete.every(a=>a.sharedAssessmentId===result.assessmentId&&a.sharedClassCount===2));
}));
test('invalid, duplicate, inactive and register-excluded classes cannot create a partial assessment',()=>use(async(f,admin)=>{
 for(const classes of [[],[targets[0],targets[0]],[targets[0],{...targets[0],classId:'CLASS-1'}],[{activityKey:scope,classId:3}],Array.from({length:51},(_,i)=>({activityKey:scope,classId:'class-'+i}))])assert.equal((await f.call('create',{...input(),classes},admin)).status,400);
 const registerId=await register(f,admin,{classMode:'ONE',classActivityKey:scope,classId:'class-1'});assert.equal((await f.call('create',{...input(),registerId},admin)).status,403);
 f.db.prepare("UPDATE classes SET active=0 WHERE class_id='multi-second'").run();assert.equal((await f.call('create',input(),admin)).status,403);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,0);
}));
test('a failure on the second class rolls back the whole selection, and the same retry succeeds exactly once',()=>use(async(f,admin)=>{
 const body={...input(),registerId:await register(f,admin)},receipts=f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
 f.db.exec("CREATE TRIGGER fail_second_assessment BEFORE INSERT ON assessments WHEN NEW.class_id='multi-second' BEGIN SELECT RAISE(ABORT,'synthetic selected-class failure'); END;");
 assert.equal((await f.call('create',body,admin)).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
 f.db.exec('DROP TRIGGER fail_second_assessment');const result=ok(await f.call('create',body,admin));assert.deepEqual(ok(await f.call('create',body,admin)).assessmentIds,result.assessmentIds);assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,2);
}));

test('authority revoked after planning cannot commit any class in the selection',()=>use(async(f,admin)=>{
 const db=f.env.ACADEMY_DB,withSession=db.withSession.bind(db);let intercepted=false;
 db.withSession=(...args)=>{const session=withSession(...args);return {...session,prepare(sql){if(!intercepted&&sql.startsWith('INSERT INTO academy_write_guards')){intercepted=true;f.db.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'").run();f.db.exec('UPDATE academy_write_state SET version=version+1 WHERE singleton=1');}return session.prepare(sql);},batch:session.batch.bind(session)};};
 const result=await f.call('create',input(),admin);assert(intercepted,JSON.stringify(result));assert([401,403,409].includes(result.status),JSON.stringify(result));assert.equal(f.db.prepare('SELECT count(*) n FROM assessments').get().n,0);
}));
