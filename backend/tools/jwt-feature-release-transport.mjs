// Fixed two-script Feature scope. References, observations, ACKs and ownership differ.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,realpathSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {account,origin} from './jwt-feature-transition.mjs';
import {assertRemoteProfile,currentVersion,sanitiseSettings} from './jwt-feature-install-metadata.mjs';
import {runEightRequestSmoke} from './jwt-feature-eight-request-smoke.mjs';
import {pinnedWranglerVersion,prepareUploadAck,readUploadAck} from './jwt-feature-upload-ack.mjs';
import {canonical,targets as names} from './jwt-feature-upload-artifact.mjs';
import {assertWritePolicy} from './jwt-feature-resume-contract.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createFeatureReleaseOps({root,directory,evidenceDirectory,profiles,nativeReceipt,installation,installed,source,fresh,recoveryFresh=fresh,token,pin,assets,artifacts={},writePolicy,writePolicySHA256,fetcher=fetch,runWrangler}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert(token);assert.equal(typeof fresh,'function');
 profiles=structuredClone(profiles);
 const interrupted=profiles.mode==='PAUSED_RESUME';
 const references=Object.freeze(interrupted?{...profiles.reference.referenceVersions}:{feature_worker:installed.workerVersion,'academy-feature-split-coordinator':installed.coordinatorVersion});
 const acknowledged={},ownedVersions={},observed={};let pending=null,writeUnknown=false;
 const config={feature_worker:profiles.before.worker,'academy-feature-split-coordinator':profiles.before.coordinator};
 const namespaces=interrupted?profiles.reference.namespaces:{timetable:installation.timetableNamespaceId,split:installation.splitNamespaceId};
 // Defaults are available to read-only injected regressions; the actual writer
 // additionally requires a hash-bound, approved-tree policy before any attempt.
 const caps=writePolicy?structuredClone(writePolicy.budgets):{metadataGETs:36,uploads:0,publicGETs:0,smokeRequests:0,pausedGETs:0};
 const report={explicitCloudflareGets:0,wranglerAttempts:0,publicHTTPAttempts:0,smokeHTTPAttempts:0,pauseHTTPAttempts:0,secretChanges:0,sqlByDeployer:0,namespaceChanges:0,pagesCalls:0,wranglerInternalRequests:'separate-unmeasured'};
 assert.equal(realpathSync(directory),resolve(directory));assert(!lstatSync(directory).isSymbolicLink());
 mkdirSync(evidenceDirectory,{recursive:true});
 let policy;
 const requirePolicy=()=>{
  const checked=assertWritePolicy({policy:writePolicy,policySHA256:writePolicySHA256,source,references,artifacts,mode:interrupted?'PAUSED_RESUME':'ACTIVE'});
  if(policy)assert.deepEqual(checked,policy);else policy=checked;
  return checked;
 };
 const bounded=async(response,limit=262144)=>{
  const reader=response.body?.getReader(),parts=[];let size=0;
  try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('BODY_BUDGET');}parts.push(Buffer.from(value));}return Buffer.concat(parts);}
  finally{reader?.releaseLock();}
 };
 const cf=async(name,kind)=>{
  assert(names.includes(name)&&['settings','deployments','subdomain','schedules'].includes(kind));
  assert(report.explicitCloudflareGets<caps.metadataGETs,'METADATA_READ_BUDGET');report.explicitCloudflareGets++;
  let response;try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/'+kind,{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('CF_READ_UNKNOWN');}
  assert(response.ok,'CF_READ_STATUS');const value=JSON.parse((await bounded(response,1048576)).toString());assert.equal(value.success,true);
  return kind==='settings'?sanitiseSettings(value.result):value.result;
 };
 const version=async name=>currentVersion(await cf(name,'deployments'));
 const verify=async(name,c)=>{
  assertRemoteProfile(await cf(name,'settings'),c,nativeReceipt,namespaces,{secretNames:name===names[0]?c.secrets.required:[],discover:false});
  const id=await version(name);observed[name]=id;return id;
 };
 const address=async name=>{
  const url=await cf(name,'subdomain');assert.equal(url.enabled,name===names[0]);assert.equal(url.previews_enabled,false);
  const s=await cf(name,'schedules');assert.deepEqual(Array.isArray(s)?s:s.schedules,[]);
 };
 const expected=()=>Object.fromEntries(names.map(n=>[n,ownedVersions[n]||references[n]]));
 const fence=async()=>{for(const name of names){const id=await version(name);observed[name]=id;assert.equal(id,expected()[name],'VERSION_DRIFT');}};
 const command=async(name,c,label,{recovery=false}={})=>{
  const p=requirePolicy(),artifact=recovery?artifacts.pausedWorker:artifacts[name];
  assert(artifact);assert.equal(artifact.source,source);
  if(recovery){assert(ownedVersions[name],'RECOVERY_REQUIRES_OWNED_ACK');assert.equal(p.recovery?.artifactSHA256,artifact.artifactSHA256);}
  else{assert.equal(p.firstWrites[name],artifact.artifactSHA256,'INITIAL_REFERENCE_REPLACEMENT_NOT_REVIEWED');}
  assert.equal(c.name,name);const rendered=artifact.render(c);
  const cli=JSON.parse(readFileSync(resolve(root,'backend/node_modules/wrangler/package.json'),'utf8'));
  assert.equal(cli.version,pinnedWranglerVersion,'INSTALLED_WRANGLER_PIN');
  const configText=canonical(rendered),configSHA256=hash(configText),path=resolve(directory,label+'.json');
  writeFileSync(path,configText,{flag:'wx',mode:0o400});
  const ackFile=prepareUploadAck(directory,label),args=['deploy','--config',path],beforeVersion=expected()[name];
  // The last approval/artifact/version fence precedes a single CLI attempt.
  await (recovery?recoveryFresh():fresh());artifact.assertFrozen();await fence();
  assert.equal(hash(readFileSync(path)),configSHA256);
  assert(report.wranglerAttempts<caps.uploads,'UPLOAD_BUDGET');report.wranglerAttempts++;
  delete ownedVersions[name];pending={name,artifactSHA256:artifact.artifactSHA256,config:c,ack:null};writeUnknown=true;
  const env={...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(directory,label+'.private-cli.log'),WRANGLER_OUTPUT_FILE_PATH:ackFile.path};
  delete env.WRANGLER_OUTPUT_FILE_DIRECTORY;
  for(const k of ['FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN','GH_HOST'])delete env[k];
  const startedAt=Date.now();
  try{
   if(runWrangler)await runWrangler(args,{name,config:c,label,env,rendered});
   else execFileSync(process.execPath,[resolve(root,'backend/node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,env,stdio:'pipe',timeout:120000,maxBuffer:1048576});
   artifact.assertFrozen();assert.equal(hash(readFileSync(path)),configSHA256,'CLI_INPUT_CHANGED_DURING_UPLOAD');
   const ack=readUploadAck(ackFile,{name,args,beforeVersion,source,configSHA256,startedAt,finishedAt:Date.now()});
   acknowledged[name]={...ack,artifactSHA256:artifact.artifactSHA256};
   pending.ack=ack;config[name]=c;
  }catch{throw Error('UPLOAD_ACK_UNKNOWN');}
 };
 const adopt=async name=>{
  assert.equal(pending?.name,name);assert(pending.ack,'UPLOAD_ACK_REQUIRED');
  assert.equal(pending.artifactSHA256,acknowledged[name]?.artifactSHA256);
  const id=await verify(name,pending.config);assert.equal(id,pending.ack.versionId,'OBSERVED_VERSION_NOT_UPLOAD_ACK');
  // Metadata equality alone never creates ownership.
  ownedVersions[name]=id;pending=null;writeUnknown=false;
 };
 const get=async(path,counter,cap)=>{
  assert(report[counter]<cap);report[counter]++;
  let response;try{response=await fetcher(origin+path,{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{throw Error('PUBLIC_RESPONSE_UNKNOWN');}
  assert(!response.headers.get('set-cookie'),'PUBLIC_COOKIE');return response;
 };
 return {
  fresh,recoveryFresh,fence,owned:fence,targets:profiles.coordinatorChanged?['academy-feature-split-coordinator','feature_worker']:['feature_worker'],
  async preflight(){await fresh();for(const n of names){assert.equal(await verify(n,config[n]),references[n],'REFERENCE_CHANGED');await address(n);}},
  async deploy(name){const p=interrupted?profiles.paused:profiles.active;await command(name,name===names[0]?p.worker:p.coordinator,'release-'+name);},
  adopt,
  canRecover(){return !writeUnknown&&!pending&&!!ownedVersions[names[0]]&&!!writePolicy?.recovery;},
  async publicProof(){
   assert(!interrupted);
   const marker=await get('/__jwt_feature_release','publicHTTPAttempts',caps.publicGETs);assert.equal(marker.status,200);assert(marker.headers.get('cache-control')?.includes('no-store'));assert.deepEqual(JSON.parse((await bounded(marker)).toString()),{featureOnly:true,sourceCommit:source,state:'ACTIVE'});
   for(const path of ['/academy/','/auth/v110/browser-config.js']){
    const response=await get(path,'publicHTTPAttempts',caps.publicGETs);assert.equal(response.status,200);
    assert.equal(hash(await bounded(response)),assets.get(path),'INSTALLED_PUBLIC_ASSET_CHANGED');
   }
  },
  async smoke(){
   assert(!interrupted);assert.equal(caps.smokeRequests,8);
   let secretPin=pin;pin=null;
   try{return await runEightRequestSmoke({uniqueid:'feature-test-learner',pin:secretPin,expectedAccount:'feature-synthetic-learner-a',requireMetrics:false,dispatch:async(url,options)=>{
    assert.equal(new URL(url).origin,origin);assert(report.smokeHTTPAttempts<caps.smokeRequests,'SMOKE_BUDGET');report.smokeHTTPAttempts++;return fetcher(url,options);
   }});}finally{secretPin='';}
  },
  async verifyFinal(){for(const n of names){assert.equal(await verify(n,config[n]),expected()[n],'FINAL_VERSION_CHANGED');await address(n);}},
  async pause(){assert(this.canRecover(),'NO_OWNED_RECOVERY');assert(report.explicitCloudflareGets+8<=caps.metadataGETs&&report.pauseHTTPAttempts<caps.pausedGETs,'RECOVERY_VERIFICATION_BUDGET');await command(names[0],profiles.paused.worker,'owned-jwt-paused',{recovery:true});await adopt(names[0]);},
  async verifyPaused(){
   await fence();const r=await get('/__jwt_feature_release','pauseHTTPAttempts',caps.pausedGETs);assert.equal(r.status,503);assert(r.headers.get('cache-control')?.includes('no-store'));
   assert.deepEqual(JSON.parse((await bounded(r)).toString()),{code:'FEATURE_JWT_UNAVAILABLE'});await fence();
  },
  save(evidence){
   const out={...evidence,source,origin,...report,interruptedReference:interrupted,installationVerified:!interrupted,referenceVersions:{...references},lastAcknowledgedUploads:structuredClone(acknowledged),ownedVersions:{...ownedVersions},lastObservedVersions:{...observed},writeOutcomeUnknown:writeUnknown,mode:evidence.activated?'ACTIVE':evidence.state==='PAUSED_CODE_RESUME_VERIFIED'||evidence.recovery==='OWNED_FEATURE_PAUSED'?'PAUSED':'NOT_VERIFIED',remoteCodeAttested:false,privateKeyAttested:false,metadataAtomic:false,hostedD1Rows:'unmeasured',localEightRequestProjection:{statements:111,roundTrips:76,rowsRead:831,rowsWritten:36},projectionIsNotHostedBilling:true};
   writeFileSync(resolve(evidenceDirectory,'deployment.json'),JSON.stringify(out,null,2)+'\n');
   if(evidence.activated&&!interrupted)writeFileSync(resolve(evidenceDirectory,'next-installed-baseline.json'),JSON.stringify({schema:1,mode:'ACTIVE',releaseId:source,coordinatorSourceDigest:profiles.coordinatorSourceDigest,workerVersion:ownedVersions[names[0]],coordinatorVersion:ownedVersions[names[1]]||references[names[1]]},null,2)+'\n');
  }
 };
}
