import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers.mjs';
import {readCookies} from '../tokens.mjs';
import {outboxSchemaSQL,retryDelaySeconds,deliverOutbox} from '../outbox.mjs';
import {canonical,digest,bytes,opaque} from '../codec.mjs';
import {serviceHeaders} from '../events.mjs';
const now=1000000,zeroJitter=()=>0;
function setup(){const f=database('academy');f.raw.exec(outboxSchemaSQL);return f;}
async function seed(f,{targetApp='studio',stream='account-security',attempts=0,nextAt=0}={}){
 const event={schema:2,env:'production',sourceApp:'academy',targetApp,eventId:crypto.randomUUID(),operationId:crypto.randomUUID(),stream,ownerEpoch:'synthetic-owner-epoch',sequence:1,sub:'synthetic-account',kind:'account-revoked',target:{type:'accountCutoff',sub:'synthetic-account',maxCe:4,maxAe:9,reason:'VOLUNTARY_LOGOUT',incidentId:null},committedAt:now,commitRef:crypto.randomUUID()};
 event.digest=await digest(event);
 f.raw.prepare("INSERT INTO jwt_v2_outbox(event_id,event_json,digest,target_app,attempts,next_attempt_at) VALUES(?,?,?,?,?,?)").run(event.eventId,canonical(event),event.digest,targetApp,attempts,nextAt);
 return event;
}
const pending=e=>({schema:2,results:[{eventId:e.eventId,digest:e.digest,status:'CAPTURED',appliedRef:null}]});
const ack=e=>({schema:2,results:[{eventId:e.eventId,digest:e.digest,status:'APPLIED',appliedRef:'synthetic-published-receipt'}]});

test('combined Cookie header permits exactly 8192 UTF8 bytes and rejects 8193 with431',()=>{
 const exact='unrelated='+'x'.repeat(8192-'unrelated='.length);assert.equal(bytes(exact).length,8192);
 assert.equal(readCookies(exact,'studio').access,undefined);
 assert.throws(()=>readCookies(exact+'x','studio'),e=>e.code==='COOKIE_HEADER_TOO_LARGE'&&e.status===431);
});
test('combined Cookie cap measures UTF8 bytes, including unrelated sibling cookies',()=>{
 const exact='unrelated='+'أ'.repeat((8192-'unrelated='.length)/2);assert.equal(bytes(exact).length,8192);assert(exact.length<8192);
 assert.equal(readCookies(exact,'hifz').refresh,undefined);
 assert.throws(()=>readCookies(exact+'x','hifz'),e=>e.status===431);
});
test('Cookie size rejection precedes current opaque-cookie parsing and duplicate checks',()=>{
 const invalid='__Host-studio_r=bad; __Host-studio_r=bad; padding=',oversized=invalid+'x'.repeat(8193-bytes(invalid).length);
 assert.throws(()=>readCookies(oversized,'studio'),e=>e.status===431);
 const r=opaque();assert.throws(()=>readCookies('__Host-studio_r='+r+'; __Host-studio_r='+r,'studio'),/DUPLICATE_COOKIE/);
 assert.throws(()=>readCookies('__Host-studio_r='+r+'=','studio'),/BASE64URL/);
});
test('exponential retry starts60s, doubles and caps at900s without integer exponent overflow',()=>{
 assert.deepEqual([1,2,3,4,5,6,7,100,Number.MAX_SAFE_INTEGER].map(n=>retryDelaySeconds(n,{jitter:zeroJitter})),[60,120,240,480,900,900,900,900,900]);
 for(const bad of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>retryDelaySeconds(bad,{jitter:zeroJitter}));
});
test('bounded deterministic jitter never shortens a base or exceeds the900s cap',()=>{
 const seen=[];const delays=[1,2,3,4,5,100].map(n=>retryDelaySeconds(n,{jitter:bounds=>{seen.push(bounds);return bounds.maxJitter;}}));
 assert.deepEqual(delays,[66,132,264,510,900,900]);assert.deepEqual(seen.map(x=>x.maxJitter),[6,12,24,30,0,0]);
 for(const jitter of [()=>-1,()=>1.2,()=>Infinity,({maxJitter})=>maxJitter+1])assert.throws(()=>retryDelaySeconds(1,{jitter}),/INVALID_OUTBOX_JITTER/);
});
test('per-item persisted eligibility enforces exact bases and no early retry after CAPTURED',async()=>{
 const f=setup(),e=await seed(f);let time=now,calls=0;
 for(const expected of [60,120,240,480,900,900]){
  const first=await deliverOutbox(f.store,{now:time,jitter:zeroJitter,sendAuthenticated:async event=>{calls++;return pending(event);}});
  assert.equal(first.attempted,1);assert.equal(first.applied,0);
  const row=f.raw.prepare('SELECT * FROM jwt_v2_outbox WHERE event_id=?').get(e.eventId);assert.equal(row.next_attempt_at-time,expected);
  const before=calls;
  const early=await deliverOutbox(f.store,{now:row.next_attempt_at-1,jitter:zeroJitter,sendAuthenticated:async event=>{calls++;return pending(event);}});
  assert.equal(early.attempted,0);assert.equal(calls,before);time=row.next_attempt_at;
 }
 assert.equal(calls,6);assert.equal(f.raw.prepare('SELECT attempts FROM jwt_v2_outbox').get().attempts,6);
});
test('transport failure uses the same60→900 retry schedule, without a fixed30s exception',async()=>{
 const f=setup(),e=await seed(f);let time=now;
 for(const expected of [60,120,240,480,900]){
  await deliverOutbox(f.store,{now:time,jitter:zeroJitter,sendAuthenticated:async()=>{throw Error('synthetic transport failure');}});
  const row=f.raw.prepare('SELECT * FROM jwt_v2_outbox WHERE event_id=?').get(e.eventId);assert.equal(row.next_attempt_at-time,expected);assert.equal(row.state,'PENDING');time=row.next_attempt_at;
 }
});
test('concurrent pumps durably claim one attempt and do not send the same event early',async()=>{
 const f=setup();await seed(f);let calls=0;
 const options={now,jitter:zeroJitter,sendAuthenticated:async e=>{calls++;await Promise.resolve();return pending(e);}};
 const results=await Promise.all([deliverOutbox(f.store,options),deliverOutbox(f.store,options)]);
 assert.equal(calls,1);assert.equal(results.reduce((n,r)=>n+r.attempted,0),1);
 assert.equal(f.raw.prepare('SELECT attempts,next_attempt_at FROM jwt_v2_outbox').get().attempts,1);
 assert.equal(f.raw.prepare('SELECT next_attempt_at FROM jwt_v2_outbox').get().next_attempt_at,now+60);
});
test('recipient fairness holds across limit1 calls at the same timestamp and fresh arrivals',async()=>{
 const f=setup();await seed(f,{targetApp:'hifz'});await seed(f,{targetApp:'studio'});await seed(f,{targetApp:'studio'});const recipients=[];
 for(let i=0;i<4;i++){
  await deliverOutbox(f.store,{now,limit:1,jitter:zeroJitter,sendAuthenticated:async e=>{recipients.push(e.targetApp);return pending(e);}});
  await seed(f,{targetApp:'hifz'});
 }
 assert.equal(new Set(recipients.slice(0,2)).size,2);assert.deepEqual(recipients,['hifz','studio','hifz','studio']);
});
test('independent streams and recipients each get a turn before a busy stream gets another',async()=>{
 const f=setup();for(let i=0;i<8;i++)await seed(f,{stream:'a-busy-stream'});
 await seed(f,{stream:'z-independent-stream'});await seed(f,{targetApp:'hifz',stream:'other-app-stream'});
 const turns=[];const r=await deliverOutbox(f.store,{now,limit:3,jitter:zeroJitter,sendAuthenticated:async e=>{turns.push(e.targetApp+':'+e.stream);return pending(e);}});
 assert.equal(r.attempted,3);assert.equal(new Set(turns).size,3);
});
test('a backed-off head never blocks a new eligible denial in the same stream',async()=>{
 const f=setup();await seed(f,{attempts:8,nextAt:now+900});const fresh=await seed(f);let sent;
 await deliverOutbox(f.store,{now,limit:1,jitter:zeroJitter,sendAuthenticated:async e=>{sent=e.eventId;return pending(e);}});
 assert.equal(sent,fresh.eventId);
});
test('one invocation selects at most50 pending events and transport sees one immutable event per call',async()=>{
 const f=setup();for(let i=0;i<53;i++)await seed(f);let calls=0;
 const result=await deliverOutbox(f.store,{now,limit:50,jitter:zeroJitter,sendAuthenticated:async e=>{calls++;return pending(e);}});
 assert.equal(result.attempted,50);assert.equal(calls,50);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_outbox WHERE attempts=0').get().n,3);
 await assert.rejects(deliverOutbox(f.store,{now,limit:51,sendAuthenticated:async()=>null}),/INVALID_OUTBOX_PUMP/);
});
for(const [name,reply] of [
 ['HTTP200 alone',()=>({status:200})],
 ['CAPTURED',pending],
 ['wrong event',e=>({schema:2,results:[{eventId:crypto.randomUUID(),digest:e.digest,status:'APPLIED',appliedRef:'receipt'}]})],
 ['wrong digest',e=>({schema:2,results:[{eventId:e.eventId,digest:'0'.repeat(64),status:'APPLIED',appliedRef:'receipt'}]})],
 ['empty receipt',e=>({schema:2,results:[{eventId:e.eventId,digest:e.digest,status:'APPLIED',appliedRef:''}]})],
 ['duplicate result',e=>({schema:2,results:[ack(e).results[0],pending(e).results[0]]})]
]){
 test(name+' leaves the exact event pending with persisted retry eligibility',async()=>{
  const f=setup();await seed(f);const result=await deliverOutbox(f.store,{now,jitter:zeroJitter,sendAuthenticated:reply});
  assert.equal(result.applied,0);const row=f.raw.prepare('SELECT state,next_attempt_at FROM jwt_v2_outbox').get();assert.equal(row.state,'PENDING');assert.equal(row.next_attempt_at,now+60);
 });
}
test('only a per-event matching APPLIED receipt ends delivery for that event',async()=>{
 const f=setup();const event=await seed(f);const r=await deliverOutbox(f.store,{now,jitter:zeroJitter,sendAuthenticated:ack});
 assert.equal(r.applied,1);assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_outbox WHERE event_id=?').get(event.eventId).state,'APPLIED');
 assert.equal((await deliverOutbox(f.store,{now:now+1000,sendAuthenticated:async()=>{throw Error('must not retry');}})).attempted,0);
});
test('immutable event bytes are reused while each transport attempt creates fresh authentication',async()=>{
 const f=setup();const original=await seed(f),headers=[],bodies=[],key=crypto.getRandomValues(new Uint8Array(32));
 const sendAuthenticated=async(e,context)=>{
  assert(Object.isFrozen(e));assert(Object.isFrozen(e.target));assert.equal(context.eventJSON,canonical(original));bodies.push(context.eventJSON);
  headers.push(await serviceHeaders({keyId:'synthetic-service',key,path:'/internal/auth/v2/events',env:'production',sourceApp:'academy',targetApp:e.targetApp,now:context.now,body:bytes(context.eventJSON)}));
  return pending(e);
 };
 await deliverOutbox(f.store,{now,jitter:zeroJitter,sendAuthenticated});await deliverOutbox(f.store,{now:now+60,jitter:zeroJitter,sendAuthenticated});
 assert.equal(bodies[0],bodies[1]);assert.notEqual(headers[0]['X-UAA-Service-Nonce'],headers[1]['X-UAA-Service-Nonce']);
 const stored=JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_outbox').all());
 for(const h of headers){assert(!stored.includes(h['X-UAA-Service-Nonce']));assert(!stored.includes(h['X-UAA-Service-Signature']));}
});
test('unsafe time/counter math and invalid jitter fail before transport or eligibility mutation',async()=>{
 for(const options of [{now:Number.MAX_SAFE_INTEGER-10,attempts:0},{now,attempts:Number.MAX_SAFE_INTEGER},{now,attempts:0,jitter:()=>999}]){
  const f=setup();await seed(f,{attempts:options.attempts});let calls=0;
  await assert.rejects(deliverOutbox(f.store,{now:options.now,jitter:options.jitter||zeroJitter,sendAuthenticated:async()=>{calls++;return null;}}));
  assert.equal(calls,0);const row=f.raw.prepare('SELECT attempts,next_attempt_at FROM jwt_v2_outbox').get();assert.equal(row.attempts,options.attempts);assert.equal(row.next_attempt_at,0);
 }
});
test('transport exceptions never log or persist credential-like error content',async()=>{
 const f=setup();await seed(f);const marker='SYNTHETIC-DO-NOT-LOG-CREDENTIAL',logs=[],old={log:console.log,warn:console.warn,error:console.error};
 try{
  for(const method of Object.keys(old))console[method]=(...args)=>logs.push(args);
  await deliverOutbox(f.store,{now,jitter:zeroJitter,sendAuthenticated:async()=>{throw Error(marker);}});
 }finally{Object.assign(console,old);}
 assert.equal(logs.length,0);assert(!JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_outbox').all()).includes(marker));
});
