import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Bucket} from './helpers.mjs';
import {canonical,digest,fingerprint,opaque,vectorDigest} from '../codec.mjs';
import {issuanceFloorSchemaSQL,issuanceFloorGuard,appliedDependencyPlan,scopedVectorId,dependencyScope} from '../issuance-floors.mjs';
import {registerFamilyPolicy,stagePolicy,confirmPolicyHistory,applyFamilyPolicy,registerPolicySuccessor} from '../policy.mjs';
import {captureDDL} from '../capture.mjs';
import {vectorFromGuards} from '../capture-receipt.mjs';
import {SecurityCache} from '../cache.mjs';
import {restrictionPlan,markSessionCovered,worksetApplied} from '../publication.mjs';

const foreignID='academy:native:role_assignments',foreignEpoch='foreign-owner-epoch';
const foreign=(revision=5,effect='INVALIDATE',deniedActions=[])=>({type:'dependency',id:foreignID,ownerEpoch:foreignEpoch,revision,effect,deniedActions});
const policy=(revision,minutes,ownerEpoch='policy-epoch')=>({type:'policy',policyId:'session-inactivity',ownerEpoch,revision,inactivityMinutes:minutes});
const registry=()=>new Map([[foreignID,{ownerApp:'academy',epoch:foreignEpoch,recipients:['studio'],actions:['read','write']}]]);
async function setup(){
 const f=await fixture('studio');f.raw.exec(issuanceFloorSchemaSQL);
 if(!f.raw.prepare('PRAGMA table_info(jwt_v2_restrictions)').all().some(c=>c.name==='scope_sub'))f.raw.exec('ALTER TABLE jwt_v2_restrictions ADD COLUMN scope_sub TEXT');
 if(!f.raw.prepare('SELECT 1 FROM jwt_v2_family_policy WHERE sid=?').get(f.sid))await registerFamilyPolicy(f.store,{sid:f.sid,ownerEpoch:'policy-epoch',revision:1,minutes:90,now:f.now});
 return f;
}
function insertFloor(f,target,scopeSub=f.sub){
 f.raw.prepare('INSERT INTO jwt_v2_restrictions(restriction_id,target_json,digest,created_at,scope_sub) VALUES(?,?,NULL,?,?)').run(crypto.randomUUID(),canonical(target),f.now,scopeSub);
}
function guard(f,extra={}){
 return issuanceFloorGuard(f.store,{binding:f.binding,projection:f.projection,vectorGuards:f.vectorGuards,existingSid:f.sid,now:f.now+10,dependencyRegistry:registry(),...extra});
}
async function accept(f,extra={}){
 const [g,c]=guard(f,extra);await f.store.batch([g,f.store.stmt('UPDATE jwt_v2_families SET authority_ready=1,cr=cr+1 WHERE sid=?',f.sid),c]);
}
async function confirm(f,revision){
 await confirmPolicyHistory(f.store,{trustedCoverage:{schema:2,env:'production',sourceApp:'academy',targetApp:'studio',mode:'CONTIGUOUS_EVENTS',ownerEpoch:'policy-epoch',throughRevision:revision,receiptRef:'exact-policy-'+revision},now:f.now+1});
}
function nativeFixture(f){
 f.raw.exec('CREATE TABLE native_projection(account_id TEXT PRIMARY KEY,scope TEXT NOT NULL,owner_epoch TEXT NOT NULL,owner_revision INTEGER NOT NULL,projection_digest TEXT NOT NULL,allowed INTEGER NOT NULL)');
 const columns=['account_id','scope','owner_epoch','owner_revision','projection_digest','allowed'];
 f.raw.exec(captureDDL({registry:{schema:2,app:'studio',rules:{native_projection:{required:true,columns,accountColumn:'account_id'}}},available:{native_projection:columns},ownerEpoch:'local-native-epoch'}).sql);
 const ref={id:'studio:native:native_projection',scope:dependencyScope(f.sub),ownerEpoch:'local-native-epoch'};
 return {ref,guard:{table:'native_projection',scopeColumn:'scope',ownerEpochColumn:'owner_epoch',revisionColumn:'owner_revision',projectionDigestColumn:'projection_digest'}};
}
async function applyForeign(f,{revision=5,wrongDigest=false}={}){
 const native=nativeFixture(f),projectionDigest=await digest({scope:dependencyScope(f.sub),revision,allowed:true});
 const options={target:foreign(revision),scopeSub:f.sub,dependencyRegistry:registry(),projectionDigest,commitRef:'authenticated-native-projection-'+revision,nativePlan:{guard:native.guard,references:[native.ref],statements:[f.store.stmt('INSERT INTO native_projection VALUES(?,?,?,?,?,1)',f.sub,dependencyScope(f.sub),foreignEpoch,revision,wrongDigest?'0'.repeat(64):projectionDigest)]}};
 const plan=await appliedDependencyPlan(f.store,options);
 if(!wrongDigest)f.vectorGuards=[...f.vectorGuards,[native.ref.id,native.ref.scope,native.ref.ownerEpoch,1]];
 return {native,options,plan};
}

test('scoped dependency IDs use the same scope hash as the captured vector, with ASCII SQL upper semantics',async()=>{
 assert.equal(dependencyScope(null),'GLOBAL');assert.equal(dependencyScope('süß-test'),'ACCOUNT:Süß-TEST');
 const guards=[['studio:native:staff',dependencyScope('synthetic-account'),'own-epoch',7]];
 assert.equal((await vectorFromGuards(guards))[0][0],await scopedVectorId(guards[0][0],guards[0][1]));
 assert.notEqual(await scopedVectorId(guards[0][0],'GLOBAL'),await scopedVectorId(guards[0][0],guards[0][1]));
});
test('coherent current source policy and applied family policy permit existing and new family issuance guards',async()=>{
 const f=await setup();await accept(f);await accept(f,{existingSid:null});
});
test('known foreign DENY cannot be cleared by a complete unchanged local vector or declared target metadata',async()=>{
 const f=await setup();insertFloor(f,foreign(5,'DENY',['read']));
 f.raw.prepare('UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?').run(f.sid);
 await assert.rejects(accept(f,{projection:{...f.projection,enforcedTargets:[foreign(5,'DENY',['read'])]}}));
 assert.equal((await f.store.family(f.sid)).authority_ready,0);
});
test('known foreign INVALIDATE requires applied business projection even with an invented high foreign vector entry',async()=>{
 const f=await setup();insertFloor(f,foreign());
 await assert.rejects(accept(f));
 f.raw.prepare('INSERT INTO jwt_v2_dependencies VALUES(?,?,?,99)').run(foreignID,dependencyScope(f.sub),foreignEpoch);
 await assert.rejects(accept(f,{vectorGuards:[...f.vectorGuards,[foreignID,dependencyScope(f.sub),foreignEpoch,99]]}));
});
test('explicit foreign DENY permits only the remaining actions and unknown metadata or owner epochs stay closed',async()=>{
 const f=await setup();insertFloor(f,foreign(5,'DENY',['read']));
 await accept(f,{projection:{...f.projection,deniedActions:['read']}});
 await assert.rejects(accept(f,{projection:{...f.projection,deniedActions:['read']},dependencyRegistry:new Map()}));
 insertFloor(f,{...foreign(6,'DENY',['read']),ownerEpoch:'unknown-new-epoch'});
 await assert.rejects(accept(f,{projection:{...f.projection,deniedActions:['read']}}));
});
test('native invalidation can be covered only by exact app/account/epoch scope and live revision',async()=>{
 const f=await setup(),id='studio:native:staff',scope=dependencyScope(f.sub),target={type:'dependency',id,ownerEpoch:'local-owner',revision:5,effect:'INVALIDATE',deniedActions:[]};
 insertFloor(f,target);f.raw.prepare('INSERT INTO jwt_v2_dependencies VALUES(?,?,?,5)').run(id,scope,'local-owner');
 await accept(f,{vectorGuards:[...f.vectorGuards,[id,scope,'local-owner',5]]});
 await assert.rejects(accept(f,{vectorGuards:[...f.vectorGuards,[id,'GLOBAL','local-owner',5]]}));
 await assert.rejects(accept(f,{vectorGuards:[...f.vectorGuards,[id,scope,'wrong-owner',5]]}));
 await assert.rejects(accept(f,{vectorGuards:[...f.vectorGuards,[id,scope,'local-owner',6]]}));
});
test('an account-scoped native counter cannot cover a global floor and another account floor is unrelated',async()=>{
 const f=await setup(),id='studio:native:staff',scope=dependencyScope(f.sub),target={type:'dependency',id,ownerEpoch:'local-owner',revision:5,effect:'INVALIDATE',deniedActions:[]};
 f.raw.prepare('INSERT INTO jwt_v2_dependencies VALUES(?,?,?,5)').run(id,scope,'local-owner');insertFloor(f,target,'different-account');
 await accept(f,{vectorGuards:[...f.vectorGuards,[id,scope,'local-owner',5]]});
 insertFloor(f,target,null);await assert.rejects(accept(f,{vectorGuards:[...f.vectorGuards,[id,scope,'local-owner',5]]}));
});
test('a floor received after guard construction is checked inside the actual owning transaction',async()=>{
 const f=await setup(),[g,c]=guard(f);
 insertFloor(f,foreign(5,'DENY',['read']));
 await assert.rejects(f.store.batch([g,f.store.stmt('UPDATE jwt_v2_families SET cr=cr+1 WHERE sid=?',f.sid),c]));
 assert.equal((await f.store.family(f.sid)).cr,1);
});
test('applied foreign projection commits real native facts/provenance, captured dependencies and receipt atomically',async()=>{
 const f=await setup();insertFloor(f,foreign());const {plan}=await applyForeign(f);
 await f.store.batch(plan);await accept(f);
 const receipt=f.raw.prepare('SELECT * FROM jwt_v2_applied_dependencies').get();
 assert.equal(receipt.owner_epoch,foreignEpoch);assert.equal(receipt.revision,5);assert.equal(JSON.parse(receipt.native_vector_json)[0][3],1);
 assert.equal(f.raw.prepare('SELECT allowed FROM native_projection').get().allowed,1);
});
test('failed exact native provenance guard rolls back facts, capture, outbox/work and the applied receipt',async()=>{
 const f=await setup(),{plan}=await applyForeign(f,{wrongDigest:true});
 await assert.rejects(f.store.batch(plan));
 for(const table of ['native_projection','jwt_v2_applied_dependencies','jwt_v2_authority_changes'])assert.equal(f.raw.prepare('SELECT count(*) n FROM '+table).get().n,0);
 assert.equal(f.raw.prepare("SELECT count(*) n FROM jwt_v2_dependencies WHERE id='studio:native:native_projection'").get().n,0);
});
test('metadata-only/boolean/V2-table/uncaptured native proof cannot produce an applied receipt',async()=>{
 const f=await setup(),{options}=await applyForeign(f);
 await assert.rejects(appliedDependencyPlan(f.store,{...options,nativePlan:true}),/PLAN_REQUIRED/);
 await assert.rejects(appliedDependencyPlan(f.store,{...options,nativePlan:{...options.nativePlan,guard:{...options.nativePlan.guard,table:'jwt_v2_accounts'}}}),/PROVENANCE_TABLE/);
 await assert.rejects(appliedDependencyPlan(f.store,{...options,nativePlan:{...options.nativePlan,references:[]}}),/REFERENCES_REQUIRED/);
 await assert.rejects(appliedDependencyPlan(f.store,{...options,dependencyRegistry:new Map()}),/OWNER_REQUIRED/);
});
test('a proven newer projection supersedes an old denial, but a later native rewrite invalidates its enabling receipt',async()=>{
 const f=await setup();insertFloor(f,foreign(5,'DENY',['read']));const {plan,native}=await applyForeign(f,{revision:6});await f.store.batch(plan);await accept(f);
 f.raw.prepare('UPDATE native_projection SET allowed=0').run();
 f.vectorGuards=f.vectorGuards.map(row=>row[0]===native.ref.id?[...row.slice(0,3),2]:row);
 await assert.rejects(accept(f));
 await accept(f,{projection:{...f.projection,deniedActions:['read']}});
});
test('a new family cannot bypass a known foreign invalidation',async()=>{
 const f=await setup();insertFloor(f,foreign());await assert.rejects(accept(f,{existingSid:null}));
});
test('gapped policy history cannot be cleared by native capture for existing or new families',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:policy(3,200),now:f.now});
 await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+10});
 await assert.rejects(accept(f,{projection:{...f.projection,policyRevision:3,inactivityMinutes:200}}));
 await assert.rejects(accept(f,{existingSid:null,projection:{...f.projection,policyRevision:3,inactivityMinutes:200}}));
 assert.equal((await f.store.family(f.sid)).authority_ready,0);
});
test('current coherent policy still needs the existing family history applied before enabling',async()=>{
 const f=await setup();await stagePolicy(f.store,{target:policy(2,15),now:f.now});await confirm(f,2);
 const projection={...f.projection,policyRevision:2,inactivityMinutes:15};await assert.rejects(accept(f,{projection}));
 await applyFamilyPolicy(f.store,{sid:f.sid,now:f.now+10});await accept(f,{projection});
 f.raw.prepare('UPDATE jwt_v2_family_policy SET history_complete=0 WHERE sid=?').run(f.sid);await assert.rejects(accept(f,{projection}));
});
test('registered successor with uncompleted bridge cannot enable via old head or lexical epoch order',async()=>{
 const f=await setup();await registerPolicySuccessor(f.store,{ownerEpoch:'aaa-earlier-lexical',baseRevision:1,minutes:200,predecessorEpoch:'policy-epoch',predecessorFinalRevision:1,receiptRef:'registered-bridge',now:f.now});
 await assert.rejects(accept(f));await assert.rejects(accept(f,{projection:{...f.projection,policyEpoch:'aaa-earlier-lexical',inactivityMinutes:200}}));
});
test('new unlocked families cannot bypass persisted local parent or ceremony inactivity locks',async()=>{
 const f=await setup();f.raw.prepare("UPDATE jwt_v2_parents SET state='LOCKED' WHERE psid=?").run(f.psid);
 await assert.rejects(accept(f,{existingSid:null}));await accept(f,{existingSid:null,state:'ADMITTED_LOCKED'});
 f.raw.prepare("UPDATE jwt_v2_parents SET state='UNLOCKED' WHERE psid=?").run(f.psid);
 f.raw.prepare('INSERT INTO jwt_v2_ceremony_barriers VALUES(?,?,?,?,?,?,1,1)').run(f.psid,f.bsid,1,f.sub,f.now,f.now+5400);
 await assert.rejects(accept(f,{existingSid:null}));
 const [g,c]=guard(f,{existingSid:null});await f.store.batch([f.store.stmt('UPDATE jwt_v2_ceremony_barriers SET locked=0,revision=revision+1'),g,c]);
});
test('unknown target types and current revoked pairs cannot obtain issuance authority',async()=>{
 const f=await setup();insertFloor(f,{type:'future-unknown-authority'});await assert.rejects(accept(f));
 const f2=await setup();insertFloor(f2,{type:'accountCutoff',sub:f2.sub,maxCe:4,maxAe:9,reason:'SUSPICIOUS_ACTIVITY',incidentId:crypto.randomUUID()});await assert.rejects(accept(f2));
});

async function actualRotation(f,deniedActions=[]){
 const intent=await f.store.intent({sid:f.sid,csrfHash:'synthetic-csrf-digest',now:f.now+1}),binding={...f.binding,sv:2,vat:f.now+10};
 return f.store.rotate({sid:f.sid,fingerprint:f.fp,intentId:intent.intent_id,csrfHash:'synthetic-csrf-digest',expectedBinding:f.binding,successorFingerprint:await fingerprint(opaque(),f.config),nextBinding:binding,nextProjection:{...f.projection,binding,deniedActions},capture:{...f.capture,vat:f.now+10,primaryCheckedAt:f.now+10},now:f.now+10,idleUntil:f.now+5410,deadline:f.now+910,qualifyingActivity:true,vectorGuards:f.vectorGuards});
}
test('integrated rotate cannot clear received foreign invalidation and writes no spent/history/result on rejection',async()=>{
 const f=await setup();f.store.dependencyRegistry=registry();insertFloor(f,foreign());
 f.raw.prepare('UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?').run(f.sid);
 await assert.rejects(actualRotation(f));
 assert.equal((await f.store.family(f.sid)).authority_ready,0);assert.equal((await f.store.family(f.sid)).fingerprint,f.fp);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_refresh_history').get().n,0);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_operations').get().n,0);
});
test('integrated rotate allows remaining rights only with the received concrete DENY carried into committed projection',async()=>{
 const f=await setup();f.store.dependencyRegistry=registry();insertFloor(f,foreign(5,'DENY',['read']));
 f.raw.prepare('UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?').run(f.sid);
 await assert.rejects(actualRotation(f));
 const result=await actualRotation(f,['read']);assert.equal(result.winner,true);
 const current=await f.store.family(f.sid);assert.equal(current.authority_ready,1);assert.deepEqual(JSON.parse(current.projection_json).deniedActions,['read']);
});

test('a ready freshly validated native scoped vector can publish and ACK its exact local invalidation',async()=>{
 const f=await setup(),id='studio:native:staff',scope=dependencyScope(f.sub),epoch='local-owner',workId=crypto.randomUUID(),target={type:'dependency',id,ownerEpoch:epoch,revision:1,effect:'INVALIDATE',deniedActions:[]};
 f.raw.prepare('INSERT INTO jwt_v2_dependencies VALUES(?,?,?,1)').run(id,scope,epoch);
 await f.store.batch(await restrictionPlan(f.store,{workId,target,sub:f.sub,now:f.now}));
 const guards=[...f.vectorGuards,[id,scope,epoch,1]],ownerVector=await vectorFromGuards(guards),pv=await vectorDigest(ownerVector),binding={...f.binding,sv:2,vat:f.now+10,pv};
 f.store.dependencyManifest=guards.map(([id,scope,ownerEpoch])=>({id,scope,ownerEpoch}));
 const projection={...f.projection,binding,ownerVector,timedUntil:Number.MAX_SAFE_INTEGER},capture={...f.capture,pv,vat:f.now+10,primaryCheckedAt:f.now+10,ownerVector,vectorGuards:guards,timedUntil:Number.MAX_SAFE_INTEGER};
 const intent=await f.store.intent({sid:f.sid,csrfHash:'synthetic-csrf',now:f.now+1});
 const result=await f.store.rotate({sid:f.sid,fingerprint:f.fp,intentId:intent.intent_id,csrfHash:'synthetic-csrf',expectedBinding:f.binding,successorFingerprint:await fingerprint(opaque(),f.config),nextBinding:binding,nextProjection:projection,capture,now:f.now+10,idleUntil:f.now+5410,deadline:f.now+910,qualifyingActivity:true,vectorGuards:guards});
 assert.equal(result.winner,true);
 const bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:f.store.securityPrefix,generation:'generation1'}),suffix='security/session/'+f.sid,row=await f.store.family(f.sid);
 await cache.seed(suffix);
 const published=await cache.publish(suffix,async()=>({...projection,cr:row.cr,app:'studio',env:'production',localState:'UNLOCKED',authorityReady:true,s_exp:row.s_exp,validationDeadline:row.deadline,idleUntil:row.idle_until,timedUntil:row.s_exp,rightsKey:cache.prefix+'rights/synthetic/hash',enforcedTargets:[target]}));
 await markSessionCovered(f.store,{workId,sid:f.sid,projection:published,controlKey:cache.key(suffix),now:f.now+11});
 assert.equal(await worksetApplied(f.store,workId),true);
});
