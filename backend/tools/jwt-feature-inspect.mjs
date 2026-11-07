// Recovery diagnosis only: exactly four metadata GET attempts, never hosted writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveApproval,freshApproval,githubClient,assertFeatureComparison} from '../../tools/approved-deployment.mjs';
const account='c9a3e355b3d7a795880b1d36a1dbe123';
export const originalSource='c660e3813908127561ad454ab503f9f66fa6d700',originalOwner='42233937167-1';
export const request='jwt-feature-readonly-inspection-20261106a';
const repo='MaktabForlife/Academy',names=['feature_worker','academy-feature-split-coordinator'];
const acknowledged={feature_worker:'7607f5da-7f06-46e7-8ab7-3a872c6825b6','academy-feature-split-coordinator':'4704b2cc-c111-4e5b-9f8b-887bd38db650'};
export async function inspectionApproval({api,mergeSha,prNumber,featureSha,requirePromoted=true}){
 const proof=await resolveApproval({repo,mergeSha,api}),p=proof.plan;
 assert.equal(p.request,request);assert.equal(p.kind,'component');assert.equal(p.target,'feature');assert.equal(p.contains_jwt,true);
 assert.equal(p.feature_base_sha,originalSource);if(featureSha)assert.equal(p.feature_sha,featureSha);if(prNumber)assert.equal(proof.pr,Number(prNumber));
 const comment=await api('/repos/'+repo+'/issues/comments/'+proof.commentId),lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 for(const line of ['feature-inspection-source: '+p.feature_sha,'inspection-cloudflare-gets: 4','inspection-hosted-writes: none'])assert.equal(lines.filter(x=>x===line).length,1,'EXPLICIT_READ_ONLY_SCOPE_REQUIRED');
 for(const prefix of ['feature-inspection-source:','inspection-cloudflare-gets:','inspection-hosted-writes:'])assert.equal(lines.filter(x=>x.startsWith(prefix)).length,1,'AMBIGUOUS_SCOPE');
 const fresh=async()=>{await freshApproval(proof,api);if(requirePromoted)assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,p.feature_sha);};
 await fresh();return {proof,fresh};
}
export async function promoteInspection({api,mergeSha}){
 const a=await inspectionApproval({api,mergeSha,requirePromoted:false}),p=a.proof.plan;
 const path='/repos/'+repo+'/git/ref/heads/feature-preview',current=(await api(path)).object.sha;
 assert([p.feature_base_sha,p.feature_sha].includes(current),'FEATURE_CHANGED');
 const delta=await api('/repos/'+repo+'/compare/'+p.feature_base_sha+'...'+p.feature_sha);assertFeatureComparison(delta,p);
 assert.deepEqual(delta.files.map(x=>x.filename).sort(),['.github/workflows/feature-jwt-inspect.yml','backend/tests/jwt-feature-inspect.test.mjs','backend/tools/jwt-feature-inspect.mjs'].sort(),'INSPECTION_ONLY_SOURCE_REQUIRED');
 await a.fresh();assert.equal((await api(path)).object.sha,current);
 if(current!==p.feature_sha)await api('/repos/'+repo+'/git/refs/heads/feature-preview',{method:'PATCH',body:{sha:p.feature_sha,force:false}});
 return {sourcePrepared:true,featureSha:p.feature_sha,cloudflareCalls:0,hostedWrites:0};
}
const publicRules={
 ENVIRONMENT:/^feature$/,ACADEMY_DEPLOYMENT_KIND:/^ISOLATED_PREVIEW$/,ACADEMY_D1_MODE:/^(PAUSED|ACTIVE)$/,
 ACADEMY_D1_RUN_ID:/^[a-f0-9]{64}$/,JWT_V110_STORAGE_PROFILE:/^FRESH_PAIR_V1$/,JWT_V110_NATIVE_RUN_ID:/^[a-f0-9]{64}$/,
 JWT_V110_OBJECT_NAMESPACE:/^jwt-feature-v110\/[A-Za-z0-9_-]+\/$/,JWT_FEATURE_SETUP_MODE:/^[A-Z_]{1,40}$/,
 JWT_FEATURE_SETUP_SOURCE:/^[a-f0-9]{40}$/,JWT_FEATURE_SETUP_MANIFEST:/^[a-f0-9]{64}$/,
 JWT_FEATURE_SETUP_ISSUED_AT:/^[0-9]{10}$/,JWT_FEATURE_SETUP_EXPIRES_AT:/^[0-9]{10}$/,
 JWT_FEATURE_INSTALL_SOURCE:/^[a-f0-9]{40}$/,JWT_FEATURE_INSTALL_OWNER:/^[0-9]{1,20}-[0-9]{1,5}$/,
 JWT_V110_MASTER:/^[01]$/,JWT_V110_REFRESH:/^[01]$/,JWT_V110_BROWSER:/^[01]$/,JWT_V110_NATIVE_COOKIE:/^[01]$/,
 RELEASE_VERSION:/^[0-9]{1,3}\.[0-9]{1,3}$/
};
export function publicSettings(raw){
 const bindings=(raw.bindings||[]).map(b=>{
  const base={name:b.name,type:b.type};
  if(b.type==='plain_text'){
   const allowed=Object.hasOwn(publicRules,b.name)&&typeof b.text==='string'&&publicRules[b.name].test(b.text);
   return {...base,publicValueAllowed:allowed,...(allowed?{text:b.text}:{})};
  }
  if(b.type==='d1')return {...base,id:b.id};
  if(b.type==='r2_bucket')return {...base,bucket_name:b.bucket_name};
  if(b.type==='durable_object_namespace')return {...base,class_name:b.class_name,namespace_id:b.namespace_id,...(b.script_name?{script_name:b.script_name}:{})};
  if(b.type==='ratelimit')return {...base,namespace_id:b.namespace_id,simple:{limit:b.simple?.limit,period:b.simple?.period}};
  return base; // Secret values and unknown binding fields are never retained.
 });
 const assets=raw.assets?.config;
 const run=assets?.run_worker_first;
 const assetShape=assets?{configKeys:Object.keys(assets),runWorkerFirstType:Array.isArray(run)?'array':typeof run,
  ...(typeof run==='boolean'?{run_worker_first:run}:{}),
  ...(Array.isArray(run)?{run_worker_first:run.map(x=>typeof x==='string'&&/^\/[A-Za-z0-9_*/.?!,-]{0,200}$/.test(x)?x:'REDACTED_UNEXPECTED_PATH')}:{}),
  not_found_handling:['none',undefined].includes(assets.not_found_handling)?assets.not_found_handling:'UNRECOGNISED',
  base_path:['/',undefined].includes(assets.base_path)?assets.base_path:'UNRECOGNISED',
  html_handling:['auto-trailing-slash',undefined].includes(assets.html_handling)?assets.html_handling:'UNRECOGNISED'}:null;
 return {compatibility_date:raw.compatibility_date,compatibility_flags:raw.compatibility_flags,
  observabilityEnabled:raw.observability?.enabled??false,tailConsumerCount:Array.isArray(raw.tail_consumers)?raw.tail_consumers.length:0,bindings,assetShape};
}
export async function inspectMetadata({token,fetcher=fetch,fresh=async()=>{}}){
 assert(token);const observed={};let attempts=0;
 try{for(const name of names){
  const pair={};
  for(const kind of ['deployments','settings']){
   await fresh();attempts++;assert(attempts<=4);
   let r;try{r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/'+kind,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}});}catch{throw Object.assign(Error('READ_ONLY_METADATA_TRANSPORT_UNKNOWN'),{attempts});}
   if(!r.ok)throw Object.assign(Error('METADATA_HTTP_FAILURE'),{attempts});
   let b;try{b=await r.json();}catch{throw Object.assign(Error('METADATA_PARSE_FAILURE'),{attempts});}
   if(b.success!==true)throw Object.assign(Error('METADATA_PROVIDER_FAILURE'),{attempts});
   pair[kind]=b.result;
  }
  const latest=pair.deployments.deployments?.[0]||(Array.isArray(pair.deployments)?pair.deployments[0]:null);
  const versions=(latest?.versions||[]).map(v=>({version_id:/^[a-f0-9-]{36}$/.test(v.version_id)?v.version_id:'UNRECOGNISED',percentage:v.percentage}));
  const single=versions.length===1&&[100,undefined].includes(versions[0].percentage)&&versions[0].version_id!=='UNRECOGNISED'?versions[0].version_id:null;
  const safe=publicSettings(pair.settings),vars=Object.fromEntries(safe.bindings.filter(b=>b.type==='plain_text'&&b.publicValueAllowed).map(b=>[b.name,b.text]));
  observed[name]={currentVersion:single,versions,lastAcknowledgedVersion:acknowledged[name],sameAsLastAcknowledged:single===acknowledged[name],
   sourceMarkerMatches:vars.JWT_FEATURE_INSTALL_SOURCE===originalSource,ownerMarkerMatches:vars.JWT_FEATURE_INSTALL_OWNER===originalOwner,
   settings:safe};

 }
 }catch(e){throw Object.assign(Error('READ_ONLY_METADATA_STOPPED'),{attempts,observed});}
 return {schema:1,state:'READ_ONLY_METADATA_CAPTURED_NO_RECOVERY_AUTHORITY',originalSource,originalOwner,observed,explicitCloudflareGetAttempts:attempts,priorInstallerExplicitGets:36,cumulativeExplicitGetAttempts:36+attempts,hardCombinedGetLimit:60,countsAreFetchAttempts:true,hostedWrites:0,workerHTTP:0,d1Calls:0,secretValueReads:0,codeContentReads:0,activated:false,cleanupVerified:false};
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);
 const api=githubClient(process.env.GITHUB_TOKEN),mode=process.argv[2];
 if(mode==='promote'){
  assert.equal(process.env.GITHUB_REF,'refs/heads/studio_dev');
  const p=JSON.parse(readFileSync('deployment/release-plan.json','utf8'));
  if(p.request!==request){console.log(JSON.stringify({inspectionSource:'NOT_SELECTED',cloudflareCalls:0}));return;}
  console.log(JSON.stringify(await promoteInspection({api,mergeSha:process.env.GITHUB_SHA})));return;
 }
 assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const a=await inspectionApproval({api,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,featureSha:process.env.GITHUB_SHA});
 assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','INSPECTION_MUST_NOT_BE_RERUN');
 const prior=await api('/repos/'+repo+'/actions/workflows/feature-jwt-inspect.yml/runs?branch=feature-preview&event=workflow_dispatch&per_page=100');
 assert(!prior.workflow_runs.some(r=>r.head_sha===process.env.GITHUB_SHA&&String(r.id)!==process.env.GITHUB_RUN_ID),'INSPECTION_ALREADY_ATTEMPTED');
 if(mode==='validate')return;
 assert.equal(mode,'inspect');const out=resolve(process.env.RUNNER_TEMP,'jwt-inspect-evidence');mkdirSync(out,{recursive:true});
 try{
  const r=await inspectMetadata({token:process.env.CLOUDFLARE_API_TOKEN,fresh:a.fresh});writeFileSync(resolve(out,'metadata.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({state:r.state,explicitGetAttempts:r.explicitCloudflareGetAttempts,hostedWrites:0}));
 }catch(e){writeFileSync(resolve(out,'failure.json'),JSON.stringify({state:'METADATA_INSPECTION_STOPPED',attempts:e.attempts??null,hostedWrites:0,partialObserved:e.observed||{},code:'READ_ONLY_FAILURE',noRetry:true})+'\n');throw Error('READ_ONLY_INSPECTION_STOPPED');}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await main();}catch{console.error('READ_ONLY_INSPECTION_STOPPED');process.exitCode=1;}}
