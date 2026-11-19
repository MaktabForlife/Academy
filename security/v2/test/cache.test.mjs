import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityCache as ProductionSecurityCache,coherentCapture} from '../cache.mjs';
import {FixtureSecurityCache as SecurityCache} from './helpers.mjs';
import {fixture,Bucket,signing} from './helpers.mjs';
import {issueToken} from '../tokens.mjs';
import {canonical,sha256,bytes,hex} from '../codec.mjs';
const appControl=value=>({app:'studio',env:'production',policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,migrationFloor:2,inactivityMinutes:90,withdrawnKids:[],...value});
async function context(){
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:'auth-private/v2/production/studio/generation1/',generation:'generation1'});
 return {...f,bucket,cache};
}
test('one nonauthorising seed create; retry never creates a key again',async()=>{
 const f=await context();await f.cache.seed('control/app');assert.equal(f.bucket.puts,1);
 assert.equal((await f.cache.seed('control/app')).created,false);assert.equal(f.bucket.puts,1);
 await assert.rejects(f.cache.read('control/app'),/PUBLICATION_PENDING/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'SEED');
});
test('lost seed response does not permit a second create attempt',async()=>{
 const f=await context();f.bucket.throwAfterPut=true;await assert.rejects(f.cache.seed('control/app'));
 assert.equal((await f.cache.seed('control/app')).created,false);assert.equal(f.bucket.puts,1);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).seed_observed,0);
});
test('known ACTIVE loss fences rather than recreating an allow record',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1,denied:false}));
 f.bucket.objects.delete(f.cache.key('control/app'));await assert.rejects(f.cache.read('control/app'),/CONTROL_UNAVAILABLE/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'LOST');
 await assert.rejects(f.cache.publish('control/app',async()=>appControl({cr:2,denied:false})),/FENCED/);
 assert.equal((await f.cache.seed('control/app')).created,false);
});
test('stale publisher cannot overwrite a newer restriction; every semantic write has a new nonce',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1,denied:false}));
 const old=(await f.cache.read('control/app')).value.publicationNonce;
 await f.cache.publish('control/app',async()=>appControl({cr:2,denied:true}));const current=await f.cache.read('control/app');assert.notEqual(current.value.publicationNonce,old);
 await assert.rejects(f.cache.publish('control/app',async()=>appControl({cr:1,denied:false})),/STALE/);assert.equal((await f.cache.read('control/app')).value.denied,true);
});
test('delete between GET and conditional PUT cannot recreate a former key',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1,denied:false}));
 f.bucket.beforePut=async key=>{f.bucket.objects.delete(key);f.bucket.beforePut=null;};
 await assert.rejects(f.cache.publish('control/app',async()=>appControl({cr:2,denied:true})),/PUBLICATION_RETRY/);
 assert.equal(f.bucket.objects.has(f.cache.key('control/app')),false);
});
test('transport failures do not masquerade as proven control loss',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1}));
 f.bucket.get=async()=>{throw Error('network');};await assert.rejects(f.cache.read('control/app'),/TRANSPORT/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'ACTIVE');
});
test('same-cr different facts are a conflict, not a successful acknowledgement',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1,denied:true}));
 await assert.rejects(f.cache.publish('control/app',async()=>appControl({cr:1,denied:false})),/CONFLICT/);
});
test('warm request reads two controls, no SQL, immutable memo never extends lease',async()=>{
 const f=await context(),keys=await signing(),rights={roles:['synthetic-student']},raw=bytes(canonical(rights)),hash=hex(await sha256(raw)),rightsKey=f.cache.prefix+'rights/account/scope/hash';
 await f.bucket.put(rightsKey,canonical(rights));await f.cache.seed('control/app');await f.cache.seed('security/session/'+f.sid);
 await f.cache.publish('control/app',async()=>({cr:1,app:'studio',env:'production',policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2,inactivityMinutes:90}));
 await f.cache.publish('security/session/'+f.sid,async()=>({cr:1,app:'studio',env:'production',localState:'UNLOCKED',authorityReady:true,deniedActions:[],validationDeadline:f.deadline,idleUntil:f.idleUntil,s_exp:f.binding.s_exp,timedUntil:f.binding.s_exp,policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,binding:f.binding,ownerVector:f.ownerVector,rightsKey,rightsHash:hash}));
 const token=await issueToken({...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:keys.privateKey,kid:'test',now:f.now,idleUntil:f.idleUntil}),memo=new Map(),args={token,sessionKey:f.sid,config:f.config,keys:new Map([['test',keys.publicKey]]),now:f.now,rightsMemo:memo,action:'read'};
 const first=await f.cache.authorise(args);assert.throws(()=>first.rights.roles.push('GLOBAL_ADMIN'));
 const memoKey=[...memo.keys()][0];memo.set(memoKey,{roles:['GLOBAL_ADMIN']});
 const rebuilt=await f.cache.authorise(args);assert.deepEqual(rebuilt.rights.roles,['synthetic-student']);
 const beforeSQL=f.metrics.queries,beforeReads=f.cache.metrics.controlReads,beforePayload=f.cache.metrics.payloadReads;
 await f.cache.authorise({...args,now:f.now+100});assert.equal(f.metrics.queries,beforeSQL);assert.equal(f.cache.metrics.controlReads-beforeReads,2);assert.equal(f.cache.metrics.payloadReads,beforePayload);
 await assert.rejects(f.cache.authorise({...args,now:f.deadline}),/(?:LEASE_EXPIRED|TOKEN_EXPIRED)/);
});
test('coherent payload rebuilding preserves committed validation time and fixed deadline',async()=>{
 const lease={vat:100,deadline:1000};
 const r=await coherentCapture({readFence:async()=>({pending:false,version:3}),readVector:async()=>[['x','epoch',1]],loadRights:async()=>({right:true}),committedLease:lease,now:200});
 assert.equal(r.vat,100);assert.equal(r.deadline,1000);
 await assert.rejects(coherentCapture({readFence:async()=>({pending:true}),readVector:async()=>[],loadRights:async()=>({}),committedLease:lease,now:200}),/SPLIT/);
 let n=0;await assert.rejects(coherentCapture({readFence:async()=>({pending:false,version:n++}),readVector:async()=>[],loadRights:async()=>({}),committedLease:lease,now:200}),/CHANGED/);
});

test('invalid signature or mismatched session selector cannot trigger a global loss fence',async()=>{
 const f=await context(),k=await signing();
 await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1}));
 await assert.rejects(f.cache.authorise({token:'not.a.signature',sessionKey:crypto.randomUUID(),config:f.config,keys:new Map([['test',k.publicKey]]),now:f.now,action:'read'}));
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'ACTIVE');
 const token=await issueToken({...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:k.privateKey,kid:'test',now:f.now,idleUntil:f.idleUntil});
 await assert.rejects(f.cache.authorise({token,sessionKey:crypto.randomUUID(),config:f.config,keys:new Map([['test',k.publicKey]]),now:f.now,action:'read'}),/SELECTOR/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'ACTIVE');
 await assert.rejects(f.cache.authorise({token,sessionKey:f.sid,config:f.config,keys:new Map([['test',k.publicKey]]),now:f.now,action:'read'}),/SESSION_ENDED/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'ACTIVE');
});

test('publisher loss seals the old app generation even after old session bytes return',async()=>{
 for(const failure of ['missing','malformed','incarnation']){
  const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1}));
  const suffix='security/session/'+f.sid;await f.cache.seed(suffix);
  const projected={cr:1,app:'studio',env:'production',binding:f.binding,localState:'LOCKED',authorityReady:true,validationDeadline:f.deadline,idleUntil:f.idleUntil,s_exp:f.binding.s_exp};
  await f.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'});
  projected.cr=2;await f.cache.publish(suffix,async()=>projected);
  const old=f.bucket.objects.get(f.cache.key(suffix));
  if(failure==='missing')f.bucket.objects.delete(f.cache.key(suffix));
  else f.bucket.objects.set(f.cache.key(suffix),{body:failure==='malformed'?'{':canonical({...projected,incarnation:crypto.randomUUID(),generation:'generation1',state:'ACTIVE'}),etag:'bad'});
  await assert.rejects(f.cache.publish(suffix,async()=>projected),/CONTROL_UNAVAILABLE/);
  f.bucket.objects.set(f.cache.key(suffix),old);
  assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'LOST');
  assert.equal(JSON.parse(f.bucket.objects.get(f.cache.key('control/app')).body).state,'FENCED');
  await assert.rejects(f.cache.read('control/app'),/CONTROL_UNAVAILABLE/);
 }
});
test('outgoing oversized control requires partition before PUT or successful receipt',async()=>{
 const f=await context();await f.cache.seed('control/app');
 const before=f.bucket.puts;await assert.rejects(f.cache.publish('control/app',async()=>appControl({cr:1,padding:'x'.repeat(16384)})),/CONTROL_PARTITION_REQUIRED/);
 assert.equal(f.bucket.puts,before);assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'SEED');
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).receipt_json,null);
});
test('incoming control over 16KiB is proven loss and seals the namespace',async()=>{
 const f=await context();await f.cache.seed('control/app');await f.cache.publish('control/app',async()=>appControl({cr:1}));
 const key=f.cache.key('control/app'),old=JSON.parse(f.bucket.objects.get(key).body);
 f.bucket.objects.set(key,{body:canonical({...old,padding:'x'.repeat(16384)}),etag:'oversize'});
 await assert.rejects(f.cache.read('control/app'),/CONTROL_UNAVAILABLE/);
 assert.equal((await f.store.lifecycle(key)).state,'LOST');
});

test('cache publication cannot introduce uncommitted app authority',async()=>{
 const f=await context();await f.cache.seed('control/app');
 await assert.rejects(ProductionSecurityCache.prototype.publish.call(f.cache,'control/app',async()=>appControl({cr:1})),/SOURCE_NOT_COMMITTED/);
 assert.equal((await f.store.lifecycle(f.cache.key('control/app'))).state,'SEED');
 assert.equal(f.bucket.puts,1);
});
