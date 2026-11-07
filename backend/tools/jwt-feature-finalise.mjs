// SOURCE-ONLY adapter/controller proposal. No CLI, workflow_dispatch, deployment,
// initializer, SQL, seed, R2, private-key generation or activation entry exists.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {account,names,workerFirst} from './jwt-feature-transition.mjs';
import {temporarySecrets,finalSecrets,origin} from './jwt-feature-install-package.mjs';
import {assertRemoteProfile,currentVersion,sanitiseSettings} from './jwt-feature-install-metadata.mjs';
const deepFreeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')deepFreeze(v);return Object.freeze(x);};
export const finalisationPlan=deepFreeze(JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-finalisation-proposal.json',import.meta.url),'utf8')));
const targets=['feature_worker','academy-feature-split-coordinator'];
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
function pinnedJSON(path,sha){
 const b=readFileSync(new URL(path,import.meta.url));
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),sha,'REVIEWED_PROFILE_SOURCE_CHANGED');
 return JSON.parse(b);
}
// These are exact expected metadata templates, NOT Wrangler/deployment configs
// or fabricated schema/seed/cleanup receipts. No installed data is read here.
export function expectedPausedMetadataProfiles(){
 const baseWorker=pinnedJSON('../wrangler.feature.jsonc','61da7dabe48e4cf7bb63d6111b8c8465d06399a2');
 const baseCoordinator=pinnedJSON('../wrangler.feature-coordinator.jsonc','b80be0974a7ab248bcdeeaf0ead8423ef340868c');
 const baseline=pinnedJSON('../../config/feature-initialisation-receipt.json','805518e531734d4c8262abec30e908bfadba516b');
 const p=finalisationPlan;
 assert.equal(p.account,account);assert.equal(baseline.sourceDigest,p.nativeBaselineRun);
 assert.deepEqual(baseWorker.d1_databases,baseCoordinator.d1_databases);
 const fields=c=>Object.fromEntries(['name','compatibility_date','compatibility_flags','observability','d1_databases','r2_buckets','ratelimits','durable_objects','secrets','vars'].filter(k=>Object.hasOwn(c,k)).map(k=>[k,structuredClone(c[k])]));
 const worker=fields(baseWorker),coordinator=fields(baseCoordinator);
 const fresh=p.databaseIds.map((database_id,i)=>({binding:i?'JWT_V110_ADMIN_DB':'JWT_V110_CORE_DB',database_name:names[i],database_id}));
 const vars={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',JWT_V110_NATIVE_RUN_ID:p.nativeRun,JWT_V110_OBJECT_NAMESPACE:'jwt-feature-v110/20261106a/'};
 for(const c of [worker,coordinator]){
  c.d1_databases.push(...fresh);
  c.vars={...(c.vars||{}),ACADEMY_D1_RUN_ID:baseline.sourceDigest,...vars,JWT_FEATURE_INSTALL_SOURCE:p.originalSource,JWT_FEATURE_INSTALL_OWNER:p.originalOwner};
 }
 worker.vars={...worker.vars,ACADEMY_D1_MODE:'PAUSED',JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0',JWT_V110_COOKIE_MODE:'HOST_ONLY_PREVIEW',JWT_V110_REQUEST_ORIGIN:origin,JWT_V110_RELEASE_ID:p.originalSource,JWT_V110_SIGNING_KID:p.publicSigningKey.kid,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([p.publicSigningKey])};
 worker.secrets.required.push(...finalSecrets);
 worker.ratelimits.push({name:'JWT_V110_RATE_LIMITER',namespace_id:'100112',simple:{limit:10,period:60}});
 worker.assets={binding:'ASSETS',run_worker_first:[...workerFirst],not_found_handling:'none'};
 worker.durable_objects.bindings.push({name:'JWT_V110_TIMETABLE_COORDINATOR',class_name:'JWTFeatureProgramTimetableCoordinator'},{name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator',script_name:coordinator.name});
 coordinator.durable_objects.bindings.push({name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator'});
 return {worker,coordinator,baseline};
}
async function boundedJSON(response,limit){
 assert(response.body,'EMPTY_RESPONSE');const reader=response.body.getReader(),chunks=[];let total=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;assert(total<=limit,'RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createFinalisationOps({token,fresh,fetcher=fetch,save=()=>{}}){
 assert(typeof token==='string'&&token.length>0,'FEATURE_TOKEN_REQUIRED');
 assert.equal(typeof fresh,'function','REVIEWED_APPROVAL_AND_EXCLUSIVE_LEASE_CALLBACK_REQUIRED');
 const p=finalisationPlan,profiles=expectedPausedMetadataProfiles(),namespaces={...p.freshNamespaces};
 const report={explicitCloudflareGetAttempts:0,secretPatchAttempts:0,secretPatchAcknowledged:false,pausedProbeAttempts:0};
 let observedAfterPatch=null;
 const budget=()=>({priorExplicitGets:p.budget.priorExplicitGets,...report,cumulativeInstallerAndCleanupHTTPAttempts:5+report.pausedProbeAttempts,cumulativeSecretBulkPatchAttempts:1+report.secretPatchAttempts,mutationOutcomeUnknown:report.secretPatchAttempts>0&&!report.secretPatchAcknowledged,cumulativeExplicitGetAttempts:p.budget.priorExplicitGets+report.explicitCloudflareGetAttempts,originalHardCombinedGetLimit:p.budget.originalHardLimit,countsAreFetchAttempts:true});
 async function cf(name,kind,method='GET'){
  assert(targets.includes(name));assert(['deployments','settings','subdomain','schedules','secrets-bulk'].includes(kind));
  await fresh(); // Future live entry must enforce exact Root approval, source and exclusive lease.
  const options={method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}};
  if(method==='GET'){
   assert.notEqual(kind,'secrets-bulk');report.explicitCloudflareGetAttempts++;
   assert(report.explicitCloudflareGetAttempts<=18&&budget().cumulativeExplicitGetAttempts<=60,'ORIGINAL_GET_BUDGET');
  }else{
   assert.equal(method,'PATCH');assert.equal(name,targets[0]);assert.equal(kind,'secrets-bulk');
   assert.equal(report.secretPatchAttempts,0,'SECRET_PATCH_NO_RETRY');report.secretPatchAttempts++;
   options.headers['Content-Type']='application/json';
   options.body=JSON.stringify({secrets:Object.fromEntries(temporarySecrets.map(n=>[n,null]))});
  }
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/'+kind,options);
  assert(r.ok,'CF_HTTP_FAILURE');const b=await boundedJSON(r,1024*1024);assert.equal(b.success,true,'CF_PROVIDER_FAILURE');
  if(method==='PATCH'){report.secretPatchAcknowledged=true;return;} // Never retain mutation result/secret-shaped values.
  return kind==='settings'?sanitiseSettings(b.result):b.result;
 }
 async function pair({expected,temporary,addresses=false}){
  const result={};
  for(const name of targets){
   const version=currentVersion(await cf(name,'deployments'));if(expected[name]!==null)assert.equal(version,expected[name],'VERSION_NOT_REVIEWED');
   const profile=name===targets[0]?profiles.worker:profiles.coordinator;
   const secretNames=name===targets[0]?[...profiles.worker.secrets.required,...(temporary?temporarySecrets:[])]:[];
   assertRemoteProfile(await cf(name,'settings'),profile,profiles.baseline,namespaces,{secretNames});
   result[name]=version;
   if(addresses){
    const sub=await cf(name,'subdomain');assert.equal(sub.enabled,name===targets[0]);assert.equal(sub.previews_enabled,false,'PREVIEW_URLS');
    const schedules=await cf(name,'schedules');assert.deepEqual(Array.isArray(schedules)?schedules:schedules.schedules,[],'SCHEDULES_FORBIDDEN');
   }
  }
  return result;
 }
 return {
  async preflight(){await pair({expected:p.observedVersions,temporary:true,addresses:true});},
  async removeTemporarySecrets(){
   // Last fresh exact version+FULL profile check before the single mutation.
   // Cloudflare offers no documented CAS here; exclusive lease remains essential.
   await pair({expected:p.observedVersions,temporary:true});
   await cf(targets[0],'secrets-bulk','PATCH');
  },
  async observeAfterPatch(){
   observedAfterPatch=await pair({expected:{[targets[0]]:null,[targets[1]]:p.observedVersions[targets[1]]},temporary:false});
   assert.notEqual(observedAfterPatch[targets[0]],p.observedVersions[targets[0]],'PATCH_NEW_VERSION_NOT_OBSERVED');
  },
  async pausedProbes(){
   for(const path of p.budget.workerProbePaths){
    await fresh();report.pausedProbeAttempts++;assert(report.pausedProbeAttempts<=3,'PAUSED_PROBE_BUDGET');
    const r=await fetcher(origin+path,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.equal(r.status,503,'PAUSED_STATUS');assert.equal(r.headers.get('set-cookie'),null,'PAUSED_COOKIE');
    assert(r.headers.get('cache-control')?.includes('no-store'),'PAUSED_CACHE');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff','PAUSED_NOSNIFF');
    assert.deepEqual(await boundedJSON(r,1024),{code:'FEATURE_JWT_UNAVAILABLE'},'PAUSED_BODY');
   }
  },
  async finalVersionFence(){
   assert(observedAfterPatch);for(const name of targets)assert.equal(currentVersion(await cf(name,'deployments')),observedAfterPatch[name],'VERSION_CHANGED_AFTER_PATCH');
   await fresh();
  },
  save,
  evidence(){return {...budget(),observedAfterPatch:observedAfterPatch?{...observedAfterPatch}:null};}
 };
}
export async function finaliseOwnedFeature({ops}){
 const evidence={schema:1,state:'NOT_STARTED',originalSource:finalisationPlan.originalSource,originalOwner:finalisationPlan.originalOwner,cleanupVerified:false,activated:false,codeContentVerified:false,assetRoutingReadbackVerified:false,metadataObservationsAtomic:false,notActivationReceipt:true,workerCodeUploads:0,coordinatorUploads:0,configPatches:0,schemaSeedRequests:0,r2Operations:0,credentialGeneration:0,automaticRecoveryWrites:0};
 const save=()=>ops.save({...evidence,...ops.evidence()});
 try{
  save();await ops.preflight();evidence.state='REVIEWED_METADATA_MATCHED';save();
  await ops.removeTemporarySecrets();evidence.state='TEMPORARY_DELETION_ACKNOWLEDGED';save();
  await ops.observeAfterPatch();await ops.pausedProbes();await ops.finalVersionFence();
  evidence.state='OWNED_PAUSED_CLEANUP_OBSERVED';evidence.cleanupVerified=true;save();
  return {...evidence,...ops.evidence()};
 }catch{
  evidence.state='FINALISATION_STOPPED_NO_RETRY_NO_OVERWRITE';save();
  throw Object.assign(Error('OWNED_FINALISATION_STOPPED'),{evidence:{...evidence,...ops.evidence()}});
 }
}
