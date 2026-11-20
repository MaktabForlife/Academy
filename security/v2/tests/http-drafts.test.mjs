import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Bucket,signing,FixtureSecurityCache} from '../test/helpers.mjs';
import {AppRuntime} from '../runtime.mjs';
import {httpSchemaSQL,selector} from '../http-context.mjs';
import {releaseDraftKey,draftCapsuleSchemaSQL} from '../http-drafts.mjs';
import {canonical,b64u,bytes} from '../codec.mjs';
import {issueToken} from '../tokens.mjs';
async function context(app='studio'){
 const f=await fixture(app),bucket=new Bucket(),keypair=await signing(),prefix='auth-private/v2/production/'+app+'/generation1/',wrap=crypto.getRandomValues(new Uint8Array(32)),csrf=crypto.getRandomValues(new Uint8Array(32));let now=f.now;f.raw.function('unixepoch',()=>now);
 f.raw.function('unixepoch',()=>now);
 f.raw.exec(httpSchemaSQL+'\n'+draftCapsuleSchemaSQL+'\nCREATE TABLE synthetic_draft_access(resource TEXT PRIMARY KEY,allowed INTEGER NOT NULL);');f.raw.prepare('INSERT INTO synthetic_draft_access VALUES(?,1)').run('synthetic-site');
 const settings={config:f.config,db:f.db,bucket,prefix,raw:{generation:'generation1'},dependenciesFor:f.store.dependencyManifest,dependencies:new Map(),apiKeys:new Map([['test',keypair.publicKey]]),apiSigningKey:keypair.privateKey,apiKid:'test',csrf:{currentKid:'csrf-one',keys:new Map([['csrf-one',csrf]])},draft:{currentKid:'draft-one',keys:new Map([['draft-one',wrap]])}};
 const native={async draftGuard({resource}){assert.deepEqual(Object.keys(resource).sort(),['type','websiteId']);assert.equal(resource.type,'studio-website');return {sql:'SELECT 1 FROM synthetic_draft_access WHERE resource=? AND allowed=1',args:[resource.websiteId]};}};
 const runtime=new AppRuntime({settings,clock:()=>now,native,env:{}}),cache=new FixtureSecurityCache({bucket,store:runtime.store,prefix,generation:'generation1'});runtime.cache=cache;
 const rightsKey=prefix+'rights/synthetic',hash=f.projection.rightsHash;await bucket.put(rightsKey,canonical(f.rights));await cache.seed('control/app');await cache.seed('security/session/'+f.sid);
 await cache.publish('control/app',async()=>({cr:1,app,env:'production',policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2,inactivityMinutes:90}));
 await cache.publish('security/session/'+f.sid,async()=>({...f.projection,cr:1,app,env:'production',localState:'UNLOCKED',authorityReady:true,validationDeadline:f.deadline,idleUntil:f.idleUntil,s_exp:f.binding.s_exp,rightsKey,rightsHash:hash}));
 let access=await issueToken({...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:keypair.privateKey,kid:'test',now:f.now,idleUntil:f.idleUntil});
 const family=await runtime.store.family(f.sid),issued=await runtime.intents.issue(family,'draft-key'),expected=selector(f.binding,app),names=app==='academy'?['__Host-uaa_a','__Host-uaa_r']:['__Host-'+app+'_a','__Host-'+app+'_r'];
 const body={operationId:issued.intent.id,expectedContext:expected,resource:{type:'studio-website',websiteId:'synthetic-site'},draftGeneration:1,originalExpiresAtMs:f.binding.s_exp*1000};
 function request(changes={}){return new Request(f.config.origin+'/auth/v2/draft-key',{method:'POST',headers:{'Content-Type':'application/json','Origin':f.config.origin,'Sec-Fetch-Site':'same-origin','X-UAA-Request':'2','X-UAA-CSRF':issued.csrf,'X-UAA-Expected-Context':b64u(bytes(canonical(expected))),'Cookie':names[0]+'='+access+'; '+names[1]+'='+f.refresh,...changes},body:JSON.stringify(body)});}
 return {...f,runtime,settings,bucket,cache,body,expected,issued,request,wrap,names,setNow:x=>{now=x;},setAccess:x=>{access=x;},capsuleKey:prefix+'draft/'+f.sid+'/1'};
}

test('current own access+refresh+purpose CSRF releases a server-created random key; only wrapped capsule is durable/private',async()=>{
 const f=await context(),before=await f.runtime.store.family(f.sid),response=await releaseDraftKey(f.runtime,f.request(),f.body),dto=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(dto.key.length,43);assert.deepEqual(dto.context,f.expected);assert.equal(dto.draftGeneration,1);assert.equal(dto.originalExpiresAtMs,f.binding.s_exp*1000);
 const durable=await f.runtime.store.first('SELECT * FROM jwt_v2_draft_capsules WHERE sid=?',f.sid),serialized=JSON.stringify(durable)+JSON.stringify([...f.bucket.objects.values()]);assert(!serialized.includes(dto.key));assert.equal(Buffer.from(durable.capsule,'base64url').length,48);assert.equal(Buffer.from(durable.iv,'base64url').length,12);
 const after=await f.runtime.store.family(f.sid);for(const k of ['binding_json','deadline','vat','idle_until','last_refresh','s_exp','cr','sv','ue'])assert.equal(after[k],before[k]);assert.equal(f.bucket.objects.get(f.capsuleKey).body,canonical(dto.capsule));f.raw.close();
});

test('repeated and concurrent first-editor setup return the same immutable SID/generation key, not new keys',async()=>{
 const f=await context();const replies=await Promise.all([releaseDraftKey(f.runtime,f.request(),f.body),releaseDraftKey(f.runtime,f.request(),f.body)]),dtos=await Promise.all(replies.map(r=>r.json()));assert.equal(dtos[0].key,dtos[1].key);assert.deepEqual(dtos[0].capsule,dtos[1].capsule);assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,1);
 const again=await(await releaseDraftKey(f.runtime,f.request(),{...f.body,capsule:dtos[0].capsule})).json();assert.equal(again.key,dtos[0].key);assert.throws(()=>f.raw.prepare('UPDATE jwt_v2_draft_capsules SET capsule=?').run('tamper'),/immutable_draft_capsule/);assert.throws(()=>f.raw.exec('DELETE FROM jwt_v2_draft_capsules'),/durable_draft_capsule/);f.raw.close();
});

test('missing own access or own refresh never mints or renews credentials for key recovery',async()=>{
 const f=await context();await assert.rejects(releaseDraftKey(f.runtime,f.request({Cookie:f.names[1]+'='+f.refresh}),f.body),/ACCESS_REFRESH_REQUIRED/);await assert.rejects(releaseDraftKey(f.runtime,f.request({Cookie:f.names[0]+'=invalid.invalid.invalid'}),f.body));assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);f.raw.close();
});

test('expired access, wrong exact context or wrong purpose CSRF cannot release a key',async()=>{
 const f=await context();await assert.rejects(releaseDraftKey(f.runtime,f.request({'X-UAA-CSRF':b64u(crypto.getRandomValues(new Uint8Array(32)))}),f.body),/CSRF_INVALID/);
 await assert.rejects(releaseDraftKey(f.runtime,f.request(),{...f.body,expectedContext:{...f.expected,ue:1}}),/EXPECTED_CONTEXT_CONFLICT/);f.setNow(f.deadline);await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body),/TOKEN_EXPIRED|LEASE_EXPIRED/);assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);f.raw.close();
});

test('client cannot select another draft generation, expiry or substitute an unrecognised capsule',async()=>{
 const f=await context();await assert.rejects(releaseDraftKey(f.runtime,f.request(),{...f.body,draftGeneration:2}),/DRAFT_KEY_BINDING_REQUIRED/);await assert.rejects(releaseDraftKey(f.runtime,f.request(),{...f.body,originalExpiresAtMs:f.body.originalExpiresAtMs+1}),/DRAFT_KEY_BINDING_CONFLICT/);await assert.rejects(releaseDraftKey(f.runtime,f.request(),{...f.body,capsule:{forged:true}}),/DRAFT_CAPSULE_MISSING/);assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);
 const dto=await(await releaseDraftKey(f.runtime,f.request(),f.body)).json();await assert.rejects(releaseDraftKey(f.runtime,f.request(),{...f.body,capsule:{...dto.capsule,iv:'forged'}}),/DRAFT_CAPSULE_CHANGED/);f.raw.close();
});

test('actual native resource predicate denial aborts setup without creating a durable capsule',async()=>{
 const f=await context();f.raw.exec('UPDATE synthetic_draft_access SET allowed=0');await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);f.raw.close();
});

test('native permission withdrawal during asynchronous capsule caching is caught by final same-primary release guard',async()=>{
 const f=await context();f.bucket.beforePut=async key=>{if(key===f.capsuleKey){f.raw.exec('UPDATE synthetic_draft_access SET allowed=0');f.bucket.beforePut=null;}};
 await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,1);const row=await f.runtime.store.first('SELECT * FROM jwt_v2_draft_capsules');assert.equal(Buffer.from(row.capsule,'base64url').length,48);f.raw.close();
});

test('lock/reset/account barriers arriving after cache checks cannot release a usable key or extend a lease',async()=>{
 for(const effect of [f=>f.runtime.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'}),async f=>f.raw.exec('UPDATE jwt_v2_accounts SET ce=ce+1,revision=revision+1')]){
  const f=await context();f.bucket.beforePut=async key=>{if(key===f.capsuleKey){f.bucket.beforePut=null;await effect(f);}};await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));f.raw.close();
 }
});

test('missing non-authority capsule cache copy recovers only the same durable key after fresh control checks',async()=>{
 const f=await context(),first=await(await releaseDraftKey(f.runtime,f.request(),f.body)).json();f.bucket.objects.delete(f.capsuleKey);const second=await(await releaseDraftKey(f.runtime,f.request(),{...f.body,capsule:first.capsule})).json();assert.equal(second.key,first.key);assert.deepEqual(second.capsule,first.capsule);assert(f.bucket.objects.has(f.capsuleKey));
 f.bucket.objects.delete(f.cache.key('security/session/'+f.sid));f.bucket.objects.delete(f.capsuleKey);await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body),/CONTROL_UNAVAILABLE/);assert.equal(f.bucket.objects.has(f.capsuleKey),false);f.raw.close();
});

test('a conflicting private R2 capsule copy fails closed instead of releasing a key or overwriting evidence',async()=>{
 const f=await context();f.bucket.objects.set(f.capsuleKey,{etag:'synthetic',body:'{}'});await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body),/DRAFT_CAPSULE_CACHE_CONFLICT/);assert.equal(f.bucket.objects.get(f.capsuleKey).body,'{}');f.raw.close();
});

test('terminal intent is not revived by a still cryptographically valid draft-key CSRF proof',async()=>{
 const f=await context();f.raw.prepare("UPDATE jwt_v2_intents SET state='CANCELLED' WHERE intent_id=?").run(f.body.operationId);await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);f.raw.close();
});

test('Academy Core native fence aborts key setup while a split command owns the primary',async()=>{
 const f=await context('academy');f.raw.prepare('INSERT INTO split_write_fence VALUES(1,?,1)').run('synthetic-command');await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));assert.equal((await f.runtime.store.all('SELECT * FROM jwt_v2_draft_capsules')).length,0);f.raw.close();
});

test('same SID unlock releases the original capsule under new sv/ue and fresh proof; each newly requested resource is guarded',async()=>{
 const f=await context(),first=await(await releaseDraftKey(f.runtime,f.request(),f.body)).json(),binding={...f.binding,sv:2,ue:1},projection={...f.projection,binding};
 f.raw.prepare('UPDATE jwt_v2_families SET sv=2,ue=1,cr=2,fingerprint_generation=2,binding_json=?,projection_json=? WHERE sid=?').run(canonical(binding),canonical(projection),f.sid);
 await f.cache.publish('security/session/'+f.sid,async()=>({...projection,cr:2,app:'studio',env:'production',localState:'UNLOCKED',authorityReady:true,validationDeadline:f.deadline,idleUntil:f.idleUntil,s_exp:binding.s_exp,rightsKey:f.settings.prefix+'rights/synthetic'}));
 const family=await f.runtime.store.family(f.sid),issued=await f.runtime.intents.issue(family,'draft-key'),current=selector(binding,'studio'),access=await issueToken({...binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()},{config:f.config,key:f.settings.apiSigningKey,kid:'test',now:f.now,idleUntil:f.idleUntil});
 f.raw.prepare('INSERT INTO synthetic_draft_access VALUES(?,1)').run('second-site');
 const body={...f.body,operationId:issued.intent.id,expectedContext:current,resource:{type:'studio-website',websiteId:'second-site'},capsule:first.capsule};
 const req=()=>new Request(f.config.origin+'/auth/v2/draft-key',{method:'POST',headers:{'Content-Type':'application/json','Origin':f.config.origin,'Sec-Fetch-Site':'same-origin','X-UAA-Request':'2','X-UAA-CSRF':issued.csrf,'X-UAA-Expected-Context':b64u(bytes(canonical(current))),'Cookie':f.names[0]+'='+access+'; '+f.names[1]+'='+f.refresh},body:JSON.stringify(body)});
 const next=await(await releaseDraftKey(f.runtime,req(),body)).json();assert.equal(next.key,first.key);assert.deepEqual(next.capsule,first.capsule);assert.equal(next.context.ue,1);assert.equal(next.capsule.binding.recordedContext.ue,0);
 f.raw.prepare('UPDATE synthetic_draft_access SET allowed=0 WHERE resource=?').run('second-site');await assert.rejects(releaseDraftKey(f.runtime,req(),body));await assert.rejects(releaseDraftKey(f.runtime,f.request(),f.body));f.raw.close();
});
