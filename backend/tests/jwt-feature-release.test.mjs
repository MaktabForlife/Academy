import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {releaseProfiles,releaseFreshFeature} from '../tools/jwt-feature-release-controller.mjs';
import {createFeatureReleaseOps} from '../tools/jwt-feature-release-transport.mjs';
import {completeInstallPackage} from '../tools/jwt-feature-install-package.mjs';
import {packageFixture,bw,bc,baseline} from './fixtures/jwt-feature-install-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture({coordinatorChanged=false}={}){
 const {p,receipt,contract}=packageFixture(),publicKey={kty:'EC',crv:'P-256',kid:'jwt-feature-v110-20261106a-release-only',x:'A'.repeat(43),y:'B'.repeat(43)};
 const paused=completeInstallPackage(p,baseline,receipt,contract,{timetableNamespaceId:'c'.repeat(32),splitNamespaceId:'d'.repeat(32),publicKid:publicKey.kid,publicKeys:[publicKey],verifiedAt:new Date().toISOString()});
 const workerVersion='00000000-0000-4000-8000-000000000001',coordinatorVersion='00000000-0000-4000-8000-000000000002';
 const installation={...paused.receipt,structuredSchemaVerified:true,schemaVerification:{core:{objects:1372,tables:172,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:contract.objectHashes.core},admin:{objects:83,tables:55,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:contract.objectHashes.admin}},installedVersions:{feature_worker:workerVersion,'academy-feature-split-coordinator':coordinatorVersion},installOwner:p.publicManifest.owner,installedMode:'PAUSED',temporarySecretsRemoved:true,temporarySurfaceRemoved:true};
 const installed={schema:1,coordinatorSourceDigest:installation.coordinatorSourceDigest,mode:'PAUSED',releaseId:installation.reviewedSetupCommit,workerVersion,coordinatorVersion},source='b'.repeat(40);
 const profiles=releaseProfiles({baseWorker:bw,baseCoordinator:bc,nativeReceipt:baseline,installation,installed,source,coordinatorSourceDigest:coordinatorChanged?'f'.repeat(64):installation.coordinatorSourceDigest});
 return {profiles,installation,installed,source};
}
test('routine profile removes migrations, preserves exact new/old store and namespace bindings, and requires cleaned setup',()=>{
 const f=fixture();for(const c of [f.profiles.active.worker,f.profiles.active.coordinator])assert.equal(c.migrations,undefined);
 assert.deepEqual(f.profiles.active.worker.d1_databases,f.profiles.before.worker.d1_databases);assert.equal(f.profiles.active.worker.d1_databases.length,4);
 assert.equal(f.profiles.active.worker.vars.JWT_V110_MASTER,'1');assert.equal(f.profiles.paused.worker.vars.JWT_V110_MASTER,'0');
 for(const [key,value]of [['temporarySecretsRemoved',false],['temporarySurfaceRemoved',false],['installedMode','ACTIVE']])assert.throws(()=>releaseProfiles({baseWorker:bw,baseCoordinator:bc,nativeReceipt:baseline,installation:{...f.installation,[key]:value},installed:f.installed,source:f.source}));
});
function fake({where,foreign=false,withdraw=false}={}){
 let writes=0;const events=[],evidence=[];
 const ops={targets:['academy-feature-split-coordinator','feature_worker'],fresh:async()=>{events.push('approval');if(withdraw&&writes)throw Error('withdrawn');},owned:async()=>{events.push('owned');if(foreign&&writes)throw Error('foreign');},preflight:async()=>{events.push('preflight');if(where==='preflight')throw Error('stop');},
 deploy:async n=>{writes++;events.push(n);if(where===n)throw Error('unknown');},adopt:async()=>{},publicProof:async()=>{if(where==='public')throw Error('bad static');},smoke:async()=>({totals:{apiRequests:8,rowsRead:null},metricsObserved:false}),verifyFinal:async()=>{},pause:async()=>{events.push('pause');},verifyPaused:async()=>{events.push('paused-verified');},save:x=>evidence.push(x)};
 return {ops,events,evidence,get writes(){return writes;}};
}
test('approval and both owned versions fence each update; coordinator precedes Worker; only completed proof activates',async()=>{
 const f=fake(),out=await releaseFreshFeature(f);assert.equal(out.state,'FEATURE_VERIFIED');assert.equal(out.activated,true);assert.equal(f.writes,2);
 assert(f.events.indexOf('academy-feature-split-coordinator')<f.events.indexOf('feature_worker'));
});
test('preflight failure has no write or pause',async()=>{const f=fake({where:'preflight'});await assert.rejects(releaseFreshFeature(f));assert.equal(f.writes,0);assert(!f.events.includes('pause'));});
test('approval withdrawal after coordinator update permits only owned pause',async()=>{const f=fake({withdraw:true});await assert.rejects(releaseFreshFeature(f));assert.equal(f.writes,1);assert(f.events.includes('paused-verified'));assert.equal(f.evidence.at(-1).recovery,'OWNED_FEATURE_PAUSED');});
test('unknown upload outcome cannot overwrite a changed version',async()=>{const f=fake({where:'feature_worker',foreign:true});await assert.rejects(releaseFreshFeature(f));assert(!f.events.includes('pause'));assert.equal(f.evidence.at(-1).recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');});
test('failed public verification pauses owned JWT source instead of native rollback',async()=>{const f=fake({where:'public'});await assert.rejects(releaseFreshFeature(f));assert(f.events.includes('paused-verified'));assert.equal(f.evidence.at(-1).activated,false);});
function releaseSettings(c,{assetConfig=true,modernD1=false}={}){
 const bindings=[];for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',[modernD1?'database_id':'id']:b.database_id});
 for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars))bindings.push({name,type:'plain_text',text});
 for(const name of c.secrets?.required||[])bindings.push({name,type:'secret_text',text:'MUST_NOT_BE_REPORTED'});
 for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects.bindings){
  const ids={ProgramTimetableCoordinator:baseline.timetableNamespaceId,AcademySplitCoordinator:baseline.splitNamespaceId,JWTFeatureProgramTimetableCoordinator:'c'.repeat(32),JWTFeatureAcademySplitCoordinator:'d'.repeat(32)};
  bindings.push({name:b.name,type:'durable_object_namespace',class_name:b.class_name,namespace_id:ids[b.class_name],script_name:b.script_name||c.name});
 }
 if(c.assets)bindings.push({name:'ASSETS',type:'assets'});
 return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,tail_consumers:[],observability:c.observability,...(assetConfig&&c.assets?{assets:{config:{run_worker_first:c.assets.run_worker_first,not_found_handling:'none',html_handling:'auto-trailing-slash',base_path:'/'}}}:{})};
}
test('actual release transport LOCAL mock: two uploads,24 explicit metadata GETs,3 public+8 auth attempts; no SQL/secret/Pages API',async()=>{
 const f=fixture({coordinatorChanged:true}),configs={feature_worker:f.profiles.before.worker,'academy-feature-split-coordinator':f.profiles.before.coordinator},versions={feature_worker:f.installed.workerVersion,'academy-feature-split-coordinator':f.installed.coordinatorVersion};
 const publicBodies={'/academy/':'<html><body>only synthetic public shell</body></html>','/auth/v110/browser-config.js':'window.M4L_V110_CONFIG=Object.freeze({enabled:true});'};
 const assets=new Map(Object.entries(publicBodies).map(([k,v])=>[k,hash(v)]));let sequence=10,requests=0,writes=0,approvalChecks=0;

 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},subject='feature-synthetic-learner-a';
 const fetcher=async(url,options={})=>{
  const u=new URL(url);
  if(u.hostname==='api.cloudflare.com'){
   assert.equal(options.method,undefined);const [name,kind]=u.pathname.split('/').slice(7,9);assert(configs[name]);let result;
   if(kind==='settings')result=releaseSettings(configs[name]);else if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};else if(kind==='subdomain')result={enabled:name==='feature_worker',previews_enabled:false};else if(kind==='schedules')result=[];else assert.fail('FORBIDDEN_CONTROL_API');
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,f.profiles.origin);
  if(u.pathname==='/__jwt_feature_release')return Response.json({featureOnly:true,sourceCommit:f.source,state:'ACTIVE'},{headers});
  if(publicBodies[u.pathname])return new Response(publicBodies[u.pathname],{headers});
  requests++;assert(requests<=8);let body={},status=200;
  const hs=new Headers(headers);
  if(requests===1){
   assert.equal(JSON.parse(options.body).pin,'2468');body={account:{accountId:subject},csrf:'A'.repeat(43),sessionKey:'uaa-session:local-synthetic'};
   for(const [k,v]of [['__Secure-uaa_a','UNINSTALLED_LOCAL_ACCESS'],['__Host-uaa_r','UNINSTALLED_LOCAL_REFRESH']])hs.append('Set-Cookie',k+'='+v+'; Path=/; Secure; HttpOnly; SameSite=Strict');
  }else{
   assert(options.headers.Cookie.includes('UNINSTALLED_LOCAL_ACCESS'));assert.equal(options.headers.Authorization,'Bearer uaa-session:local-synthetic');
   if(requests===3)body={account:{accountId:subject}};
   if(requests===5)status=403;
   if(requests===6)body={refreshed:true};
   if(requests===7){body={cancelled:true};for(const k of ['__Secure-uaa_a','__Host-uaa_r'])hs.append('Set-Cookie',k+'=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict');}
   if(requests===8)status=401;
  }
  return Response.json(body,{status,headers:hs});
 };
 const dir=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-release-mock-'));
 const ops=createFeatureReleaseOps({root:process.cwd(),directory:dir,evidenceDirectory:resolve(dir,'public'),profiles:f.profiles,nativeReceipt:baseline,installation:f.installation,installed:f.installed,source:f.source,fresh:async()=>{approvalChecks++;},token:'uninstalled-local-token',pin:'2468',assets,fetcher,runWrangler:async(args,{name,config})=>{writes++;assert.equal(config.migrations,undefined);configs[name]=config;versions[name]='00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');}});
 await releaseFreshFeature({ops});
 const report=JSON.parse(readFileSync(resolve(dir,'public/deployment.json'),'utf8'));assert.equal(writes,2);assert.equal(requests,8);assert.equal(report.explicitCloudflareGets,24);assert.equal(report.publicHTTPAttempts,3);assert.equal(report.smokeHTTPAttempts,8);assert.equal(approvalChecks,4);assert.equal(report.smoke.metricsObserved,false);assert.equal(report.smoke.totals.rowsRead,null);
 const text=JSON.stringify(report);for(const bad of ['2468','MUST_NOT_BE_REPORTED','UNINSTALLED_LOCAL_ACCESS','UNINSTALLED_LOCAL_REFRESH','uaa-session:local-synthetic'])assert(!text.includes(bad));
});

test('JWT Feature approval selects only the new routine workflow; configuration remains check-only legacy workflow',async()=>{
 const {featureReleaseWorkflow}=await import('../../tools/approved-deployment.mjs');
 assert.equal(featureReleaseWorkflow({kind:'release',target:'feature',contains_jwt:true}),'feature-jwt-release.yml');
 assert.equal(featureReleaseWorkflow({kind:'configuration',target:'none',contains_jwt:false}),'feature-isolation-check.yml');
 assert.throws(()=>featureReleaseWorkflow({kind:'release',target:'production',contains_jwt:true}));
 assert.throws(()=>featureReleaseWorkflow({kind:'release',target:'feature',contains_jwt:false}));
});

test('byte-identical coordinator source graph needs no unrelated coordinator upload',async()=>{
 const f=fixture();assert.equal(f.profiles.coordinatorChanged,false);
 const changing=fixture({coordinatorChanged:true});assert.equal(changing.profiles.coordinatorChanged,true);
 let targets;const observed=[];
 const ops={targets:['feature_worker'],preflight:async()=>{},fresh:async()=>{},owned:async()=>{},deploy:async name=>observed.push(name),adopt:async()=>{},publicProof:async()=>{},smoke:async()=>({}),verifyFinal:async()=>{},save:()=>{}};
 await releaseFreshFeature({ops});assert.deepEqual(observed,['feature_worker']);
});

 
// Regression for the actual production transport's metadata caller. These are
// injected HTTP mocks and hypothetical LOCAL installation records, not live
// cleanup/activation authority or proof of deployed asset routing/code.
for(const missingBinding of [false,true])test('actual release caller binding-only settings: '+(missingBinding?'missing ASSETS still denied':'documented omission + modern D1 IDs accepted'),async()=>{
 const f=fixture(),configs={feature_worker:f.profiles.before.worker,'academy-feature-split-coordinator':f.profiles.before.coordinator};
 const versions={feature_worker:f.installed.workerVersion,'academy-feature-split-coordinator':f.installed.coordinatorVersion},calls=[];
 let omittedAssetReplies=0;
 const fetcher=async(url,options={})=>{
  const u=new URL(url);assert.equal(u.origin,'https://api.cloudflare.com');assert.equal(options.method,undefined);
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,'Bearer uninstalled-shape-regression-token');
  const [name,kind]=u.pathname.split('/').slice(7,9);assert(Object.hasOwn(configs,name));calls.push({name,kind});
  let result;
  if(kind==='settings'){
   result=releaseSettings(configs[name],{assetConfig:false,modernD1:true});
   assert.equal(Object.hasOwn(result,'assets'),false);
   for(const b of result.bindings)if(b.type==='d1'){assert(Object.hasOwn(b,'database_id'));assert.equal(Object.hasOwn(b,'id'),false);}
   if(configs[name].assets){omittedAssetReplies++;if(missingBinding)result.bindings=result.bindings.filter(b=>b.type!=='assets');}
  }else if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};
  else if(kind==='subdomain')result={enabled:name==='feature_worker',previews_enabled:false};
  else if(kind==='schedules')result=[];
  else assert.fail('Only metadata GETs permitted in this local regression');
  return Response.json({success:true,result});
 };
 const dir=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-release-shape-regression-'));
 const ops=createFeatureReleaseOps({root:process.cwd(),directory:dir,evidenceDirectory:resolve(dir,'public'),profiles:f.profiles,nativeReceipt:baseline,installation:f.installation,installed:f.installed,source:f.source,fresh:async()=>{},token:'uninstalled-shape-regression-token',pin:undefined,assets:new Map(),fetcher,runWrangler:async()=>assert.fail('No mock upload is permitted')});
 if(missingBinding){
  await assert.rejects(ops.preflight());assert.equal(calls.length,1);
 }else{
  await ops.preflight();await ops.verifyFinal();assert.equal(calls.length,16);
  assert.equal(omittedAssetReplies,2);
 }
 assert(calls.every(c=>['settings','deployments','subdomain','schedules'].includes(c.kind)));
});
