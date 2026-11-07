// Protected, two-secret-only finalisation wiring. Merely importing is inert.
// Live use requires the exact merged Root approval and Feature-only workflow.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {githubClient,resolveApproval,freshApproval,assertFeatureComparison} from '../../tools/approved-deployment.mjs';
import {finalisationPlan,createFinalisationOps,finaliseOwnedFeature} from './jwt-feature-finalise.mjs';
const repo='MaktabForlife/Academy',workflow='feature-jwt-finalise.yml',workflowPath='.github/workflows/'+workflow;
const reviewedSource='460a0777d127b6f4608c9a24fe51a719721a605d',featureBase='a017f2f30324162e2946b8a32d494fdc10a5d27e';
const effectBytes=readFileSync(new URL('../../deployment/jwt-feature-finalisation-proposal.json',import.meta.url));
export function assertEffectsBytes(bytes){
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'),'de6c0157ee5ea6495d73301d527a34c4d855026e','REVIEWED_EFFECTS_CHANGED');
}
assertEffectsBytes(effectBytes);
export const executionEffectsHash=createHash('sha256').update(effectBytes).digest('hex');
export const sourcePaths=Object.freeze([
 '.github/workflows/feature-jwt-finalise-source-check.yml',
 '.github/workflows/feature-jwt-finalise.yml',
 'backend/tests/jwt-feature-finalise.test.mjs',
 'backend/tests/jwt-feature-finalise-approved.test.mjs',
 'backend/tools/jwt-feature-finalise.mjs',
 'backend/tools/jwt-feature-finalise-approved.mjs',
 'backend/tools/jwt-feature-install-metadata.mjs',
 'deployment/JWT-FEATURE-FINALISATION-PROPOSAL.md',
 'deployment/JWT-FEATURE-FINALISATION-EXECUTION.md',
 'deployment/jwt-feature-finalisation-proposal.json'
].sort());
const sha=/^[a-f0-9]{40}$/,uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const targets=['feature_worker','academy-feature-split-coordinator'];
export const scopeLines=source=>[
 'feature-finalisation-source: '+source,
 'feature-finalisation-effects-sha256: '+executionEffectsHash,
 'feature-finalisation-effects: two-temporary-secret-deletions-only',
 'feature-finalisation-explicit-gets: 18',
 'feature-finalisation-prior-gets: 40',
 'feature-finalisation-hard-get-limit: 60',
 'feature-finalisation-paused-probes: 3',
 'feature-exclusive-lease: '+finalisationPlan.request
];
export function assertScope(proof,comment,{featureSha,prNumber}={}){
 const p=proof.plan;
 assert.equal(p.request,finalisationPlan.request);assert.equal(p.kind,'component');assert.equal(p.target,'feature');
 assert.equal(p.contains_jwt,true);assert.equal(p.database_changes,false);assert.equal(p.version,'110.36');
 assert.equal(p.feature_base_sha,featureBase);assert(sha.test(p.feature_sha));
 if(featureSha)assert.equal(p.feature_sha,featureSha);if(prNumber)assert.equal(proof.pr,Number(prNumber));
 const lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 for(const expected of scopeLines(p.feature_sha)){
  const prefix=expected.slice(0,expected.indexOf(':')+1);
  assert.equal(lines.filter(x=>x===expected).length,1,'EXPLICIT_SCOPE_REQUIRED');
  assert.equal(lines.filter(x=>x.startsWith(prefix)).length,1,'AMBIGUOUS_SCOPE');
 }
 return p;
}
async function noCompetingFeatureRuns(api,ownRunId){
 // These filters are documented active statuses. Fail closed if any page is
 // incomplete, any competing Feature run exists, or the listing is ambiguous.
 for(const status of ['in_progress','queued','requested','waiting','pending']){
  const r=await api('/repos/'+repo+'/actions/runs?branch=feature-preview&status='+status+'&per_page=100');
  assert(Number.isSafeInteger(r.total_count)&&r.total_count===r.workflow_runs.length&&r.total_count<=100,'LEASE_LIST_INCOMPLETE');
  assert(!r.workflow_runs.some(x=>String(x.id)!==String(ownRunId)),'COMPETING_FEATURE_RUN');
 }
}
function assertContext(c){
 assert.equal(c.repository,repo);assert.equal(c.ref,'refs/heads/feature-preview');assert.equal(c.event,'workflow_dispatch');
 assert(sha.test(c.sha));assert.match(String(c.runId),/^[1-9][0-9]{0,19}$/);assert.equal(String(c.runAttempt),'1','NO_RERUN');
 assert.equal(c.workflowRef,repo+'/'+workflowPath+'@refs/heads/feature-preview');
}
async function assertRun(api,c){
 const r=await api('/repos/'+repo+'/actions/runs/'+c.runId);
 assert.equal(r.path,workflowPath);assert.equal(r.event,'workflow_dispatch');assert.equal(r.head_branch,'feature-preview');assert.equal(r.head_sha,c.sha);
 assert.equal(r.run_attempt,1);assert.equal(r.actor.login,'MaktabForlife');assert.equal(r.repository.full_name,repo);assert.equal(r.head_repository.full_name,repo);
 assert.equal(r.status,'in_progress','EXECUTION_NOT_RUNNING');
 const prior=await api('/repos/'+repo+'/actions/workflows/'+workflow+'/runs?branch=feature-preview&event=workflow_dispatch&per_page=100');
 assert(Number.isSafeInteger(prior.total_count)&&prior.total_count===prior.workflow_runs.length&&prior.total_count<=100,'DISPATCH_LIST_INCOMPLETE');
 assert.equal(prior.workflow_runs.length,1,'CLEANUP_ALREADY_ATTEMPTED');assert.equal(String(prior.workflow_runs[0].id),String(c.runId));
}
async function assertReviewedComparison(api,plan){
 const comparison=await api('/repos/'+repo+'/compare/'+featureBase+'...'+plan.feature_sha);
 assertFeatureComparison(comparison,plan);
 assert.deepEqual(comparison.files.map(x=>x.filename).sort(),sourcePaths,'EXACT_SOURCE_DELTA_REQUIRED');
 assert(comparison.files.every(x=>['added','modified'].includes(x.status)&&!x.previous_filename),'RENAME_OR_DELETE_FORBIDDEN');
}
export async function finalisationApproval({api,mergeSha,prNumber,context,localGuard}){
 assertContext(context);assert.equal(typeof localGuard,'function','LOCAL_SOURCE_GUARD_REQUIRED');await localGuard();
 const proof=await resolveApproval({repo,mergeSha,api});
 const comment=await api('/repos/'+repo+'/issues/comments/'+proof.commentId);
 assertScope(proof,comment,{featureSha:context.sha,prNumber});await assertReviewedComparison(api,proof.plan);
 const fresh=async()=>{
  assertEffectsBytes(readFileSync(new URL('../../deployment/jwt-feature-finalisation-proposal.json',import.meta.url)));
  await localGuard();await freshApproval(proof,api);
  assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,context.sha,'FEATURE_SOURCE_CHANGED');
  await assertRun(api,context);await noCompetingFeatureRuns(api,context.runId);
 };
 await fresh();return {proof,fresh};
}
export async function promoteFinalisation({api,mergeSha}){
 const proof=await resolveApproval({repo,mergeSha,api});
 assertScope(proof,await api('/repos/'+repo+'/issues/comments/'+proof.commentId));
 const p=proof.plan,path='/repos/'+repo+'/git/ref/heads/feature-preview',current=(await api(path)).object.sha;
 assert([featureBase,p.feature_sha].includes(current),'FEATURE_CHANGED');
 await assertReviewedComparison(api,p);
 // Promotion is public-source-only; it never dispatches or enters a secret job.
 await freshApproval(proof,api);await noCompetingFeatureRuns(api,null);
 assert.equal((await api(path)).object.sha,current);
 if(current!==p.feature_sha)await api('/repos/'+repo+'/git/refs/heads/feature-preview',{method:'PATCH',body:{sha:p.feature_sha,force:false}});
 return {state:'SOURCE_PREPARED_ONLY',featureSha:p.feature_sha,reviewedParent:reviewedSource,cleanupDispatched:false,cloudflareCalls:0};
}
const bools=['cleanupVerified','activated','codeContentVerified','assetRoutingReadbackVerified','metadataObservationsAtomic','notActivationReceipt','secretPatchAcknowledged','countsAreFetchAttempts','mutationOutcomeUnknown'];
const counts={workerCodeUploads:0,coordinatorUploads:0,configPatches:0,schemaSeedRequests:0,r2Operations:0,credentialGeneration:0,automaticRecoveryWrites:0,priorExplicitGets:40,explicitCloudflareGetAttempts:18,secretPatchAttempts:1,pausedProbeAttempts:3,cumulativeInstallerAndCleanupHTTPAttempts:8,cumulativeSecretBulkPatchAttempts:2,cumulativeExplicitGetAttempts:58,originalHardCombinedGetLimit:60};
const states=['NOT_STARTED','REVIEWED_METADATA_MATCHED','TEMPORARY_DELETION_ACKNOWLEDGED','OWNED_PAUSED_CLEANUP_OBSERVED','FINALISATION_STOPPED_NO_RETRY_NO_OVERWRITE'];
export function sanitiseExecutionReceipt(e,proof,source){
 const allowed=['schema','state','originalSource','originalOwner','observedAfterPatch',...bools,...Object.keys(counts)];
 assert(Object.keys(e).every(k=>allowed.includes(k)),'UNKNOWN_RECEIPT_FIELD');assert.equal(e.schema,1);assert(states.includes(e.state));
 assert.equal(e.originalSource,finalisationPlan.originalSource);assert.equal(e.originalOwner,finalisationPlan.originalOwner);
 for(const k of bools)assert.equal(typeof e[k],'boolean','RECEIPT_BOOLEAN');
 for(const [k,max]of Object.entries(counts))assert(Number.isSafeInteger(e[k])&&e[k]>=0&&e[k]<=max,'RECEIPT_COUNT');
 for(const k of ['activated','codeContentVerified','assetRoutingReadbackVerified','metadataObservationsAtomic'])assert.equal(e[k],false);
 assert.equal(e.notActivationReceipt,true);assert.equal(e.countsAreFetchAttempts,true);
 assert.equal(e.cleanupVerified,e.state==='OWNED_PAUSED_CLEANUP_OBSERVED','INCONSISTENT_CLEANUP_CLOSURE');
 if(e.cleanupVerified){assert.equal(e.explicitCloudflareGetAttempts,18);assert.equal(e.pausedProbeAttempts,3);assert.equal(e.secretPatchAcknowledged,true);}
 assert.equal(e.priorExplicitGets,40);assert.equal(e.originalHardCombinedGetLimit,60);
 assert.equal(e.cumulativeExplicitGetAttempts,40+e.explicitCloudflareGetAttempts);
 assert.equal(e.cumulativeSecretBulkPatchAttempts,1+e.secretPatchAttempts);
 assert.equal(e.cumulativeInstallerAndCleanupHTTPAttempts,5+e.pausedProbeAttempts);
 assert.equal(e.mutationOutcomeUnknown,e.secretPatchAttempts>0&&!e.secretPatchAcknowledged);
 if(e.observedAfterPatch!==null){
  assert.deepEqual(Object.keys(e.observedAfterPatch).sort(),[...targets].sort());
  for(const v of Object.values(e.observedAfterPatch))assert(uuid.test(v),'RECEIPT_VERSION');
  assert.equal(e.observedAfterPatch[targets[1]],finalisationPlan.observedVersions[targets[1]]);
 }
 assert(sha.test(source)&&sha.test(proof.mergeSha)&&sha.test(proof.headSha));assert(Number.isSafeInteger(proof.pr)&&Number.isSafeInteger(proof.approvalStatusId));
 assert.match(proof.commentHash,/^[a-f0-9]{64}$/);
 return {...structuredClone(e),execution:{source,request:finalisationPlan.request,effectsSHA256:executionEffectsHash,approvalPR:proof.pr,approvalMerge:proof.mergeSha,approvalHead:proof.headSha,approvalStatusId:proof.approvalStatusId,approvalCommentSHA256:proof.commentHash,sharedConcurrencyGroup:'feature-isolation-refs/heads/feature-preview'}};
}
export async function executeApprovedFinalisation({api,mergeSha,prNumber,context,localGuard,getToken,fetcher=fetch,save}){
 const approved=await finalisationApproval({api,mergeSha,prNumber,context,localGuard});
 await approved.fresh();assert.equal(typeof getToken,'function');assert.equal(typeof save,'function');
 // Credential access is deliberately after every public approval/lease gate.
 const ops=createFinalisationOps({token:getToken(),fresh:approved.fresh,fetcher,save:e=>save(sanitiseExecutionReceipt(e,approved.proof,context.sha))});
 try{return sanitiseExecutionReceipt(await finaliseOwnedFeature({ops}),approved.proof,context.sha);}
 catch{throw Error('APPROVED_OWNED_CLEANUP_STOPPED_SEE_SANITISED_RECEIPT');}
}
function localSourceGuard(source){
 const env={...process.env};for(const k of ['CLOUDFLARE_API_TOKEN','GITHUB_TOKEN','GH_TOKEN','FEATURE_TEST_ADMIN_PIN'])delete env[k];
 const git=(...args)=>execFileSync('git',args,{cwd:process.cwd(),encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
 return async()=>{assert.equal(git('rev-parse','HEAD'),source);assert.equal(git('status','--porcelain','--untracked-files=all'),'','SOURCE_CHANGED');};
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);
 const mode=process.argv[2],api=githubClient(process.env.GITHUB_TOKEN);
 if(mode==='promote'){
  assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/studio_dev');
  const p=JSON.parse(readFileSync('deployment/release-plan.json','utf8'));
  if(p.request!==finalisationPlan.request){console.log(JSON.stringify({state:'NOT_SELECTED',cloudflareCalls:0}));return;}
  console.log(JSON.stringify(await promoteFinalisation({api,mergeSha:process.env.GITHUB_SHA})));return;
 }
 const context={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF};
 const args={api,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,context,localGuard:localSourceGuard(context.sha)};
 if(mode==='validate'){await finalisationApproval(args);return;}
 assert.equal(mode,'execute');
 const directory=resolve(process.env.RUNNER_TEMP,'jwt-finalise-evidence');assert(directory.startsWith(resolve(process.env.RUNNER_TEMP)+'/'));
 const save=e=>{mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'owned-finalisation.json'),JSON.stringify(e,null,2)+'\n');};
 const r=await executeApprovedFinalisation({...args,getToken:()=>process.env.CLOUDFLARE_API_TOKEN,save});
 console.log(JSON.stringify({state:r.state,cleanupVerified:r.cleanupVerified,activated:false,explicitGetAttempts:r.explicitCloudflareGetAttempts,receipt:'owned-finalisation.json'}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await main();}catch{console.error('PROTECTED_FEATURE_CLEANUP_STOPPED');process.exitCode=1;}}
