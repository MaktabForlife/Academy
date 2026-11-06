// One-time fresh-only installation contract; never provisions or executes SQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertFeatureTargets} from './feature-target-guard.mjs';
import {account,batch,names,schemaHashes,protectedIds,renderCandidateConfigs} from './jwt-feature-transition.mjs';
export const temporarySecrets=Object.freeze(['JWT_FEATURE_SETUP_PIN','JWT_FEATURE_SETUP_AUTH']);
export const finalSecrets=Object.freeze(['JWT_V110_PRIVATE_KEY_JSON','JWT_V110_CSRF_SECRET']);
export const origin='https://feature_worker.maktab4life.workers.dev';
const hash=x=>createHash('sha256').update(x).digest('hex');
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export function assertSchemaReceipt(r){
 assert.deepEqual(Object.keys(r).sort(),['accountId','checks','databaseIds','databaseNames','planId','reviewedDDLCommit','schema','ddlHashes','state','verifiedAt'].sort());
 assert.equal(r.schema,1);assert.equal(r.state,'LOADED_COUNTS_CHECKED_FULL_PRIVATE_ATTESTATION_PENDING');assert.equal(r.accountId,account);assert.equal(r.planId,'JWT_FEATURE_FRESH_'+batch);
 assert.deepEqual(r.databaseNames,names);assert.equal(r.databaseIds.length,2);assert(r.databaseIds.every(uuid));assert.equal(new Set(r.databaseIds).size,2);
 for(const id of r.databaseIds)assert(!protectedIds.includes(id),'PROTECTED_DATABASE');
 assert.deepEqual(r.ddlHashes,{core:schemaHashes.core,admin:schemaHashes.admin,auth:schemaHashes.auth});
 assert.deepEqual(r.checks,{coreRows:0,adminRows:0,coreObjects:1372,adminObjects:83,coreTables:172,adminTables:55,coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',fullSchemaAttestation:'PENDING_PRIVATE_SETUP'});
 assert(sha(r.reviewedDDLCommit));assert(Number.isFinite(Date.parse(r.verifiedAt)));return r;
}
export function compileInstallPackage({baseWorker,baseCoordinator,baseline,schemaReceipt,contract,source,owner,issued,expires}){
 assertFeatureTargets(baseWorker,baseCoordinator,{schema:1,environment:'feature',academyPortalOrigin:'https://feature-preview.academy-maktab4life.pages.dev',academyLegacyOrigins:[],academyApiOrigin:origin,studioOrigin:'https://studio-unavailable.invalid',studioBackendOrigin:'https://studio-unavailable.invalid',hifzOrigin:'https://hifz-unavailable.invalid'});
 assertSchemaReceipt(schemaReceipt);assert(sha(source));assert.equal(contract.source,source);
 assert.equal(contract.accountId,account);assert.deepEqual(contract.databaseIds,schemaReceipt.databaseIds);
 assert.equal(contract.planId,schemaReceipt.planId);assert.match(contract.manifestHash,/^[a-f0-9]{64}$/);
 assert.match(owner,/^[1-9][0-9]{0,19}-[1-9][0-9]{0,4}$/);
 assert(Number.isSafeInteger(issued)&&Number.isSafeInteger(expires)&&expires>issued&&expires-issued<=900);
 assert.equal(baseWorker.name,'feature_worker');assert.equal(baseCoordinator.name,'academy-feature-split-coordinator');
 assert.deepEqual(baseWorker.d1_databases,baseCoordinator.d1_databases);
 assert.deepEqual(baseWorker.d1_databases.map(x=>x.database_id),protectedIds.slice(0,2));
 const worker=structuredClone(baseWorker),coordinator=structuredClone(baseCoordinator);
 const fresh=schemaReceipt.databaseIds.map((database_id,i)=>({binding:i?'JWT_V110_ADMIN_DB':'JWT_V110_CORE_DB',database_name:names[i],database_id}));
 for(const c of [worker,coordinator]){
  c.d1_databases.push(...fresh);c.observability={enabled:false};
  c.vars={...(c.vars||{}),ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_MODE:'PAUSED',ACADEMY_D1_RUN_ID:baseline.sourceDigest,
   JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',JWT_V110_NATIVE_RUN_ID:contract.sourceDigest,JWT_V110_OBJECT_NAMESPACE:contract.objectNamespace,
   JWT_FEATURE_SETUP_MODE:'BOOTSTRAP_ONLY',JWT_FEATURE_SETUP_SOURCE:source,JWT_FEATURE_SETUP_MANIFEST:contract.manifestHash,
   JWT_FEATURE_SETUP_ISSUED_AT:String(issued),JWT_FEATURE_SETUP_EXPIRES_AT:String(expires),
   JWT_FEATURE_INSTALL_SOURCE:source,JWT_FEATURE_INSTALL_OWNER:owner};
 }
 for(const k of ['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'])worker.vars[k]='0';
 worker.main='src/__jwt_feature_setup_worker.js';coordinator.main='src/__jwt_feature_setup_coordinator.js';
 delete worker.assets;delete coordinator.assets;
 worker.durable_objects.bindings.push({name:'JWT_V110_TIMETABLE_COORDINATOR',class_name:'JWTFeatureProgramTimetableCoordinator'},{name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator',script_name:coordinator.name});
 coordinator.durable_objects.bindings.push({name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator'});
 worker.migrations.push({tag:'jwt-feature-fresh-'+batch,new_sqlite_classes:['JWTFeatureProgramTimetableCoordinator']});
 coordinator.migrations.push({tag:'jwt-feature-fresh-'+batch,new_sqlite_classes:['JWTFeatureAcademySplitCoordinator']});
 const sources={
  'backend/src/__jwt_feature_setup_contract.mjs':'export default Object.freeze('+JSON.stringify(contract)+');\n',
  'backend/src/__jwt_feature_setup_worker.js':"import c from './__jwt_feature_setup_contract.mjs';\nimport {createJWTFeatureSetupAPI} from './academy/jwt-feature-setup.mjs';\nexport {ProgramTimetableCoordinator,WebsiteStudioAcademy} from './academy-development-runtime.js';\nexport {JWTFeatureProgramTimetableCoordinator} from './academy-feature-jwt-objects.js';\nexport default createJWTFeatureSetupAPI(c);\n",
  'backend/src/__jwt_feature_setup_coordinator.js':"import c from './__jwt_feature_setup_contract.mjs';\nimport {withJWTFeatureSetup} from './academy/jwt-feature-setup.mjs';\nimport {JWTFeatureAcademySplitCoordinator as NativeFresh} from './academy-split-coordinator.js';\nexport {AcademySplitCoordinator} from './academy-split-coordinator.js';\nexport class JWTFeatureAcademySplitCoordinator extends withJWTFeatureSetup(NativeFresh,c){}\nexport default {fetch:()=>new Response('Not found',{status:404})};\n",
  'backend/src/__jwt_feature_unavailable.js':"export {ProgramTimetableCoordinator,WebsiteStudioAcademy} from './academy-development-runtime.js';\nexport {JWTFeatureProgramTimetableCoordinator} from './academy-feature-jwt-objects.js';\nexport default {fetch:()=>Response.json({code:'FEATURE_PAUSED'},{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}})};\n"
 };
 for(const value of Object.values(sources))assert(!value.includes('/__test/')&&!value.includes('TEST_FAULT'),'TEST_PROBE_FORBIDDEN');
 const publicManifest={schema:1,state:'PREPARATION_ONLY',source,owner,contractHash:contract.manifestHash,schemaReceiptHash:hash(JSON.stringify(schemaReceipt)),databaseIds:schemaReceipt.databaseIds,issued,expires,
  sourceHashes:Object.fromEntries(Object.entries(sources).map(([p,v])=>[p,hash(v)])),setupMode:'PAUSED_NO_ASSETS',
  plannedEffects:{freshSqliteNamespaces:2,existingNamespacesRetained:2,newScripts:0,namespaceDeleteOrRename:0,workerUploads:3,coordinatorUploads:2,secretBulkPatches:2,seedExecuteRequests:1,statusRequests:1,ordinaryPausedProbes:3,sqlReplay:false,existingDatabaseChanges:false},
  budgets:{explicitCloudflareGets:40,recoveryExtraGets:16,wranglerInternalRequests:'separate-unmeasured',setupHTTPRequests:5,seedProjection:{statements:97,roundTrips:12,rowsRead:5857,rowsWritten:202},applicationSmoke:'separate-eight-requests'}};
 return {worker,coordinator,sources,publicManifest,baseWorker:structuredClone(baseWorker),baseCoordinator:structuredClone(baseCoordinator)};
}
export function bindPublicSigningKey(p,key){
 assert.deepEqual(Object.keys(key).sort(),['crv','kid','kty','x','y']);
 assert.equal(key.kty,'EC');assert.equal(key.crv,'P-256');
 assert.match(key.kid,/^[A-Za-z0-9._-]{1,64}$/);
 for(const k of ['x','y'])assert.match(key[k],/^[A-Za-z0-9_-]{43}$/);
 const selected=Object.freeze({...key});
 if(p.publicManifest.publicSigningKey)assert.deepEqual(p.publicManifest.publicSigningKey,selected,'PUBLIC_SIGNER_REBINDING');
 p.publicManifest.publicSigningKey=selected;
 // Persist only the public association before sealed private ingress. Temporary
 // routes remain disabled and do not import the signing/refresh engine.
 p.worker.vars.JWT_V110_SIGNING_KID=selected.kid;
 p.worker.vars.JWT_V110_PUBLIC_KEYS_JSON=JSON.stringify([selected]);
 return p;
}
export function completeInstallPackage(p,baseline,schemaReceipt,contract,{timetableNamespaceId,splitNamespaceId,publicKid,publicKeys,verifiedAt}){
 assert.match(p.publicManifest.coordinatorSourceDigest,/^[a-f0-9]{64}$/,'COORDINATOR_SOURCE_DIGEST');
 const receipt={schema:2,state:'VERIFIED',coordinatorSourceDigest:p.publicManifest.coordinatorSourceDigest,planId:schemaReceipt.planId,accountId:account,databaseNames:[...names],databaseIds:[...schemaReceipt.databaseIds],
  schemaHashes:{...schemaReceipt.ddlHashes},sourceDigest:contract.sourceDigest,objectNamespace:contract.objectNamespace,synthetic:{accounts:4,courses:2,productionData:false},
  checks:{coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',initialSessions:0,initialFamilies:0},
  timetableNamespaceId,splitNamespaceId,publicKid,publicKeys,reviewedSetupCommit:p.publicManifest.source,verifiedAt};
 const final=renderCandidateConfigs(p.baseWorker,p.baseCoordinator,baseline,receipt,{releaseId:p.publicManifest.source,mode:'PAUSED'});
 for(const c of [final.worker,final.coordinator])c.vars={...c.vars,JWT_FEATURE_INSTALL_SOURCE:p.publicManifest.source,JWT_FEATURE_INSTALL_OWNER:p.publicManifest.owner};
 return {receipt,...final};
}
export function assertNoTemporarySurface(final){
 for(const c of [final.worker,final.coordinator]){
  assert(!String(c.main).includes('__jwt_feature_setup'));
  assert(!Object.keys(c.vars||{}).some(k=>k.startsWith('JWT_FEATURE_SETUP_')));
  assert(!(c.secrets?.required||[]).some(k=>temporarySecrets.includes(k)));
 }
 assert.equal(final.worker.vars.ACADEMY_D1_MODE,'PAUSED');
 for(const k of ['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'])assert.equal(final.worker.vars[k],'0');
 return true;
}
