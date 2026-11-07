import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {finalFencePlan as p,acceptedMainObservation,verifyReadOnlyFinalFence,assertFinalFenceReceipt} from '../tools/jwt-feature-readonly-final-fence.mjs';
import {expectedPausedMetadataProfiles} from '../tools/jwt-feature-finalise.mjs';
const canary='UNINSTALLED_CANARY_MUST_NOT_APPEAR',token='UNINSTALLED_CANARY_TOKEN_NOT_A_CREDENTIAL';
globalThis.fetch=()=>{throw Error('UNEXPECTED_LIVE_TRANSPORT');};
function settings(){
 const {coordinator:c}=expectedPausedMetadataProfiles(),bindings=[];
 for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars||{}))bindings.push({name,type:'plain_text',text});
 for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects.bindings){
  const ns=b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':'de95f15f19a54a9e9ba34e6e75f51847';
  bindings.push({name:b.name,type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});
 }
 return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,observability:{enabled:Boolean(c.observability?.enabled)},tail_consumers:[]};
}
function fixture(change={}){
 const calls=[],saved=[];let guards=0,tokenReads=0,provider=0,probe=0;
 const fresh=async()=>{guards++;if(change.withdrawAt===guards)throw Error(canary);};
 const getToken=()=>{tokenReads++;return token;};
 const save=r=>{assertFinalFenceReceipt(r);assert(!JSON.stringify(r).includes('UNINSTALLED_CANARY_'));saved.push(structuredClone(r));};
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method,credentials:options.credentials});
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert(options.signal);
  const kind=url.startsWith('https://api.cloudflare.com/')?'provider':'probe';
  const index=kind==='provider'?provider++:probe++;
  if(kind==='provider'){
   const step=p.fixedProviderSequence[index];assert(step);assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+p.accountId+'/workers/scripts/'+step.script+'/'+step.endpoint);assert.equal(options.headers.Authorization,'Bearer '+token);
  }else{assert.equal(url,p.probeOrigin+p.pausedProbePaths[index]);assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);}
  if(change.throwAt===calls.length)throw Error(canary);
  let raw=kind==='provider'?(index===1?settings():{deployments:[{versions:[{version_id:index===3?p.lastReviewedCoordinatorVersion:p.acceptedMainObservation.referenceVersion,percentage:100}]}]}):{code:'FEATURE_JWT_UNAVAILABLE'};
  if(change.mutate)change.mutate({kind,index,raw});
  if(change.response){const r=change.response({kind,index,raw});if(r)return r;}
  return kind==='provider'?Response.json({success:true,result:raw}):Response.json(raw,{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 };
 return {calls,saved,fresh,getToken,fetcher,save,counters:()=>({guards,tokenReads,provider,probe})};
}
async function stopped(m){
 let e;try{await verifyReadOnlyFinalFence(m);}catch(error){e=error;}
 assert(e);assert.equal(e.message,'FINAL_FENCE_STOPPED_SEE_STRICT_RECEIPT');assertFinalFenceReceipt(e.receipt);
 assert.equal(e.receipt.state,'FINAL_FENCE_STOPPED_NO_RETRY');assert.equal(e.receipt.checksPassed,false);
 assert(!JSON.stringify({message:e.message,receipt:e.receipt,saved:m.saved}).includes('UNINSTALLED_CANARY_'));
 return e.receipt;
}
test('actual accepted MAIN receipt is immutable, redacted and observation-only',()=>{
 const r=acceptedMainObservation();assert.equal(r.observations[0].deployment.currentVersion,p.acceptedMainObservation.referenceVersion);
 assert.equal(r.observations[1].settings.expectedMetadataMatches,true);assert.equal(r.observations[1].settings.assetConfigurationReturned,false);
 assert.equal(r.cleanupVerified,false);assert.equal(r.ownedVersionAdopted,false);assert(Object.isFrozen(r.observations));
 const bytes=readFileSync(new URL('../../deployment/jwt-feature-accepted-main-observation.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.acceptedMainObservation.receiptSHA256);
});
test('four fixed provider reads plus three unused PAUSED probes preserve original60/8 limits without writes or adoption',async()=>{
 const m=fixture(),r=await verifyReadOnlyFinalFence(m);
 assert.equal(r.state,'FINAL_FENCE_CAPTURED_NO_OWNERSHIP_OR_ACTIVATION_CLEARANCE');assert.equal(r.checksPassed,true);
 assert.equal(r.explicitCloudflareGetAttempts,4);assert.equal(r.cumulativeExplicitGetAttempts,60);
 assert.equal(r.pausedProbeAttempts,3);assert.equal(r.cumulativeInstallerAndCleanupHTTPAttempts,8);
 assert.equal(m.saved[0].mainObservationValidated,false);assert.equal(m.saved[0].mainTemporaryNamesAbsentInAcceptedObservation,false);assert.equal(r.mainObservationValidated,true);
 assert.equal(m.calls.length,7);assert.deepEqual(m.counters(),{guards:9,tokenReads:1,provider:4,probe:3});
 assert.deepEqual(m.calls.map(x=>new URL(x.url).pathname.split('/').slice(-2).join('/')),['feature_worker/deployments','academy-feature-split-coordinator/settings','/__jwt_feature_release','feature-jwt-setup/status','feature-jwt-setup/schema-status','feature_worker/deployments','academy-feature-split-coordinator/deployments']);
 for(const k of ['hostedWrites','secretWrites','sqlRequests','codeUploads','r2Operations','keyGeneration'])assert.equal(r[k],0);
 for(const k of ['cleanupVerified','activated','mainOwnedVersionAdopted','keyMaterialVerified','assetRoutingVerified','codeContentVerified','futureWriteClearance','currentMainSettingsReread'])assert.equal(r[k],false);
 assert.equal(r.coordinatorVersionSampleAfterProbes,true);assert.equal(r.metadataObservationsAtomic,false);
});
for(const [when,calls,reads,probes]of [[1,0,0,0],[3,1,1,0],[4,2,2,0],[7,5,2,3],[9,7,4,3]]){
 test('withdrawal at fresh gate '+when+' persists partial attempts and cannot retry',async()=>{
  const m=fixture({withdrawAt:when}),r=await stopped(m);assert.equal(m.calls.length,calls);assert.equal(r.explicitCloudflareGetAttempts,reads);assert.equal(r.pausedProbeAttempts,probes);
  if(when===1)assert.equal(m.counters().tokenReads,0);
 });
}
test('no implicit live fetch/token/save entry exists',async()=>{
 const m=fixture();await assert.rejects(verifyReadOnlyFinalFence({...m,fetcher:undefined}));assert.equal(m.calls.length,0);assert.equal(m.counters().tokenReads,0);
});
test('MAIN version drift before probes stops after one attempt without adopting new version',async()=>{
 const m=fixture({mutate:({kind,index,raw})=>{if(kind==='provider'&&index===0)raw.deployments[0].versions[0].version_id='00000000-0000-4000-8000-000000000999';}}),r=await stopped(m);
 assert.equal(m.calls.length,1);assert.equal(r.providerObservations[0].outcome,'VERSION_MISMATCH');assert.equal(r.mainOwnedVersionAdopted,false);
});
for(const [label,mutate]of [
 ['source marker',s=>s.bindings.find(b=>b.name==='JWT_FEATURE_INSTALL_SOURCE').text=canary],
 ['owner marker',s=>s.bindings.find(b=>b.name==='JWT_FEATURE_INSTALL_OWNER').text=canary],
 ['fresh database',s=>s.bindings.find(b=>b.name==='JWT_V110_CORE_DB').database_id='00000000-0000-4000-8000-000000000999'],
 ['fresh namespace',s=>s.bindings.find(b=>b.name==='JWT_V110_SPLIT_COORDINATOR').namespace_id='b722f4cf54a04d6fb2a5a299e12722e2'],
 ['duplicate binding',s=>s.bindings.push({...s.bindings[0]})],
 ['temporary name',s=>s.bindings.push({name:'JWT_FEATURE_SETUP_AUTH',type:'secret_text',text:canary})],
 ['unexpected signer',s=>s.bindings.push({name:'JWT_V110_PRIVATE_KEY_JSON',type:'secret_text',text:canary})],
 ['tail consumer',s=>s.tail_consumers.push({service:canary})]
]){
 test('coordinator '+label+' mismatch stops before probes and suppresses raw comparison data',async()=>{
  const m=fixture({mutate:({kind,index,raw})=>{if(kind==='provider'&&index===1)mutate(raw);}}),r=await stopped(m);
  assert.equal(m.calls.length,2);assert.equal(r.pausedProbeAttempts,0);assert.equal(r.providerObservations[1].outcome,'METADATA_MISMATCH');assert.equal(r.coordinatorMetadataMatched,false);
 });
}
test('provider transport loss consumes one attempt and never retries',async()=>{
 const m=fixture({throwAt:1}),r=await stopped(m);assert.equal(m.calls.length,1);assert.equal(r.explicitCloudflareGetAttempts,1);assert.equal(r.providerObservations[0].outcome,'TRANSPORT_FAILURE');
});
test('HTTP provider failure retains bounded numeric codes but no provider message',async()=>{
 const m=fixture({response:({kind,index})=>kind==='provider'&&index===0?Response.json({success:false,errors:[{code:10000,message:canary},{code:canary}]},{status:403}):null}),r=await stopped(m);
 assert.deepEqual(r.providerObservations[0].providerCodes,[10000]);assert.equal(m.calls.length,1);
});
test('invalid JSON provider body stops without echoing content',async()=>{
 const m=fixture({response:({kind,index})=>kind==='provider'&&index===0?new Response(canary,{status:200}):null}),r=await stopped(m);assert.equal(r.providerObservations[0].outcome,'BODY_FAILURE');assert.equal(m.calls.length,1);
});
test('provider response cap is enforced before parsing/logging oversized content',async()=>{
 const m=fixture({response:({kind,index})=>kind==='provider'&&index===0?new Response(canary+'x'.repeat(1048576),{status:200}):null}),r=await stopped(m);assert.equal(r.providerObservations[0].outcome,'BODY_FAILURE');
});
test('ambiguous multi-version deployment stops before metadata or probes',async()=>{
 const m=fixture({mutate:({kind,index,raw})=>{if(kind==='provider'&&index===0)raw.deployments[0].versions.push({...raw.deployments[0].versions[0]});}}),r=await stopped(m);
 assert.equal(r.providerObservations[0].outcome,'RESULT_SHAPE_FAILURE');assert.equal(m.calls.length,1);
});
for(const [label,response]of [
 ['unexpected200',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:200})],
 ['cookie',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Set-Cookie':'fixture='+canary,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})],
 ['cache',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'public','X-Content-Type-Options':'nosniff'}})],
 ['nosniff',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}})],
 ['extra body',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE',detail:canary},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})],
 ['large body',()=>new Response('x'.repeat(1025),{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})]
]){
 test('PAUSED '+label+' fails closed after one probe without final reads or body leakage',async()=>{
  const m=fixture({response:({kind,index})=>kind==='probe'&&index===0?response():null}),r=await stopped(m);
  assert.equal(m.calls.length,3);assert.equal(r.explicitCloudflareGetAttempts,2);assert.equal(r.pausedProbeAttempts,1);assert.equal(r.pausedObservations[0].outcome,'PAUSED_RESPONSE_MISMATCH');
 });
}
test('third probe transport failure consumes exactly the remaining three probe attempts and no final reads',async()=>{
 const m=fixture({throwAt:5}),r=await stopped(m);assert.equal(r.pausedProbeAttempts,3);assert.equal(r.cumulativeInstallerAndCleanupHTTPAttempts,8);assert.equal(r.explicitCloudflareGetAttempts,2);assert.equal(m.calls.length,5);
});
for(const index of [2,3]){
 test('final version drift at provider step '+index+' leaves cleanup and future write clearance false',async()=>{
  const m=fixture({mutate:({kind,index:i,raw})=>{if(kind==='provider'&&i===index)raw.deployments[0].versions[0].version_id='00000000-0000-4000-8000-000000000999';}}),r=await stopped(m);
  assert.equal(r.pausedProbeAttempts,3);assert.equal(r.explicitCloudflareGetAttempts,index+1);assert.equal(r.providerObservations[index].outcome,'VERSION_MISMATCH');assert.equal(r.futureWriteClearance,false);assert.equal(r.cleanupVerified,false);
 });
}
test('strict receipt rejects extra payloads, altered budget and accidental ownership/activation claims',async()=>{
 const m=fixture(),r=await verifyReadOnlyFinalFence(m);
 for(const change of [x=>x.raw=canary,x=>x.cleanupVerified=true,x=>x.mainOwnedVersionAdopted=true,x=>x.futureWriteClearance=true,x=>x.cumulativeExplicitGetAttempts=56,x=>x.providerObservations[0].versionId=canary]){
  const x=structuredClone(r);change(x);assert.throws(()=>assertFinalFenceReceipt(x));
 }
});
test('proposal workflow has source checks only and no execution/private/credential/deployment capability',()=>{
 const s=readFileSync(new URL('../../.github/workflows/jwt-feature-readonly-final-fence-source.yml',import.meta.url),'utf8');
 assert(s.includes('validation/jwt-feature-readonly-final-fence-20261107'));assert(s.includes('contents: read'));
 for(const forbidden of ['workflow_dispatch','environment:','secrets.','CLOUDFLARE_API_TOKEN','wrangler','git push','promote',' execute'])assert(!s.includes(forbidden));
 assert.equal(p.budget.priorExplicitGets,56);assert.equal(p.budget.maxCumulativeExplicitGets,60);assert.equal(p.budget.maxCumulativeInstallerAndCleanupHTTPAttempts,8);assert.equal(p.effects.hostedWrites,0);assert.equal(p.limits.executionWorkflowProvided,false);
});

test('changed saved MAIN evidence fails its immutable hash before any facts can be accepted',()=>{
 assert.throws(()=>acceptedMainObservation(Buffer.from('{}')),/ACCEPTED_RECEIPT_CHANGED/);
});
