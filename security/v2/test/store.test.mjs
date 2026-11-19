import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {fingerprint,opaque,canonical} from '../codec.mjs';
import {targeted} from '../store.mjs';
async function rotation(f,intent){
 const next={...f.binding,sv:2,vat:f.now+10};
 return {sid:f.sid,fingerprint:f.fp,intentId:intent.intent_id,csrfHash:'csrf-digest',expectedBinding:f.binding,successorFingerprint:await fingerprint(opaque(),f.config),nextBinding:next,capture:{...f.capture,vat:f.now+10,primaryCheckedAt:f.now+10},nextProjection:{...f.projection,binding:next},now:f.now+10,idleUntil:f.now+5410,deadline:f.now+910,qualifyingActivity:true,vectorGuards:[['test:scope','ACCOUNT:SYNTHETIC-ACCOUNT','owner-epoch',1]]};
}
test('one guarded refresh wins concurrent requests, losers set no cookies',async()=>{
 const f=await fixture(),intent=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now});
 const params=await rotation(f,intent),results=await Promise.all(Array.from({length:8},()=>f.store.rotate(params)));
 assert.equal(results.filter(r=>r.winner).length,1);assert(results.filter(r=>!r.winner).every(r=>r.cookies===false));
 assert.equal((await f.store.family(f.sid)).sv,2);assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_refresh_history').get().n,1);
 const rows=f.raw.prepare('SELECT * FROM jwt_v2_operations').all();assert(!JSON.stringify(rows).includes(params.successorFingerprint));
});
test('current activity is tested before credit; expired idle cannot renew',async()=>{
 const f=await fixture(),intent=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),params=await rotation(f,intent);
 const r=await f.store.rotate({...params,now:f.idleUntil});assert.equal(r.winner,false);assert.equal(r.cookies,false);
});
test('termination resolves outstanding intents; old operation harmless while terminal denies authority',async()=>{
 const f=await fixture(),i=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),params=await rotation(f,i);
 await f.store.terminate(f.sid,{operationId:crypto.randomUUID()});
 const r=await f.store.rotate(params);assert.equal(r.winner,false);assert.equal(r.cookies,false);
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents').get().state,'CANCELLED');
 assert.throws(()=>f.raw.prepare("UPDATE jwt_v2_families SET state='UNLOCKED',cr=cr+1 WHERE sid=?").run(f.sid),/terminal/);
});
test('terminal state does not exempt proven unexplained spent-token reuse',async()=>{
 const f=await fixture(),i=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now});
 await f.store.rotate(await rotation(f,i));await f.store.terminate(f.sid,{operationId:crypto.randomUUID()});
 const request={fingerprint:f.fp,binding:f.binding,csrfHash:'csrf-digest',now:f.now+20};
 assert.equal((await f.store.classifyReuse({...request,intentId:i.intent_id})).incidentEligible,false);
 assert.equal((await f.store.classifyReuse({...request,intentId:crypto.randomUUID()})).incidentEligible,true);
 assert.equal((await f.store.classifyReuse({...request,intentId:crypto.randomUUID(),csrfHash:'wrong'})).incidentEligible,false);
 assert.equal((await f.store.classifyReuse({...request,intentId:crypto.randomUUID(),now:f.binding.s_exp})).incidentEligible,false);
});
test('joint ce/ae acceptance is idempotent and delayed old report preserves a recovered pair',async()=>{
 const f=await fixture('academy'),op=crypto.randomUUID(),args={sub:f.sub,ce:4,ae:9,operationId:op,kind:'VERIFIED_REFRESH_REUSE',now:f.now};
 const a=await f.store.acceptCutoff(args);assert.equal(a.status,'ACCEPTED');assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_outbox').get().n,2);
 assert.deepEqual(await f.store.acceptCutoff(args),a);assert.equal(f.raw.prepare('SELECT ae FROM jwt_v2_accounts').get().ae,10);
 const older=await f.store.acceptCutoff({...args,operationId:crypto.randomUUID()});assert.equal(older.status,'ALREADY_COVERED');
 f.raw.prepare('UPDATE jwt_v2_accounts SET ce=5,ae=9').run();
 const delayed=await f.store.acceptCutoff({...args,operationId:crypto.randomUUID()});assert.equal(delayed.status,'ALREADY_COVERED');
 assert.deepEqual({...f.raw.prepare('SELECT ce,ae FROM jwt_v2_accounts').get()},{ce:5,ae:9});
 assert.equal(targeted({sub:f.sub,ce:5,ae:9},a.cutoff),false);
 await assert.rejects(f.store.acceptCutoff({...args,kind:'VOLUNTARY_LOGOUT'}),/CONFLICT/);
});
test('guard/CAS failure rolls back history and operation capture',async()=>{
 const f=await fixture(),i=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),p=await rotation(f,i);
 f.raw.prepare('UPDATE jwt_v2_accounts SET ae=10').run();
 await assert.rejects(f.store.rotate(p));assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_refresh_history').get().n,0);
 assert.equal((await f.store.family(f.sid)).fingerprint,f.fp);
});
test('family binding and original deadline are immutable in SQL',async()=>{
 const f=await fixture();for(const column of ['sub','psid','bsid','s_exp'])assert.throws(()=>f.raw.prepare('UPDATE jwt_v2_families SET '+column+'=?,cr=cr+1 WHERE sid=?').run(column==='s_exp'?f.binding.s_exp+1:'other',f.sid));
});

test('background renewal cannot credit foreground activity',async()=>{
 const f=await fixture(),intent=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),p=await rotation(f,intent);
 const r=await f.store.rotate({...p,qualifyingActivity:false,idleUntil:f.idleUntil});
 assert.equal(r.winner,true);assert.equal((await f.store.family(f.sid)).last_refresh,f.now);
});
test('pending native Core split fence prevents new renewal lease',async()=>{
 const f=await fixture('academy'),intent=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),p=await rotation(f,intent);
 f.raw.prepare('INSERT INTO split_write_fence VALUES(1,?,0)').run(crypto.randomUUID());
 await assert.rejects(f.store.rotate(p));assert.equal((await f.store.family(f.sid)).sv,1);
});


test('unrelated guards cannot clear dirty authority with stale rights/vector',async()=>{
 const f=await fixture(),i=await f.store.intent({sid:f.sid,csrfHash:'csrf-digest',now:f.now}),p=await rotation(f,i);
 f.raw.prepare("UPDATE jwt_v2_dependencies SET revision=2 WHERE id='test:scope'").run();
 f.raw.prepare("UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?").run(f.sid);
 f.raw.prepare("INSERT INTO jwt_v2_dependencies VALUES('unrelated','GLOBAL','owner-epoch',1)").run();
 await assert.rejects(f.store.rotate({...p,vectorGuards:[['unrelated','GLOBAL','owner-epoch',1]]}),/COVERAGE_MISMATCH/);
 assert.equal((await f.store.family(f.sid)).authority_ready,0);
 await assert.rejects(f.store.rotate({...p,vectorGuards:[['test:scope','ACCOUNT:SYNTHETIC-ACCOUNT','owner-epoch',2]]}),/VECTOR_BINDING/);
});

test('global cutoff cancels pending PIN work without clearing wrong-PIN pause state',async()=>{
 const f=await fixture('academy');
 f.raw.prepare('INSERT INTO jwt_v2_pin_gates(sub,generation,failures,paused_until,reservation,reservation_until) VALUES(?,4,5,?,?,?)').run(f.sub,f.now+900,crypto.randomUUID(),f.now+5);
 f.raw.prepare("INSERT INTO jwt_v2_ceremony_attempts(attempt_id,tx,sub,credential_epoch,gate_generation,csrf_hash,status,expires_at) VALUES(?,?,?,4,4,'test','RESERVED',?)").run(crypto.randomUUID(),crypto.randomUUID(),f.sub,f.now+60);
 await f.store.acceptCutoff({sub:f.sub,ce:4,ae:9,operationId:crypto.randomUUID(),kind:'VOLUNTARY_LOGOUT',now:f.now});
 const gate=f.raw.prepare('SELECT * FROM jwt_v2_pin_gates').get();
 assert.equal(gate.failures,5);assert.equal(gate.paused_until,f.now+900);assert.equal(gate.reservation,null);
 assert.equal(f.raw.prepare('SELECT status FROM jwt_v2_ceremony_attempts').get().status,'CANCELLED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_parents').get().state,'REVOKED');
});

test('temporary rights expiry cannot be extended by omitting or enlarging the captured bound',async()=>{
 const f=await fixture(),intent=await f.store.intent({sid:f.sid,csrfHash:'timed-csrf',now:f.now});
 const nextBinding={...f.binding,sv:2},nextProjection={...f.projection,binding:nextBinding};
 const args={sid:f.sid,fingerprint:f.fp,intentId:intent.intent_id,csrfHash:'timed-csrf',expectedBinding:f.binding,successorFingerprint:'e'.repeat(64),nextBinding,nextProjection,now:f.now,idleUntil:f.idleUntil,deadline:f.deadline,vectorGuards:f.vectorGuards,qualifyingActivity:true,capture:{...f.capture,timedUntil:f.now+100}};
 await assert.rejects(f.store.rotate(args),/CAPTURE_TIMED_BOUND/);
 await assert.rejects(f.store.rotate({...args,nextProjection:{...nextProjection,timedUntil:f.now+100}}),/TIMED_AUTHORITY/);
 assert.equal((await f.store.family(f.sid)).fingerprint,f.fp);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_refresh_history').get().n,0);
 const r=await f.store.rotate({...args,nextProjection:{...nextProjection,timedUntil:f.now+100},deadline:f.now+100});
 assert.equal(r.winner,true);assert.equal((await f.store.family(f.sid)).deadline,f.now+100);assert.equal((await f.store.family(f.sid)).s_exp,f.binding.s_exp);
});
