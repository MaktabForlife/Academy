import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityCache} from '../cache.mjs';
import {fixture,Bucket} from './helpers.mjs';
import {canonical,digest,bytes,opaque} from '../codec.mjs';
import {validateEvent,receiveBatch,serviceHeaders,authenticateService,handleEventsRequest} from '../events.mjs';
import {restrictionPlan,markSessionCovered,worksetApplied} from '../publication.mjs';

async function publishEvent(f,e){
 const bucket=f.eventBucket||(f.eventBucket=new Bucket()),cache=f.eventCache||(f.eventCache=new SecurityCache({bucket,store:f.store,prefix:'auth-private/v2/production/studio/generation1/',generation:'generation1'}));
 const family=await f.store.family(f.sid),suffix='security/session/'+f.sid;
 await cache.seed(suffix);
 const projection=await cache.publish(suffix,async()=>({cr:family.cr,app:'studio',env:'production',binding:JSON.parse(family.binding_json),localState:family.state,authorityReady:Boolean(family.authority_ready),validationDeadline:family.deadline,idleUntil:family.idle_until,s_exp:family.s_exp,enforcedTargets:[...(f.enforcedTargets||[]),e.target]}));
 f.enforcedTargets=projection.enforcedTargets;
 await markSessionCovered(f.store,{workId:e.eventId,sid:f.sid,projection,controlKey:cache.key(suffix),now:f.now});
 return worksetApplied(f.store,e.eventId);
}

const streams=new Map([['account-security',new Set(['owner-epoch'])]]);
async function event(f,sequence=1,kind='account-revoked',target={type:'accountCutoff',sub:f.sub,maxCe:4,maxAe:9,reason:'VOLUNTARY_LOGOUT',incidentId:null}){
 const e={schema:2,env:'production',sourceApp:'academy',targetApp:'studio',eventId:crypto.randomUUID(),operationId:crypto.randomUUID(),stream:'account-security',ownerEpoch:'owner-epoch',sequence,sub:f.sub,kind,target,committedAt:f.now,commitRef:crypto.randomUUID()};e.digest=await digest(e);return e;
}
function body(events){return canonical({schema:2,env:'production',sourceApp:'academy',targetApp:'studio',batchId:crypto.randomUUID(),events});}
function options(f,events,published=false){
 return {body:body(events),config:{app:'studio',env:'production'},store:f.store,streams,planEffect:e=>restrictionPlan(f.store,{workId:e.eventId,target:e.target,now:f.now}),publishAndCovered:async e=>published?publishEvent(f,e):false};
}
test('closed event direction and kind register rejects child authority and local epochs',async()=>{
 const f=await fixture(),e=await event(f);await validateEvent(e,{env:'production',targetApp:'studio',streams});
 for(const bad of [{...e,sourceApp:'hifz'},{...e,targetApp:'hifz'},{...e,kind:'ACCOUNT_REVOKED'},{...e,kind:'local-epoch',target:{type:'localEpoch'}}])await assert.rejects(validateEvent(bad,{env:'production',targetApp:'studio',streams}));
});
test('later denial is captured despite a sequence gap; APPLIED waits for every SID barrier',async()=>{
 const f=await fixture(),e=await event(f,3),r=await receiveBatch(options(f,[e],false));
 assert.equal(r.results[0].status,'CAPTURED');assert.equal(r.results[0].highestSeen,3);assert.equal(r.results[0].contiguousThrough,0);
 assert.equal((await f.store.family(f.sid)).state,'REVOKED');
 const publication=f.raw.prepare('SELECT * FROM jwt_v2_publications').get();assert.equal(publication.sid,f.sid);
 await assert.rejects(markSessionCovered(f.store,{workId:e.eventId,sid:f.sid,projection:{state:'ACTIVE',cr:999,binding:f.binding,localState:'REVOKED'},now:f.now}),/PURPOSE/);
 await publishEvent(f,e);
 assert.equal(await worksetApplied(f.store,e.eventId),true);
 const retry=await receiveBatch({...options(f,[e]),publishAndCovered:()=>worksetApplied(f.store,e.eventId)});
 assert.equal(retry.results[0].status,'APPLIED');assert.equal(retry.results[0].contiguousThrough,0);assert.equal(retry.results[0].gapPending,true);
});
test('new SID committed after a restriction watermark cannot escape its floor',async()=>{
 const f=await fixture(),e=await event(f);await receiveBatch(options(f,[e],false));
 const next={...f.binding,sid:crypto.randomUUID()};
 await assert.rejects(f.store.createFamily({binding:next,projection:{...f.projection,binding:next},capture:f.capture,fingerprint:'b'.repeat(64),now:f.now,deadline:f.deadline,idleUntil:f.idleUntil,policyMinutes:90,vectorGuards:[['test:scope','ACCOUNT:synthetic-account','owner-epoch',1]]}));
});
test('one event semantic conflict does not block another independent denial',async()=>{
 const f=await fixture(),bad=await event(f,1),good=await event(f,2);bad.kind='unknown-kind';
 const r=await receiveBatch(options(f,[bad,good],false));assert.equal(r.results[0].status,'CONFLICT');assert.equal(r.results[1].status,'CAPTURED');assert.equal((await f.store.family(f.sid)).state,'REVOKED');
});
test('duplicate same-ID/sequence conflict never replaces committed facts',async()=>{
 const f=await fixture(),e=await event(f);await receiveBatch(options(f,[e],false));
 const other={...e,target:{...e.target,maxAe:10}};delete other.digest;other.digest=await digest(other);
 const r=await receiveBatch(options(f,[other]));assert.equal(r.results[0].status,'CONFLICT');assert.equal(f.raw.prepare('SELECT digest FROM jwt_v2_events').get().digest,e.digest);
});
test('cursor advances only contiguous APPLIED entries, never highest seen',async()=>{
 const f=await fixture(),a=await event(f,1),b=await event(f,2),c=await event(f,3);
 let r=await receiveBatch(options(f,[c],true));assert.equal(r.results[0].contiguousThrough,0);
 r=await receiveBatch(options(f,[a],true));assert.equal(r.results[0].contiguousThrough,1);
 r=await receiveBatch(options(f,[b],true));assert.equal(r.results[0].contiguousThrough,3);
});
test('service MAC binds exact method/path/direction/body and durable nonce replay',async()=>{
 const f=await fixture(),key=crypto.getRandomValues(new Uint8Array(32)),raw=body([await event(f)]),path='/internal/auth/v2/events',origin='https://studio-control.example';
 const headers=await serviceHeaders({keyId:'service-1',key,path,env:'production',sourceApp:'academy',targetApp:'studio',now:f.now,body:bytes(raw)});
 const registry=new Map([['service-1',{key,env:'production',sourceApp:'academy',targetApp:'studio',paths:[path]}]]),config={app:'studio',env:'production',serviceOrigin:origin};
 const args={request:new Request(origin+path,{method:'POST',headers,body:raw}),body:bytes(raw),config,registry,store:f.store,now:f.now};
 await authenticateService(args);await assert.rejects(authenticateService(args),/NONCE_REUSED/);
 const fresh=await serviceHeaders({keyId:'service-1',key,path,env:'production',sourceApp:'academy',targetApp:'studio',now:f.now,body:bytes(raw)});
 await assert.rejects(authenticateService({...args,request:new Request(origin+path+'?wrong=1',{method:'POST',headers:fresh,body:raw})}),/ORIGIN/);
 await assert.rejects(authenticateService({...args,request:new Request(origin+path,{method:'POST',headers:fresh,body:raw}),body:bytes(raw+' ')}),/SIGNATURE/);
 await assert.rejects(authenticateService({...args,request:new Request(origin+path,{method:'POST',headers:fresh,body:raw}),now:f.now+31}),/SKEW/);
});
test('malformed/duplicate or oversized batch has no application effects',async()=>{
 const f=await fixture();await assert.rejects(receiveBatch({...options(f,[]),body:'{"schema":2,"schema":2}'}));
 await assert.rejects(receiveBatch({...options(f,[]),body:'x'.repeat(65537)}));
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_events').get().n,0);
});

test('a callback boolean cannot ACK without persisted typed publication work',async()=>{
 const f=await fixture(),e=await event(f);
 const r=await receiveBatch({...options(f,[e]),publishAndCovered:async()=>true});
 assert.equal(r.results[0].status,'CAPTURED');
});
