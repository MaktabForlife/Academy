import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {packageFixture,bw,bc,baseline} from './fixtures/jwt-feature-install-fixture.mjs';
import {completeInstallPackage,assertNoTemporarySurface,bindPublicSigningKey} from '../tools/jwt-feature-install-package.mjs';
import {createPrivateCapsule} from '../tools/jwt-feature-install-secrets.mjs';
import {setupClient} from '../tools/jwt-feature-setup-client.mjs';
import {coordinatorSourceDigest} from '../tools/jwt-feature-code-digest.mjs';
import {renderCandidateConfigs} from '../tools/jwt-feature-transition.mjs';
import {runEightRequestSmoke} from '../tools/jwt-feature-eight-request-smoke.mjs';
import {verifyAcademyPin} from '../src/lib/academy-pin.js';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const root=process.cwd(),origin='https://feature_worker.maktab4life.workers.dev';
async function bundle(path){
 const out=await build({entryPoints:[resolve(root,path)],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,external:['cloudflare:workers','node:*']});
 assert(!Object.keys(out.metafile.inputs).some(p=>p.startsWith('backend/tests/')),'TEST_PROBE_IN_PRODUCTION_GRAPH');
 return {script:out.outputFiles[0].text,inputs:Object.keys(out.metafile.inputs)};
}
test('actual temporary native constructors seed only fresh local pair; final PAUSED bundle removes setup HTTP/RPC with no secret/probe imports',async()=>{
 const {p,contract,receipt}=packageFixture();p.publicManifest.coordinatorSourceDigest=await coordinatorSourceDigest(root);for(const [path,data]of Object.entries(p.sources)){mkdirSync(resolve(root,path,'..'),{recursive:true});writeFileSync(resolve(root,path),data);}
 const sw=await bundle('backend/src/__jwt_feature_setup_worker.js'),sc=await bundle('backend/src/__jwt_feature_setup_coordinator.js'),fw=await bundle('backend/src/academy-feature-jwt-runtime.js'),fc=await bundle('backend/src/academy-split-coordinator.js');
 assert(sw.inputs.some(x=>x.endsWith('academy/jwt-feature-setup.mjs')));assert(sc.inputs.some(x=>x.endsWith('academy/jwt-feature-setup.mjs')));
 assert(!fw.inputs.some(x=>x.endsWith('academy/jwt-feature-setup.mjs'))&&!fc.inputs.some(x=>x.endsWith('academy/jwt-feature-setup.mjs')));
 let mf;const sealed={},shared=randomBytes(64).toString('base64url');
 const capsule=await createPrivateCapsule('2468',{kid:'jwt-feature-v110-20261106a-local-bundle',setupClientFactory:opts=>setupClient({...opts,fetcher:(url,options)=>mf.dispatchFetch(url,options)})});
 bindPublicSigningKey(p,capsule.publicKey);
 await capsule.ingress(async values=>{for(const [name,s]of Object.entries(values))sealed[name]=s.text;});
 const databases={ACADEMY_DB:'held-core',ACADEMY_ADMIN_DB:'held-admin',JWT_V110_CORE_DB:'fresh-core',JWT_V110_ADMIN_DB:'fresh-admin'};
 const native={PIN_SECRET:'uninstalled-native-pin',SESSION_SECRET:'uninstalled-native-session',SHARED_PIN_SECRET:shared,ACADEMY_OPEN_LIBRARY_STORAGE_KEY:'uninstalled-native-library'};
 const privateDO={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',useSQLite:true},JWT_V110_SPLIT_COORDINATOR:{className:'JWTFeatureAcademySplitCoordinator',useSQLite:true}};
 const mainDO={...privateDO,PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true},JWT_V110_TIMETABLE_COORDINATOR:{className:'JWTFeatureProgramTimetableCoordinator',useSQLite:true}};
 for(const k of ['ACADEMY_SPLIT_COORDINATOR','JWT_V110_SPLIT_COORDINATOR'])mainDO[k]={...mainDO[k],scriptName:'academy-feature-split-coordinator'};
 const finalRates=[...(p.baseWorker.ratelimits||[]),{name:'JWT_V110_RATE_LIMITER',namespace_id:'100112',simple:{limit:10,period:60}}];
 const common={modules:true,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat']};
 function options(wScript,cScript,wvars,cvars,secrets,probe=false){
  const workers=[{...common,name:'feature_worker',script:wScript,bindings:{...wvars,...native,...secrets},ratelimits:Object.fromEntries(finalRates.map(x=>[x.name,{namespace_id:x.namespace_id,simple:x.simple}])),r2Buckets:{MEDIA_BUCKET:'fresh-public',LESSON_MEDIA_BUCKET:'fresh-lessons',ASSESSMENT_BUCKET:'fresh-assessments'},d1Databases:databases,durableObjects:mainDO},
   {...common,name:'academy-feature-split-coordinator',script:cScript,bindings:cvars,d1Databases:databases,durableObjects:privateDO}];
  if(probe)workers.push({...common,name:'local-test-only-rpc-verifier',script:"export default {async fetch(request,env){const stub=env.PROBE.getByName("+JSON.stringify('jwt-feature-bootstrap:'+contract.planId+':'+contract.sourceDigest)+");for(const method of ['setupStatus','setupExecute','setupSchemaStatus','setupSchemaExecute']){try{await stub[method]({source:"+JSON.stringify(contract.source)+",manifestHash:"+JSON.stringify(contract.manifestHash)+"});return new Response(null,{status:500});}catch{}}return new Response(null,{status:410});}};",durableObjects:{PROBE:{className:'JWTFeatureAcademySplitCoordinator',scriptName:'academy-feature-split-coordinator',useSQLite:true}}});

  return convertV4MiniflareOptions({workers});
 }
 mf=new Miniflare(options(sw.script,sc.script,p.worker.vars,p.coordinator.vars,sealed));
 try{
  const {sql}=await import('../tools/jwt-feature-setup-contract.mjs').then(m=>m.setupContract({source:process.env.GITHUB_SHA,databaseIds:receipt.databaseIds,structuredDDL:true}));
  const db={core:await mf.getD1Database('JWT_V110_CORE_DB','feature_worker'),admin:await mf.getD1Database('JWT_V110_ADMIN_DB','feature_worker')};
  await db.core.batch([db.core.prepare(sql.core[0])]); // Exact observed one-table starting state, LOCAL fixture only.
  const denied=await mf.dispatchFetch(origin+'/academy/');assert.equal(denied.status,503);assert.deepEqual(await denied.json(),{code:'FEATURE_SETUP_PAUSED'});
  const schema=await capsule.setup({contract,issued:p.publicManifest.issued,expires:p.publicManifest.expires,phase:'schema'});
  assert.equal(schema.receipt.state,'VERIFIED');assert.equal(schema.receipt.stage,'SCHEMA_ONLY');
  const setup=await capsule.setup({contract,issued:p.publicManifest.issued,expires:p.publicManifest.expires});
  assert.equal(setup.receipt.state,'VERIFIED');assert.equal(setup.executeRequests,1);assert.equal(setup.statusRequests,1);
  const credentials=(await db.core.prepare('SELECT pin_hash FROM account_credentials ORDER BY account_id').all()).results;assert.equal(credentials.length,4);
  for(const r of credentials)assert((await verifyAcademyPin('2468',r.pin_hash,{SHARED_PIN_SECRET:shared})).valid,'NATIVE_PIN_FAILED');
  const final=completeInstallPackage(p,baseline,receipt,contract,{timetableNamespaceId:'c'.repeat(32),splitNamespaceId:'d'.repeat(32),publicKid:capsule.publicKey.kid,publicKeys:[capsule.publicKey],verifiedAt:new Date().toISOString()});assertNoTemporarySurface(final);
  const finalSealed=Object.fromEntries(Object.entries(sealed).filter(([k])=>!k.startsWith('JWT_FEATURE_SETUP_')));
  await mf.setOptions(options(fw.script,fc.script,final.worker.vars,final.coordinator.vars,finalSealed,true));
  for(const path of ['/__jwt_feature_release','/internal/feature-jwt-setup/status','/internal/feature-jwt-setup/schema-status','/internal/feature-jwt-setup/execute','/internal/feature-jwt-setup/schema-execute','/auth/v110/login']){
   const response=await mf.dispatchFetch(origin+path);assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert(response.headers.get('cache-control')?.includes('no-store'));assert.deepEqual(await response.json(),{code:'FEATURE_JWT_UNAVAILABLE'});
  }
  const verifier=await mf.getWorker('local-test-only-rpc-verifier');assert.equal((await verifier.fetch('https://local-verifier.invalid/')).status,410,'OLD_SETUP_RPC_STILL_AVAILABLE');
  for(const name of ['ACADEMY_DB','ACADEMY_ADMIN_DB']){const held=await mf.getD1Database(name,'feature_worker'),r=await held.prepare("SELECT count(*) n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA'").first();assert.equal(r.n,0,'HELD_LOCAL_SENTINEL_CHANGED');}
  const active=renderCandidateConfigs(p.baseWorker,p.baseCoordinator,baseline,final.receipt,{releaseId:process.env.GITHUB_SHA,mode:'ACTIVE'});
  for(const c of [active.worker,active.coordinator])c.vars={...c.vars,JWT_FEATURE_INSTALL_SOURCE:p.publicManifest.source,JWT_FEATURE_INSTALL_OWNER:p.publicManifest.owner};
  await mf.setOptions(options(fw.script,fc.script,active.worker.vars,active.coordinator.vars,finalSealed));
  const smoke=await runEightRequestSmoke({dispatch:(url,options)=>mf.dispatchFetch(url,options),uniqueid:'feature-test-learner',pin:'2468',expectedAccount:'feature-synthetic-learner-a',requireMetrics:false});
  assert.deepEqual(smoke.calls.map(x=>x.status),[200,200,200,200,403,200,200,401]);
  assert.equal(smoke.metricsObserved,false);assert.equal(smoke.totals.rowsRead,null);
  const out=resolve(process.env.RUNNER_TEMP,'jwt-install-package-evidence');mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'workerd-package.json'),JSON.stringify({source:process.env.GITHUB_SHA,scope:'LOCAL_ONLY_ACTUAL_PRODUCTION_CONSTRUCTORS',selectedCompatibilityDate:'2026-10-23',nodeVersion:process.version,miniflareVersion:require('miniflare/package.json').version,installedSignerEightRequestStatuses:smoke.calls.map(x=>x.status),eightRequestMetricsObserved:false,schemaRequests:2,structuredSchemaVerified:true,setupRequests:2,seedVerified:true,nativeCredentialVerifications:4,finalPausedDenials:6,setupRPCMethodsRemoved:4,setupRPCRemoved:true,finalProductionGraphsExcludeSetupAndTests:true,heldLocalSentinelSelects:2,additionalLocalCredentialSelects:1,fixtureDDLExcluded:true,hostedCalls:0},null,2)+'\n');
 }finally{capsule.destroy();for(const k of Object.keys(sealed))sealed[k]='';await mf.dispose();}
});
