// Truthful accepted PAUSED-replacement basis. Never constructs a legacy VERIFIED install.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {firstReplacementInputs} from './jwt-feature-first-replacement-inputs.mjs';
import {assertIdentityShape} from './jwt-feature-first-replacement-approved.mjs';
import {canonical,digest,assertHostConfig} from './jwt-feature-upload-artifact.mjs';
export const activationFlags=['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'];
export const activationBudgets=Object.freeze({metadataGETs:24,uploads:2,publicGETs:3,smokeRequests:8,pausedGETs:1});
export const basisBinding=Object.freeze(JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-activation-basis.json',import.meta.url),'utf8')));
const main='feature_worker',coord='academy-feature-split-coordinator',hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const keys=(v,k)=>assert.deepEqual(Object.keys(v).sort(),[...k].sort());
export function parsePausedReplacement(bytes,binding=basisBinding){
 assert(bytes.length<=131072);assert.equal(digest(bytes),binding.fileSHA256,'ACCEPTED_PAUSED_FILE_CHANGED');
 const r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 keys(r,['schema','state','run','planSHA256','policySHA256','artifactSHA256','identity','actual','reserved','ack','ownedMainVersion','observedVersions','remainingAllowanceReusable','wranglerInternalRequestsAndRetries','activated','cleanupVerified','legacyInstallationVerified','privateKeyVerified','remoteCodeReadbackVerified','assetRoutingReadbackVerified','metadataAtomic','hostedBilling']);
 assert.equal(r.schema,1);assert.equal(r.state,'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION');
 assert.deepEqual(r.run,{source:binding.source,runId:String(binding.run),attempt:1});
 for(const k of ['planSHA256','policySHA256','artifactSHA256'])assert.equal(r[k],binding[k]);
 assertIdentityShape(r.identity,{source:binding.source,runId:String(binding.run)});
 assert.equal(r.identity.approval.merge,binding.canonicalMerge);
 assert.deepEqual(r.actual,{provider:26,cli:1,paused:1});assert.deepEqual(r.reserved,{metadataGETs:26,cli:1,pausedGETs:1});
 keys(r.ack,['schema','target','versionId','source','configSHA256','wranglerVersion','kind','artifactSHA256']);
 assert.equal(r.ack.schema,1);assert.equal(r.ack.target,main);assert.equal(r.ack.source,binding.source);
 assert.equal(r.ack.kind,'PINNED_CLI_DEPLOY_ACK');assert.equal(r.ack.wranglerVersion,'4.136.3');
 assert.equal(r.ack.artifactSHA256,binding.artifactSHA256);assert(hex.test(r.ack.configSHA256));assert(uuid.test(r.ack.versionId));
 assert.equal(r.ownedMainVersion,r.ack.versionId);
 const {reference,configs}=firstReplacementInputs();
 assert.deepEqual(r.observedVersions,{[main]:r.ownedMainVersion,[coord]:reference.referenceVersions[coord]});
 for(const k of ['remainingAllowanceReusable','activated','cleanupVerified','legacyInstallationVerified','privateKeyVerified','remoteCodeReadbackVerified','assetRoutingReadbackVerified','metadataAtomic'])assert.equal(r[k],false,'UNSUPPORTED_LEGACY_OR_REMOTE_ATTESTATION');
 assert.equal(r.wranglerInternalRequestsAndRetries,'separate-unmeasured');assert.equal(r.hostedBilling,'unmeasured');
 // ACK config hash is exact run-specific rendered bytes, not the reproducible logical hash.
 return {kind:'PAUSED_REPLACEMENT_RECEIPT',receiptRun:binding.run,receiptFileSHA256:binding.fileSHA256,
  referenceVersions:{[main]:r.ownedMainVersion,[coord]:r.observedVersions[coord]},
  baselineOwnedVersions:{[main]:r.ownedMainVersion},coordinatorReferenceOnly:true,
  namespaces:reference.namespaces,before:configs,
  inheritedAttestations:{installationVerified:false,cleanupVerified:false,legacyInstallationVerified:false,privateKeyVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false},
  schemaSeedProvenance:'HISTORICAL_INSTALL_STOPPED_SOURCE_CONTROL_FLOW_ONLY_NOT_NEW_DB_READBACK'};
}
export function activationConfigurations(source){
 assert.match(source,/^[a-f0-9]{40}$/);
 const {configs}=firstReplacementInputs(),active=structuredClone(configs),paused=structuredClone(configs);
 for(const [c,mode,enabled]of [[active,'ACTIVE','1'],[paused,'PAUSED','0']]){
  Object.assign(c.worker.vars,{ACADEMY_D1_MODE:mode,JWT_V110_RELEASE_ID:source});
  for(const k of activationFlags)c.worker.vars[k]=enabled;
  assertHostConfig(c.worker);assertHostConfig(c.coordinator);
  assert.deepEqual(c.worker.d1_databases,configs.worker.d1_databases);
  assert.deepEqual(c.worker.durable_objects,configs.worker.durable_objects);
  assert.deepEqual(c.coordinator,configs.coordinator,'COORDINATOR_WRITE_NOT_SELECTED');
 }
 return {before:configs,active,paused};
}
export function activationProfiles({bytes,binding=basisBinding,source,coordinatorSourceDigest}){
 const pausedBasis=parsePausedReplacement(bytes,binding);
 assert.equal(coordinatorSourceDigest,'8bdc622649bd20ceb3bc531b1161c7f42495105211a51f9e3dc2b8415f216465','UNREVIEWED_COORDINATOR_SOURCE');
 const c=activationConfigurations(source);assert.deepEqual(c.before,pausedBasis.before);
 return {mode:'ACTIVE',...c,pausedBasis,origin:'https://feature_worker.maktab4life.workers.dev',coordinatorSourceDigest,coordinatorChanged:false};
}
export function activationPolicy(profiles,artifacts){
 assert.equal(profiles.pausedBasis.kind,'PAUSED_REPLACEMENT_RECEIPT');assert.equal(profiles.coordinatorChanged,false);
 return {schema:1,kind:'REVIEWED_EXISTING_FEATURE_SCRIPT_REPLACEMENT',sourceBinding:'EXACT_APPROVED_FEATURE_TREE',mode:'ACTIVE',oldAllowanceReusable:false,
  referenceVersions:{...profiles.pausedBasis.referenceVersions},firstWrites:{feature_worker:artifacts.feature_worker.artifactSHA256},
  recovery:{target:main,artifactSHA256:artifacts.pausedWorker.artifactSHA256},budgets:{...activationBudgets}};
}
