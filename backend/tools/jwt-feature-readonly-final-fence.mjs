// SOURCE ONLY: no CLI, default fetch, private environment or execution workflow.
// Import is inert. A later exact protected wiring/effects review is still required.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {expectedPausedMetadataProfiles} from './jwt-feature-finalise.mjs';
import {assertRemoteProfile,currentVersion} from './jwt-feature-install-metadata.mjs';
import {assertSafeDiagnosticReceipt} from './jwt-feature-main-postpatch-inspect.mjs';
const freeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')freeze(v);return Object.freeze(x);};
export const finalFencePlan=freeze(JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-readonly-final-fence.json',import.meta.url),'utf8')));
const p=finalFencePlan,sha256=b=>createHash('sha256').update(b).digest('hex');
const main='feature_worker',coordinator='academy-feature-split-coordinator';
const states=new Set(['NOT_STARTED','FINAL_FENCE_STOPPED_NO_RETRY','FINAL_FENCE_CAPTURED_NO_OWNERSHIP_OR_ACTIVATION_CLEARANCE']);
const outcomes=new Set(['PENDING','CAPTURED','TRANSPORT_FAILURE','HTTP_FAILURE','BODY_FAILURE','PROVIDER_FAILURE','RESULT_SHAPE_FAILURE','VERSION_MISMATCH','METADATA_MISMATCH','PAUSED_RESPONSE_MISMATCH']);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const exact=(o,keys)=>assert.deepEqual(Object.keys(o).sort(),[...keys].sort(),'RECEIPT_SHAPE');
export function acceptedMainObservation(bytes=readFileSync(new URL('../../deployment/jwt-feature-accepted-main-observation.json',import.meta.url))){
 assert.equal(sha256(bytes),p.acceptedMainObservation.receiptSHA256,'ACCEPTED_RECEIPT_CHANGED');
 const r=JSON.parse(bytes),{execution,...base}=r;assertSafeDiagnosticReceipt(base);
 assert.equal(base.state,'READ_ONLY_MAIN_OBSERVATIONS_CAPTURED_NO_RECOVERY_AUTHORITY');
 assert.equal(base.cumulativeExplicitGetAttempts,56);assert.equal(base.explicitGetAttempts,2);
 assert.equal(execution.source,p.sourceBase);assert.equal(execution.approvalPR,14);
 assert.equal(execution.approvalMerge,'eb9a8abde5e639d30388a5300d9ec2845af9dbe4');
 const d=base.observations[0],s=base.observations[1];
 assert.equal(d.httpStatus,200);assert.equal(s.httpStatus,200);
 assert.equal(d.deployment.currentVersion,p.acceptedMainObservation.referenceVersion);
 assert.equal(d.deployment.ownedVersionAdopted,false);
 assert.equal(s.settings.expectedMetadataMatches,true);assert.equal(s.settings.originalSourceMatches,true);assert.equal(s.settings.originalOwnerMatches,true);
 assert.equal(s.settings.mismatchCount,0);
 for(const name of ['JWT_FEATURE_SETUP_PIN','JWT_FEATURE_SETUP_AUTH']){
  const b=s.settings.secretPresence.find(x=>x.name===name);assert(b&&!b.present&&!b.hasSecretType);
 }
 assert.equal(s.settings.secretPresence.filter(x=>x.present&&x.hasSecretType).length,6);
 return freeze(r);
}
function initialReceipt(){
 return {schema:1,state:'NOT_STARTED',checksPassed:false,providerObservations:[],pausedObservations:[],
 priorExplicitGets:56,explicitCloudflareGetAttempts:0,cumulativeExplicitGetAttempts:56,originalHardGetLimit:60,
 priorInstallerAndCleanupHTTPAttempts:5,pausedProbeAttempts:0,cumulativeInstallerAndCleanupHTTPAttempts:5,originalInstallerAndCleanupHTTPBudget:8,
 countsAreFetchAttempts:true,hostedWrites:0,secretWrites:0,sqlRequests:0,codeUploads:0,r2Operations:0,keyGeneration:0,
 cleanupVerified:false,activated:false,mainOwnedVersionAdopted:false,codeContentVerified:false,keyMaterialVerified:false,assetRoutingVerified:false,
 metadataObservationsAtomic:false,deploymentVersionBindsSettings:false,currentMainSettingsReread:false,
 coordinatorVersionSampleAfterProbes:true,mainObservationValidated:false,mainTemporaryNamesAbsentInAcceptedObservation:false,
 coordinatorMetadataMatched:false,mainPreprobeVersionMatched:false,mainFinalVersionMatched:false,coordinatorFinalVersionMatched:false,
 historicalFailureCause:'UNKNOWN_NO_RAW_POST_SETTINGS_SAVED',hostedD1Usage:'UNMEASURED_EXPECTED_ZERO_FROM_REVIEWED_PAUSED_SOURCE',
 futureWriteClearance:false};
}
const scalarKeys=Object.keys(initialReceipt());
export function assertFinalFenceReceipt(r){
 exact(r,scalarKeys);assert.equal(r.schema,1);assert(states.has(r.state));
 assert.equal(r.priorExplicitGets,56);assert(Number.isInteger(r.explicitCloudflareGetAttempts)&&r.explicitCloudflareGetAttempts>=0&&r.explicitCloudflareGetAttempts<=4);
 assert.equal(r.cumulativeExplicitGetAttempts,56+r.explicitCloudflareGetAttempts);assert.equal(r.originalHardGetLimit,60);
 assert.equal(r.priorInstallerAndCleanupHTTPAttempts,5);assert(Number.isInteger(r.pausedProbeAttempts)&&r.pausedProbeAttempts>=0&&r.pausedProbeAttempts<=3);
 assert.equal(r.cumulativeInstallerAndCleanupHTTPAttempts,5+r.pausedProbeAttempts);assert.equal(r.originalInstallerAndCleanupHTTPBudget,8);
 for(const k of ['hostedWrites','secretWrites','sqlRequests','codeUploads','r2Operations','keyGeneration'])assert.equal(r[k],0);
 for(const k of ['cleanupVerified','activated','mainOwnedVersionAdopted','codeContentVerified','keyMaterialVerified','assetRoutingVerified','metadataObservationsAtomic','deploymentVersionBindsSettings','currentMainSettingsReread','futureWriteClearance'])assert.equal(r[k],false);
 for(const k of ['countsAreFetchAttempts','coordinatorVersionSampleAfterProbes'])assert.equal(r[k],true);
 for(const k of ['checksPassed','mainObservationValidated','mainTemporaryNamesAbsentInAcceptedObservation','coordinatorMetadataMatched','mainPreprobeVersionMatched','mainFinalVersionMatched','coordinatorFinalVersionMatched'])assert.equal(typeof r[k],'boolean');
 assert.equal(r.mainTemporaryNamesAbsentInAcceptedObservation,r.mainObservationValidated);
 assert.equal(r.historicalFailureCause,'UNKNOWN_NO_RAW_POST_SETTINGS_SAVED');assert.equal(r.hostedD1Usage,'UNMEASURED_EXPECTED_ZERO_FROM_REVIEWED_PAUSED_SOURCE');
 const successStatus=n=>Number.isInteger(n)&&n>=200&&n<=299;
 const validStatus=n=>n===null||Number.isInteger(n)&&n>=100&&n<=599;
 const beforeBody=new Set(['PENDING','TRANSPORT_FAILURE']);
 const providerOutcomes=new Set(['PENDING','CAPTURED','TRANSPORT_FAILURE','HTTP_FAILURE','BODY_FAILURE','PROVIDER_FAILURE','RESULT_SHAPE_FAILURE','VERSION_MISMATCH','METADATA_MISMATCH']);
 assert(Array.isArray(r.providerObservations)&&r.providerObservations.length===r.explicitCloudflareGetAttempts);
 for(let i=0;i<r.providerObservations.length;i++){
  const o=r.providerObservations[i],step=p.fixedProviderSequence[i];
  exact(o,['script','endpoint','attempt','outcome','httpStatus','providerCodes','versionId','versionMatches','profileMatches']);
  assert.equal(o.script,step.script);assert.equal(o.endpoint,step.endpoint);assert.equal(o.attempt,i+1);
  assert(providerOutcomes.has(o.outcome));assert(validStatus(o.httpStatus));
  assert(Array.isArray(o.providerCodes)&&o.providerCodes.length<=8&&o.providerCodes.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647));
  assert(o.versionId===null||uuid.test(o.versionId));for(const k of ['versionMatches','profileMatches'])assert(o[k]===null||typeof o[k]==='boolean');
  if(beforeBody.has(o.outcome)){assert.equal(o.httpStatus,null);assert.deepEqual(o.providerCodes,[]);}
  else if(o.outcome==='HTTP_FAILURE')assert(!successStatus(o.httpStatus));
  else assert(successStatus(o.httpStatus));
  if(step.endpoint==='deployments'){
   assert.equal(o.profileMatches,null);
   const expected=step.script===main?p.acceptedMainObservation.referenceVersion:p.lastReviewedCoordinatorVersion;
   if(o.outcome==='CAPTURED'){assert.equal(o.versionId,expected);assert.equal(o.versionMatches,true);}
   else if(o.outcome==='VERSION_MISMATCH'){assert(o.versionId!==null&&o.versionId!==expected);assert.equal(o.versionMatches,false);}
   else{assert.notEqual(o.outcome,'METADATA_MISMATCH');assert.equal(o.versionId,null);assert.equal(o.versionMatches,null);}
  }else{
   assert.equal(o.versionId,null);assert.equal(o.versionMatches,null);assert.notEqual(o.outcome,'VERSION_MISMATCH');
   if(o.outcome==='CAPTURED')assert.equal(o.profileMatches,true);
   else if(o.outcome==='METADATA_MISMATCH')assert.equal(o.profileMatches,false);
   else assert.equal(o.profileMatches,null);
  }
  if(i<r.providerObservations.length-1)assert.equal(o.outcome,'CAPTURED');
 }
 assert(Array.isArray(r.pausedObservations)&&r.pausedObservations.length===r.pausedProbeAttempts);
 for(let i=0;i<r.pausedObservations.length;i++){
  const o=r.pausedObservations[i];exact(o,['path','attempt','outcome','httpStatus','responseMatches']);
  assert.equal(o.path,p.pausedProbePaths[i]);assert.equal(o.attempt,i+1);
  assert(['PENDING','CAPTURED','TRANSPORT_FAILURE','PAUSED_RESPONSE_MISMATCH'].includes(o.outcome));
  assert(validStatus(o.httpStatus));assert.equal(typeof o.responseMatches,'boolean');
  if(o.outcome==='CAPTURED'){assert.equal(o.httpStatus,503);assert.equal(o.responseMatches,true);}
  else{assert.equal(o.responseMatches,false);if(beforeBody.has(o.outcome))assert.equal(o.httpStatus,null);}
  if(i<r.pausedObservations.length-1)assert.equal(o.outcome,'CAPTURED');
 }
 const captured=i=>r.providerObservations[i]?.outcome==='CAPTURED';
 assert.equal(r.mainPreprobeVersionMatched,captured(0));
 assert.equal(r.coordinatorMetadataMatched,captured(1));
 assert.equal(r.mainFinalVersionMatched,captured(2));
 assert.equal(r.coordinatorFinalVersionMatched,captured(3));
 if(r.providerObservations.length||r.pausedObservations.length)assert.equal(r.mainObservationValidated,true);
 if(r.pausedObservations.length)assert(captured(0)&&captured(1));
 if(r.providerObservations.length>=3){
  assert.equal(r.pausedObservations.length,3);assert(r.pausedObservations.every(x=>x.outcome==='CAPTURED'));
 }
 if(r.state==='FINAL_FENCE_CAPTURED_NO_OWNERSHIP_OR_ACTIVATION_CLEARANCE'){
  assert(r.checksPassed&&r.explicitCloudflareGetAttempts===4&&r.pausedProbeAttempts===3&&r.mainObservationValidated);
  assert(r.providerObservations.every(x=>x.outcome==='CAPTURED'));assert(r.pausedObservations.every(x=>x.outcome==='CAPTURED'));
 }else assert.equal(r.checksPassed,false);
 return r;
}
// Concrete proposed writer for a later reviewed runner-temp binding. Synchronous
// bounded local receipt write only; no CLI/private environment or live transport.
export function createSyncFinalFenceReceiptWriter(directory){
 assert(typeof directory==='string'&&isAbsolute(directory),'ABSOLUTE_RECEIPT_DIRECTORY_REQUIRED');
 const file=resolve(directory,'final-fence-verification.json');
 return receipt=>{
  const bytes=JSON.stringify(assertFinalFenceReceipt(receipt),null,2)+'\n';
  assert(Buffer.byteLength(bytes)<=65536,'RECEIPT_SIZE');
  mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(file,bytes,{mode:0o600});
  // Deliberately returns undefined. Never accepts/returns a Promise.
 };
}
async function boundedJSON(response,max){
 assert(response.body);const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;assert(bytes<=max);chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const status=response=>Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
export async function verifyReadOnlyFinalFence({fresh,fetcher,getToken,save}){
 // No default transport/token/save: source/mock tests cannot select a live API.
 assert.equal(typeof fresh,'function');assert.equal(typeof fetcher,'function');assert.equal(typeof getToken,'function');assert.equal(typeof save,'function');
 const e=initialReceipt();let persistenceFailed=false;
 const persist=()=>{
  if(persistenceFailed)throw Error('SYNCHRONOUS_RECEIPT_PERSISTENCE_FAILED');
  try{
   // A reviewed bounded synchronous writer avoids a new asynchronous interval
   // between the fresh guard, recorded attempt and actual fetch.
   assert.notEqual(Object.prototype.toString.call(save),'[object AsyncFunction]');
   const result=save(structuredClone(assertFinalFenceReceipt(e)));
   if(result!==undefined){
    // Reject async wrappers too; consume their rejection without waiting,
    // fetching, or pretending that the receipt completed synchronously.
    if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});
    throw Error('SYNCHRONOUS_RECEIPT_WRITER_REQUIRED');
   }
  }catch{persistenceFailed=true;throw Error('SYNCHRONOUS_RECEIPT_PERSISTENCE_FAILED');}
 };
 try{
  persist();
  acceptedMainObservation();e.mainObservationValidated=true;e.mainTemporaryNamesAbsentInAcceptedObservation=true;persist();await fresh();
  const token=getToken();assert(typeof token==='string'&&token.length);
  async function provider(index){
   await fresh();const step=p.fixedProviderSequence[index];assert.equal(e.explicitCloudflareGetAttempts,index);
   e.explicitCloudflareGetAttempts++;e.cumulativeExplicitGetAttempts=56+e.explicitCloudflareGetAttempts;assert(e.cumulativeExplicitGetAttempts<=60);
   const o={script:step.script,endpoint:step.endpoint,attempt:index+1,outcome:'PENDING',httpStatus:null,providerCodes:[],versionId:null,versionMatches:null,profileMatches:null};e.providerObservations.push(o);persist();
   let response;
   try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+p.accountId+'/workers/scripts/'+step.script+'/'+step.endpoint,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}});}
   catch{o.outcome='TRANSPORT_FAILURE';persist();throw Error('PROVIDER_TRANSPORT');}
   o.httpStatus=status(response);let body;
   try{body=await boundedJSON(response,1048576);}catch{o.outcome=response.ok?'BODY_FAILURE':'HTTP_FAILURE';persist();throw Error('PROVIDER_BODY');}
   o.providerCodes=(Array.isArray(body?.errors)?body.errors:[]).slice(0,8).map(x=>x?.code).filter(x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647);
   if(!response.ok){o.outcome='HTTP_FAILURE';persist();throw Error('PROVIDER_HTTP');}
   if(body?.success!==true){o.outcome='PROVIDER_FAILURE';persist();throw Error('PROVIDER_FAILURE');}
   if(body.result===undefined){o.outcome='RESULT_SHAPE_FAILURE';persist();throw Error('PROVIDER_SHAPE');}
   if(step.endpoint==='deployments'){
    try{o.versionId=currentVersion(body.result);assert(uuid.test(o.versionId));}catch{o.versionId=null;o.outcome='RESULT_SHAPE_FAILURE';persist();throw Error('VERSION_SHAPE');}
    const expected=step.script===main?p.acceptedMainObservation.referenceVersion:p.lastReviewedCoordinatorVersion;
    o.versionMatches=o.versionId===expected;
    if(!o.versionMatches){o.outcome='VERSION_MISMATCH';persist();throw Error('VERSION_MISMATCH');}
    if(index===0)e.mainPreprobeVersionMatched=true;else if(step.script===main)e.mainFinalVersionMatched=true;else e.coordinatorFinalVersionMatched=true;
   }else{
    try{
     const {coordinator:c,baseline}=expectedPausedMetadataProfiles();
     assertRemoteProfile(body.result,c,baseline,{...pinnedNamespaces()},{secretNames:[]});o.profileMatches=true;e.coordinatorMetadataMatched=true;
    }catch{o.profileMatches=false;o.outcome='METADATA_MISMATCH';persist();throw Error('COORDINATOR_METADATA');}
   }
   o.outcome='CAPTURED';persist();
  }
  async function probe(index){
   await fresh();assert(e.mainPreprobeVersionMatched&&e.coordinatorMetadataMatched);
   e.pausedProbeAttempts++;e.cumulativeInstallerAndCleanupHTTPAttempts=5+e.pausedProbeAttempts;assert(e.cumulativeInstallerAndCleanupHTTPAttempts<=8);
   const o={path:p.pausedProbePaths[index],attempt:index+1,outcome:'PENDING',httpStatus:null,responseMatches:false};e.pausedObservations.push(o);persist();
   let response;
   try{response=await fetcher(p.probeOrigin+o.path,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});}
   catch{o.outcome='TRANSPORT_FAILURE';persist();throw Error('PROBE_TRANSPORT');}
   o.httpStatus=status(response);
   try{
    assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
    const cc=(response.headers.get('cache-control')||'').split(',').map(x=>x.trim().toLowerCase());assert(cc.includes('no-store'));
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(await boundedJSON(response,1024),{code:'FEATURE_JWT_UNAVAILABLE'});
   }catch{o.outcome='PAUSED_RESPONSE_MISMATCH';persist();throw Error('PAUSED_RESPONSE');}
   o.responseMatches=true;o.outcome='CAPTURED';persist();
  }
  await provider(0);await provider(1);
  for(let i=0;i<3;i++)await probe(i);
  await provider(2);await provider(3);await fresh();
  e.state='FINAL_FENCE_CAPTURED_NO_OWNERSHIP_OR_ACTIVATION_CLEARANCE';e.checksPassed=true;persist();
  return structuredClone(e);
 }catch{
  e.state='FINAL_FENCE_STOPPED_NO_RETRY';e.checksPassed=false;
  // A failed writer is never retried. Return no successful result or later call.
  if(!persistenceFailed)try{persist();}catch{}
  throw Object.assign(Error(persistenceFailed?'FINAL_FENCE_STOPPED_RECEIPT_PERSISTENCE_FAILED':'FINAL_FENCE_STOPPED_SEE_STRICT_RECEIPT'),{receipt:structuredClone(e)});
 }
}
function pinnedNamespaces(){return {split:'de95f15f19a54a9e9ba34e6e75f51847',timetable:'ab05473998dc4e93b792464f9e78e0e9'};}
