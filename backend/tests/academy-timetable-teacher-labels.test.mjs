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
  const start=f.queries.length,visitor=await d1Entrance(academyD1Repository(f.env),null,null,input,now);assert.doesNotMatch(JSON.stringify(visitor),/TestTeacher|teacherNames|teacherName|display_name/);assert(!f.queries.slice(start).some(q=>q.includes('SELECT account_id,display_name,active FROM accounts')));
 }finally{f.db.close();}
});
