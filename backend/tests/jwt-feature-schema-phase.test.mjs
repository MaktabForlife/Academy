import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {bootstrapInputs} from '../tools/jwt-feature-transition.mjs';
import {coreRemainder} from '../tools/jwt-feature-core-remainder.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const physicalIds=['cdbe97bc-f3d9-400e-8806-ed9a0d143d26','ed77f2a7-4439-4841-8691-2b41063d8960'],{contract:c}=setupContract({source:process.env.GITHUB_SHA,databaseIds:physicalIds,structuredDDL:true});
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),input=bootstrapInputs(read('../feature-preview-bootstrap/core-schema.sql'),read('../feature-preview-bootstrap/admin-schema.sql'),read('./fixtures/jwt-v110-fresh-pair-auth.sql')),first=coreRemainder(input.core.toString()).firstStatements[0];
const bundle=await build({entryPoints:[new URL('./jwt-feature-schema-phase-probe.mjs',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers'],define:{__SETUP_CONTRACT__:JSON.stringify(c)}});
const origin='https://feature_worker.maktab4life.workers.dev',objectName='jwt-feature-bootstrap:'+c.planId+':'+c.sourceDigest,results=[];
async function fixture({fault='',expired=false,initial='expected',foreign=false}={}){
 const key=randomBytes(32),now=Math.floor(Date.now()/1000),issued=now-(expired?600:0),expiry=now+(expired?-1:600);
 const env={ENVIRONMENT:foreign?'production':'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_MODE:'PAUSED',JWT_FEATURE_SETUP_MODE:'BOOTSTRAP_ONLY',JWT_FEATURE_SETUP_SOURCE:c.source,JWT_FEATURE_SETUP_MANIFEST:c.manifestHash,JWT_FEATURE_SETUP_ISSUED_AT:String(issued),JWT_FEATURE_SETUP_EXPIRES_AT:String(expiry),JWT_FEATURE_SETUP_AUTH:key.toString('base64url'),JWT_FEATURE_SETUP_PIN:'2468',SHARED_PIN_SECRET:randomBytes(64).toString('base64url'),JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',ACADEMY_D1_RUN_ID:'0'.repeat(64),JWT_V110_NATIVE_RUN_ID:c.sourceDigest,JWT_V110_OBJECT_NAMESPACE:c.objectNamespace,TEST_FAULT:fault};
 const mf=new Miniflare(convertV4MiniflareOptions({unsafeInspectDurableObjects:true,workers:[{name:'schema',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],bindings:env,d1Databases:{ACADEMY_DB:'held-core',ACADEMY_ADMIN_DB:'held-admin',JWT_V110_CORE_DB:'new-core',JWT_V110_ADMIN_DB:'new-admin'},durableObjects:{JWT_V110_SPLIT_COORDINATOR:{className:'JWTFeatureAcademySplitCoordinator',useSQLite:true},ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',useSQLite:true}}}]}));
 try{
  const db={core:await mf.getD1Database('JWT_V110_CORE_DB','schema'),admin:await mf.getD1Database('JWT_V110_ADMIN_DB','schema')};
  await db.core.prepare(initial==='changed'?first.replace('title TEXT','title INTEGER'):first).run();
  if(initial==='extra')await db.core.prepare('CREATE TABLE unexpected_app_object(value TEXT)').run();
  async function call(action='schema-execute',{body,wrongPurpose=false}={}){
   const path='/internal/feature-jwt-setup/'+action,method=action.endsWith('status')?'GET':'POST',stamp=Math.floor(Date.now()/1000),nonce=randomBytes(32).toString('base64url');
   const packet=JSON.stringify(['jwt-feature-private-setup-v1',c.planId,c.source,c.manifestHash,c.accountId,method,wrongPurpose?'/internal/feature-jwt-setup/execute':path,issued,expiry,stamp,nonce]);
   return mf.dispatchFetch(origin+path,{method,headers:{'X-JWT-Setup-Time':String(stamp),'X-JWT-Setup-Nonce':nonce,'X-JWT-Setup-Source':c.source,'X-JWT-Setup-Manifest':c.manifestHash,'X-JWT-Setup-Proof':createHmac('sha256',key).update(packet).digest('base64url')},...(body===undefined?{}:{body})});
  }
  return {mf,db,call,async snapshot(){return (await mf.dispatchFetch(origin+'/__test/schema-snapshot')).json();},async close(){
   try{for(const binding of ['ACADEMY_DB','ACADEMY_ADMIN_DB']){const held=await mf.getD1Database(binding,'schema');assert.equal((await held.prepare("SELECT count(*) n FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV')").first()).n,0,'Held local sentinel remains empty');}}
   finally{await mf.dispose();}
  }};
 }catch(e){await mf.dispose();throw e;}
}
test('schema phase completes exact Core then Admin, persists public attestation and separately gates seed',async()=>{
 const f=await fixture();try{
  const premature=await f.call('execute');assert.equal(premature.status,409);assert.equal((await premature.json()).state,'UNCLAIMED');assert.equal((await f.snapshot()).seedClaim,undefined);
  const r=await f.call();assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);const receipt=await r.json();assert.equal(receipt.stage,'SCHEMA_ONLY');assert.equal(receipt.state,'VERIFIED');assert.equal(receipt.verification.core.fingerprint,c.objectHashes.core);assert.equal(receipt.verification.admin.fingerprint,c.objectHashes.admin);
  const s=await f.snapshot();assert.equal(s.schemaClaim.state,'VERIFIED');assert.equal(s.seedClaim,undefined);assert.deepEqual(s.metrics.batches,{core:1,admin:1});assert.equal(JSON.stringify(s.schemaClaim).includes('pbkdf2'),false);
  assert.equal((await f.db.core.prepare('SELECT count(*) n FROM accounts').first()).n,0);assert.equal((await f.db.admin.prepare('SELECT count(*) n FROM identity_refs').first()).n,0);
  assert.equal((await f.call('schema-status')).status,200);assert.equal((await f.call()).status,409);assert.deepEqual((await f.snapshot()).metrics,s.metrics);
  const seed=await f.call('execute');assert.equal(seed.status,200);assert.equal((await seed.json()).verification.accounts,4);const after=await f.snapshot();assert.equal(after.seedClaim.state,'VERIFIED');assert.equal(after.schemaClaim.state,'VERIFIED');
  results.push({case:'schema-before-separate-seed',schemaCost:s.metrics.d1,schemaBatches:s.metrics.batches,seedGatedBeforeSchema:true,privateClaimsSeparate:true,directNewVerifierSelects:2,heldLocalVerifierSelects:2,fixtureFirstCreate:1});
 }finally{await f.close();}
});
test('concurrent schema requests have one first claim and no repeated DDL',async()=>{
 const f=await fixture();try{
  const replies=await Promise.all(Array.from({length:8},()=>f.call()));assert.equal(replies.filter(r=>r.status===200).length,1);assert.equal(replies.filter(r=>r.status===409).length,7);
  const s=await f.snapshot();assert.deepEqual(s.metrics.batches,{core:1,admin:1});assert.equal(s.schemaClaim.state,'VERIFIED');results.push({case:'schema-concurrent',schemaCost:s.metrics.d1,frontSchemaCalls:8,privateSchemaCalls:8});
 }finally{await f.close();}
});
for(const initial of ['changed','extra'])test('full starting fingerprint refuses '+initial+' before any DDL',async()=>{
 const f=await fixture({initial});try{
  const r=await f.call();assert.equal(r.status,409);assert.equal((await r.json()).state,'UNKNOWN');const s=await f.snapshot();assert.deepEqual(s.metrics.batches,{core:0,admin:0});
  assert.equal((await f.call()).status,409);assert.equal((await f.call('schema-status')).status,200);assert.deepEqual((await f.snapshot()).metrics,s.metrics);
  results.push({case:'starting-footprint-'+initial,state:'UNKNOWN',ddlBatches:s.metrics.batches,noRetry:true});
 }finally{await f.close();}
});
test('Admin DDL failure after verified Core remains UNKNOWN and cannot seed or replay',async()=>{
 const f=await fixture({fault:'admin'});try{
  const r=await f.call();assert.equal(r.status,409);assert.equal((await r.json()).state,'UNKNOWN');const s=await f.snapshot();assert.deepEqual(s.metrics.batches,{core:1,admin:1});assert.equal((await f.db.core.prepare('SELECT count(*) n FROM accounts').first()).n,0);
  assert.equal((await f.call()).status,409);assert.equal((await f.call('execute')).status,409);assert.equal((await f.snapshot()).seedClaim,undefined);assert.deepEqual((await f.snapshot()).metrics,s.metrics);
  results.push({case:'schema-staged-admin-failure',state:'UNKNOWN',schemaCost:s.metrics.d1,adminBatchIsAttempt:true,automaticRetry:false});
 }finally{await f.close();}
});
test('expired public and owning schema requests cannot claim; status remains available',async()=>{
 const f=await fixture({expired:true});try{
  assert.equal((await f.call()).status,403);const own=await f.mf.dispatchFetch(origin+'/__test/schema-expired');assert.equal((await own.json()).state,'UNCLAIMED');const s=await f.snapshot();assert.equal(s.schemaClaim,undefined);assert.equal(s.metrics.prepares,0);assert.equal((await f.call('schema-status')).status,200);results.push({case:'schema-expired',newClaim:false,d1Prepares:0});
 }finally{await f.close();}
});
test('persisted preparing schema claim becomes UNKNOWN after real eviction, with no DDL replay',async()=>{
 const f=await fixture({expired:true});try{
  await f.mf.dispatchFetch(origin+'/__test/schema-prime');await f.mf.unsafeEvictDurableObject('schema','JWTFeatureAcademySplitCoordinator',{name:objectName});
  const r=await f.call('schema-status');assert.equal(r.status,200);const state=await r.json();assert.equal(state.state,'UNKNOWN');assert.equal(state.phase,'interrupted');const s=await f.snapshot();assert.equal(s.metrics.prepares,0);results.push({case:'schema-primed-real-eviction',state:'UNKNOWN',pendingD1CrashNotSimulated:true,d1Prepares:0});
 }finally{await f.close();}
});
test('schema rejects foreign profile, signed data body and wrong-purpose proof without DDL',async()=>{
 const foreign=await fixture({foreign:true});try{assert.equal((await foreign.call()).status,403);}finally{await foreign.close();}
 const f=await fixture();try{assert.equal((await f.call('schema-execute',{body:'{}'})).status,403);assert.equal((await f.call('schema-execute',{wrongPurpose:true})).status,403);const s=await f.snapshot();assert.equal(s.metrics.prepares,0);assert.equal(s.schemaClaim,undefined);results.push({case:'schema-auth-profile-body-purpose',d1Prepares:0});}finally{await f.close();}
});
test('schema proof is source/local only, with no hosted install/cleanup/activation claim',()=>{
 const dir=resolve(process.env.RUNNER_TEMP,'jwt-schema-phase-evidence');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'schema-phase-proof.json'),JSON.stringify({schema:1,source:process.env.GITHUB_SHA,scope:'Actual disposable workerd schema phase only',physicalIdsLabelsOnly:physicalIds,startingCoreFingerprint:c.ddl.initialObjectHashes.core,startingAdminFingerprint:c.ddl.initialObjectHashes.admin,finalFingerprints:c.objectHashes,compiledDDLCounts:{core:c.ddl.statements.core.length,admin:c.ddl.statements.admin.length},results,hostedCalls:0,installed:false,cleanupVerified:false,activation:false},null,2)+'\n');
});
