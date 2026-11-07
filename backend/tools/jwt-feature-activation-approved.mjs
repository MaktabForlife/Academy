// Feature-only activation control proposal. No authority follows from source alone.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync,mkdirSync,writeFileSync,renameSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolveApproval,freshApproval,assertFeatureComparison} from '../../tools/approved-deployment.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
import {activationGitHub} from './jwt-feature-activation-github.mjs';
const path='deployment/jwt-feature-activation-plan.json';
const bytes=readFileSync(new URL('../../'+path,import.meta.url));
export const planSHA256='98f0ef7dcad5c67a954982f9c9a45df376c2d25268058df0c802b60e1732ee6b';
assert.equal(hash(bytes),planSHA256,'ACTIVATION_PLAN_CHANGED');
const freeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')freeze(v);return Object.freeze(x);};
export const plan=freeze(JSON.parse(bytes));
export const workflowPath=plan.workflow;
const repo='MaktabForlife/Academy',owner='MaktabForlife';
const sha=/^[a-f0-9]{40}$/,hex=/^[a-f0-9]{64}$/,id=/^[1-9][0-9]{0,19}$/;
const exact=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort());
export function assertContext(c){
 assert.equal(c.repository,repo);assert.equal(c.ref,'refs/heads/feature-preview');assert.equal(c.event,'workflow_dispatch');
 assert(sha.test(c.source));assert(id.test(String(c.runId)));assert.equal(String(c.attempt),'1','NO_RERUN');
 assert.equal(c.workflowRef,repo+'/'+workflowPath+'@refs/heads/feature-preview');
}
export const sourceScopeLines=source=>[
 'jwt-activation-source: '+source,
 'jwt-activation-plan-sha256: '+planSHA256,
 'jwt-activation-base: '+plan.featureBase,
 'jwt-activation-mode: ACTIVE_MAIN_ONLY',
 'jwt-activation-assets: 1057-files-116996993-bytes-per-CLI',
 'jwt-activation-prior-paused-file-sha256: '+plan.baseline.fileSHA256,
 'jwt-activation-synthetic-smoke: exactly-eight-no-retries-real-new-feature-auth-cache-writes',
 'jwt-activation-recovery: owned-MAIN-PAUSED-only-on-eligible-functional-failure',
 'jwt-activation-private-dispatch: separately-registered-window-only'
];
export function assertScope(proof,comment,{source,prNumber}={}){
 const p=proof.plan;assert.equal(p.request,plan.request);assert.equal(p.kind,'component');assert.equal(p.target,'feature');
 assert.equal(p.contains_jwt,true);assert.equal(p.database_changes,false);assert.equal(p.version,plan.version);
 assert.equal(p.feature_base_sha,plan.featureBase);assert(sha.test(p.feature_sha));
 if(source)assert.equal(p.feature_sha,source);if(prNumber)assert.equal(proof.pr,Number(prNumber));
 const lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 for(const expected of sourceScopeLines(p.feature_sha)){
  const prefix=expected.slice(0,expected.indexOf(':')+1);assert.equal(lines.filter(x=>x===expected).length,1,'EXACT_SOURCE_EFFECT_SCOPE_REQUIRED');
  assert.equal(lines.filter(x=>x.startsWith(prefix)).length,1,'AMBIGUOUS_SOURCE_SCOPE');
 }
 return p;
}
export function windowLines({source,merge,preparedRun,preparedDigest,expires}){
 return [
  'Optimisation JWT Feature activation window','window: '+plan.window.lease,
  'source: '+source,'approval-merge: '+merge,'source-preparation-run: '+preparedRun,'source-preparation-proof-sha256: '+preparedDigest,
  'source-and-prior-paused-receipt-review: independently-accepted',
  'owner-specific-activation-code-assets-smoke-recovery-budget-approval: recorded-by-optimisation',
  'prior-paused-file-sha256: '+plan.baseline.fileSHA256,
  'executor: Deployment '+plan.executor.thread,'target-order: feature_worker',
  'mode: ACTIVE_MAIN_ONLY','production: unchanged',
  'metadata-get-fetch-invocations: 24','cli-process-attempts: 2','public-get-fetch-invocations: 3',
  'synthetic-smoke-fetch-invocations: 8','conditional-paused-get-fetch-invocations: 1',
  'recovery: one-owned-PAUSED-only-no-control-drift-withdrawal-or-persistence-unknown',
  'full-public-bundle: 1057-files-116996993-bytes-per-CLI',
  'cli-internal-requests-and-retries: separate-unmeasured-not-zero',
  'github-control-ceiling: 724-REST-fetch-invocations-three-processes-not-a-reservation',
  'db-effects: fixed-synthetic-session-auth-cache-writes-only-no-schema-seed-repair',
  'secret-use: existing-Feature-token-and-synthetic-PIN-names-only-no-key-readback',
  'coordinator-write-key-secret-schema-namespace-production-operations: none',
  'plan-sha256: '+planSHA256,'exclusive-writer-window: '+plan.window.lease,'expires: '+expires
 ];
}
export function assertWindow({proof,comment,statuses,preparedRun,preparedArtifacts,context,registrationComment,registrationStatus,preparedRunId,now=Date.now()}){
 assertContext(context);assert.equal(comment.id,Number(registrationComment));assert.equal(comment.user.login,owner);
 const status=statuses.find(x=>x.context==='optimisation/jwt-feature-activation');
 assert(status&&status.state==='success'&&status.id===Number(registrationStatus),'WINDOW_WITHDRAWN_OR_NOT_REGISTERED');
 assert.equal(status.creator.login,owner);
 const digest=hash(comment.body);assert.equal(status.description,'optimisation-window-sha256:'+digest);
 assert.equal(status.target_url,'https://github.com/'+repo+'/pull/'+proof.pr+'#issuecomment-'+comment.id);
 const created=Date.parse(comment.created_at),updated=Date.parse(comment.updated_at||comment.created_at),issued=Date.parse(status.created_at);
 assert(Number.isFinite(created)&&updated<=issued&&created<=issued,'WINDOW_RECORD_EDITED');
 const lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 const read=prefix=>{const found=lines.filter(x=>x.startsWith(prefix));assert.equal(found.length,1,'WINDOW_FIELD_AMBIGUOUS');return found[0].slice(prefix.length);};
 const expires=read('expires: '),deadline=Date.parse(expires);
 assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(expires));
 assert(Number.isFinite(now)&&Number.isFinite(deadline)&&now>=created&&now<deadline&&deadline-created<=plan.window.maxMinutes*60000,'WINDOW_EXPIRED_OR_TOO_LONG');
 assert.equal(preparedRun.id,Number(preparedRunId));assert.equal(preparedRun.path,workflowPath);assert.equal(preparedRun.event,'push');assert.equal(preparedRun.head_branch,'studio_dev');assert.equal(preparedRun.head_sha,proof.mergeSha);
 assert.equal(preparedRun.status,'completed');assert.equal(preparedRun.conclusion,'success');assert.equal(preparedRun.actor.login,owner);
 assert(Date.parse(preparedRun.updated_at)<=created,'WINDOW_BEFORE_INDEPENDENT_PREPARATION_REVIEW');
 assert(preparedArtifacts&&preparedArtifacts.total_count===preparedArtifacts.artifacts.length);
 const a=preparedArtifacts.artifacts.filter(x=>x.name==='jwt-activation-public-'+preparedRun.id);assert.equal(a.length,1);assert.equal(a[0].expired,false);
 const preparedDigest=read('source-preparation-proof-sha256: ');assert(hex.test(preparedDigest));assert.equal(a[0].digest,'sha256:'+preparedDigest);
 const expected=windowLines({source:context.source,merge:proof.mergeSha,preparedRun:String(preparedRunId),preparedDigest,expires});
 assert.deepEqual(lines.filter(Boolean).sort(),expected.sort(),'EXACT_NEW_WINDOW_SCOPE_REQUIRED');
 return {window:plan.window.lease,commentId:comment.id,commentSHA256:digest,statusId:status.id,preparedRunId:Number(preparedRunId),preparedProofSHA256:preparedDigest,expires};
}
async function noCompeting(api,own){
 // One COMPLETE branch history covers every status and older-run reruns too.
 // Incomplete coverage fails; no narrow time filter/cache/pagination assumption.
 const r=await api('/repos/'+repo+'/actions/runs?branch=feature-preview&per_page=100');
 assert(r.total_count===r.workflow_runs.length&&r.total_count<=100,'FEATURE_HISTORY_INCOMPLETE');
 const active=new Set(['in_progress','queued','requested','waiting','pending']);
 assert(!r.workflow_runs.some(x=>String(x.id)!==String(own)&&active.has(x.status)),'COMPETING_FEATURE_RUN');
}
export async function assertOneAttempt(api,c){
 const all=await api('/repos/'+repo+'/actions/workflows/'+workflowPath.split('/').at(-1)+'/runs?event=workflow_dispatch&per_page=100');
 assert(all.total_count===all.workflow_runs.length&&all.total_count<=100,'ATTEMPT_LIST_INCOMPLETE');
 assert.equal(all.workflow_runs.length,1,'ATTEMPT_SPENT_ACROSS_ALL_HEADS');
 const run=all.workflow_runs[0];assert.equal(String(run.id),String(c.runId));
 assert.equal(run.path,workflowPath);assert.equal(run.event,'workflow_dispatch');assert.equal(run.head_branch,'feature-preview');assert.equal(run.head_sha,c.source);
 assert.equal(run.run_attempt,1);assert.equal(run.status,'in_progress');assert.equal(run.actor.login,owner);assert.equal(run.repository.full_name,repo);assert.equal(run.head_repository.full_name,repo);
}
export async function assertPreparedSource(api,p){
 const c=await api('/repos/'+repo+'/compare/'+plan.featureBase+'...'+p.feature_sha);assertFeatureComparison(c,p);
 assert.deepEqual(c.files.map(x=>x.filename).sort(),plan.sourcePaths,'EXACT_ACTIVATION_SOURCE_REQUIRED');assert(c.files.every(x=>!x.previous_filename));
 // Exact delta plus immutable approved source SHA preserves all unlisted accepted blobs.

}
export async function activationApproval({api,mergeSha,prNumber,context,localGuard,registrationComment,registrationStatus,preparedRunId,resolveProof=resolveApproval}){
 assertContext(context);assert(sha.test(mergeSha));for(const n of [prNumber,registrationComment,registrationStatus,preparedRunId])assert(id.test(String(n))&&Number.isSafeInteger(Number(n)),'STRICT_REGISTRATION_ID');assert.equal(typeof localGuard,'function');await localGuard();
 const canonicalFiles=[];const proofAPI=async(path,options)=>{const value=await api(path,options);if(/\/pulls\/[0-9]+\/files\?/.test(path))canonicalFiles.push(...value.map(x=>x.filename));return value;};
 const proof=await resolveProof({repo,mergeSha,api:proofAPI});if(resolveProof===resolveApproval)assert.deepEqual(canonicalFiles.sort(),[workflowPath,'deployment/release-plan.json'].sort(),'EXACT_CANONICAL_CONTROL_FILES_REQUIRED');assertScope(proof,await api('/repos/'+repo+'/issues/comments/'+proof.commentId),{source:context.source,prNumber});
 await assertPreparedSource(api,proof.plan);
 const fresh=async()=>{
  assert.equal(hash(readFileSync(new URL('../../'+path,import.meta.url))),planSHA256);
  await localGuard();await freshApproval(proof,api);
  assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,context.source,'FEATURE_CHANGED');
  await assertOneAttempt(api,context);
  const [comment,statuses,preparedRun,preparedArtifacts]=await Promise.all([
   api('/repos/'+repo+'/issues/comments/'+registrationComment),
   api('/repos/'+repo+'/commits/'+context.source+'/statuses?per_page=100'),
   api('/repos/'+repo+'/actions/runs/'+preparedRunId),
   api('/repos/'+repo+'/actions/runs/'+preparedRunId+'/artifacts?per_page=100')
  ]);
  const window=assertWindow({proof,comment,statuses,preparedRun,preparedArtifacts,context,registrationComment,registrationStatus,preparedRunId});
  await noCompeting(api,context.runId);await localGuard();assert(Date.now()<Date.parse(window.expires),'WINDOW_EXPIRED_AT_FINAL_GATE');return window;
 };
 const window=await fresh();return {proof,window,fresh};
}
export async function preparePublicSource({api,mergeSha,expectedCandidate,localGuard,resolveProof=resolveApproval}){
 const canonicalFiles=[];const proofAPI=async(path,options)=>{const value=await api(path,options);if(/\/pulls\/[0-9]+\/files\?/.test(path))canonicalFiles.push(...value.map(x=>x.filename));return value;};
 const proof=await resolveProof({repo,mergeSha,api:proofAPI});if(resolveProof===resolveApproval)assert.deepEqual(canonicalFiles.sort(),[workflowPath,'deployment/release-plan.json'].sort(),'EXACT_CANONICAL_CONTROL_FILES_REQUIRED');assertScope(proof,await api('/repos/'+repo+'/issues/comments/'+proof.commentId));
 assert.equal(proof.plan.feature_sha,expectedCandidate);await localGuard();await assertPreparedSource(api,proof.plan);
 const history=await api('/repos/'+repo+'/actions/workflows/'+workflowPath.split('/').at(-1)+'/runs?event=workflow_dispatch&per_page=100');
 assert.equal(history.total_count,0);assert.deepEqual(history.workflow_runs,[],'NEW_WINDOW_ALREADY_ATTEMPTED');
 const current=(await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha;assert([plan.featureBase,expectedCandidate].includes(current));
 await freshApproval(proof,api);await noCompeting(api,null);await localGuard();assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,current);
 if(current!==expectedCandidate)await api('/repos/'+repo+'/git/refs/heads/feature-preview',{method:'PATCH',body:{sha:expectedCandidate,force:false}});
 return {schema:1,state:'SOURCE_PREPARED_ONLY_NOT_EXECUTION_AUTHORITY',featureSource:expectedCandidate,planSHA256,canonicalMerge:mergeSha,dispatched:false,cloudflareCalls:0};
}
export function contextDirectory(temp,c,{create=false}={}){
 assertContext(c);assert(typeof temp==='string'&&isAbsolute(temp));assert.equal(realpathSync(temp),resolve(temp));
 const p=resolve(temp,'jwt-activation-'+c.runId+'-1');assert.equal(resolve(p,'..'),resolve(temp));
 if(create)mkdirSync(p,{recursive:false,mode:0o700});
 const s=lstatSync(p);assert(s.isDirectory()&&!s.isSymbolicLink());assert.equal(realpathSync(p),p);return p;
}
export function privateJSONFile(dir,name,{value,maximum=131072,exclusive=false}={}){
 assert.equal(realpathSync(dir),resolve(dir));assert(!lstatSync(dir).isSymbolicLink());
 assert(/^[a-z0-9-]+\.json$/.test(name));const p=resolve(dir,name);assert.equal(resolve(p,'..'),dir);
 if(value!==undefined){
  const text=JSON.stringify(value,null,2)+'\n';assert(Buffer.byteLength(text)<=maximum);
  let existing;try{existing=lstatSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing)assert(existing.isFile()&&!existing.isSymbolicLink()&&existing.nlink===1);
  if(exclusive){assert(!existing);writeFileSync(p,text,{flag:'wx',mode:0o600});}
  else{const pending=resolve(dir,'.'+name+'.new');writeFileSync(pending,text,{flag:'wx',mode:0o600});renameSync(pending,p);}
 }
 let fd;
 try{
  const link=lstatSync(p);assert(link.isFile()&&!link.isSymbolicLink()&&link.nlink===1);
  fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW);const s=fstatSync(fd);
  assert(s.isFile()&&s.nlink===1&&s.dev===link.dev&&s.ino===link.ino&&s.size<=maximum);
  const bytes=Buffer.alloc(maximum+1);let size=0;
  while(size<bytes.length){const count=readSync(fd,bytes,size,bytes.length-size,null);if(!count)break;size+=count;}
  assert(size===s.size&&size<=maximum);const after=fstatSync(fd),now=lstatSync(p);
  assert.equal(after.size,s.size);assert.equal(after.mtimeMs,s.mtimeMs);assert.equal(after.ctimeMs,s.ctimeMs);
  assert(!now.isSymbolicLink()&&now.nlink===1&&now.dev===s.dev&&now.ino===s.ino);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
 }finally{if(fd!==undefined)closeSync(fd);}
}
export function executionIdentity({c,approved}){
 const p=approved.proof,w=approved.window;
 return {schema:1,repository:repo,source:c.source,runId:String(c.runId),attempt:1,workflow:workflowPath,request:plan.request,planSHA256,executor:plan.executor,approval:{pr:p.pr,merge:p.mergeSha,head:p.headSha,statusId:p.approvalStatusId,commentSHA256:p.commentHash},window:w,budget:plan.budgets,baseline:plan.baseline,activationIntent:true};
}
export function assertIdentityShape(v,c){
 exact(v,['schema','repository','source','runId','attempt','workflow','request','planSHA256','executor','approval','window','budget','baseline','activationIntent']);
 assert.equal(v.schema,1);assert.equal(v.repository,repo);assert.equal(v.source,c.source);assert(sha.test(v.source));assert.equal(v.runId,String(c.runId));assert(id.test(v.runId));assert.equal(v.attempt,1);
 assert.equal(v.workflow,workflowPath);assert.equal(v.request,plan.request);assert.equal(v.planSHA256,planSHA256);assert.deepEqual(v.executor,plan.executor);assert.deepEqual(v.budget,plan.budgets);assert.deepEqual(v.baseline,plan.baseline);assert.equal(v.activationIntent,true);
 exact(v.approval,['pr','merge','head','statusId','commentSHA256']);
 for(const k of ['pr','statusId'])assert(Number.isSafeInteger(v.approval[k])&&v.approval[k]>0);
 for(const k of ['merge','head'])assert(sha.test(v.approval[k]));assert(hex.test(v.approval.commentSHA256));
 exact(v.window,['window','commentId','commentSHA256','statusId','preparedRunId','preparedProofSHA256','expires']);
 assert.equal(v.window.window,plan.window.lease);
 for(const k of ['commentId','statusId','preparedRunId'])assert(Number.isSafeInteger(v.window[k])&&v.window[k]>0);
 for(const k of ['commentSHA256','preparedProofSHA256'])assert(hex.test(v.window[k]));
 assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.window.expires));assert(Number.isFinite(Date.parse(v.window.expires)));return v;
}
export function assertIdentity(value,expected){assert.deepEqual(value,expected,'PRIVATE_EXECUTION_IDENTITY_CHANGED');return value;}

export function cliContext(){
 return {repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,source:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF};
}
export function localSourceGuard(source,{hostingSHA256,identityCheck=()=>{}}={}){
 const env={...process.env};for(const k of ['CLOUDFLARE_API_TOKEN','FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete env[k];
 const git=(...args)=>execLocalGit(args,env);
 return async()=>{
  assert.equal(git('rev-parse','HEAD'),source);identityCheck();
  const changed=git('status','--porcelain','--untracked-files=all');
  if(hostingSHA256){assert.equal(changed,'M config/hosting.json');assert.equal(hash(readFileSync('config/hosting.json')),hostingSHA256);}
  else assert.equal(changed,'','SOURCE_CHANGED');
 };
}
function execLocalGit(args,env){
 return execFileSync('git',args,{cwd:process.cwd(),env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);
 const mode=process.argv[2];assert.equal(process.env.ACTIVATION_PLAN_SHA256,planSHA256);const client=activationGitHub({token:process.env.GITHUB_TOKEN,maximum:mode==='promote'?100:40,allowPromotion:mode==='promote'});await client.probe();const api=client.api;
 if(mode==='promote'){
  assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/studio_dev');
  const expectedCandidate=process.env.SOURCE_CANDIDATE;assert(sha.test(expectedCandidate));
  const r=await preparePublicSource({api,mergeSha:process.env.APPROVAL_MERGE_SHA,expectedCandidate,localGuard:localSourceGuard(expectedCandidate)});
  const out=process.env.SOURCE_PREPARATION_OUTPUT;assert(out&&isAbsolute(out));writeFileSync(out,JSON.stringify(r,null,2)+'\n');return;
 }
 assert.equal(mode,'validate');
 await activationApproval({api,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,context:cliContext(),localGuard:localSourceGuard(process.env.GITHUB_SHA),registrationComment:process.env.WINDOW_COMMENT_ID,registrationStatus:process.env.WINDOW_STATUS_ID,preparedRunId:process.env.SOURCE_PREPARATION_RUN_ID});
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await main();}catch{console.error('JWT_FEATURE_ACTIVATION_GATE_STOPPED');process.exitCode=1;}}
