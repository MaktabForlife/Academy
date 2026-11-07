// Protected source proposal only. No execution/promotion is authorised by this file.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {githubClient,resolveApproval,freshApproval,assertFeatureComparison} from '../../tools/approved-deployment.mjs';
import {finalFencePlan,verifyReadOnlyFinalFence,assertFinalFenceReceipt,createSyncFinalFenceReceiptWriter} from './jwt-feature-readonly-final-fence.mjs';
const repo='MaktabForlife/Academy',workflow='feature-jwt-readonly-final-fence.yml',workflowPath='.github/workflows/'+workflow;
const frozen='6525c8f7b6613d10c0626420d743c357616b479c',base='e682301619ec20d65f5530948bb664529c1440dc';
const hash=b=>createHash('sha256').update(b).digest('hex'),blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const planBytes=readFileSync(new URL('../../deployment/jwt-feature-final-fence-execution.json',import.meta.url));
const deepFreeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')deepFreeze(v);return Object.freeze(x);};
export const executionPlan=deepFreeze(JSON.parse(planBytes));
export const executionPlanSHA256='8ba480b08e99922c14a8c16b1606aec11228b2fb3acaec174ca81a95f0b850be';
export function assertPlanBytes(bytes){assert.equal(hash(bytes),executionPlanSHA256,'EXECUTION_PLAN_CHANGED');assert.equal(blob(bytes),'9c57d65d3ee2529e757976f2d31f7001ff254ad1','EXECUTION_PLAN_CHANGED');}
assertPlanBytes(planBytes);
export const wiringPaths=Object.freeze([
 workflowPath,'backend/tools/jwt-feature-readonly-final-fence-approved.mjs','backend/tests/jwt-feature-readonly-final-fence-approved.test.mjs',
 'deployment/jwt-feature-final-fence-execution.json','deployment/JWT-FEATURE-FINAL-FENCE-EXECUTION.md'
].sort());
export const sourcePaths=Object.freeze([...Object.keys(executionPlan.frozenBlobs),...wiringPaths].sort());
const sha=/^[a-f0-9]{40}$/,hex=/^[a-f0-9]{64}$/,id=/^[1-9][0-9]{0,19}$/;
const exact=(x,keys)=>assert.deepEqual(Object.keys(x).sort(),[...keys].sort(),'STRICT_RECEIPT_SHAPE');
export const scopeLines=source=>[
 'feature-final-fence-source: '+source,
 'feature-final-fence-frozen-source: '+frozen,
 'feature-final-fence-effects-sha256: '+executionPlan.effectsSHA256,
 'feature-final-fence-wiring-sha256: '+executionPlanSHA256,
 'feature-final-fence-prior-provider-gets: 56',
 'feature-final-fence-provider-gets: 4',
 'feature-final-fence-original-provider-cap: 60',
 'feature-final-fence-prior-http-attempts: 5',
 'feature-final-fence-paused-http-attempts: 3',
 'feature-final-fence-original-http-cap: 8',
 'feature-final-fence-hosted-writes: none',
 'feature-exclusive-lease: '+executionPlan.lease
];
export function assertScope(proof,comment,{source,prNumber}={}){
 const p=proof.plan;
 assert.equal(p.request,executionPlan.request);assert.equal(p.kind,'component');assert.equal(p.target,'feature');
 assert.equal(p.contains_jwt,true);assert.equal(p.database_changes,false);assert.equal(p.version,'110.37');
 assert.equal(p.feature_base_sha,base);assert(sha.test(p.feature_sha));
 if(source)assert.equal(p.feature_sha,source);if(prNumber)assert.equal(proof.pr,Number(prNumber));
 const lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 for(const expected of scopeLines(p.feature_sha)){
  const prefix=expected.slice(0,expected.indexOf(':')+1);
  assert.equal(lines.filter(x=>x===expected).length,1,'EXPLICIT_SCOPE_REQUIRED');
  assert.equal(lines.filter(x=>x.startsWith(prefix)).length,1,'AMBIGUOUS_SCOPE');
 }
 return p;
}
function assertContext(c){
 assert.equal(c.repository,repo);assert.equal(c.ref,'refs/heads/feature-preview');assert.equal(c.event,'workflow_dispatch');
 assert(sha.test(c.sha));assert(id.test(String(c.runId)));assert.equal(String(c.runAttempt),'1','NO_RERUN');
 assert.equal(c.workflowRef,repo+'/'+workflowPath+'@refs/heads/feature-preview');
}
async function noCompetingFeatureRuns(api,own){
 for(const status of ['in_progress','queued','requested','waiting','pending']){
  const r=await api('/repos/'+repo+'/actions/runs?branch=feature-preview&status='+status+'&per_page=100');
  assert(Number.isSafeInteger(r.total_count)&&r.total_count===r.workflow_runs.length&&r.total_count<=100,'LEASE_LIST_INCOMPLETE');
  assert(!r.workflow_runs.some(x=>String(x.id)!==String(own)),'COMPETING_FEATURE_RUN');
 }
}
async function assertRun(api,c){
 const r=await api('/repos/'+repo+'/actions/runs/'+c.runId);
 assert.equal(r.path,workflowPath);assert.equal(r.event,'workflow_dispatch');assert.equal(r.head_branch,'feature-preview');assert.equal(r.head_sha,c.sha);
 assert.equal(r.run_attempt,1);assert.equal(r.actor.login,'MaktabForlife');assert.equal(r.repository.full_name,repo);assert.equal(r.head_repository.full_name,repo);assert.equal(r.status,'in_progress');
 // NO branch/head filter: even a skipped/cancelled/failed dispatch on another
 // source head spends the sole execution attempt; never rename/reset history.
 const all=await api('/repos/'+repo+'/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&per_page=100');
 assert(Number.isSafeInteger(all.total_count)&&all.total_count===all.workflow_runs.length&&all.total_count<=100,'DISPATCH_LIST_INCOMPLETE');
 assert.equal(all.workflow_runs.length,1,'EXECUTION_ALREADY_ATTEMPTED');assert.equal(String(all.workflow_runs[0].id),String(c.runId));
}
async function assertSpentPR14(api){
 const r=await api('/repos/'+repo+'/actions/workflows/'+executionPlan.spentPR14.workflow+'/runs?event=workflow_dispatch&per_page=100');
 assert.equal(r.total_count,1);assert.equal(r.workflow_runs.length,1);
 const x=r.workflow_runs[0];assert.equal(x.id,42358703100);assert.equal(x.run_attempt,1);assert.equal(x.head_sha,base);
 assert.equal(x.status,'completed');assert.equal(x.conclusion,'success');assert.equal(x.actor.login,'MaktabForlife');
}
async function reviewedSource(api,p){
 const c=await api('/repos/'+repo+'/compare/'+base+'...'+p.feature_sha);assertFeatureComparison(c,p);
 assert.deepEqual(c.files.map(x=>x.filename).sort(),sourcePaths,'EXACT_SOURCE_DELTA_REQUIRED');
 assert(c.files.every(x=>x.status==='added'&&!x.previous_filename),'ADDITIONS_ONLY');
 for(const [path,expected]of Object.entries(executionPlan.frozenBlobs)){
  const x=await api('/repos/'+repo+'/contents/'+path+'?ref='+p.feature_sha);
  assert.equal(x.sha,expected,'FROZEN_CONTROLLER_BLOB_CHANGED');
 }
}
export async function finalFenceApproval({api,mergeSha,prNumber,context,localGuard}){
 assertContext(context);assert.equal(typeof localGuard,'function');await localGuard();
 assertPlanBytes(readFileSync(new URL('../../deployment/jwt-feature-final-fence-execution.json',import.meta.url)));
 const proof=await resolveApproval({repo,mergeSha,api});assertScope(proof,await api('/repos/'+repo+'/issues/comments/'+proof.commentId),{source:context.sha,prNumber});
 await reviewedSource(api,proof.plan);
 const fresh=async()=>{
  assertPlanBytes(readFileSync(new URL('../../deployment/jwt-feature-final-fence-execution.json',import.meta.url)));
  assert.equal(hash(readFileSync(new URL('../../deployment/jwt-feature-readonly-final-fence.json',import.meta.url))),executionPlan.effectsSHA256);
  await localGuard();await freshApproval(proof,api);
  assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,context.sha,'FEATURE_SOURCE_CHANGED');
  await assertRun(api,context);await assertSpentPR14(api);await noCompetingFeatureRuns(api,context.runId);
 };
 await fresh();return {proof,fresh};
}
export async function promoteFinalFence({api,mergeSha}){
 const proof=await resolveApproval({repo,mergeSha,api});assertScope(proof,await api('/repos/'+repo+'/issues/comments/'+proof.commentId));
 await reviewedSource(api,proof.plan);await assertSpentPR14(api);
 const path='/repos/'+repo+'/git/ref/heads/feature-preview',current=(await api(path)).object.sha;
 assert([base,proof.plan.feature_sha].includes(current),'FEATURE_CHANGED');
 // No automatic source preparation if any private attempt already exists.
 const history=await api('/repos/'+repo+'/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&per_page=100');
 assert.equal(history.total_count,0);assert.deepEqual(history.workflow_runs,[]);
 await freshApproval(proof,api);await noCompetingFeatureRuns(api,null);
 assert.equal((await api(path)).object.sha,current);
 if(current!==proof.plan.feature_sha)await api('/repos/'+repo+'/git/refs/heads/feature-preview',{method:'PATCH',body:{sha:proof.plan.feature_sha,force:false}});
 return {state:'SOURCE_PREPARED_ONLY',featureSha:proof.plan.feature_sha,frozenSource:frozen,executionPlanSHA256,diagnosticDispatched:false,cloudflareCalls:0};
}
function executionBinding(proof,c){
 return {source:c.sha,runId:String(c.runId),runAttempt:1,repository:repo,actor:'MaktabForlife',request:executionPlan.request,lease:executionPlan.lease,frozenSource:frozen,
 effectsSHA256:executionPlan.effectsSHA256,executionPlanSHA256,approvalPR:proof.pr,approvalMerge:proof.mergeSha,approvalHead:proof.headSha,approvalStatusId:proof.approvalStatusId,approvalCommentSHA256:proof.commentHash};
}
function assertBinding(b,c){
 exact(b,['source','runId','runAttempt','repository','actor','request','lease','frozenSource','effectsSHA256','executionPlanSHA256','approvalPR','approvalMerge','approvalHead','approvalStatusId','approvalCommentSHA256']);
 assert.equal(b.source,c.sha);assert.equal(b.runId,String(c.runId));assert.equal(b.runAttempt,1);assert.equal(b.repository,repo);assert.equal(b.actor,'MaktabForlife');
 assert.equal(b.request,executionPlan.request);assert.equal(b.lease,executionPlan.lease);assert.equal(b.frozenSource,frozen);assert.equal(b.effectsSHA256,executionPlan.effectsSHA256);assert.equal(b.executionPlanSHA256,executionPlanSHA256);
 for(const k of ['approvalMerge','approvalHead'])assert(sha.test(b[k]));assert(hex.test(b.approvalCommentSHA256));
 for(const k of ['approvalPR','approvalStatusId'])assert(Number.isSafeInteger(b[k])&&b[k]>0);
 return b;
}
export function boundDirectory(temp,c,create=false){
 assertContext(c);assert(typeof temp==='string'&&isAbsolute(temp));assert.equal(realpathSync(temp),resolve(temp),'RUNNER_TEMP_ALIAS');
 const dir=resolve(temp,'jwt-final-fence-'+c.runId+'-1');assert.equal(resolve(dir,'..'),resolve(temp));
 if(create)mkdirSync(dir,{recursive:false,mode:0o700});
 const st=lstatSync(dir);assert(st.isDirectory()&&!st.isSymbolicLink());assert.equal(realpathSync(dir),dir);
 return dir;
}
function safeJSONFile(dir,name,maximum){
 const file=resolve(dir,name);assert.equal(resolve(file,'..'),dir);const s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=maximum);
 return JSON.parse(readFileSync(file,'utf8'));
}
function writeJSONFile(dir,name,value){
 const file=resolve(dir,name);assert.equal(resolve(file,'..'),dir);
 if(existsSync(file)){const s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());}
 const text=JSON.stringify(value,null,2)+'\n';assert(Buffer.byteLength(text)<=131072);
 writeFileSync(file,text,{mode:0o600});
}
const envelopeStates=new Set(['CAPTURED_NOT_RELEASE_CLEARANCE','STOPPED_NO_RETRY','PERSISTENCE_FAILED_ACCOUNTING_UNKNOWN','UNKNOWN_MISSING_INVALID_OR_UNFINISHED']);
export function assertEnvelope(e,c){
 exact(e,['schema','state','run','execution','receiptOrigin','receipt','accounting','hostedWrites','activated','cleanupVerified','mainOwnedVersionAdopted','futureWriteClearance']);
 assert.equal(e.schema,1);assert(envelopeStates.has(e.state));exact(e.run,['source','runId','runAttempt']);assert.deepEqual(e.run,{source:c.sha,runId:String(c.runId),runAttempt:1});
 if(e.execution!==null)assertBinding(e.execution,c);
 assert(['SYNC_CORE_FILE_MATCHED','IN_MEMORY_NOT_PERSISTED','UNVERIFIED'].includes(e.receiptOrigin));
 if(e.receipt!==null)assertFinalFenceReceipt(e.receipt);
 const a=e.accounting;exact(a,['providerFetchInvocations','workerFetchInvocations','reservedProviderAttempts','reservedWorkerAttempts','priorProviderAttempts','originalProviderCap','priorHTTPAttempts','originalHTTPCap','allowanceReusable']);
 for(const [k,max]of [['providerFetchInvocations',4],['workerFetchInvocations',3],['reservedProviderAttempts',4],['reservedWorkerAttempts',3]])assert(a[k]===null||Number.isInteger(a[k])&&a[k]>=0&&a[k]<=max);
 assert.equal(a.priorProviderAttempts,56);assert.equal(a.originalProviderCap,60);assert.equal(a.priorHTTPAttempts,5);assert.equal(a.originalHTTPCap,8);assert.equal(a.allowanceReusable,false);
 if(e.receipt!==null){assert.equal(a.reservedProviderAttempts,e.receipt.explicitCloudflareGetAttempts);assert.equal(a.reservedWorkerAttempts,e.receipt.pausedProbeAttempts);}
 else{assert.equal(a.reservedProviderAttempts,null);assert.equal(a.reservedWorkerAttempts,null);}
 for(const [actual,reserved]of [['providerFetchInvocations','reservedProviderAttempts'],['workerFetchInvocations','reservedWorkerAttempts']])if(a[actual]!==null&&a[reserved]!==null)assert(a[actual]<=a[reserved]);
 if(e.state==='CAPTURED_NOT_RELEASE_CLEARANCE'){
  assert(e.execution&&e.receipt&&e.receipt.checksPassed);assert.equal(e.receiptOrigin,'SYNC_CORE_FILE_MATCHED');
  assert.equal(a.providerFetchInvocations,4);assert.equal(a.workerFetchInvocations,3);
 }else if(e.state==='STOPPED_NO_RETRY'){
  assert(e.execution&&e.receipt);assert.equal(e.receipt.state,'FINAL_FENCE_STOPPED_NO_RETRY');assert.equal(e.receiptOrigin,'SYNC_CORE_FILE_MATCHED');assert(a.providerFetchInvocations!==null&&a.workerFetchInvocations!==null);
 }else if(e.state==='PERSISTENCE_FAILED_ACCOUNTING_UNKNOWN'){
  assert(e.execution&&e.receipt);assert.equal(e.receipt.state,'FINAL_FENCE_STOPPED_NO_RETRY');assert.equal(e.receiptOrigin,'IN_MEMORY_NOT_PERSISTED');assert(a.providerFetchInvocations!==null&&a.workerFetchInvocations!==null);
 }else{
  assert.equal(a.providerFetchInvocations,null);assert.equal(a.workerFetchInvocations,null);assert.equal(e.receiptOrigin,'UNVERIFIED');
 }
 assert.equal(e.hostedWrites,0);for(const k of ['activated','cleanupVerified','mainOwnedVersionAdopted','futureWriteClearance'])assert.equal(e[k],false);
 return e;
}
function envelope({c,binding=null,receipt=null,counts=null,state='UNKNOWN_MISSING_INVALID_OR_UNFINISHED',origin='UNVERIFIED'}){
 return assertEnvelope({schema:1,state,run:{source:c.sha,runId:String(c.runId),runAttempt:1},execution:binding,receiptOrigin:origin,receipt,
 accounting:{providerFetchInvocations:counts?.provider??null,workerFetchInvocations:counts?.worker??null,reservedProviderAttempts:receipt?.explicitCloudflareGetAttempts??null,reservedWorkerAttempts:receipt?.pausedProbeAttempts??null,priorProviderAttempts:56,originalProviderCap:60,priorHTTPAttempts:5,originalHTTPCap:8,allowanceReusable:false},
 hostedWrites:0,activated:false,cleanupVerified:false,mainOwnedVersionAdopted:false,futureWriteClearance:false},c);
}
function networkSequence(){
 const [a,b,c,d]=finalFencePlan.fixedProviderSequence,cf=x=>'https://api.cloudflare.com/client/v4/accounts/'+finalFencePlan.accountId+'/workers/scripts/'+x.script+'/'+x.endpoint;
 return [{kind:'provider',url:cf(a)},{kind:'provider',url:cf(b)},...finalFencePlan.pausedProbePaths.map(path=>({kind:'worker',url:finalFencePlan.probeOrigin+path})),{kind:'provider',url:cf(c)},{kind:'provider',url:cf(d)}];
}
export async function executeApprovedFinalFence({api,mergeSha,prNumber,context,localGuard,runnerTemp,getToken,fetcher=fetch}){
 const approved=await finalFenceApproval({api,mergeSha,prNumber,context,localGuard});
 await approved.fresh();const dir=boundDirectory(runnerTemp,context,true),binding=executionBinding(approved.proof,context);
 assertBinding(binding,context);writeJSONFile(dir,'execution-binding.json',binding);
 const concreteWriter=createSyncFinalFenceReceiptWriter(dir),counts={provider:0,worker:0},sequence=networkSequence();let position=0;
 let receipt,failedPersistence=false;
 try{
  const save=r=>{
   boundDirectory(runnerTemp,context);const file=resolve(dir,'final-fence-verification.json');
   if(existsSync(file)){const s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());}
   concreteWriter(r);assert.deepEqual(safeJSONFile(dir,'final-fence-verification.json',65536),r);
  };
  receipt=await verifyReadOnlyFinalFence({
   fresh:approved.fresh,save,getToken,
   fetcher:async(url,options)=>{
    // Revalidate after the synchronous receipt write, immediately before the
    // actual fetch. A withdrawal spends the reservation but issues no request.
    await approved.fresh();boundDirectory(runnerTemp,context);
    const step=sequence[position];assert(step&&url===step.url,'FIXED_TRANSPORT_SEQUENCE');
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    if(step.kind==='worker'){assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);}
    else{exact(options.headers,['Authorization']);assert(typeof options.headers.Authorization==='string'&&options.headers.Authorization.startsWith('Bearer '));}
    position++;counts[step.kind]++;assert(counts.provider<=4&&counts.worker<=3);
    return fetcher(url,options);
   }
  });
  await approved.fresh();assert.equal(position,7);
  assert.deepEqual(safeJSONFile(dir,'final-fence-verification.json',65536),receipt);
  const result=envelope({c:context,binding,receipt,counts,state:'CAPTURED_NOT_RELEASE_CLEARANCE',origin:'SYNC_CORE_FILE_MATCHED'});
  writeJSONFile(dir,'execution-report.json',result);return result;
 }catch(error){
  failedPersistence=error?.message==='FINAL_FENCE_STOPPED_RECEIPT_PERSISTENCE_FAILED';
  try{
   const r=error?.receipt;assertFinalFenceReceipt(r);assert.equal(r.state,'FINAL_FENCE_STOPPED_NO_RETRY');
   if(!failedPersistence)assert.deepEqual(safeJSONFile(dir,'final-fence-verification.json',65536),r);
   const result=envelope({c:context,binding,receipt:r,counts,state:failedPersistence?'PERSISTENCE_FAILED_ACCOUNTING_UNKNOWN':'STOPPED_NO_RETRY',origin:failedPersistence?'IN_MEMORY_NOT_PERSISTED':'SYNC_CORE_FILE_MATCHED'});
   writeJSONFile(dir,'execution-report.json',result);
  }catch{} // Invalid/unsaved/killed accounting stays UNKNOWN in the publisher.
  throw Error('APPROVED_FINAL_FENCE_STOPPED_NO_RETRY');
 }
}
export function publishReceipt({context,runnerTemp}){
 assertContext(context);let result=envelope({c:context});
 try{
  const dir=boundDirectory(runnerTemp,context),binding=assertBinding(safeJSONFile(dir,'execution-binding.json',32768),context);
  try{
   const candidate=assertEnvelope(safeJSONFile(dir,'execution-report.json',131072),context);assert.deepEqual(candidate.execution,binding);
   if(candidate.receiptOrigin==='SYNC_CORE_FILE_MATCHED')assert.deepEqual(safeJSONFile(dir,'final-fence-verification.json',65536),candidate.receipt);
   result=candidate;
  }catch{
   let receipt=null;try{receipt=assertFinalFenceReceipt(safeJSONFile(dir,'final-fence-verification.json',65536));}catch{}
   result=envelope({c:context,binding,receipt});
  }
 }catch{}
 // Only this new exclusive artifact directory is uploaded, never raw work files.
 assert(typeof runnerTemp==='string'&&isAbsolute(runnerTemp));assert.equal(realpathSync(runnerTemp),resolve(runnerTemp));
 const out=resolve(runnerTemp,'jwt-final-fence-artifact-'+context.runId+'-1');mkdirSync(out,{recursive:false,mode:0o700});
 writeJSONFile(out,'final-fence-verification.json',result);return result;
}
function localSourceGuard(source){
 const env={...process.env};for(const k of ['CLOUDFLARE_API_TOKEN','GITHUB_TOKEN','GH_TOKEN','FEATURE_TEST_ADMIN_PIN'])delete env[k];
 const git=(...args)=>execFileSync('git',args,{cwd:process.cwd(),encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
 return async()=>{assert.equal(git('rev-parse','HEAD'),source);assert.equal(git('status','--porcelain','--untracked-files=all'),'','SOURCE_CHANGED');};
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);
 const mode=process.argv[2],context={repository:repo,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF};
 if(mode==='publish'){
  await localSourceGuard(context.sha)();const r=publishReceipt({context,runnerTemp:process.env.RUNNER_TEMP});
  console.log(JSON.stringify({state:r.state,activated:false,cleanupVerified:false}));return;
 }
 const api=githubClient(process.env.GITHUB_TOKEN);
 if(mode==='promote'){
  assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/studio_dev');
  const p=JSON.parse(readFileSync('deployment/release-plan.json','utf8'));
  if(p.request!==executionPlan.request){console.log(JSON.stringify({state:'NOT_SELECTED',cloudflareCalls:0}));return;}
  console.log(JSON.stringify(await promoteFinalFence({api,mergeSha:process.env.GITHUB_SHA})));return;
 }
 const args={api,context,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,localGuard:localSourceGuard(context.sha)};
 if(mode==='validate'){await finalFenceApproval(args);return;}
 assert.equal(mode,'execute');
 const r=await executeApprovedFinalFence({...args,runnerTemp:process.env.RUNNER_TEMP,getToken:()=>process.env.CLOUDFLARE_API_TOKEN});
 console.log(JSON.stringify({state:r.state,providerFetchInvocations:r.accounting.providerFetchInvocations,workerFetchInvocations:r.accounting.workerFetchInvocations,activated:false,cleanupVerified:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await main();}catch{console.error('PROTECTED_FINAL_FENCE_STOPPED');process.exitCode=1;}}
