import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {diagnosticPlan,comparePostPatchSettings,deploymentObservation,inspectMainPostPatch,assertSafeDiagnosticReceipt} from '../tools/jwt-feature-main-postpatch-inspect.mjs';
import {executionEffectsHash,assertEffectsBytes,scopeLines,sourcePaths,diagnosticApproval,promoteDiagnostic,executeApprovedDiagnostic,sanitiseExecutionReceipt} from '../tools/jwt-feature-main-postpatch-approved.mjs';
import {expectedPausedMetadataProfiles} from '../tools/jwt-feature-finalise.mjs';
import {assertRemoteProfile} from '../tools/jwt-feature-install-metadata.mjs';
const repo='MaktabForlife/Academy',workflow='feature-jwt-main-postpatch-inspect.yml',base='6b21ad29a7818be0846d2cd5d404350925e361f1';
const source='a'.repeat(40),merge='b'.repeat(40),head='c'.repeat(40),tree='d'.repeat(40);
const context=()=>({repository:repo,ref:'refs/heads/feature-preview',event:'workflow_dispatch',sha:source,runId:'123456',runAttempt:'1',workflowRef:repo+'/.github/workflows/'+workflow+'@refs/heads/feature-preview'});
function fixture(change={}){
 const calls=[],p={schema:1,request:diagnosticPlan.request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:'110.36',feature_sha:source,feature_base_sha:base};
 if(change.plan)change.plan(p);
 let body=['Optimisation approval','head: '+head,'target: '+p.target,'db-changes: none',...scopeLines(p.feature_sha)].join('\n');
 if(change.comment)body=change.comment(body);
 const comment={id:321,user:{login:'MaktabForlife'},body,created_at:'2026-11-07T00:00:00Z',updated_at:'2026-11-07T00:00:00Z'};
 const status={id:654,context:'optimisation/approval',state:change.denied?'failure':'success',creator:{login:'MaktabForlife'},created_at:'2026-11-07T00:01:00Z',target_url:'https://github.com/'+repo+'/pull/73#issuecomment-321',description:'optimisation-record-sha256:'+createHash('sha256').update(body).digest('hex')};
 const pr={number:73,state:'closed',merged:true,merged_at:'2026-11-07T00:02:00Z',merge_commit_sha:merge,merged_by:{login:'MaktabForlife'},changed_files:1,base:{ref:'studio_dev',repo:{full_name:repo}},head:{sha:head},html_url:'https://github.com/'+repo+'/pull/73'};
 const own={id:123456,path:'.github/workflows/'+workflow,event:'workflow_dispatch',head_branch:'feature-preview',head_sha:source,run_attempt:1,actor:{login:'MaktabForlife'},repository:{full_name:repo},head_repository:{full_name:repo},status:'in_progress'};
 if(change.run)change.run(own);
 let feature=change.promote?base:source,guardCalls=0,tokenReads=0;
 const api=async(path,options={})=>{
  calls.push({path,method:options.method||'GET'});
  if(path.endsWith('/commits/'+merge+'/pulls?per_page=100'))return [pr];
  if(path.endsWith('/pulls/73'))return pr;
  if(path.includes('/pulls/73/files?'))return [{filename:'deployment/release-plan.json',status:'modified'}];
  if(path.includes('/commits/'+head+'/statuses?'))return [status];
  if(path.endsWith('/git/ref/heads/studio_dev'))return {object:{sha:change.canonical||merge}};
  if(path.endsWith('/git/commits/'+merge))return {sha:merge,tree:{sha:tree}};
  if(path.endsWith('/git/commits/'+head))return {sha:head,tree:{sha:tree}};
  if(path.includes('/contents/deployment/release-plan.json?'))return {size:500,encoding:'base64',content:Buffer.from(JSON.stringify(p)).toString('base64')};
  if(path.endsWith('/issues/comments/321'))return comment;
  if(path.endsWith('/git/ref/heads/feature-preview'))return {object:{sha:change.feature||feature}};
  if(path.endsWith('/git/refs/heads/feature-preview')){
   assert.equal(options.method,'PATCH');assert.deepEqual(options.body,{sha:source,force:false});feature=source;return {};
  }
  if(path.includes('/compare/')){
   const files=sourcePaths.map(filename=>({filename,status:filename.endsWith('install-metadata.mjs')?'modified':'added'}));
   if(change.comparison)change.comparison(files);
   return {status:'ahead',behind_by:0,files};
  }
  if(path.endsWith('/actions/runs/123456'))return own;
  if(path.includes('/actions/workflows/'+workflow+'/runs?')){
   const rows=[own];if(change.prior)rows.push({id:98765,head_sha:'f'.repeat(40),status:'completed',conclusion:'failure'});
   return {total_count:change.incomplete?rows.length+1:rows.length,workflow_runs:rows};
  }
  if(path.includes('/actions/runs?branch=feature-preview&status=')){
   const active=path.includes('status=in_progress&')&&!change.promote?[own]:[];
   if(change.competitor&&path.includes('status=waiting&'))active.push({id:999,path:'.github/workflows/other.yml'});
   return {total_count:active.length,workflow_runs:active};
  }
  throw Error('Unexpected mock GitHub path');
 };
 const localGuard=async()=>{guardCalls++;if(change.guardFailure||(change.withdrawOnGuard&&guardCalls===change.withdrawOnGuard))throw Error('LOCAL_GUARD_WITHDRAWN');};
 const getToken=()=>{tokenReads++;return 'UNINSTALLED_CANARY_UNINSTALLED_TOKEN';};
 const proof={mergeSha:merge,headSha:head,pr:73,approvalStatusId:654,commentHash:createHash('sha256').update(body).digest('hex')};
 return {api,calls,p,context:context(),localGuard,getToken,proof,comment,get tokenReads(){return tokenReads;},get guardCalls(){return guardCalls;}};
}
async function negative(change,ctxChange){
 const f=fixture(change);if(ctxChange)ctxChange(f.context);let host=0;
 await assert.rejects(executeApprovedDiagnostic({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:async()=>{host++;assert.fail('Hosted request before approval');},save:()=>{}}));
 assert.equal(f.tokenReads,0);assert.equal(host,0);
}
for(const [name,change]of [
 ['failed optimisation status',{denied:true}],
 ['wrong protected target',{plan:p=>p.target='production'}],
 ['DB effects declared',{plan:p=>p.database_changes=true}],
 ['different approved source',{plan:p=>p.feature_sha='e'.repeat(40)}],
 ['effects hash mismatch',{comment:s=>s.replace(executionEffectsHash,'0'.repeat(64))}],
 ['missing lease',{comment:s=>s.split('\n').filter(l=>!l.startsWith('feature-exclusive-lease:')).join('\n')}],
 ['duplicate lease',{comment:s=>s+'\nfeature-exclusive-lease: '+diagnosticPlan.request}],
 ['larger GET budget',{comment:s=>s.replace('explicit-gets: 2','explicit-gets: 3')}],
 ['new canonical work',{canonical:'e'.repeat(40)}],
 ['Feature head changed',{feature:'e'.repeat(40)}],
 ['prior failed dispatch on DIFFERENT source',{prior:true}],
 ['incomplete dispatch list',{incomplete:true}],
 ['competing waiting Feature workflow',{competitor:true}],
 ['wrong runner actor',{run:r=>r.actor.login='other'}],
 ['wrong workflow path',{run:r=>r.path='.github/workflows/other.yml'}],
 ['extra application delta',{comparison:files=>files.push({filename:'backend/src/unreviewed.js',status:'added'})}],
 ['renamed source',{comparison:files=>{files[0].status='renamed';files[0].previous_filename='old';}}],
 ['dirty local source',{guardFailure:true}]
])test('zero credential/Cloudflare access for '+name,()=>negative(change));
for(const [name,change]of [
 ['rerun',c=>c.runAttempt='2'],['wrong branch',c=>c.ref='refs/heads/studio_dev'],['push event',c=>c.event='push'],['wrong repo',c=>c.repository='other/repo'],['untrusted workflow ref',c=>c.workflowRef='untrusted']
])test('zero credential/Cloudflare access for '+name,()=>negative({},change));
test('effects bytes are pinned; a mutation cannot be bound by recomputing a new arbitrary hash',()=>{
 const bytes=readFileSync(new URL('../../deployment/jwt-feature-main-postpatch-diagnostic.json',import.meta.url));assertEffectsBytes(bytes);assert.throws(()=>assertEffectsBytes(Buffer.concat([bytes,Buffer.from(' ')])),/REVIEWED_EFFECTS_CHANGED/);
 assert.match(executionEffectsHash,/^[a-f0-9]{64}$/);
});
test('approved source promotion is one FF GitHub ref patch and NEVER dispatches cleanup',async()=>{
 const f=fixture({promote:true}),r=await promoteDiagnostic({api:f.api,mergeSha:merge});
 assert.equal(r.state,'SOURCE_PREPARED_ONLY');assert.equal(r.diagnosticDispatched,false);assert.equal(r.cloudflareCalls,0);
 assert.deepEqual(f.calls.filter(c=>c.method!=='GET'),[{path:'/repos/'+repo+'/git/refs/heads/feature-preview',method:'PATCH'}]);assert.equal(f.tokenReads,0);
});
test('promotion rejects competing lease holder or unreviewed source without a ref write',async()=>{
 for(const change of [{promote:true,competitor:true},{promote:true,comparison:files=>files.pop()}]){
  const f=fixture(change);await assert.rejects(promoteDiagnostic({api:f.api,mergeSha:merge}));assert(!f.calls.some(c=>c.method!=='GET'));assert.equal(f.tokenReads,0);
 }
});
function settings(){
 const {worker:c}=expectedPausedMetadataProfiles(),bs=[];
 for(const b of c.d1_databases)bs.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets)bs.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars))bs.push({name,type:'plain_text',text});
 for(const name of c.secrets.required)bs.push({name,type:'secret_text',text:'UNINSTALLED_CANARY_SECRET_VALUE_MUST_NOT_LEAK'});
 for(const b of c.ratelimits)bs.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects.bindings){
  const ns=b.class_name==='ProgramTimetableCoordinator'?'7d99a5300b8d4f948c4fb85ce23b344e':b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':b.class_name==='JWTFeatureProgramTimetableCoordinator'?'ab05473998dc4e93b792464f9e78e0e9':'de95f15f19a54a9e9ba34e6e75f51847';
  bs.push({name:b.name,type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});
 }
 bs.push({name:'ASSETS',type:'assets'});
 return {bindings:bs,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,observability:{enabled:true},tail_consumers:[]};
}
const deploy=()=>({deployments:[{versions:[{version_id:'00000000-0000-4000-8000-000000000777',percentage:100}]}]});
function mock(options={}){
 const calls=[],saved=[];let guards=0;
 const fetcher=async(url,o)=>{
  const u=new URL(url);calls.push({url,method:o.method});
  assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  assert.equal(u.origin,'https://api.cloudflare.com');assert.equal(u.pathname,'/client/v4/accounts/'+diagnosticPlan.accountId+'/workers/scripts/feature_worker/'+(calls.length===1?'deployments':'settings'));
  assert.equal(o.headers.Authorization,'Bearer UNINSTALLED_CANARY_UNINSTALLED_TOKEN');
  if(options.fetch)return options.fetch(calls.length);
  const raw=calls.length===1?deploy():settings();if(calls.length===2&&options.change)options.change(raw);
  return Response.json({success:true,result:raw});
 };
 const fresh=async()=>{guards++;if(options.withdrawAt===guards)throw Error('UNINSTALLED_CANARY_GUARD_DETAIL');};
 return {calls,saved,fetcher,fresh,save:e=>saved.push(e)};
}
test('current binding-only comparison agrees with strict verifier; no optional routing or cleanup proof',()=>{
 const s=settings(),{worker,baseline}=expectedPausedMetadataProfiles();
 assertRemoteProfile(s,worker,baseline,{split:'de95f15f19a54a9e9ba34e6e75f51847',timetable:'ab05473998dc4e93b792464f9e78e0e9'});
 const d=comparePostPatchSettings(s);assert.equal(d.expectedMetadataMatches,true);assert.equal(d.mismatchCount,0);assert.equal(d.assetConfigurationReturned,false);assert.equal(d.assetRoutingVerified,false);
 assert(!JSON.stringify(d).includes('UNINSTALLED_CANARY_'));assert(!JSON.stringify(d).includes('jwt-feature-v110/'));
});
test('two fixed MAIN reads preserve54→56/reserve4 and never adopt unknown version or complete cleanup',async()=>{
 const m=mock(),r=await inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save});
 assert.equal(m.calls.length,2);assert.equal(r.explicitGetAttempts,2);assert.equal(r.cumulativeExplicitGetAttempts,56);assert.equal(r.originalHardGetLimit,60);assert.equal(r.reservedOriginalGets,4);
 assert.equal(r.hostedWrites+r.workerHTTP+r.sqlRequests+r.codeContentReads+r.secretValueReads,0);
 assert.equal(r.cleanupVerified,false);assert.equal(r.activated,false);assert.equal(r.ownedVersionAdopted,false);
 assert.equal(r.observations[0].deployment.relationToPrePatchReference,'DIFFERENT_FROM_PREPATCH_REFERENCE');
 assert.equal(r.observations[1].settings.expectedMetadataMatches,true);assert.equal(r.historicalFailureCause,'UNKNOWN_NO_RAW_POST_SETTINGS_SAVED');
 assert(!JSON.stringify(m.saved).includes('UNINSTALLED_CANARY_'));assertSafeDiagnosticReceipt(r);
});
for(const [name,mutate,field]of [
 ['temporary secret still present',s=>s.bindings.push({name:'JWT_FEATURE_SETUP_AUTH',type:'secret_text',text:'UNINSTALLED_CANARY_TEMP_KEY'}),'JWT_FEATURE_SETUP_AUTH.presence'],
 ['source marker differs',s=>s.bindings.find(b=>b.name==='JWT_FEATURE_INSTALL_SOURCE').text='UNINSTALLED_CANARY_MARKER','JWT_FEATURE_INSTALL_SOURCE.text'],
 ['owner marker differs',s=>s.bindings.find(b=>b.name==='JWT_FEATURE_INSTALL_OWNER').text='UNINSTALLED_CANARY_OWNER','JWT_FEATURE_INSTALL_OWNER.text'],
 ['native secret has wrong type',s=>{const b=s.bindings.find(b=>b.name==='PIN_SECRET');b.type='plain_text';b.text='UNINSTALLED_CANARY_PIN_2468';},'PIN_SECRET.type'],
 ['public signer differs',s=>s.bindings.find(b=>b.name==='JWT_V110_PUBLIC_KEYS_JSON').text='UNINSTALLED_CANARY_KEY_DATA','JWT_V110_PUBLIC_KEYS_JSON.text'],
 ['DB ID differs',s=>s.bindings.find(b=>b.name==='JWT_V110_CORE_DB').database_id='UNINSTALLED_CANARY_DB_IDENTIFIER','JWT_V110_CORE_DB.id'],
 ['D1 aliases conflict',s=>s.bindings.find(b=>b.name==='JWT_V110_CORE_DB').id='UNINSTALLED_CANARY_ALIAS','JWT_V110_CORE_DB.id'],
 ['duplicate binding',s=>s.bindings.push({...s.bindings.find(b=>b.name==='ASSETS')}),'ASSETS.presence'],
 ['missing ASSETS',s=>s.bindings=s.bindings.filter(b=>b.name!=='ASSETS'),'ASSETS.presence'],
 ['optional asset route differs',s=>s.assets={jwt:'UNINSTALLED_CANARY_ASSET_JWT',config:{run_worker_first:false}},'assets.config.run_worker_first']
])test('captures bounded field/type label without raw values: '+name,async()=>{
 const m=mock({change:mutate}),r=await inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save});
 assert.equal(r.state,'READ_ONLY_MAIN_OBSERVATIONS_CAPTURED_NO_RECOVERY_AUTHORITY');assert.equal(r.observations[1].settings.expectedMetadataMatches,false);
 assert(r.observations[1].settings.labels.some(l=>l.field===field));assert(!JSON.stringify(r).includes('UNINSTALLED_CANARY_'));assert.equal(r.ownedVersionAdopted,false);
});
test('many unknown binding names/shapes retain capped safe labels and no attacker strings',async()=>{
 const m=mock({change:s=>s.bindings=Array.from({length:140},(_,i)=>({name:'UNINSTALLED_CANARY_NAME_'+i,type:'UNINSTALLED_CANARY_TYPE',text:'UNINSTALLED_CANARY_VALUE'}))});
 const r=await inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save}),s=r.observations[1].settings;
 assert.equal(s.labels.length,64);assert.equal(s.labelsTruncated,true);assert.equal(s.knownBindings.length,0);assert(!JSON.stringify(r).includes('UNINSTALLED_CANARY_'));
});
for(const [name,response,outcome]of [
 ['HTTP failure',()=>Response.json({success:false,errors:[{code:10000,message:'UNINSTALLED_CANARY_PROVIDER_MESSAGE'}]},{status:403}),'HTTP_FAILURE'],
 ['provider failure',()=>Response.json({success:false,errors:[{code:10021,message:'UNINSTALLED_CANARY_PROVIDER_MESSAGE'}]}),'PROVIDER_FAILURE'],
 ['invalid JSON',()=>new Response('UNINSTALLED_CANARY_BAD_JSON',{status:200}),'BODY_FAILURE'],
 ['missing result',()=>Response.json({success:true,private:'UNINSTALLED_CANARY_BODY'}),'RESULT_SHAPE_FAILURE']
])test('settings '+name+' preserves version/attempts and never dumps or retries',async()=>{
 const m=mock({fetch:n=>n===1?Response.json({success:true,result:deploy()}):response()});let got;
 await assert.rejects(inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save}),e=>{got=e.evidence;return true;});
 assert.equal(got.explicitGetAttempts,2);assert.equal(got.cumulativeExplicitGetAttempts,56);assert.equal(got.observations[0].outcome,'CAPTURED');assert.equal(got.observations[1].outcome,outcome);
 assert.equal(got.state,'READ_ONLY_MAIN_DIAGNOSTIC_STOPPED');assert.equal(m.calls.length,2);assert(!JSON.stringify(m.saved).includes('UNINSTALLED_CANARY_'));
});
test('first transport failure saves one attempted GET and stops without settings retry',async()=>{
 const m=mock({fetch:()=>{throw Error('UNINSTALLED_CANARY_NETWORK_DETAIL');}});let e;
 await assert.rejects(inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save}),x=>{e=x.evidence;return true;});
 assert.equal(m.calls.length,1);assert.equal(e.cumulativeExplicitGetAttempts,55);assert.equal(e.observations[0].outcome,'TRANSPORT_FAILURE');assert(!JSON.stringify(e).includes('UNINSTALLED_CANARY_'));
});
test('fresh withdrawal between fixed reads saves only first observation and no second attempt',async()=>{
 const m=mock({withdrawAt:2});let e;
 await assert.rejects(inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save}),x=>{e=x.evidence;return true;});
 assert.equal(m.calls.length,1);assert.equal(e.explicitGetAttempts,1);assert.equal(e.observations.length,1);assert.equal(e.hostedWrites,0);
});
test('malformed settings shape produces safe labels instead of losing the observation',async()=>{
 const m=mock({fetch:n=>Response.json({success:true,result:n===1?deploy():['UNINSTALLED_CANARY_UNEXPECTED_RESULT']})});
 const r=await inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save});
 assert.equal(r.observations[1].settings.labels[0].category,'SETTINGS_SHAPE');assert(!JSON.stringify(r).includes('UNINSTALLED_CANARY_'));
});
test('deployment observation retains no unrecognised version/comment strings and never adopts',()=>{
 const d=deploymentObservation({deployments:[{versions:[{version_id:'UNINSTALLED_CANARY_VERSION',percentage:100,comment:'UNINSTALLED_CANARY_COMMENT'}]}]});
 assert.equal(d.currentVersion,null);assert.equal(d.versions[0].versionId,null);assert.equal(d.ownedVersionAdopted,false);assert(!JSON.stringify(d).includes('UNINSTALLED_CANARY_'));
});
test('receipt validator rejects unknown payloads, unsafe label names and counterfeit cleanup proof',async()=>{
 const m=mock(),r=await inspectMainPostPatch({token:'UNINSTALLED_CANARY_UNINSTALLED_TOKEN',fresh:m.fresh,fetcher:m.fetcher,save:m.save});
 assert.throws(()=>assertSafeDiagnosticReceipt({...r,rawSettings:'UNINSTALLED_CANARY_VALUE'}));
 assert.throws(()=>assertSafeDiagnosticReceipt({...r,cleanupVerified:true}));
 const c=structuredClone(r);c.observations[1].settings.labels=[{field:'UNINSTALLED_CANARY_DYNAMIC_FIELD',category:'FIELD_MISMATCH',expectedType:'string',observedType:'string'}];c.observations[1].settings.mismatchCount=1;c.observations[1].settings.expectedMetadataMatches=false;
 assert.throws(()=>assertSafeDiagnosticReceipt(c));
});
test('fully protected LOCAL diagnostic waits for all approval gates and saves only safe2-read receipt',async()=>{
 const f=fixture(),m=mock(),saved=[];
 const r=await executeApprovedDiagnostic({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:m.fetcher,save:e=>saved.push(e)});
 assert.equal(f.tokenReads,1);assert.equal(m.calls.length,2);assert.equal(r.cumulativeExplicitGetAttempts,56);assert.equal(r.cleanupVerified,false);assert.equal(r.ownedVersionAdopted,false);
 assert.equal(r.execution.effectsSHA256,executionEffectsHash);assert(!JSON.stringify(saved).includes('UNINSTALLED_CANARY_'));
});
test('diagnostic workflow has one token step behind both public/private validation and no PIN/mutation job',()=>{
 const s=readFileSync(new URL('../../.github/workflows/feature-jwt-main-postpatch-inspect.yml',import.meta.url),'utf8');
 assert(s.includes('needs: validate')&&s.includes('environment: feature'));
 assert.equal((s.match(/secrets\.CF_FEATURE_DEPLOY_TOKEN/g)||[]).length,1);
 assert(s.includes('main-postpatch-metadata.json')&&!s.includes('*.json')&&!s.includes('FEATURE_TEST_ADMIN_PIN')&&!s.includes('wrangler')&&!s.includes('npm '));
 assert(Object.isFrozen(diagnosticPlan.budget));
});
