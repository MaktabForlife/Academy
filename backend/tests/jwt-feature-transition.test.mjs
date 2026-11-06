import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {bootstrapInputs,assertFreshReceipt,renderCandidateConfigs,assertCandidateConfigs,schemaHashes,protectedIds,names} from '../tools/jwt-feature-transition.mjs';
import {jwtFeatureDatabaseEnv,jwtFeatureApiEnv} from '../src/academy/jwt-feature-storage.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),json=p=>JSON.parse(read(p));
const w=json('../wrangler.feature.jsonc'),c=json('../wrangler.feature-coordinator.jsonc'),baseline=json('../../config/feature-initialisation-receipt.json');
const fresh=()=>({schema:2,state:'VERIFIED',planId:'JWT_FEATURE_FRESH_20261106a',accountId:'c9a3e355b3d7a795880b1d36a1dbe123',databaseNames:[...names],databaseIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],schemaHashes:{core:schemaHashes.core,admin:schemaHashes.admin,auth:schemaHashes.auth},sourceDigest:'a'.repeat(64),objectNamespace:'jwt-feature-v110/20261106a/',synthetic:{accounts:4,courses:2,productionData:false},checks:{coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',initialSessions:0,initialFamilies:0},timetableNamespaceId:'c'.repeat(32),splitNamespaceId:'d'.repeat(32),publicKid:'jwt-feature-v110-20261106a-k1',publicKeys:[{kty:'EC',crv:'P-256',kid:'jwt-feature-v110-20261106a-k1',x:'A'.repeat(43),y:'B'.repeat(43)}],reviewedSetupCommit:'e'.repeat(40),verifiedAt:'2026-11-06T00:00:00.000Z'});
const options={releaseId:'f'.repeat(40),mode:'PAUSED'};
test('exact empty native Core plus auth DDL preserves every native definition; Admin unchanged',()=>{
 const core=read('../feature-preview-bootstrap/core-schema.sql'),admin=read('../feature-preview-bootstrap/admin-schema.sql'),auth=read('./fixtures/jwt-v110-fresh-pair-auth.sql'),inputs=bootstrapInputs(core,admin,auth);
 const original=new DatabaseSync(':memory:'),next=new DatabaseSync(':memory:'),a=new DatabaseSync(':memory:');
 try{
  original.exec(core);next.exec(inputs.core.toString());a.exec(inputs.admin.toString());
  const objects=db=>db.prepare("SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const old=objects(original),now=objects(next),byName=new Map(now.map(x=>[x.name,x]));
  for(const row of old)assert.deepEqual(byName.get(row.name),row);
  const added=now.filter(x=>!old.some(y=>y.name===x.name));assert.deepEqual(added.map(x=>x.name),['jwt_v110_accounts','jwt_v110_browser_heads','jwt_v110_families','jwt_v110_family_binding_immutable','jwt_v110_parent_tombstones','jwt_v110_previous_fp','jwt_v110_security_audit']);
  for(const db of [next,a]){assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())assert.equal(db.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').get().n,0);}
  const out=resolve(process.env.RUNNER_TEMP,'jwt-fresh-pair-evidence');mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'core-empty-with-auth.sql'),inputs.core);writeFileSync(resolve(out,'admin-empty.sql'),inputs.admin);
  writeFileSync(resolve(out,'schema-plan.json'),JSON.stringify({sourceOnly:true,installed:false,containsSeed:false,hostedCalls:0,schemaHashes,nativeObjectsUnchanged:old.length,added:added.map(({name,type})=>({name,type})),coreObjects:now.length,adminObjects:objects(a).length,foreignKeyErrors:0,quickChecks:'ok'},null,2));
 }finally{original.close();next.close();a.close();}
 assert.throws(()=>bootstrapInputs(core+'-- changed',admin,auth));
});
test('only a complete fresh exact-name/schema/run/namespace receipt produces a candidate',()=>{
 const r=fresh();assertFreshReceipt(r,baseline);const before=structuredClone({w,c}),candidate=renderCandidateConfigs(w,c,baseline,r,options);
 assertCandidateConfigs(candidate.worker,candidate.coordinator,w,c,baseline,r,options);
 assert.deepEqual({w,c},before);assert.deepEqual(candidate.worker.d1_databases.slice(0,2),w.d1_databases);
 assert.deepEqual(candidate.coordinator.d1_databases.slice(0,2),c.d1_databases);
 assert.equal(candidate.worker.d1_databases.length,4);assert.equal(candidate.worker.vars.ACADEMY_D1_RUN_ID,baseline.sourceDigest);
 assert.equal(candidate.worker.vars.JWT_V110_NATIVE_RUN_ID,r.sourceDigest);assert.equal(candidate.worker.vars.ACADEMY_D1_MODE,'PAUSED');
 assert.equal(candidate.worker.assets.not_found_handling,'none');assert.equal(candidate.worker.assets.run_worker_first.length,9);
 assert.deepEqual(candidate.worker.r2_buckets,w.r2_buckets);assert.deepEqual(candidate.worker.triggers,w.triggers);
});
for(const id of protectedIds)test('reject protected DB '+id,()=>{const r=fresh();r.databaseIds[0]=id;assert.throws(()=>assertFreshReceipt(r,baseline));});
for(const [label,change] of [
 ['same pair ID',r=>r.databaseIds[1]=r.databaseIds[0]],
 ['wrong native/auth schema',r=>r.schemaHashes.core=schemaHashes.coreBase],
 ['unverified bootstrap',r=>r.state='PENDING'],
 ['old run',r=>r.sourceDigest=baseline.sourceDigest],
 ['old R2 prefix',r=>r.objectNamespace='feature-isolated-v1/'],
 ['old timetable namespace',r=>r.timetableNamespaceId=baseline.timetableNamespaceId],
 ['old split namespace',r=>r.splitNamespaceId=baseline.splitNamespaceId],
 ['private key in public registry',r=>r.publicKeys[0].d='private-value-must-never-be-here'],
 ['nonzero initial sessions',r=>r.checks.initialSessions=1],
 ['production seed',r=>r.synthetic.productionData=true],
 ['renamed unreviewed new DB',r=>r.databaseNames[0]='unreviewed']
])test('reject '+label,()=>{const r=fresh();change(r);assert.throws(()=>assertFreshReceipt(r,baseline));});
for(const [label,change]of [
 ['legacy ID rebound',x=>x.worker.d1_databases[0].database_id=fresh().databaseIds[0]],
 ['JWT binding points to legacy',x=>x.worker.d1_databases[2].database_id=protectedIds[0]],
 ['asset API bypass',x=>x.worker.assets.run_worker_first=[]],
 ['SPA fallback',x=>x.worker.assets.not_found_handling='single-page-application'],
 ['new namespace alias uses old class',x=>x.coordinator.durable_objects.bindings[1].class_name='AcademySplitCoordinator'],
 ['unreviewed secret',x=>x.worker.secrets.required.push('PRODUCTION_SECRET')],
 ['scheduled job',x=>x.worker.triggers.crons.push('* * * * *')],
 ['old active rollback',x=>x.worker.vars.JWT_V110_NATIVE_RUN_ID=baseline.sourceDigest],
 ['new external service',x=>x.worker.services=[{binding:'X',service:'production'}]]
])test('candidate rejects '+label,()=>{const r=fresh(),x=renderCandidateConfigs(w,c,baseline,r,options);change(x);assert.throws(()=>assertCandidateConfigs(x.worker,x.coordinator,w,c,baseline,r,options));});
function env(){
 let calls=0;const db=tag=>({tag,withSession(){calls++;throw Error('mapper must not query');}});
 return {value:{ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',ACADEMY_DB:db('old-core'),ACADEMY_ADMIN_DB:db('old-admin'),JWT_V110_CORE_DB:db('new-core'),JWT_V110_ADMIN_DB:db('new-admin'),ACADEMY_D1_RUN_ID:baseline.sourceDigest,JWT_V110_NATIVE_RUN_ID:'a'.repeat(64),ACADEMY_OBJECT_NAMESPACE:'feature-isolated-v1/',JWT_V110_OBJECT_NAMESPACE:'jwt-feature-v110/20261106a/',ACADEMY_SPLIT_COORDINATOR:{getByName(){}},PROGRAM_TIMETABLE_COORDINATOR:{getByName(){}},JWT_V110_SPLIT_COORDINATOR:{getByName(){}},JWT_V110_TIMETABLE_COORDINATOR:{getByName(){}}},calls:()=>calls};
}
test('new API maps only its fresh context; legacy context and pause retain original native bindings',()=>{
 const x=env(),before={...x.value},mapped=jwtFeatureApiEnv(x.value);
 assert.equal(mapped.ACADEMY_DB.tag,'new-core');assert.equal(mapped.ACADEMY_ADMIN_DB.tag,'new-admin');assert.equal(mapped.ACADEMY_SPLIT_COORDINATOR,x.value.JWT_V110_SPLIT_COORDINATOR);assert.equal(mapped.PROGRAM_TIMETABLE_COORDINATOR,x.value.JWT_V110_TIMETABLE_COORDINATOR);
 assert.equal(mapped.ACADEMY_D1_RUN_ID,'a'.repeat(64));assert.equal(mapped.ACADEMY_OBJECT_NAMESPACE,'jwt-feature-v110/20261106a/');assert.equal(x.value.ACADEMY_DB.tag,'old-core');assert.deepEqual(x.value,before);assert.equal(x.calls(),0);
 const paused=jwtFeatureApiEnv({...x.value,ACADEMY_D1_MODE:'PAUSED'});assert.equal(paused.ACADEMY_D1_MODE,'PAUSED');assert.equal(paused.ACADEMY_DB,x.value.JWT_V110_CORE_DB);
});
for(const [label,change]of [
 ['missing fresh DB',e=>delete e.JWT_V110_CORE_DB],
 ['same old DB fallback',e=>e.JWT_V110_CORE_DB=e.ACADEMY_DB],
 ['old native run',e=>e.JWT_V110_NATIVE_RUN_ID=e.ACADEMY_D1_RUN_ID],
 ['old object prefix',e=>e.JWT_V110_OBJECT_NAMESPACE=e.ACADEMY_OBJECT_NAMESPACE],
 ['nonFeature',e=>e.ENVIRONMENT='production'],
 ['missing new private namespace',e=>delete e.JWT_V110_SPLIT_COORDINATOR],
 ['old private namespace fallback',e=>e.JWT_V110_SPLIT_COORDINATOR=e.ACADEMY_SPLIT_COORDINATOR]
])test('environment fails closed for '+label,()=>{const x=env();change(x.value);assert.throws(()=>jwtFeatureApiEnv(x.value));assert.equal(x.calls(),0);});
