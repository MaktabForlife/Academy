// Source-only preparation. This module never provisions or executes hosted SQL.
// A matching receipt is NOT authority: independent approval/metadata checks remain required.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const account='c9a3e355b3d7a795880b1d36a1dbe123';
export const origin='https://feature_worker.maktab4life.workers.dev';
export const batch='20261106a';
export const names=['jwt-feature-core-'+batch,'jwt-feature-admin-'+batch];
export const schemaHashes=Object.freeze({coreBase:'d7eb88199269195a20b44dad26b1663792e493631fa26690bc915af416772464',admin:'0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830',auth:'f9e8948fc4459cb85b6609da0cac488d2e9bec8d438b1c3ecd43e16062aeed0d',core:'1b2d6c85ee3fd797a7fab9bb297d7b700b30542a4fba1428996da21236afa9ce'});
export const protectedIds=Object.freeze(['0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8','18ad0efb-cd34-42a4-b510-7051f0303200','1c8aece3-dc1d-40d1-8a82-01ab4f63336f','fe85dac1-b1f0-4079-9127-2e36089aa385','c261eb73-7145-4f73-940c-5816db287612']);
export const workerFirst=Object.freeze(['/api/*','/__jwt_feature_release',...['login','setup-pin','context','csrf','refresh','logout','logout-csrf'].map(x=>'/auth/v110/'+x)]);
const digest=x=>createHash('sha256').update(x).digest('hex'),uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
export function bootstrapInputs(core,admin,auth){
 assert.equal(digest(core),schemaHashes.coreBase);assert.equal(digest(admin),schemaHashes.admin);assert.equal(digest(auth),schemaHashes.auth);
 const combined=Buffer.concat([Buffer.from(core),Buffer.from('\n'),Buffer.from(auth)]);assert.equal(digest(combined),schemaHashes.core);
 return {core:combined,admin:Buffer.from(admin)};
}
export function assertFreshReceipt(r,baseline){
 assert.equal(r.schema,2);assert.equal(r.state,'VERIFIED');assert.equal(r.planId,'JWT_FEATURE_FRESH_'+batch);assert.equal(r.accountId,account);
 assert.deepEqual(r.databaseNames,names);assert.equal(r.databaseIds?.length,2);assert(r.databaseIds.every(uuid));assert.equal(new Set(r.databaseIds).size,2);
 for(const id of r.databaseIds)assert(!protectedIds.includes(id),'Protected database');
 assert.deepEqual(r.schemaHashes,{core:schemaHashes.core,admin:schemaHashes.admin,auth:schemaHashes.auth});
 assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);assert.notEqual(r.sourceDigest,baseline.sourceDigest,'Old native run');
 assert.match(r.objectNamespace,/^jwt-feature-v110\/[a-z0-9-]{1,64}\/$/);
 assert.deepEqual(r.synthetic,{accounts:4,courses:2,productionData:false});assert.deepEqual(r.checks,{coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',initialSessions:0,initialFamilies:0});
 const ns=[r.timetableNamespaceId,r.splitNamespaceId];for(const id of ns){assert.match(id,/^[a-f0-9]{32}$/);assert(![baseline.timetableNamespaceId,baseline.splitNamespaceId,'b722f4cf54a04d6fb2a5a299e12722e2','aa75328c13ee4f42b406ccf5ebbe851a'].includes(id),'Old namespace');}assert.equal(new Set(ns).size,2);
 assert.match(r.publicKid,/^jwt-feature-v110-20261106a-[a-z0-9-]+$/);assert.equal(r.publicKeys?.length,1);
 const p=r.publicKeys[0];assert.deepEqual(Object.keys(p).sort(),['crv','kid','kty','x','y']);assert.equal(p.kid,r.publicKid);assert.equal(p.kty,'EC');assert.equal(p.crv,'P-256');for(const k of ['x','y'])assert.match(p[k],/^[A-Za-z0-9_-]{43}$/);
 assert.match(r.reviewedSetupCommit,/^[a-f0-9]{40}$/);assert(Number.isFinite(Date.parse(r.verifiedAt)));
 return r;
}
export function renderCandidateConfigs(baseWorker,baseCoordinator,baseline,r,{releaseId,mode='PAUSED'}={}){
 assertFreshReceipt(r,baseline);assert.match(releaseId||'',/^[a-f0-9]{40}$/);assert(['ACTIVE','PAUSED'].includes(mode));
 // Native names keep the old IDs for old DO exports/alarms. Only the new
 // entry/aliases remap JWT_* bindings into the native engine's expected names.
 assert.deepEqual(baseWorker.d1_databases,baseCoordinator.d1_databases);
 assert.deepEqual(baseWorker.d1_databases.map(d=>d.database_id),protectedIds.slice(0,2));
 assert.equal(baseWorker.name,'feature_worker');assert.equal(baseCoordinator.name,'academy-feature-split-coordinator');
 const worker=structuredClone(baseWorker),coordinator=structuredClone(baseCoordinator);
 const fresh=r.databaseIds.map((database_id,i)=>({binding:i?'JWT_V110_ADMIN_DB':'JWT_V110_CORE_DB',database_name:names[i],database_id}));
 worker.d1_databases.push(...fresh);coordinator.d1_databases.push(...fresh);
 const storageVars={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',JWT_V110_NATIVE_RUN_ID:r.sourceDigest,JWT_V110_OBJECT_NAMESPACE:r.objectNamespace};
 worker.main='src/academy-feature-jwt-runtime.js';
 worker.vars={...worker.vars,ACADEMY_D1_MODE:mode,ACADEMY_D1_RUN_ID:baseline.sourceDigest,...storageVars,JWT_V110_MASTER:'1',JWT_V110_REFRESH:'1',JWT_V110_BROWSER:'1',JWT_V110_NATIVE_COOKIE:'1',JWT_V110_COOKIE_MODE:'HOST_ONLY_PREVIEW',JWT_V110_REQUEST_ORIGIN:origin,JWT_V110_RELEASE_ID:releaseId,JWT_V110_SIGNING_KID:r.publicKid,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify(r.publicKeys)};
 coordinator.vars={...(coordinator.vars||{}),ACADEMY_D1_RUN_ID:baseline.sourceDigest,...storageVars};
 worker.secrets.required.push('JWT_V110_PRIVATE_KEY_JSON','JWT_V110_CSRF_SECRET');
 worker.ratelimits.push({name:'JWT_V110_RATE_LIMITER',namespace_id:'100112',simple:{limit:10,period:60}});
 worker.assets={directory:'../.academy-jwt-public',binding:'ASSETS',run_worker_first:[...workerFirst],not_found_handling:'none'};
 worker.durable_objects.bindings.push({name:'JWT_V110_TIMETABLE_COORDINATOR',class_name:'JWTFeatureProgramTimetableCoordinator'},{name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator',script_name:coordinator.name});
 coordinator.durable_objects.bindings.push({name:'JWT_V110_SPLIT_COORDINATOR',class_name:'JWTFeatureAcademySplitCoordinator'});
 worker.migrations.push({tag:'jwt-feature-fresh-'+batch,new_sqlite_classes:['JWTFeatureProgramTimetableCoordinator']});
 coordinator.migrations.push({tag:'jwt-feature-fresh-'+batch,new_sqlite_classes:['JWTFeatureAcademySplitCoordinator']});
 return {worker,coordinator};
}
export function assertCandidateConfigs(worker,coordinator,baseWorker,baseCoordinator,baseline,r,options){
 const expected=renderCandidateConfigs(baseWorker,baseCoordinator,baseline,r,options);
 assert.deepEqual(worker,expected.worker,'Unreviewed Worker transition');assert.deepEqual(coordinator,expected.coordinator,'Unreviewed coordinator transition');return true;
}
