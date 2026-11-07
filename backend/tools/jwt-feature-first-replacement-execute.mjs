// Private one-attempt PAUSED wrapper proposal; no execution authority in source.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {githubClient} from '../../tools/approved-deployment.mjs';
import {plan,planSHA256,firstReplacementApproval,contextDirectory,privateJSONFile,executionIdentity,assertIdentity,cliContext,localSourceGuard,assertContext,assertIdentityShape} from './jwt-feature-first-replacement-approved.mjs';
import {compileFirstReplacement} from './jwt-feature-first-replacement-build.mjs';
import {profilesForFirstReplacement,firstReplacementInputs} from './jwt-feature-first-replacement-inputs.mjs';
import {createFeatureReleaseOps} from './jwt-feature-release-transport.mjs';
import {resumeInterruptedFeature} from './jwt-feature-release-controller.mjs';
import {canonical,digest} from './jwt-feature-upload-artifact.mjs';
const repo='MaktabForlife/Academy',main='feature_worker',coordinator='academy-feature-split-coordinator';
const account='c9a3e355b3d7a795880b1d36a1dbe123',origin='https://feature_worker.maktab4life.workers.dev';
const json=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
assert.equal(digest(readFileSync(new URL('../../'+plan.inputManifest,import.meta.url))),plan.inputManifestFileSHA256);
assert.equal(digest(readFileSync(new URL('../../'+plan.policy,import.meta.url))),plan.policyFileSHA256);
const expectedManifest=json(plan.inputManifest),policy=json(plan.policy),policySHA256=digest(canonical(policy));assert.equal(policySHA256,plan.policyCanonicalSHA256);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/,hex=/^[a-f0-9]{64}$/;
export function assertBuiltManifest(m){
 assert.match(m.recipeSource,/^[a-f0-9]{40}$/);
 const without=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='recipeSource'));
 assert.deepEqual(without(m),without(expectedManifest),'FROZEN_CODE_PUBLIC_OR_CONFIG_CHANGED');
}
export function fixedNetworkSequence(){
 const cf=(name,kind)=>({kind:'provider',url:'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/'+kind});
 const fence=()=>[cf(main,'deployments'),cf(coordinator,'deployments')];
 const full=n=>['settings','deployments','subdomain','schedules'].map(k=>cf(n,k));
 return [...full(main),...full(coordinator),...fence(),...fence(),cf(main,'settings'),cf(main,'deployments'),...fence(),{kind:'paused',url:origin+'/__jwt_feature_release'},...fence(),...full(main),...full(coordinator)];
}
export function assertCoreForPaused(c,source){
 const keys=['schema','state','activated','recovery','source','origin','explicitCloudflareGets','wranglerAttempts','publicHTTPAttempts','smokeHTTPAttempts','pauseHTTPAttempts','secretChanges','sqlByDeployer','namespaceChanges','pagesCalls','wranglerInternalRequests','interruptedReference','installationVerified','referenceVersions','lastAcknowledgedUploads','ownedVersions','lastObservedVersions','writeOutcomeUnknown','mode','remoteCodeAttested','privateKeyAttested','metadataAtomic','hostedD1Rows','localEightRequestProjection','projectionIsNotHostedBilling'];
 assert.deepEqual(Object.keys(c).sort(),keys.sort());assert.equal(c.schema,1);
 assert(['PREFLIGHT_VERIFIED','PAUSED_CODE_REPLACEMENT','PAUSED_CODE_RESUME_VERIFIED','STOPPED'].includes(c.state));
 assert.equal(c.source,source);assert.equal(c.origin,origin);assert.equal(c.activated,false);assert([null,'NOT_VERIFIED_NO_BLIND_OVERWRITE'].includes(c.recovery));
 for(const [k,max]of [['explicitCloudflareGets',26],['wranglerAttempts',1],['pauseHTTPAttempts',1]])assert(Number.isInteger(c[k])&&c[k]>=0&&c[k]<=max);
 for(const k of ['publicHTTPAttempts','smokeHTTPAttempts','secretChanges','sqlByDeployer','namespaceChanges','pagesCalls'])assert.equal(c[k],0);
 assert.equal(c.wranglerInternalRequests,'separate-unmeasured');assert.equal(c.interruptedReference,true);assert.equal(c.installationVerified,false);
 assert.deepEqual(c.referenceVersions,policy.referenceVersions);
 assert(Object.keys(c.lastAcknowledgedUploads).every(k=>k===main));
 for(const a of Object.values(c.lastAcknowledgedUploads)){
  assert.deepEqual(Object.keys(a).sort(),['schema','target','versionId','source','configSHA256','wranglerVersion','kind','artifactSHA256'].sort());
  assert.equal(a.schema,1);assert.equal(a.target,main);assert(uuid.test(a.versionId));assert.equal(a.source,source);assert(hex.test(a.configSHA256));
  assert.equal(a.wranglerVersion,'4.136.3');assert.equal(a.kind,'PINNED_CLI_DEPLOY_ACK');assert.equal(a.artifactSHA256,expectedManifest.worker.artifactSHA256);
 }
 assert(Object.keys(c.ownedVersions).every(k=>k===main));
 if(c.ownedVersions[main])assert.equal(c.ownedVersions[main],c.lastAcknowledgedUploads[main]?.versionId);
 for(const [n,v]of Object.entries(c.lastObservedVersions)){assert([main,coordinator].includes(n));assert(uuid.test(v));}
 for(const k of ['remoteCodeAttested','privateKeyAttested','metadataAtomic'])assert.equal(c[k],false);
 assert.equal(c.hostedD1Rows,'unmeasured');
 if(c.state==='PAUSED_CODE_RESUME_VERIFIED'){
  assert.equal(c.explicitCloudflareGets,26);assert.equal(c.wranglerAttempts,1);assert.equal(c.pauseHTTPAttempts,1);
  assert(c.ownedVersions[main]);assert.equal(c.mode,'PAUSED');assert.equal(c.writeOutcomeUnknown,false);
 }
 return c;
}
function assertSummary(s,source){
 assert.deepEqual(Object.keys(s).sort(),['state','recovery','writeOutcomeUnknown','referenceVersions','lastAcknowledgedUploads','ownedVersions','lastObservedVersions'].sort());
 assert.equal(s.state,'PAUSED_CODE_RESUME_VERIFIED');assert.equal(s.recovery,null);assert.equal(s.writeOutcomeUnknown,false);assert.deepEqual(s.referenceVersions,policy.referenceVersions);
 assert.deepEqual(Object.keys(s.lastAcknowledgedUploads),[main]);assert.deepEqual(Object.keys(s.ownedVersions),[main]);
 const a=s.lastAcknowledgedUploads[main];
 assert.deepEqual(Object.keys(a).sort(),['schema','target','versionId','source','configSHA256','wranglerVersion','kind','artifactSHA256'].sort());
 assert.equal(a.schema,1);assert.equal(a.target,main);assert(uuid.test(a.versionId));assert.equal(a.source,source);assert(hex.test(a.configSHA256));
 assert.equal(a.wranglerVersion,'4.136.3');assert.equal(a.kind,'PINNED_CLI_DEPLOY_ACK');assert.equal(a.artifactSHA256,expectedManifest.worker.artifactSHA256);
 assert.equal(s.ownedVersions[main],a.versionId);
 assert(Object.keys(s.lastObservedVersions).every(k=>[main,coordinator].includes(k)));
 for(const v of Object.values(s.lastObservedVersions))assert(uuid.test(v));
 assert.equal(s.lastObservedVersions[main],a.versionId);assert.equal(s.lastObservedVersions[coordinator],policy.referenceVersions[coordinator]);return s;
}
function checkpoint({c,identity,core=null,actual}){
 if(core)assertCoreForPaused(core,c.source);
 return {schema:1,state:core?.state==='PAUSED_CODE_RESUME_VERIFIED'?'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION':core?'CHECKPOINT_NOT_RELEASE_CLEARANCE':'REGISTERED_NO_HOSTED_CALLS',
  run:{source:c.source,runId:String(c.runId),attempt:1},identity,planSHA256,policySHA256,artifactSHA256:expectedManifest.worker.artifactSHA256,
  actual:{...actual},reserved:core?{metadataGETs:core.explicitCloudflareGets,cli:core.wranglerAttempts,pausedGETs:core.pauseHTTPAttempts}:null,
  core:core?{state:core.state,recovery:core.recovery,writeOutcomeUnknown:core.writeOutcomeUnknown,referenceVersions:core.referenceVersions,lastAcknowledgedUploads:core.lastAcknowledgedUploads,ownedVersions:core.ownedVersions,lastObservedVersions:core.lastObservedVersions}:null,
  oldAllowanceReusable:false,remainingAllowanceReusable:false,wranglerInternalRequestsAndRetries:'separate-unmeasured',sql:0,secrets:0,namespaces:0,coordinatorUploads:0,productionChanges:false,activated:false,
  cleanupVerified:false,legacyInstallationVerified:false,privateKeyVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false,hostedBilling:'unmeasured'};
}
export async function executeFirstReplacement({api,mergeSha,prNumber,context:c,runnerTemp,getToken,registrationComment,registrationStatus,preparedRunId,
 fetcher=fetch,compile=compileFirstReplacement,approval=firstReplacementApproval,opsFactory=createFeatureReleaseOps,invokeCLI}){
 assertContext(c);assert.equal(typeof getToken,'function');let built,token,identity,identityStat,dir;
 const baseGuard=localSourceGuard(c.source);
 const approved=await approval({api,mergeSha,prNumber,context:c,localGuard:baseGuard,registrationComment,registrationStatus,preparedRunId});
 await approved.fresh();dir=contextDirectory(runnerTemp,c,{create:true});
 const actual={provider:0,cli:0,paused:0},sequence=fixedNetworkSequence();let position=0,writerFailed=false;
 const save=value=>{
  assert(!writerFailed,'BOUND_RECEIPT_WRITER_LATCHED');
  try{privateJSONFile(dir,'checkpoint.json',{value});}catch{writerFailed=true;throw Error('BOUND_RECEIPT_PERSISTENCE_UNKNOWN');}
 };
 const identityCheck=()=>{
  assert(!writerFailed,'BOUND_RECEIPT_WRITER_LATCHED');contextDirectory(runnerTemp,c);
  const s=lstatSync(resolve(dir,'execution-identity.json'));assert.equal(s.dev,identityStat.dev);assert.equal(s.ino,identityStat.ino);
  assertIdentity(privateJSONFile(dir,'execution-identity.json'),identity);
 };
 try{
  built=await compile({source:c.source,directory:dir});assertBuiltManifest(built.manifest);
  assert.equal(digest(canonical(built.configs)),expectedManifest.completeConfigsSHA256);assert.deepEqual(built.reference,firstReplacementInputs().reference);
  assert.equal(built.artifact.source,c.source);assert.equal(built.artifact.artifactSHA256,expectedManifest.worker.artifactSHA256);identity=executionIdentity({c,approved});
  privateJSONFile(dir,'execution-identity.json',{value:identity,exclusive:true});identityStat=lstatSync(resolve(dir,'execution-identity.json'));
  save(checkpoint({c,identity,actual}));
  const guardedLocal=localSourceGuard(c.source,{hostingSHA256:built.hostingSHA256,identityCheck});
  const activeApproval=await approval({api,mergeSha,prNumber,context:c,localGuard:guardedLocal,registrationComment,registrationStatus,preparedRunId});
  assert.deepEqual(activeApproval.proof,approved.proof);assert.deepEqual(activeApproval.window,approved.window);
  const fresh=async()=>{identityCheck();await activeApproval.fresh();identityCheck();};
  await fresh();token=getToken();assert(typeof token==='string'&&token.length>0,'FEATURE_CREDENTIAL_REQUIRED');
  const profiles=profilesForFirstReplacement({source:c.source,coordinatorSourceDigest:built.manifest.coordinatorSourceDigest});
  const ops=opsFactory({root:process.cwd(),directory:dir,evidenceDirectory:resolve(dir,'core-private'),profiles,nativeReceipt:json('config/feature-initialisation-receipt.json'),source:c.source,
   fresh,recoveryFresh:fresh,token,artifacts:{feature_worker:built.artifact,pausedWorker:built.artifact},writePolicy:policy,writePolicySHA256:policySHA256,assets:new Map(),
   fetcher:async(url,options)=>{
    await fresh();identityCheck();const step=sequence[position];assert(step&&step.url===url,'FIXED_EFFECT_SEQUENCE');
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert(options.method===undefined||options.method==='GET');
    if(step.kind==='paused'){assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert(actual.paused<1);actual.paused++;}
    else{assert.deepEqual(Object.keys(options.headers),['Authorization']);assert.equal(options.headers.Authorization,'Bearer '+token);assert(actual.provider<26);actual.provider++;}
    position++;return fetcher(url,options);
   },
   runWrangler:(args,ctx)=>{
    identityCheck();assert.equal(position,12,'CLI_POSITION');assert.equal(actual.cli,0,'ONE_CLI_ATTEMPT');
    assert.equal(ctx.name,main);assert.equal(ctx.label,'release-feature_worker');assert.deepEqual(ctx.config,built.configs.worker);
    assert.deepEqual(args,['deploy','--config',resolve(dir,'release-feature_worker.json')]);actual.cli++;
    if(invokeCLI)return invokeCLI(args,ctx);
    execFileSync(process.execPath,[resolve(process.cwd(),'backend/node_modules/wrangler/bin/wrangler.js'),...args],{cwd:process.cwd(),env:ctx.env,stdio:'pipe',timeout:120000,maxBuffer:1048576});
   }});
  assert.deepEqual(ops.targets,[main]);const coreSave=ops.save;
  ops.save=e=>{
   assert(!writerFailed,'BOUND_RECEIPT_WRITER_LATCHED');
   try{
    identityCheck();coreSave(e);const core=assertCoreForPaused(privateJSONFile(resolve(dir,'core-private'),'deployment.json'),c.source);
    save(checkpoint({c,identity,core,actual}));
   }catch{writerFailed=true;throw Error('BOUND_RECEIPT_PERSISTENCE_UNKNOWN');}
  };
  const result=await resumeInterruptedFeature({ops});assert.equal(result.state,'PAUSED_CODE_RESUME_VERIFIED');assert.equal(position,27);
  assert.deepEqual(actual,{provider:26,cli:1,paused:1});
  const final=privateJSONFile(dir,'checkpoint.json');assert.equal(final.state,'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION');return final;
 }finally{token='';built?.restore();}
}
export function publishFirstReplacement({context:c,runnerTemp,executorOutcome}){
 assertContext(c);assert(typeof runnerTemp==='string'&&isAbsolute(runnerTemp));assert.equal(realpathSync(runnerTemp),resolve(runnerTemp));
 let result={schema:1,state:'UNKNOWN_MISSING_PARTIAL_OR_FAILED_EXECUTION',run:{source:c.source,runId:String(c.runId),attempt:1},planSHA256,identity:null,actual:null,reserved:null,remainingAllowanceReusable:false,activated:false,cleanupVerified:false,legacyInstallationVerified:false};
 if(executorOutcome==='success'){
  try{
   const dir=contextDirectory(runnerTemp,c),value=privateJSONFile(dir,'checkpoint.json'),id=privateJSONFile(dir,'execution-identity.json');
   assert.equal(value.schema,1);assert.equal(value.state,'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION');assert.deepEqual(value.run,result.run);
   assert.equal(value.planSHA256,planSHA256);assert.equal(value.policySHA256,policySHA256);assert.equal(value.artifactSHA256,expectedManifest.worker.artifactSHA256);
   assert.deepEqual(value.identity,id);assert.equal(id.source,c.source);assert.equal(id.runId,String(c.runId));assert.equal(id.attempt,1);assert.equal(id.planSHA256,planSHA256);assert.equal(id.repository,repo);assert.equal(id.request,plan.request);assertIdentityShape(id,c);assertSummary(value.core,c.source);
   assert.deepEqual(value.actual,{provider:26,cli:1,paused:1});assert.deepEqual(value.reserved,{metadataGETs:26,cli:1,pausedGETs:1});
   assert.equal(value.core.state,'PAUSED_CODE_RESUME_VERIFIED');assert(value.core.ownedVersions[main]&&value.core.ownedVersions[main]===value.core.lastAcknowledgedUploads[main]?.versionId);
   for(const k of ['activated','cleanupVerified','legacyInstallationVerified','privateKeyVerified','remoteCodeReadbackVerified','assetRoutingReadbackVerified','metadataAtomic','productionChanges','remainingAllowanceReusable','oldAllowanceReusable'])assert.equal(value[k],false);
   for(const k of ['sql','secrets','namespaces','coordinatorUploads'])assert.equal(value[k],0);
   // Rebuild the published allowlist, never publish arbitrary private file fields.
   result={schema:1,state:value.state,run:value.run,planSHA256,policySHA256,artifactSHA256:value.artifactSHA256,identity:id,actual:value.actual,reserved:value.reserved,
    ack:value.core.lastAcknowledgedUploads[main],ownedMainVersion:value.core.ownedVersions[main],observedVersions:value.core.lastObservedVersions,
    remainingAllowanceReusable:false,wranglerInternalRequestsAndRetries:'separate-unmeasured',activated:false,cleanupVerified:false,legacyInstallationVerified:false,privateKeyVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false,hostedBilling:'unmeasured'};
  }catch{} // Missing/partial/invalid/unfinished receipts remain UNKNOWN, no refund.
 }
 const dir=resolve(runnerTemp,'jwt-first-replacement-artifact-'+c.runId+'-1');mkdirSync(dir,{recursive:false,mode:0o700});
 privateJSONFile(dir,'paused-first-replacement.json',{value:result,exclusive:true});return result;
}
async function mainCLI(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.FIRST_REPLACEMENT_PLAN_SHA256,planSHA256);const c=cliContext(),mode=process.argv[2];
 if(mode==='publish'){let outcome=process.env.EXECUTOR_OUTCOME;try{await localSourceGuard(c.source)();}catch{outcome='failure';}const r=publishFirstReplacement({context:c,runnerTemp:process.env.RUNNER_TEMP,executorOutcome:outcome});console.log(JSON.stringify({state:r.state,activated:false}));return;}
 assert.equal(mode,'execute');const api=githubClient(process.env.GITHUB_TOKEN);
 await executeFirstReplacement({api,context:c,runnerTemp:process.env.RUNNER_TEMP,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,registrationComment:process.env.WINDOW_COMMENT_ID,registrationStatus:process.env.WINDOW_STATUS_ID,preparedRunId:process.env.SOURCE_PREPARATION_RUN_ID,
  getToken:()=>{const value=process.env.CLOUDFLARE_API_TOKEN;delete process.env.CLOUDFLARE_API_TOKEN;return value;}});
 console.log(JSON.stringify({state:'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION',activated:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await mainCLI();}catch{console.error('PAUSED_FIRST_REPLACEMENT_STOPPED_NO_RETRY_OR_ACTIVATION');process.exitCode=1;}}
