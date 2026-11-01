import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {ok,correction} from './fixtures/academy-recorded-context-fixture.mjs';
import {recordedFilter} from '../src/academy/separation/recorded-context-read.js';
import {recordedOptionsSQL} from '../src/academy/d1/lesson-recorded-options.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {actorProof} from '../src/academy/separation/proof.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {seedContextReadGrowth as seed,summarizeContextReadCosts as summarize} from './fixtures/academy-context-read-growth.mjs';
test('editor option/retry reads stay scoped under unrelated growth; unchanged owner write-plan costs remain explicit',async()=>{
 const reports=[];
 for(const growth of [0,250]){
  const f=await splitVideoFixture(source=>seed(source,growth));try{
   const admin=await f.source.actor('adminA'),activityKey=f.scopes.programA,date='2026-10-27',session=ok(await f.request('sessions',{activityKey,startDate:date,endDate:date},admin)).sessions[0],lessonId=ok(await f.request('create',{activityKey,startDate:date,endDate:date,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId;
   const actions={},measure=async(name,action,input)=>{const at=f.costs.length,response=ok(await f.request(action,input,admin));actions[name]=summarize(f.costs.slice(at));return response;};
   await measure('coldOptions','context-options',{lessonId});await measure('repeatOptions','context-options',{lessonId});const input=correction(lessonId);await measure('save','context-save',input);assert.equal((await measure('exactRetry','context-save',input)).replayed,true);
   for(const name of ['coldOptions','repeatOptions','save']){assert.equal(actions[name].recipeCaptureTables.length,1);assert(actions[name].recipeCaptureRows<40);assert(actions[name].recipeStatements<=25);}assert.equal(actions.exactRetry.recipeCaptureRows,0);
   reports.push({growth,actions});
  }finally{f.close();}
 }
 for(const name of ['coldOptions','repeatOptions','save'])assert.deepEqual(reports[0].actions[name].recipeCaptureTables,reports[1].actions[name].recipeCaptureTables,name+' never captures unrelated accounts/curriculum/media');
 for(const name of ['coldOptions','repeatOptions','save','exactRetry'])assert.equal(reports[0].actions[name].readCaptureRows,reports[1].actions[name].readCaptureRows,name+' read captures remain scoped');
 for(const name of ['coldOptions','repeatOptions','exactRetry'])assert.equal(reports[1].actions[name].inheritedCaptureRows,reports[0].actions[name].inheritedCaptureRows,name+' does not capture unrelated rows');
 assert(reports[1].actions.save.inheritedCaptureRows>reports[0].actions.save.inheritedCaptureRows,'Unchanged owner write-plan costs remain separately visible');
 if(process.env.RECORDED_CONTEXT_BUDGET_OUTPUT)await writeFile(process.env.RECORDED_CONTEXT_BUDGET_OUTPUT,JSON.stringify({hostedActions:0,measurement:'Synthetic coordinator SQL statements and materialized source rows; not D1 billed rows-read estimates',reports},null,2));
 console.log('Recorded-context growth budget:',JSON.stringify(reports.map(r=>({growth:r.growth,actions:Object.fromEntries(Object.entries(r.actions).map(([k,v])=>[k,{statements:v.coordinatorStatements,recipeStatements:v.recipeStatements,recipeRows:v.recipeCaptureRows,inheritedRows:v.inheritedCaptureRows,readRows:v.readCaptureRows,writePlanRows:v.writePlanCaptureRows}]))}))));
});
test('scope recipe rejects changed SQL, mismatched keys, wrong owner and out-of-scope authority before capture',async()=>{
 const f=await splitVideoFixture(source=>seed(source));try{
  const admin=await f.source.actor('adminA'),repo=academyD1Repository(f.source.env);await repo.ready();const auth=await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+admin,'X-Academy-Workspace':'ADMIN'}}),f.source.env,repo),proof=actorProof(auth),engine=splitEngine({core:f.core,admin:f.admin}),statements=key=>recordedOptionsSQL.map(sql=>({sql,params:[key],recordedContextScope:key}));
  const exact=statements(f.scopes.programA);assert.equal((await engine.read(exact,proof,'admin')).length,3);
  for(const [input,owner] of [[[{...exact[0],sql:'SELECT * FROM accounts'},...exact.slice(1)],'admin'],[[{...exact[0],params:[f.scopes.programB]},...exact.slice(1)],'admin'],[exact.map(s=>({...s,recordedContextScope:null})),'admin'],[[{...exact[0],recordedContextScope:null},...exact.slice(1)],'admin'],[exact,'core'],[statements(f.scopes.programB),'admin']])await assert.rejects(engine.read(input,proof,owner),e=>[400,403].includes(e.status));
  f.databases.core.prepare('UPDATE role_assignments SET active=0 WHERE account_id=?').run(f.actors.adminA);await assert.rejects(engine.read(exact,proof,'admin'),e=>e.status===401);
 }finally{f.close();}
});

test('recipe rejects oversized inactive curriculum and actor revocation during capture without returning a projection',async()=>{
 const f=await splitVideoFixture(source=>seed(source));try{
  const token=await f.source.actor('adminA'),repo=academyD1Repository(f.source.env);await repo.ready();const auth=await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'}}),f.source.env,repo),proof=actorProof(auth),scope=f.scopes.programA,statements=recordedOptionsSQL.map(sql=>({sql,params:[scope],recordedContextScope:scope}));
  let fired=false;const raced=splitEngine({core:f.core,admin:f.admin,hook:async phase=>{if(phase==='read-captured'&&!fired){fired=true;f.databases.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),proof.sid);}}});
  await assert.rejects(raced.read(statements,proof,'admin'),e=>e.status===401);assert(fired);f.databases.core.prepare('UPDATE account_sessions SET revoked_at=NULL WHERE session_id=?').run(proof.sid);
  const engine=splitEngine({core:f.core,admin:f.admin});assert.equal((await engine.read(statements,proof,'admin')).length,3);
  for(const [owner,db] of Object.entries(f.databases))for(let n=0;n<401;n++){db.prepare(owner==='core'?"INSERT INTO modules(activity_key,module_id,name,sort_order,active) VALUES(?,?,?,0,0)":"INSERT INTO modules(activity_key,module_id,name,sort_order) VALUES(?,?,?,0)").run(scope,'inactive-cap-'+n,'Inactive '+n);}
  await assert.rejects(engine.read(statements,proof,'admin'),e=>e.status===409&&e.code==='CONTEXT_OPTIONS_LIMIT');
 }finally{f.close();}
});
test('scoped capture predicates use programme/account/catalogue indexes; registry scans are explicitly recorded',async()=>{
 const f=await splitVideoFixture(source=>seed(source));try{
  const selection={activityKey:f.scopes.programA,subjectKeys:['ACADEMY:recorded-subject']},plans={};
  for(const name of ['program_subjects','program_levels','modules','subject_catalog','effective_activity_roles','academy_teacher_designations']){const filter=recordedFilter(name,selection);plans[name]=f.databases.core.prepare('EXPLAIN QUERY PLAN SELECT * FROM '+name+filter.where).all(...filter.params).map(r=>r.detail);}
  // The account population is reached through its primary key, after indexed
  // scoped roles and the small teacher designation registry establish IDs.
  plans.accounts=f.databases.core.prepare("EXPLAIN QUERY PLAN SELECT * FROM accounts WHERE account_id IN(SELECT account_id FROM effective_activity_roles WHERE activity_key=? AND role='TEACHER' UNION SELECT account_id FROM academy_teacher_designations WHERE active=1) AND active=1 LIMIT 201").all(selection.activityKey).map(r=>r.detail);
  for(const name of ['program_subjects','program_levels','modules','subject_catalog'])assert(plans[name].some(p=>/SEARCH .*INDEX/.test(p)),JSON.stringify(plans[name]));assert(plans.effective_activity_roles.some(p=>p.includes('roles_by_activity')));assert(plans.accounts.some(p=>/SEARCH accounts USING INDEX/.test(p)));assert(!plans.accounts.some(p=>p==='SCAN accounts'));
  if(process.env.RECORDED_CONTEXT_PLAN_OUTPUT)await writeFile(process.env.RECORDED_CONTEXT_PLAN_OUTPUT,JSON.stringify({measurement:'Local SQLite EXPLAIN QUERY PLAN; no D1 billed rows_read metadata is available in these fixtures',plans,legacy:'The split option recipe reads effective_activity_roles, including current LEGACY_MAPPED roles, without rebuilding legacy evidence/review/mapping relations',registry:'The teacher-designation registry may scan its own registry; captured output fails at the 201 sentinel row. Programme/account/catalogue predicates use indexes.'},null,2));
 }finally{f.close();}
});
