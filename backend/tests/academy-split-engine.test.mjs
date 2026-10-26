import test from 'node:test';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {splitEngine} from '../src/academy/separation/engine.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {actorProof,verifyActor} from '../src/academy/separation/proof.js';
const stmt=(sql,...params)=>({sql,params});
async function actor(f,role='global'){
 const repository=academyD1Repository({...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_SPLIT_COORDINATOR:f.namespace}),state=await repository.byId(f.actors[role]),session=await repository.createSession(state,state.contexts[0]);
 const auth={state,user:{accountid:state.account.account_id},sid:session.sid};return {auth,proof:actorProof(auth),repository};
}
const edits=f=>[stmt("UPDATE activities SET name=?,active=? WHERE activity_key=?",'New private name',0,f.scopes.courseA),stmt("INSERT INTO operation_receipts VALUES('SPLIT_TEST','GLOBAL',?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}',?,?)",crypto.randomUUID(),f.actors.global,new Date().toISOString())];
test('actor proof uses current Core sessions, roles and credential epoch, including projected workspaces',async()=>{
 const f=await splitFixture();try{const a=await actor(f);assert.equal(typeof await verifyActor(f.core,a.proof),'number');assert.deepEqual(actorProof({...a.auth,authority:a.auth.state,state:{...a.auth.state,account:{...a.auth.state.account,global_admin:false},roles:[]}}),a.proof);
 await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').bind(new Date().toISOString(),a.proof.sid).run();await assert.rejects(verifyActor(f.core,a.proof),{code:'SESSION_ENDED'});
 }finally{f.close();}
});
test('cross-store save commits owner fields, then success evidence, and removes private recovery payloads',async()=>{
 const f=await splitFixture();try{const a=await actor(f),e=splitEngine(f);const out=await e.write(edits(f),a.proof);assert.equal(out.length,2);assert.equal((await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name,'New private name');assert.equal((await f.core.prepare('SELECT active FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).active,0);
 for(const db of [f.core,f.admin])assert.equal((await db.prepare('SELECT count(*) n FROM split_command_parts').first()).n,0);assert.equal((await f.core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);assert.equal((await f.admin.prepare('SELECT count(*) n FROM operation_receipts').first()).n,1);
 }finally{f.close();}
});
for(const point of ['admitted','planned','admin-applied','core-committed'])test('a new coordinator recovers interruption at '+point,async()=>{
 const f=await splitFixture();try{const a=await actor(f);let stopped=false;const e=splitEngine({...f,hook:async step=>{if(step===point&&!stopped){stopped=true;throw Error('Simulated transport interruption');}}});if(point==='core-committed')await e.write(edits(f),a.proof);else await assert.rejects(e.write(edits(f),a.proof));await splitEngine(f).recover();const c=await f.core.prepare('SELECT phase FROM split_commands').first();assert.equal(c.phase,point==='admitted'||point==='planned'?'ABORTED':'DONE');assert.equal((await f.core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);
 }finally{f.close();}
});
test('a rejected Core commit reverses Admin changes and never records success',async()=>{
 const f=await splitFixture();try{const a=await actor(f),old=(await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name;
 await assert.rejects(splitEngine(f).write([...edits(f),stmt("INSERT INTO academy_write_guards VALUES('rejected',0)")],a.proof));assert.equal((await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name,old);assert.equal((await f.admin.prepare('SELECT count(*) n FROM operation_receipts').first()).n,0);assert.equal((await f.core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);
 }finally{f.close();}
});
test('private read rejects a revocation that commits after capture, and Core writes are fenced during cross-store work',async()=>{
 const f=await splitFixture();try{const a=await actor(f);const e=splitEngine({...f,hook:async step=>{if(step==='read-captured')await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').bind(new Date().toISOString(),a.proof.sid).run();}});await assert.rejects(e.read([stmt('SELECT name FROM activities')],a.proof),{code:'SESSION_ENDED'});
 const b=await actor(f);await assert.rejects(splitEngine({...f,hook:async step=>{if(step==='admitted')await assert.rejects(f.core.prepare('UPDATE accounts SET revision=revision+1 WHERE account_id=?').bind(b.proof.accountId).run(),/split_write_busy/);if(step==='planned')throw Error('stop');}}).write(edits(f),b.proof));await splitEngine(f).recover();
 }finally{f.close();}
});
test('bulk definition copies remain bounded and do not create one D1 write per row',async()=>{
 const {compilePlan}=await import('../src/academy/separation/compile.js'),f=await splitFixture();try{
 const rows=Array.from({length:100},(_,i)=>({id:'bulk-'+i,title:'Bulk '+i})),now=new Date().toISOString(),plan=await compilePlan(f.core,f.admin,[stmt("INSERT INTO academy_announcements(announcement_id,title,message,active,display_order,revision,created_at,updated_at,updated_by) SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),'Synthetic only',1,0,1,?,?,? FROM json_each(?)",now,now,f.actors.global,JSON.stringify(rows))]);assert.equal(plan.admin.length,1);assert.equal(plan.core.length,1);const a=await actor(f);await splitEngine(f).write([stmt("INSERT INTO academy_announcements(announcement_id,title,message,active,display_order,revision,created_at,updated_at,updated_by) SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),'Synthetic only',1,0,1,?,?,? FROM json_each(?)",now,now,f.actors.global,JSON.stringify(rows))],a.proof);assert.equal((await f.admin.prepare("SELECT count(*) n FROM academy_announcements WHERE announcement_id LIKE 'bulk-%'").first()).n,100);
 }finally{f.close();}
});
for(const point of ['planned','admin-applied','core-committed'])test('feature receipts capture both AFTER states and recover interruption at '+point,async()=>{
 const f=await splitFixture();try{const a=await actor(f),operation=crypto.randomUUID(),old=(await f.core.prepare('SELECT latest_publication_id FROM program_publication_state WHERE activity_key=?').bind(f.scopes.programA).first()).latest_publication_id;
  const list=[stmt('UPDATE activities SET name=? WHERE activity_key=?','Private after value',f.scopes.programA),stmt('UPDATE program_publication_state SET latest_publication_id=NULL WHERE activity_key=?',f.scopes.programA),stmt("INSERT INTO operation_receipts VALUES('SPLIT_FEATURE_TEST',?,?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',json_set('{}','$._acceptedChange',json_object('privateName',(SELECT name FROM activities WHERE activity_key=?),'corePublication',(SELECT latest_publication_id FROM program_publication_state WHERE activity_key=?))),?,?)",f.scopes.programA,operation,f.scopes.programA,f.scopes.programA,f.actors.global,new Date().toISOString())];
  let stopped=false;const e=splitEngine({...f,hook:async step=>{if(step===point&&!stopped){stopped=true;throw Error('Synthetic feature transport failure');}}});if(point==='core-committed')await e.write(list,a.proof);else await assert.rejects(e.write(list,a.proof));await splitEngine(f).recover();
  const row=await f.core.prepare("SELECT result_json FROM operation_receipts WHERE dataset_key='SPLIT_FEATURE_TEST' AND operation_id=?").bind(operation).first();
  if(point==='planned'){assert.equal(row,null);assert.equal((await f.core.prepare('SELECT latest_publication_id FROM program_publication_state WHERE activity_key=?').bind(f.scopes.programA).first()).latest_publication_id,old);}
  else{const change=JSON.parse(row.result_json)._acceptedChange;assert.equal(change.privateName,'Private after value');assert.equal(change.corePublication,null);assert.equal((await f.admin.prepare("SELECT count(*) n FROM operation_receipts WHERE dataset_key='SPLIT_FEATURE_TEST'").first()).n,0);}
  for(const db of [f.core,f.admin])assert.equal((await db.prepare('SELECT count(*) n FROM split_command_parts').first()).n,0);
 }finally{f.close();}
});
