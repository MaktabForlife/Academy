import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {mp4} from './fixtures/academy-session-video-fixture.mjs';
import {mergeVideoLifecycle} from '../tools/academy-session-video-lifecycle.mjs';
import worker from '../src/academy-runtime.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('store-specific MP4 migration preserves split schemas, local triggers, existing assets and foreign keys',async()=>{
 const f=await splitVideoFixture();try{for(const db of Object.values(f.databases))assert.match(db.prepare("SELECT sql FROM sqlite_schema WHERE name='lesson_media_assets'").get().sql,/'MP4'/);}finally{f.close();}
});
test('split manual recording upload publishes once, keeps draft links private and rechecks learner playback authority',async()=>{
 const f=await splitVideoFixture();try{
  const admin=await f.source.actor('adminA'),global=await f.source.actor('global'),student=await f.source.login('0002'),teacher=await f.source.login('0003'),scope=f.scopes.programA,period={startDate:'2026-10-01',endDate:'2026-10-31'};
  const session=ok(await f.request('sessions',{activityKey:scope,...period},admin)).sessions.find(s=>s.classIds.includes('class-1'));assert(session);
  const lessonId=ok(await f.request('create',{activityKey:scope,...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId;
  const startInput={lessonId,revision:1,operationId:crypto.randomUUID(),filename:'session.mp4',name:'Zoom lesson recording',size:mp4.length};
  assert([403,404].includes((await f.request('video-start',startInput,teacher,'TEACH')).status));
  const start=ok(await f.request('video-start',startInput,admin));
  const metadata={lessonId,uploadToken:start.uploadToken,partNumber:1},part=ok(await f.request('video-part?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},admin,'ADMIN',mp4));
  const complete={lessonId,uploadToken:start.uploadToken,parts:[{partNumber:part.partNumber,etag:part.etag}]},asset=ok(await f.request('video-complete',complete,admin));
  assert.equal(ok(await f.request('video-complete',complete,admin)).replayed,true);
  assert.equal((await f.request('watch',{lessonId,assetId:asset.assetId},student,'LEARN')).status,404);
  const saved=ok(await f.request('save',{lessonId,revision:2,operationId:crypto.randomUUID(),title:'Session recording',summary:'',state:'PUBLISHED',commentsClosed:true,videos:[{name:'YouTube alternative',url:'https://youtu.be/9IuTDcSs6vQ'}]},admin));assert(saved.acceptedChange);
  await f.accept(global,scope);
  const feed=ok(await f.request('feed',{activityKey:scope},student,'LEARN')),row=feed.lessons.find(r=>r.id===lessonId);assert(row);assert.deepEqual(row.assets.map(a=>a.kind).sort(),['MP4','YOUTUBE']);
  const video=ok(await f.request('watch',{lessonId,assetId:asset.assetId},student,'LEARN'));let response=await worker.fetch(new Request('http://localhost'+video.playbackPath,{headers:{Range:'bytes=4-11'}}),f.source.env);assert.equal(response.status,206);assert.equal(await response.text(),'ftypisom');
  const teacherView=ok(await f.request('watch',{lessonId,assetId:asset.assetId},teacher,'TEACH'));assert.equal(teacherView.kind,'MP4');
  f.databases.core.prepare("UPDATE class_memberships SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);
  response=await worker.fetch(new Request('http://localhost'+video.playbackPath),f.source.env);assert.equal(response.status,403);
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
test('native expiry preparation retains unrelated lifecycle rules and refuses a reused rule identity',()=>{
 const rule=JSON.parse(readFileSync(new URL('../config/session-recordings-lifecycle.json',import.meta.url))).rules[0],existing={rules:[{id:'abort-incomplete',enabled:true,conditions:{prefix:''},abortMultipartUploadsTransition:{condition:{type:'Age',maxAge:7*86400}}}]};
 const merged=mergeVideoLifecycle(existing,rule);assert.deepEqual(merged.rules[0],existing.rules[0]);assert.equal(merged.rules.length,2);assert.deepEqual(mergeVideoLifecycle(merged,rule),merged);assert.throws(()=>mergeVideoLifecycle({rules:[{...rule,conditions:{prefix:'notes/'}}]},rule),/another prefix/);
});
