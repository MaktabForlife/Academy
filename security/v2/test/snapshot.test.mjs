import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {database} from './helpers.mjs';
import {canonical,domainDigest,digest,bytes,strictJSON} from '../codec.mjs';
import {BUCKETS} from '../events.mjs';
import {restrictionPlan,worksetApplied} from '../publication.mjs';
import {snapshotSchemaSQL,SnapshotStore,SnapshotReceiver,buildSnapshot,serveSnapshotPage,validateReconcileRequest,validateEpoch,compareUtf8,streamingSnapshotDigest,encodeEventReplay,verifyEventReplay,persistEventReplay} from '../snapshot.mjs';
const config={env:'production',recipientApp:'studio'},now=1000000,epoch='owner-epoch';
const trust={stream:'account-security',currentEpoch:epoch};
let latestIssuedRequest=null;
const cursorKey=crypto.getRandomValues(new Uint8Array(32)),cursorKeyId='cursor-1';
function digestStreamFactory(){
 const hash=createHash('sha256');let resolve,reject;const digest=new Promise((r,j)=>{resolve=r;reject=j;});
 const stream=new WritableStream({write(chunk){hash.update(chunk);},close(){resolve(hash.digest());},abort(reason){reject(reason);}});
 Object.defineProperty(stream,'digest',{value:digest});return stream;
}
const request=()=>({schema:2,env:'production',sourceApp:'studio',targetApp:'academy',requestId:crypto.randomUUID(),ownerApp:'academy',recipientApp:'studio',stream:'account-security',ownerEpoch:epoch,contiguousThrough:0,missingRanges:[[1,7]],knownFloorsDigest:'0'.repeat(64),pageToken:null});
const credential=(i=0)=>({type:'credentialEpoch',sub:'synthetic-'+String(i).padStart(5,'0'),newCe:i+1,reason:'ADMIN_PIN_RESET'});
function db(app){const f=database(app);f.raw.exec(snapshotSchemaSQL);return {...f,snap:new SnapshotStore(f.store)};}
async function source(records=[],{baseChanges={},recordConfig={},clockOverride=()=>now,prepareOnly=false,configOverride=config,requestOverride}={}){
 const f=db('academy'),req=requestOverride??request();latestIssuedRequest=req;const base={schema:configOverride.snapshotSchema??2,env:'production',requestId:req.requestId,ownerApp:'academy',recipientApp:'studio',stream:'account-security',ownerEpoch:epoch,coveredThrough:7,predecessorEpoch:null,predecessorCoveredThrough:null,snapshotId:crypto.randomUUID(),createdAt:now,expiresAt:now+600,...baseChanges};
 f.raw.exec("CREATE TABLE isolated_capture_state(epoch TEXT,watermark INTEGER,pending INTEGER);INSERT INTO isolated_capture_state VALUES('owner-epoch',7,0);CREATE TABLE isolated_snapshot_facts(bucket TEXT,record_json TEXT);");
 for(const entry of records)f.raw.prepare('INSERT INTO isolated_snapshot_facts VALUES(?,?)').run(entry.bucket,canonical(entry.record));
 const buckets=configOverride.snapshotSchema===4?[...BUCKETS,'accountBaselines']:BUCKETS;
 const selectors=buckets.filter(b=>b!=='localCutoffs').map(bucket=>({bucket,sql:'SELECT record_json FROM isolated_snapshot_facts WHERE bucket=?',args:[bucket]}));
 const guard={sql:"SELECT 1 FROM isolated_capture_state WHERE epoch='owner-epoch' AND watermark=7 AND pending=0",args:[]};
 const id=await f.snap.capturePrimary({request:req,base,cursorKeyId,selectors,guard,config:configOverride,now});
 if(prepareOnly)return {...f,req,base,id,selectors,guard,recordConfig};
 const built=await buildSnapshot({store:f.snap,snapshotId:id,cursorKey,cursorKeyId,config:configOverride,recordConfig,now,digestStreamFactory,clock:clockOverride});
 const pages=[];let pageToken=null;
 for(let i=0;i<built.metadata.pageCount;i++){
  const raw=await serveSnapshotPage({store:f.snap,request:{...req,pageToken},config:configOverride,cursorKey,cursorKeyId,now});pages.push(strictJSON(raw));pageToken=pages.at(-1).nextPageToken;
 }
 return {...f,req,base,id,built,pages,selectors,guard,recordConfig};
}
function receiver({trustOverride=trust,recordConfig={},pendingRequest=latestIssuedRequest}={}){
 const f=db('studio');return {...f,receiver:new SnapshotReceiver({store:f.snap,config,trust:trustOverride,recordConfig,digestStreamFactory,clock:()=>now,pendingRequest})};
}
async function rechain(pages){
 const metadata=Object.fromEntries(Object.entries(pages[0]).filter(([k])=>!['mode','snapshotDigest','pageIndex','recordOffset','entries','previousPageDigest','pageDigest','nextPageToken'].includes(k)));
 let previous=await domainDigest('uaa-snapshot-start-v2',{metadata,snapshotDigest:pages[0].snapshotDigest});
 for(const p of pages){p.previousPageDigest=previous;delete p.pageDigest;p.pageDigest=await domainDigest('uaa-snapshot-page-v2',p);previous=p.pageDigest;}
 return pages;
}
const clones=pages=>pages.map(p=>structuredClone(p));
async function stageAll(r,pages,time=now){let result;for(const p of pages)result=await r.receiver.stage(canonical(p),{now:time});return result;}

test('reconciliation request is a closed profile with bounded ascending missing ranges',()=>{
 validateReconcileRequest(request(),config);
 for(const changes of [{extra:1},{missingRanges:[[2,4],[4,5]]},{missingRanges:[[0,1]]},{ownerEpoch:null,contiguousThrough:1},{sourceApp:'hifz'},{knownFloorsDigest:'bad'},{pageToken:'x'.repeat(43)}])assert.throws(()=>validateReconcileRequest({...request(),...changes},config));
});
test('empty state has one persisted canonical page, eight explicit buckets and exact final digest',async()=>{
 const f=await source(),p=f.pages[0];assert.equal(f.pages.length,1);assert.equal(p.totalRecords,0);assert.equal(p.recordOffset,0);assert.deepEqual(p.entries,[]);
 const state={schema:2,...Object.fromEntries(BUCKETS.map(b=>[b,[]]))};
 assert.equal(p.snapshotDigest,await domainDigest('uaa-security-snapshot-v2',{metadata:f.built.metadata,state}));
 const r=receiver(),verified=await stageAll(r,f.pages);assert.equal(verified.status,'VERIFIED');assert.equal(verified.publicationPending,true);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
});
test('greedy 20-record pages use fixed bucket and unsigned UTF8 canonical-record ordering',async()=>{
 const records=Array.from({length:43},(_,i)=>({bucket:'credentialFloors',record:credential(42-i)}));
 records.push({bucket:'accountCutoffs',record:{type:'accountCutoff',sub:'another',maxCe:1,maxAe:1,reason:'VOLUNTARY_LOGOUT',incidentId:null}});
 const f=await source(records);assert.deepEqual(f.pages.map(p=>p.entries.length),[20,20,4]);assert.equal(f.pages[0].entries[0].bucket,'accountCutoffs');
 assert.equal(f.raw.prepare("SELECT status FROM jwt_v2_reconcile_captures").get().status,'READY');
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_reconcile_pages').get().n,3);
 const entries=f.pages.flatMap(p=>p.entries).filter(e=>e.bucket==='credentialFloors').map(e=>canonical(e.record));
 assert.deepEqual(entries,[...entries].sort(compareUtf8));assert.equal((await stageAll(receiver(),f.pages)).status,'VERIFIED');
});
test('same request retries return byte-identical persisted pages and cannot change bindings',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]);
 const args={store:f.snap,request:f.req,config,cursorKey,cursorKeyId,now};
 const first=await serveSnapshotPage(args);f.raw.exec('DELETE FROM isolated_snapshot_facts');
 const second=await serveSnapshotPage(args);assert.equal(first,second);
 await assert.rejects(serveSnapshotPage({...args,request:{...f.req,contiguousThrough:1}}),/REQUEST_CONFLICT/);
 await assert.rejects(f.snap.capturePrimary({request:{...f.req,missingRanges:[]},base:f.base,cursorKeyId,selectors:f.selectors,guard:f.guard,config,now}),/REQUEST_CONFLICT/);
});
test('primary capture guard failure leaves no captured or partially copied snapshot',async()=>{
 const f=db('academy'),req=request(),base={schema:2,env:'production',requestId:req.requestId,ownerApp:'academy',recipientApp:'studio',stream:'account-security',ownerEpoch:epoch,coveredThrough:7,predecessorEpoch:null,predecessorCoveredThrough:null,snapshotId:crypto.randomUUID(),createdAt:now,expiresAt:now+600};
 await assert.rejects(f.snap.capturePrimary({request:req,base,cursorKeyId,selectors:[],guard:{sql:'SELECT 1 WHERE 0',args:[]},config,now}));
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_reconcile_captures').get().n,0);
});
test('capture rows are immutable and later live source mutations cannot change a snapshot',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]);f.raw.exec("UPDATE isolated_snapshot_facts SET record_json='{}'");
 const rebuilt=await buildSnapshot({store:f.snap,snapshotId:f.id,cursorKey,cursorKeyId,config,now,digestStreamFactory,clock:()=>now});assert.equal(rebuilt.snapshotDigest,f.built.snapshotDigest);
 assert.throws(()=>f.raw.exec("UPDATE jwt_v2_reconcile_records SET raw_json='{}'"),/immutable/);
 assert.throws(()=>f.raw.prepare("INSERT INTO jwt_v2_reconcile_records(snapshot_id,bucket,raw_json) VALUES(?,'credentialFloors','{}')").run(f.id),/immutable/);
});
test('duplicate canonical facts and equal-identity conflicting facts fail capture rather than selection',async()=>{
 await assert.rejects(source([{bucket:'credentialFloors',record:credential()},{bucket:'credentialFloors',record:credential()}]),/DUPLICATE_OR_CONFLICTING/);
 const p={type:'policy',policyId:'session-inactivity',ownerEpoch:epoch,revision:1,inactivityMinutes:90};
 await assert.rejects(source([{bucket:'policies',record:p},{bucket:'policies',record:{...p,inactivityMinutes:30}}]),/DUPLICATE_OR_CONFLICTING/);
});
test('remote local cutoffs, own API key withdrawals and unregistered dependencies fail',async()=>{
 const f=await source(),r=receiver();
 const wrong=structuredClone(f.pages[0]);wrong.bucketCounts.localCutoffs=1;wrong.totalRecords=1;wrong.entries=[{bucket:'localCutoffs',record:{type:'localEpoch'}}];await rechain([wrong]);
 await assert.rejects(r.receiver.stage(canonical(wrong),{now}),/REMOTE_SNAPSHOT/);
 await assert.rejects(source([{bucket:'keyWithdrawals',record:{type:'key',purpose:'studio-api',kid:'test',registryRevision:1}}]),/SNAPSHOT_KEY/);
 await assert.rejects(source([{bucket:'dependencyFloors',record:{type:'dependency',id:'unknown',ownerEpoch:epoch,revision:1,effect:'INVALIDATE',deniedActions:[]}}]),/DEPENDENCY_OWNER/);
});
test('unknown epochs require configured genesis or an authenticated exact predecessor bridge',async()=>{
 const f=await source(),untrusted=receiver({trustOverride:{stream:'account-security',currentEpoch:'older'}});
 await assert.rejects(untrusted.receiver.stage(canonical(f.pages[0]),{now}),/BRIDGE_REQUIRED/);
 validateEpoch({...f.built.metadata,ownerEpoch:'next',predecessorEpoch:'older',predecessorCoveredThrough:7},{stream:'account-security',currentEpoch:'older',bridges:new Map([['next',{predecessorEpoch:'older',coveredThrough:7,denialsIncluded:true}]])});
 assert.throws(()=>validateEpoch({...f.built.metadata,ownerEpoch:'next',predecessorEpoch:'missing',predecessorCoveredThrough:7},{stream:'account-security',currentEpoch:'older',bridges:new Map([['next',{predecessorEpoch:'older',coveredThrough:7,denialsIncluded:true}]])}),/BRIDGE/);
 assert.throws(()=>validateEpoch(f.built.metadata,{stream:'account-security',currentEpoch:null,genesisEpoch:'different'}),/GENESIS/);
});
test('future pages may stage but cannot skip a predecessor or advance a cursor',async()=>{
 const f=await source(Array.from({length:43},(_,i)=>({bucket:'credentialFloors',record:credential(i)}))),r=receiver();
 assert.equal((await r.receiver.stage(canonical(f.pages[2]),{now})).status,'STAGED');assert.equal((await r.receiver.stage(canonical(f.pages[0]),{now})).status,'STAGED');
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
 await assert.rejects(r.receiver.finishApplied(f.id,{now}),/NOT_VERIFIED|INCOMPLETE/);
 assert.equal((await r.receiver.stage(canonical(f.pages[1]),{now})).status,'VERIFIED');
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
});
test('identical duplicate page is harmless; conflicting duplicate page cannot replace it',async()=>{
 const f=await source(Array.from({length:21},(_,i)=>({bucket:'credentialFloors',record:credential(i)}))),r=receiver(),raw=canonical(f.pages[0]);
 await r.receiver.stage(raw,{now});await r.receiver.stage(raw,{now});
 const wrong=clones(f.pages);wrong[0].entries[0].record.reason='PASSWORD_RESET';await rechain(wrong);
 await assert.rejects(r.receiver.stage(canonical(wrong[0]),{now}),/CONFLICTING_DUPLICATE/);
 assert.equal(r.raw.prepare('SELECT page_json FROM jwt_v2_receive_pages WHERE page_index=0').get().page_json,raw);
});
test('changed metadata on a later page is rejected before completion',async()=>{
 const f=await source(Array.from({length:21},(_,i)=>({bucket:'credentialFloors',record:credential(i)}))),r=receiver();await r.receiver.stage(canonical(f.pages[0]),{now});
 const p=structuredClone(f.pages[1]);p.createdAt++;p.expiresAt++;delete p.pageDigest;p.pageDigest=await domainDigest('uaa-snapshot-page-v2',p);
 await assert.rejects(r.receiver.stage(canonical(p),{now}),/METADATA_CONFLICT/);
});
test('correct per-page hashes cannot excuse an incorrect contiguous record offset',async()=>{
 const f=await source(Array.from({length:21},(_,i)=>({bucket:'credentialFloors',record:credential(i)}))),pages=clones(f.pages),r=receiver();pages[1].recordOffset++;await rechain(pages);
 await assert.rejects(stageAll(r,pages),/CHAIN_OR_OFFSET/);
});
test('correct per-page hashes cannot excuse global cross-page record reordering',async()=>{
 const f=await source(Array.from({length:40},(_,i)=>({bucket:'credentialFloors',record:credential(i)}))),pages=clones(f.pages),r=receiver();
 [pages[0].entries,pages[1].entries]=[pages[1].entries,pages[0].entries];await rechain(pages);
 await assert.rejects(stageAll(r,pages),/RECORD_ORDER/);
});
test('repeated claimed snapshot digest is recomputed over all records, not trusted',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),pages=clones(f.pages);pages[0].snapshotDigest='a'.repeat(64);await rechain(pages);
 await assert.rejects(stageAll(receiver(),pages),/FINAL_DIGEST/);
});
test('matching metadata and page hashes cannot hide omitted or extra declared counts',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),pages=clones(f.pages);
 pages[0].totalRecords++;pages[0].bucketCounts.credentialFloors++;await rechain(pages);
 await assert.rejects(stageAll(receiver(),pages),/COUNT_CONFLICT/);
});
test('capture has a fixed 600-second transport expiry with no grace or lease extension',async()=>{
 const f=await source(),r=receiver();await r.receiver.stage(canonical(f.pages[0]),{now});
 await assert.rejects(r.receiver.verify(f.id,{now:now+600}),/EXPIRED/);
 await assert.rejects(serveSnapshotPage({store:f.snap,request:f.req,config,cursorKey,cursorKeyId,now:now+600}),/EXPIRED/);
});
test('continuation tokens are fixed and bound to exact capture/request/next index',async()=>{
 const f=await source(Array.from({length:21},(_,i)=>({bucket:'credentialFloors',record:credential(i)})));
 const token=f.pages[0].nextPageToken;assert.equal(token.length,43);
 const raw=await serveSnapshotPage({store:f.snap,request:{...f.req,pageToken:token},config,cursorKey,cursorKeyId,now});assert.equal(strictJSON(raw).pageIndex,1);
 await assert.rejects(serveSnapshotPage({store:f.snap,request:{...f.req,pageToken:token.slice(0,42)+(token[42]==='A'?'E':'A')},config,cursorKey,cursorKeyId,now}));
 await assert.rejects(serveSnapshotPage({store:f.snap,request:{...f.req,pageToken:token},config,cursorKey:crypto.getRandomValues(new Uint8Array(32)),cursorKeyId,now}),/CURSOR/);
});


test('VERIFIED bytes are not APPLIED until each record has an applied publication workset',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),r=receiver();await stageAll(r,f.pages);
 const known={type:'credentialEpoch',sub:'older-known-floor',newCe:10,reason:'PASSWORD_RESET'};
 r.raw.prepare('INSERT INTO jwt_v2_restrictions(restriction_id,target_json,digest,created_at) VALUES(?,?,?,?)').run('known',canonical(known),await digest(known),now);
 const result=await r.receiver.applyRecords(f.id,{now,planEffect:async({record,offset})=>{const workId=f.id+':'+offset;return {workId,statements:await restrictionPlan(r.store,{workId,target:record,now})};}});
 assert.equal(result.status,'VERIFIED');assert.equal(result.publicationPending,true);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
 for(const row of r.raw.prepare('SELECT work_id FROM jwt_v2_snapshot_effects').all())assert.equal(await worksetApplied(r.store,row.work_id),true);
 const finished=await r.receiver.finishApplied(f.id,{now});assert.equal(finished.status,'APPLIED');assert.equal(finished.coveredThrough,7);
 assert.equal(r.raw.prepare('SELECT contiguous_through FROM jwt_v2_event_streams').get().contiguous_through,7);
 assert.equal(r.raw.prepare("SELECT target_json FROM jwt_v2_restrictions WHERE restriction_id='known'").get().target_json,canonical(known));
});
test('noncanonical wire, duplicate members, wrong hashes and oversized page are explicit failures',async()=>{
 const f=await source(),raw=canonical(f.pages[0]);
 await assert.rejects(receiver().receiver.stage(raw+' ',{now}),/NONCANONICAL/);
 await assert.rejects(receiver().receiver.stage(raw.replace('"schema":2','"schema":2,"schema":2'),{now}),/DUPLICATE_MEMBER/);
 const bad=structuredClone(f.pages[0]);bad.pageDigest='0'.repeat(64);await assert.rejects(receiver().receiver.stage(canonical(bad),{now}),/PAGE_DIGEST/);
 await assert.rejects(receiver().receiver.stage(' '.repeat(65537),{now}),/BODY_TOO_LARGE/);
});
test('streaming final hash matches the exact canonical full-state digest without retaining all records',async()=>{
 const metadata={test:'synthetic'},count=10000;let writes=0,maxChunk=0;
 function factory(){
  const inner=digestStreamFactory(),writer=inner.getWriter(),stream=new WritableStream({write(chunk){writes++;maxChunk=Math.max(maxChunk,chunk.length);return writer.write(chunk);},close(){return writer.close();}});
  Object.defineProperty(stream,'digest',{value:inner.digest});return stream;
 }
 async function *records(bucket){if(bucket==='credentialFloors')for(let i=0;i<count;i++)yield canonical(credential(i));}
 const actual=await streamingSnapshotDigest(metadata,records,{digestStreamFactory:factory});
 const state={schema:2,...Object.fromEntries(BUCKETS.map(b=>[b,b==='credentialFloors'?Array.from({length:count},(_,i)=>credential(i)):[]]))};
 assert.equal(actual,await domainDigest('uaa-security-snapshot-v2',{metadata,state}));assert(writes>count);assert(maxChunk<1024);
});
test('large dependency records split by encoded bytes and an oversized single record fails',async()=>{
 const actions=Array.from({length:350},(_,i)=>'action-'+String(i).padStart(3,'0')+'-'+'x'.repeat(95)),dependencies=new Map();
 const entries=[0,1].map(i=>{const id='academy:large:'+i;dependencies.set(id,{ownerApp:'academy',scope:'GLOBAL',recipients:['studio'],epoch,actions});return {bucket:'dependencyFloors',record:{type:'dependency',id,ownerEpoch:epoch,revision:1,effect:'DENY',deniedActions:actions}};});
 const f=await source(entries,{recordConfig:{dependencies}});
 assert.deepEqual(f.pages.map(p=>p.entries.length),[1,1]);assert(f.pages.every(p=>bytes(canonical(p)).length<=65536));
 assert.equal((await stageAll(receiver({recordConfig:{dependencies}}),f.pages)).status,'VERIFIED');
 const big=Array.from({length:650},(_,i)=>'action-'+String(i).padStart(3,'0')+'-'+'x'.repeat(95)),id='academy:oversized';dependencies.set(id,{ownerApp:'academy',scope:'GLOBAL',recipients:['studio'],epoch,actions:big});
 await assert.rejects(source([{bucket:'dependencyFloors',record:{type:'dependency',id,ownerEpoch:epoch,revision:1,effect:'DENY',deniedActions:big}}],{recordConfig:{dependencies}}),/TOO_LARGE/);
});
async function replayEvent(sequence=1){
 const event={schema:2,env:'production',sourceApp:'academy',targetApp:'studio',eventId:crypto.randomUUID(),operationId:crypto.randomUUID(),stream:'account-security',ownerEpoch:epoch,sequence,sub:'synthetic',kind:'credential-epoch-advanced',target:{type:'credentialEpoch',sub:'synthetic',newCe:2,reason:'ADMIN_PIN_RESET'},committedAt:now,commitRef:crypto.randomUUID()};
 event.digest=await digest(event);return event;
}
test('EVENTS replay is fixed, sorted/range checked, bounded and never grants watermark coverage',async()=>{
 const req=request(),events=[await replayEvent(1),await replayEvent(3)],streams=new Map([['account-security',new Set([epoch])]]);
 const args={request:req,events,coveredThrough:7,ownerEpoch:epoch,config,streams};
 const raw=await encodeEventReplay(args),verified=await verifyEventReplay({...args,raw});
 assert.equal(verified.automaticCoverage,false);assert.equal(verified.sourceWatermark,7);assert.deepEqual(verified.events.map(e=>e.sequence),[1,3]);
 await assert.rejects(encodeEventReplay({...args,events:[events[1],events[0]]}),/RANGE_CONFLICT/);
 await assert.rejects(encodeEventReplay({...args,events:Array(21).fill(events[0])}),/INVALID_EVENT_REPLAY/);
 const wrong=strictJSON(raw);wrong.coveredThrough=8;await assert.rejects(verifyEventReplay({...args,raw:canonical(wrong)}),/DIGEST_OR_WIRE/);
 const f=db('academy'),saved=await persistEventReplay({store:f.snap,request:req,raw,guard:{sql:'SELECT 1',args:[]},config,streams});
 assert.equal(saved,raw);assert.equal(await persistEventReplay({store:f.snap,request:req,raw:'unrelated new response',guard:{sql:'SELECT 1',args:[]},config,streams}),raw);
 await assert.rejects(persistEventReplay({store:f.snap,request:{...req,contiguousThrough:1},raw,guard:{sql:'SELECT 1',args:[]},config,streams}),/REQUEST_CONFLICT/);
});

test('source and receiver recheck actual time at final validation rather than only request start',async()=>{
 await assert.rejects(source([],{clockOverride:()=>now+600}),/EXPIRED/);
 const f=await source([{bucket:'credentialFloors',record:credential()}]),r=receiver();r.receiver.clock=()=>now+600;
 await assert.rejects(stageAll(r,f.pages),/EXPIRED/);
 assert.equal(r.raw.prepare('SELECT status FROM jwt_v2_receive_snapshots').get().status,'STAGED');
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
});
test('non-greedy page partition fails even when all page and final-state hashes are consistent',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential(0)},{bucket:'credentialFloors',record:credential(1)}]),original=f.pages[0],p0=structuredClone(original),p1=structuredClone(original);
 for(const p of [p0,p1])p.pageCount=2;
 p0.entries=[original.entries[0]];p0.nextPageToken=b64TestToken();
 p1.entries=[original.entries[1]];p1.pageIndex=1;p1.recordOffset=1;p1.nextPageToken=null;
 const metadata={...f.built.metadata,pageCount:2},state={schema:2,...Object.fromEntries(BUCKETS.map(b=>[b,b==='credentialFloors'?original.entries.map(e=>e.record):[]]))};
 const final=await domainDigest('uaa-security-snapshot-v2',{metadata,state});p0.snapshotDigest=final;p1.snapshotDigest=final;await rechain([p0,p1]);
 await assert.rejects(stageAll(receiver(),[p0,p1]),/NON_GREEDY/);
});
function b64TestToken(){return 'A'.repeat(43);}
test('stored capture metadata and page bytes cannot be rewritten after materialisation',async()=>{
 const f=await source();
 assert.throws(()=>f.raw.exec("UPDATE jwt_v2_reconcile_captures SET cursor_key_id='different'"),/immutable/);
 assert.throws(()=>f.raw.exec("UPDATE jwt_v2_reconcile_pages SET page_json='{}'"),/immutable/);
 const r=receiver();await stageAll(r,f.pages);
 assert.throws(()=>r.raw.exec("UPDATE jwt_v2_receive_snapshots SET metadata_json='{}'"),/immutable/);
 assert.throws(()=>r.raw.exec("UPDATE jwt_v2_receive_pages SET page_json='{}'"),/immutable/);
});
test('empty EVENTS replay still requires a recognised stream epoch',async()=>{
 const req=request(),streams=new Map([['account-security',new Set([epoch])]]);
 await assert.rejects(encodeEventReplay({request:req,events:[],coveredThrough:7,ownerEpoch:'unknown',config,streams}),/RECONCILIATION_REQUIRED/);
});

test('an unrelated APPLIED workset cannot stand in for a snapshot record effect',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),r=receiver();await stageAll(r,f.pages);
 const other={type:'credentialEpoch',sub:'different-account',newCe:99,reason:'PASSWORD_RESET'};
 await r.store.batch(await restrictionPlan(r.store,{workId:'unrelated',target:other,now}));await worksetApplied(r.store,'unrelated');
 await assert.rejects(r.receiver.applyRecords(f.id,{now,planEffect:async()=>({workId:'unrelated',statements:[]})}));
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_snapshot_effects').get().n,0);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_event_streams').get().n,0);
});
test('expiry while planning an effect prevents its primary mutation and application receipt',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),r=receiver();await stageAll(r,f.pages);
 let current=now;r.receiver.clock=()=>current;
 await assert.rejects(r.receiver.applyRecords(f.id,{now,planEffect:async({record})=>{const statements=await restrictionPlan(r.store,{workId:'late',target:record,now});current=now+600;return {workId:'late',statements};}}),/EXPIRED/);
 assert.equal(r.raw.prepare("SELECT count(*) n FROM jwt_v2_worksets WHERE work_id='late'").get().n,0);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_snapshot_effects').get().n,0);
});
test('EVENTS mode cannot switch a recognised epoch; genesis must be configured explicitly',async()=>{
 const req=request(),streams=new Map([['account-security',new Set([epoch,'new-epoch'])]]);
 await assert.rejects(encodeEventReplay({request:req,events:[],coveredThrough:7,ownerEpoch:'new-epoch',config,streams}),/RECONCILIATION_REQUIRED/);
 const genesis={...req,ownerEpoch:null,contiguousThrough:0,knownFloorsDigest:null};
 await assert.rejects(encodeEventReplay({request:genesis,events:[],coveredThrough:7,ownerEpoch:epoch,config,streams}),/RECONCILIATION_REQUIRED/);
 assert(await encodeEventReplay({request:genesis,events:[],coveredThrough:7,ownerEpoch:epoch,config:{...config,genesisEpoch:epoch},streams}));
});

test('a valid authenticated-format snapshot for an unissued request cannot store first-page metadata',async()=>{
 const f=await source(),r=receiver({pendingRequest:null});
 await assert.rejects(r.receiver.stage(canonical(f.pages[0]),{now}),/UNREQUESTED/);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_snapshots').get().n,0);
 await r.receiver.registerRequest(f.req);
 assert.equal((await r.receiver.stage(canonical(f.pages[0]),{now})).status,'VERIFIED');
});
test('receiver request registration is durable, same-ID immutable and direction/range validated',async()=>{
 const f=await source(),r=receiver({pendingRequest:null});
 assert.equal((await r.receiver.registerRequest(f.req)).status,'PENDING');
 const restarted=new SnapshotReceiver({store:r.snap,config,trust,digestStreamFactory,clock:()=>now});
 assert.equal((await restarted.registerRequest(f.req)).status,'PENDING');
 await assert.rejects(restarted.registerRequest({...f.req,missingRanges:[]}),/REQUEST_CONFLICT/);
 await assert.rejects(restarted.registerRequest({...request(),sourceApp:'hifz'}),/INVALID_RECONCILE/);
 await assert.rejects(restarted.registerRequest({...request(),missingRanges:[[3,5],[4,6]]}),/MISSING_RANGES/);
 await assert.rejects(restarted.registerRequest({...request(),pageToken:'A'.repeat(43)}),/REGISTRATION/);
 assert.equal((await restarted.stage(canonical(f.pages[0]),{now})).status,'VERIFIED');
});
test('pending request stream/epoch bindings cannot be replaced by another well-formed reply',async()=>{
 const f=await source(),r=receiver({pendingRequest:null});
 await r.receiver.registerRequest({...f.req,ownerEpoch:'different-observed-epoch'});
 await assert.rejects(r.receiver.stage(canonical(f.pages[0]),{now}),/EPOCH_CONFLICT/);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_snapshots').get().n,0);
 const differentStream={...f.req,requestId:crypto.randomUUID(),stream:'unregistered-stream'};
 await assert.rejects(r.receiver.registerRequest(differentStream),/REGISTRATION/);
});
test('cancelled reconciliation request cannot resume or advance snapshot coverage',async()=>{
 const f=await source(),r=receiver({pendingRequest:null});await r.receiver.registerRequest(f.req);await r.receiver.cancelRequest(f.req.requestId);
 await assert.rejects(r.receiver.stage(canonical(f.pages[0]),{now}),/UNREQUESTED/);
 await assert.rejects(r.receiver.registerRequest(f.req),/CANCELLED/);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_snapshots').get().n,0);
});

test('concurrent immutable request registration and identical page retries are idempotent',async()=>{
 const f=await source([{bucket:'credentialFloors',record:credential()}]),r=receiver({pendingRequest:null});
 const registrations=await Promise.all(Array.from({length:5},()=>r.receiver.registerRequest(f.req)));
 assert(registrations.every(x=>x.status==='PENDING'));assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_requests').get().n,1);
 const results=await Promise.all(Array.from({length:5},()=>r.receiver.stage(canonical(f.pages[0]),{now})));
 assert(results.every(x=>x.status==='VERIFIED'));assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_snapshots').get().n,1);
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_records').get().n,1);
});

test('bounded snapshot steps recover normalisation and page signing across store restarts',async()=>{
 const input=Array.from({length:341},(_,i)=>({bucket:'credentialFloors',record:credential(i)}));
 const f=await source(input,{prepareOnly:true});
 try{
  const args={snapshotId:f.id,cursorKey,cursorKeyId,config,now,digestStreamFactory,clock:()=>now,step:true};
  const states=[],callsByStep=[];
  let result;
  for(let step=0;step<12;step++){
   let calls=0;
   const primary={
    first(...args){calls++;return f.store.first(...args);},
    all(...args){calls++;return f.store.all(...args);},
    batch(statements){calls++;return f.store.batch(statements);},
    stmt(...args){
     const statement=f.store.stmt(...args),run=statement.run.bind(statement);
     statement.run=(...params)=>{calls++;return run(...params);};
     return statement;
    }
   };
   const store=new SnapshotStore(primary);
   result=await buildSnapshot({store,...args});
   assert.ok(calls<50,'Build step must preserve D1 headroom');
   callsByStep.push(calls);
   if(!result.pending)break;
   states.push(result.pending);
   await assert.rejects(serveSnapshotPage({store,request:f.req,config,cursorKey,cursorKeyId,now}),/SNAPSHOT_CAPTURE_UNAVAILABLE/);
  }
  assert.deepEqual(states,['NORMALISING','NORMALISING','NORMALISING','NORMALISING','ASSEMBLING','ASSEMBLING','SIGNING','SIGNING']);
  assert.equal(result.metadata.totalRecords,input.length);
  assert.equal(result.metadata.pageCount,18);
  const check=receiver({pendingRequest:f.req});
  try{
   let pageToken=null,verified;
   for(let i=0;i<result.metadata.pageCount;i++){
    const raw=await serveSnapshotPage({store:new SnapshotStore(f.store),request:{...f.req,pageToken},config,cursorKey,cursorKeyId,now});
    pageToken=JSON.parse(raw).nextPageToken;
    verified=await check.receiver.stage(raw,{now});
   }
   assert.equal(pageToken,null);
   assert.equal(verified.status,'VERIFIED');
  }finally{check.raw.close();}
  const again=await buildSnapshot({store:new SnapshotStore(f.store),...args});
  assert.deepEqual(again,result);
  console.log('Isolated source build fixture',JSON.stringify({records:input.length,callsByStep,states,pages:result.metadata.pageCount}));
 }finally{f.raw.close();}
});

test('bounded schema-4 signing matches every page byte across an epoch bridge',async()=>{
 const bridgeEpoch='owner-epoch-next',schema4={...config,snapshotSchema:4};
 const req=request(),snapshotId=crypto.randomUUID();
 const recordConfig={recognisedEpochs:new Set([epoch,bridgeEpoch])};
 const input=Array.from({length:141},(_,i)=>({bucket:'credentialFloors',record:credential(i)}));
 for(const ownerEpoch of recordConfig.recognisedEpochs)input.push({bucket:'policies',record:{
  type:'policy',policyId:'session-inactivity',ownerEpoch,revision:1,inactivityMinutes:90
 }});
 input.push({bucket:'accountBaselines',record:{type:'accountBaseline',sub:'synthetic-baseline',ce:2,ae:4}});
 const opts={configOverride:schema4,requestOverride:req,recordConfig,
  baseChanges:{snapshotId,ownerEpoch:bridgeEpoch,predecessorEpoch:epoch,predecessorCoveredThrough:7}};
 const normal=await source(input,opts),bounded=await source(input,{...opts,prepareOnly:true});
 try{
  let output;
  for(let calls=0;calls<8;calls++){
   output=await buildSnapshot({store:new SnapshotStore(bounded.store),snapshotId,config:schema4,
    cursorKey,cursorKeyId,recordConfig,now,digestStreamFactory,clock:()=>now,step:true});
   if(!output.pending)break;
  }
  assert.deepEqual(output,normal.built);
  let pageToken=null;
  for(const expected of normal.pages){
   const wire=await serveSnapshotPage({store:bounded.snap,request:{...req,pageToken},config:schema4,cursorKey,cursorKeyId,now});
   assert.equal(wire,canonical(expected));
   pageToken=expected.nextPageToken;
  }
  assert.equal(pageToken,null);
 }finally{normal.raw.close();bounded.raw.close();}
});
