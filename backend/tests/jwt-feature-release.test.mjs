import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,appendFileSync,writeFileSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonical,digest,freezeUploadArtifact} from '../tools/jwt-feature-upload-artifact.mjs';
import {createHash} from 'node:crypto';
import {releaseProfiles,releaseFreshFeature,resumeInterruptedFeature} from '../tools/jwt-feature-release-controller.mjs';
import {interruptedProfiles} from '../tools/jwt-feature-resume-contract.mjs';
import {createFeatureReleaseOps} from '../tools/jwt-feature-release-transport.mjs';
import {completeInstallPackage} from '../tools/jwt-feature-install-package.mjs';
import {packageFixture,bw,bc,baseline} from './fixtures/jwt-feature-install-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
globalThis.fetch=()=>{throw Error('HOSTED_FETCH_FORBIDDEN_SOURCE_CHECK');};
const hash=x=>createHash('sha256').update(x).digest('hex');
function localArtifact(f,c,label){
 return {source:f.source,artifactSHA256:digest(label),assertFrozen(){},render(value){assert.deepEqual(value,c);return {...structuredClone(c),main:'/LOCAL_ONLY/'+label+'.mjs',no_bundle:true};}};
}
function localPolicy(f,artifacts,mode='ACTIVE'){
 const p={schema:1,kind:'REVIEWED_EXISTING_FEATURE_SCRIPT_REPLACEMENT',sourceBinding:'EXACT_APPROVED_FEATURE_TREE',mode,oldAllowanceReusable:false,referenceVersions:{feature_worker:f.installed.workerVersion,'academy-feature-split-coordinator':f.installed.coordinatorVersion},firstWrites:Object.fromEntries(['feature_worker',...(f.profiles.coordinatorChanged?['academy-feature-split-coordinator']:[])].map(n=>[n,artifacts[n].artifactSHA256])),recovery:mode==='ACTIVE'?{target:'feature_worker',artifactSHA256:artifacts.pausedWorker.artifactSHA256}:null,budgets:{metadataGETs:36,uploads:3,publicGETs:mode==='ACTIVE'?3:0,smokeRequests:mode==='ACTIVE'?8:0,pausedGETs:1}};
 return {writePolicy:p,writePolicySHA256:digest(canonical(p))};
}
function emitACK(args,ctx,versionId){
 const timestamp=new Date().toISOString();
 assert.equal(ctx.env.WRANGLER_OUTPUT_FILE_DIRECTORY,undefined);
 appendFileSync(ctx.env.WRANGLER_OUTPUT_FILE_PATH,JSON.stringify({type:'wrangler-session',version:1,wrangler_version:'4.136.3',command_line_args:args,log_file_path:'/LOCAL_ONLY/private.log',timestamp})+'\n'+JSON.stringify({type:'deploy',version:1,worker_name:ctx.name,worker_tag:null,version_id:versionId,worker_name_overridden:false,targets:ctx.name==='feature_worker'?['https://feature_worker.maktab4life.workers.dev']:[],timestamp})+'\n');
}
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
 const ops={mode:'ACTIVE',targets:['academy-feature-split-coordinator','feature_worker'],fresh:async()=>{events.push('approval');if(withdraw&&writes)throw Error('withdrawn');},fence:async()=>{events.push('fence');if(foreign&&writes)throw Error('foreign');},recoveryFresh:async()=>{},canRecover:()=>writes>=2&&where!=='feature_worker'&&!foreign,preflight:async()=>{events.push('preflight');if(where==='preflight')throw Error('stop');},
 deploy:async n=>{writes++;events.push(n);if(where===n)throw Error('unknown');},adopt:async()=>{},publicProof:async()=>{if(where==='public')throw Error('bad static');},smoke:async()=>({totals:{apiRequests:8,rowsRead:null},metricsObserved:false}),verifyFinal:async()=>{},pause:async()=>{events.push('pause');},verifyPaused:async()=>{events.push('paused-verified');},save:x=>evidence.push(x)};
 return {ops,events,evidence,get writes(){return writes;}};
}
test('approval and both owned versions fence each update; coordinator precedes Worker; only completed proof activates',async()=>{
 const f=fake(),out=await releaseFreshFeature(f);assert.equal(out.state,'FEATURE_VERIFIED');assert.equal(out.activated,true);assert.equal(f.writes,2);
 assert(f.events.indexOf('academy-feature-split-coordinator')<f.events.indexOf('feature_worker'));
});
test('preflight failure has no write or pause',async()=>{const f=fake({where:'preflight'});await assert.rejects(releaseFreshFeature(f));assert.equal(f.writes,0);assert(!f.events.includes('pause'));});
test('approval withdrawal after coordinator update cannot pause unowned MAIN',async()=>{const f=fake({withdraw:true});await assert.rejects(releaseFreshFeature(f));assert.equal(f.writes,1);assert(!f.events.includes('paused-verified'));assert.equal(f.evidence.at(-1).recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');});
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
test('actual release transport LOCAL mock: two ACK-bound uploads,28 explicit metadata GETs,3 public+8 auth attempts; no SQL/secret/Pages API',async()=>{
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
 const artifacts={feature_worker:localArtifact(f,f.profiles.active.worker,'active-worker'),'academy-feature-split-coordinator':localArtifact(f,f.profiles.active.coordinator,'active-coordinator'),pausedWorker:localArtifact(f,f.profiles.paused.worker,'paused-worker')};
 const policy=localPolicy(f,artifacts);
 const ops=createFeatureReleaseOps({root:process.cwd(),directory:dir,evidenceDirectory:resolve(dir,'public'),profiles:f.profiles,nativeReceipt:baseline,installation:f.installation,installed:f.installed,source:f.source,fresh:async()=>{approvalChecks++;},token:'uninstalled-local-token',pin:'2468',assets,artifacts,...policy,fetcher,runWrangler:async(args,ctx)=>{const {name,config}=ctx;writes++;assert.equal(config.migrations,undefined);configs[name]=config;versions[name]='00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');emitACK(args,ctx,versions[name]);}});
 await releaseFreshFeature({ops});
 const report=JSON.parse(readFileSync(resolve(dir,'public/deployment.json'),'utf8'));assert.equal(writes,2);assert.equal(requests,8);assert.equal(report.explicitCloudflareGets,28);assert.equal(report.publicHTTPAttempts,3);assert.equal(report.smokeHTTPAttempts,8);assert.equal(approvalChecks,6);assert.equal(report.smoke.metricsObserved,false);assert.equal(report.smoke.totals.rowsRead,null);
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
 const ops={mode:'ACTIVE',targets:['feature_worker'],preflight:async()=>{},fresh:async()=>{},fence:async()=>{},canRecover:()=>false,deploy:async name=>observed.push(name),adopt:async()=>{},publicProof:async()=>{},smoke:async()=>({}),verifyFinal:async()=>{},save:()=>{}};
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


// All following provider/CLI values are synthetic. No live receipt is embedded.
function guarded({failure,paused=false,coordinator=false,noPolicy=false,metadataBudget=36,root=process.cwd()}={}){
 const f=fixture({coordinatorChanged:coordinator});
 if(paused){
  const reference={schema:1,state:'INTERRUPTED_PAUSED_REFERENCE',referenceVersions:{feature_worker:f.installed.workerVersion,'academy-feature-split-coordinator':f.installed.coordinatorVersion},namespaces:{timetable:f.installation.timetableNamespaceId,split:f.installation.splitNamespaceId},claims:{installationVerified:false,referenceVersionsOwned:false,schemaAndSeedAttestedHere:false,compiledCodeAttested:false,privateKeyAttested:false,routingAtomicityAttested:false}};
  f.profiles=interruptedProfiles({reference,configs:f.profiles.paused,source:f.source,coordinatorSourceDigest:'e'.repeat(64),coordinatorReplacement:coordinator});
 }
 const selected=paused?f.profiles.paused:f.profiles.active;
 const artifacts={feature_worker:localArtifact(f,selected.worker,'selected-worker'),'academy-feature-split-coordinator':localArtifact(f,selected.coordinator,'selected-coordinator'),pausedWorker:localArtifact(f,f.profiles.paused.worker,'paused-recovery')};
 if(paused)artifacts.pausedWorker=artifacts.feature_worker;
 const policy=localPolicy(f,artifacts,paused?'PAUSED_RESUME':'ACTIVE');policy.writePolicy.budgets.metadataGETs=metadataBudget;policy.writePolicySHA256=digest(canonical(policy.writePolicy));
 const configs={feature_worker:f.profiles.before.worker,'academy-feature-split-coordinator':f.profiles.before.coordinator},versions={...policy.writePolicy.referenceVersions};
 const dir=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-guarded-local-'));
 let writes=0,sequence=20,gets=0;
 const fresh=async()=>{if(failure==='withdrawal'&&writes)throw Error('APPROVAL_WITHDRAWN');};
 const fetcher=async(url)=>{
  const u=new URL(url);
  if(u.hostname==='api.cloudflare.com'){
   gets++;const [n,k]=u.pathname.split('/').slice(7,9);let result;
   if(k==='settings')result=releaseSettings(configs[n],{assetConfig:false,modernD1:true});
   else if(k==='deployments')result={deployments:[{versions:[{version_id:versions[n],percentage:100}]}]};
   else if(k==='subdomain')result={enabled:n==='feature_worker',previews_enabled:false};
   else if(k==='schedules')result=[];else assert.fail('FORBIDDEN_API');
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,f.profiles.origin);assert.equal(u.pathname,'/__jwt_feature_release');
  return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
 };
 const ops=createFeatureReleaseOps({root,directory:dir,evidenceDirectory:resolve(dir,'public'),profiles:f.profiles,nativeReceipt:baseline,installation:f.installation,installed:f.installed,source:f.source,fresh,token:'UNINSTALLED_MOCK_ONLY',assets:new Map(),artifacts,...(noPolicy?{}:policy),fetcher,runWrangler:async(args,ctx)=>{
  writes++;assert.equal(ctx.rendered.no_bundle,true);assert(ctx.rendered.main.startsWith('/LOCAL_ONLY/'));
  configs[ctx.name]=ctx.config;const id='00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');versions[ctx.name]=id;
  if(failure==='noack'||(failure==='lost-recovery-ack'&&writes===2))return;
  emitACK(args,failure==='wrong-target'?{...ctx,name:'academy-feature-split-coordinator'}:ctx,id);
  if(failure==='throw-after-ack')throw Error('SYNTHETIC_PROCESS_ERROR_WITH_PRIVATE_TEXT');
  if(failure==='artifact-after-start')artifacts[ctx.name].assertFrozen=()=>{throw Error('CHANGED_COMPILED_INPUT');};
  if(failure==='config-after-start'){chmodSync(args[2],0o600);writeFileSync(args[2],'{}');}
  if(failure==='foreign')versions[ctx.name]='ffffffff-ffff-4fff-8fff-ffffffffffff';
 }});
 return {f,ops,versions,artifacts,policy,dir,get writes(){return writes;},get gets(){return gets;},report:()=>JSON.parse(readFileSync(resolve(dir,'public/deployment.json'),'utf8'))};
}
test('truthful interrupted reference cannot satisfy the completed installation constructor',()=>{
 const h=guarded({paused:true});
 assert.equal(h.f.profiles.reference.claims.installationVerified,false);
 assert.throws(()=>releaseProfiles({baseWorker:bw,baseCoordinator:bc,nativeReceipt:baseline,installation:h.f.profiles.reference,installed:h.f.installed,source:h.f.source}));
 const fake=structuredClone(h.f.profiles.reference);fake.claims.installationVerified=true;
 assert.throws(()=>interruptedProfiles({reference:fake,configs:h.f.profiles.paused,source:h.f.source,coordinatorSourceDigest:'e'.repeat(64),coordinatorReplacement:false}));
});
test('PAUSED resume produces owned upload evidence without a clean-install DTO or activation',async()=>{
 const h=guarded({paused:true});const out=await resumeInterruptedFeature({ops:h.ops}),r=h.report();
 assert.equal(out.state,'PAUSED_CODE_RESUME_VERIFIED');assert.equal(out.activated,false);assert.equal(h.writes,1);
 assert.equal(r.installationVerified,false);assert.equal(r.referenceVersions.feature_worker,h.f.installed.workerVersion);
 assert.equal(r.ownedVersions.feature_worker,r.lastAcknowledgedUploads.feature_worker.versionId);
 assert.equal(r.ownedVersions['academy-feature-split-coordinator'],undefined);
 assert.equal(r.explicitCloudflareGets,26);assert.equal(r.pauseHTTPAttempts,1);assert.equal(r.publicHTTPAttempts,0);assert.equal(r.smokeHTTPAttempts,0);
 assert.equal(existsSync(resolve(h.dir,'public/next-installed-baseline.json')),false);
 assert(!JSON.stringify(r).includes(h.dir));assert.equal(r.remoteCodeAttested,false);assert.equal(r.privateKeyAttested,false);
});
for(const failure of ['noack','throw-after-ack','wrong-target','foreign','artifact-after-start','config-after-start'])test('actual transport denies '+failure+' without adopting observed UUID or overwriting',async()=>{
 const h=guarded({failure,paused:true});await assert.rejects(resumeInterruptedFeature({ops:h.ops}));
 const r=h.report();assert.equal(h.writes,1);assert.deepEqual(r.ownedVersions,{});
 assert.equal(r.writeOutcomeUnknown,true);assert.equal(r.recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
 assert.equal(r.activated,false);assert(!JSON.stringify(r).includes('PRIVATE_TEXT'));
 if(failure==='foreign')assert.notEqual(r.lastObservedVersions.feature_worker,r.lastAcknowledgedUploads.feature_worker.versionId);
});
test('missing explicit initial reference replacement policy permits no CLI attempt',async()=>{
 const h=guarded({paused:true,noPolicy:true});await assert.rejects(resumeInterruptedFeature({ops:h.ops}));assert.equal(h.writes,0);
 assert.deepEqual(h.report().ownedVersions,{});
});
test('same-profile version drift before the first write is denied with zero upload',async()=>{
 const h=guarded({paused:true});await h.ops.preflight();h.versions.feature_worker='ffffffff-ffff-4fff-8fff-ffffffffffff';
 await assert.rejects(h.ops.deploy('feature_worker'));assert.equal(h.writes,0);
});
test('approval withdrawal after coordinator ACK cannot recover an unowned MAIN reference',async()=>{
 const h=guarded({coordinator:true,failure:'withdrawal'});await assert.rejects(releaseFreshFeature({ops:h.ops}));
 assert.equal(h.writes,1);assert.equal(h.report().ownedVersions.feature_worker,undefined);assert.equal(h.report().recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
});
test('failed active proof can pause only its ACK-owned MAIN and the exact reviewed recovery artifact',async()=>{
 const h=guarded();await assert.rejects(releaseFreshFeature({ops:h.ops}));const r=h.report();
 assert.equal(h.writes,2);assert.equal(r.recovery,'OWNED_FEATURE_PAUSED');
 assert.equal(r.ownedVersions.feature_worker,r.lastAcknowledgedUploads.feature_worker.versionId);assert.equal(r.pauseHTTPAttempts,1);assert.equal(r.mode,'PAUSED');
 assert.equal(r.lastAcknowledgedUploads.feature_worker.artifactSHA256,h.artifacts.pausedWorker.artifactSHA256);
});
test('a lost recovery ACK spends one pause upload and cannot adopt the newly observed version',async()=>{
 const h=guarded({failure:'lost-recovery-ack'});await assert.rejects(releaseFreshFeature({ops:h.ops}));
 const r=h.report();assert.equal(h.writes,2);assert.equal(r.writeOutcomeUnknown,true);
 assert.equal(r.ownedVersions.feature_worker,undefined);assert.equal(r.recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');assert.equal(r.pauseHTTPAttempts,0);
});
test('approval withdrawal after MAIN ACK denies recovery writes under the same withdrawn gate',async()=>{
 const h=guarded({failure:'withdrawal'});await assert.rejects(releaseFreshFeature({ops:h.ops}));
 assert.equal(h.writes,1);assert.equal(h.report().recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
});
test('an installed CLI pin mismatch denies the first upload',async()=>{
 const root=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-wrong-pin-'));
 mkdirSync(resolve(root,'backend/node_modules/wrangler'),{recursive:true});writeFileSync(resolve(root,'backend/node_modules/wrangler/package.json'),JSON.stringify({version:'4.136.2'}));
 const h=guarded({root,paused:true});await assert.rejects(resumeInterruptedFeature({ops:h.ops}));assert.equal(h.writes,0);
});
test('async evidence persistence is rejected before an upload',async()=>{
 const h=guarded({paused:true});h.ops.save=()=>Promise.resolve();
 await assert.rejects(resumeInterruptedFeature({ops:h.ops}));assert.equal(h.writes,0);
});
test('actual current source graphs compile to frozen no_bundle inputs and exact public-byte hashes',async()=>{
 const f=fixture(),dir=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-compiled-local-')),assetRoot=resolve(dir,'assets');
 mkdirSync(resolve(assetRoot,'academy'),{recursive:true});mkdirSync(resolve(assetRoot,'auth/v110'),{recursive:true});
 writeFileSync(resolve(assetRoot,'academy/index.html'),'<html>LOCAL PUBLIC SHELL</html>');writeFileSync(resolve(assetRoot,'auth/v110/browser-config.js'),'// LOCAL CONFIG');
 const worker=await freezeUploadArtifact({root:process.cwd(),directory:dir,config:f.profiles.active.worker,source:f.source,assetRoot});
 const coordinator=await freezeUploadArtifact({root:process.cwd(),directory:dir,config:f.profiles.active.coordinator,source:f.source,assetRoot});
 assert.notEqual(worker.artifactSHA256,coordinator.artifactSHA256);
 const rendered=worker.render(f.profiles.active.worker);assert.equal(rendered.no_bundle,true);assert.equal(rendered.assets.directory,assetRoot);
 assert.equal(hash(readFileSync(rendered.main)),worker.provenance.codeSHA256);
 const changed=structuredClone(f.profiles.active.worker);changed.vars.JWT_V110_REQUEST_ORIGIN='https://evil.example';assert.throws(()=>worker.render(changed));
 writeFileSync(resolve(assetRoot,'academy/index.html'),'<html>CHANGED</html>');assert.throws(()=>worker.assertFrozen());
 const cp=coordinator.render(f.profiles.active.coordinator).main;chmodSync(cp,0o600);writeFileSync(cp,'// CHANGED');assert.throws(()=>coordinator.assertFrozen());
});

test('a hash-valid policy for a different compiled artifact cannot authorise this upload',async()=>{
 const h=guarded({paused:true});h.artifacts.feature_worker.artifactSHA256='f'.repeat(64);
 await assert.rejects(resumeInterruptedFeature({ops:h.ops}));assert.equal(h.writes,0);
});
test('the checked-in preparation marker blocks the actual deploy entry before approval/network/build',async()=>{
 const {deployJWTFeature}=await import('../tools/jwt-feature-deploy.mjs');
 const old=process.env.GITHUB_REF;process.env.GITHUB_REF='refs/heads/feature-preview';
 try{await assert.rejects(deployJWTFeature(),/NO_EXECUTABLE_MARKER/);}finally{process.env.GITHUB_REF=old;}
});

test('recovery upload is denied before writing when its full verification cannot fit the proposed remaining budget',async()=>{
 const h=guarded({metadataBudget:20});await assert.rejects(releaseFreshFeature({ops:h.ops}));
 const r=h.report();assert.equal(h.writes,1);assert.equal(r.recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
 assert.equal(r.explicitCloudflareGets,16);assert.equal(r.pauseHTTPAttempts,0);
});

for(const paused of [false,true])test('actual transport rejects the opposite controller mode before metadata or upload: '+paused,async()=>{
 const h=guarded({paused});await assert.rejects((paused?releaseFreshFeature:resumeInterruptedFeature)({ops:h.ops}));
 assert.equal(h.writes,0);assert.equal(h.gets,0);assert.equal(h.report().activated,false);
});
