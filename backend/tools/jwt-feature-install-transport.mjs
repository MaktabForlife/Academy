// Concrete Cloudflare/Wrangler adapters. No D1, Pages, account, DNS or token API.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {account} from './jwt-feature-transition.mjs';
import {assertRemoteProfile,currentVersion,sanitiseSettings} from './jwt-feature-install-metadata.mjs';
import {completeInstallPackage,assertNoTemporarySurface,temporarySecrets,finalSecrets,origin} from './jwt-feature-install-package.mjs';
export function createInstallOps({root,directory,evidenceDirectory,p,baseline,expectedVersions,schemaReceipt,contract,token,candidateGuard,fetcher=fetch,runWrangler}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 const names=['feature_worker','academy-feature-split-coordinator'],expected={...expectedVersions},states=new Map(),namespaces={};
 const config=new Map(),secretNames=new Set(p.baseWorker.secrets.required),oldSecrets=[...secretNames],report={explicitCloudflareGets:0,secretBulkPatches:0,wranglerAttempts:0,httpProbes:0,recoveryHTTPProbes:0,schemaExecuteAttempts:0,schemaStatusAttempts:0,setupExecuteAttempts:0,setupStatusAttempts:0};
 const tokenValue=token;let final=null,lastLabel=null;
 assert(tokenValue,'FEATURE_TOKEN_REQUIRED');assert.deepEqual(Object.keys(expected).sort(),[...names].sort());
 const nativeWorker=structuredClone(p.baseWorker);nativeWorker.vars={...nativeWorker.vars,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:baseline.sourceDigest};
 config.set(names[0],nativeWorker);config.set(names[1],structuredClone(p.baseCoordinator));
 const out=resolve(directory),publicOut=resolve(evidenceDirectory||resolve(directory,'public'));mkdirSync(out,{recursive:true,mode:0o700});mkdirSync(publicOut,{recursive:true});
 for(const [path,value]of Object.entries(p.sources)){const target=resolve(root,path);assert(target.startsWith(resolve(root)+'/backend/src/'));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,value);}
 const cf=async(path,{method='GET',secrets}={})=>{
  assert(/^\/workers\/scripts\/(?:feature_worker|academy-feature-split-coordinator)\/(?:settings|deployments|subdomain|schedules|secrets-bulk)$/.test(path),'CF_SCOPE');
  if(method==='GET'){report.explicitCloudflareGets++;assert(report.explicitCloudflareGets<=60,'CF_READ_BUDGET');}
  else{assert(method==='PATCH'&&path==='/workers/scripts/feature_worker/secrets-bulk','CF_WRITE_SCOPE');assert(secrets&&Object.keys(secrets).every(x=>[...temporarySecrets,...finalSecrets].includes(x)),'NATIVE_SECRET_CHANGE_FORBIDDEN');}
  let response;try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+tokenValue,...(secrets?{'Content-Type':'application/json'}:{})},...(secrets?{body:JSON.stringify({secrets})}:{})});}catch{throw Error('CF_TRANSPORT_UNKNOWN');}
  if(!response.ok)throw Error('CF_'+method+'_STATUS_'+response.status);
  let body;try{body=await response.json();}catch{throw Error('CF_RESPONSE');}
  if(body.success!==true)throw Error('CF_FAILED');
  // Bulk mutation responses may have secret-shaped fields. Never return them.
  if(method!=='GET'){report.secretBulkPatches++;return true;}
  if(path.endsWith('/settings'))return sanitiseSettings(body.result);
  return body.result;
 };
 const getVersion=async name=>currentVersion(await cf('/workers/scripts/'+name+'/deployments'));
 const getSettings=async name=>cf('/workers/scripts/'+name+'/settings');
 const verify=async(name,c,{discover=false}={})=>{
  const s=await getSettings(name);assertRemoteProfile(s,c,baseline,namespaces,{secretNames:name===names[0]?[...secretNames]:[],discover});
  const version=await getVersion(name);states.set(name,{settings:s,version});return version;
 };
 const address=async name=>{
  const sub=await cf('/workers/scripts/'+name+'/subdomain');assert.equal(sub.enabled,name===names[0]);assert.equal(sub.previews_enabled,false);
  const schedule=await cf('/workers/scripts/'+name+'/schedules');assert.deepEqual(Array.isArray(schedule)?schedule:schedule.schedules,[]);
 };
 const pathFor=(c,label)=>{
  const copy=structuredClone(c);copy.main=resolve(root,'backend',c.main);if(copy.assets)copy.assets.directory=resolve(root,'backend',copy.assets.directory);
  delete copy.$schema;const path=resolve(out,label+'.json');writeFileSync(path,JSON.stringify(copy));return path;
 };
 const command=(name,c,label)=>{
  const args=['deploy','--config',pathFor(c,label)];report.wranglerAttempts++;
  if(runWrangler)return runWrangler(args,{name,label,config:c});
  const childEnv={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(out,label+'.private-cli.log')};for(const k of ['FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete childEnv[k];
  try{execFileSync(process.execPath,[resolve(root,'backend/node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,stdio:'pipe',env:childEnv});}
  catch{throw Error('WRANGLER_ATTEMPT_UNKNOWN');}
 };
 const owned=async()=>{
  for(const name of names)assert.equal(await getVersion(name),expected[name],'VERSION_NOT_OWNED');
 };
 const paused=(c)=>({...structuredClone(c),main:'src/__jwt_feature_unavailable.js',observability:{enabled:false},assets:c.assets?{...c.assets,run_worker_first:true}:undefined,vars:{...c.vars,ACADEMY_D1_MODE:'PAUSED',JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0',JWT_FEATURE_INSTALL_SOURCE:p.publicManifest.source,JWT_FEATURE_INSTALL_OWNER:p.publicManifest.owner}});
 return {
  candidateGuard,ownedGuard:owned,
  async preflight(){
   await candidateGuard();for(const name of names){const id=await verify(name,config.get(name));assert.equal(id,expected[name],'BASELINE_CHANGED');await address(name);}
  },
  async deploy(name,stage){
   assert(names.includes(name));let c;
   if(stage==='QUARANTINE'){assert.equal(name,names[0]);c=paused(nativeWorker);}
   else if(stage==='SETUP')c=name===names[0]?p.worker:p.coordinator;
   else{assert.equal(stage,'FINAL_PAUSED');assert(final,'FINAL_NOT_PREPARED');c=name===names[0]?final.worker:final.coordinator;}
   if(name===names[0])c={...c,secrets:{required:[...secretNames]}};
   command(name,c,stage+'-'+name);config.set(name,c);lastLabel={name,stage};
  },
  async patchSecrets(secrets){
   const keys=Object.keys(secrets).sort(),create=[...temporarySecrets,...finalSecrets].sort();
   assert(JSON.stringify(keys)===JSON.stringify(create)||JSON.stringify(keys)===JSON.stringify([...temporarySecrets].sort()),'SECRET_PATCH_SHAPE');
   if(keys.length===2)assert(Object.values(secrets).every(v=>v===null),'TEMPORARY_DELETION_ONLY');
   else for(const [name,s]of Object.entries(secrets))assert(s&&s.name===name&&s.type==='secret_text'&&typeof s.text==='string'&&s.text.length>0,'SECRET_BODY');
   await cf('/workers/scripts/feature_worker/secrets-bulk',{method:'PATCH',secrets});
   for(const [name,value]of Object.entries(secrets))value===null?secretNames.delete(name):secretNames.add(name);
   config.get(names[0]).secrets={required:[...secretNames]};lastLabel={name:names[0],stage:'SECRETS'};
  },
  async adoptExpected(){
   assert(lastLabel);const id=await verify(lastLabel.name,config.get(lastLabel.name),{discover:true});
   expected[lastLabel.name]=id;lastLabel=null;
  },
  async schema(capsule){return capsule.setup({contract,issued:p.publicManifest.issued,expires:p.publicManifest.expires,phase:'schema',onRequest:(phase,action)=>{assert.equal(phase,'schema');const k=action==='execute'?'schemaExecuteAttempts':'schemaStatusAttempts';report[k]++;assert(report[k]<=1,'SCHEMA_HTTP_BUDGET');}});},
  async setup(capsule){return capsule.setup({contract,issued:p.publicManifest.issued,expires:p.publicManifest.expires,phase:'seed',onRequest:(phase,action)=>{assert.equal(phase,'seed');const k=action==='execute'?'setupExecuteAttempts':'setupStatusAttempts';report[k]++;assert(report[k]<=1,'SETUP_HTTP_BUDGET');}});},
  async prepareFinal(schema,receipt,publicKey){
   assert.equal(schema.state,'VERIFIED');assert.equal(schema.stage,'SCHEMA_ONLY');assert.equal(schema.source,contract.source);assert.equal(schema.manifestHash,contract.manifestHash);
   assert.equal(receipt.state,'VERIFIED');assert.equal(receipt.sourceDigest,contract.sourceDigest);
   assert(namespaces.timetable&&namespaces.split);
   final=completeInstallPackage(p,baseline,schemaReceipt,contract,{timetableNamespaceId:namespaces.timetable,splitNamespaceId:namespaces.split,publicKid:publicKey.kid,publicKeys:[publicKey],verifiedAt:new Date().toISOString()});
   final.receipt.structuredSchemaVerified=true;final.receipt.schemaVerification=structuredClone(schema.verification);
   assertNoTemporarySurface(final);
  },
  async probe(kind){
   const path=kind==='ordinary-paused'?'/academy/':kind==='final-paused'?'/__jwt_feature_release':kind==='schema-http-removed'?'/internal/feature-jwt-setup/schema-status':'/internal/feature-jwt-setup/status',expectedCode=kind==='ordinary-paused'?'FEATURE_SETUP_PAUSED':kind==='recovery-paused'?'FEATURE_PAUSED':'FEATURE_JWT_UNAVAILABLE';
   if(kind==='recovery-paused'){report.recoveryHTTPProbes++;assert(report.recoveryHTTPProbes<=1,'RECOVERY_PROBE_BUDGET');}else{report.httpProbes++;assert(report.httpProbes<=4,'PROBE_BUDGET');}
   let response;try{response=await fetcher(origin+path,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('PAUSED_PROBE_UNKNOWN');}
   assert.equal(response.status,503,'PAUSED_PROBE_STATUS');assert(!response.headers.get('set-cookie'),'PAUSED_COOKIE');
   assert(response.headers.get('cache-control')?.includes('no-store'),'PAUSED_CACHE');
   const text=await response.text();assert(text.length<=1024,'PAUSED_BODY_SIZE');let body;try{body=JSON.parse(text);}catch{throw Error('PAUSED_BODY');}assert.deepEqual(Object.keys(body),['code'],'PAUSED_BODY_KEYS');assert.equal(body.code,expectedCode,'OLD_SETUP_SURFACE');
  },
  async verifyFinal(){
   assert(final);assertNoTemporarySurface(final);
   assert.deepEqual([...secretNames].sort(),[...oldSecrets,...finalSecrets].sort(),'TEMPORARY_SECRET_REMAINS');
   for(const name of names)await address(name);
   assert.equal(states.get(names[0]).version,expected[names[0]]);
   assert.equal(states.get(names[1]).version,expected[names[1]]);
   writeFileSync(resolve(publicOut,'verified-paused-receipt.json'),JSON.stringify({...final.receipt,installedVersions:{...expected},installOwner:p.publicManifest.owner,setupManifest:contract.manifestHash,installedMode:'PAUSED',temporarySecretsRemoved:true,temporarySurfaceRemoved:true,explicitCloudflareGets:report.explicitCloudflareGets},null,2)+'\n');
  },
  async pauseRecovery(){
   // No approval refresh here; only the independently checked current version ownership.
   const c=paused(config.get(names[0]));c.secrets={required:[...secretNames]};
   command(names[0],c,'owned-unavailable');config.set(names[0],c);expected[names[0]]=await verify(names[0],c,{discover:true});
   // Never reseed, restore active old source, reset floors or delete stores.
   await owned();const cbase={...config.get(names[1]),main:'src/academy-split-coordinator.js'};
   const cfinal=structuredClone(cbase);for(const k of Object.keys(cfinal.vars||{}))if(k.startsWith('JWT_FEATURE_SETUP_'))delete cfinal.vars[k];
   command(names[1],cfinal,'owned-coordinator-no-setup');config.set(names[1],cfinal);expected[names[1]]=await verify(names[1],cfinal,{discover:true});
   const present=temporarySecrets.filter(n=>secretNames.has(n));
   if(present.length){await owned();await cf('/workers/scripts/feature_worker/secrets-bulk',{method:'PATCH',secrets:Object.fromEntries(present.map(n=>[n,null]))});for(const n of present)secretNames.delete(n);c.secrets={required:[...secretNames]};expected[names[0]]=await verify(names[0],c,{discover:true});}
  },
  async verifyRecovery(){await owned();assert(!temporarySecrets.some(n=>secretNames.has(n)));await this.probe('recovery-paused');await owned();},
  save(evidence){
   writeFileSync(resolve(publicOut,'installation.json'),JSON.stringify({...evidence,...report,lastAcknowledgedVersions:{...expected},observedFreshNamespaces:{...namespaces},publicSigningKey:p.publicManifest.publicSigningKey||null,setupRequests:report.setupExecuteAttempts+report.setupStatusAttempts,schemaRequests:report.schemaExecuteAttempts+report.schemaStatusAttempts,setupRequestsAreFetchAttempts:true},null,2)+'\n');
  }
 };
}
