import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {seedRecordedOptions,ok,correction} from './fixtures/academy-recorded-context-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {actorProof} from '../src/academy/separation/proof.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {federationContext} from '../src/academy/separation/federation.js';
import {lessonContextSQL} from '../src/academy/d1/lesson-context-reads.js';
import {lessonContextSelection,lessonContextFilter} from '../src/academy/separation/lesson-context-read.js';
const statement=(kind,...values)=>({sql:lessonContextSQL[kind],params:values,lessonContextRead:{kind,values}});
async function fixture(){
 const f=await splitVideoFixture(source=>{seedRecordedOptions(source);source.db.exec("DELETE FROM modules WHERE module_id LIKE 'inactive%';DELETE FROM program_subjects WHERE program_subject_id='inactive-subject';DELETE FROM subject_catalog WHERE subject_id='inactive-subject';");});
 try{
  f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/0006_program_monthly_subscriptions.sql',import.meta.url),'utf8'));f.source.env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';
  f.token=await f.source.actor('adminA');f.key=f.scopes.programA;
  for(const key of [f.key,f.scopes.programB])f.databases.core.prepare("INSERT INTO program_monthly_media_policies VALUES(?,1,1,1,'2026-11-01',?)").run(key,f.actors.global);
  const period={activityKey:f.key,startDate:'2026-10-27',endDate:'2026-10-27'},session=ok(await f.request('sessions',period,f.token)).sessions.find(s=>s.classIds.length===1);assert(session);
  f.lessonId=ok(await f.request('create',{...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},f.token)).lessonId;
  f.operation=correction(f.lessonId);ok(await f.request('context-save',f.operation,f.token));
  const repo=academyD1Repository(f.source.env);await repo.ready();f.proof=actorProof(await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+f.token,'X-Academy-Workspace':'ADMIN'}}),f.source.env,repo));
  f.reads=[statement('schema'),statement('enabled'),statement('area',f.lessonId),statement('activity',f.key),statement('lesson',f.lessonId,f.key),statement('policy',f.key),statement('receipt',f.key,f.operation.operationId)];return f;
 }catch(error){f.close();throw error;}
}
const use=fn=>async()=>{const f=await fixture();try{await fn(f);for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.close();}};
test('every exact editor read matches the existing owner merge, including unpublished class references and current policy',use(async f=>{
 const engine=splitEngine({core:f.core,admin:f.admin});
 f.databases.admin.prepare("UPDATE classes SET name='Unpublished class label' WHERE activity_key=? AND class_id='class-shared'").run(f.key);
 f.databases.admin.prepare("UPDATE lesson_media_lessons SET class_id='class-shared' WHERE lesson_id=?").run(f.lessonId);
 f.databases.core.prepare("UPDATE classes SET active=0 WHERE activity_key=? AND class_id='class-shared'").run(f.key);
 for(const selected of f.reads){const expected={sql:selected.sql.replace(/^\/\*.*?\*\/ /,''),params:selected.params};assert.deepEqual(await engine.read([selected],f.proof,'admin'),await engine.read([expected],f.proof,'admin'),selected.lessonContextRead.kind);}
 const selected=statement('lesson',f.lessonId,f.key),selection=lessonContextSelection([selected],f.proof,'admin'),data=await federationContext({core:f.core,admin:f.admin,owner:'admin'}).snapshot([selected.sql],[],null,null,null,selection),klass=data.classes.find(c=>c.class_id==='class-shared');assert.equal(klass.active,0);assert.equal(klass.name,'Unpublished class label');assert.equal(data.lesson_media_lessons.length,1);
 const costsAt=f.costs.length;ok(await f.request('context-options',{lessonId:f.lessonId},f.token));const cost=f.costs.slice(costsAt).find(c=>c.readRecipe==='policy');assert.equal(cost.capturedRows.program_monthly_media_policies,1,'Only the selected monthly policy is transferred');
}));
test('missing, mixed or altered read metadata and SQL are rejected; another scoped Admin cannot resolve the lesson or receipt',use(async f=>{
 const engine=splitEngine({core:f.core,admin:f.admin}),selected=statement('lesson',f.lessonId,f.key);
 const cases=[
  [{...selected,lessonContextRead:null}],
  [{...selected,sql:selected.sql+' OR 1=1'}],
  [{...selected,params:[f.lessonId,f.scopes.programB]}],
  [{...selected,lessonContextRead:{kind:'lesson',values:[f.lessonId,f.key],tables:['accounts']}}],
  [{...selected,lessonContextRead:{kind:'schema',values:[]}}],
  [{...selected,acceptedScope:{head:'anything',tables:['accounts']}}],
  [{...selected,recordedContextScope:f.key}],
  [selected,statement('enabled')],
  [selected,{sql:'SELECT * FROM accounts',params:[]}]
 ];
 for(const input of cases)await assert.rejects(engine.read(input,f.proof,'admin'),e=>e.status===400);
 await assert.rejects(engine.read([selected],f.proof,'core'),e=>e.status===400);
 for(const invalid of [statement('activity',f.scopes.programB),statement('receipt',f.scopes.programB,f.operation.operationId)])await assert.rejects(engine.read([invalid],f.proof,'admin'),e=>e.status===403);
 const otherToken=await f.source.actor('adminB'),repo=academyD1Repository(f.source.env);await repo.ready();const otherProof=actorProof(await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+otherToken,'X-Academy-Workspace':'ADMIN'}}),f.source.env,repo));
 await assert.rejects(engine.read([statement('area',f.lessonId)],otherProof,'admin'),e=>e.status===403);
 const teacher=await f.source.login('0003'),teacherProof=actorProof(await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+teacher,'X-Academy-Workspace':'TEACH'}}),f.source.env,repo));
 for(const read of f.reads)await assert.rejects(engine.read([read],teacherProof,'admin'),e=>e.status===403);
}));
test('session revocation during every recipe and credential/role changes return no stale projection',use(async f=>{
 for(const selected of f.reads){let fired=false;const engine=splitEngine({core:f.core,admin:f.admin,hook:async phase=>{if(phase==='read-captured'&&!fired){fired=true;f.databases.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),f.proof.sid);}}});await assert.rejects(engine.read([selected],f.proof,'admin'),e=>e.status===401);assert(fired);f.databases.core.prepare('UPDATE account_sessions SET revoked_at=NULL WHERE session_id=?').run(f.proof.sid);assert.equal((await engine.read([selected],f.proof,'admin')).length,1);}
 const epoch=f.proof.epoch;let fired=false;const engine=splitEngine({core:f.core,admin:f.admin,hook:async phase=>{if(phase==='read-captured'&&!fired){fired=true;f.databases.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(f.proof.accountId);}}});await assert.rejects(engine.read([statement('lesson',f.lessonId,f.key)],f.proof,'admin'),e=>e.status===401);f.databases.core.prepare('UPDATE account_credentials SET credential_epoch=? WHERE account_id=?').run(epoch,f.proof.accountId);
 let removed=false;const roles=splitEngine({core:f.core,admin:f.admin,hook:async phase=>{if(phase==='read-captured'&&!removed){removed=true;f.databases.core.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=? AND role='PROGRAM_ADMIN'").run(f.proof.accountId,f.key);}}});await assert.rejects(roles.read([statement('receipt',f.key,f.operation.operationId)],f.proof,'admin'),e=>e.status===401);
}));
test('a concurrent lesson revision retries from current owner rows; known feature withdrawal is respected',use(async f=>{
 let changed=false;const engine=splitEngine({core:f.core,admin:f.admin,hook:async phase=>{if(phase==='read-captured'&&!changed){changed=true;f.databases.core.prepare("UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?").run(f.lessonId);f.databases.admin.prepare("UPDATE lesson_media_lessons SET title='Concurrent edit' WHERE lesson_id=?").run(f.lessonId);f.databases.core.prepare('UPDATE academy_write_state SET version=version+1').run();}}});
 const current=(await engine.read([statement('lesson',f.lessonId,f.key)],f.proof,'admin'))[0].results[0];assert.equal(current.revision,3);assert.equal(current.title,'Concurrent edit');assert.equal((await f.request('context-save',correction(f.lessonId,{revision:2}),f.token)).status,409);
 f.databases.core.prepare("UPDATE academy_settings SET setting_value='0' WHERE setting_key='LessonMediaEnabled'").run();assert.deepEqual((await engine.read([statement('enabled')],f.proof,'admin'))[0].results,[]);const disabled=await f.request('context-options',{lessonId:f.lessonId},f.token);assert.equal(disabled.status,503);assert.equal(disabled.body.success,false);
}));
test('lesson/activity/settings/receipt predicates use existing indexes and schema checks transfer no records',use(async f=>{
 const plans={};for(const selected of f.reads){const spec=lessonContextSelection([selected],f.proof,'admin');spec.classIds=['class-1'];const names={schema:['lesson_media_lessons','lesson_media_assets'],enabled:['academy_settings'],area:['lesson_media_lessons'],activity:['activities'],lesson:['lesson_media_lessons','classes'],policy:['program_monthly_media_policies'],receipt:['operation_receipts']}[spec.kind];
  plans[spec.kind]={};for(const name of names){const filter=lessonContextFilter(name,spec),plan=f.databases.core.prepare('EXPLAIN QUERY PLAN SELECT * FROM '+name+filter.where).all(...filter.params).map(r=>r.detail);plans[spec.kind][name]=plan;if(spec.kind!=='schema')assert(plan.some(line=>/SEARCH .*INDEX/.test(line)),JSON.stringify(plan));}
 }
 const start=f.costs.length;ok(await f.request('context-options',{lessonId:f.lessonId},f.token));const schema=f.costs.slice(start).find(c=>c.readRecipe==='schema');assert.deepEqual(schema.capturedRows,{});
 if(process.env.LESSON_CONTEXT_PLAN_OUTPUT)await writeFile(process.env.LESSON_CONTEXT_PLAN_OUTPUT,JSON.stringify({measurement:'Local SQLite query-plan evidence, not billed D1 rows. Schema WHERE 0 executes no row capture despite display of unused scan nodes in EXPLAIN QUERY PLAN.',plans},null,2));
}));
