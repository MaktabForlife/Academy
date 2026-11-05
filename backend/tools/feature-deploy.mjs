// Routine deployment only. No SQL, seed, secret upload or resource creation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkFeatureTargets} from './feature-target-guard.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname);
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const liveNamespaces=new Set(['b722f4cf54a04d6fb2a5a299e12722e2','aa75328c13ee4f42b406ccf5ebbe851a']);
export function assertInitialised(r){
 assert.equal(r.schema,1);assert.equal(r.state,'VERIFIED','Initial isolated setup is not verified');
 assert.equal(r.accountId,'c9a3e355b3d7a795880b1d36a1dbe123');assert.equal(r.worker,'feature_worker');assert.equal(r.coordinator,'academy-feature-split-coordinator');
 assert.deepEqual(r.databaseIds,['0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8','18ad0efb-cd34-42a4-b510-7051f0303200']);
 assert.deepEqual(r.schemaHashes,{core:'d7eb88199269195a20b44dad26b1663792e493631fa26690bc915af416772464',admin:'0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830'});
 assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(r.nativeProofRun)&&r.nativeProofRun>0);assert(Number.isFinite(Date.parse(r.verifiedAt)));
 for(const id of [r.timetableNamespaceId,r.splitNamespaceId]){assert.match(id,/^[a-f0-9]{32}$/);assert(!liveNamespaces.has(id),'Live coordinator namespace');}
 assert.notEqual(r.timetableNamespaceId,r.splitNamespaceId);return r;
}
export function assertRemoteSettings(settings,config,receipt,isCoordinator=false){
 const bindings=settings.bindings||[],seen=new Set();
 const expected=new Map();
 for(const b of config.d1_databases)expected.set(b.binding,{type:'d1',id:b.database_id});
 for(const b of config.r2_buckets||[])expected.set(b.binding,{type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(config.vars||{}))expected.set(name,{type:'plain_text',text});
 for(const name of config.secrets?.required||[])expected.set(name,{type:'secret_text'});
 if(!isCoordinator)expected.set('AUTH_LOGIN_RATE_LIMITER',{type:'ratelimit',namespace_id:'100111',simple:{limit:5,period:60}});
 for(const b of config.durable_objects.bindings)expected.set(b.name,{type:'durable_object_namespace',class_name:b.class_name,namespace_id:b.class_name==='ProgramTimetableCoordinator'?receipt.timetableNamespaceId:receipt.splitNamespaceId});
 assert.equal(bindings.length,expected.size,'Unexpected installed binding count');
 for(const b of bindings){
  assert(!seen.has(b.name),'Duplicate binding');seen.add(b.name);const e=expected.get(b.name);assert(e,'Unreviewed installed binding: '+b.name);
  for(const [key,value]of Object.entries(e))assert.deepEqual(b[key],value,'Installed binding mismatch: '+b.name+'/'+key);
  if(b.type==='durable_object_namespace'&&b.script_name)assert.equal(b.script_name,b.class_name==='AcademySplitCoordinator'?receipt.coordinator:receipt.worker);
 }
 assert.equal(settings.compatibility_date,config.compatibility_date);assert.deepEqual(settings.compatibility_flags,config.compatibility_flags);
 assert.equal(settings.tail_consumers?.length||0,0,'Unreviewed tail consumer');
 return true;
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 assert.match(process.env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 checkFeatureTargets(root);const receipt=assertInitialised(read('config/feature-initialisation-receipt.json'));
 const token=process.env.CLOUDFLARE_API_TOKEN;assert(token,'Feature deployment credential is missing');
 const account=receipt.accountId,base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const api=async path=>{
  const response=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Feature metadata read failed: '+response.status);
  const data=await response.json();assert.equal(data.success,true);return data.result;
 };
 const head=async()=>{
  const response=await fetch('https://api.github.com/repos/MaktabForlife/Academy/git/ref/heads/feature-preview',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
  assert(response.ok);assert.equal((await response.json()).object.sha,process.env.GITHUB_SHA,'A newer ready commit exists');
 };
 const worker=read('backend/wrangler.feature.jsonc'),coordinator=read('backend/wrangler.feature-coordinator.jsonc');
 worker.vars={...worker.vars,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:receipt.sourceDigest};
 const settings=async(c,isCoordinator)=>{
  const s=await api('/workers/scripts/'+c.name+'/settings');assertRemoteSettings(s,c,receipt,isCoordinator);
  const urls=await api('/workers/scripts/'+c.name+'/subdomain');assert.equal(urls.enabled,!isCoordinator);assert.equal(urls.previews_enabled,false);
  const crons=await api('/workers/scripts/'+c.name+'/schedules');assert.deepEqual(Array.isArray(crons)?crons:crons.schedules,[]);
 };
 const page=await api('/pages/projects/academy-maktab4life');assert.equal(page.name,'academy-maktab4life');assert(page.production_branch&&page.production_branch!=='feature-preview','Feature must remain a Pages preview');
 const preview=page.deployment_configs?.preview||{};
 for(const key of ['d1_databases','r2_buckets','kv_namespaces','durable_object_namespaces','services','service_bindings','env_vars'])assert.equal(Object.keys(preview[key]||{}).length,0,'Unexpected Pages preview binding');
 await head();await settings(worker,false);await settings(coordinator,true);
 const temp=mkdtempSync(join(tmpdir(),'academy-feature-deploy-')),wrangler=join(root,'backend/node_modules/wrangler/bin/wrangler.js');
 const command=(args,label)=>{try{execFileSync(process.execPath,[wrangler,...args],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(temp,label+'.log')}});}catch{throw Error('Feature '+label+' failed; inspect the bounded metadata receipt.');}};
 const configPath=(c,name)=>{
  const next={...c,main:resolve(root,'backend',c.main)};delete next.$schema;delete next.migrations;
  const path=join(temp,name+'.json');writeFileSync(path,JSON.stringify(next));return path;
 };
 const wpath=configPath(worker,'worker'),cpath=configPath(coordinator,'coordinator');
 const evidence={commit:process.env.GITHUB_SHA,account,worker:worker.name,coordinator:coordinator.name,pagesBranch:'feature-preview',databaseWritesByTool:0,secretChanges:0,stage:'preflight',success:false};
 const save=()=>{if(process.env.FEATURE_EVIDENCE){mkdirSync(process.env.FEATURE_EVIDENCE,{recursive:true});writeFileSync(join(process.env.FEATURE_EVIDENCE,'deployment.json'),JSON.stringify(evidence,null,2)+'\n');}};
 let changed=false;
 try{
  await head();changed=true;command(['deploy','--config',cpath],'coordinator');await settings(coordinator,true);
  evidence.stage='coordinator';save();command(['deploy','--config',wpath],'worker');await settings(worker,false);
  evidence.stage='worker';save();
  assert.equal((await api('/pages/projects/academy-maktab4life')).production_branch,page.production_branch,'Pages production branch changed');
  command(['pages','deploy',join(root,'.academy-pages'),'--project-name','academy-maktab4life','--branch','feature-preview','--commit-hash',process.env.GITHUB_SHA,'--commit-dirty=true'],'pages');
  evidence.stage='pages';save();
  let verified=false;
  for(let attempt=0;attempt<4;attempt++){
   const response=await fetch('https://feature-preview.academy-maktab4life.pages.dev/feature-build.json?commit='+process.env.GITHUB_SHA,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.ok){const marker=await response.json();if(marker.commit===process.env.GITHUB_SHA&&marker.branch==='feature-preview'){verified=true;break;}}
   if(attempt<3)await new Promise(done=>setTimeout(done,[1000,2000,4000][attempt]));
  }
  assert(verified,'Feature Pages commit marker did not match');
  const health=await fetch('https://feature_worker.maktab4life.workers.dev/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(health.status,200);
  const body=await health.json();assert.equal(body.success,true);assert.equal(String(body.version),String(read('version.json').version));
  await settings(worker,false);await settings(coordinator,true);evidence.success=true;evidence.stage='verified';save();
  console.log(JSON.stringify(evidence));
 }catch(error){
  evidence.failureStage=evidence.stage;
  if(changed){
   try{
    const paused={...worker,vars:{...worker.vars,ACADEMY_D1_MODE:'PAUSED'}};
    command(['deploy','--config',configPath(paused,'paused')],'pause-recovery');
    assertRemoteSettings(await api('/workers/scripts/'+worker.name+'/settings'),paused,receipt,false);
    const response=await fetch('https://feature_worker.maktab4life.workers.dev/api/health',{signal:AbortSignal.timeout(15000)});assert.equal(response.status,503);evidence.recovery='FEATURE_PAUSED';
   }catch{evidence.recovery='PAUSE_NOT_VERIFIED';}
  }
  save();console.error(JSON.stringify(evidence));throw Error('Feature deployment failed; '+(evidence.recovery||'no deployment started'));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)await main();
