import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executionPlan,executionPlanSHA256,assertPlanBytes,scopeLines,sourcePaths,promoteFinalFence,executeApprovedFinalFence,assertEnvelope,boundDirectory,publishReceipt} from '../tools/jwt-feature-readonly-final-fence-approved.mjs';
import {finalFencePlan} from '../tools/jwt-feature-readonly-final-fence.mjs';
import {expectedPausedMetadataProfiles} from '../tools/jwt-feature-finalise.mjs';
const repo='MaktabForlife/Academy',workflow='feature-jwt-readonly-final-fence.yml',base='e682301619ec20d65f5530948bb664529c1440dc';
const source='a'.repeat(40),merge='b'.repeat(40),head='c'.repeat(40),tree='d'.repeat(40),canary='UNINSTALLED_CANARY_NEVER_EXPORT';
globalThis.fetch=()=>{throw Error('UNEXPECTED_LIVE_TRANSPORT');};
const context=()=>({repository:repo,ref:'refs/heads/feature-preview',event:'workflow_dispatch',sha:source,runId:'123456',runAttempt:'1',workflowRef:repo+'/.github/workflows/'+workflow+'@refs/heads/feature-preview'});
const temp=()=>mkdtempSync(join(tmpdir(),'jwt-final-fence-wiring-'));
function fixture(change={}){
 const calls=[],p={schema:1,request:executionPlan.request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:'110.37',feature_sha:source,feature_base_sha:base};
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
  if(path.includes('/contents/')&&!path.includes('release-plan')){
   const file=Object.keys(executionPlan.frozenBlobs).find(x=>path.includes('/contents/'+x+'?'));
   assert(file);return {sha:change.frozenBlob?'f'.repeat(40):executionPlan.frozenBlobs[file]};
  }
  if(path.includes('/actions/workflows/feature-jwt-main-postpatch-inspect.yml/runs?')){
   const rows=[{id:42358703100,run_attempt:1,head_sha:base,status:'completed',conclusion:'success',actor:{login:'MaktabForlife'}}];
   if(change.oldReplay)rows.push({id:999});return {total_count:rows.length,workflow_runs:rows};
  }
  if(path.includes('/compare/')){
   const files=sourcePaths.map(filename=>({filename,status:filename.endsWith('install-metadata.mjs')?'modified':'added'}));
   if(change.comparison)change.comparison(files);
   return {status:'ahead',behind_by:0,files};
  }
  if(path.endsWith('/actions/runs/123456'))return own;
  if(path.includes('/actions/workflows/'+workflow+'/runs?')){
   assert(!path.includes('branch=')&&!path.includes('head_sha='));const rows=change.promote?[]:[own];if(change.prior)rows.push({id:98765,head_branch:'other-source',head_sha:'f'.repeat(40),status:'completed',conclusion:'cancelled'});
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
 const f=fixture(change);if(ctxChange)ctxChange(f.context);let calls=0;const root=temp();
 try{
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:async()=>{calls++;throw Error(canary);}}));
  assert.equal(f.tokenReads,0);assert.equal(calls,0);
 }finally{rmSync(root,{recursive:true,force:true});}
}
for(const [name,change]of [
 ['failed approval',{denied:true}],
 ['production target',{plan:p=>p.target='production'}],
 ['DB effects',{plan:p=>p.database_changes=true}],
 ['different source',{plan:p=>p.feature_sha='e'.repeat(40)}],
 ['missing new lease',{comment:s=>s.split('\n').filter(l=>!l.startsWith('feature-exclusive-lease:')).join('\n')}],
 ['old PR14 lease',{comment:s=>s.replace(executionPlan.lease,'jwt-feature-main-postpatch-inspection-20261107a')}],
 ['duplicate lease',{comment:s=>s+'\nfeature-exclusive-lease: '+executionPlan.lease}],
 ['larger provider budget',{comment:s=>s.replace('provider-gets: 4','provider-gets: 5')}],
 ['larger probe budget',{comment:s=>s.replace('paused-http-attempts: 3','paused-http-attempts: 4')}],
 ['new canonical merge',{canonical:'e'.repeat(40)}],
 ['changed Feature ref',{feature:'e'.repeat(40)}],
 ['prior dispatch on another source/branch',{prior:true}],
 ['incomplete all-head dispatch list',{incomplete:true}],
 ['spent PR14 replay',{oldReplay:true}],
 ['competing waiting Feature work',{competitor:true}],
 ['wrong actor',{run:r=>r.actor.login='other'}],
 ['wrong workflow path',{run:r=>r.path='.github/workflows/old.yml'}],
 ['changed frozen controller blob',{frozenBlob:true}],
 ['extra application delta',{comparison:files=>files.push({filename:'backend/src/other.js',status:'added'})}],
 ['deleted reviewed source',{comparison:files=>files.pop()}],
 ['dirty local checkout',{guardFailure:true}]
])test('no credential/hosted access for '+name,()=>negative(change));
for(const [name,change]of [
 ['rerun',c=>c.runAttempt='2'],['wrong ref',c=>c.ref='refs/heads/studio_dev'],['push event',c=>c.event='push'],['fork',c=>c.repository='other/repo'],['untrusted workflow ref',c=>c.workflowRef='other']
])test('no credential/hosted access for '+name,()=>negative({},change));
test('wiring/effects/frozen controller bytes are literal and immutable',()=>{
 const bytes=readFileSync(new URL('../../deployment/jwt-feature-final-fence-execution.json',import.meta.url));assertPlanBytes(bytes);assert.throws(()=>assertPlanBytes(Buffer.concat([bytes,Buffer.from(' ')])));
 assert.equal(executionPlan.frozenControllerSource,'6525c8f7b6613d10c0626420d743c357616b479c');
 assert.equal(executionPlan.effectsSHA256,createHash('sha256').update(readFileSync(new URL('../../deployment/jwt-feature-readonly-final-fence.json',import.meta.url))).digest('hex'));
 assert(Object.isFrozen(executionPlan.frozenBlobs));assert.match(executionPlanSHA256,/^[a-f0-9]{64}$/);
});
test('public source preparation is one FF only, never a private dispatch or lease restart',async()=>{
 const f=fixture({promote:true}),r=await promoteFinalFence({api:f.api,mergeSha:merge});
 assert.equal(r.state,'SOURCE_PREPARED_ONLY');assert.equal(r.diagnosticDispatched,false);assert.equal(r.cloudflareCalls,0);
 assert.deepEqual(f.calls.filter(x=>x.method!=='GET'),[{path:'/repos/'+repo+'/git/refs/heads/feature-preview',method:'PATCH'}]);assert.equal(f.tokenReads,0);
});
test('public source preparation rejects old execution/competing work without ref mutation',async()=>{
 for(const change of [{promote:true,prior:true},{promote:true,competitor:true},{promote:true,frozenBlob:true}]){
  const f=fixture(change);await assert.rejects(promoteFinalFence({api:f.api,mergeSha:merge}));assert(!f.calls.some(x=>x.method!=='GET'));
 }
});
function coordinatorSettings(){
 const {coordinator:c}=expectedPausedMetadataProfiles(),bindings=[];
 for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars||{}))bindings.push({name,type:'plain_text',text});
 for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects.bindings)bindings.push({name:b.name,type:'durable_object_namespace',namespace_id:b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':'de95f15f19a54a9e9ba34e6e75f51847',class_name:b.class_name,script_name:b.script_name||c.name});
 return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,observability:{enabled:Boolean(c.observability?.enabled)},tail_consumers:[]};
}
function network(change={}){
 const calls=[];let provider=0,worker=0;
 const fetcher=async(url,o)=>{
  calls.push({url,method:o.method});assert.equal(o.method,'GET');assert.equal(o.redirect,'error');
  if(change.throwAt===calls.length)throw Error(canary);
  if(url.startsWith('https://api.cloudflare.com/')){
   const index=provider++,step=finalFencePlan.fixedProviderSequence[index];assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+finalFencePlan.accountId+'/workers/scripts/'+step.script+'/'+step.endpoint);
   const raw=index===1?coordinatorSettings():{deployments:[{versions:[{version_id:index===3?finalFencePlan.lastReviewedCoordinatorVersion:finalFencePlan.acceptedMainObservation.referenceVersion,percentage:100}]}]};
   return Response.json({success:true,result:raw});
  }
  assert.equal(url,finalFencePlan.probeOrigin+finalFencePlan.pausedProbePaths[worker++]);assert.equal(o.credentials,'omit');assert.equal(o.headers,undefined);
  return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 };
 return {calls,fetcher};
}
async function completed(change={}){
 const f=fixture(change),root=temp(),n=network(change);
 try{
  const r=await executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher});
  return {f,root,n,r};
 }catch(error){rmSync(root,{recursive:true,force:true});throw error;}
}

test('protected controller uses exact concrete writer and fixed4/3 actual transports with no mutation/activation',async()=>{
 const x=await completed();
 try{
  const {r,f,n}=x;assertEnvelope(r,f.context);assert.equal(n.calls.length,7);assert.equal(f.tokenReads,1);assert.equal(r.state,'CAPTURED_NOT_RELEASE_CLEARANCE');
  assert.equal(r.accounting.providerFetchInvocations,4);assert.equal(r.accounting.workerFetchInvocations,3);assert.equal(r.accounting.reservedProviderAttempts,4);assert.equal(r.accounting.reservedWorkerAttempts,3);
  assert.equal(r.receipt.cleanupVerified,false);assert.equal(r.receipt.mainOwnedVersionAdopted,false);assert.equal(r.activated,false);assert.equal(r.futureWriteClearance,false);
  const out=publishReceipt({context:f.context,runnerTemp:x.root});assert.deepEqual(out,r);assert(!JSON.stringify(out).includes('UNINSTALLED_CANARY_'));
  assert.throws(()=>publishReceipt({context:f.context,runnerTemp:x.root}));
 }finally{rmSync(x.root,{recursive:true,force:true});}
});
test('exclusive run directory collision stops before credential access',async()=>{
 const f=fixture(),root=temp(),n=network();
 try{
  boundDirectory(root,f.context,true);
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher}));
  assert.equal(f.tokenReads,0);assert.equal(n.calls.length,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('late withdrawal after synchronous reservation issues zero actual fetches and never refunds the reservation',async()=>{
 const f=fixture({withdrawOnGuard:6}),root=temp(),n=network();
 try{
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher}));
  const out=publishReceipt({context:f.context,runnerTemp:root});assert.equal(out.state,'STOPPED_NO_RETRY');assert.equal(out.accounting.providerFetchInvocations,0);assert.equal(out.accounting.reservedProviderAttempts,1);assert.equal(out.accounting.allowanceReusable,false);assert.equal(n.calls.length,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('transport loss counts one actual attempted GET and exports strict partial evidence without error text',async()=>{
 const f=fixture(),root=temp(),n=network({throwAt:1});
 try{
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher}));
  const out=publishReceipt({context:f.context,runnerTemp:root});assert.equal(out.state,'STOPPED_NO_RETRY');assert.equal(out.accounting.providerFetchInvocations,1);assert.equal(out.accounting.reservedProviderAttempts,1);assert(!JSON.stringify(out).includes('UNINSTALLED_CANARY_'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('missing final report after a complete-looking core file remains unknown accounting',async()=>{
 const x=await completed();
 try{
  const dir=boundDirectory(x.root,x.f.context);rmSync(join(dir,'execution-report.json'));
  const out=publishReceipt({context:x.f.context,runnerTemp:x.root});assert.equal(out.state,'UNKNOWN_MISSING_INVALID_OR_UNFINISHED');assert.equal(out.accounting.providerFetchInvocations,null);assert.equal(out.accounting.workerFetchInvocations,null);assert.equal(out.accounting.allowanceReusable,false);assert.equal(out.receiptOrigin,'UNVERIFIED');
 }finally{rmSync(x.root,{recursive:true,force:true});}
});
for(const name of ['report','core','binding']){
 test('invalid '+name+' data is never uploaded or converted into known-zero accounting',async()=>{
  const x=await completed();
  try{
   const dir=boundDirectory(x.root,x.f.context),file={report:'execution-report.json',core:'final-fence-verification.json',binding:'execution-binding.json'}[name];writeFileSync(join(dir,file),canary);
   const out=publishReceipt({context:x.f.context,runnerTemp:x.root});assert.equal(out.state,'UNKNOWN_MISSING_INVALID_OR_UNFINISHED');assert.equal(out.accounting.providerFetchInvocations,null);assert(!JSON.stringify(out).includes('UNINSTALLED_CANARY_'));
  }finally{rmSync(x.root,{recursive:true,force:true});}
 });
}
test('symlink receipt cannot escape the exclusive directory or leak the pointed-to file',async()=>{
 const x=await completed();
 try{
  const dir=boundDirectory(x.root,x.f.context),file=join(dir,'final-fence-verification.json'),outside=join(x.root,'unrelated.txt');writeFileSync(outside,canary);rmSync(file);symlinkSync(outside,file);
  const out=publishReceipt({context:x.f.context,runnerTemp:x.root});assert.equal(out.state,'UNKNOWN_MISSING_INVALID_OR_UNFINISHED');assert.equal(out.receipt,null);assert(!JSON.stringify(out).includes('UNINSTALLED_CANARY_'));
 }finally{rmSync(x.root,{recursive:true,force:true});}
});
test('missing private execution evidence produces unknown, not fabricated success or zero usage',()=>{
 const root=temp(),c=context();
 try{const out=publishReceipt({context:c,runnerTemp:root});assert.equal(out.execution,null);assert.equal(out.receipt,null);assert.equal(out.accounting.providerFetchInvocations,null);assert.equal(out.state,'UNKNOWN_MISSING_INVALID_OR_UNFINISHED');}
 finally{rmSync(root,{recursive:true,force:true});}
});
test('envelope tampering cannot bypass nested receipt, run binding, accounting or no-adoption limits',async()=>{
 const x=await completed();
 try{
  for(const change of [e=>e.raw=canary,e=>e.activated=true,e=>e.execution.source='f'.repeat(40),e=>e.accounting.providerFetchInvocations=3,e=>e.receipt.providerObservations[0].versionId='00000000-0000-4000-8000-000000000999',e=>e.receipt.pausedObservations[0].responseMatches=false]){
   const e=structuredClone(x.r);change(e);assert.throws(()=>assertEnvelope(e,x.f.context));
  }
 }finally{rmSync(x.root,{recursive:true,force:true});}
});
test('private workflow gates precede secret step; source jobs never receive private environment/token',()=>{
 const s=readFileSync(new URL('../../.github/workflows/feature-jwt-readonly-final-fence.yml',import.meta.url),'utf8');
 assert(s.includes('needs: validate'));assert(s.includes('environment: feature'));assert(s.includes('feature-isolation-${{ github.ref }}'));
 const i=s.indexOf('  inspect:'),j=s.indexOf('CLOUDFLARE_API_TOKEN');
 assert(i>0&&j>i);assert(s.slice(i,j).includes('Recheck protected gate before credential'));
 assert(!s.slice(0,i).includes('secrets.'));assert(!s.includes('curl '));assert(!s.includes('wrangler'));assert(s.includes('if: always()'));assert(!s.includes('secrets.FEATURE_TEST_ADMIN_PIN'));
});

test('concrete writer failure produces explicit persistence-unknown evidence and zero actual requests',async()=>{
 const f=fixture(),root=temp(),n=network();let injected=false;
 try{
  const outside=join(root,'unrelated.txt');writeFileSync(outside,canary);
  const localGuard=async()=>{
   await f.localGuard();
   if(f.guardCalls===5&&!injected){
    const dir=boundDirectory(root,f.context),file=join(dir,'final-fence-verification.json');rmSync(file);symlinkSync(outside,file);injected=true;
   }
  };
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher}));
  assert.equal(injected,true);assert.equal(n.calls.length,0);
  const out=publishReceipt({context:f.context,runnerTemp:root});assert.equal(out.state,'PERSISTENCE_FAILED_ACCOUNTING_UNKNOWN');assert.equal(out.receiptOrigin,'IN_MEMORY_NOT_PERSISTED');
  assert.equal(out.accounting.providerFetchInvocations,0);assert.equal(out.accounting.reservedProviderAttempts,1);assert.equal(out.accounting.allowanceReusable,false);assert(!JSON.stringify(out).includes('UNINSTALLED_CANARY_'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('withdrawal at the wrapper final boundary cannot export a complete-looking core receipt as success',async()=>{
 const baseline=await completed(),last=baseline.f.guardCalls;rmSync(baseline.root,{recursive:true,force:true});
 const f=fixture({withdrawOnGuard:last}),root=temp(),n=network();
 try{
  await assert.rejects(executeApprovedFinalFence({api:f.api,mergeSha:merge,prNumber:73,context:f.context,localGuard:f.localGuard,getToken:f.getToken,runnerTemp:root,fetcher:n.fetcher}));
  assert.equal(n.calls.length,7);
  const out=publishReceipt({context:f.context,runnerTemp:root});assert.equal(out.state,'UNKNOWN_MISSING_INVALID_OR_UNFINISHED');assert.equal(out.accounting.providerFetchInvocations,null);assert.equal(out.accounting.workerFetchInvocations,null);assert.equal(out.accounting.allowanceReusable,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
