import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {videoFixture,mp4} from './fixtures/academy-session-video-fixture.mjs';
import {videoExpiry,VIDEO_PART_SIZE} from '../src/academy/d1/session-video.js';
const lessonId='MOU-20261006';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){const f=await videoFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
async function upload(f,admin,bytes=mp4){const revision=f.db.prepare('SELECT revision FROM lesson_media_lessons WHERE lesson_id=?').get(lessonId).revision,start=ok(await f.media('video-start',{lessonId,revision,operationId:crypto.randomUUID(),filename:'Zoom recording.mp4',name:'Lesson recording',size:bytes.length},admin));const parts=[];for(let off=0;off<bytes.length;off+=start.partSize)parts.push(ok(await f.videoPart({lessonId,uploadToken:start.uploadToken,partNumber:parts.length+1},admin,bytes.subarray(off,off+start.partSize))));const input={lessonId,uploadToken:start.uploadToken,parts:parts.map(({partNumber,etag})=>({partNumber,etag}))};return {result:ok(await f.media('video-complete',input,admin)),input};}
test('MP4 uploads retain YouTube attachments, expose safe metadata and support private ranged playback',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),other=await f.login('0005');const {result,input}=await upload(f,admin);
 assert.equal(ok(await f.media('video-complete',input,admin)).replayed,true);assert.equal(f.env.LESSON_MEDIA_BUCKET.objects.size,1);
 const list=ok(await f.media('list',{},student)),row=list.lessons.find(r=>r.id===lessonId),a=row.assets.find(a=>a.kind==='MP4');assert(a);assert.equal(a.name,'Lesson recording');assert.equal(a.byteSize,mp4.length);assert.equal(a.expired,false);assert(row.assets.some(a=>a.kind==='YOUTUBE'));assert.doesNotMatch(JSON.stringify(row),/session-recordings\/|playbackPath|ticket|object_key/);
 const watch=ok(await f.media('watch',{lessonId,assetId:result.assetId},student));assert.equal(watch.kind,'MP4');assert(!watch.playbackPath.includes(student));assert.equal((await f.media('watch',{lessonId,assetId:result.assetId},other)).status,403);
 const playbackGrant=new URL(watch.playbackPath,'http://localhost').searchParams.get('ticket');assert.equal((await f.call('/api/account/session',{},playbackGrant)).status,401,'A recording grant cannot restore or act as an Academy account session');
 let response=await f.videoGet(watch.playbackPath,{Range:'bytes=4-11'});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes 4-11/${mp4.length}`);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(await response.text(),'ftypisom');
 response=await f.videoGet(watch.playbackPath,{},'HEAD');assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),String(mp4.length));assert.equal(await response.text(),'');
 response=await f.videoGet(watch.playbackPath,{Range:'bytes=-4'});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,4);
 for(const Range of ['bytes=99999-','bytes=2-1','bytes=-0','bytes=0-1,4-5'])assert.equal((await f.videoGet(watch.playbackPath,{Range})).status,416);
 const url=new URL(watch.playbackPath,'http://localhost');url.searchParams.set('ticket',url.searchParams.get('ticket')+'bad');assert.equal((await f.videoGet(url.pathname+url.search)).status,401);
 assert.equal(ok(await f.media('watch',{lessonId,assetId:'video-6'},student)).kind,'YOUTUBE');
}));
test('current membership, session revocation, hidden lessons and removed links invalidate issued playback grants',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),{result}=await upload(f,admin);const path=ok(await f.media('watch',{lessonId,assetId:result.assetId},student)).playbackPath;
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002'").run();assert([401,403].includes((await f.videoGet(path)).status));
 f.db.prepare("UPDATE role_assignments SET active=1 WHERE account_id='account-0002'").run();assert.equal((await f.videoGet(path)).status,200);
 f.db.prepare("UPDATE account_sessions SET revoked_at=? WHERE account_id='account-0002'").run(new Date().toISOString());assert.equal((await f.videoGet(path)).status,401);
 f.db.prepare("UPDATE account_sessions SET revoked_at=NULL WHERE account_id='account-0002'").run();
 f.db.prepare("UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id='account-0002'").run();assert.equal((await f.videoGet(path)).status,401);
 f.db.prepare("UPDATE account_credentials SET credential_epoch=credential_epoch-1 WHERE account_id='account-0002'").run();assert.equal((await f.videoGet(path)).status,200);
 f.db.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").run(lessonId);assert.equal((await f.videoGet(path)).status,403);
 f.db.prepare("UPDATE lesson_media_lessons SET state='PUBLISHED' WHERE lesson_id=?").run(lessonId);f.db.prepare('DELETE FROM lesson_media_links WHERE asset_id=?').run(result.assetId);assert.equal((await f.videoGet(path)).status,404);
}));
test('expiry is fourteen days after R2 completion and never expires YouTube or the session record',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),{result}=await upload(f,admin);const path=ok(await f.media('watch',{lessonId,assetId:result.assetId},student)).playbackPath;
 const pdf=ok(await f.mediaUpload({lessonId,revision:2},admin));
 const old=new Date(Date.now()-14*86400000-1).toISOString();f.db.prepare('UPDATE lesson_media_assets SET created_at=? WHERE asset_id=?').run(old,result.assetId);
 assert.equal((await f.media('watch',{lessonId,assetId:result.assetId},student)).status,410);assert.equal((await f.videoGet(path)).status,410);
 const row=ok(await f.media('list',{},student)).lessons.find(r=>r.id===lessonId);assert(row.assets.find(a=>a.kind==='MP4').expired);assert.equal((await f.media('watch',{lessonId,assetId:'video-6'},student)).status,200);assert.equal((await f.media('download',{lessonId,assetId:pdf.assetId},student)).status,200);assert(f.db.prepare('SELECT 1 FROM lesson_media_lessons WHERE lesson_id=?').get(lessonId));
 const sessionKey='legacy-expiry-session';f.db.prepare('UPDATE lesson_media_lessons SET session_key=? WHERE lesson_id=?').run(sessionKey,lessonId);
 const timetable=ok(await f.media('timetable',{sessions:[{activityKey:row.activityKey,sessionKey}]},student));assert(timetable.lessons[0].assets.find(a=>a.kind==='MP4').expired,'Session details retain safe expiry metadata after the video expires');
 const uploaded='2026-10-15T12:00:00.000Z';assert.deepEqual(videoExpiry({created_at:uploaded},Date.parse(uploaded)),{uploadedAt:uploaded,expiresAt:'2026-10-29T12:00:00.000Z',expired:false});
 const policy=JSON.parse(readFileSync(new URL('../config/session-recordings-lifecycle.json',import.meta.url)));assert.equal(policy.rules[0].conditions.prefix,'dev-split-v1/session-recordings/');assert.equal(policy.rules[0].deleteObjectsTransition.condition.maxAge,14*86400);
}));
test('invalid files, oversized parts, stale revisions and cross-account upload tickets are rejected',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003');const input={lessonId,revision:1,operationId:crypto.randomUUID(),filename:'recording.mp4',size:mp4.length};
 assert.equal((await f.media('video-start',{...input,filename:'recording.html'},admin)).status,400);assert.equal((await f.media('video-start',{...input,size:512*1024*1024+1},admin)).status,413);assert.equal((await f.media('video-start',input,student)).status,403);
 const start=ok(await f.media('video-start',input,admin)),part={lessonId,uploadToken:start.uploadToken,partNumber:1};assert.equal((await f.videoPart(part,teacher)).status,403);assert.equal((await f.videoPart(part,admin,Buffer.alloc(mp4.length))).status,400);assert.equal((await f.videoPart(part,admin,Buffer.alloc(mp4.length+1))).status,413);assert.equal((await f.videoPart({...part,partNumber:2},admin)).status,400);
 assert.equal((await f.media('video-complete',{lessonId,uploadToken:start.uploadToken,parts:[]},admin)).status,400);
 assert.equal((await f.media('save',{lessonId,revision:1,operationId:crypto.randomUUID(),title:'Lesson',summary:'',state:'PUBLISHED',commentsClosed:false,videos:[],removeAssetIds:{}},admin)).status,400);
 f.db.prepare('UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?').run(lessonId);assert.equal((await f.videoPart(part,admin)).status,409);
}));
test('multipart retries preserve part order and rename/removal remains atomic with session edits',()=>use(async f=>{
 const admin=await f.login('0001'),bytes=Buffer.concat([mp4,Buffer.alloc(VIDEO_PART_SIZE+200)]),{result}=await upload(f,admin,bytes);
 const changed=ok(await f.media('save',{lessonId,revision:2,operationId:crypto.randomUUID(),title:'Lesson',summary:'',state:'PUBLISHED',commentsClosed:false,videos:[{name:'YouTube',url:'https://youtu.be/9IuTDcSs6vQ'}],attachmentNames:[{assetId:result.assetId,name:'Renamed MP4'}]},admin));assert.equal(changed.revision,3);assert.equal(ok(await f.media('get',{lessonId},admin)).assets.find(a=>a.kind==='MP4').name,'Renamed MP4');
 ok(await f.media('save',{lessonId,revision:3,operationId:crypto.randomUUID(),title:'Lesson',summary:'',state:'PUBLISHED',commentsClosed:false,videos:[{name:'YouTube',url:'https://youtu.be/9IuTDcSs6vQ'}],removeAssetIds:[result.assetId]},admin));assert(!ok(await f.media('get',{lessonId},admin)).assets.some(a=>a.kind==='MP4'));assert.equal(f.env.LESSON_MEDIA_BUCKET.objects.size,1,'Detached bytes remain subject to native expiry');
}));
