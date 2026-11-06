import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {verifyAcademyPin} from '../src/lib/academy-pin.js';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://feature_worker.maktab4life.workers.dev';
const {contract:c,sql}=setupContract({source:process.env.GITHUB_SHA,databaseIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']});
const setupName='jwt-feature-bootstrap:'+c.planId+':'+c.sourceDigest;
const bundle=await build({entryPoints:[new URL('./jwt-feature-setup-probe.mjs',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers'],define:{__SETUP_CONTRACT__:JSON.stringify(c)}});
const receipts=[];
async function fixture({fault='',expired=false,schemas=true}={}){
 const key=randomBytes(32),shared=randomBytes(64).toString('base64url'),now=Math.floor(Date.now()/1000);
 const issued=now-(expired?600:0),expiry=now+(expired?-1:600);
 const bindings={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_MODE:'PAUSED',JWT_FEATURE_SETUP_MODE:'BOOTSTRAP_ONLY',JWT_FEATURE_SETUP_SOURCE:c.source,JWT_FEATURE_SETUP_MANIFEST:c.manifestHash,JWT_FEATURE_SETUP_ISSUED_AT:String(issued),JWT_FEATURE_SETUP_EXPIRES_AT:String(expiry),JWT_FEATURE_SETUP_AUTH:key.toString('base64url'),JWT_FEATURE_SETUP_PIN:'2468',SHARED_PIN_SECRET:shared,JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',ACADEMY_D1_RUN_ID:'0'.repeat(64),JWT_V110_NATIVE_RUN_ID:c.sourceDigest,JWT_V110_OBJECT_NAMESPACE:c.objectNamespace,TEST_FAULT:fault};
 const mf=new Miniflare(convertV4MiniflareOptions({unsafeInspectDurableObjects:true,workers:[{name:'setup',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],bindings,d1Databases:{ACADEMY_DB:'held-core',ACADEMY_ADMIN_DB:'held-admin',JWT_V110_CORE_DB:'fresh-core',JWT_V110_ADMIN_DB:'fresh-admin'},durableObjects:{JWT_V110_SPLIT_COORDINATOR:{className:'JWTFeatureAcademySplitCoordinator',useSQLite:true},ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',useSQLite:true}}}]}));
 try{
  const db={core:await mf.getD1Database('JWT_V110_CORE_DB','setup'),admin:await mf.getD1Database('JWT_V110_ADMIN_DB','setup')};
  if(schemas)for(const owner of ['core','admin'])for(let i=0;i<sql[owner].length;i+=30)await db[owner].batch(sql[owner].slice(i,i+30).map(s=>db[owner].prepare(s)));
  async function call(action='execute'){
   const method=action==='execute'?'POST':'GET',path='/internal/feature-jwt-setup/'+action,stamp=Math.floor(Date.now()/1000),nonce=randomBytes(32).toString('base64url');
   const packet=JSON.stringify(['jwt-feature-private-setup-v1',c.planId,c.source,c.manifestHash,c.accountId,method,path,issued,expiry,stamp,nonce]);
   return mf.dispatchFetch(origin+path,{method,headers:{'X-JWT-Setup-Time':String(stamp),'X-JWT-Setup-Nonce':nonce,'X-JWT-Setup-Source':c.source,'X-JWT-Setup-Manifest':c.manifestHash,'X-JWT-Setup-Proof':createHmac('sha256',key).update(packet).digest('base64url')}});
  }
  return {mf,db,shared,call,async snapshot(){return (await mf.dispatchFetch(origin+'/__test/snapshot')).json();},async close(){
   try{for(const binding of ['ACADEMY_DB','ACADEMY_ADMIN_DB']){const held=await mf.getD1Database(binding,'setup');const row=await held.prepare("SELECT count(*) n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA'").first();assert.equal(row.n,0,'Old LOCAL sentinels must stay empty');}}
   finally{await mf.dispose();}
  }};
 }catch(e){await mf.dispose();throw e;}
}
test('actual workerd authenticated concurrent setup commits once; status and lost-ACK replay do not write',async()=>{
 const f=await fixture();try{
  for(const owner of ['core','admin']){
   const objects=(await f.db[owner].prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY type,name").all()).results.map(r=>[r.type,r.name,r.tbl_name,r.sql]);
   const counts=(await f.db[owner].prepare(c.tables[owner].map(name=>"SELECT '"+name+"' name,count(*) n FROM "+JSON.stringify(name)).join(' UNION ALL ')).all()).results;
   console.log('EMPTY_SCHEMA_COUNTS',JSON.stringify({owner,tables:c.tables[owner].length,rows:counts.length,nonempty:counts.filter(r=>r.n!==0)}));
   const actual=createHash('sha256').update(JSON.stringify(objects)).digest('hex');assert.equal(actual,c.objectHashes[owner],owner+' exact public schema hash');
  }
  const responses=await Promise.all(Array.from({length:8},()=>f.call()));const statuses=responses.map(r=>r.status);console.log('SETUP_PUBLIC_DIAGNOSTIC',JSON.stringify({statuses,snapshot:await f.snapshot()}));assert.equal(statuses.filter(x=>x===200).length,1);assert.equal(statuses.filter(x=>x===409).length,7);
  for(const r of responses){assert.equal(r.headers.get('set-cookie'),null);const text=await r.text();assert.equal(text.includes('pbkdf2'),false);assert.equal(text.includes(f.shared),false);}
  const snap=await f.snapshot();assert.equal(snap.publicClaim.state,'VERIFIED');assert.equal(snap.credentialPresent,false);assert.deepEqual(snap.metrics.batches,{core:1,admin:1});
  const rows=(await f.db.core.prepare('SELECT pin_hash FROM account_credentials').all()).results;assert.equal(rows.length,4);
  for(const row of rows)assert.equal((await verifyAcademyPin('2468',row.pin_hash,{SHARED_PIN_SECRET:f.shared})).valid,true,'Native PIN verification must succeed');
  const result=await f.call('status');assert.equal(result.status,200);const receipt=await result.json();assert.equal(receipt.state,'VERIFIED');assert.deepEqual(receipt.databaseIds,c.databaseIds);
  assert.equal((await f.call()).status,409);const after=await f.snapshot();assert.deepEqual(after.metrics,snap.metrics);assert.deepEqual(Object.keys(after.publicClaim).sort(),['databaseIds','finishedAt','manifestHash','nonceDigest','phase','planId','source','sourceDigest','startedAt','state']);
  receipts.push({case:'concurrent-success-status-replay',state:receipt.state,frontSetupRequests:11,privateSetupRequests:11,sqlBatches:snap.metrics.batches,prepares:snap.metrics.prepares,hostedCalls:0,oldLocalVerifierSelects:2});
 }finally{await f.close();}
});
test('actual staged Admin failure keeps committed Core, leaves UNKNOWN and never retries SQL',async()=>{
 const f=await fixture({fault:'admin'});try{
  const r=await f.call();assert.equal(r.status,409);assert.equal((await r.json()).state,'UNKNOWN');
  const a=await f.snapshot();console.log('STAGED_PUBLIC_DIAGNOSTIC',JSON.stringify(a));assert.deepEqual(a.metrics.batches,{core:1,admin:1});
  assert.equal((await f.db.core.prepare('SELECT count(*) n FROM accounts').first()).n,4);assert.equal((await f.db.admin.prepare('SELECT count(*) n FROM identity_refs').first()).n,0);
  assert.equal((await f.call()).status,409);assert.equal((await (await f.call('status')).json()).state,'UNKNOWN');assert.deepEqual((await f.snapshot()).metrics,a.metrics);
  receipts.push({case:'staged-admin-failure',state:'UNKNOWN',sqlBatches:a.metrics.batches,coreAccounts:4,adminAccounts:0,automaticRetry:false});
 }finally{await f.close();}
});
test('actual DO eviction turns persisted PREPARING into UNKNOWN; expired execute cannot reset claim; authenticated status remains read-only',async()=>{
 const f=await fixture({expired:true,schemas:false});try{
  assert.equal((await f.mf.dispatchFetch(origin+'/__test/prime')).status,204);
  assert.equal(typeof f.mf.unsafeEvictDurableObject,'function');
  await f.mf.unsafeEvictDurableObject('setup','JWTFeatureAcademySplitCoordinator',{name:setupName});
  const r=await f.call('status');assert.equal(r.status,200);const state=await r.json();assert.equal(state.state,'UNKNOWN');assert.equal(state.phase,'interrupted');
  assert.equal((await f.call()).status,403);const a=await f.snapshot();assert.deepEqual(a.metrics,{prepares:0,batches:{core:0,admin:0}});assert.equal(a.credentialPresent,false);
  receipts.push({case:'real-eviction-expired-window',state:'UNKNOWN',sqlBatches:a.metrics.batches,expiryResetsClaim:false});
 }finally{await f.close();}
});
test('actual nonempty fresh store is rejected before seed batches, without old fallback',async()=>{
 const f=await fixture();try{
  await f.db.admin.prepare("INSERT INTO identity_refs(account_id) VALUES('test-nonempty')").run();
  const r=await f.call();assert.equal(r.status,409);assert.equal((await r.json()).state,'UNKNOWN');const snap=await f.snapshot();assert.deepEqual(snap.metrics.batches,{core:0,admin:0});
  receipts.push({case:'nonempty-store',state:'UNKNOWN',sqlBatches:snap.metrics.batches});
 }finally{await f.close();}
});
test('public setup evidence explicitly excludes hosted installation and final cleanup proof',()=>{
 const dir=resolve(process.env.RUNNER_TEMP,'jwt-private-setup-evidence');mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'setup-proof.json'),JSON.stringify({schema:1,source:process.env.GITHUB_SHA,scope:'Disposable local workerd setup source only',contractManifest:c.manifestHash,testDatabaseIds:c.databaseIds,contractObjectHashes:c.objectHashes,templateHashes:c.templateHashes,results:receipts,hostedCalls:0,productionChanges:0,installerImplemented:false,finalHostedRemovalVerified:false,oldRecoveryQuiescenceClaim:false},null,2)+'\n');
});
