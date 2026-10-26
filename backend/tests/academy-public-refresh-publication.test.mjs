import {test} from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {refreshSetting} from '../src/academy/d1/refresh-state.js';
import {processCacheRefresh} from '../src/academy/d1/cache-refresh.js';
import {publicTimetableDay,publicTimetableKey} from '../src/academy/d1/public-timetable.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(run){const f=await classNotesFixture(),objects=new Map();let sequence=0,fail=false;
 f.env.MEDIA_BUCKET={get:async key=>{const v=objects.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.body)}:null;},put:async(key,body,{onlyIf}={})=>{if(fail)throw Error('Synthetic storage outage');const current=objects.get(key);if(onlyIf?.etagMatches!==undefined&&onlyIf.etagMatches!==current?.etag||onlyIf?.etagDoesNotMatch==='*'&&current)return null;const v={body,etag:String(++sequence)};objects.set(key,v);return {etag:v.etag};}};
 f.send=async(path,input={},who='global')=>{const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await f.actor(who),'X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 f.save=async()=>{const p=ok(await f.send('/api/admin/platform/programs/list')).programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA);return ok(await f.send('/api/admin/platform/programs/save',{id:p.id,name:'Accepted automatic homepage update',status:p.status,revision:p.revision,durationYears:p.durationYears,timezone:p.timezone,operationId:crypto.randomUUID()}));};
 f.accept=saved=>f.send('/api/academy/changes/accept',saved.acceptedChange);
 f.marker=()=>{const row=f.db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get(refreshSetting('public-timetable'));return row?JSON.parse(row.setting_value):null;};
 try{await run(f,{objects,fail:value=>{fail=value;}});assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.close();}
}
test('accepting a public feature change queues its refresh atomically and replay does not duplicate it',()=>use(async(f,{objects})=>{
 const saved=await f.save(),published=ok(await f.accept(saved));assert.deepEqual(published.cacheRefreshPending,['public-timetable']);assert.equal(f.marker().requested,2);assert.equal(f.marker().published,0);
 const again=ok(await f.accept(saved));assert.equal(again.head,published.head);assert.equal(again.replayed,true);assert.equal(f.marker().requested,2);
 const refreshed=ok(await f.send('/api/academy/cache/refresh'));assert.deepEqual(refreshed.completed,['public-timetable']);assert.equal(refreshed.pending,false);
 const key=publicTimetableKey(f.env,publicTimetableDay())+'.accepted-'+published.head,snapshot=JSON.parse(objects.get(key).body);assert(snapshot.timetable.some(row=>row.activityName==='Accepted automatic homepage update'));
 assert.doesNotMatch(JSON.stringify(snapshot),/teacherName|teacherId|classId|account_id|joinUrl|zoom\./);assert.equal(f.marker().published,2);
}));
test('an earlier source refresh cannot consume the refresh required by the later accepted feature change',()=>use(async f=>{
 const saved=await f.save();ok(await f.send('/api/academy/cache/refresh'));assert.equal(f.marker().published,1);
 ok(await f.accept(saved));assert.equal(f.marker().requested,2);assert.equal(f.marker().published,1);ok(await f.send('/api/academy/cache/refresh'));assert.equal(f.marker().published,2);
}));
test('failed snapshot storage leaves the feature change committed and durable recovery finishes without resaving',()=>use(async(f,storage)=>{
 const saved=await f.save(),published=ok(await f.accept(saved));storage.fail(true);assert.equal(ok(await f.send('/api/academy/cache/refresh')).pending,true);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,published.head);assert.equal(f.marker().published,0);
 storage.fail(false);const recovered=await processCacheRefresh(new Request('http://localhost/api/academy/cache/refresh'),f.env,{now:new Date(Date.now()+61000),edge:null});assert.deepEqual(recovered.completed,['public-timetable']);assert.equal(f.marker().requested,f.marker().published);
 ok(await f.accept(saved));assert.equal(f.marker().requested,2);
}));
test('late transaction failure rolls back the new accepted head and its extra pending refresh together',()=>use(async f=>{
 const saved=await f.save(),head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;
 f.db.exec("CREATE TEMP TRIGGER reject_feature_audit BEFORE INSERT ON audit_events WHEN NEW.action='feature-accept' BEGIN SELECT RAISE(ABORT,'synthetic late failure'); END");
 assert.notEqual((await f.accept(saved)).status,200);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);assert.equal(f.marker().requested,1);
}));
test('current Admin permissions remain required and the Global Admin manual fallback remains available',()=>use(async f=>{
 const published=ok(await f.accept(await f.save()));assert([401,403].includes((await f.send('/api/academy/cache/refresh',{},'studentA')).status));assert.equal((await f.send('/api/admin/platform/public-timetable/refresh',{},'adminA')).status,403);
 ok(await f.send('/api/academy/cache/refresh',{},'adminA'));assert.equal(f.marker().requested,f.marker().published);assert(ok(await f.send('/api/admin/platform/public-timetable/refresh')).generatedAt);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,published.head);
}));
