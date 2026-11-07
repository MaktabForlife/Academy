import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalisationPlan as plan,expectedPausedMetadataProfiles,createFinalisationOps,finaliseOwnedFeature} from '../tools/jwt-feature-finalise.mjs';
import {assertRemoteProfile,sanitiseSettings} from '../tools/jwt-feature-install-metadata.mjs';
import {renderCandidateConfigs,schemaHashes,names,account} from '../tools/jwt-feature-transition.mjs';
const origin='https://feature_worker.maktab4life.workers.dev',targets=['feature_worker','academy-feature-split-coordinator'],clone=x=>structuredClone(x);
function remote(c,{config=false}={}){
 const bindings=[];
 for(const b of c.d1_databases||[])bindings.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text] of Object.entries(c.vars||{}))bindings.push({name,type:'plain_text',text});
 for(const name of c.secrets?.required||[])bindings.push({name,type:'secret_text',text:'PRIVATE_RESPONSE_MUST_NEVER_BE_SAVED'});
 for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects?.bindings||[]){
  const ns=b.class_name==='ProgramTimetableCoordinator'?'7d99a5300b8d4f948c4fb85ce23b344e':b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':b.class_name==='JWTFeatureProgramTimetableCoordinator'?plan.freshNamespaces.timetable:plan.freshNamespaces.split;
  bindings.push({name:b.name,type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});
 }
 if(c.assets)bindings.push({name:c.assets.binding,type:'assets'});
 return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,observability:{enabled:c.observability.enabled},tail_consumers:[],...(config?{assets:{jwt:'PRIVATE_ASSET_TOKEN',config:{run_worker_first:c.assets.run_worker_first,not_found_handling:'none',base_path:'/',html_handling:'auto-trailing-slash'}}}:{})};
}
function harness(options={}){
 const profiles=expectedPausedMetadataProfiles(),configs=new Map([[targets[0],clone(profiles.worker)],[targets[1],clone(profiles.coordinator)]]),versions={...plan.observedVersions};
 configs.get(targets[0]).secrets.required.push(...plan.effects.secretDeletionNames);
 const calls=[],saved=[];let freshCalls=0;
 const fetcher=async(url,o={})=>{
  const u=new URL(url),entry={url,method:o.method||'GET'};calls.push(entry);
  assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  if(u.host==='api.cloudflare.com'){
   assert.equal(o.headers.Authorization,'Bearer PRIVATE_MOCK_TOKEN');
   const parts=u.pathname.split('/'),name=parts[7],kind=parts[8];assert(configs.has(name));let result;
   if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};
   else if(kind==='settings'){result=remote(configs.get(name));if(options.settings)options.settings(result,{name,calls,versions});}
   else if(kind==='subdomain')result={enabled:name===targets[0],previews_enabled:false};
   else if(kind==='schedules')result=[];
   else{
    assert.equal(kind,'secrets-bulk');assert.equal(entry.method,'PATCH');
    const b=JSON.parse(o.body);assert.deepEqual(b,{secrets:{JWT_FEATURE_SETUP_PIN:null,JWT_FEATURE_SETUP_AUTH:null}});
    entry.deletions=Object.keys(b.secrets);configs.get(name).secrets.required=configs.get(name).secrets.required.filter(k=>!Object.hasOwn(b.secrets,k));
    versions[name]='00000000-0000-4000-8000-000000000111';
    if(options.losePatchAck)throw Error('PRIVATE_PROVIDER_TRANSPORT_MESSAGE');
    if(options.afterPatch)options.afterPatch({versions,configs});result={privateText:'PRIVATE_PATCH_RESULT'};
   }
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,origin);assert.equal(o.credentials,'omit');assert.equal(o.headers,undefined);
  if(options.probe)return options.probe(u);
  return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 };
 const fresh=async()=>{freshCalls++;if(options.fresh)await options.fresh({freshCalls,calls,versions,configs});};
 return {profiles,configs,versions,calls,saved,get freshCalls(){return freshCalls;},ops:createFinalisationOps({token:'PRIVATE_MOCK_TOKEN',fresh,fetcher,save:e=>saved.push(e)})};
}
test('expected metadata equals reviewed renderer; template is not an installation receipt',()=>{
 const {worker,coordinator,baseline}=expectedPausedMetadataProfiles(),read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
 // LOCAL hypothetical compiler input only; not a hosted schema/seed attestation.
 const r={schema:2,state:'VERIFIED',planId:'JWT_FEATURE_FRESH_20261106a',accountId:account,databaseNames:names,databaseIds:plan.databaseIds,schemaHashes:{core:schemaHashes.core,admin:schemaHashes.admin,auth:schemaHashes.auth},sourceDigest:plan.nativeRun,objectNamespace:'jwt-feature-v110/20261106a/',synthetic:{accounts:4,courses:2,productionData:false},checks:{coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',initialSessions:0,initialFamilies:0},timetableNamespaceId:plan.freshNamespaces.timetable,splitNamespaceId:plan.freshNamespaces.split,publicKid:plan.publicSigningKey.kid,publicKeys:[plan.publicSigningKey],reviewedSetupCommit:plan.originalSource,verifiedAt:'2026-11-07T00:00:00.000Z'};
 const rendered=renderCandidateConfigs(read('../wrangler.feature.jsonc'),read('../wrangler.feature-coordinator.jsonc'),baseline,r,{releaseId:plan.originalSource,mode:'PAUSED'});
 for(const [key,c] of [['worker',worker],['coordinator',coordinator]]){
  rendered[key].vars={...rendered[key].vars,JWT_FEATURE_INSTALL_SOURCE:plan.originalSource,JWT_FEATURE_INSTALL_OWNER:plan.originalOwner};
  const projection=Object.fromEntries(Object.keys(c).map(k=>[k,clone(rendered[key][k])]));
  if(projection.assets)delete projection.assets.directory;assert.deepEqual(c,projection);
  assert(!Object.hasOwn(c,'main')&&!Object.hasOwn(c,'account_id')&&!Object.hasOwn(c,'migrations'));
 }
 assert.equal(plan.state,'SOURCE_ONLY_NOT_EXECUTION_AUTHORITY');
});
test('documented binding-only settings and database_id/legacy id pass without routing claim; conflicting IDs fail',()=>{
 const {worker,baseline}=expectedPausedMetadataProfiles(),s=remote(worker),checked=assertRemoteProfile(s,worker,baseline,{...plan.freshNamespaces});
 assert.equal(s.assets,undefined);assert.equal(checked.assets,null);assert(!Object.hasOwn(checked,'routingVerified'));
 const legacy=clone(s);for(const b of legacy.bindings)if(b.type==='d1'){b.id=b.database_id;delete b.database_id;}
 assert.deepEqual(sanitiseSettings(s),sanitiseSettings(legacy));assert.deepEqual(sanitiseSettings(sanitiseSettings(s)),sanitiseSettings(s));
 const conflict=clone(s);conflict.bindings.find(b=>b.type==='d1').id='not-the-same';assert.throws(()=>sanitiseSettings(conflict),/D1_ID_CONFLICT/);
});
for(const [name,change] of [
 ['missing ASSETS',s=>s.bindings=s.bindings.filter(b=>b.type!=='assets')],
 ['duplicate ASSETS',s=>s.bindings.push({name:'ASSETS',type:'assets'})],
 ['wrong ASSETS type',s=>s.bindings.find(b=>b.type==='assets').type='plain_text'],
 ['wrong DB',s=>s.bindings.find(b=>b.name==='JWT_V110_CORE_DB').database_id='1c8aece3-dc1d-40d1-8a82-01ab4f63336f'],
 ['wrong public signer',s=>s.bindings.find(b=>b.name==='JWT_V110_PUBLIC_KEYS_JSON').text='[]'],
 ['wrong owner',s=>s.bindings.find(b=>b.name==='JWT_FEATURE_INSTALL_OWNER').text='999-1'],
 ['enabled JWT',s=>s.bindings.find(b=>b.name==='JWT_V110_MASTER').text='1'],
 ['tail consumer',s=>s.tail_consumers=[{}]],
 ['wrong namespace',s=>s.bindings.find(b=>b.name==='JWT_V110_SPLIT_COORDINATOR').namespace_id='a'.repeat(32)]
])test('binding-only settings still reject '+name,()=>{const {worker,baseline}=expectedPausedMetadataProfiles(),s=remote(worker);change(s);assert.throws(()=>assertRemoteProfile(s,worker,baseline,{...plan.freshNamespaces}));});
for(const [name,change] of [
 ['worker-first',c=>c.run_worker_first=false],['SPA',c=>c.not_found_handling='single-page-application'],
 ['base path',c=>c.base_path='/unexpected/'],['HTML routing',c=>c.html_handling='force-trailing-slash']
])test('optional returned assets config remains strict: '+name,()=>{const {worker,baseline}=expectedPausedMetadataProfiles(),s=remote(worker,{config:true});change(s.assets.config);assert.throws(()=>assertRemoteProfile(s,worker,baseline,{...plan.freshNamespaces}));});
test('coordinator/setup still rejects unexpected assets config or binding',()=>{
 const {coordinator,baseline}=expectedPausedMetadataProfiles();
 for(const change of [s=>s.assets={config:{run_worker_first:false}},s=>s.bindings.push({name:'ASSETS',type:'assets'})]){
  const s=remote(coordinator);change(s);assert.throws(()=>assertRemoteProfile(s,coordinator,baseline,{...plan.freshNamespaces}));
 }
});
test('LOCAL success is exactly18 metadata GETs/one null-only patch/three PAUSED probes; no code, DB, seed or activation',async()=>{
 const f=harness(),r=await finaliseOwnedFeature({ops:f.ops});
 assert.equal(r.state,'OWNED_PAUSED_CLEANUP_OBSERVED');assert.equal(r.cleanupVerified,true);assert.equal(r.activated,false);
 assert.equal(r.explicitCloudflareGetAttempts,18);assert.equal(r.cumulativeExplicitGetAttempts,58);assert.equal(r.secretPatchAttempts,1);assert.equal(r.secretPatchAcknowledged,true);assert.equal(r.pausedProbeAttempts,3);
 assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);assert.equal(f.calls.length,22);
 assert.deepEqual(f.calls.filter(c=>new URL(c.url).host!=='api.cloudflare.com').map(c=>new URL(c.url).pathname),plan.budget.workerProbePaths);
 assert.equal(r.codeContentVerified,false);assert.equal(r.assetRoutingReadbackVerified,false);assert.equal(r.notActivationReceipt,true);
 assert.equal(r.workerCodeUploads+r.coordinatorUploads+r.configPatches+r.schemaSeedRequests+r.r2Operations+r.credentialGeneration+r.automaticRecoveryWrites,0);
 assert(!JSON.stringify(f.saved).includes('PRIVATE_'));assert.deepEqual(f.configs.get(targets[0]).secrets.required,f.profiles.worker.secrets.required);assert.deepEqual(f.configs.get(targets[1]),f.profiles.coordinator);
 assert.equal(r.observedAfterPatch[targets[1]],plan.observedVersions[targets[1]]);
});
test('unknown patch ACK stops once with no probe/retry/overwrite',async()=>{
 const f=harness({losePatchAck:true});await assert.rejects(finaliseOwnedFeature({ops:f.ops}),/OWNED_FINALISATION_STOPPED/);
 const r=f.saved.at(-1);assert.equal(r.secretPatchAttempts,1);assert.equal(r.secretPatchAcknowledged,false);assert.equal(r.cleanupVerified,false);assert.equal(r.pausedProbeAttempts,0);assert.equal(r.explicitCloudflareGetAttempts,12);
 assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);assert(!JSON.stringify(r).includes('PRIVATE_'));
});
test('foreign version at last pre-write check prevents deletion',async()=>{
 const f=harness({fresh:({calls,versions})=>{if(calls.length===8)versions[targets[0]]='00000000-0000-4000-8000-000000000222';}});
 await assert.rejects(finaliseOwnedFeature({ops:f.ops}));assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);assert.equal(f.saved.at(-1).pausedProbeAttempts,0);
});
test('approval withdrawal before mutation makes no write or fallback',async()=>{
 const f=harness({fresh:({calls})=>{if(calls.length===12)throw Error('WITHDRAWN');}});
 await assert.rejects(finaliseOwnedFeature({ops:f.ops}));assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);assert.equal(f.saved.at(-1).automaticRecoveryWrites,0);
});
test('post-patch foreign owner fails profile with no probe/takeover',async()=>{
 const f=harness({afterPatch:({configs})=>configs.get(targets[0]).vars.JWT_FEATURE_INSTALL_OWNER='999-1'});
 await assert.rejects(finaliseOwnedFeature({ops:f.ops}));assert.equal(f.saved.at(-1).secretPatchAcknowledged,true);assert.equal(f.saved.at(-1).pausedProbeAttempts,0);assert.equal(f.saved.at(-1).cleanupVerified,false);
});
test('concurrent coordinator version after patch is not adopted',async()=>{
 const f=harness({afterPatch:({versions})=>versions[targets[1]]='00000000-0000-4000-8000-000000000333'});
 await assert.rejects(finaliseOwnedFeature({ops:f.ops}));assert.equal(f.saved.at(-1).pausedProbeAttempts,0);assert.equal(f.saved.at(-1).cleanupVerified,false);
});
for(const [name,probe] of [
 ['200',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'})],
 ['cookie',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Set-Cookie':'unit=uninstalled','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})],
 ['cacheable',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'X-Content-Type-Options':'nosniff'}})],
 ['unsafe body',()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE',private:'PRIVATE_BODY'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})],
 ['oversized body',()=>new Response('x'.repeat(1025),{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})]
])test('PAUSED probe rejects '+name+' without retry or new write',async()=>{
 const f=harness({probe});await assert.rejects(finaliseOwnedFeature({ops:f.ops}));const r=f.saved.at(-1);
 assert.equal(r.secretPatchAttempts,1);assert.equal(r.pausedProbeAttempts,1);assert.equal(r.cleanupVerified,false);assert(!JSON.stringify(r).includes('PRIVATE_'));
});
test('late version change after three PAUSED checks prevents closure',async()=>{
 const f=harness({fresh:({calls,versions})=>{if(calls.length===20)versions[targets[0]]='00000000-0000-4000-8000-000000000444';}});
 await assert.rejects(finaliseOwnedFeature({ops:f.ops}));assert.equal(f.saved.at(-1).pausedProbeAttempts,3);assert.equal(f.saved.at(-1).cleanupVerified,false);
});
test('source-only candidate has no live env/CLI/initializer entry',()=>{
 const source=readFileSync(new URL('../tools/jwt-feature-finalise.mjs',import.meta.url),'utf8');
 assert(!source.includes('process.env')&&!source.includes('execFile')&&!source.includes('createPrivateCapsule')&&!source.includes('installFreshFeature'));
 assert.deepEqual(plan.effects.secretDeletionNames,['JWT_FEATURE_SETUP_PIN','JWT_FEATURE_SETUP_AUTH']);assert.equal(plan.limits.liveEntryAndPrivateEnvironmentWorkflow,'NOT_PROVIDED_IN_SOURCE_ONLY_CANDIDATE');
 assert(Object.isFrozen(plan.observedVersions));assert.throws(()=>{plan.observedVersions.feature_worker='rebound';});
 assert.throws(()=>createFinalisationOps({token:'unit'}),/CALLBACK_REQUIRED/);
});
