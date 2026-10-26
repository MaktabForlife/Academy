import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {markRefresh,refreshSetting} from '../src/academy/d1/refresh-state.js';
import {processCacheRefresh} from '../src/academy/d1/cache-refresh.js';
import {publicTimetableDay,publicTimetableKey} from '../src/academy/d1/public-timetable.js';
const setup='/api/admin/platform/setup/';
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
async function use(run){
 const f=await classNotesFixture(),objects=new Map();let sequence=0,fail=false;
 f.env.MEDIA_BUCKET={get:async key=>{const value=objects.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.body)}:null;},put:async(key,body,{onlyIf}={})=>{
  if(fail)throw Error('Synthetic storage outage');const current=objects.get(key);
  if(onlyIf?.etagMatches!==undefined&&onlyIf.etagMatches!==current?.etag||onlyIf?.etagDoesNotMatch==='*'&&current)return null;
  const value={body,etag:String(++sequence)};objects.set(key,value);return {etag:value.etag};
 }};
 f.send=async(path,input={},who='global')=>{const token=await f.actor(who),response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 f.freeze=async()=>{const input={scopes:[f.scopes.programA]},review=ok(await f.send(setup+'review',input));return ok(await f.send(setup+'freeze',{...input,digest:review.digest}));};
 f.publish=batch=>f.send(setup+'publish',{batchId:batch.batchId,digest:batch.digest});
 f.marker=()=>{const row=f.db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get(refreshSetting('public-timetable'));return row?JSON.parse(row.setting_value):null;};
 f.change=()=>f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Accepted automatic homepage update',f.scopes.programA);
 try{await run(f,{objects,fail:value=>{fail=value;}});assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.close();}
}
test('accepting a public change queues its refresh atomically, returns the hint and does not duplicate work on publication replay',()=>use(async(f,{objects})=>{
 f.change();const batch=await f.freeze(),published=ok(await f.publish(batch));assert.deepEqual(published.cacheRefreshPending,['public-timetable']);assert.equal(f.marker().requested,1);assert.equal(f.marker().published,0);
 const again=ok(await f.publish(batch));assert.equal(again.head,published.head);assert.equal(again.replayed,true);assert.equal(f.marker().requested,1);
 const refreshed=ok(await f.send('/api/academy/cache/refresh'));assert.deepEqual(refreshed.completed,['public-timetable']);assert.equal(refreshed.pending,false);
 const key=publicTimetableKey(f.env,publicTimetableDay())+'.accepted-'+published.head,snapshot=JSON.parse(objects.get(key).body);
 assert(snapshot.timetable.some(row=>row.activityName==='Accepted automatic homepage update'));
 assert.doesNotMatch(JSON.stringify(snapshot),/teacherName|teacherId|classId|account_id|joinUrl|zoom\./);assert.equal(f.marker().published,1);
}));
test('an earlier draft refresh cannot consume the refresh required by the later accepted publication',()=>use(async f=>{
 f.change();await markRefresh((sql,...args)=>f.env.ACADEMY_DB.prepare(sql).bind(...args),'public-timetable','account-0001').run();
 ok(await f.send('/api/academy/cache/refresh'));assert.equal(f.marker().published,1);
 const published=ok(await f.publish(await f.freeze()));assert.deepEqual(published.cacheRefreshPending,['public-timetable']);assert.equal(f.marker().requested,2);assert.equal(f.marker().published,1);
 ok(await f.send('/api/academy/cache/refresh'));assert.equal(f.marker().published,2);
}));
test('failed snapshot storage leaves publication committed and durable recovery can finish without republishing',()=>use(async(f,storage)=>{
 f.change();const batch=await f.freeze(),published=ok(await f.publish(batch));storage.fail(true);
 const result=ok(await f.send('/api/academy/cache/refresh'));assert.equal(result.pending,true);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,published.head);assert.equal(f.marker().published,0);
 storage.fail(false);const recovered=await processCacheRefresh(new Request('http://localhost/api/academy/cache/refresh'),f.env,{now:new Date(Date.now()+61000),edge:null});assert.deepEqual(recovered.completed,['public-timetable']);
 assert.equal(f.marker().requested,f.marker().published);assert.equal(ok(await f.publish(batch)).head,published.head);assert.equal(f.marker().requested,1);
}));
test('private-only setup and rejected publications do not queue a homepage rebuild',()=>use(async f=>{
 f.db.prepare('UPDATE classes SET zoom_link=? WHERE activity_key=?').run('https://zoom.test/private-class-update',f.scopes.programA);
 const privateResult=ok(await f.publish(await f.freeze()));assert.equal(privateResult.cacheRefreshPending,undefined);assert.equal(f.marker(),null);
 f.change();const batch=await f.freeze(),head=privateResult.head;f.db.exec('UPDATE academy_write_state SET version=version+1');
 assert.equal((await f.publish(batch)).status,409);assert.equal(f.marker(),null);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);
}));
test('late transaction failure rolls back the accepted head and its pending refresh together',()=>use(async f=>{
 f.change();const batch=await f.freeze(),head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;
 f.db.exec("CREATE TEMP TRIGGER reject_setup_audit BEFORE INSERT ON audit_events WHEN NEW.action='setup-publish' BEGIN SELECT RAISE(ABORT,'synthetic late failure'); END");
 assert.notEqual((await f.publish(batch)).status,200);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);assert.equal(f.marker(),null);
}));
test('current Admin permissions remain required, and the Global Admin manual fallback remains available',()=>use(async f=>{
 f.change();const published=ok(await f.publish(await f.freeze()));
 assert([401,403].includes((await f.send('/api/academy/cache/refresh',{},'studentA')).status));
 assert.equal((await f.send('/api/admin/platform/public-timetable/refresh',{},'adminA')).status,403);
 ok(await f.send('/api/academy/cache/refresh',{},'adminA'));assert.equal(f.marker().requested,f.marker().published);
 const manual=ok(await f.send('/api/admin/platform/public-timetable/refresh'));assert(manual.generatedAt);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,published.head);
}));
