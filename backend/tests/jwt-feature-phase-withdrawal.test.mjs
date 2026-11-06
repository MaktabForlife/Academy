// Targeted orchestration negatives. All adapters are in-memory; no network/DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFreshFeature} from '../tools/jwt-feature-install-controller.mjs';
import {packageFixture} from './fixtures/jwt-feature-install-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
function harness({withdrawBeforeSchema=false,withdrawBeforeSeed=false,foreignBeforeSeed=false}={}){
 let writes=0,schemaCalls=0,seedCalls=0,privateIngress=false,schemaVerified=false;
 const events=[],receipts=[];
 const ops={
  candidateGuard:async()=>{events.push('approval');if(withdrawBeforeSchema&&privateIngress||withdrawBeforeSeed&&schemaVerified)throw Error('WITHDRAWN_APPROVAL');},
  ownedGuard:async()=>{events.push('ownership');if(foreignBeforeSeed&&schemaVerified)throw Error('FOREIGN_VERSION');},
  preflight:async()=>{},
  deploy:async(name,stage)=>{writes++;events.push(stage+':'+name);},
  patchSecrets:async values=>{writes++;if(Object.values(values).every(x=>x===null))events.push('remove-temporary');else{privateIngress=true;events.push('private-ingress-ack');}},
  adoptExpected:async()=>{},
  probe:async()=>{},
  schema:async()=>{schemaCalls++;schemaVerified=true;events.push('schema-verified');return {receipt:{state:'VERIFIED',stage:'SCHEMA_ONLY',verification:{localOnly:true}},executeRequests:1,statusRequests:1};},
  setup:async()=>{seedCalls++;events.push('seed');return {receipt:{state:'VERIFIED'},executeRequests:1,statusRequests:1};},
  prepareFinal:async()=>events.push('prepare-final'),
  verifyFinal:async()=>events.push('verify-final'),
  pauseRecovery:async()=>events.push('owned-pause'),
  verifyRecovery:async()=>events.push('pause-verified'),
  save:e=>receipts.push(e)
 };
 const cap={publicKey:{},ingress:async patch=>patch({uninstalled:{type:'secret_text'}}),destroy(){events.push('private-memory-retired');}};
 return {ops,cap,events,receipts,counts:()=>({writes,schemaCalls,seedCalls})};
}
test('withdrawal after acknowledged private ingress prevents schema and seed starting, permits only owned pause',async()=>{
 const h=harness({withdrawBeforeSchema:true});
 await assert.rejects(installFreshFeature({ops:h.ops,packageInfo:packageFixture().p,privateCapsule:h.cap}),/INSTALL_STOPPED/);
 assert.deepEqual(h.counts(),{writes:4,schemaCalls:0,seedCalls:0});
 assert(h.events.includes('private-ingress-ack'));assert(h.events.includes('pause-verified'));assert(!h.events.includes('prepare-final'));assert(h.events.includes('private-memory-retired'));
 assert.equal(h.receipts.at(-1).recovery,'OWNED_PAUSED_VERIFIED');
});
test('withdrawal after verified schema prevents the independent seed phase and final config',async()=>{
 const h=harness({withdrawBeforeSeed:true});
 await assert.rejects(installFreshFeature({ops:h.ops,packageInfo:packageFixture().p,privateCapsule:h.cap}),/INSTALL_STOPPED/);
 assert.deepEqual(h.counts(),{writes:4,schemaCalls:1,seedCalls:0});
 assert(h.events.includes('schema-verified'));assert(h.events.includes('pause-verified'));assert(!h.events.includes('prepare-final'));assert(!h.events.some(x=>x.startsWith('FINAL_PAUSED:')));
 assert.equal(h.receipts.at(-1).schemaRequests,2);assert.equal(h.receipts.at(-1).recovery,'OWNED_PAUSED_VERIFIED');
});
test('foreign ownership after verified schema prevents seed and forbids recovery overwrite',async()=>{
 const h=harness({foreignBeforeSeed:true});
 await assert.rejects(installFreshFeature({ops:h.ops,packageInfo:packageFixture().p,privateCapsule:h.cap}),/INSTALL_STOPPED/);
 assert.deepEqual(h.counts(),{writes:4,schemaCalls:1,seedCalls:0});
 assert(!h.events.includes('owned-pause'));assert(!h.events.includes('prepare-final'));assert(h.events.includes('private-memory-retired'));
 assert.equal(h.receipts.at(-1).recovery,'NOT_VERIFIED_NO_OVERWRITE');
});
