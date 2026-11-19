import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {canonical} from '../codec.mjs';
import {policySchemaSQL,validatePolicy,seedPolicy,registerPolicySuccessor,stagePolicy,confirmPolicyHistory,registerFamilyPolicy,prepareFamilyPolicy,applyFamilyPolicy} from '../policy.mjs';

const epoch='policy-z-configured';
const target=(revision,minutes,ownerEpoch=epoch)=>({type:'policy',policyId:'session-inactivity',ownerEpoch,revision,inactivityMinutes:minutes});
async function setup(){
 const f=await fixture('studio',{policyEpoch:epoch});f.raw.exec(policySchemaSQL);
 await seedPolicy(f.store,{ownerEpoch:epoch,receiptRef:'configured-genesis-receipt',now:f.now});

 return f;
}
async function confirm(f,revision,{ownerEpoch=epoch,receiptRef='coverage-'+ownerEpoch+'-'+revision,now=f.now}={}){
 return confirmPolicyHistory(f.store,{trustedCoverage:{schema:2,env:'production',sourceApp:'academy',targetApp:'studio',mode:'VERIFIED_SNAPSHOT',ownerEpoch,throughRevision:revision,receiptRef},now});
}
async function update(f,revision,minutes,{coherent=true,now=f.now,ownerEpoch=epoch}={}){
 await stagePolicy(f.store,{target:target(revision,minutes,ownerEpoch),now});
 if(coherent)await confirm(f,revision,{ownerEpoch,now});
}
const family=f=>f.store.family(f.sid);
const parent=f=>f.store.first('SELECT * FROM jwt_v2_parents WHERE psid=?',f.psid);

test('inactivity policy range is whole minutes15..200, with default90',async()=>{
 const f=await setup();assert.equal(f.raw.prepare('SELECT minutes FROM jwt_v2_policy_history').get().minutes,90);
 for(const value of [0,-1,14,201,15.1,Infinity,NaN,'90'])assert.throws(()=>validatePolicy(target(2,value)),/INVALID_INACTIVITY_POLICY/);
 for(const value of [15,90,200])assert.equal(validatePolicy(target(2,value)).inactivityMinutes,value);
});

test('a shorter elapsed limit locks once and persists local-parent/intent barriers',async()=>{
 const f=await setup(),intent=await f.store.intent({sid:f.sid,csrfHash:'synthetic-csrf',now:f.now});
 await update(f,2,15);const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.now+900);
 assert.equal((await parent(f)).state,'LOCKED');assert.equal((await family(f)).state,'LOCKED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents WHERE intent_id=?').get(intent.intent_id).state,'CANCELLED');
 assert.equal((await family(f)).last_refresh,f.now);assert.equal((await family(f)).vat,f.now);
 const before=f.metrics.batches,again=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1201});
 assert.equal(again.changed,false);assert.equal(f.metrics.batches,before);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_policy_publications').get().n,1);
});

test('a shorter unexpired policy changes the same foreground-clock deadline without resetting it',async()=>{
 const f=await setup();await update(f,2,15);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+600});
 assert.equal(result.state,'UNLOCKED');assert.equal(result.idleUntil,f.now+900);
 assert.equal((await family(f)).last_refresh,f.now);assert.equal((await parent(f)).foreground_at,f.now);
 assert.equal((await family(f)).deadline,f.deadline);
});

test('a longer policy extends only an unexpired unlocked family, never its validation lease',async()=>{
 const f=await setup();await update(f,2,200);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+300});
 assert.equal(result.state,'UNLOCKED');assert.equal(result.idleUntil,f.now+12000);
 const row=await family(f);assert.equal(row.last_refresh,f.now);assert.equal(row.vat,f.now);assert.equal(row.deadline,f.deadline);
 assert.equal(row.s_exp,f.binding.s_exp);assert.equal((await parent(f)).foreground_at,f.now);
});

test('existing idle expiry is tested before a later longer policy and cannot be revived',async()=>{
 const f=await setup();await update(f,2,200);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.idleUntil});
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.idleUntil);
 assert.equal((await parent(f)).state,'LOCKED');
 await update(f,3,200,{now:f.idleUntil+1});
 const later=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.idleUntil+1});
 assert.equal(later.state,'LOCKED');assert.equal(later.idleUntil,f.idleUntil);
});

test('existing local parent lock is inherited before evaluating an unexpired family',async()=>{
 const f=await setup();f.raw.prepare("UPDATE jwt_v2_parents SET state='LOCKED'").run();await update(f,2,200);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+60});
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.idleUntil);
});

test('an original seven-day deadline remains absolute even when the latest foreground refresh is recent',async()=>{
 const f=await setup(),late=f.binding.s_exp-100;
 f.raw.prepare('UPDATE jwt_v2_families SET last_refresh=?,idle_until=s_exp,cr=cr+1 WHERE sid=?').run(late,f.sid);
 f.raw.prepare('UPDATE jwt_v2_parents SET foreground_at=?').run(late);
 await update(f,2,200,{now:late+10});
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:late+10});
 assert.equal(result.state,'UNLOCKED');assert.equal(result.idleUntil,f.binding.s_exp);
 assert.equal((await family(f)).s_exp,f.binding.s_exp);assert.equal((await family(f)).deadline,f.deadline);
 const ended=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.binding.s_exp});
 assert.equal(ended.state,'EXPIRED');assert.equal((await parent(f)).state,'EXPIRED');
});

test('an already revoked predecessor never revives or newly locks a recovered parent',async()=>{
 const f=await setup();await f.store.terminate(f.sid,{operationId:crypto.randomUUID()});await update(f,2,200);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+60});
 assert.equal(result.state,'REVOKED');assert.equal((await parent(f)).state,'UNLOCKED');
 assert.equal(result.idleUntil,f.idleUntil);
});

test('a gapped shorter update enforces denial without marking the missing history complete',async()=>{
 const f=await setup();await update(f,3,15,{coherent:false});
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});
 assert.equal(result.state,'LOCKED');assert.equal(result.historyComplete,false);assert.equal(result.appliedRevision,1);
 assert.equal(result.requiresReconciliation,true);assert.equal((await family(f)).authority_ready,0);
 await assert.rejects(confirm(f,3),/POLICY_HISTORY_GAP/);
});

test('gapped longer update cannot lengthen; reconciling an intervening elapsed shorter limit keeps the lock',async()=>{
 const f=await setup();await update(f,3,200,{coherent:false});
 let result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+600});
 assert.equal(result.idleUntil,f.idleUntil);assert.equal(result.appliedRevision,1);assert.equal(result.historyComplete,false);
 await stagePolicy(f.store,{target:target(2,15),now:f.now+1200});await confirm(f,3,{now:f.now+1200});
 result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.now+900);assert.equal(result.appliedRevision,3);
 assert.equal(result.historyComplete,true);assert.equal((await family(f)).authority_ready,0,'policy completion cannot clear unrelated generic dirty authority');
});

test('coherent successive policies apply in order; a later lengthening cannot undo an elapsed shorter transition',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:target(2,15),now:f.now});
 await stagePolicy(f.store,{target:target(3,200),now:f.now});await confirm(f,3);
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.now+900);
 assert.deepEqual(result.enforcedPolicies.map(p=>p.revision),[2,3]);
});

test('unknown epoch cannot establish policy order or enable a family',async()=>{
 const f=await setup();await assert.rejects(stagePolicy(f.store,{target:target(1,15,'unregistered-epoch'),now:f.now}),/EPOCH_RECONCILIATION/);
 assert.equal((await family(f)).idle_until,f.idleUntil);
});

test('explicit predecessor bridge, not lexical epoch comparison, carries prior shorter history',async()=>{
 const f=await setup(),successor='policy-a-successor';
 await registerPolicySuccessor(f.store,{ownerEpoch:successor,baseRevision:1,minutes:200,predecessorEpoch:epoch,predecessorFinalRevision:2,receiptRef:'authenticated-bridge',now:f.now});
 await assert.rejects(confirm(f,1,{ownerEpoch:successor}),/BRIDGE_REQUIRED/);
 await stagePolicy(f.store,{target:target(2,15),now:f.now});await confirm(f,2);
 await confirm(f,1,{ownerEpoch:successor});
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});
 assert.equal(result.appliedEpoch,successor);assert.equal(result.appliedRevision,1);
 assert.equal(result.state,'LOCKED');assert.equal(result.idleUntil,f.now+900);
});

test('same revision conflicting values and conflicting coverage receipts are rejected',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:target(2,15),now:f.now});
 await assert.rejects(stagePolicy(f.store,{target:target(2,200),now:f.now}),/REVISION_CONFLICT/);
 await confirm(f,2,{receiptRef:'fixed-coverage'});
 await update(f,3,200);
 assert.equal((await confirm(f,2,{receiptRef:'fixed-coverage'})).confirmed,false);
 await assert.rejects(confirm(f,3,{receiptRef:'fixed-coverage'}),/COVERAGE_CONFLICT/);
});

test('policy arrival racing the prepared family transition fails CAS without partial writes',async()=>{
 const f=await setup();await update(f,2,15);
 const prepared=await prepareFamilyPolicy(f.store,{sid:f.sid,now:f.now+300});
 await stagePolicy(f.store,{target:target(3,200),now:f.now+300});
 await assert.rejects(f.store.batch(prepared.statements));
 assert.equal((await family(f)).idle_until,f.idleUntil);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_policy_publications').get().n,0);
});

test('failed lock persistence rolls back parent, family, intent and publication effects and denies',async()=>{
 const f=await setup();await update(f,2,15);
 const intent=await f.store.intent({sid:f.sid,csrfHash:'synthetic-csrf',now:f.now});
 await assert.rejects(applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200,publicationPlan:({store})=>[store.stmt('INSERT INTO jwt_v2_guards VALUES(?,0)',crypto.randomUUID())]}),{code:'POLICY_PERSISTENCE_UNAVAILABLE',status:503});
 assert.equal((await family(f)).state,'UNLOCKED');assert.equal((await parent(f)).state,'UNLOCKED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents WHERE intent_id=?').get(intent.intent_id).state,'ISSUED');
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_policy_publications').get().n,0);
});

test('publication hook and durable job carry exact policy target in the same transaction',async()=>{
 const f=await setup();await update(f,2,15);let seen;
 f.raw.exec('CREATE TABLE fixture_policy_receipts(job_id TEXT PRIMARY KEY,target_json TEXT,expected_cr INTEGER)');
 const result=await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+300,publicationPlan:info=>{
  seen=info;return [info.store.stmt('INSERT INTO fixture_policy_receipts VALUES(?,?,?)',info.jobId,canonical(info.target),info.expectedCR)];
 }});
 assert.deepEqual(result.target,target(2,15));assert.equal(seen.expectedCR,(await family(f)).cr);
 const job=f.raw.prepare('SELECT * FROM jwt_v2_policy_publications').get();
 assert.equal(job.target_json,canonical(target(2,15)));assert.equal(job.state,'PENDING');assert.equal(job.expected_cr,(await family(f)).cr);
 assert.equal(f.raw.prepare('SELECT target_json FROM fixture_policy_receipts').get().target_json,job.target_json);
});
