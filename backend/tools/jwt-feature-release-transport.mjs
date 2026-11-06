// Fixed two-script Feature scope; GET metadata + existing-script uploads only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {account,origin} from './jwt-feature-transition.mjs';
import {assertRemoteProfile,currentVersion,sanitiseSettings} from './jwt-feature-install-metadata.mjs';
import {runEightRequestSmoke} from './jwt-feature-eight-request-smoke.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createFeatureReleaseOps({root,directory,evidenceDirectory,profiles,nativeReceipt,installation,installed,source,fresh,token,pin,assets,fetcher=fetch,runWrangler}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert(token);
 const names=['feature_worker','academy-feature-split-coordinator'];
 const versions={feature_worker:installed.workerVersion,'academy-feature-split-coordinator':installed.coordinatorVersion};
 const observed={};let pending=null;
 const config={feature_worker:profiles.before.worker,'academy-feature-split-coordinator':profiles.before.coordinator};
 const namespaces={timetable:installation.timetableNamespaceId,split:installation.splitNamespaceId};
 const report={explicitCloudflareGets:0,wranglerAttempts:0,publicHTTPAttempts:0,smokeHTTPAttempts:0,pauseHTTPAttempts:0,secretChanges:0,sqlByDeployer:0,namespaceChanges:0,pagesCalls:0,wranglerInternalRequests:'separate-unmeasured'};
 mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(evidenceDirectory,{recursive:true});
 const cf=async(name,kind)=>{
  assert(names.includes(name)&&['settings','deployments','subdomain','schedules'].includes(kind));
  report.explicitCloudflareGets++;assert(report.explicitCloudflareGets<=36,'METADATA_READ_BUDGET');
  let response;try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/'+kind,{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('CF_READ_UNKNOWN');}
  assert(response.ok,'CF_READ_STATUS');const value=await response.json();assert.equal(value.success,true);
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
 const command=async(name,c,label)=>{
  assert(names.includes(name));assert.equal(c.name,name);assert.equal(c.account_id,account);assert.equal(c.migrations,undefined,'ROUTINE_MIGRATION_FORBIDDEN');
  assert(!Object.keys(c.vars).some(k=>k.startsWith('JWT_FEATURE_SETUP_')));assert(!c.main.includes('__jwt_feature_setup'));
  const rendered={...structuredClone(c),main:resolve(root,'backend',c.main),...(c.assets?{assets:{...c.assets,directory:resolve(root,'backend',c.assets.directory)}}:{})};delete rendered.$schema;
  const path=resolve(directory,label+'.json');writeFileSync(path,JSON.stringify(rendered));
  const args=['deploy','--config',path];report.wranglerAttempts++;assert(report.wranglerAttempts<=3);
  if(runWrangler)return runWrangler(args,{name,config:c,label});
  const env={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(directory,label+'.private-cli.log')};
  for(const k of ['FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete env[k];
  try{execFileSync(process.execPath,[resolve(root,'backend/node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,env,stdio:'pipe'});}catch{throw Error('UPLOAD_ACK_UNKNOWN');}
 };
 const get=async(path,counter)=>{
  report[counter]++;const cap=counter==='publicHTTPAttempts'?3:1;assert(report[counter]<=cap);
  let response;try{response=await fetcher(origin+path,{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{throw Error('PUBLIC_RESPONSE_UNKNOWN');}
  assert(!response.headers.get('set-cookie'),'PUBLIC_COOKIE');
  return response;
 };
 const bounded=async response=>{
  const reader=response.body?.getReader(),parts=[];let size=0;
  try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();throw Error('PUBLIC_BODY_BUDGET');}parts.push(Buffer.from(value));}return Buffer.concat(parts);}
  finally{reader?.releaseLock();}
 };
 const owned=async()=>{for(const name of names)assert.equal(await version(name),versions[name],'VERSION_NOT_OWNED');};
 return {
  fresh,owned,targets:profiles.coordinatorChanged?['academy-feature-split-coordinator','feature_worker']:['feature_worker'],
  async preflight(){await fresh();for(const n of names){assert.equal(await verify(n,config[n]),versions[n],'INSTALLED_BASELINE_CHANGED');await address(n);}},
  async deploy(name){const c=name===names[0]?profiles.active.worker:profiles.active.coordinator;await command(name,c,'release-'+name);config[name]=c;pending=name;},
  async adopt(name){assert.equal(pending,name);versions[name]=await verify(name,config[name]);pending=null;},
  async publicProof(){
   const marker=await get('/__jwt_feature_release','publicHTTPAttempts');assert.equal(marker.status,200);assert(marker.headers.get('cache-control')?.includes('no-store'));assert.deepEqual(JSON.parse((await bounded(marker)).toString()),{featureOnly:true,sourceCommit:source,state:'ACTIVE'});
   for(const path of ['/academy/','/auth/v110/browser-config.js']){
    const response=await get(path,'publicHTTPAttempts');assert.equal(response.status,200);const body=await bounded(response);
    assert.equal(hash(body),assets.get(path),'INSTALLED_PUBLIC_ASSET_CHANGED');
   }
  },
  async smoke(){
   let secretPin=pin;pin=null;
   try{return await runEightRequestSmoke({uniqueid:'feature-test-learner',pin:secretPin,expectedAccount:'feature-synthetic-learner-a',requireMetrics:false,dispatch:async(url,options)=>{
    assert.equal(new URL(url).origin,origin);report.smokeHTTPAttempts++;assert(report.smokeHTTPAttempts<=8,'SMOKE_BUDGET');
    return fetcher(url,options);
   }});}finally{secretPin='';}
  },
  async verifyFinal(){for(const n of names){assert.equal(await verify(n,config[n]),versions[n],'FINAL_VERSION_CHANGED');await address(n);}},
  async pause(){
   // Withdrawal may still trigger owned cleanup; never recover an unknown version.
   await command(names[0],profiles.paused.worker,'owned-jwt-paused');config[names[0]]=profiles.paused.worker;
   versions[names[0]]=await verify(names[0],config[names[0]]);
  },
  async verifyPaused(){
   await owned();const r=await get('/__jwt_feature_release','pauseHTTPAttempts');assert.equal(r.status,503);assert(r.headers.get('cache-control')?.includes('no-store'));
   assert.deepEqual(JSON.parse((await bounded(r)).toString()),{code:'FEATURE_JWT_UNAVAILABLE'});await owned();
  },
  save(evidence){
   const out={...evidence,source,origin,...report,coordinatorUploaded:profiles.coordinatorChanged,coordinatorSourceDigest:profiles.coordinatorSourceDigest,lastAcknowledgedVersions:{...versions},lastObservedVersions:{...observed},mode:evidence.activated?'ACTIVE':evidence.recovery==='OWNED_FEATURE_PAUSED'?'PAUSED':'NOT_VERIFIED',hostedD1Rows:'unmeasured',localEightRequestProjection:{statements:111,roundTrips:76,rowsRead:831,rowsWritten:36},projectionIsNotHostedBilling:true};
   writeFileSync(resolve(evidenceDirectory,'deployment.json'),JSON.stringify(out,null,2)+'\n');
   if(evidence.activated)writeFileSync(resolve(evidenceDirectory,'next-installed-baseline.json'),JSON.stringify({schema:1,mode:'ACTIVE',releaseId:source,coordinatorSourceDigest:profiles.coordinatorSourceDigest,workerVersion:versions[names[0]],coordinatorVersion:versions[names[1]]},null,2)+'\n');
  }
 };
}
