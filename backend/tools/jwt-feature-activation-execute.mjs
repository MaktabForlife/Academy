// SOURCE-ONLY activation caller proposal. Only later exact protected authority may run it.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {plan,planSHA256,activationApproval,contextDirectory,privateJSONFile,executionIdentity,assertIdentity,assertIdentityShape,assertContext,cliContext,localSourceGuard} from './jwt-feature-activation-approved.mjs';
import {activationGitHub} from './jwt-feature-activation-github.mjs';
import {account,origin} from './jwt-feature-transition.mjs';
import {compileActivation,acceptedPublic} from './jwt-feature-activation-build.mjs';
import {activationProfiles,activationPolicy,basisBinding} from './jwt-feature-activation-baseline.mjs';
import {createFeatureReleaseOps} from './jwt-feature-release-transport.mjs';
import {releaseFreshFeature} from './jwt-feature-release-controller.mjs';
import {canonical,digest} from './jwt-feature-upload-artifact.mjs';
const main='feature_worker',coord='academy-feature-split-coordinator';
const bytes=readFileSync(new URL('../../deployment/jwt-feature-activation-input-manifest.json',import.meta.url));assert.equal(digest(bytes),plan.inputManifestSHA256);const expected=JSON.parse(bytes);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/,hex=/^[a-f0-9]{64}$/;
const cf=(n,k)=>'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+n+'/'+k;
const pair=()=>[cf(main,'deployments'),cf(coord,'deployments')];
const full=n=>['settings','deployments','subdomain','schedules'].map(k=>cf(n,k));
export const successProviderOrder=()=>[...full(main),...full(coord),...pair(),...pair(),cf(main,'settings'),cf(main,'deployments'),...full(main),...full(coord)];
export const recoveryProviderOrder=()=>[...pair(),...pair(),cf(main,'settings'),cf(main,'deployments'),...pair(),...pair()];
export const smokeOrder=[['/auth/v110/login','POST'],['/auth/v110/context','GET'],['/api/account/session','POST'],['/api/academy/lesson-media/list','POST'],['/api/academy/lesson-media/list','POST'],['/auth/v110/refresh','POST'],['/auth/v110/logout','POST'],['/api/account/session','POST']];
export function assertBuilt(m){
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='recipeSource'));assert.deepEqual(strip(m),strip(expected),'ACTIVATION_FROZEN_INPUTS_CHANGED');
}
function safeGithub(g){
 assert.deepEqual(Object.keys(g).sort(),['restRequests','signedArtifactGETs','remaining','armed','failed'].sort());assert(Number.isInteger(g.restRequests)&&g.restRequests>=0&&g.restRequests<=680);assert(Number.isInteger(g.signedArtifactGETs)&&g.signedArtifactGETs>=0&&g.signedArtifactGETs<=2);assert(Number.isSafeInteger(g.remaining)&&g.remaining>0);assert.equal(g.armed,true);assert.equal(g.failed,false);return {...g};
}
function safeSmoke(smoke){
 assert.equal(smoke.schema,1);assert.equal(smoke.kind,'FIXED_EIGHT_HTTP_SMOKE');assert.equal(smoke.origin,origin);assert.equal(smoke.calls.length,8);assert.equal(smoke.httpRetries,0);assert.equal(smoke.backgroundFlag,false);assert.equal(smoke.replayedNonemptyPreLogoutCookie,true);assert.equal(smoke.clockChanged,false);
 const statuses=[200,200,200,200,403,200,200,401];
 for(const [i,c]of smoke.calls.entries()){
  assert.deepEqual(Object.keys(c).sort(),['label','path','method','status','setCookieCount','metrics'].sort());
  assert.equal(c.path,smokeOrder[i][0]);assert.equal(c.method,smokeOrder[i][1]);assert.equal(c.status,statuses[i]);assert(Number.isInteger(c.setCookieCount)&&c.setCookieCount>=0&&c.setCookieCount<=2);
  if(c.metrics!==null){assert.deepEqual(Object.keys(c.metrics).sort(),['roundTrips','statements','rowsRead','rowsWritten','privateRpc','r2','remote','rateChecks'].sort());for(const n of Object.values(c.metrics))assert(Number.isSafeInteger(n)&&n>=0);}
 }
 const totals={};assert.deepEqual(Object.keys(smoke.totals).sort(),['apiRequests','roundTrips','statements','rowsRead','rowsWritten','privateRpc','r2','remote','rateChecks'].sort());
 for(const [k,v]of Object.entries(smoke.totals)){assert(v===null||(Number.isSafeInteger(v)&&v>=0));totals[k]=v;}
 assert.equal(totals.apiRequests,8);assert.equal(typeof smoke.metricsObserved,'boolean');
 return {completedRequests:8,statuses,backgroundRefresh:true,logoutAndReplayChecked:true,metricsObserved:smoke.metricsObserved,totals};
}
function assertAck(a,c,artifact){
 assert.deepEqual(Object.keys(a).sort(),['schema','target','versionId','source','configSHA256','wranglerVersion','kind','artifactSHA256'].sort());
 assert.equal(a.schema,1);assert.equal(a.target,main);assert(uuid.test(a.versionId));assert.equal(a.source,c.source);assert(hex.test(a.configSHA256));assert.equal(a.wranglerVersion,'4.136.3');assert.equal(a.kind,'PINNED_CLI_DEPLOY_ACK');assert.equal(a.artifactSHA256,artifact);
}
export function assertActivationCore(r,c){
 const base=['schema','state','activated','recovery','source','origin','explicitCloudflareGets','wranglerAttempts','publicHTTPAttempts','smokeHTTPAttempts','pauseHTTPAttempts','secretChanges','sqlByDeployer','namespaceChanges','pagesCalls','wranglerInternalRequests','interruptedReference','installationVerified','referenceVersions','lastAcknowledgedUploads','ownedVersions','lastObservedVersions','writeOutcomeUnknown','mode','remoteCodeAttested','privateKeyAttested','metadataAtomic','hostedD1Rows','localEightRequestProjection','projectionIsNotHostedBilling','baselineKind','controlUnavailable','baselineOwnedVersions','coordinatorReferenceOnly','inheritedAttestations','schemaSeedProvenance'];
 assert.deepEqual(Object.keys(r).sort(),[...base,...(Object.hasOwn(r,'smoke')?['smoke']:[])].sort());
 assert.equal(r.schema,1);assert.equal(r.source,c.source);assert.equal(r.origin,origin);assert.equal(r.baselineKind,'PAUSED_REPLACEMENT_RECEIPT');assert.equal(r.installationVerified,false);assert.equal(r.interruptedReference,false);assert.equal(r.coordinatorReferenceOnly,true);
 for(const k of ['secretChanges','sqlByDeployer','namespaceChanges','pagesCalls'])assert.equal(r[k],0);
 for(const [k,cap]of [['explicitCloudflareGets',24],['wranglerAttempts',2],['publicHTTPAttempts',3],['smokeHTTPAttempts',8],['pauseHTTPAttempts',1]])assert(Number.isInteger(r[k])&&r[k]>=0&&r[k]<=cap);
 assert.deepEqual(Object.keys(r.referenceVersions).sort(),[main,coord].sort());assert.deepEqual(Object.keys(r.baselineOwnedVersions),[main]);assert.equal(r.referenceVersions[main],r.baselineOwnedVersions[main]);for(const x of Object.values(r.referenceVersions))assert(uuid.test(x));
 assert.equal(r.wranglerInternalRequests,'separate-unmeasured');assert.equal(r.hostedD1Rows,'unmeasured');assert.equal(r.schemaSeedProvenance,'HISTORICAL_INSTALL_STOPPED_SOURCE_CONTROL_FLOW_ONLY_NOT_NEW_DB_READBACK');
 assert.deepEqual(r.inheritedAttestations,{installationVerified:false,cleanupVerified:false,legacyInstallationVerified:false,privateKeyVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false});
 for(const k of ['remoteCodeAttested','privateKeyAttested','metadataAtomic'])assert.equal(r[k],false);
 assert(Object.keys(r.lastAcknowledgedUploads).every(k=>k===main));assert(Object.keys(r.ownedVersions).every(k=>k===main));assert(Object.keys(r.lastObservedVersions).every(k=>[main,coord].includes(k)));
 if(r.lastAcknowledgedUploads[main])assertAck(r.lastAcknowledgedUploads[main],c,r.wranglerAttempts===2?expected.paused.artifactSHA256:expected.active.artifactSHA256);
 for(const x of [...Object.values(r.ownedVersions),...Object.values(r.lastObservedVersions)])assert(uuid.test(x));
 if(r.smoke)safeSmoke(r.smoke);return r;
}
async function readBaseline(client){
 const value=await client.archive({id:basisBinding.artifact,zipSHA256:basisBinding.zipSHA256,maximumBytes:131072});
 const env={...process.env};for(const k of ['CLOUDFLARE_API_TOKEN','FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete env[k];
 const bytes=execFileSync('python3',['-c',"import sys,zipfile,io\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.namelist()==['paused-first-replacement.json']\nb=z.read('paused-first-replacement.json');assert len(b)<=131072\nsys.stdout.buffer.write(b)\n"],{input:value.bytes,env,maxBuffer:131073,stdio:['pipe','pipe','pipe']});assert.equal(digest(bytes),basisBinding.fileSHA256);
 return {bytes,binding:basisBinding};
}
export async function executeActivation({context:c,runnerTemp,mergeSha,prNumber,registrationComment,registrationStatus,preparedRunId,client,getSecrets,
 approval=activationApproval,compile=compileActivation,baselineReader=readBaseline,fetcher=fetch,invokeCLI,guardFactory=localSourceGuard}){
 assertContext(c);let built,token='',pin='',writerFailed=false,authorityFailed=false,identity,identityStat,dir,guard=guardFactory(c.source),completion='NONE',core=null,recovery=false,recoveryIndex=0;
 const actual={provider:0,cli:0,public:0,auth:0,paused:0};const localGuard=async()=>guard();
 const approved=await approval({api:client.api,mergeSha,prNumber,context:c,localGuard,registrationComment,registrationStatus,preparedRunId});
 dir=contextDirectory(runnerTemp,c,{create:true});identity=executionIdentity({c,approved});privateJSONFile(dir,'execution-identity.json',{value:identity,exclusive:true});identityStat=lstatSync(resolve(dir,'execution-identity.json'));
 const identityCheck=()=>{assert(!writerFailed);contextDirectory(runnerTemp,c);const s=lstatSync(resolve(dir,'execution-identity.json'));assert.equal(s.dev,identityStat.dev);assert.equal(s.ino,identityStat.ino);assertIdentity(privateJSONFile(dir,'execution-identity.json'),identity);};
 const persist=()=>{
  assert(!writerFailed);
  try{identityCheck();privateJSONFile(dir,'checkpoint.json',{value:{schema:1,run:{source:c.source,runId:String(c.runId),attempt:1},identity,planSHA256,completion,actual:{...actual},core,github:{...client.stats},runtimeState:completion==='ACTIVE'?'ACTIVE_OBSERVED_AFTER_FIXED_SMOKE':completion==='RECOVERED'?'PAUSED_OBSERVED_AFTER_OWNED_RECOVERY':'UNKNOWN'}});}
  catch{writerFailed=true;throw Error('ACTIVATION_CAPTURE_PERSISTENCE_UNKNOWN');}
 };
 persist();
 const fresh=async()=>{
  assert(!authorityFailed&&!writerFailed);identityCheck();
  try{client.assertUsable();await approved.fresh();identityCheck();}catch{authorityFailed=true;throw Error('ACTIVATION_AUTHORITY_LOST_NO_RECOVERY');}
 };
 try{
  const baseline=await baselineReader(client);
  const publicArchive=await client.archive({id:acceptedPublic.artifact,zipSHA256:acceptedPublic.zipSHA256,maximumBytes:1048576});
  built=await compile({source:c.source,directory:dir,archive:publicArchive.bytes});assertBuilt(built.manifest);
  for(const [k,a]of Object.entries(built.artifacts))assert.equal(a.source,c.source);
  const profiles=activationProfiles({...baseline,source:c.source,coordinatorSourceDigest:built.manifest.coordinatorSourceDigest});assert.deepEqual(profiles.before,built.configs.before);assert.deepEqual(profiles.active,built.configs.active);assert.deepEqual(profiles.paused,built.configs.paused);
  const policy=activationPolicy(profiles,built.artifacts),template={...policy,referenceVersions:'FIXED_PRIOR_PAUSED_RECEIPT_ONLY'};assert.deepEqual(template,plan.policyTemplate);
  guard=guardFactory(c.source,{hostingSHA256:built.hostingSHA256,identityCheck});await fresh();client.arm();
  const secrets=getSecrets();token=secrets.token;pin=secrets.pin;assert(token&&/^[0-9]{4}$/.test(pin));
  const recoverFresh=async()=>{await fresh();if(!recovery){assert.equal(actual.provider,14);assert.equal(actual.public,3);assert(actual.auth>=1&&actual.auth<=8);assert.equal(actual.cli,1);recovery=true;}};
  const providerOrder=successProviderOrder(),recoverOrder=recoveryProviderOrder();
  const ops=createFeatureReleaseOps({root:process.cwd(),directory:dir,evidenceDirectory:resolve(dir,'core-private'),profiles,nativeReceipt:JSON.parse(readFileSync('config/feature-initialisation-receipt.json')),source:c.source,fresh,recoveryFresh:recoverFresh,token,pin,assets:built.assets,artifacts:built.artifacts,writePolicy:policy,writePolicySHA256:digest(canonical(policy)),
   fetcher:async(url,options)=>{
    await fresh();identityCheck();
    if(new URL(url).origin==='https://api.cloudflare.com'){
     const wanted=recovery?recoverOrder[recoveryIndex++]:providerOrder[actual.provider];assert.equal(url,wanted,'EXACT_PROVIDER_ORDER');
     assert(actual.provider<24);assert(options.method===undefined||options.method==='GET');assert.deepEqual(Object.keys(options.headers),['Authorization']);assert.equal(options.headers.Authorization,'Bearer '+token);actual.provider++;
    }else{
     const u=new URL(url);assert.equal(u.origin,origin);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
     if(recovery){assert.equal(u.pathname,'/__jwt_feature_release');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert.equal(actual.paused,0);actual.paused++;}
     else if(actual.public<3){
      assert.equal(actual.provider,14);assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert.equal(u.pathname,['/__jwt_feature_release','/academy/','/auth/v110/browser-config.js'][actual.public]);actual.public++;
     }else{
      assert.equal(actual.provider,14);assert(actual.auth<8);assert.deepEqual([u.pathname,options.method],smokeOrder[actual.auth]);assert.equal(options.credentials,'same-origin');assert.equal(options.headers.Origin,origin);actual.auth++;
     }
    }
    return fetcher(url,options);
   },
   runWrangler:(args,ctx)=>{
    identityCheck();assert.equal(ctx.name,main);assert.equal(ctx.label,recovery?'owned-jwt-paused':'release-feature_worker');
    assert.equal(actual.provider,recovery?18:12);assert.equal(actual.cli,recovery?1:0);assert.deepEqual(ctx.config,recovery?profiles.paused.worker:profiles.active.worker);
    assert.deepEqual(args,['deploy','--config',resolve(dir,ctx.label+'.json')]);actual.cli++;
    if(invokeCLI)return invokeCLI(args,ctx);
    execFileSync(process.execPath,[resolve(process.cwd(),'backend/node_modules/wrangler/bin/wrangler.js'),...args],{cwd:process.cwd(),env:ctx.env,stdio:'pipe',timeout:120000,maxBuffer:1048576});
   }});
  const coreSave=ops.save;
  ops.save=e=>{
   assert(!writerFailed);
   try{identityCheck();const result=coreSave(e);assert.equal(result,undefined);core=assertActivationCore(privateJSONFile(resolve(dir,'core-private'),'deployment.json'),c);persist();}
   catch{writerFailed=true;throw Error('ACTIVATION_CAPTURE_PERSISTENCE_UNKNOWN');}
  };
  try{const result=await releaseFreshFeature({ops});assert.equal(result.state,'FEATURE_VERIFIED');assert.deepEqual(actual,{provider:22,cli:1,public:3,auth:8,paused:0});completion='ACTIVE';}
  catch(error){
   if(writerFailed||authorityFailed)throw error;
   assert(core&&core.state==='STOPPED'&&core.recovery==='OWNED_FEATURE_PAUSED'&&core.mode==='PAUSED'&&core.controlUnavailable===false&&!core.writeOutcomeUnknown);
   assert(recovery&&recoveryIndex===10&&actual.provider===24&&actual.cli===2&&actual.public===3&&actual.auth>=1&&actual.auth<=8&&actual.paused===1);
   completion='RECOVERED';
  }
  assert(core);assert.equal(core.lastObservedVersions[main],core.ownedVersions[main]);assert.equal(core.ownedVersions[main],core.lastAcknowledgedUploads[main].versionId);assert.equal(core.lastObservedVersions[coord],core.referenceVersions[coord]);persist();return privateJSONFile(dir,'checkpoint.json');
 }finally{token='';pin='';built?.restore();}
}
export function publishActivation({context:c,runnerTemp,executorOutcome}){
 assertContext(c);assert(isAbsolute(runnerTemp)&&realpathSync(runnerTemp)===resolve(runnerTemp));
 let out={schema:1,state:'UNKNOWN_MISSING_PARTIAL_OR_FAILED_CAPTURE',runtimeState:'UNKNOWN',runtimeActivated:null,activationAccepted:false,run:{source:c.source,runId:String(c.runId),attempt:1},planSHA256,actual:null,reserved:null,remainingAllowanceReusable:false};
 if(executorOutcome==='success'){
  try{
   const dir=contextDirectory(runnerTemp,c),v=privateJSONFile(dir,'checkpoint.json'),id=privateJSONFile(dir,'execution-identity.json');
   assert.equal(v.schema,1);assert.equal(v.planSHA256,planSHA256);assert.deepEqual(v.run,out.run);assert.deepEqual(v.identity,id);assertIdentityShape(id,c);assert(['ACTIVE','RECOVERED'].includes(v.completion));
   const r=assertActivationCore(v.core,c);safeGithub(v.github);assert.equal(r.lastObservedVersions[main],r.ownedVersions[main]);assert.equal(r.ownedVersions[main],r.lastAcknowledgedUploads[main].versionId);assert.equal(r.lastObservedVersions[coord],r.referenceVersions[coord]);assert.equal(r.writeOutcomeUnknown,false);assert.equal(r.controlUnavailable,false);
   const active=v.completion==='ACTIVE';
   if(active){assert.equal(r.state,'FEATURE_VERIFIED');assert.equal(r.activated,true);assert.equal(r.mode,'ACTIVE');assert.equal(r.recovery,null);assert.deepEqual(v.actual,{provider:22,cli:1,public:3,auth:8,paused:0});safeSmoke(r.smoke);}
   else{assert.equal(r.state,'STOPPED');assert.equal(r.mode,'PAUSED');assert.equal(r.recovery,'OWNED_FEATURE_PAUSED');assert(v.actual.auth>=1&&v.actual.auth<=8);assert.deepEqual(v.actual,{provider:24,cli:2,public:3,auth:v.actual.auth,paused:1});}
   assert.deepEqual([r.explicitCloudflareGets,r.wranglerAttempts,r.publicHTTPAttempts,r.smokeHTTPAttempts,r.pauseHTTPAttempts],[v.actual.provider,v.actual.cli,v.actual.public,v.actual.auth,v.actual.paused]);
   out={schema:1,state:active?'ACTIVE_FUNCTIONAL_ACCEPTANCE_CAPTURED':'ACTIVATION_REJECTED_RECOVERY_CAPTURED',runtimeState:active?'ACTIVE_OBSERVED_AFTER_FIXED_SMOKE':'PAUSED_OBSERVED_AFTER_OWNED_RECOVERY',runtimeActivated:active,activationAccepted:active,run:out.run,planSHA256,identity:id,actual:v.actual,reserved:{metadataGETs:r.explicitCloudflareGets,uploads:r.wranglerAttempts,publicGETs:r.publicHTTPAttempts,smokeRequests:r.smokeHTTPAttempts,pausedGETs:r.pauseHTTPAttempts},
    baseline:{kind:r.baselineKind,receipt:plan.baseline,baselineOwnedVersions:r.baselineOwnedVersions,referenceVersions:r.referenceVersions,coordinatorReferenceOnly:true,schemaSeedProvenance:r.schemaSeedProvenance,inheritedAttestations:r.inheritedAttestations},
    currentRunAcknowledgements:r.lastAcknowledgedUploads,ownedVersions:r.ownedVersions,lastObservedVersions:r.lastObservedVersions,
    smoke:active?safeSmoke(r.smoke):{completed:false,attempts:v.actual.auth,partialSyntheticSessionMayRemain:true,cleanupPerformed:false},
    github:safeGithub(v.github),remainingAllowanceReusable:false,wranglerInternalRequestsAndRetries:'separate-unmeasured',hostedBilling:'unmeasured',
    cleanupVerified:false,legacyInstallationVerified:false,privateKeyReadbackVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false};
  }catch{} // Failed/partial/persistence/publisher input never asserts a PAUSED runtime.
 }
 const dir=resolve(runnerTemp,'jwt-activation-artifact-'+c.runId+'-1');mkdirSync(dir,{recursive:false,mode:0o700});privateJSONFile(dir,'activation.json',{value:out,exclusive:true});return out;
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.ACTIVATION_PLAN_SHA256,planSHA256);const c=cliContext(),mode=process.argv[2];
 if(mode==='publish'){let outcome=process.env.EXECUTOR_OUTCOME;try{await localSourceGuard(c.source)();}catch{outcome='failure';}const out=publishActivation({context:c,runnerTemp:process.env.RUNNER_TEMP,executorOutcome:outcome});console.log(JSON.stringify({state:out.state,runtimeState:out.runtimeState,activationAccepted:out.activationAccepted}));return;}
 if(mode==='assess'){const dir=resolve(process.env.RUNNER_TEMP,'jwt-activation-artifact-'+c.runId+'-1'),r=privateJSONFile(dir,'activation.json');assert.equal(r.activationAccepted,true,'ACTIVATION_NOT_ACCEPTED_SEE_AUTHORISED_RECEIPT');return;}
 assert.equal(mode,'execute');const client=activationGitHub({token:process.env.GITHUB_TOKEN,maximum:680});await client.probe();
 await executeActivation({client,context:c,runnerTemp:process.env.RUNNER_TEMP,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,registrationComment:process.env.WINDOW_COMMENT_ID,registrationStatus:process.env.WINDOW_STATUS_ID,preparedRunId:process.env.SOURCE_PREPARATION_RUN_ID,
  getSecrets:()=>{const out={token:process.env.CLOUDFLARE_API_TOKEN,pin:process.env.FEATURE_TEST_ADMIN_PIN};delete process.env.CLOUDFLARE_API_TOKEN;delete process.env.FEATURE_TEST_ADMIN_PIN;return out;}});
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{await main();}catch{console.error('JWT_FEATURE_ACTIVATION_NOT_ACCEPTED_RUNTIME_UNKNOWN_UNLESS_COMPLETE_OWNED_RECOVERY_RECEIPT');process.exitCode=1;}}
