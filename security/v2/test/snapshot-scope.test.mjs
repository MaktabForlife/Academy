import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {database} from './helpers.mjs';
import {canonical,strictJSON,domainDigest} from '../codec.mjs';
import {SnapshotStore,SnapshotReceiver,buildSnapshot,serveSnapshotPage,snapshotEffect,encodeEventReplay,validateRecord} from '../snapshot.mjs';
import {BUCKETS} from '../events.mjs';
import {restrictionPlan,worksetApplied} from '../publication.mjs';
import {dependencyScope} from '../issuance-floors.mjs';
import {captureDDL} from '../capture.mjs';
const now=1000000,epoch='source-epoch',cursorKey=crypto.getRandomValues(new Uint8Array(32)),cursorKeyId='cursor-key';
const config={env:'production',recipientApp:'hifz',snapshotSchema:3},trust={stream:'account-security',currentEpoch:epoch};
const dependencies=new Map([['academy:profile',{ownerApp:'academy',epoch,scope:'ACCOUNT',recipients:['hifz'],actions:['read','write']}],['academy:global',{ownerApp:'academy',epoch,scope:'GLOBAL',recipients:['hifz'],actions:['write']}]]);
const target=(sub,changes={})=>({type:'dependency',id:'academy:profile',ownerEpoch:epoch,revision:5,effect:'INVALIDATE',deniedActions:[],sub,...changes});
function digestStreamFactory(){const h=createHash('sha256');let resolve;const digest=new Promise(r=>{resolve=r;});const stream=new WritableStream({write:b=>h.update(b),close:()=>resolve(h.digest())});Object.defineProperty(stream,'digest',{value:digest});return stream;}
async function source(records,{version=3,registry=dependencies}={}){
 const d=database('academy'),snap=new SnapshotStore(d.store),cfg={...config,snapshotSchema:version};
 d.raw.exec('CREATE TABLE source_facts(bucket TEXT,record_json TEXT);CREATE TABLE source_fence(value INTEGER);INSERT INTO source_fence VALUES(1);');
 for(const record of records)d.raw.prepare('INSERT INTO source_facts VALUES(?,?)').run('dependencyFloors',canonical(record));
 const request={schema:2,env:'production',sourceApp:'hifz',targetApp:'academy',requestId:crypto.randomUUID(),ownerApp:'academy',recipientApp:'hifz',stream:'account-security',ownerEpoch:epoch,contiguousThrough:0,missingRanges:[[1,9]],knownFloorsDigest:'0'.repeat(64),pageToken:null};
 const base={schema:version,env:'production',requestId:request.requestId,ownerApp:'academy',recipientApp:'hifz',stream:request.stream,ownerEpoch:epoch,coveredThrough:9,predecessorEpoch:null,predecessorCoveredThrough:null,snapshotId:crypto.randomUUID(),createdAt:now,expiresAt:now+600};
 const id=await snap.capturePrimary({request,base,cursorKeyId,selectors:[{bucket:'dependencyFloors',sql:'SELECT record_json FROM source_facts',args:[]}],guard:{sql:'SELECT 1 FROM source_fence WHERE value=1',args:[]},config:cfg,now});
 const built=await buildSnapshot({store:snap,snapshotId:id,cursorKey,cursorKeyId,config:cfg,recordConfig:{dependencies:registry},now,digestStreamFactory,clock:()=>now});
 const raw=await serveSnapshotPage({store:snap,request,config:cfg,cursorKey,cursorKeyId,now});return {...d,snap,request,base,built,raw};
}
function recipient(){const d=database('hifz');return {...d,receiver:new SnapshotReceiver({store:new SnapshotStore(d.store),config,trust,recordConfig:{dependencies},digestStreamFactory,clock:()=>now})};}
test('schema3 full round trip keeps two accounts equal id/revision and different facts separate',async()=>{
 const s=await source([target('Account-A',{effect:'DENY',deniedActions:['write']}),target('account-a')]),r=recipient();
 assert.equal(strictJSON(s.raw).schema,3);assert.equal(s.built.metadata.totalRecords,2);assert.equal(s.built.metadata.expiresAt-s.built.metadata.createdAt,600);
 await r.receiver.registerRequest(s.request);assert.equal((await r.receiver.stage(s.raw,{now})).complete,true);
 const pending=await r.receiver.applyRecords(s.base.snapshotId,{now,planEffect:async({record,snapshotId,offset})=>{const scoped=snapshotEffect(record),workId=snapshotId+':'+offset;return {workId,statements:await restrictionPlan(r.store,{workId,target:scoped.target,sub:scoped.scopeSub,now})};}});
 assert.equal(pending.status,'VERIFIED');
 const scopes=r.raw.prepare('SELECT scope_sub,target_json FROM jwt_v2_worksets ORDER BY scope_sub').all();assert.deepEqual(scopes.map(x=>x.scope_sub),['Account-A','account-a']);assert.ok(scopes.every(x=>!Object.hasOwn(strictJSON(x.target_json),'sub')));
 for(const w of r.raw.prepare('SELECT work_id FROM jwt_v2_worksets').all())await worksetApplied(r.store,w.work_id);
 assert.equal((await r.receiver.finishApplied(s.base.snapshotId,{now})).status,'APPLIED');
});
test('wrong scope cannot satisfy another account application barrier',async()=>{
 const s=await source([target('Account-A')]),r=recipient();await r.receiver.registerRequest(s.request);await r.receiver.stage(s.raw,{now});
 await assert.rejects(()=>r.receiver.applyRecords(s.base.snapshotId,{now,planEffect:async({record})=>({workId:'wrong-account',statements:await restrictionPlan(r.store,{workId:'wrong-account',target:snapshotEffect(record).target,sub:'account-a',now})})}));
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_snapshot_effects').get().n,0);assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_restrictions').get().n,0);
});
test('global null and account scope are explicit and cannot substitute',()=>{
 const record={...target(null),id:'academy:global'};assert.equal(validateRecord('dependencyFloors',record,{ownerEpoch:epoch,recipientApp:'hifz',dependencies,snapshotSchema:3}).sub,null);
 for(const bad of [target(null),{...record,sub:'Account-A'}])assert.throws(()=>validateRecord('dependencyFloors',bad,{ownerEpoch:epoch,recipientApp:'hifz',dependencies,snapshotSchema:3}));
 const unknown=new Map([['academy:profile',{...dependencies.get('academy:profile'),scope:undefined}]]);assert.throws(()=>validateRecord('dependencyFloors',target('Account-A'),{ownerEpoch:epoch,recipientApp:'hifz',dependencies:unknown,snapshotSchema:3}));
 assert.throws(()=>validateRecord('dependencyFloors',target('Account-A'),{ownerEpoch:epoch,recipientApp:'studio',dependencies,snapshotSchema:3}));
});
test('legacy ambiguous dependency records and v2 downgrade fail closed',async()=>{
 const {sub,...legacy}=target('Account-A');assert.throws(()=>validateRecord('dependencyFloors',legacy,{ownerEpoch:epoch,recipientApp:'hifz',dependencies,snapshotSchema:2}));
 const global={...legacy,id:'academy:global'},s=await source([global],{version:2}),r=recipient();await r.receiver.registerRequest(s.request);await assert.rejects(()=>r.receiver.stage(s.raw,{now}));assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_receive_pages').get().n,0);
});
test('same-account equal revision contradictory facts still fail capture',async()=>await assert.rejects(()=>source([target('Account-A'),target('Account-A',{effect:'DENY',deniedActions:['write']})])));
test('schema3 final digest includes exact sub and every empty bucket',async()=>{
 const s=await source([target('Account-A')]),page=strictJSON(s.raw),state={schema:3,...Object.fromEntries(BUCKETS.map(b=>[b,b==='dependencyFloors'?[target('Account-A')]:[]]))};
 assert.equal(page.snapshotDigest,await domainDigest('uaa-security-snapshot-v3',{metadata:s.built.metadata,state}));
 state.dependencyFloors[0].sub='account-a';assert.notEqual(page.snapshotDigest,await domainDigest('uaa-security-snapshot-v3',{metadata:s.built.metadata,state}));
});
test('canonical account scope preserves bytes, Unicode and case while rejecting controls',()=>{
 assert.notEqual(dependencyScope('Account-A'),dependencyScope('account-a'));assert.equal(dependencyScope('süß-test'),'ACCOUNT:süß-test');assert.notEqual(dependencyScope('é'),dependencyScope('e\u0301'));
 for(const sub of ['', 'x y','x\u0000','x\u007f','\ud800','x'.repeat(181)])assert.throws(()=>dependencyScope(sub));
});
test('captured native dependency counters preserve canonical case separately from login alias matching',()=>{
 const d=database('hifz');d.raw.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY COLLATE BINARY,login_alias TEXT COLLATE NOCASE,role TEXT);');
 const recipe=captureDDL({registry:{schema:2,app:'hifz',rules:{profiles:{columns:['id','role'],accountColumn:'id',required:true,dependencies:['H.identity-local']}}},available:{profiles:['id','login_alias','role']},ownerEpoch:epoch});d.raw.exec(recipe.sql);
 d.raw.prepare('INSERT INTO profiles VALUES(?,?,?)').run('Account-A','PIN-ID','student');d.raw.prepare('INSERT INTO profiles VALUES(?,?,?)').run('account-a','OTHER','student');
 assert.deepEqual(d.raw.prepare('SELECT scope FROM jwt_v2_dependencies ORDER BY scope').all().map(r=>r.scope),['ACCOUNT:Account-A','ACCOUNT:account-a']);assert.equal(d.raw.prepare('SELECT id FROM profiles WHERE login_alias=?').get('pin-id').id,'Account-A');
});
test('original schema2 EVENTS replay keeps original envelope scope and has no watermark authority',async()=>{
 const s=await source([target('Account-A')]),{sub,...typed}=target('Account-A');const event={schema:2,env:'production',sourceApp:'academy',targetApp:'hifz',eventId:crypto.randomUUID(),operationId:crypto.randomUUID(),stream:'account-security',ownerEpoch:epoch,sequence:1,sub,kind:'authority-updated',target:typed,committedAt:now,commitRef:'source-commit'};event.digest=await (await import('../codec.mjs')).digest(event);
 const raw=await encodeEventReplay({request:s.request,events:[event],coveredThrough:9,ownerEpoch:epoch,config,streams:new Map([['account-security',new Set([epoch])]]),dependencies});const replay=strictJSON(raw);assert.equal(replay.schema,2);assert.equal(replay.events[0].sub,'Account-A');assert.equal(replay.nextPageToken,null);
});

test('concurrent schema3 application accepts the same scoped deterministic winner',async()=>{
 const s=await source([target('Account-A')]),r=recipient();await r.receiver.registerRequest(s.request);await r.receiver.stage(s.raw,{now});
 const planEffect=async({record,snapshotId,offset})=>{const scoped=snapshotEffect(record),workId=snapshotId+':'+offset;return {workId,statements:await restrictionPlan(r.store,{workId,target:scoped.target,sub:scoped.scopeSub,now})};};
 const results=await Promise.all([r.receiver.applyRecords(s.base.snapshotId,{now,planEffect}),r.receiver.applyRecords(s.base.snapshotId,{now,planEffect})]);assert.ok(results.every(x=>x.status==='VERIFIED'));
 assert.equal(r.raw.prepare('SELECT count(*) n FROM jwt_v2_snapshot_effects').get().n,1);const work=r.raw.prepare('SELECT work_id FROM jwt_v2_snapshot_effects').get();await worksetApplied(r.store,work.work_id);assert.equal((await r.receiver.finishApplied(s.base.snapshotId,{now})).status,'APPLIED');
});
test('a raced wrong-scope winner cannot count as application or APPLIED',async()=>{
 const s=await source([target('Account-A')]),r=recipient();await r.receiver.registerRequest(s.request);await r.receiver.stage(s.raw,{now});
 await assert.rejects(()=>r.receiver.applyRecords(s.base.snapshotId,{now,planEffect:async({record,recordDigest,snapshotId,offset})=>{const scoped=snapshotEffect(record),workId=snapshotId+':'+offset;await r.store.batch([...await restrictionPlan(r.store,{workId:'raced-wrong',target:scoped.target,sub:'account-a',now}),r.store.stmt('INSERT INTO jwt_v2_snapshot_effects VALUES(?,?,?,?)',snapshotId,offset,recordDigest,'raced-wrong')]);return {workId,statements:await restrictionPlan(r.store,{workId,target:scoped.target,sub:scoped.scopeSub,now})};}}),{code:'SNAPSHOT_APPLICATION_CONFLICT'});
 await worksetApplied(r.store,'raced-wrong');assert.equal((await r.receiver.finishApplied(s.base.snapshotId,{now})).status,'VERIFIED');
 await assert.rejects(()=>r.receiver.applyRecords(s.base.snapshotId,{now,planEffect:async()=>{throw Error('must not replan wrong scope');}}),{code:'SNAPSHOT_APPLICATION_CONFLICT'});
});
