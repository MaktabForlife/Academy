// Read-only control plane: no Worker invocation or D1/R2 data API.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const account='c9a3e355b3d7a795880b1d36a1dbe123',names=['feature_worker','academy-feature-split-coordinator'];
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,v[k]]));
export function safeBindings(bindings=[]){
 return bindings.map(b=>({...pick(b,['name','type']),...pick(b,b.type==='d1'?['id']:b.type==='r2_bucket'?['bucket_name']:b.type==='durable_object_namespace'?['class_name','namespace_id','script_name']:b.type==='ratelimit'?['namespace_id','simple']:b.type==='plain_text'&&['ACADEMY_D1_MODE','ENVIRONMENT','ACADEMY_DEPLOYMENT_KIND'].includes(b.name)?['text']:[])}));
}
export async function readFeaturePreflight({token,request=fetch}){
 assert(token,'The approved Feature credential is missing.');
 let controlPlaneReads=0;
 const api=async path=>{
  assert(/^\/(?:workers\/scripts\/(?:feature_worker|academy-feature-split-coordinator)\/(?:settings|subdomain|schedules|deployments|versions\/[a-f0-9-]+)|pages\/projects\/academy-maktab4life)$/.test(path),'Unreviewed Feature metadata path');
  controlPlaneReads++;
  const response=await request('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Feature metadata read '+path+' returned HTTP '+response.status);
  const value=await response.json();assert.equal(value.success,true,'Feature metadata read was unsuccessful');return value.result;
 };
 const receipt={schema:1,kind:'CONTROL_PLANE_ONLY_NOT_READINESS',at:new Date().toISOString(),accountId:account,workers:[],hostedWorkerCalls:0,hostedD1Queries:0,hostedR2Calls:0};
 for(const name of names){
  const settings=await api('/workers/scripts/'+name+'/settings'),urls=await api('/workers/scripts/'+name+'/subdomain'),schedules=await api('/workers/scripts/'+name+'/schedules');
  const deployments=await api('/workers/scripts/'+name+'/deployments'),latest=(deployments.deployments||deployments)[0];
  assert.equal(latest?.versions?.length,1,'A single current Feature version is required');
  const id=latest.versions[0].version_id;assert.match(id,/^[a-f0-9-]{36}$/);
  const version=await api('/workers/scripts/'+name+'/versions/'+id);
  receipt.workers.push({name,versionId:id,migrationTag:version.resources?.script?.migration_tag??version.migration_tag??null,compatibilityDate:settings.compatibility_date,compatibilityFlags:settings.compatibility_flags,bindings:safeBindings(settings.bindings),subdomain:pick(urls,['enabled','previews_enabled']),schedules:Array.isArray(schedules)?schedules:schedules.schedules});
 }
 const page=await api('/pages/projects/academy-maktab4life'),preview=page.deployment_configs?.preview||{};
 receipt.pages={name:page.name,productionBranch:page.production_branch,previewBindingCounts:Object.fromEntries(['d1_databases','r2_buckets','kv_namespaces','durable_object_namespaces','services','service_bindings','env_vars'].map(k=>[k,Object.keys(preview[k]||{}).length]))};
 receipt.controlPlaneReads=controlPlaneReads;assert.equal(controlPlaneReads,11);return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const receipt=await readFeaturePreflight({token:process.env.CLOUDFLARE_API_TOKEN});assert(process.argv[2]);mkdirSync(process.argv[2],{recursive:true});
 writeFileSync(resolve(process.argv[2],'feature-control-plane-preflight.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({kind:receipt.kind,controlPlaneReads:receipt.controlPlaneReads,hostedWorkerCalls:0,hostedD1Queries:0,hostedR2Calls:0,mutations:0}));
}
