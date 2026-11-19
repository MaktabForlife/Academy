import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Bucket} from './helpers.mjs';
import {FixtureSecurityCache as SecurityCache} from './helpers.mjs';
import {canonical} from '../codec.mjs';
import {verifiedPolicyCoverage} from '../policy-coverage.mjs';
import {restrictionPlan,markSessionCovered,markControlCovered,worksetApplied} from '../publication.mjs';
import {stagePolicy,confirmPolicyHistory,applyFamilyPolicy,registerPolicySuccessor} from '../policy.mjs';
const policy=(revision,minutes,ownerEpoch='policy-epoch')=>({type:'policy',policyId:'session-inactivity',ownerEpoch,revision,inactivityMinutes:minutes});
async function setup(){
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:f.store.securityPrefix,generation:'generation1'});
 await cache.seed('control/app');await cache.seed('security/session/'+f.sid);
 return {...f,bucket,cache,appCR:0};
}
async function confirm(f,revision,{epoch='policy-epoch',ref='coverage-'+epoch+'-'+revision}={}){
 await confirmPolicyHistory(f.store,{trustedCoverage:{schema:2,env:'production',sourceApp:'academy',targetApp:'studio',mode:'VERIFIED_SNAPSHOT',ownerEpoch:epoch,throughRevision:revision,receiptRef:ref},now:f.now+1});
}
async function change(f,revision,minutes,{coherent=true,apply=true,epoch='policy-epoch',now=f.now+10}={}){
 await stagePolicy(f.store,{target:policy(revision,minutes,epoch),now:f.now});
 if(coherent)await confirm(f,revision,{epoch});
 if(apply)await applyFamilyPolicy(f.store,{sid:f.sid,now});
}
async function controls(f){
 const h=await f.store.first('SELECT e.*,p.minutes FROM jwt_v2_policy_heads h JOIN jwt_v2_policy_epochs e ON e.owner_epoch=h.owner_epoch JOIN jwt_v2_policy_history p ON p.owner_epoch=e.owner_epoch AND p.revision=e.highest_seen WHERE h.app=? AND h.env=?',f.store.app,f.store.env);
 const app=await f.cache.publish('control/app',async()=>({cr:++f.appCR,app:'studio',env:'production',policyEpoch:h.owner_epoch,policyRevision:h.highest_seen,inactivityMinutes:h.minutes,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2,enforcedTargets:f.targets||[]}));
 const row=await f.store.family(f.sid),saved=JSON.parse(row.projection_json);
 const session=await f.cache.publish('security/session/'+f.sid,async()=>({...saved,cr:row.cr,app:'studio',env:'production',localState:row.state,authorityReady:Boolean(row.authority_ready),binding:JSON.parse(row.binding_json),s_exp:row.s_exp,validationDeadline:row.deadline,idleUntil:row.idle_until,timedUntil:row.s_exp,policyEpoch:h.owner_epoch,policyRevision:h.highest_seen,inactivityMinutes:h.minutes,rightsKey:f.cache.prefix+'rights/account/hash',enforcedTargets:f.targets||[]}));
 return {app,session};
}
test('configured coherent genesis is covered only by exact published current policy controls',async()=>{
 const f=await setup(),{app,session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:session,sid:f.sid}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:{...app,inactivityMinutes:200}}),false);
});
test('an older duration is subsumed by complete current history and actual applied/published family state',async()=>{
 const f=await setup();await change(f,2,200);const {app,session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:session,sid:f.sid}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,200),projection:session,sid:f.sid}),true);
});
test('arbitrary current declarations, missing coverage receipts and missing history cannot ACK an old duration',async()=>{
 const f=await setup();await change(f,2,200);const {app}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,15),projection:app}),false);
 f.raw.prepare('DELETE FROM jwt_v2_policy_coverage').run();
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),false);
 const g=await setup();await change(g,2,200);const c=await controls(g);g.raw.prepare("DELETE FROM jwt_v2_policy_history WHERE owner_epoch='policy-epoch' AND revision=1").run();
 assert.equal(await verifiedPolicyCoverage(g.store,{target:policy(1,90),projection:c.app}),false);
});
test('a gap never proves subsumption even when a complete newer value has been received',async()=>{
 const f=await setup();const {app}=await controls(f);await change(f,3,200,{coherent:false});
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),false);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(3,200),projection:app}),false);
});
test('coherent app control does not replace the required current family history sidecar',async()=>{
 const f=await setup();await change(f,2,200,{apply:false});
 const h=await f.store.first("SELECT * FROM jwt_v2_family_policy WHERE sid=?",f.sid);assert.equal(h.applied_revision,1);
 // Publish the old committed SID while the app has the new head; it has no
 // current-policy family proof and cannot be counted as subsumed.
 const app=await f.cache.publish('control/app',async()=>({cr:1,app:'studio',env:'production',policyEpoch:'policy-epoch',policyRevision:2,inactivityMinutes:200,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2}));
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),true);
 const original={...f.projection,cr:1,app:'studio',env:'production',localState:'UNLOCKED',authorityReady:true,binding:f.binding,s_exp:f.binding.s_exp,validationDeadline:f.deadline,idleUntil:f.idleUntil,timedUntil:f.binding.s_exp,rightsKey:f.cache.prefix+'rights/account/hash'};
 const sidControl=await f.cache.publish('security/session/'+f.sid,async()=>original);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:sidControl,sid:f.sid}),false);
});
test('shorter elapsed history locks permanently through a later longer policy and the old short target can ACK',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:policy(2,15),now:f.now});await change(f,3,200,{now:f.now+1200});
 const row=await f.store.family(f.sid);assert.equal(row.state,'LOCKED');assert.equal(row.idle_until,f.now+900);
 const {app,session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,15),projection:app}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,15),projection:session,sid:f.sid}),true);
});
test('a claimed unlocked revival without a matching later unlock receipt cannot cover historical lock',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:policy(2,15),now:f.now});await change(f,3,200,{now:f.now+1200});
 f.raw.prepare("UPDATE jwt_v2_families SET state='UNLOCKED',last_refresh=?,idle_until=?,authority_ready=0,cr=cr+1 WHERE sid=?").run(f.now+1300,f.now+13300,f.sid);
 const {session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,15),projection:session,sid:f.sid}),false);
});
test('a matching authenticated local unlock can supersede a correctly preserved historical policy lock',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:policy(2,15),now:f.now});await change(f,3,200,{now:f.now+1200});
 const expected=JSON.parse((await f.store.family(f.sid)).binding_json),binding={...expected,sv:2,ue:1},tx=crypto.randomUUID(),op=crypto.randomUUID(),at=f.now+1300;
 f.raw.prepare("UPDATE jwt_v2_families SET state='UNLOCKED',sv=2,ue=1,last_refresh=?,idle_until=?,authority_ready=0,cr=cr+1,binding_json=? WHERE sid=?").run(at,at+12000,canonical(binding),f.sid);
 f.raw.prepare("INSERT INTO jwt_v2_ceremony_pending(tx,purpose,expected_json,sub,expires_at,csrf_hash,operation_id,status) VALUES(?,'unlock',?,?,?,?,?,'COMMITTED')").run(tx,canonical(expected),f.sub,at+60,'synthetic-csrf',op);
 const result={status:'COMMITTED',state:'UNLOCKED',sid:f.sid,ue:1,sv:2,s_exp:f.binding.s_exp,operationId:op};
 f.raw.prepare('INSERT INTO jwt_v2_ceremony_consumed VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),tx,op,'a'.repeat(64),canonical(result),at);
 const {session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,15),projection:session,sid:f.sid}),true);
 f.raw.prepare("UPDATE jwt_v2_ceremony_pending SET purpose='admission' WHERE tx=?").run(tx);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(2,15),projection:session,sid:f.sid}),false);
});
test('explicit predecessor receipts cover old epochs regardless of lexical UUID/name order',async()=>{
 const f=await setup();await registerPolicySuccessor(f.store,{ownerEpoch:'aaa-before-old-name',minutes:200,predecessorEpoch:'policy-epoch',predecessorFinalRevision:1,receiptRef:'verified-successor-registration',now:f.now});
 await confirm(f,1,{epoch:'aaa-before-old-name'});await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+10});
 // The remaining rights rebuild is intentionally pending; policy coverage does
 // not make this denial record authorising.
 f.raw.prepare('UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?').run(f.sid);
 const {app,session}=await controls(f);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:app}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:session,sid:f.sid}),true);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90,'unknown-even-earlier-name'),projection:app}),false);
});
test('primary cr/state/clock drift and incomplete family history invalidate a previously published SID proof',async()=>{
 const f=await setup();await change(f,2,200);const {session}=await controls(f);
 f.raw.prepare('UPDATE jwt_v2_family_policy SET history_complete=0 WHERE sid=?').run(f.sid);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:session,sid:f.sid}),false);
 f.raw.prepare('UPDATE jwt_v2_family_policy SET history_complete=1 WHERE sid=?').run(f.sid);
 f.raw.prepare('UPDATE jwt_v2_families SET idle_until=idle_until-1,cr=cr+1 WHERE sid=?').run(f.sid);
 assert.equal(await verifiedPolicyCoverage(f.store,{target:policy(1,90),projection:session,sid:f.sid}),false);
});

test('old short policy work reaches APPLIED after coherent longer head without reviving its locked SID',async()=>{
 const f=await setup(),target=policy(2,15),workId=crypto.randomUUID();
 await f.store.batch(await restrictionPlan(f.store,{workId,target,now:f.now,requiredControlKeys:[f.cache.key('control/app')]}));
 await stagePolicy(f.store,{target,now:f.now});await change(f,3,200,{now:f.now+1200});f.targets=[target];
 const {app,session}=await controls(f);
 assert.equal(session.localState,'LOCKED');assert.equal(session.inactivityMinutes,200);
 await markSessionCovered(f.store,{workId,sid:f.sid,projection:session,controlKey:f.cache.key('security/session/'+f.sid),now:f.now+1201});
 assert.equal(await worksetApplied(f.store,workId),false);
 await markControlCovered(f.store,{workId,projection:app,controlKey:f.cache.key('control/app')});
 assert.equal(await worksetApplied(f.store,workId),true);
});
