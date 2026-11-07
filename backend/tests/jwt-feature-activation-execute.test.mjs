import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {activationGitHub} from '../tools/jwt-feature-activation-github.mjs';
import {activationApproval,privateJSONFile,contextDirectory,plan} from '../tools/jwt-feature-activation-approved.mjs';
import {executeActivation,publishActivation} from '../tools/jwt-feature-activation-execute.mjs';
import {fixture} from './fixtures/jwt-feature-activation-approval-fixture.mjs';
import {activationMock} from './fixtures/jwt-feature-activation-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('NO_HOSTED_CALL');};
const manifest=JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-activation-input-manifest.json',import.meta.url)));
const traces=[];
async function scenario({fault,quota=1000}={}){
 const g=fixture(),h=activationMock({fault:['auth-8','active-ack-loss','recovery-ack-loss'].includes(fault)?fault:undefined,source:g.context.source});
 const runnerTemp=mkdtempSync(resolve(process.env.RUNNER_TEMP,'activation-executor-')),server={requests:0,quota,lose:false};let dir,secretReads=0;
 const fetchGitHub=async(url,options={})=>{
  server.requests++;const u=new URL(url),path=u.pathname+u.search;
  const value=path==='/rate_limit'||path.includes('/actions/artifacts/')?{}:await g.api(path,options.method==='GET'?{}:{method:options.method,body:JSON.parse(options.body)});
  return Response.json(value,{headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':String(server.lose?1:Math.max(0,server.quota-server.requests))}});
 };
 // Exact normal workflow has two pre-operation validation entry processes.
 for(let i=0;i<2;i++){
  const c=activationGitHub({token:'SYNTHETIC_GH',fetcher:fetchGitHub,maximum:40});await c.probe();
  const args=g.approvalArgs();delete args.resolveProof;await activationApproval({...args,api:c.api});
  assert.equal(c.stats.restRequests,22);
 }
 const client=activationGitHub({token:'SYNTHETIC_GH',fetcher:fetchGitHub,maximum:680});await client.probe();
 client.archive=async({id})=>{await client.api('/repos/MaktabForlife/Academy/actions/artifacts/'+id);await client.api('/repos/MaktabForlife/Academy/actions/artifacts/'+id+'/zip');client.stats.signedArtifactGETs++;return {bytes:Buffer.alloc(0)};};
 for(const [name,a]of Object.entries(h.artifacts))a.artifactSHA256=name==='feature_worker'?manifest.active.artifactSHA256:manifest.paused.artifactSHA256;
 const args={guardFactory:()=>async()=>{},client,context:g.context,runnerTemp,mergeSha:g.proof.mergeSha,prNumber:101,registrationComment:8,registrationStatus:12,preparedRunId:1000,
  approval:options=>activationApproval({...options,localGuard:async()=>{}}),
  baselineReader:async c=>{await c.archive({id:plan.baseline.artifact});return h.f;},
  compile:async options=>{dir=options.directory;return {manifest:{...structuredClone(manifest),recipeSource:g.context.source},configs:{before:h.profiles.before,active:h.profiles.active,paused:h.profiles.paused},artifacts:h.artifacts,assets:h.assets,hostingSHA256:manifest.hostingVariantSHA256,restore(){}};},
  getSecrets:()=>{secretReads++;return {token:'SYNTHETIC_CF_CANARY',pin:'2468'};},
  invokeCLI:(a,c)=>h.runWrangler(a,c),
  fetcher:async(url,options)=>{
   const response=await h.fetcher(url,options);
   if(fault==='withdraw-after-active'&&url.endsWith('/__jwt_feature_release'))g.windowStatus.state='failure';
   if(fault==='quota-after-active'&&url.endsWith('/__jwt_feature_release'))server.lose=true;
   if(fault==='final-capture-failure'&&h.state.provider===22)writeFileSync(resolve(dir,'.checkpoint.json.new'),'BLOCKED');
   return response;
  }};
 let value,error;
 try{value=await executeActivation(args);}catch(e){error=e;}
 return {g,h,client,runnerTemp,server,dir,value,error,get secretReads(){return secretReads;}};
}
test('complete ACTIVE caller traces all authority checks and exact620 total/576 operation REST invocations',async()=>{
 const s=await scenario();if(s.error)throw s.error;assert.equal(s.value.completion,'ACTIVE');
 assert.equal(s.server.requests,620);assert.equal(s.client.stats.restRequests,576);assert.deepEqual(s.value.actual,{provider:22,cli:1,public:3,auth:8,paused:0});
 const r=publishActivation({context:s.g.context,runnerTemp:s.runnerTemp,executorOutcome:'success'});assert.equal(r.activationAccepted,true);assert.equal(r.runtimeState,'ACTIVE_OBSERVED_AFTER_FIXED_SMOKE');assert.equal(r.runtimeActivated,true);
 traces.push({branch:'SUCCESS',githubRESTTotal:s.server.requests,githubOperationREST:s.client.stats.restRequests,provider:s.value.actual,entryProcesses:2,entryRESTEach:22,signedObjectGETs:2});
 for(const value of ['2468','SYNTHETIC_CF_CANARY','SYNTHETIC_ACCESS','SYNTHETIC_REFRESH','uaa-session:SYNTHETIC'])assert(!JSON.stringify(r).includes(value));
});
test('latest supported auth failure traces700 total/656 operation REST and known PAUSED recovery, not accepted activation',async()=>{
 const s=await scenario({fault:'auth-8'});if(s.error)throw s.error;assert.equal(s.value.completion,'RECOVERED');assert.equal(s.server.requests,700);assert.equal(s.client.stats.restRequests,656);
 assert.deepEqual(s.value.actual,{provider:24,cli:2,public:3,auth:8,paused:1});
 const r=publishActivation({context:s.g.context,runnerTemp:s.runnerTemp,executorOutcome:'success'});assert.equal(r.activationAccepted,false);assert.equal(r.runtimeState,'PAUSED_OBSERVED_AFTER_OWNED_RECOVERY');assert.equal(r.runtimeActivated,false);
 traces.push({branch:'LATEST_ELIGIBLE_RECOVERY',githubRESTTotal:s.server.requests,githubOperationREST:s.client.stats.restRequests,provider:s.value.actual,entryProcesses:2,entryRESTEach:22,signedObjectGETs:2});
});
test('quota-unavailable admission uses no CF/PIN getter or provider/Worker operation',async()=>{
 const s=await scenario({quota:100});assert(s.error);assert.equal(s.secretReads,0);assert.deepEqual([s.h.state.provider,s.h.state.cli,s.h.state.auth,s.h.state.public,s.h.state.paused],[0,0,0,0,0]);
 const r=publishActivation({context:s.g.context,runnerTemp:s.runnerTemp,executorOutcome:'failure'});assert.equal(r.runtimeState,'UNKNOWN');assert.equal(r.runtimeActivated,null);assert.equal(r.actual,null);
});
for(const fault of ['active-ack-loss','withdraw-after-active','quota-after-active','final-capture-failure','recovery-ack-loss'])test('possibly ACTIVE '+fault+' never publishes false PAUSED/activated:false runtime',async()=>{
 const s=await scenario({fault});assert(s.error);assert.equal(s.h.state.cli,fault==='recovery-ack-loss'?2:1);assert.equal(s.h.state.paused,0);
 const r=publishActivation({context:s.g.context,runnerTemp:s.runnerTemp,executorOutcome:'failure'});assert.equal(r.state,'UNKNOWN_MISSING_PARTIAL_OR_FAILED_CAPTURE');assert.equal(r.runtimeState,'UNKNOWN');assert.equal(r.runtimeActivated,null);assert.equal(r.activationAccepted,false);assert.equal(r.actual,null);assert.equal(r.reserved,null);assert.equal(r.remainingAllowanceReusable,false);assert(!Object.hasOwn(r,'activated'));
});
for(const kind of ['github-extra','ack-extra','failed-step','wrong-context'])test('publisher '+kind+' refuses incomplete/arbitrary private data and reports UNKNOWN runtime',async()=>{
 const s=await scenario();if(s.error)throw s.error;
 const dir=contextDirectory(s.runnerTemp,s.g.context),v=privateJSONFile(dir,'checkpoint.json');
 if(kind==='github-extra')v.github.secret='PRIVATE_CANARY';
 if(kind==='ack-extra')v.core.lastAcknowledgedUploads.feature_worker.secret='PRIVATE_CANARY';
 if(kind.endsWith('extra'))privateJSONFile(dir,'checkpoint.json',{value:v});
 const r=publishActivation({context:kind==='wrong-context'?{...s.g.context,source:'f'.repeat(40)}:s.g.context,runnerTemp:s.runnerTemp,executorOutcome:kind==='failed-step'?'failure':'success'});
 assert.equal(r.runtimeState,'UNKNOWN');assert.equal(r.runtimeActivated,null);assert.equal(r.actual,null);assert(!JSON.stringify(r).includes('PRIVATE_CANARY'));
});
test('saved exact valid-path quota traces and proposed ceilings are finite without enterprise allowance',()=>{
 assert.equal(traces.length,2);assert(traces.every(x=>x.githubRESTTotal<=724&&x.githubOperationREST<=680));
 writeFileSync(resolve(process.cwd(),'activation-request-traces.json'),JSON.stringify({schema:1,traces,privateOperationCeiling:680,wholeThreeProcessCeiling:724,usualGITHUB_TOKENRepositoryLimit:1000,admissionMargin:20,notAtomicReservation:true,sharedUsageAndSecondaryLimitsCanStillStop:true,noWaitRetryOrCredentialFallback:true},null,2)+'\n');
});
