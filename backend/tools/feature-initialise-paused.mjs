// One-time PAUSED Feature installation. No SQL, app requests or Pages deployment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkFeatureTargets} from './feature-target-guard.mjs';
import {assertRemoteSettings} from './feature-deploy.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const ids=['0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8','18ad0efb-cd34-42a4-b510-7051f0303200'];
const account='c9a3e355b3d7a795880b1d36a1dbe123',workerName='feature_worker',coordinatorName='academy-feature-split-coordinator';
const oldNamespaces=new Set(['b722f4cf54a04d6fb2a5a299e12722e2','aa75328c13ee4f42b406ccf5ebbe851a']);
export function assertSeeded(r,b){
 assert.equal(r.schema,1);assert.equal(r.state,'SEEDED_VERIFIED');assert.equal(r.accountId,account);assert.deepEqual(r.databaseIds,ids);
 assert.deepEqual(r.schemaHashes,{core:'d7eb88199269195a20b44dad26b1663792e493631fa26690bc915af416772464',admin:'0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830'});
 assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);assert.match(r.acceptedHead,/^[a-f0-9-]{36}$/);
 assert.equal(r.syntheticAccounts,4);assert.equal(r.syntheticCourses,2);assert.equal(r.existingDatabaseEffects,0);assert.equal(r.featureActivated,false);
 assert.equal(r.seededOnly,true);assert.equal(r.hostedSyntheticTests,0);
 assert.deepEqual(r.foreignKeyErrors,{core:0,admin:0});assert.deepEqual(r.quickCheck,{core:'ok',admin:'ok'});
 assert(Number.isSafeInteger(r.nativeProofRun)&&r.nativeProofRun>0);
 assert.equal(b.schema,1);assert.equal(b.accountId,account);assert.equal(b.firstInstallOnly,true);assert.equal(b.workerMigrationTag,null);assert.equal(b.coordinatorMigrationTag,null);
 assert.deepEqual(b.oldLiveNamespaces,[...oldNamespaces]);for(const k of ['workerVersion','coordinatorVersion'])assert.match(b[k],/^[a-f0-9-]{36}$/);
 return r;
}
export function isolatedNamespaces(worker,coordinator){
 const find=(s,name,cls,script)=>{const b=s.bindings?.find(b=>b.name===name);assert(b&&b.type==='durable_object_namespace'&&b.class_name===cls);assert.match(b.namespace_id,/^[a-f0-9]{32}$/);assert(!oldNamespaces.has(b.namespace_id),'Live namespace is forbidden');if(b.script_name)assert.equal(b.script_name,script);return b.namespace_id;};
 const split=find(coordinator,'ACADEMY_SPLIT_COORDINATOR','AcademySplitCoordinator',coordinatorName);
 assert.equal(find(worker,'ACADEMY_SPLIT_COORDINATOR','AcademySplitCoordinator',coordinatorName),split);
 const timetable=find(worker,'PROGRAM_TIMETABLE_COORDINATOR','ProgramTimetableCoordinator',workerName);assert.notEqual(split,timetable);
 return {splitNamespaceId:split,timetableNamespaceId:timetable,worker:workerName,coordinator:coordinatorName};
}
export function redactInstallationDiagnostic(text,secrets){for(const value of secrets.filter(v=>typeof v==='string'&&v)){for(const form of [value,JSON.stringify(value).slice(1,-1)])text=text.split(form).join('[REDACTED]');}return text.replace(/cfat_[A-Za-z0-9_-]+/g,'[REDACTED]');}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 assert.equal(process.env.FEATURE_INITIALISE_ACTION,'install-paused');checkFeatureTargets(root);
 const seed=read('config/feature-seed-installation-receipt.json'),baseline=read('config/feature-first-installation-baseline.json');assertSeeded(seed,baseline);
 assert.equal(read('config/feature-initialisation-receipt.json').state,'PENDING','Routine CD must remain closed');
 const token=process.env.CLOUDFLARE_API_TOKEN;assert(token);const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 let controlPlaneReads=0;
 const api=async(path,method='GET')=>{
  assert(/^\/workers\/scripts\/(?:feature_worker|academy-feature-split-coordinator)\/(?:settings|subdomain|schedules|deployments|secrets\/HIFZ_PROFILE_SYNC_SECRET)$/.test(path),'Unreviewed control-plane target');
  assert(method==='GET'||method==='DELETE'&&path==='/workers/scripts/feature_worker/secrets/HIFZ_PROFILE_SYNC_SECRET');
  if(method==='GET')controlPlaneReads++;
  const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(method+' '+path+' returned HTTP '+response.status);
  const data=await response.json();assert.equal(data.success,true);return data.result;
 };
 const pin=async()=>{
  const response=await fetch('https://api.github.com/repos/MaktabForlife/Academy/git/ref/heads/feature-preview',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
  assert(response.ok);assert.equal((await response.json()).object.sha,process.env.GITHUB_SHA,'Feature source advanced');
 };
 const currentVersion=async name=>{const r=await api('/workers/scripts/'+name+'/deployments'),d=(r.deployments||r)[0];assert.equal(d?.versions?.length,1);return d.versions[0].version_id;};
 const configWorker=read('backend/wrangler.feature.jsonc'),configCoordinator=read('backend/wrangler.feature-coordinator.jsonc');
 const worker={...configWorker,vars:{...configWorker.vars,ACADEMY_D1_RUN_ID:seed.sourceDigest}};
 const coordinator={...configCoordinator};
 const temp=mkdtempSync(join(tmpdir(),'feature-first-install-')),wrangler=join(root,'backend/node_modules/wrangler/bin/wrangler.js');
 const evidence={schema:1,state:'STARTED',commit:process.env.GITHUB_SHA,accountId:account,worker:workerName,coordinator:coordinatorName,databaseIds:ids,sourceDigest:seed.sourceDigest,nativeProofRun:seed.nativeProofRun,hostedWorkerCalls:0,hostedD1Queries:0,pagesDeployments:0,secretValuesLogged:false,stage:'preflight'};
 const save=()=>{assert(process.env.FEATURE_EVIDENCE);mkdirSync(process.env.FEATURE_EVIDENCE,{recursive:true});writeFileSync(join(process.env.FEATURE_EVIDENCE,'first-isolated-installation.json'),JSON.stringify({...evidence,explicitControlPlaneReads:controlPlaneReads},null,2)+'\n');};
 const redact=text=>redactInstallationDiagnostic(text,['CLOUDFLARE_API_TOKEN',...configWorker.secrets.required].map(k=>process.env[k]));
 const command=(args,label)=>{try{execFileSync(process.execPath,[wrangler,...args],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(temp,label+'.log')}});}catch(error){writeFileSync(join(process.env.FEATURE_EVIDENCE,label+'-failure.txt'),redact(String(error.stderr||error.stdout||error.message)).slice(-5000));throw Error('Feature '+label+' failed; sanitized diagnostic retained');}};
 const pathFor=(config,name)=>{const p=join(temp,name+'.json');writeFileSync(p,JSON.stringify({...config,main:resolve(root,'backend',config.main)}));return p;};
 const cpath=pathFor(coordinator,'coordinator'),wpath=pathFor(worker,'worker');
 try{
  await pin();assert.equal(await currentVersion(workerName),baseline.workerVersion);assert.equal(await currentVersion(coordinatorName),baseline.coordinatorVersion);
  const before=await api('/workers/scripts/'+workerName+'/settings'),placeholder=await api('/workers/scripts/'+coordinatorName+'/settings');
  assert.equal(before.bindings?.find(b=>b.name==='ACADEMY_D1_MODE')?.text,'PAUSED');assert.equal(placeholder.bindings?.length||0,0);
  for(const name of configWorker.secrets.required)assert(typeof process.env[name]==='string'&&process.env[name].length>=32,'Missing approved Feature secret: '+name);
  evidence.stage='coordinator';save();await pin();command(['deploy','--config',cpath],'coordinator');
  evidence.stage='worker-paused';save();await pin();command(['deploy','--config',wpath],'worker-paused');
  let ws=await api('/workers/scripts/'+workerName+'/settings'),cs=await api('/workers/scripts/'+coordinatorName+'/settings'),namespaces=isolatedNamespaces(ws,cs);
  const hasOldSecret=ws.bindings.some(b=>b.name==='HIFZ_PROFILE_SYNC_SECRET');
  const transitional={...worker,secrets:{required:[...worker.secrets.required,...(hasOldSecret?['HIFZ_PROFILE_SYNC_SECRET']:[])]}};
  assertRemoteSettings(ws,transitional,namespaces,false);assertRemoteSettings(cs,coordinator,namespaces,true);
  evidence.stage='isolated-secrets';save();
  if(hasOldSecret)await api('/workers/scripts/feature_worker/secrets/HIFZ_PROFILE_SYNC_SECRET','DELETE');
  const secretPath=join(temp,'approved-feature-secrets.json');
  try{writeFileSync(secretPath,JSON.stringify(Object.fromEntries(worker.secrets.required.map(k=>[k,process.env[k]]))),{mode:0o600});command(['secret','bulk',secretPath,'--config',wpath],'feature-secrets');}finally{rmSync(secretPath,{force:true});}
  ws=await api('/workers/scripts/'+workerName+'/settings');cs=await api('/workers/scripts/'+coordinatorName+'/settings');namespaces=isolatedNamespaces(ws,cs);
  assertRemoteSettings(ws,worker,namespaces,false);assertRemoteSettings(cs,coordinator,namespaces,true);
  for(const [name,isCoordinator]of [[workerName,false],[coordinatorName,true]]){
   const urls=await api('/workers/scripts/'+name+'/subdomain'),schedules=await api('/workers/scripts/'+name+'/schedules');
   assert.equal(urls.enabled,!isCoordinator);assert.equal(urls.previews_enabled,false);assert.deepEqual(Array.isArray(schedules)?schedules:schedules.schedules,[]);
  }
  await pin();Object.assign(evidence,namespaces,{state:'ISOLATED_PAUSED',stage:'verified',workerVersion:await currentVersion(workerName),coordinatorVersion:await currentVersion(coordinatorName),requiredSecretNames:worker.secrets.required,removedFeatureSecret:'HIFZ_PROFILE_SYNC_SECRET',featureActivated:false,automaticDeploymentEnabled:false});
  save();console.log(JSON.stringify({...evidence,explicitControlPlaneReads:controlPlaneReads}));
 }catch(error){
  evidence.state='INCOMPLETE';evidence.failure=error.message;
  try{evidence.featurePauseObserved=(await api('/workers/scripts/feature_worker/settings')).bindings?.find(b=>b.name==='ACADEMY_D1_MODE')?.text==='PAUSED';}catch{evidence.featurePauseObserved=false;}
  save();console.error(JSON.stringify(evidence));throw Error('First isolated setup incomplete; no old live binding rollback or app request attempted');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)await main();
