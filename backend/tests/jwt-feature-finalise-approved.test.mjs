import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {finalisationPlan,expectedPausedMetadataProfiles} from '../tools/jwt-feature-finalise.mjs';
import {executionEffectsHash,assertEffectsBytes,scopeLines,sourcePaths,finalisationApproval,promoteFinalisation,executeApprovedFinalisation,sanitiseExecutionReceipt} from '../tools/jwt-feature-finalise-approved.mjs';
const repo='MaktabForlife/Academy',workflow='feature-jwt-finalise.yml',base='a017f2f30324162e2946b8a32d494fdc10a5d27e';
const source='a'.repeat(40),merge='b'.repeat(40),head='c'.repeat(40),tree='d'.repeat(40);
const context=()=>({repository:repo,ref:'refs/heads/feature-preview',event:'workflow_dispatch',sha:source,runId:'123456',runAttempt:'1',workflowRef:repo+'/.github/workflows/'+workflow+'@refs/heads/feature-preview'});
function fixture(change={}){
 const calls=[],p={schema:1,request:finalisationPlan.request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:'110.36',feature_sha:source,feature_base_sha:base};
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
 const getToken=()=>{tokenReads++;return 'PRIVATE_UNINSTALLED_TOKEN';};
 const proof={mergeSha:merge,headSha:head,pr:73,approvalStatusId:654,commentHash:createHash('sha256').update(body).digest('hex')};
 return {api,calls,p,context:context(),localGuard,getToken,proof,comment,get tokenReads(){return tokenReads;},get guardCalls(){return guardCalls;}};
}
async function negative(change,ctxChange){
 const f=fixture(change);if(ctxChange)ctxChange(f.context);let host=0;
 await assert.rejects(executeApprovedFinalisation({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:async()=>{host++;assert.fail('Hosted request before approval');},save:()=>{}}));
 assert.equal(f.tokenReads,0);assert.equal(host,0);
}
for(const [name,change]of [
 ['failed optimisation status',{denied:true}],
 ['wrong protected target',{plan:p=>p.target='production'}],
 ['DB effects declared',{plan:p=>p.database_changes=true}],
 ['different approved source',{plan:p=>p.feature_sha='e'.repeat(40)}],
 ['effects hash mismatch',{comment:s=>s.replace(executionEffectsHash,'0'.repeat(64))}],
 ['missing lease',{comment:s=>s.split('\n').filter(l=>!l.startsWith('feature-exclusive-lease:')).join('\n')}],
 ['duplicate lease',{comment:s=>s+'\nfeature-exclusive-lease: '+finalisationPlan.request}],
 ['larger GET budget',{comment:s=>s.replace('explicit-gets: 18','explicit-gets: 19')}],
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
 const bytes=readFileSync(new URL('../../deployment/jwt-feature-finalisation-proposal.json',import.meta.url));assertEffectsBytes(bytes);assert.throws(()=>assertEffectsBytes(Buffer.concat([bytes,Buffer.from(' ')])),/REVIEWED_EFFECTS_CHANGED/);
 assert.match(executionEffectsHash,/^[a-f0-9]{64}$/);
});
test('approved source promotion is one FF GitHub ref patch and NEVER dispatches cleanup',async()=>{
 const f=fixture({promote:true}),r=await promoteFinalisation({api:f.api,mergeSha:merge});
 assert.equal(r.state,'SOURCE_PREPARED_ONLY');assert.equal(r.cleanupDispatched,false);assert.equal(r.cloudflareCalls,0);
 assert.deepEqual(f.calls.filter(c=>c.method!=='GET'),[{path:'/repos/'+repo+'/git/refs/heads/feature-preview',method:'PATCH'}]);assert.equal(f.tokenReads,0);
});
test('promotion rejects competing lease holder or unreviewed source without a ref write',async()=>{
 for(const change of [{promote:true,competitor:true},{promote:true,comparison:files=>files.pop()}]){
  const f=fixture(change);await assert.rejects(promoteFinalisation({api:f.api,mergeSha:merge}));assert(!f.calls.some(c=>c.method!=='GET'));assert.equal(f.tokenReads,0);
 }
});
function remote(c){
 const bs=[];for(const b of c.d1_databases||[])bs.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets||[])bs.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars||{}))bs.push({name,type:'plain_text',text});
 for(const name of c.secrets?.required||[])bs.push({name,type:'secret_text',text:'PRIVATE_SERVER_SECRET'});
 for(const b of c.ratelimits||[])bs.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects?.bindings||[]){
  const ns=b.class_name==='ProgramTimetableCoordinator'?'7d99a5300b8d4f948c4fb85ce23b344e':b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':b.class_name==='JWTFeatureProgramTimetableCoordinator'?finalisationPlan.freshNamespaces.timetable:finalisationPlan.freshNamespaces.split;
  bs.push({name:b.name,type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});
 }
 if(c.assets)bs.push({name:'ASSETS',type:'assets'});
 return {bindings:bs,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,observability:{enabled:c.observability.enabled},tail_consumers:[]};
}
function hostedMock({loseAck=false}={}){
 const profiles=expectedPausedMetadataProfiles(),configs=new Map([['feature_worker',profiles.worker],['academy-feature-split-coordinator',profiles.coordinator]]);
 configs.get('feature_worker').secrets.required.push(...finalisationPlan.effects.secretDeletionNames);
 const versions={...finalisationPlan.observedVersions},calls=[];
 const fetcher=async(url,o)=>{
  calls.push({url,method:o.method});const u=new URL(url);
  if(u.host==='api.cloudflare.com'){
   assert.equal(o.headers.Authorization,'Bearer PRIVATE_UNINSTALLED_TOKEN');const parts=u.pathname.split('/'),name=parts[7],kind=parts[8];let result;
   if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};
   else if(kind==='settings')result=remote(configs.get(name));
   else if(kind==='subdomain')result={enabled:name==='feature_worker',previews_enabled:false};
   else if(kind==='schedules')result=[];
   else{
    assert.equal(kind,'secrets-bulk');assert.equal(o.method,'PATCH');const b=JSON.parse(o.body);
    assert.deepEqual(b,{secrets:{JWT_FEATURE_SETUP_PIN:null,JWT_FEATURE_SETUP_AUTH:null}});
    configs.get(name).secrets.required=configs.get(name).secrets.required.filter(k=>!Object.hasOwn(b.secrets,k));versions[name]='00000000-0000-4000-8000-000000000555';
    if(loseAck)throw Error('PRIVATE_FAILURE_DETAIL');result={secret:'PRIVATE_PATCH_RESPONSE'};
   }
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,'https://feature_worker.maktab4life.workers.dev');assert.equal(o.credentials,'omit');assert.equal(o.redirect,'error');
  return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 };
 return {fetcher,calls};
}
test('fully approved LOCAL execution retains18GET/onePATCH/threeprobe scope and redacts all public output',async()=>{
 const f=fixture(),host=hostedMock(),saved=[];
 const r=await executeApprovedFinalisation({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:host.fetcher,save:e=>saved.push(e)});
 assert.equal(r.cleanupVerified,true);assert.equal(r.activated,false);assert.equal(r.explicitCloudflareGetAttempts,18);assert.equal(r.cumulativeExplicitGetAttempts,58);
 assert.equal(r.cumulativeInstallerAndCleanupHTTPAttempts,8);assert.equal(r.cumulativeSecretBulkPatchAttempts,2);
 assert.equal(host.calls.length,22);assert.equal(host.calls.filter(c=>c.method==='PATCH').length,1);assert.equal(f.tokenReads,1);assert(f.guardCalls>22);
 assert.equal(r.execution.effectsSHA256,executionEffectsHash);assert.equal(r.execution.approvalPR,73);assert.equal(r.execution.source,source);
 assert.equal(r.execution.sharedConcurrencyGroup,'feature-isolation-refs/heads/feature-preview');assert(!JSON.stringify(saved).includes('PRIVATE_'));
 const plain=structuredClone(saved.at(-1));delete plain.execution;
 assert.throws(()=>sanitiseExecutionReceipt({...plain,PIN:'PRIVATE_VALUE'},f.proof,source),/UNKNOWN_RECEIPT_FIELD/);
 assert.throws(()=>sanitiseExecutionReceipt({...plain,codeContentVerified:true},f.proof,source));
 assert.throws(()=>sanitiseExecutionReceipt({...plain,cumulativeExplicitGetAttempts:59},f.proof,source));
});
test('fresh source withdrawal after credential access still prevents FIRST Cloudflare request',async()=>{
 const f=fixture({withdrawOnGuard:4});let calls=0;
 await assert.rejects(executeApprovedFinalisation({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:async()=>{calls++;assert.fail('Host after withdrawal');},save:()=>{}}));
 assert.equal(f.tokenReads,1);assert.equal(calls,0);
});
test('unknown PATCH ACK is not retried and only sanitized incomplete receipt survives',async()=>{
 const f=fixture(),h=hostedMock({loseAck:true}),saved=[];
 await assert.rejects(executeApprovedFinalisation({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,fetcher:h.fetcher,save:e=>saved.push(e)}),/SANITISED_RECEIPT/);
 const r=saved.at(-1);assert.equal(r.cleanupVerified,false);assert.equal(r.mutationOutcomeUnknown,true);assert.equal(r.secretPatchAttempts,1);assert.equal(r.pausedProbeAttempts,0);assert.equal(h.calls.length,13);assert(!JSON.stringify(saved).includes('PRIVATE_'));
});
test('workflow keeps token solely in gated Feature execute step; shares existing mutex and has no PIN/npm/Wrangler',()=>{
 const s=readFileSync(new URL('../../.github/workflows/feature-jwt-finalise.yml',import.meta.url),'utf8');
 assert(s.includes('group: feature-isolation-'+'$'+'{{ github.ref }}'));assert(s.includes('cancel-in-progress: false'));
 assert(s.includes('needs: validate'));assert(s.includes('environment: feature'));assert.equal((s.match(/secrets\.CF_FEATURE_DEPLOY_TOKEN/g)||[]).length,1);
 assert(s.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/feature-preview'"));
 assert(!s.includes('FEATURE_TEST_ADMIN_PIN')&&!s.includes('wrangler')&&!s.includes('npm ')&&!s.includes('contents: write\n      actions: write'));
 assert(s.includes('owned-finalisation.json')&&!s.includes('*.json'));
});
