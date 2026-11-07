// Full deployment configurations from existing PUBLIC source, not metadata DTOs.
// This constructor never reads credentials, private receipts, remote state or SQL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertHostConfig,canonical,digest} from './jwt-feature-upload-artifact.mjs';
import {interruptedProfiles} from './jwt-feature-resume-contract.mjs';
const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
export const inputSourceBlobs=Object.freeze({
 'backend/wrangler.feature.jsonc':'61da7dabe48e4cf7bb63d6111b8c8465d06399a2',
 'backend/wrangler.feature-coordinator.jsonc':'b80be0974a7ab248bcdeeaf0ead8423ef340868c',
 'deployment/jwt-feature-finalisation-proposal.json':'de6c0157ee5ea6495d73301d527a34c4d855026e',
 'deployment/jwt-feature-readonly-final-fence.json':'c5b2bcc784e4d387b4684bb6cab998989cfda318'
});
function json(path){
 const b=readFileSync(new URL('../../'+path,import.meta.url));assert.equal(blob(b),inputSourceBlobs[path],'PUBLIC_REFERENCE_INPUT_CHANGED');return JSON.parse(b);
}
export function firstReplacementInputs(){
 const w=json('backend/wrangler.feature.jsonc'),c=json('backend/wrangler.feature-coordinator.jsonc'),p=json('deployment/jwt-feature-finalisation-proposal.json'),r=json('deployment/jwt-feature-readonly-final-fence.json');
 assert.equal(p.originalInstallation.state,'INSTALL_STOPPED');assert.equal(r.acceptedMainObservation.ownedVersion,false);
 const configs={worker:structuredClone(w),coordinator:structuredClone(c)};
 const vars={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',JWT_V110_NATIVE_RUN_ID:p.nativeRun,JWT_V110_OBJECT_NAMESPACE:'jwt-feature-v110/20261106a/'};
 for(const q of Object.values(configs)){
  delete q.migrations;
  q.d1_databases.push(...p.databaseIds.map((database_id,i)=>({binding:i?'JWT_V110_ADMIN_DB':'JWT_V110_CORE_DB',database_name:'jwt-feature-'+(i?'admin':'core')+'-20261106a',database_id})));
  q.vars={...(q.vars||{}),ACADEMY_D1_RUN_ID:p.nativeBaselineRun,...vars,JWT_FEATURE_INSTALL_SOURCE:p.originalSource,JWT_FEATURE_INSTALL_OWNER:p.originalOwner};
 }
 Object.assign(configs.worker.vars,{ACADEMY_D1_MODE:'PAUSED',JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0',JWT_V110_COOKIE_MODE:'HOST_ONLY_PREVIEW',JWT_V110_REQUEST_ORIGIN:r.probeOrigin,JWT_V110_RELEASE_ID:p.originalSource,JWT_V110_SIGNING_KID:p.publicSigningKey.kid,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([p.publicSigningKey])});
 configs.worker.main='src/academy-feature-jwt-runtime.js';
 configs.worker.secrets.required.push('JWT_V110_PRIVATE_KEY_JSON','JWT_V110_CSRF_SECRET');
 configs.worker.ratelimits.push({name:'JWT_V110_RATE_LIMITER',namespace_id:'100112',simple:{limit:10,period:60}});
 configs.worker.assets={directory:'../.academy-jwt-public',binding:'ASSETS',run_worker_first:['/api/*','/__jwt_feature_release',...['login','setup-pin','context','csrf','refresh','logout','logout-csrf'].map(p=>'/auth/v110/'+p)],not_found_handling:'none'};
 configs.worker.durable_objects.bindings.push({name:'JWT_V110_TIMETABLE_COORDINATOR',class_name:'JWTFeatureProgramTimetableCoordinator'},{name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator',script_name:configs.coordinator.name});
 configs.coordinator.durable_objects.bindings.push({name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator'});
 for(const q of Object.values(configs))assertHostConfig(q);
 const expected=JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-first-replacement-configs.json',import.meta.url),'utf8'));
 assert.deepEqual(configs,expected,'COMPLETE_CONFIGS_CHANGED');
 const reference={schema:1,state:'INTERRUPTED_PAUSED_REFERENCE',referenceVersions:{feature_worker:r.acceptedMainObservation.referenceVersion,'academy-feature-split-coordinator':r.lastReviewedCoordinatorVersion},namespaces:{...p.freshNamespaces},claims:{installationVerified:false,referenceVersionsOwned:false,schemaAndSeedAttestedHere:false,compiledCodeAttested:false,privateKeyAttested:false,routingAtomicityAttested:false}};
 return {configs,reference,configSHA256:digest(canonical(configs)),sourceBlobs:inputSourceBlobs};
}
export function profilesForFirstReplacement({source,coordinatorSourceDigest}){
 const {configs,reference}=firstReplacementInputs();
 return interruptedProfiles({reference,configs,source,coordinatorSourceDigest,coordinatorReplacement:false});
}
