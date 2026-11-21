import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,Bucket,FixtureSecurityCache} from './helpers.mjs';
import {AppRuntime} from '../runtime.mjs';
import {canonical,bytes,digest,opaque,fingerprint} from '../codec.mjs';
import {ORIGINS} from '../tokens.mjs';
import {serviceHeaders} from '../events.mjs';
import {handleServiceHTTP,serviceFetch} from '../http-service.mjs';
import {runtimeServices,runtimeServiceSchemaSQL,cursorKeys} from '../runtime-service.mjs';
const paths=['transactions','redeem','events','reconcile','incidents','logout'].map(p=>'/internal/auth/v2/'+p);
const key=(n)=>new Uint8Array(32).fill(n),sourceKey=key(10),childKey=key(11),epoch='owner-epoch';
const keys=new Map([['academy-hifz',{kid:'academy-hifz',key:sourceKey,env:'production',sourceApp:'academy',targetApp:'hifz',paths}],['hifz-academy',{kid:'hifz-academy',key:childKey,env:'production',sourceApp:'hifz',targetApp:'academy',paths}]]);
const sourceDependency={id:'academy:profile',ownerApp:'academy',ownerEpoch:epoch,scope:'ACCOUNT',recipients:['hifz'],actions:['read','write']};
function digestStreamFactory(){const h=createHash('sha256');let resolve;const digest=new Promise(r=>{resolve=r;});const stream=new WritableStream({write:b=>h.update(b),close:()=>resolve(h.digest())});Object.defineProperty(stream,'digest',{value:digest});return stream;}
async function make(app){
 const f=await fixture(app,{rightsKey:'auth-private/v2/production/'+app+'/generation1/rights/synthetic-initial'});f.raw.exec(runtimeServiceSchemaSQL);if(app==='academy')f.raw.exec('CREATE TABLE split_read_state(singleton INTEGER PRIMARY KEY,version INTEGER);INSERT INTO split_read_state VALUES(1,1);');else f.raw.prepare("INSERT INTO jwt_v2_event_streams VALUES('academy',?,'account-security',?,0,0)").run(app,epoch);
 const bucket=new Bucket(),prefix=f.store.securityPrefix,cache=new FixtureSecurityCache({bucket,store:f.store,prefix,generation:'generation1'});await cache.seed('control/app');await cache.publish('control/app',async()=>({cr:1,app,env:'production',policyEpoch:'policy-epoch',policyRevision:1,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,withdrawnKids:[],migrationFloor:2,inactivityMinutes:90}));
 const runtime={app,config:f.config,clock:()=>f.now,store:f.store,cache,env:{UAA_V2_CURSOR_KEYS_JSON:canonical({currentKid:'cursor',keys:[{kid:'cursor',key:Buffer.from(key(14)).toString('base64url')}]})},settings:{bucket,prefix,serviceKeys:keys,csrf:{keys:new Map([['csrf',key(12)]])},draft:{keys:new Map([['draft',key(13)]])},raw:{snapshotSchema:3,serviceStreams:[{sourceApp:'academy',targetApp:'hifz',stream:'account-security',ownerEpoch:epoch,genesis:true}],ownerBridges:[],serviceDependencies:[sourceDependency]}},digestStreamFactory};
 runtime.publishFamily=(sid,options)=>AppRuntime.prototype.publishFamily.call(runtime,sid,options);
 // This fixture represents an already issued ACTIVE family. Declare its real
 // initial publication explicitly; later revocation must never seed a missing
 // formerly ACTIVE control as if it were a new family.
 const rightsKey=f.projection.rightsKey;
 await bucket.put(rightsKey,canonical(f.rights));
 await runtime.publishFamily(f.sid,{initial:true});return {...f,bucket,runtime};
}
async function event(f,sequence,{sub=f.sub,kind='account-revoked',target={type:'accountCutoff',sub,maxCe:4,maxAe:9,reason:'VOLUNTARY_LOGOUT',incidentId:null}}={}){const e={schema:2,env:'production',sourceApp:'academy',targetApp:'hifz',eventId:crypto.randomUUID(),operationId:crypto.randomUUID(),stream:'account-security',ownerEpoch:epoch,sequence,sub,kind,target,committedAt:f.now,commitRef:'committed-fixture'};e.digest=await digest(e);return e;}
async function incoming(f,events){const body=canonical({schema:2,env:'production',sourceApp:'academy',targetApp:'hifz',batchId:crypto.randomUUID(),events}),path='/internal/auth/v2/events',headers={...await serviceHeaders({keyId:'academy-hifz',key:sourceKey,path,env:'production',sourceApp:'academy',targetApp:'hifz',now:f.now,body:bytes(body)}),'Content-Type':'application/json'};return handleServiceHTTP(f.runtime,new Request(ORIGINS.hifz+path,{method:'POST',headers,body}));}
test('real service denial reaches APPLIED only after durable session publication',async()=>{const f=await make('hifz'),e=await event(f,1),reply=await (await incoming(f,[e])).json();assert.equal(reply.results[0].status,'APPLIED');assert.equal((await f.store.family(f.sid)).state,'REVOKED');assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_worksets').get().state,'APPLIED');assert.equal(f.raw.prepare('SELECT contiguous_through FROM jwt_v2_event_streams').get().contiguous_through,1);});
test('R2 publication loss keeps denial captured and never ACKs APPLIED',async()=>{const f=await make('hifz'),e=await event(f,1);f.bucket.throwAfterPut=true;const reply=await (await incoming(f,[e])).json();assert.equal(reply.results[0].status,'CAPTURED');assert.equal((await f.store.family(f.sid)).state,'REVOKED');assert.equal(f.raw.prepare('SELECT contiguous_through FROM jwt_v2_event_streams').get().contiguous_through,0);});
test('mixed semantic conflict does not block independent denial',async()=>{const f=await make('hifz'),bad=await event(f,1,{kind:'invented-kind'}),good=await event(f,2),reply=await (await incoming(f,[bad,good])).json();assert.equal(reply.results[0].status,'CONFLICT');assert.equal(reply.results[1].status,'APPLIED');assert.equal((await f.store.family(f.sid)).state,'REVOKED');});
test('child offline report captures original local floor and retry delay atomically',async()=>{const f=await make('hifz');let calls=0;f.runtime.env.UAA_V2_PEERS={academy:{async fetch(){calls++;throw Error('offline fixture');}}};const services=await runtimeServices(f.runtime),op=crypto.randomUUID(),result=await services.queueReport({binding:f.binding,kind:'logout',operationId:op,now:f.now});assert.equal(result.outcome,'GLOBAL_UNCONFIRMED');assert.equal((await f.store.family(f.sid)).state,'REVOKED');assert.equal(f.raw.prepare('SELECT le FROM jwt_v2_accounts').get().le,1);const row=f.raw.prepare('SELECT * FROM jwt_v2_service_outbox').get();assert.equal(row.state,'PENDING');assert.ok(row.next_attempt_at>=f.now+60&&row.next_attempt_at<=f.now+66);await services.deliverReports({now:f.now});assert.equal(calls,1);assert.equal(JSON.parse(f.raw.prepare('SELECT target_json FROM jwt_v2_restrictions').get().target_json).maxLe,0);});
test('canonical receipt remains accepted pending rather than a false all-app ACK',async()=>{const a=await make('academy'),h=await make('hifz');a.raw.prepare("INSERT INTO jwt_v2_parents VALUES(?,?,?,?,?,?,?,?,?,'UNLOCKED')").run(h.psid,h.sub,h.bsid,1,4,9,h.now,h.now+604800,h.now);h.runtime.env.UAA_V2_PEERS={academy:{fetch:req=>handleServiceHTTP(a.runtime,req)}};const result=await (await runtimeServices(h.runtime)).queueReport({binding:h.binding,kind:'logout',operationId:crypto.randomUUID(),now:h.now});assert.equal(result.outcome,'ACCEPTED_PENDING');assert.equal(result.canonicalAccepted,true);assert.equal(result.globalConfirmed,false);assert.equal(a.raw.prepare('SELECT ae FROM jwt_v2_accounts').get().ae,10);assert.equal(a.raw.prepare('SELECT count(*) n FROM jwt_v2_outbox').get().n,2);});
test('actual signed scoped snapshot round trip preserves two accounts and leaves other account active',async()=>{const a=await make('academy'),h=await make('hifz');for(const [i,sub] of ['Account-A','account-a'].entries()){const e=await event(a,i+1,{sub,kind:'authority-updated',target:{type:'dependency',id:'academy:profile',ownerEpoch:epoch,revision:5,effect:i?'INVALIDATE':'DENY',deniedActions:i?[]:['write']}});a.raw.prepare('INSERT INTO jwt_v2_outbox(event_id,event_json,digest,target_app) VALUES(?,?,?,?)').run(e.eventId,canonical(e),e.digest,'hifz');}a.raw.prepare("UPDATE jwt_v2_sender_streams SET next_sequence=3 WHERE target_app='hifz'").run();h.runtime.env.UAA_V2_PEERS={academy:{fetch:req=>handleServiceHTTP(a.runtime,req)}};const request={schema:2,env:'production',sourceApp:'hifz',targetApp:'academy',requestId:crypto.randomUUID(),ownerApp:'academy',recipientApp:'hifz',stream:'account-security',ownerEpoch:null,contiguousThrough:0,missingRanges:[],knownFloorsDigest:null,pageToken:null};const reply=await serviceFetch(h.runtime,{targetApp:'academy',path:'/internal/auth/v2/reconcile',body:request,operationId:request.requestId});assert.equal(reply.schema,3);assert.deepEqual(h.raw.prepare('SELECT scope_sub FROM jwt_v2_restrictions ORDER BY scope_sub').all().map(r=>r.scope_sub),['Account-A','account-a']);assert.equal((await h.store.family(h.sid)).authority_ready,1);assert.equal(h.raw.prepare('SELECT status FROM jwt_v2_receive_snapshots').get().status,'APPLIED');});
test('cursor keys cannot reuse service/CSRF/draft material',async()=>{const a=await make('academy');assert.ok(cursorKeys(a.runtime).keys.has('cursor'));a.runtime.env.UAA_V2_CURSOR_KEYS_JSON=canonical({currentKid:'same',keys:[{kid:'same',key:Buffer.from(sourceKey).toString('base64url')}]});assert.throws(()=>cursorKeys(a.runtime),{code:'KEY_PURPOSE_SEPARATION_REQUIRED'});});

test('signed shared Academy key withdrawal ends the bound child family before acknowledgement',async()=>{
 const f=await make('hifz');
 f.runtime.settings.sharedAcademy={revision:1};
 const kid='synthetic-shared-key',family=await f.store.family(f.sid);
 const projection={...JSON.parse(family.projection_json),sharedAcademyAdmission:{kid}};
 await f.store.stmt('UPDATE jwt_v2_families SET projection_json=?,cr=cr+1 WHERE sid=?',canonical(projection),f.sid).run();
 await f.runtime.publishFamily(f.sid);
 const e=await event(f,1,{sub:null,kind:'key-withdrawn',target:{type:'key',purpose:'academy-shared-access',kid,registryRevision:2}});
 const response=await incoming(f,[e]),result=await response.json();
 assert.equal(result.results[0].status,'APPLIED');
 assert.equal((await f.store.family(f.sid)).state,'REVOKED');
 const app=(await f.runtime.cache.read('control/app')).value;
 const local=(await f.runtime.cache.read('security/session/'+f.sid)).value;
 assert.equal(app.sharedAcademyRegistryRevision,2);
 assert.deepEqual(app.withdrawnSharedAcademyKids,[kid]);
 assert.equal(local.localState,'REVOKED');
 assert.equal(local.withdrawnHandoffKids?.includes(kid)??false,false);
});
