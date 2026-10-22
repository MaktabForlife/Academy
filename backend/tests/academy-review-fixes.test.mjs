import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {profileChange} from '../tools/academy-profile-client.mjs';
import {processCacheRefresh,profileLabelsVersion} from '../src/academy/d1/cache-refresh.js';
import {publicTimetable,publicTimetableKey,publicTimetableDay} from '../src/academy/d1/public-timetable.js';
import {refreshSetting,refreshObject,markRefresh} from '../src/academy/d1/refresh-state.js';

const now=new Date('2026-10-09T12:00:00Z'),origin='https://academy.invalid';
const request=path=>new WorkspaceRequest(origin+path);
async function post(env,path,input={},token='') {const r=await worker.fetch(new WorkspaceRequest(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,n='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+n,pin:'1234'})).token;
const apply=(db,names)=>names.forEach(name=>db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8')));
async function use(fn,{courses=false}={}) {
  const f=await(courses?courseFixture():fixtureDatabase());
  apply(f.db,courses?['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql','0011_account_contact_details.sql']:['0004_management_transactions.sql','0011_account_contact_details.sql']);
  f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
  const external=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Hosted services prohibited in regression tests');};
  try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=external;f.db.close();}
}
function stores() {
  const objects=new Map(),edgeObjects=new Map();let version=0,fail=false;
  return {objects,failWrites(value){fail=value;},bucket:{
    get:async key=>{const o=objects.get(key);return o?{etag:o.etag,json:async()=>JSON.parse(o.body)}:null;},
    put:async(key,body,{onlyIf}={})=>{if(fail)throw Error('Synthetic R2 failure');const current=objects.get(key);if(onlyIf?.etagMatches!==undefined&&current?.etag!==onlyIf.etagMatches||onlyIf?.etagDoesNotMatch==='*'&&current)return null;const o={etag:String(++version),body};objects.set(key,o);return o;}
  },edge:{match:async key=>edgeObjects.get(key.url)?.clone(),put:async(key,response)=>edgeObjects.set(key.url,response.clone())}};
}

test('retired account write routes cannot bypass profile safeguards; three Global Admins may disable another while two remain',()=>use(async({env,db})=>{
  for(const n of ['0002','0003'])db.prepare("INSERT INTO global_role_assignments(assignment_id,account_id,role,active,review_state) VALUES(?,?,'GLOBAL_ADMIN',1,'CONFIRMED')").run('extra-'+n,'account-'+n);
  const token=await login(env),before=db.prepare('SELECT * FROM account_credentials').all();
  for(const route of ['update','reset-pin'])assert.equal((await post(env,'/api/academy/d1/accounts/'+route,{accountId:'account-0001',active:false},token)).body.code,'ACCOUNT_WRITE_RETIRED');
  assert.deepEqual(db.prepare('SELECT * FROM account_credentials').all(),before);
  ok(await profileChange((...args)=>post(env,...args),'account-0002',token,{active:false}));
  assert.equal(db.prepare("SELECT count(*) n FROM accounts a JOIN global_role_assignments g USING(account_id) WHERE a.active=1 AND g.active=1").get().n,2);
  assert.equal((await profileChange((...args)=>post(env,...args),'account-0001',token,{mode:'reset-pin'})).body.code,'OWN_PIN_RESET');
}));

test('independent profile saves succeed with realistic asynchronous D1 responses; genuine same-record conflicts and replay remain protected',()=>use(async({env,db})=>{
  const token=await login(env),directory=ok(await post(env,'/api/admin/platform/user-profiles/get',{},token));
  const native=env.ACADEMY_DB.withSession.bind(env.ACADEMY_DB);
  env.ACADEMY_DB.withSession=(...args)=>{const session=native(...args);return {...session,batch:async statements=>{const result=await session.batch(statements);await new Promise(resolve=>setTimeout(resolve,2));return result;}};};
  const edits=directory.accounts.filter(a=>a.accountId!=='account-0001').map(a=>({mode:'profile',creating:false,accountId:a.accountId,displayName:'Concurrent '+a.accountId,active:a.active,baseRevision:a.revision,operationId:crypto.randomUUID()}));
  const results=await Promise.all(edits.map(input=>post(env,'/api/admin/platform/user-profiles/save',input,token)));
  assert(results.every(r=>r.status===200),JSON.stringify(results));
  for(const input of edits)assert.equal(ok(await post(env,'/api/admin/platform/user-profiles/save',input,token)).replayed,true);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='save'").get().n,edits.length);
  const a=ok(await post(env,'/api/admin/platform/user-profiles/get',{},token)).accounts.find(a=>a.accountId==='account-0002');
  const first={...edits[0],accountId:a.accountId,baseRevision:a.revision,operationId:crypto.randomUUID()};
  const competing=await Promise.all([post(env,'/api/admin/platform/user-profiles/save',{...first,displayName:'One'},token),post(env,'/api/admin/platform/user-profiles/save',{...first,operationId:crypto.randomUUID(),displayName:'Two'},token)]);
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);assert.equal(competing.find(r=>r.status===409).body.code,'ROW_CHANGED');
}));

test('homepage class and curriculum reads exclude unrelated areas and use the existing activity indexes',()=>use(async({env,db})=>{
  const repo=academyD1Repository(env),student=await repo.byId('account-0002');
  const before=await repo.homeData(student,'2026-10-09','2026-10-15');
  const unrelated=db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' AND activity_key NOT IN (SELECT activity_key FROM effective_activity_roles WHERE account_id='account-0002') LIMIT 1").get().activity_key;
  for(let i=0;i<500;i++){db.prepare('INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)').run(unrelated,'unrelated-'+i,'Unrelated class');db.prepare('INSERT INTO modules(activity_key,module_id,name,sort_order,active) VALUES(?,?,?,0,1)').run(unrelated,'unrelated-'+i,'Unrelated module');}
  const after=await repo.homeData(student,'2026-10-09','2026-10-15');
  assert.deepEqual(after[3],before[3]);assert.deepEqual(after[4],before[4]);assert.equal(after[4].length,1);
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM classes WHERE active=1 AND activity_key IN (SELECT value FROM json_each(?))').all(JSON.stringify([before[4][0].activity_key]));
  assert(plan.some(row=>/SEARCH classes USING INDEX/.test(row.detail)),JSON.stringify(plan));
}));

test('confirmed rename records durable work; marker checks use R2 without any D1 reads even when quota is exhausted',()=>use(async({env,db,queries})=>{
  const storage=stores();env.MEDIA_BUCKET=storage.bucket;
  const token=await login(env),changed=ok(await profileChange((...args)=>post(env,...args),'account-0003',token,{displayName:'Cross-browser teacher'}));
  assert.deepEqual(changed.cacheRefreshPending,['profile-labels']);
  const pending=JSON.parse(db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get(refreshSetting('profile-labels')).setting_value);assert.equal(pending.requested,1);assert.equal(pending.published,0);
  assert.deepEqual((await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:storage.edge})).completed,['profile-labels']);
  const count=queries.length,unavailable={...env,ACADEMY_DB:{withSession(){throw Error('D1 must not be opened');}}};
  const response=await profileLabelsVersion(request('/api/academy/profile-labels-version'),unavailable,storage.edge);
  assert.equal((await response.json()).profileLabelsVersion,'1');assert.equal(queries.length,count);
  assert.deepEqual(JSON.parse(storage.objects.get(refreshObject(env,'profile-labels')).body),{revision:1});
}));

test('Course cancellation refreshes the durable public timetable and visitors keep using zero-D1 cached reads',()=>use(async({env,db,queries})=>{
  const storage=stores();env.MEDIA_BUCKET=storage.bucket;const token=await login(env);
  const first=await(await publicTimetable(request('/api/academy/entrance/public-snapshot'),env,now,storage.edge)).json();assert(first.timetable.some(r=>r.kind==='COURSE'));
  const course=ok(await post(env,'/api/admin/platform/courses/list',{},token)).courses[0];
  const current=ok(await post(env,'/api/admin/platform/courses/get',course,token)).course;
  const cancelled=ok(await post(env,'/api/admin/platform/courses/status',{...course,stage:'CANCELLED',baseRevision:current.revision,operationId:crypto.randomUUID()},token));assert.deepEqual(cancelled.cacheRefreshPending,['public-timetable']);
  const refreshed=await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:storage.edge});assert.deepEqual(refreshed.completed,['public-timetable']);
  const reads=queries.length,latest=await(await publicTimetable(request('/api/academy/entrance/public-snapshot'),{...env,ACADEMY_DB:{withSession(){throw Error('No visitor D1 reads');}}},now,null)).json();
  assert(!latest.timetable.some(r=>r.kind==='COURSE'&&r.activityId===course.courseId));assert.equal(queries.length,reads);assert.equal(latest.sourceRevision,1);
  assert.doesNotMatch(JSON.stringify(latest),/teacherName|joinUrl|zoom\./);
},{courses:true}));

test('failed publication retains pending work with backoff and later recovers without the original browser',()=>use(async({env,db})=>{
  const storage=stores();env.MEDIA_BUCKET=storage.bucket;
  const p=(sql,...args)=>env.ACADEMY_DB.prepare(sql).bind(...args);
  await markRefresh(p,'public-timetable','account-0001').run();storage.failWrites(true);
  const failed=await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:null});assert.equal(failed.pending,true);
  const state=JSON.parse(db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get(refreshSetting('public-timetable')).setting_value);assert.equal(state.published,0);assert.equal(state.attempts,1);assert(state.nextAttemptAt>now.getTime());
  storage.failWrites(false);
  const recovered=await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now:new Date(now.getTime()+60001),edge:null});assert.deepEqual(recovered.completed,['public-timetable']);
  assert(storage.objects.has(publicTimetableKey(env,publicTimetableDay(now))));
}));

test('an older in-flight refresh cannot overwrite or acknowledge a newer published generation',()=>use(async({env,db})=>{
  const storage=stores();env.MEDIA_BUCKET=storage.bucket;const p=(sql,...args)=>env.ACADEMY_DB.prepare(sql).bind(...args);
  await markRefresh(p,'public-timetable','account-0001').run();
  const put=storage.bucket.put;let release,started;
  const blocked=new Promise(resolve=>started=resolve);
  storage.bucket.put=async(key,body,options)=>{if(JSON.parse(body).sourceRevision===1){started();await new Promise(resolve=>release=resolve);}return put(key,body,options);};
  const old=processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:null});await blocked;
  await markRefresh(p,'public-timetable','account-0001').run();
  assert.deepEqual((await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:null})).completed,['public-timetable']);
  release();await old;
  assert.equal(JSON.parse(storage.objects.get(publicTimetableKey(env,publicTimetableDay(now))).body).sourceRevision,2);
  const state=JSON.parse(db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get(refreshSetting('public-timetable')).setting_value);assert.equal(state.requested,2);assert.equal(state.published,2);
}));

test('quota exhaustion pauses recovery in R2 until reset without repeated D1 attempts',()=>use(async({env})=>{
  const storage=stores();let reads=0;env.MEDIA_BUCKET=storage.bucket;
  env.ACADEMY_DB={withSession:()=>({prepare:()=>({bind:()=>({all:async()=>{reads++;throw Error("Your account has exceeded D1's free tier daily row read limit.");}})})})};
  const result=await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now,edge:null});assert.equal(result.pending,true);assert.equal(reads,1);
  await processCacheRefresh(request('/api/academy/cache/refresh'),env,{now:new Date(now.getTime()+600000),edge:null});assert.equal(reads,1,'R2 pause is checked before opening D1');
}));
