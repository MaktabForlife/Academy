import test from 'node:test';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {actorProof} from '../src/academy/separation/proof.js';

async function actor(f,who='global'){
 const repository=academyD1Repository({...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_SPLIT_COORDINATOR:f.namespace});
 const state=await repository.byId(f.actors[who]),session=await repository.createSession(state,state.contexts[0]);
 return actorProof({state,user:{accountid:state.account.account_id},sid:session.sid});
}
const statements=[{sql:'SELECT name FROM activities ORDER BY activity_key',params:[]}];
async function use(run){const f=await splitFixture();try{await run(f);}finally{f.close();}}
function traced(f,hook){
 const sql=[],core=new Proxy(f.core,{get(target,name){if(name==='prepare')return text=>{sql.push(text);return target.prepare(text);};const v=target[name];return typeof v==='function'?v.bind(target):v;}});
 return {engine:splitEngine({...f,core,hook}),sql,full:()=>sql.filter(s=>s.includes(' roles_json')).length};
}
test('consecutive coordinator reads reuse only an internally verified exact actor proof',()=>use(async f=>{
 const proof=await actor(f),t=traced(f),first=await t.engine.read(statements,proof);
 for(let i=0;i<9;i++)assert.deepEqual(await t.engine.read(statements,proof),first);
 assert.equal(t.full(),1,'Ten unchanged reads build roles/subscriptions once');
 assert.equal(t.sql.filter(s=>s.includes('v.version=?4')).length,19,'Every read still checks live access before and after capture');
 await assert.rejects(t.engine.read(statements,{...proof,signature:'[false,[],[],[]]',version:await f.core.prepare('SELECT version FROM split_read_state').first('version')}),{code:'SESSION_ENDED'});
 assert.equal(t.full(),2,'A supplied version cannot verify a different signature');
 const other=await actor(f,'teacherA');await t.engine.read(statements,other);assert.equal(t.full(),3,'Another actor/session needs a full proof');
 await t.engine.read(statements,proof);assert.equal(t.full(),4,'Creating another session changed Core, invalidating the previous version');
 await t.engine.read(statements,proof);assert.equal(t.full(),4);
 await splitEngine(f).read(statements,proof); // A restart needs no persisted cache.
}));

const mutations={
 'session revocation':(f,p)=>f.core.prepare("UPDATE account_sessions SET revoked_at='2026-01-01T00:00:00.000Z' WHERE session_id=?").bind(p.sid).run(),
 'account disable':(f,p)=>f.core.prepare('UPDATE accounts SET active=0 WHERE account_id=?').bind(p.accountId).run(),
 'credential epoch':(f,p)=>f.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').bind(p.accountId).run(),
 'PIN removal':(f,p)=>f.core.prepare("UPDATE account_credentials SET pin_hash='',pin_setup=0 WHERE account_id=?").bind(p.accountId).run(),
 'global Admin removal':(f,p)=>f.core.prepare('UPDATE global_role_assignments SET active=0 WHERE account_id=?').bind(p.accountId).run()
};
for(const [name,change] of Object.entries(mutations))test('warm coordinator proofs reject '+name,()=>use(async f=>{
 const proof=await actor(f),t=traced(f);await t.engine.read(statements,proof);await change(f,proof);
 await assert.rejects(t.engine.read(statements,proof),{code:'SESSION_ENDED'});assert.equal(t.full(),2);
}));
test('warm proofs recheck scoped roles, subscriptions and activity lifecycle after writes',()=>use(async f=>{
 const proof=await actor(f,'teacherA'),t=traced(f);await t.engine.read(statements,proof);
 await f.core.prepare('UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?').bind(proof.accountId,f.scopes.programA).run();
 await assert.rejects(t.engine.read(statements,proof),{code:'SESSION_ENDED'});
 const refreshed=await actor(f,'teacherA');await t.engine.read(statements,refreshed);
 await f.core.prepare("INSERT INTO course_subscription_decisions(account_id,activity_key,active,revision,updated_at,updated_by_account_id) VALUES(?,?,1,1,?,?)").bind(refreshed.accountId,f.scopes.courseB,new Date().toISOString(),f.actors.global).run();
 await assert.rejects(t.engine.read(statements,refreshed),{code:'SESSION_ENDED'});
 const subscribed=await actor(f,'teacherA');await t.engine.read(statements,subscribed);
 await f.core.prepare("UPDATE activities SET lifecycle='ARCHIVED' WHERE activity_key=?").bind(f.scopes.courseA).run();
 await assert.rejects(t.engine.read(statements,subscribed),{code:'SESSION_ENDED'});
}));
test('warm coordinator proofs reject clock-only expiry and timed substitute changes',()=>use(async f=>{
 const start=Date.now();let instant=new Date(start).toISOString();
 f.databases.core.function('strftime',{varargs:true},()=>instant);
 const proof=await actor(f),t=traced(f);
 await f.core.prepare('UPDATE account_sessions SET expires_at=? WHERE session_id=?').bind(new Date(start+60000).toISOString(),proof.sid).run();
 await t.engine.read(statements,proof);
 instant=new Date(start+61000).toISOString();await assert.rejects(t.engine.read(statements,proof),{code:'SESSION_ENDED'});
 const teacher=await actor(f,'teacherA');
 await f.core.prepare("INSERT INTO attendance_substitutes(assignment_id,activity_key,attendance_date,stable_key,account_id,starts_at,first_until,correction_until,created_at,created_by) VALUES('read-proof-substitute',?,'2026-10-27','synthetic',?,?,?,?,?,?)")
  .bind(f.scopes.programA,teacher.accountId,new Date(start+120000).toISOString(),new Date(start+180000).toISOString(),new Date(start+240000).toISOString(),instant,f.actors.global).run();
 await t.engine.read(statements,teacher);
 instant=new Date(start+121000).toISOString();await assert.rejects(t.engine.read(statements,teacher),{code:'SESSION_ENDED'},'Grant activation requires a refreshed proof even without a write');
 const active=await actor(f,'teacherA');await t.engine.read(statements,active);
 instant=new Date(start+241000).toISOString();await assert.rejects(t.engine.read(statements,active),{code:'SESSION_ENDED'},'Grant expiry also requires a refreshed proof');
}));
test('warm reads reject revocation after capture, and writes always rebuild authority',()=>use(async f=>{
 const proof=await actor(f);let revoke=false;
 const t=traced(f,async step=>{if(step==='read-captured'&&revoke){revoke=false;await mutations['session revocation'](f,proof);}});
 await t.engine.read(statements,proof);revoke=true;await assert.rejects(t.engine.read(statements,proof),{code:'SESSION_ENDED'});
 const fresh=await actor(f);await t.engine.read(statements,fresh);const before=t.full();
 await t.engine.write([{sql:'UPDATE activities SET name=? WHERE activity_key=?',params:['Synthetic renamed area',f.scopes.courseA]}],fresh);
 assert.equal(t.full(),before+1,'Write admission never trusts the read cache');
}));
test('verification hints are bounded and lost safely on eviction/restart',()=>use(async f=>{
 const proof=await actor(f),t=traced(f),copy=[];
 for(let i=0;i<129;i++){
  const sid='read-cache-'+i;
  await f.core.prepare('INSERT INTO account_sessions SELECT ?,account_id,credential_epoch,created_at,expires_at,revoked_at FROM account_sessions WHERE session_id=?').bind(sid,proof.sid).run();
  copy.push({...proof,sid});
 }
 for(const p of copy)await t.engine.read(statements,p);
 assert.equal(t.full(),129);
 await t.engine.read(statements,copy.at(-1));assert.equal(t.full(),129);
 await t.engine.read(statements,copy[0]);assert.equal(t.full(),130,'The oldest entry was evicted');
 const restarted=traced(f);await restarted.engine.read(statements,copy[0]);assert.equal(restarted.full(),1);
}));
