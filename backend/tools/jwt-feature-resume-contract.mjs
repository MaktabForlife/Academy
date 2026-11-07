// An interrupted reference is NOT a successful installation or an owned upload.
// This source-only contract grants no lease, provider call or activation.
import assert from 'node:assert/strict';
import {canonical,digest,assertHostConfig,targets} from './jwt-feature-upload-artifact.mjs';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
export function interruptedProfiles({reference,configs,source,coordinatorSourceDigest,coordinatorReplacement}){
 assert.deepEqual(Object.keys(reference).sort(),['claims','namespaces','referenceVersions','schema','state']);
 assert.equal(reference.schema,1);assert.equal(reference.state,'INTERRUPTED_PAUSED_REFERENCE');
 assert.deepEqual(reference.claims,{installationVerified:false,referenceVersionsOwned:false,schemaAndSeedAttestedHere:false,compiledCodeAttested:false,privateKeyAttested:false,routingAtomicityAttested:false});
 assert.deepEqual(Object.keys(reference.referenceVersions).sort(),[...targets].sort());
 for(const n of targets)assert(uuid(reference.referenceVersions[n]));
 assert.deepEqual(Object.keys(reference.namespaces).sort(),['split','timetable']);
 for(const id of Object.values(reference.namespaces))assert.match(id,/^[a-f0-9]{32}$/);
 assert.equal(new Set(Object.values(reference.namespaces)).size,2);
 assert.match(source,/^[a-f0-9]{40}$/);assert.match(coordinatorSourceDigest,/^[a-f0-9]{64}$/);
 assert.deepEqual(Object.keys(configs).sort(),['coordinator','worker']);
 for(const c of Object.values(configs))assertHostConfig(c);
 assert.equal(configs.worker.vars.ACADEMY_D1_MODE,'PAUSED');
 for(const k of ['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'])assert.equal(configs.worker.vars[k],'0');
 // Full reviewed deployment configurations, never metadata-only templates.
 assert.equal(configs.worker.assets.directory,'../.academy-jwt-public');
 assert.equal(configs.worker.name,targets[0]);assert.equal(configs.coordinator.name,targets[1]);
 assert.deepEqual(configs.worker.d1_databases,configs.coordinator.d1_databases);
 assert(configs.worker.d1_databases.length===4);
 assert.equal(typeof coordinatorReplacement,'boolean');
 return {mode:'PAUSED_RESUME',before:structuredClone(configs),paused:structuredClone(configs),origin:'https://feature_worker.maktab4life.workers.dev',reference:structuredClone(reference),coordinatorSourceDigest,coordinatorChanged:coordinatorReplacement};
}
export function assertWritePolicy({policy,policySHA256,source,references,artifacts,mode}){
 assert.match(policySHA256||'',/^[a-f0-9]{64}$/);assert.equal(digest(canonical(policy)),policySHA256,'WRITE_POLICY_CHANGED');
 assert.deepEqual(Object.keys(policy).sort(),['budgets','firstWrites','kind','mode','oldAllowanceReusable','recovery','referenceVersions','schema','sourceBinding']);
 assert.equal(policy.schema,1);assert.equal(policy.kind,'REVIEWED_EXISTING_FEATURE_SCRIPT_REPLACEMENT');
 assert.equal(policy.sourceBinding,'EXACT_APPROVED_FEATURE_TREE');
 assert.match(source,/^[a-f0-9]{40}$/);assert.equal(policy.mode,mode);
 assert.equal(policy.oldAllowanceReusable,false,'EXHAUSTED_ALLOWANCE_NOT_RENEWABLE');
 assert.deepEqual(policy.referenceVersions,references);
 for(const n of targets)assert(uuid(references[n]));
 const b=policy.budgets;assert.deepEqual(Object.keys(b).sort(),['metadataGETs','pausedGETs','publicGETs','smokeRequests','uploads']);
 for(const [k,cap]of Object.entries({metadataGETs:36,uploads:3,publicGETs:3,smokeRequests:8,pausedGETs:1}))assert(Number.isSafeInteger(b[k])&&b[k]>=0&&b[k]<=cap);
 assert(b.metadataGETs>0&&b.uploads>0);
 if(mode==='PAUSED_RESUME'){assert.equal(b.smokeRequests,0);assert.equal(b.publicGETs,0);assert.equal(policy.recovery,null);}
 for(const [n,id]of Object.entries(policy.firstWrites)){
  assert(targets.includes(n));assert.match(id,/^[a-f0-9]{64}$/);
  assert.equal(artifacts[n]?.artifactSHA256,id,'FIRST_WRITE_ARTIFACT_NOT_REVIEWED');
 }
 assert(Object.keys(policy.firstWrites).length>0);
 if(policy.recovery!==null){
  assert.deepEqual(Object.keys(policy.recovery).sort(),['artifactSHA256','target']);
  assert.equal(policy.recovery.target,targets[0]);assert.equal(policy.recovery.artifactSHA256,artifacts.pausedWorker?.artifactSHA256);
 }
 return structuredClone(policy);
}
