// First activation of an already isolated, seeded and PAUSED Feature only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkFeatureTargets} from './feature-target-guard.mjs';
import {assertRemoteSettings} from './feature-deploy.mjs';
import {featureSmoke,workerOrigin,portalOrigin} from './feature-bounded-smoke.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 assert.equal(process.env.FEATURE_INITIALISE_ACTION,'activate-bounded');assert.equal(process.env.FEATURE_HOSTED_BUDGET_PROFILE,'six-worker-two-pages');
 checkFeatureTargets(root);assert.equal(read('config/feature-initialisation-receipt.json').state,'PENDING');
 const pausedReceipt=read('config/feature-paused-installation-receipt.json'),seed=read('config/feature-seed-installation-receipt.json'),budget=read('config/feature-smoke-budget.json');
 assert.equal(pausedReceipt.state,'ISOLATED_PAUSED');assert.equal(seed.state,'SEEDED_VERIFIED');assert.equal(pausedReceipt.sourceDigest,seed.sourceDigest);
 assert.equal(budget.workerRequestLimit,6);assert.equal(budget.pagesRequestLimit,2);assert.equal(budget.localEvidence.hostedDatabaseReads,0);assert.equal(budget.localEvidence.hostedWorkerCalls,0);
 assert(Number.isSafeInteger(budget.projectedRowsReadAllowance)&&budget.projectedRowsReadAllowance>=budget.localEvidence.totals.d1RowsRead);
 const account='c9a3e355b3d7a795880b1d36a1dbe123',base='https://api.cloudflare.com/client/v4/accounts/'+account;
 assert.equal(pausedReceipt.accountId,account);const apiToken=process.env.CLOUDFLARE_API_TOKEN;assert(apiToken);
 let controlPlaneReads=0,pagesRequests=0,changed=false,sessionOpen=false;
 const api=async path=>{assert(/^\/workers\/scripts\/(feature_worker|academy-feature-split-coordinator)\/(settings|subdomain|schedules|deployments)$|^\/pages\/projects\/academy-maktab4life$/.test(path));controlPlaneReads++;const r=await fetch(base+path,{headers:{Authorization:'Bearer '+apiToken},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Feature metadata HTTP '+r.status);const b=await r.json();assert.equal(b.success,true);return b.result;};
 const head=async()=>{const r=await fetch('https://api.github.com/repos/MaktabForlife/Academy/git/ref/heads/feature-preview',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});assert(r.ok);assert.equal((await r.json()).object.sha,process.env.GITHUB_SHA,'Feature source advanced');};
 const worker=read('backend/wrangler.feature.jsonc'),coordinator=read('backend/wrangler.feature-coordinator.jsonc');
 worker.vars={...worker.vars,ACADEMY_D1_RUN_ID:seed.sourceDigest};
 const receipt={...seed,...pausedReceipt},active={...worker,vars:{...worker.vars,ACADEMY_D1_MODE:'ACTIVE'}};
 const settings=async(config,isCoordinator=false)=>{assertRemoteSettings(await api('/workers/scripts/'+config.name+'/settings'),config,receipt,isCoordinator);const urls=await api('/workers/scripts/'+config.name+'/subdomain');assert.equal(urls.enabled,!isCoordinator);assert.equal(urls.previews_enabled,false);const s=await api('/workers/scripts/'+config.name+'/schedules');assert.deepEqual(Array.isArray(s)?s:s.schedules,[]);};
 const version=async name=>{const r=await api('/workers/scripts/'+name+'/deployments'),d=(r.deployments||r)[0];assert.equal(d.versions.length,1);return d.versions[0].version_id;};
 const temp=mkdtempSync(join(tmpdir(),'feature-initial-activation-')),wrangler=join(root,'backend/node_modules/wrangler/bin/wrangler.js');
 const configFor=(config,label)=>{const p=join(temp,label+'.json'),out={...config,main:resolve(root,'backend',config.main)};delete out.migrations;delete out.$schema;writeFileSync(p,JSON.stringify(out));return p;};
 const command=(args,label)=>{try{execFileSync(process.execPath,[wrangler,...args],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(temp,label+'.log')}});}catch{throw Error('Feature '+label+' failed; no raw credential-bearing diagnostic is retained');}};
 const evidence={schema:1,commit:process.env.GITHUB_SHA,accountId:account,state:'PREFLIGHT',success:false,hostedSyntheticSuites:0,hostedDatabaseScans:0,projectedSmokeRowsRead:budget.localEvidence.totals.d1RowsRead,projectedRowsReadAllowance:budget.projectedRowsReadAllowance,hostedRowsReadMeasured:false,secretChanges:0,databaseWritesByDeploymentTool:0};
 const save=()=>{assert(process.env.FEATURE_EVIDENCE);mkdirSync(process.env.FEATURE_EVIDENCE,{recursive:true});writeFileSync(join(process.env.FEATURE_EVIDENCE,'initial-activation.json'),JSON.stringify({...evidence,pagesRequests,explicitControlPlaneReads:controlPlaneReads,sessionOpen},null,2)+'\n');};
 try{
  await head();await settings(worker);await settings(coordinator,true);
  assert.equal(await version(worker.name),pausedReceipt.workerVersion);assert.equal(await version(coordinator.name),pausedReceipt.coordinatorVersion);
  const page=await api('/pages/projects/academy-maktab4life');assert.equal(page.production_branch,'development');
  for(const key of ['d1_databases','r2_buckets','kv_namespaces','durable_object_namespaces','services','service_bindings','env_vars'])assert.equal(Object.keys(page.deployment_configs?.preview?.[key]||{}).length,0,'Unexpected Pages preview binding');
  const pageFetch=async path=>{assert(pagesRequests<2);pagesRequests++;return fetch(portalOrigin+path,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});};
  await head();command(['pages','deploy',join(root,'.academy-pages'),'--project-name','academy-maktab4life','--branch','feature-preview','--commit-hash',process.env.GITHUB_SHA,'--commit-dirty=true'],'pages-preview');
  evidence.state='PAGES_PREVIEW';save();
  const marker=await pageFetch('/feature-build.json?commit='+process.env.GITHUB_SHA);evidence.pageMarkerStatus=marker.status;save();assert.equal(marker.status,200,'Feature build marker route failed');const m=await marker.json();evidence.observedMarker={commit:typeof m.commit==='string'&&/^[a-f0-9]{40}$/.test(m.commit)?m.commit:'INVALID',branch:m.branch==='feature-preview'?'feature-preview':'INVALID'};save();assert.equal(m.commit,process.env.GITHUB_SHA);assert.equal(m.branch,'feature-preview');
  const html=await pageFetch('/academy/');assert.equal(html.status,200);assert((await html.text()).includes('login-preview'));
  assert.equal((await api('/pages/projects/academy-maktab4life')).production_branch,'development');
  await head();changed=true;command(['deploy','--config',configFor(active,'active')],'active-worker');await settings(active);
  evidence.state='ACTIVE_BOUNDED_CHECK';save();
  evidence.smoke=await featureSmoke({request:fetch,pin:process.env.FEATURE_TEST_ADMIN_PIN,onSession:value=>{sessionOpen=value;}});
  await settings(active);await settings(coordinator,true);await head();
  evidence.workerVersion=await version(worker.name);evidence.coordinatorVersion=await version(coordinator.name);evidence.state='VERIFIED';evidence.success=true;save();
  const initialisation={...read('config/feature-initialisation-receipt.json'),state:'VERIFIED',sourceDigest:seed.sourceDigest,timetableNamespaceId:receipt.timetableNamespaceId,splitNamespaceId:receipt.splitNamespaceId,nativeProofRun:seed.nativeProofRun,verifiedAt:new Date().toISOString(),initialVerificationRun:Number(process.env.GITHUB_RUN_ID),initialVerificationCommit:process.env.GITHUB_SHA};
  writeFileSync(join(process.env.FEATURE_EVIDENCE,'feature-initialisation-receipt.json'),JSON.stringify(initialisation,null,2)+'\n');
  console.log(JSON.stringify({state:evidence.state,workerRequests:evidence.smoke.workerRequests,pagesRequests,credentialsLogged:false,automaticDeploymentEnabled:false}));
 }catch(error){
  if(error.safeEvidence)evidence.smoke=error.safeEvidence;evidence.failureStage=evidence.state;
  if(changed){try{command(['deploy','--config',configFor(worker,'paused')],'pause-recovery');await settings(worker);evidence.recovery='ISOLATED_FEATURE_PAUSED';}catch{evidence.recovery='PAUSE_NOT_VERIFIED';}}
  else evidence.recovery='WORKER_REMAINS_PAUSED';
  evidence.state='INCOMPLETE';save();throw Error('Bounded Feature initialisation incomplete; '+evidence.recovery);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)await main();
