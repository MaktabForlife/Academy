// Synthetic values only. No actual private receipt/ACK/version/PIN.
import {readFileSync} from 'node:fs';
import {digest} from '../../tools/jwt-feature-upload-artifact.mjs';
import {basisBinding} from '../../tools/jwt-feature-activation-baseline.mjs';
import {plan} from '../../tools/jwt-feature-first-replacement-approved.mjs';
import {firstReplacementInputs} from '../../tools/jwt-feature-first-replacement-inputs.mjs';
export function pausedFixture(change=()=>{}){
 const b={...basisBinding},main='feature_worker',coord='academy-feature-split-coordinator',version='00000000-0000-4000-8000-000000000101';
 const identity={schema:1,repository:'MaktabForlife/Academy',source:b.source,runId:String(b.run),attempt:1,workflow:'.github/workflows/feature-jwt-paused-first-replacement.yml',request:plan.request,planSHA256:plan===null?'':b.planSHA256,executor:plan.executor,
  approval:{pr:17,merge:b.canonicalMerge,head:'3fe75bc7edcbe6d787ae3b0ab1788d584c430cca',statusId:58330505033,commentSHA256:'b'.repeat(64)},
  window:{window:plan.window.lease,commentId:1,commentSHA256:'c'.repeat(64),statusId:2,preparedRunId:42387955606,preparedProofSHA256:'d'.repeat(64),expires:'2026-11-07T16:21:22.950Z'},budget:plan.budgets,activation:false};
 const r={schema:1,state:'PAUSED_REPLACEMENT_CAPTURED_NOT_ACTIVATION',run:{source:b.source,runId:String(b.run),attempt:1},planSHA256:b.planSHA256,policySHA256:b.policySHA256,artifactSHA256:b.artifactSHA256,identity,
  actual:{provider:26,cli:1,paused:1},reserved:{metadataGETs:26,cli:1,pausedGETs:1},
  ack:{schema:1,target:main,versionId:version,source:b.source,configSHA256:'a'.repeat(64),wranglerVersion:'4.136.3',kind:'PINNED_CLI_DEPLOY_ACK',artifactSHA256:b.artifactSHA256},
  ownedMainVersion:version,observedVersions:{[main]:version,[coord]:firstReplacementInputs().reference.referenceVersions[coord]},remainingAllowanceReusable:false,wranglerInternalRequestsAndRetries:'separate-unmeasured',
  activated:false,cleanupVerified:false,legacyInstallationVerified:false,privateKeyVerified:false,remoteCodeReadbackVerified:false,assetRoutingReadbackVerified:false,metadataAtomic:false,hostedBilling:'unmeasured'};
 change(r);const bytes=Buffer.from(JSON.stringify(r));b.fileSHA256=digest(bytes);return {bytes,binding:b,receipt:r};
}
export const native=JSON.parse(readFileSync(new URL('../../../config/feature-initialisation-receipt.json',import.meta.url),'utf8'));

import {mkdtempSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {canonical} from '../../tools/jwt-feature-upload-artifact.mjs';
import {activationProfiles,activationPolicy} from '../../tools/jwt-feature-activation-baseline.mjs';
import {createFeatureReleaseOps} from '../../tools/jwt-feature-release-transport.mjs';
import {firstReplacementInputs as publicInputs} from '../../tools/jwt-feature-first-replacement-inputs.mjs';
export function activationMock({fault}={}){
 const f=pausedFixture(),source='c'.repeat(40),profiles=activationProfiles({...f,source,coordinatorSourceDigest:'8bdc622649bd20ceb3bc531b1161c7f42495105211a51f9e3dc2b8415f216465'});
 const main='feature_worker',coord='academy-feature-split-coordinator',directory=mkdtempSync(resolve(process.env.RUNNER_TEMP,'activation-mock-')),evidenceDirectory=resolve(directory,'evidence');
 const state={provider:0,cli:0,public:0,auth:0,paused:0,fresh:0,saves:0,authority:true,sessionCreated:false,loggedOut:false};
 const configs={[main]:profiles.before.worker,[coord]:profiles.before.coordinator},versions={...profiles.pausedBasis.referenceVersions};
 const publicBodies={'/academy/':'<html>synthetic accepted shell</html>','/auth/v110/browser-config.js':'window.SYNTHETIC=true;'};
 const assets=new Map(Object.entries(publicBodies).map(([k,v])=>[k,digest(v)]));
 const local=(c,label)=>({source,artifactSHA256:digest(label),assertFrozen(){},render(x){assert.deepEqual(x,c);return {...structuredClone(c),main:'/LOCAL_ONLY/'+label+'.mjs',no_bundle:true};}});
 const artifacts={feature_worker:local(profiles.active.worker,'active'),pausedWorker:local(profiles.paused.worker,'paused')},policy=activationPolicy(profiles,artifacts);
 function settings(c){
  const bindings=[];for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',database_id:b.database_id});
  for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
  for(const [name,text]of Object.entries(c.vars))bindings.push({name,type:'plain_text',text});
  for(const name of c.secrets?.required||[])bindings.push({name,type:'secret_text',text:'SECRET_MUST_NOT_ESCAPE'});
  for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
  const ns=publicInputs().reference.namespaces,ids={ProgramTimetableCoordinator:native.timetableNamespaceId,AcademySplitCoordinator:native.splitNamespaceId,JWTFeatureProgramTimetableCoordinator:ns.timetable,JWTFeatureAcademySplitCoordinator:ns.split};
  for(const b of c.durable_objects.bindings)bindings.push({name:b.name,type:'durable_object_namespace',class_name:b.class_name,namespace_id:ids[b.class_name],script_name:b.script_name||c.name});
  if(c.assets)bindings.push({name:'ASSETS',type:'assets'});return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,tail_consumers:[],observability:c.observability};
 }
 const fresh=async()=>{state.fresh++;if(!state.authority)throw Error('AUTHORITY_WITHDRAWN');};
 const fetcher=async(url,options={})=>{
  const u=new URL(url);
  if(u.origin==='https://api.cloudflare.com'){
   state.provider++;const [name,kind]=u.pathname.split('/').slice(7,9);assert([main,coord].includes(name));let result;
   if(fault==='foreign-before-cli'&&state.provider===11)versions[main]='00000000-0000-4000-8000-000000000999';
   if(kind==='settings')result=settings(configs[name]);else if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};else if(kind==='subdomain')result={enabled:name===main,previews_enabled:false};else if(kind==='schedules')result=[];else assert.fail('FORBIDDEN_PROVIDER');
   if(fault==='withdraw-before-cli'&&state.provider===12)state.authority=false;
   if(fault==='known-binding'&&state.provider===15&&kind==='settings')result.bindings[0].database_id='00000000-0000-4000-8000-000000000999';
   if(fault==='known-subdomain'&&state.provider===17&&kind==='subdomain')result.previews_enabled=true;
   if(fault==='known-schedule'&&state.provider===18&&kind==='schedules')result=[{cron:'* * * * *'}];
   if(fault==='late-final'&&state.provider===22)return Response.json({success:false},{status:500});
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,profiles.origin);const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(u.pathname==='/__jwt_feature_release'&&configs[main].vars.ACADEMY_D1_MODE==='PAUSED'){state.paused++;return Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers});}
  if(u.pathname==='/__jwt_feature_release'||publicBodies[u.pathname]){
   state.public++;
   if(fault==='public-'+state.public)return Response.json({},{status:500,headers});
   if(fault==='withdraw-after-adopt'){state.authority=false;return Response.json({},{status:500,headers});}
   if(fault==='foreign-after-adopt'){versions[main]='00000000-0000-4000-8000-000000000999';return Response.json({},{status:500,headers});}
   return u.pathname==='/__jwt_feature_release'?Response.json({featureOnly:true,sourceCommit:source,state:'ACTIVE'},{headers}):new Response(publicBodies[u.pathname],{headers});
  }
  state.auth++;const hs=new Headers(headers);let body={},status=200;
  if(fault==='auth-'+state.auth||(fault==='recovery-ack-loss'&&state.auth===1))return Response.json({},{status:500,headers});
  if(state.auth===1){
   assert.equal(JSON.parse(options.body).pin,'2468');state.sessionCreated=true;
   body={account:{accountId:'feature-synthetic-learner-a'},csrf:'A'.repeat(43),sessionKey:'uaa-session:SYNTHETIC'};
   for(const [k,v]of [['__Secure-uaa_a','SYNTHETIC_ACCESS'],['__Host-uaa_r','SYNTHETIC_REFRESH']])hs.append('Set-Cookie',k+'='+v+'; Path=/; Secure; HttpOnly; SameSite=Strict');
  }else{
   assert(options.headers.Cookie.includes('SYNTHETIC_ACCESS'));
   if(state.auth===3)body={account:{accountId:'feature-synthetic-learner-a'}};
   if(state.auth===5)status=403;
   if(state.auth===6)body={refreshed:true};
   if(state.auth===7){state.loggedOut=true;body={cancelled:true};for(const k of ['__Secure-uaa_a','__Host-uaa_r'])hs.append('Set-Cookie',k+'=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict');}
   if(state.auth===8)status=401;
  }
  return Response.json(body,{status,headers:hs});
 };
 const runWrangler=async(args,ctx)=>{
  state.cli++;assert.equal(ctx.name,main);configs[main]=ctx.config;versions[main]='00000000-0000-4000-8000-'+String(101+state.cli).padStart(12,'0');
  if(fault==='active-ack-loss'||(fault==='recovery-ack-loss'&&state.cli===2))return;
  const timestamp=new Date().toISOString();appendFileSync(ctx.env.WRANGLER_OUTPUT_FILE_PATH,[
   {type:'wrangler-session',version:1,wrangler_version:'4.136.3',command_line_args:args,log_file_path:'/LOCAL_ONLY/private',timestamp},
   {type:'deploy',version:1,worker_name:main,worker_tag:null,version_id:versions[main],worker_name_overridden:false,targets:[profiles.origin],timestamp}
  ].map(JSON.stringify).join('\n')+'\n');
 };
 const options={root:process.cwd(),directory,evidenceDirectory,profiles,nativeReceipt:native,source,fresh,recoveryFresh:fresh,token:'SYNTHETIC_CF',pin:'2468',assets,artifacts,writePolicy:policy,writePolicySHA256:digest(canonical(policy)),fetcher,runWrangler};
 const ops=createFeatureReleaseOps(options),save=ops.save;
 ops.save=e=>{state.saves++;if(fault==='final-persistence'&&state.saves===3)throw Error('WRITE_FAILED');return save(e);};
 return {f,source,profiles,directory,evidenceDirectory,state,options,ops,artifacts,assets,policy,fetcher,runWrangler,fresh};
}
