import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Bucket,FixtureSecurityCache} from '../test/helpers.mjs';
import {canonical} from '../codec.mjs';
import {selector} from '../http-context.mjs';
import {stagePolicy,confirmPolicyHistory,applyFamilyPolicy} from '../policy.mjs';
import {verifiedPolicyCoverage} from '../policy-coverage.mjs';
const target=(revision,minutes)=>({type:'policy',policyId:'session-inactivity',ownerEpoch:'policy-epoch',revision,inactivityMinutes:minutes});
async function fixtureUnlock(){
 const f=await fixture(),bucket=new Bucket(),cache=new FixtureSecurityCache({bucket,store:f.store,prefix:f.store.securityPrefix,generation:'generation1'});
 await stagePolicy(f.store,{target:target(2,15),now:f.now});await stagePolicy(f.store,{target:target(3,200),now:f.now});
 await confirmPolicyHistory(f.store,{trustedCoverage:{schema:2,env:'production',sourceApp:'academy',targetApp:'studio',mode:'VERIFIED_SNAPSHOT',ownerEpoch:'policy-epoch',throughRevision:3,receiptRef:'source-verified-history'},now:f.now+1});
 await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+1200});assert.equal((await f.store.family(f.sid)).state,'LOCKED');
 const original=JSON.parse((await f.store.family(f.sid)).binding_json),expected=selector(original,'studio'),binding={...original,sv:original.sv+1,ue:original.ue+1},tx=crypto.randomUUID(),op=crypto.randomUUID(),at=f.now+1300;
 assert.equal(Object.keys(expected).length,11);assert.equal(Object.hasOwn(expected,'s_iat'),false);assert.equal(Object.hasOwn(expected,'s_exp'),false);
 f.raw.prepare("UPDATE jwt_v2_families SET state='UNLOCKED',sv=?,ue=?,last_refresh=?,idle_until=?,authority_ready=0,cr=cr+1,binding_json=? WHERE sid=?").run(binding.sv,binding.ue,at,at+12000,canonical(binding),f.sid);
 f.raw.prepare("INSERT INTO jwt_v2_ceremony_pending(tx,purpose,expected_json,sub,expires_at,csrf_hash,operation_id,status) VALUES(?,'unlock',?,?,?,?,?,'COMMITTED')").run(tx,canonical(expected),f.sub,at+60,'synthetic-purpose-csrf',op);
 const id=crypto.randomUUID(),result={status:'COMMITTED',state:'UNLOCKED',sid:f.sid,ue:binding.ue,sv:binding.sv,s_exp:f.binding.s_exp,operationId:op};f.raw.prepare('INSERT INTO jwt_v2_ceremony_consumed VALUES(?,?,?,?,?,?)').run(id,tx,op,'a'.repeat(64),canonical(result),at);
 await cache.seed('control/app');await cache.seed('security/session/'+f.sid);
 await cache.publish('control/app',async()=>({cr:1,app:'studio',env:'production',policyEpoch:'policy-epoch',policyRevision:3,inactivityMinutes:200,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2}));
 const row=await f.store.family(f.sid),projection=await cache.publish('security/session/'+f.sid,async()=>({...JSON.parse(row.projection_json),cr:row.cr,app:'studio',env:'production',localState:'UNLOCKED',authorityReady:false,binding,s_exp:row.s_exp,validationDeadline:row.deadline,idleUntil:row.idle_until,timedUntil:row.s_exp,policyEpoch:'policy-epoch',policyRevision:3,inactivityMinutes:200,rightsKey:cache.prefix+'rights/synthetic'}));
 return {...f,expected,projection,result,id,tx,coverage:()=>verifiedPolicyCoverage(f.store,{target:target(2,15),projection,sid:f.sid})};
}
test('real HTTP 11-field pending selector permits committed later unlock coverage without JWT clock claims',async()=>{
 const f=await fixtureUnlock();assert.equal(await f.coverage(),true);f.raw.close();
});
test('wrong app, extra JWT claims or altered immutable selector cannot certify a policy unlock',async()=>{
 for(const change of [e=>({...e,app:'hifz'}),e=>({...e,s_exp:123,s_iat:1}),e=>({...e,psid:crypto.randomUUID()}),e=>({...e,ce:e.ce+1})]){
  const f=await fixtureUnlock();f.raw.prepare('UPDATE jwt_v2_ceremony_pending SET expected_json=? WHERE tx=?').run(canonical(change(f.expected)),f.tx);assert.equal(await f.coverage(),false);f.raw.close();
 }
});
test('matching pending selector still requires original expiry and exact committed operation receipt',async()=>{
 for(const change of [r=>({...r,s_exp:r.s_exp+1}),r=>({...r,operationId:crypto.randomUUID()}),r=>({...r,state:'LOCKED'})]){
  const f=await fixtureUnlock();f.raw.prepare('UPDATE jwt_v2_ceremony_consumed SET result_json=? WHERE tx=?').run(canonical(change(f.result)),f.tx);assert.equal(await f.coverage(),false);f.raw.close();
 }
});
