import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Bucket,signing} from './helpers.mjs';
import {csrfProof,verifyCSRF,verifyBootstrap,browserBody,privateJSON} from '../browser-security.mjs';
import {recoverNamespace,assertServingGeneration} from '../recovery.mjs';
import {FixtureSecurityCache as SecurityCache} from './helpers.mjs';
import {primaryTransportFallback,authoriseWithFallback} from '../fallback.mjs';
import {issueToken} from '../tokens.mjs';
const appControl={cr:1,app:'studio',env:'production',policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,migrationFloor:2,inactivityMinutes:90,withdrawnKids:[]};
test('CSRF is same-origin, purpose/operation/full-context bound and expires without grace',async()=>{
 const f=await fixture(),key=crypto.getRandomValues(new Uint8Array(32)),context={app:'studio',...f.binding};
 const options={config:f.config,key,purpose:'refresh',context,operationId:crypto.randomUUID(),expiresAt:f.now+60},proof=await csrfProof(options),request=new Request(f.config.origin+'/auth/v2/refresh',{method:'POST',headers:{Origin:f.config.origin,'Sec-Fetch-Site':'same-origin'}});
 assert.equal((await verifyCSRF({...options,request,proof,now:f.now})).length,64);
 await assert.rejects(verifyCSRF({...options,purpose:'logout',request,proof,now:f.now}),/INVALID/);
 await assert.rejects(verifyCSRF({...options,context:{...context,ae:10},request,proof,now:f.now}),/INVALID/);
 await assert.rejects(verifyCSRF({...options,request,proof,now:f.now+60}),/EXPIRED/);
});
test('bootstrap needs non-simple header and bounded strict JSON; responses are no-store',async()=>{
 const f=await fixture(),url=f.config.origin+'/auth/v2/bootstrap';
 assert.throws(()=>verifyBootstrap(new Request(url,{method:'POST',headers:{Origin:f.config.origin}}),f.config));
 verifyBootstrap(new Request(url,{method:'POST',headers:{Origin:f.config.origin,'X-UAA-Request':'2'}}),f.config);
 await assert.rejects(browserBody(new Request(url,{method:'POST',body:'x'.repeat(4097)})),/TOO_LARGE/);
 const response=privateJSON({safe:true});assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('loss of a session seals the old app generation; restoring readable session bytes cannot resume authority',async()=>{
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:'auth-private/v2/production/studio/generation1/',generation:'generation1'}),suffix='security/session/'+f.sid;
 await cache.seed('control/app');await cache.publish('control/app',async()=>appControl);
 await cache.seed(suffix);const key=await signing(),projection={cr:1,app:'studio',env:'production',binding:f.binding,localState:'UNLOCKED',authorityReady:true,deniedActions:[],s_exp:f.binding.s_exp,validationDeadline:f.deadline,idleUntil:f.idleUntil,timedUntil:f.binding.s_exp,policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,ownerVector:f.ownerVector,rightsKey:cache.prefix+'rights/a/b/h',rightsHash:f.projection.rightsHash};
 await cache.publish(suffix,async()=>projection);const old=bucket.objects.get(cache.key(suffix));bucket.objects.delete(cache.key(suffix));
 await assert.rejects(cache.read(suffix),/CONTROL_UNAVAILABLE/);
 bucket.objects.set(cache.key(suffix),old);await assert.rejects(cache.read('control/app'),/CONTROL_UNAVAILABLE/);
 assert.equal(JSON.parse(bucket.objects.get(cache.key('control/app')).body).state,'FENCED');
 await assert.rejects(cache.publish(suffix,async()=>projection),/FENCED/);
});
test('a body transport failure does not record a false LOST incident',async()=>{
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:'auth-private/v2/production/studio/generation1/',generation:'generation1'});
 await cache.seed('control/app');await cache.publish('control/app',async()=>appControl);
 bucket.get=async()=>({etag:'valid-etag',arrayBuffer:async()=>{throw Error('stream interrupted');}});
 await assert.rejects(cache.read('control/app'),/TRANSPORT/);assert.equal((await f.store.lifecycle(cache.key('control/app'))).state,'ACTIVE');
});
test('transport fallback keeps committed validation/original clocks and refuses known control loss',async()=>{
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:'auth-private/v2/production/studio/generation1/',generation:'generation1'}),pair=await signing(),suffix='security/session/'+f.sid;
 await cache.seed('control/app');await cache.publish('control/app',async()=>appControl);await cache.seed(suffix);
 const projection={cr:1,app:'studio',env:'production',binding:f.binding,localState:'UNLOCKED',authorityReady:true,deniedActions:[],s_exp:f.binding.s_exp,validationDeadline:f.deadline,idleUntil:f.idleUntil,timedUntil:f.binding.s_exp,policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,ownerVector:f.ownerVector,rightsKey:cache.prefix+'rights/a/b/h',rightsHash:f.projection.rightsHash};
 await cache.publish(suffix,async()=>projection);
 const token=await issueToken({...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:pair.privateKey,kid:'test',now:f.now,idleUntil:f.idleUntil});
 const args={store:f.store,cache,token,sid:f.sid,config:f.config,keys:new Map([['test',pair.publicKey]]),now:f.now+20,action:'read',loadPrimaryAppControl:async()=>appControl,readFence:async()=>({pending:false,version:1}),readVector:async()=>f.ownerVector,loadRights:async()=>f.rights};
 await assert.rejects(primaryTransportFallback({...args,loadPrimaryAppControl:async()=>({...appControl,policyRevision:2,inactivityMinutes:15})}),/POLICY_RECONCILIATION/);
 await assert.rejects(primaryTransportFallback({...args,resourceKeys:['r']}),/RESOURCE_CHECKS/);
 const result=await primaryTransportFallback(args);assert.equal(result.deadline,f.deadline);assert.equal(result.vat,f.now);
 const originalLost=f.store.lost.bind(f.store),saved=bucket.objects.get(cache.key(suffix));
 f.store.lost=async()=>{throw Error('D1 unavailable');};bucket.objects.delete(cache.key(suffix));
 await assert.rejects(cache.read(suffix),/CONTROL_UNAVAILABLE/);
 assert.equal((await f.store.lifecycle(cache.key('control/app'))).state,'ACTIVE');
 bucket.objects.set(cache.key(suffix),saved);f.store.lost=originalLost;
 const originalGet=bucket.get.bind(bucket);bucket.get=async()=>{throw Error('R2 transport');};
 await assert.rejects(primaryTransportFallback(args),/TRANSPORT/);bucket.get=originalGet;
 await f.store.lost(cache.key(suffix));await assert.rejects(primaryTransportFallback(args),/CONTROL_UNAVAILABLE/);
});
function recoveryOperations(steps,extra={}){
 const leases=[{sid:crypto.randomUUID(),vat:100,validationDeadline:1000,s_iat:100,s_exp:604900,idleUntil:5500}];
 return {holdIngress:async()=>steps.push('hold'),fencePublishers:async()=>steps.push('fence'),capturePrimaryEvidence:async()=>({leases,floorsComplete:true}),publishFreshGeneration:async({generation})=>({generation,leases}),verifyBarriers:async()=>true,pinServingConfiguration:async()=>steps.push('pin'),drainOldGeneration:async()=>steps.push('drain'),verifyIngressConfiguration:async()=>true,releaseIngress:async()=>steps.push('release'),...extra};
}
test('recovery refuses execution before deployment approval and uses a fresh namespace with held ingress/drain',async()=>{
 const f=await fixture(),steps=[],operations=recoveryOperations(steps),operationId=crypto.randomUUID();
 await assert.rejects(recoverNamespace({store:f.store,operationId,oldGeneration:'old',operations}),/APPROVAL/);assert.deepEqual(steps,[]);
 const result=await recoverNamespace({store:f.store,operationId,oldGeneration:'old',approved:true,operations});
 assert.notEqual(result.generation,'old');assert.deepEqual(steps,['hold','fence','pin','drain','release']);assertServingGeneration({configuredGeneration:result.generation,manifest:result});
 assert.throws(()=>assertServingGeneration({configuredGeneration:'old',manifest:result}),/HELD/);
});
test('incomplete evidence, extended lease or undrained old route never releases recovery ingress',async()=>{
 for(const which of ['evidence','lease','drain']){
  const f=await fixture(),steps=[],extra=which==='evidence'?{capturePrimaryEvidence:async()=>({leases:[],floorsComplete:false})}:which==='lease'?{publishFreshGeneration:async({generation,evidence})=>({generation,leases:evidence.leases.map(l=>({...l,vat:l.vat+1}))})}:{verifyIngressConfiguration:async()=>false};
  await assert.rejects(recoverNamespace({store:f.store,operationId:crypto.randomUUID(),oldGeneration:'old',approved:true,operations:recoveryOperations(steps,extra)}));assert(!steps.includes('release'));
 }
});

async function committedFallbackFixture(){
 const f=await fixture(),bucket=new Bucket(),cache=new SecurityCache({bucket,store:f.store,prefix:f.store.securityPrefix,generation:'generation1'}),pair=await signing(),suffix='security/session/'+f.sid;
 await cache.seed('control/app');await cache.publish('control/app',async()=>appControl);await cache.seed(suffix);
 const projection={...f.projection,cr:1,app:'studio',env:'production',binding:f.binding,localState:'UNLOCKED',authorityReady:true,deniedActions:[],s_exp:f.binding.s_exp,validationDeadline:f.deadline,idleUntil:f.idleUntil,timedUntil:f.binding.s_exp,rightsKey:cache.prefix+'rights/synthetic/scoped/content'};
 await cache.publish(suffix,async()=>projection);
 const token=await issueToken({...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:pair.privateKey,kid:'test',now:f.now,idleUntil:f.idleUntil});
 const get=bucket.get.bind(bucket);bucket.get=async key=>{if(key===cache.key(suffix))throw Error('synthetic session transport failure');return get(key);};
 const options={cache,token,sessionKey:f.sid,config:f.config,keys:new Map([['test',pair.publicKey]]),now:f.now+20,action:'read',fallback:{store:f.store,loadPrimaryAppControl:async()=>appControl,readFence:async()=>({pending:false,version:1}),readVector:async()=>f.ownerVector,loadRights:async()=>f.rights}};
 return {...f,cache,bucket,options};
}
test('transport fallback cannot substitute elevated rights under the same committed vector',async()=>{
 const f=await committedFallbackFixture();
 const valid=await authoriseWithFallback(f.options);assert.deepEqual(valid.rights,f.rights);assert.equal(valid.vat,f.now);assert.equal(valid.deadline,f.deadline);
 await assert.rejects(authoriseWithFallback({...f.options,fallback:{...f.options.fallback,loadRights:async()=>({roles:['GLOBAL_ADMIN']})}}),/COMMITTED_RIGHTS_MISMATCH/);
});
test('transport fallback enforces the committed earliest timed authority end',async()=>{
 const f=await committedFallbackFixture();
 f.raw.prepare("UPDATE jwt_v2_families SET projection_json=json_set(projection_json,'$.timedUntil',?),cr=cr+1 WHERE sid=?").run(f.now+10,f.sid);
 await assert.rejects(authoriseWithFallback(f.options),/(?:INVALID_LEASE|LEASE_EXPIRED)/);
});
