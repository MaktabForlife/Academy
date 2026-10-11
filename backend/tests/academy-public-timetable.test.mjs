import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {publicTimetable,publicTimetableDay,publicTimetableKey} from '../src/academy/d1/public-timetable.js';
import worker from '../src/worker.js';

function snapshotStores() {
  const objects=new Map(),responses=new Map();let gets=0,puts=0;
  return {objects,responses,get gets(){return gets;},get puts(){return puts;},
    bucket:{get:async key=>{gets++;return objects.has(key)?{etag:String(puts),json:async()=>JSON.parse(objects.get(key))}:null;},
      put:async(key,value,options)=>{if(options.onlyIf.etagMatches!==undefined){if(options.onlyIf.etagMatches!==String(puts))return null;}else{assert.equal(options.onlyIf.etagDoesNotMatch,'*');if(objects.has(key))return null;}puts++;objects.set(key,value);return {key};}},
    edge:{match:async request=>responses.get(request.url)?.clone(),put:async(request,response)=>{responses.set(request.url,response.clone());}}};
}
const request=(suffix='',headers={})=>new Request('https://academy.invalid/api/academy/entrance/public-snapshot'+suffix,{headers});
const broken={withSession:()=>{throw Error("Your account has exceeded D1's free tier daily row read limit.");}};

test('one durable daily public snapshot serves visitors and cold edges without another database read',async()=>{
  const f=await fixtureDatabase(),stores=snapshotStores(),now=new Date('2026-10-09T12:00:00Z'),env={...f.env,MEDIA_BUCKET:stores.bucket};
  try {
    const response=await publicTimetable(request(),env,now,stores.edge),first=await response.json(),queryCount=f.queries.length;
    assert.ok(queryCount>0);assert.equal(stores.puts,1);assert.equal(first.snapshotDate,'2026-10-09');assert.equal(first.expiresAt,'2026-10-10T00:00:00.000Z');
    assert.equal(first.signedIn,false);assert.ok(first.timetable.length);assert.equal(first.endDate,'2026-10-15');
    assert.match(response.headers.get('Cache-Control'),/^public, max-age=/);
    assert.doesNotMatch(JSON.stringify(first),/zoom\.|pin_hash|teacherId|classId|account_id|meetingGroup|joinUrl|teacherName|classNames/);
    assert.deepEqual(first.personalTimetable,[]);assert.deepEqual(first.activityPages,[]);
    const unavailable={...env,ACADEMY_DB:broken},gets=stores.gets;
    assert.deepEqual(await (await publicTimetable(request('?startDate=2099-01-01'),unavailable,now,stores.edge)).json(),first);
    assert.equal(stores.gets,gets,'A warm edge does not read R2 either');
    assert.deepEqual(await (await publicTimetable(request(),unavailable,now,null)).json(),first,'An evicted edge reads the same persisted R2 snapshot');
    assert.equal(f.queries.length,queryCount);
    f.db.prepare("UPDATE activities SET name='New published marketing name' WHERE kind='PROGRAM'").run();
    const nextDay=new Date('2026-10-12T00:00:01Z');
    const next=await (await publicTimetable(request(),env,nextDay,stores.edge)).json();
    assert.equal(stores.puts,2);assert.equal(next.snapshotDate,'2026-10-12');assert.ok(next.timetable.some(row=>row.activityName==='New published marketing name'));
    assert.ok(f.queries.length>queryCount);
  } finally {f.db.close();}
});

test('public snapshots whitelist stored data and cannot bypass authentication or maintenance',async()=>{
  const f=await fixtureDatabase(),stores=snapshotStores(),now=new Date(),day=publicTimetableDay(now),env={...f.env,MEDIA_BUCKET:stores.bucket,ALLOWED_ORIGINS:'https://one.invalid,https://two.invalid'};
  try {
    const first=await (await publicTimetable(request(),env,now,null)).json(),key=publicTimetableKey(env,day);
    stores.objects.set(key,JSON.stringify({...first,accounts:['SECRET'],timetable:first.timetable.map(row=>({...row,joinUrl:'https://zoom.invalid/SECRET',teacherNames:['SECRET'],information:['SECRET']}))}));
    const quota={...env,ACADEMY_DB:broken};
    for(const origin of ['https://one.invalid','https://two.invalid']){
      const response=await worker.fetch(request('',{Origin:origin}),quota);
      assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
      assert.doesNotMatch(await response.text(),/SECRET|joinUrl|teacherNames/);
    }
    const signed=await worker.fetch(request('',{Authorization:'Bearer never-cache-a-session'}),quota);assert.equal(signed.status,400);
    const protectedResponse=await worker.fetch(new Request('https://academy.invalid/api/academy/entrance',{method:'POST',body:'{}',headers:{Authorization:'Bearer invalid'}}),quota);
    assert.equal(protectedResponse.status,503);assert.equal((await protectedResponse.json()).code,'ACADEMY_D1_DAILY_READ_LIMIT');assert.equal(protectedResponse.headers.get('Cache-Control'),'private, no-store');
    assert.equal((await worker.fetch(request(),{...quota,ACADEMY_D1_MODE:'PAUSED'})).status,503);
    stores.objects.set(key,JSON.stringify({...first,signedIn:true}));
    await assert.rejects(publicTimetable(request(),quota,now,null),/daily row read limit/);
    assert.equal((await worker.fetch(request('',{Origin:'https://untrusted.invalid'}),quota)).status,403);
  } finally {f.db.close();}
});

test('a failed new-day build is not saved or cached',async()=>{
  const f=await fixtureDatabase(),stores=snapshotStores();
  try {
    await assert.rejects(publicTimetable(request(),{...f.env,MEDIA_BUCKET:stores.bucket,ACADEMY_DB:broken},new Date('2026-10-19T12:00:00Z'),stores.edge),/daily row read limit/);
    assert.equal(stores.puts,0);assert.equal(stores.responses.size,0);
  } finally {f.db.close();}
});

const post=async(env,path,body={},token='')=>{const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);return {status:response.status,body:await response.json()};};
const login=async(env,n)=>{const response=await post(env,'/api/account/login',{uniqueid:'login-'+n,pin:'1234'});assert.equal(response.status,200,JSON.stringify(response));return response.body.token;};

test('Global Admin can manually rebuild the daily public snapshot without exposing private data or adding visitor D1 reads',async()=>{
 const f=await fixtureDatabase(),stores=snapshotStores(),env={...f.env,MEDIA_BUCKET:stores.bucket},original=globalThis.caches;
 globalThis.caches={default:stores.edge};
 try{
  const admin=await login(env,'0001'),teacher=await login(env,'0003'),scoped=await login(env,'0004');
  const first=await (await publicTimetable(request(),env,new Date(),stores.edge)).json();const stored=JSON.stringify(first),endpoint='/api/admin/platform/public-timetable/refresh';
  for(const token of ['',teacher,scoped])assert.ok([401,403].includes((await post(env,endpoint,{},token)).status));
  assert.equal(stores.puts,1);assert.equal([...stores.objects.values()][0],stored);
  f.db.prepare("UPDATE activities SET name='Manually refreshed public name' WHERE kind='PROGRAM'").run();
  assert.deepEqual(await (await publicTimetable(request(),env,new Date(),stores.edge)).json(),first,'Ordinary reload reads the existing daily snapshot');
  const refreshed=await post(env,endpoint,{},admin);assert.equal(refreshed.status,200,JSON.stringify(refreshed));assert.equal(refreshed.body.refreshWithinSeconds,60);assert.equal(stores.puts,2);
  const reads=f.queries.length,quota={...env,ACADEMY_DB:broken};
  for(const edge of [stores.edge,null]){const response=await publicTimetable(request(),quota,new Date(),edge),latest=await response.json();assert.ok(latest.timetable.some(row=>row.activityName==='Manually refreshed public name'));assert.equal(response.headers.get('Cache-Control'),'public, max-age=60');assert.doesNotMatch(JSON.stringify(latest),/pin_hash|teacherId|classId|account_id|meetingGroup|joinUrl|teacherName|classNames/);}
  assert.equal(f.queries.length,reads,'Refresh replacements are still served from edge/R2 without D1');
 }finally{globalThis.caches=original;f.db.close();}
});

test('manual public refresh rejects competing replacements and rechecks revoked Global Admin authority before writing',async()=>{
 const f=await fixtureDatabase(),stores=snapshotStores(),env={...f.env,MEDIA_BUCKET:stores.bucket};
 try{
  const admin=await login(env,'0001'),endpoint='/api/admin/platform/public-timetable/refresh';await publicTimetable(request(),env,new Date(),null);const previous=[...stores.objects.values()][0],put=stores.bucket.put,get=stores.bucket.get;
  stores.bucket.put=async()=>null;assert.equal((await post(env,endpoint,{},admin)).status,409);assert.equal([...stores.objects.values()][0],previous);
  stores.bucket.put=put;stores.bucket.get=async key=>{const result=await get(key);f.db.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'").run();return result;};
  assert.ok([401,403].includes((await post(env,endpoint,{},admin)).status));assert.equal(stores.puts,1);assert.equal([...stores.objects.values()][0],previous);
 }finally{f.db.close();}
});
