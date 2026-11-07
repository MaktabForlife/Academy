import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {plan,planSHA256,workflowPath,privateJSONFile,contextDirectory} from '../tools/jwt-feature-first-replacement-approved.mjs';
import {firstReplacementInputs} from '../tools/jwt-feature-first-replacement-inputs.mjs';
import {executeFirstReplacement,publishFirstReplacement} from '../tools/jwt-feature-first-replacement-execute.mjs';
import {createFeatureReleaseOps} from '../tools/jwt-feature-release-transport.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('HOSTED_FETCH_FORBIDDEN_SOURCE_CHECK');};
const load=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8')),manifest=load(plan.inputManifest),baseline=load('config/feature-initialisation-receipt.json');
const main='feature_worker',coord='academy-feature-split-coordinator',uuid='00000000-0000-4000-8000-000000000101';
const canary='UNINSTALLED_LOCAL_CREDENTIAL_CANARY';
function settings(c,reference){
 const bindings=[];
 for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',database_id:b.database_id});
 for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars||{}))bindings.push({name,type:'plain_text',text});
 for(const name of c.secrets?.required||[])bindings.push({name,type:'secret_text',text:'UNINSTALLED_SECRET_VALUE_CANARY'});
 for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 const ids={ProgramTimetableCoordinator:baseline.timetableNamespaceId,AcademySplitCoordinator:baseline.splitNamespaceId,JWTFeatureProgramTimetableCoordinator:reference.namespaces.timetable,JWTFeatureAcademySplitCoordinator:reference.namespaces.split};
 for(const b of c.durable_objects.bindings)bindings.push({name:b.name,type:'durable_object_namespace',class_name:b.class_name,namespace_id:ids[b.class_name],script_name:b.script_name||c.name});
 if(c.assets)bindings.push({name:'ASSETS',type:'assets'});
 return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,tail_consumers:[],observability:c.observability};
}
function harness({failure}={}){
 const temp=mkdtempSync(resolve(process.env.RUNNER_TEMP,'first-private-mock-')),source='a'.repeat(40);
 const context={repository:'MaktabForlife/Academy',ref:'refs/heads/feature-preview',event:'workflow_dispatch',source,runId:'2001',attempt:'1',workflowRef:'MaktabForlife/Academy/'+workflowPath+'@refs/heads/feature-preview'};
 const {configs,reference}=firstReplacementInputs(),versions={...reference.referenceVersions};
 const state={provider:0,cli:0,paused:0,tokenReads:0,restores:0,freshCalls:0,approved:true,dir:null};
 const proof={pr:101,mergeSha:'b'.repeat(40),headSha:'c'.repeat(40),approvalStatusId:11,commentHash:'d'.repeat(64)};
 const window={window:plan.window.lease,commentId:8,commentSHA256:'e'.repeat(64),statusId:12,preparedRunId:1000,preparedProofSHA256:'f'.repeat(64),expires:new Date(Date.now()+600000).toISOString()};
 const fresh=async()=>{
  state.freshCalls++;
  if(failure==='before-first-fetch'&&state.freshCalls===4)state.approved=false;
  if(!state.approved)throw Error('WITHDRAWN_LOCAL_GATE');
 };
 const approval=async()=>({proof,window,fresh});
 const compile=async({source,directory})=>{
  state.dir=directory;
  const artifact={source,artifactSHA256:manifest.worker.artifactSHA256,assertFrozen(){},render(c){assert.deepEqual(c,configs.worker);return {...structuredClone(c),main:'/LOCAL_ONLY/frozen.mjs',no_bundle:true};}};
  const m=structuredClone(manifest);m.recipeSource=source;
  if(failure==='manifest')m.worker.provenance.codeSHA256='0'.repeat(64);
  if(failure==='initial-writer')writeFileSync(resolve(directory,'.checkpoint.json.new'),'BLOCKED');
  return {manifest:m,artifact,configs,reference,hostingSHA256:'0'.repeat(64),restore(){state.restores++;}};
 };
 const fetcher=async(url,options)=>{
  const u=new URL(url);
  if(u.origin==='https://api.cloudflare.com'){
   state.provider++;const [name,kind]=u.pathname.split('/').slice(7,9);assert([main,coord].includes(name));let result;
   if(kind==='settings')result=settings(name===main?configs.worker:configs.coordinator,reference);
   else if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};
   else if(kind==='subdomain')result={enabled:name===main,previews_enabled:false};
   else if(kind==='schedules')result=[];else assert.fail('EXACT_METADATA_ONLY');
   if(failure==='last-fence'&&state.provider===12)state.approved=false;
   if(failure==='late-writer'&&state.provider===26)writeFileSync(resolve(state.dir,'.checkpoint.json.new'),'BLOCKED');
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,'https://feature_worker.maktab4life.workers.dev');assert.equal(u.pathname,'/__jwt_feature_release');
  assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);state.paused++;
  return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 };
 const invokeCLI=(args,ctx)=>{
  state.cli++;versions[main]=uuid;
  if(failure==='missing-ack')return;
  const timestamp=new Date().toISOString(),records=[
   {type:'wrangler-session',version:1,wrangler_version:'4.136.3',command_line_args:args,log_file_path:'/LOCAL_ONLY/PRIVATE_LOG_CANARY',timestamp},
   {type:'deploy',version:1,worker_name:main,worker_tag:null,version_id:uuid,worker_name_overridden:false,targets:['https://feature_worker.maktab4life.workers.dev'],timestamp}
  ];appendFileSync(ctx.env.WRANGLER_OUTPUT_FILE_PATH,records.map(JSON.stringify).join('\n')+'\n');
 };
 const opsFactory=options=>{
  if(failure==='foreign-url'){const real=createFeatureReleaseOps(options);real.preflight=()=>options.fetcher('https://example.invalid/forbidden',{redirect:'error',cache:'no-store'});return real;}
  return createFeatureReleaseOps(options);
 };
 return {temp,context,state,args:{api:()=>assert.fail('No GitHub or Cloudflare live API'),mergeSha:proof.mergeSha,prNumber:101,context,runnerTemp:temp,getToken:()=>{state.tokenReads++;return canary;},registrationComment:8,registrationStatus:12,preparedRunId:1000,fetcher,compile,approval,invokeCLI,opsFactory}};
}
test('complete private mock performs only26 metadata/1CLI/1paused attempts with bound safe receipt',async()=>{
 const h=harness(),r=await executeFirstReplacement(h.args);
 assert.equal(r.state,'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION');assert.equal(r.activated,false);assert.equal(h.state.tokenReads,1);
 assert.deepEqual([h.state.provider,h.state.cli,h.state.paused,h.state.restores],[26,1,1,1]);
 const published=publishFirstReplacement({context:h.context,runnerTemp:h.temp,executorOutcome:'success'});
 assert.equal(published.state,r.state);assert.equal(published.ownedMainVersion,uuid);assert.equal(published.remainingAllowanceReusable,false);
 for(const value of [canary,'UNINSTALLED_SECRET_VALUE_CANARY','PRIVATE_LOG_CANARY','/LOCAL_ONLY/'])assert(!JSON.stringify(published).includes(value));
});
for(const failure of ['manifest','initial-writer'])test('bad '+failure+' stops before credential retrieval or hosted effects',async()=>{
 const h=harness({failure});await assert.rejects(executeFirstReplacement(h.args));
 assert.equal(h.state.tokenReads,0);assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[0,0,0]);assert.equal(h.state.restores,1);
 const r=publishFirstReplacement({context:h.context,runnerTemp:h.temp,executorOutcome:'failure'});assert.equal(r.state,'UNKNOWN_MISSING_PARTIAL_OR_FAILED_EXECUTION');assert.equal(r.actual,null);
});
test('late fence withdrawal blocks the real private CLI boundary with no upload',async()=>{
 const h=harness({failure:'last-fence'});await assert.rejects(executeFirstReplacement(h.args));
 assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[12,0,0]);
});
test('withdrawal before the first actual metadata fetch can spend a reservation but issues no request',async()=>{
 const h=harness({failure:'before-first-fetch'});await assert.rejects(executeFirstReplacement(h.args));
 assert.equal(h.state.tokenReads,1);assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[0,0,0]);
});
test('a foreign URL is blocked before any injected network dispatch',async()=>{
 const h=harness({failure:'foreign-url'});await assert.rejects(executeFirstReplacement(h.args));
 assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[0,0,0]);
});
test('a missing actual CLI ACK stops without adoption or paused probing',async()=>{
 const h=harness({failure:'missing-ack'});await assert.rejects(executeFirstReplacement(h.args));
 assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[12,1,0]);
 const r=publishFirstReplacement({context:h.context,runnerTemp:h.temp,executorOutcome:'failure'});assert.equal(r.actual,null);assert.equal(r.activated,false);
});
test('late bound receipt failure performs no extra effect and apparent core success stays UNKNOWN',async()=>{
 const h=harness({failure:'late-writer'});await assert.rejects(executeFirstReplacement(h.args));
 assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[26,1,1]);assert.equal(h.state.restores,1);
 const r=publishFirstReplacement({context:h.context,runnerTemp:h.temp,executorOutcome:'failure'});assert.equal(r.state,'UNKNOWN_MISSING_PARTIAL_OR_FAILED_EXECUTION');assert.equal(r.actual,null);
});
test('the private run directory cannot be reused to retrieve a second credential or repeat an effect',async()=>{
 const h=harness();await executeFirstReplacement(h.args);await assert.rejects(executeFirstReplacement(h.args));
 assert.equal(h.state.tokenReads,1);assert.deepEqual([h.state.provider,h.state.cli,h.state.paused],[26,1,1]);
});
for(const kind of ['identity-extra','ack-extra','failed-step','wrong-context'])test('publisher refuses '+kind+' and does not disclose arbitrary private data',async()=>{
 const h=harness();await executeFirstReplacement(h.args);const dir=contextDirectory(h.temp,h.context),value=privateJSONFile(dir,'checkpoint.json');
 if(kind==='identity-extra'){
  const identity=privateJSONFile(dir,'execution-identity.json');identity.secret=canary;value.identity=identity;
  privateJSONFile(dir,'execution-identity.json',{value:identity});privateJSONFile(dir,'checkpoint.json',{value});
 }
 if(kind==='ack-extra'){value.core.lastAcknowledgedUploads[main].secret=canary;privateJSONFile(dir,'checkpoint.json',{value});}
 const r=publishFirstReplacement({context:kind==='wrong-context'?{...h.context,source:'f'.repeat(40)}:h.context,runnerTemp:h.temp,executorOutcome:kind==='failed-step'?'failure':'success'});
 assert.equal(r.state,'UNKNOWN_MISSING_PARTIAL_OR_FAILED_EXECUTION');assert.equal(r.actual,null);assert.equal(r.remainingAllowanceReusable,false);assert(!JSON.stringify(r).includes(canary));
});
