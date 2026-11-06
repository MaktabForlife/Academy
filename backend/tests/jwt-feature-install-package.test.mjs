import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {compileInstallPackage,completeInstallPackage,assertNoTemporarySurface,assertSchemaReceipt} from '../tools/jwt-feature-install-package.mjs';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {createPrivateCapsule} from '../tools/jwt-feature-install-secrets.mjs';
import {setupClient} from '../tools/jwt-feature-setup-client.mjs';
import {installFreshFeature} from '../tools/jwt-feature-install-controller.mjs';
import {createInstallOps} from '../tools/jwt-feature-install-transport.mjs';
import {sanitiseSettings,assertRemoteProfile} from '../tools/jwt-feature-install-metadata.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const bw=json('../wrangler.feature.jsonc'),bc=json('../wrangler.feature-coordinator.jsonc'),baseline=json('../../config/feature-initialisation-receipt.json');
import {ids,schemaFixture,packageFixture} from './fixtures/jwt-feature-install-fixture.mjs';
const publicKey={kty:'EC',crv:'P-256',kid:'jwt-feature-v110-20261106a-unit',x:'A'.repeat(43),y:'B'.repeat(43)};
test('exact new-ID temporary package has no assets, no test probes, old bindings/classes retained and zero JWT flags',()=>{
 const {p}=packageFixture();
 for(const c of [p.worker,p.coordinator]){assert.equal(c.assets,undefined);assert.deepEqual(c.d1_databases.slice(0,2),bw.d1_databases);assert.equal(c.d1_databases.length,4);assert.equal(c.vars.ACADEMY_D1_RUN_ID,baseline.sourceDigest);}
 for(const k of ['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'])assert.equal(p.worker.vars[k],'0');
 for(const code of Object.values(p.sources))assert(!code.includes('TEST_FAULT')&&!code.includes('/__test/'));
 assert(p.sources['backend/src/__jwt_feature_setup_coordinator.js'].includes('extends withJWTFeatureSetup(NativeFresh,c)'));
});
for(const [name,change]of [['oldID',r=>r.databaseIds=[...baseline.databaseIds]],['sameID',r=>r.databaseIds=[ids[0],ids[0]]],['notVerified',r=>r.state='CREATED_UNINITIALISED'],['notEmpty',r=>r.checks.coreRows=1],['extraCredential',r=>r.pin='uninstalled'],['wrongSchema',r=>r.ddlHashes.core='0'.repeat(64)]]){
 test('reject schema receipt '+name,()=>{const r=schemaFixture();change(r);assert.throws(()=>assertSchemaReceipt(r));});
}
test('completed PAUSED config removes setup HTTP/RPC entry and temporary vars/secrets, retains both old namespaces',()=>{
 const {p,receipt,contract}=packageFixture(),out=completeInstallPackage(p,baseline,receipt,contract,{timetableNamespaceId:'c'.repeat(32),splitNamespaceId:'d'.repeat(32),publicKid:publicKey.kid,publicKeys:[publicKey],verifiedAt:new Date().toISOString()});
 assert(assertNoTemporarySurface(out));assert.equal(out.worker.main,'src/academy-feature-jwt-runtime.js');assert.equal(out.coordinator.main,'src/academy-split-coordinator.js');assert.deepEqual(out.worker.durable_objects.bindings.slice(0,2),bw.durable_objects.bindings);
});
test('private capsule exposes only public key metadata, ingress changes only four NEW names, destroy stops reuse',async()=>{
 const capsule=await createPrivateCapsule('2468',{kid:publicKey.kid,setupClientFactory:()=>({run:async()=>({state:'uninstalled'})})});
 let keys;await capsule.ingress(async secrets=>{keys=Object.keys(secrets).sort();assert(Object.values(secrets).every(x=>x.type==='secret_text'&&x.text.length>0));
  const priv=await webcrypto.subtle.importKey('jwk',JSON.parse(secrets.JWT_V110_PRIVATE_KEY_JSON.text),{name:'ECDSA',namedCurve:'P-256'},false,['sign']),pub=await webcrypto.subtle.importKey('jwk',capsule.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']),data=new TextEncoder().encode('local-public-key-association');
  const signature=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},priv,data);assert(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,signature,data),'KEY_ASSOCIATION');});
 assert.deepEqual(keys,['JWT_FEATURE_SETUP_AUTH','JWT_FEATURE_SETUP_PIN','JWT_V110_CSRF_SECRET','JWT_V110_PRIVATE_KEY_JSON']);
 const text=JSON.stringify(capsule);assert(!text.includes('2468')&&!text.includes('"d":')&&!text.includes('AUTH')&&!text.includes('PRIVATE_KEY'));
 capsule.destroy();await assert.rejects(capsule.ingress(async()=>{}),/CLOSED/);
});
function response(c,state='VERIFIED'){
 return Response.json({schema:1,state,source:c.source,manifestHash:c.manifestHash,planId:c.planId,databaseIds:c.databaseIds,...(state==='VERIFIED'?{sourceDigest:c.sourceDigest,verification:{accounts:4,credentials:4,courses:2,sessions:0,families:0,foreignKeyErrors:0,quickCheck:'ok'}}:{})},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
test('lost execute response performs one status read and never retries execute',async()=>{
 const {contract:c,p}=packageFixture(),calls=[];
 const client=setupClient({contract:c,issued:p.publicManifest.issued,expires:p.publicManifest.expires,authKey:Buffer.alloc(32,3),fetcher:async(url,options)=>{calls.push({url,method:options.method});if(calls.length===1)throw Error('private transport detail');return response(c);}});
 const out=await client.run();assert.equal(calls.length,2);assert.equal(out.sqlReplay,false);assert.equal(out.executeRequests,1);assert.equal(out.statusRequests,1);assert(!JSON.stringify(out).includes('private transport detail'));await assert.rejects(client.request('execute'),/NO_RETRY/);
});
test('unknown state and foreign receipt cannot seed retry or pass setup verification',async()=>{
 const {contract:c,p}=packageFixture();let n=0;
 const client=setupClient({contract:c,issued:p.publicManifest.issued,expires:p.publicManifest.expires,authKey:Buffer.alloc(32,4),fetcher:async()=>{n++;return response(c,'UNKNOWN');}});
 await assert.rejects(client.run(),/NOT_VERIFIED_UNKNOWN/);assert.equal(n,2);
 const wrong={...c,source:'a'.repeat(40)},bad=setupClient({contract:c,issued:p.publicManifest.issued,expires:p.publicManifest.expires,authKey:Buffer.alloc(32,4),fetcher:async()=>response(wrong)});
 await assert.rejects(bad.run(),/BINDING/);
});
function fakeOps(failAt,withdraw=false){
 const events=[],saved=[];let current='owned',writes=0;
 const ops={candidateGuard:async()=>{events.push('approval');if(withdraw&&writes>0)throw Error('withdrawn');},ownedGuard:async()=>{events.push('owned');if(current!=='owned')throw Error('foreign');},
  preflight:async()=>{},deploy:async(name,stage)=>{writes++;events.push(stage+':'+name);if(failAt===stage){current='foreign';throw Error('unknown');}},
  patchSecrets:async s=>{writes++;events.push(Object.values(s).every(x=>x===null)?'remove':'secrets');},
  adoptExpected:async()=>{},probe:async()=>{},setup:async()=>({receipt:{state:'VERIFIED'},executeRequests:1,statusRequests:1}),
  prepareFinal:async()=>{},verifyFinal:async()=>{},pauseRecovery:async()=>{events.push('owned-pause');},verifyRecovery:async()=>{},save:e=>saved.push(e)};
 return {ops,events,saved,get writes(){return writes;}};
}
test('controller installs quarantine before setup, removes RPC/HTTP then secrets and never activates',async()=>{
 const f=fakeOps(),p=packageFixture().p,cap={publicKey,destroy(){},ingress:async fn=>fn({unit:{}})};
 const result=await installFreshFeature({ops:f.ops,packageInfo:p,privateCapsule:cap});
 assert.equal(result.state,'PAUSED_VERIFIED');assert.equal(result.activated,false);assert.equal(result.cleanupVerified,true);
 assert(f.events.indexOf('QUARANTINE:feature_worker')<f.events.indexOf('SETUP:academy-feature-split-coordinator'));
 assert(f.events.indexOf('FINAL_PAUSED:feature_worker')<f.events.indexOf('remove'));
});
test('candidate withdrawal still permits separately owned pause, never another setup execute',async()=>{
 const f=fakeOps(null,true),p=packageFixture().p;
 await assert.rejects(installFreshFeature({ops:f.ops,packageInfo:p,privateCapsule:{destroy(){},publicKey}}),/INSTALL_STOPPED/);
 assert(f.events.includes('owned-pause'));assert.equal(f.writes,1);
});
test('unknown physical outcome owned by someone else prevents recovery overwrite',async()=>{
 const f=fakeOps('QUARANTINE'),p=packageFixture().p;
 await assert.rejects(installFreshFeature({ops:f.ops,packageInfo:p,privateCapsule:{destroy(){},publicKey}}),/INSTALL_STOPPED/);
 assert(!f.events.includes('owned-pause'));assert.equal(f.saved.at(-1).recovery,'NOT_VERIFIED_NO_OVERWRITE');
});
test('redacted metadata is idempotent and a tail consumer cannot disappear on second validation',()=>{
 const s=sanitiseSettings({bindings:[{name:'KEY',type:'secret_text',text:'uninstalled-private'}],tail_consumers:[{}]});
 assert.deepEqual(sanitiseSettings(s),s);assert.equal(s.tailConsumerCount,1);assert(!JSON.stringify(s).includes('uninstalled-private'));
 const config={compatibility_date:'2026-10-23',compatibility_flags:['nodejs_compat'],secrets:{required:['KEY']}};
 assert.throws(()=>assertRemoteProfile({...s,compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags},config,baseline,{}));
});
test('metadata refuses old/fresh namespace collision and setup assets',()=>{
 const {p}=packageFixture();assert(p.worker.d1_databases.length===4);assert.equal(p.worker.assets,undefined);
 const s={bindings:[],assets:{config:{run_worker_first:false,not_found_handling:'none'}},compatibility_date:'2026-10-23',compatibility_flags:['nodejs_compat']};
 assert.throws(()=>assertRemoteProfile(s,{...p.worker,d1_databases:[],vars:{},secrets:{required:[]},durable_objects:{bindings:[]},r2_buckets:[],ratelimits:[]},baseline,{}),/ASSETS_FORBIDDEN/);
});

test('concrete transport performs seven guarded writes, forty metadata reads, five Worker attempts and exact secret cleanup using LOCAL mocks only',async()=>{
 const {p,receipt,contract}=packageFixture(),configs=new Map(),versions={},nativeSecrets=new Set(bw.secrets.required),activeSecrets=new Set(nativeSecrets),seen=[];
 const initial={'feature_worker':'ca8e1212-ce22-45a8-8949-771cb88d6be6','academy-feature-split-coordinator':'03c17ebf-8eeb-4bd1-ac99-7deb9b1f28b8'};
 configs.set('feature_worker',{...structuredClone(bw),vars:{...bw.vars,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:baseline.sourceDigest}});configs.set('academy-feature-split-coordinator',structuredClone(bc));Object.assign(versions,initial);let sequence=10,physicalWrites=0,execute=0,status=0;
 const bump=name=>versions[name]='00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
 const remote=c=>{
  const bindings=[];
  for(const b of c.d1_databases)bindings.push({name:b.binding,type:'d1',id:b.database_id});
  for(const b of c.r2_buckets||[])bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
  for(const [name,text]of Object.entries(c.vars||{}))bindings.push({name,type:'plain_text',text});
  for(const name of c.name==='feature_worker'?activeSecrets:[])bindings.push({name,type:'secret_text',text:'NEVER_PUBLIC_MOCK_SECRET'});
  for(const b of c.ratelimits||[])bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
  for(const b of c.durable_objects?.bindings||[]){const ns=b.class_name==='ProgramTimetableCoordinator'?baseline.timetableNamespaceId:b.class_name==='AcademySplitCoordinator'?baseline.splitNamespaceId:b.class_name==='JWTFeatureProgramTimetableCoordinator'?'c'.repeat(32):'d'.repeat(32);bindings.push({name:b.name,type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});}
  if(c.assets)bindings.push({name:c.assets.binding,type:'assets'});
  return {bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,tail_consumers:[],...(c.assets?{assets:{jwt:'NEVER_PUBLIC_ASSET_TOKEN',config:{run_worker_first:c.assets.run_worker_first,not_found_handling:'none',html_handling:'auto-trailing-slash',base_path:'/'}}}:{})};
 };
 const fetcher=async(url,options={})=>{
  const u=new URL(url);seen.push({host:u.host,path:u.pathname,method:options.method||'GET'});
  if(u.host==='api.cloudflare.com'){
   const name=u.pathname.split('/')[7],kind=u.pathname.split('/')[8];assert(configs.has(name));let result;
   if(kind==='settings')result=remote(configs.get(name));
   else if(kind==='deployments')result={deployments:[{versions:[{version_id:versions[name],percentage:100}]}]};
   else if(kind==='subdomain')result={enabled:name==='feature_worker',previews_enabled:false};
   else if(kind==='schedules')result=[];
   else if(kind==='secrets-bulk'){
    assert.equal(options.method,'PATCH');physicalWrites++;const body=JSON.parse(options.body);
    for(const [k,v]of Object.entries(body.secrets))v===null?activeSecrets.delete(k):activeSecrets.add(k);
    bump(name);result={DONT_RETURN:{text:'NEVER_PUBLIC_MOCK_SECRET'}};
   }else throw Error('Unexpected mock path');
   return Response.json({success:true,result});
  }
  assert.equal(u.origin,'https://feature_worker.maktab4life.workers.dev');
  if(u.pathname.endsWith('/execute')){execute++;return response(contract);}
  if(u.pathname==='/internal/feature-jwt-setup/status'&&configs.get('feature_worker').main.includes('__jwt_feature_setup')){status++;return response(contract);}
  return Response.json({code:configs.get('feature_worker').main.includes('__jwt_feature_setup')?'FEATURE_SETUP_PAUSED':'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
 };
 const dir=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-install-mock-'));
 const capsule=await createPrivateCapsule('2468',{kid:publicKey.kid,setupClientFactory:options=>setupClient({...options,fetcher})});
 const ops=createInstallOps({root:process.cwd(),directory:dir,p,baseline,expectedVersions:initial,schemaReceipt:receipt,contract,token:'uninstalled-mock-token',candidateGuard:async()=>{},fetcher,runWrangler:async(args,{name,config:c})=>{physicalWrites++;configs.set(name,structuredClone(c));bump(name);}});
 const result=await installFreshFeature({ops,packageInfo:p,privateCapsule:capsule});
 const proof=JSON.parse(readFileSync(resolve(dir,'public/installation.json'),'utf8'));
 assert.equal(result.state,'PAUSED_VERIFIED');assert.equal(physicalWrites,7);assert.equal(proof.explicitCloudflareGets,40);
 assert.equal(execute,1);assert.equal(status,1);assert.equal(proof.setupExecuteAttempts+proof.setupStatusAttempts+proof.httpProbes,5);
 assert.deepEqual([...activeSecrets].sort(),[...nativeSecrets,'JWT_V110_PRIVATE_KEY_JSON','JWT_V110_CSRF_SECRET'].sort());
 const saved=JSON.stringify(proof)+readFileSync(resolve(dir,'public/verified-paused-receipt.json'),'utf8');assert(!saved.includes('NEVER_PUBLIC')&&!saved.includes('2468')&&!saved.includes('"d":'));
 assert(seen.every(x=>x.host==='api.cloudflare.com'||x.host==='feature_worker.maktab4life.workers.dev'));
});
