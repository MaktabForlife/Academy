import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1Entrance} from '../src/academy/d1/entrance.js';
import {d1AccountTimetable} from '../src/academy/d1/account-timetable.js';
import {timetableTeacherNames} from '../src/academy/entrance.js';
import worker from '../src/worker.js';
const now=new Date('2026-10-09T07:55:00Z'),input={startDate:'2026-10-09'};
async function post(env,path,body,token){const r=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};}
test('current teacher names preserve multiple-teacher order, case-insensitive IDs and unavailable-profile fallbacks',()=>{
 const names=new Map([['TEACHER-A','TestTeacher'],['TEACHER-B','Renamed second teacher']]);
 assert.deepEqual(timetableTeacherNames({teacherId:'teacher-a',teacherIds:['teacher-a','teacher-b','missing'],teacherNames:['Old first','Old second','Published fallback']},names),['TestTeacher','Renamed second teacher','Published fallback']);
 assert.deepEqual(timetableTeacherNames({teacherId:'teacher-a',teacherName:'Old first'},names),['TestTeacher']);
 assert.deepEqual(timetableTeacherNames({teacherName:'Imported teacher without an account ID'},names),['Imported teacher without an account ID']);
 assert.deepEqual(timetableTeacherNames({teacherIds:[],teacherNames:[]},names),[]);
});
test('profile rename updates Program/Course summary, details and account timetable without republishing or changing access/history',async()=>{
 const f=await fixtureDatabase();try{
  const signed=await post(f.env,'/api/account/login',{uniqueid:'login-0001',pin:'1234'});assert.equal(signed.status,200);
  const repo=academyD1Repository(f.env),state=await repo.byId('account-0001'),user={accountid:'account-0001',role:'GLOBAL_ADMIN'};
  const history=()=>f.db.prepare('SELECT activity_key,publication_id,snapshot_json,source_snapshot_sha256 FROM timetable_publications ORDER BY activity_key,publication_id').all();const original=history();
  const before=await d1Entrance(repo,state,user,input,now);assert(before.personalTimetable.some(r=>r.kind==='PROGRAM'));assert(before.personalTimetable.some(r=>r.kind==='COURSE'));
  assert(before.personalTimetable.some(r=>r.teacherNames.includes('Synthetic learner 3')));
  const account=f.db.prepare("SELECT revision FROM accounts WHERE account_id='account-0003'").get();
  const renamed=await post(f.env,'/api/academy/d1/accounts/update',{accountId:'account-0003',displayName:'TestTeacher',active:true,revision:account.revision},signed.body.token);assert.equal(renamed.status,200,JSON.stringify(renamed.body));
  const after=await d1Entrance(academyD1Repository(f.env),state,user,input,now);
  for(const kind of ['PROGRAM','COURSE']){const rows=after.personalTimetable.filter(r=>r.kind===kind);assert(rows.length);assert(rows.every(r=>r.teacherNames.includes('TestTeacher')));assert(rows.every(r=>r.information.includes('TestTeacher')));}
  const schedule=rows=>rows.map(({teacherNames,information,...r})=>r);assert.deepEqual(schedule(after.personalTimetable),schedule(before.personalTimetable));assert.deepEqual(history(),original);
  const activity=after.personalActivities.find(a=>a.kind==='PROGRAM');const page=await d1Entrance(academyD1Repository(f.env),state,user,{...input,id:activity.id},now);assert(page.activity.timetable.every(r=>r.teacherNames.includes('TestTeacher')));
  const legacy=await d1AccountTimetable(academyD1Repository(f.env),{state,user},input,now);assert(legacy.sessions.every(r=>r.teacherName==='TestTeacher'));
  const start=f.queries.length,visitor=await d1Entrance(academyD1Repository(f.env),null,null,input,now);assert.doesNotMatch(JSON.stringify(visitor),/TestTeacher|teacherNames|teacherName|display_name|teacher_accounts_json/);assert(!f.queries.slice(start).some(q=>/FROM accounts\b/.test(q)));
 }finally{f.db.close();}
});
test('publication read limits current labels to referenced teachers and omits them for anonymous visitors',async()=>{
 const f=await fixtureDatabase();try{
  const publication=f.db.prepare("SELECT activity_key,publication_id,snapshot_json FROM timetable_publications WHERE pattern='WEEKLY' LIMIT 1").get();
  const snapshot=JSON.parse(publication.snapshot_json);
  snapshot.rules=[{teacherId:'account-0005',teacherIds:[' ACCOUNT-0003 ','account-0004','missing',null,42]},
   {teacherId:'account-0006',teacherIds:[]},null,'invalid row',42,{}];
  snapshot.sessions=[{TeacherAccountID:'ACCOUNT-0007'},null,'invalid row',{TeacherAccountID:42}];
  let selectedId='teacher-label-test-1';
  const publish=(id,version)=>f.db.prepare(`INSERT INTO timetable_publications SELECT activity_key,?,scope_key,?,pattern,published_at,published_by_source_id,effective_from,effective_until,timezone,?,source_snapshot_sha256,conversion FROM timetable_publications WHERE activity_key=? AND publication_id=?`).run(id,version,JSON.stringify(snapshot),publication.activity_key,publication.publication_id);
  publish(selectedId,2);
  f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0004'").run();
  const repo=academyD1Repository(f.env),state=await repo.byId('account-0001');
  const load=async user=>(await repo.homeData(user,'2026-10-09','2026-10-15'))[1].find(p=>p.activity_key===publication.activity_key&&p.publication_id===selectedId);
  const labels=JSON.parse((await load(state)).teacher_accounts_json).sort((a,b)=>a.account_id.localeCompare(b.account_id));
  assert.deepEqual(labels,[3,4,6,7].map(n=>({account_id:`account-000${n}`,display_name:`Synthetic learner ${n}`,active:n===4?0:1})));
  const start=f.queries.length,anonymous=await load(null);assert(!Object.hasOwn(anonymous,'teacher_accounts_json'));assert(!f.queries.slice(start).some(q=>/FROM accounts\b/.test(q)));
  snapshot.rules={teacherId:'account-0003'};snapshot.sessions='invalid collection';
  selectedId='teacher-label-test-2';publish(selectedId,3);
  assert.deepEqual(JSON.parse((await load(state)).teacher_accounts_json),[]);
 }finally{f.db.close();}
});
