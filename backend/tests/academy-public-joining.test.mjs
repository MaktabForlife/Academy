import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {setCell} from './fixtures/academy-d1-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1Entrance} from '../src/academy/d1/entrance.js';
import {d1LessonJoin,websiteEntrance} from '../src/academy/d1/lesson-join.js';
import {publicTimetableSnapshot,publicTimetableDay} from '../src/academy/d1/public-timetable.js';
import worker from '../src/worker.js';

test('public Free Program and Course joining opens five minutes early and is rechecked on every click',async()=>{
  const f=await courseFixture(s=>setCell(s,'PublishedGlobalTimetableSessions',1,'ZoomLink','https://zoom.us/j/12345678901')),repository=academyD1Repository(f.env),now=new Date('2026-10-09T08:00:00Z');
  try{
    f.db.prepare("UPDATE activity_policy_imports SET source_access_model='FREE' WHERE activity_key=?").run('PROGRAM:'+PROGRAM_IDS[0]);
    f.db.exec("UPDATE course_run_access SET access_model='FREE'");
    const data=await d1Entrance(repository,null,null,{startDate:'2026-10-09'},now);
    const snapshot=publicTimetableSnapshot(data,publicTimetableDay(now),now);
    const program=snapshot.timetable.find(r=>r.kind==='PROGRAM'&&r.activityId===PROGRAM_IDS[0]),course=snapshot.timetable.find(r=>r.kind==='COURSE');
    assert.equal(program.publicJoin,true);assert.equal(course.publicJoin,true);
    assert.ok(snapshot.timetable.some(r=>r.kind==='PROGRAM'&&!r.publicJoin),'Paid Program remains marketing only');
    assert.doesNotMatch(JSON.stringify(snapshot),/zoom\.|joinUrl|account_id|teacherName|className|meetingGroup/);
    assert.doesNotMatch(JSON.stringify(websiteEntrance(data)),/zoom\.|joinUrl/);
    for(const lesson of [program,course]){
      const input={joinKey:lesson.joinKey,date:lesson.date};
      assert.ok(Number.isFinite(lesson.startsAt));assert.ok(Number.isFinite(lesson.endsAt));
      await assert.rejects(d1LessonJoin(repository,null,input,new Date(lesson.joinAvailableAt-1)),e=>e.code==='LESSON_NOT_OPEN');
      assert.match((await d1LessonJoin(repository,null,input,new Date(lesson.joinAvailableAt))).joinUrl,/^https:\/\//);
      assert.match((await d1LessonJoin(repository,null,input,new Date(lesson.endsAt-1))).joinUrl,/^https:\/\//);
      await assert.rejects(d1LessonJoin(repository,null,input,new Date(lesson.endsAt)),e=>e.code==='LESSON_NOT_OPEN');
    }
    f.db.prepare("UPDATE activity_policy_imports SET source_access_model='PAID' WHERE activity_key=?").run('PROGRAM:'+PROGRAM_IDS[0]);
    await assert.rejects(d1LessonJoin(repository,null,{joinKey:program.joinKey,date:program.date},new Date(program.startsAt)),e=>e.code==='LESSON_UNAVAILABLE');
    const [,id,run,publication,source]=JSON.parse(course.joinKey);
    f.db.prepare("INSERT INTO lesson_lifecycle(activity_key,lifecycle_id,publication_id,source_session_id,status) VALUES(?,'public-cancel',?,?,'CANCELLED')").run('COURSE:'+id,publication,source);
    await assert.rejects(d1LessonJoin(repository,null,{joinKey:course.joinKey,date:course.date},new Date(course.startsAt)),e=>['LESSON_UNAVAILABLE','LESSON_NOT_OPEN'].includes(e.code));
    const response=await worker.fetch(new Request('http://localhost/api/academy/public-lesson/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({joinKey:program.joinKey,date:program.date})}),f.env);
    assert.equal(response.status,403);assert.equal((await response.json()).code,'LESSON_UNAVAILABLE');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    f.db.exec("UPDATE course_run_access SET access_model='PAID'");
    const latest=publicTimetableSnapshot(await d1Entrance(repository,null,null,{startDate:program.date},now),publicTimetableDay(now),now);
    assert.ok(latest.timetable.every(r=>!r.publicJoin&&!r.joinKey));
  }finally{f.db.close();}
});

test('Program management Free/Paid saves are scoped, audited and shared with profiles and public joining',async()=>{
 const f=await courseFixture(),repository=academyD1Repository(f.env),id=PROGRAM_IDS[0],activity='PROGRAM:'+id,now=new Date('2026-10-09T08:00:00Z');
 const request=async(path,body={},token='')=>{const response=await worker.fetch(new Request('http://localhost/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),f.env);return {status:response.status,body:await response.json()};};
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const login=async n=>ok(await request('account/login',{uniqueid:'login-'+n,pin:'1234'})).token;
 const current=async token=>ok(await request('admin/platform/programs/list',{},token)).programs.find(p=>p.id===id);
 const input=(program,accessModel)=>({id:program.id,name:program.name,durationYears:program.durationYears,timezone:program.timezone,status:program.status,revision:program.revision,accessModel,operationId:crypto.randomUUID()});
 try{
  const admin=await login('0001'),scoped=await login('0004'),teacher=await login('0003'),student=await login('0002');
  const source=f.db.prepare('SELECT * FROM activity_policy_imports ORDER BY activity_key').all(),roles=f.db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),publications=f.db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all();
  const before=await current(scoped),free=input(before,'FREE');assert.equal(before.accessModel,'PAID');
  assert.equal((await request('admin/platform/programs/save',free,teacher)).status,403);assert.equal((await request('admin/platform/programs/save',free,student)).status,403);
  assert.equal((await request('admin/platform/programs/save',{...free,id:PROGRAM_IDS[1]},scoped)).status,403);
  const saved=ok(await request('admin/platform/programs/save',free,scoped));assert.equal(saved.program.accessModel,'FREE');
  assert.equal(ok(await request('admin/platform/programs/save',free,scoped)).replayed,true);assert.equal((await current(admin)).revision,saved.program.revision);
  const profiles=ok(await request('admin/platform/user-profiles/get',{},admin));assert.equal(profiles.scopes.find(s=>s.id===id).accessModel,'FREE');
  const snapshot=publicTimetableSnapshot(await d1Entrance(repository,null,null,{startDate:'2026-10-09'},now),publicTimetableDay(now),now),lesson=snapshot.timetable.find(l=>l.activityId===id);assert.equal(lesson.publicJoin,true);
  const join={joinKey:lesson.joinKey,date:lesson.date};assert.match((await d1LessonJoin(repository,null,join,new Date(lesson.startsAt))).joinUrl,/^https:\/\//);
  const paid=ok(await request('admin/platform/programs/save',input(await current(scoped),'PAID'),scoped));assert.equal(paid.program.accessModel,'PAID');
  await assert.rejects(d1LessonJoin(repository,null,join,new Date(lesson.startsAt)),e=>e.code==='LESSON_UNAVAILABLE');
  const latest=publicTimetableSnapshot(await d1Entrance(repository,null,null,{startDate:'2026-10-09'},now),publicTimetableDay(now),now).timetable.find(l=>l.activityId===id);assert.ok(latest&&!latest.publicJoin&&!latest.joinKey,'Paid remains visible without a public joining reference');
  assert.equal(ok(await request('admin/platform/user-profiles/get',{},admin)).scopes.find(s=>s.id===id).accessModel,'PAID');
  assert.equal((await request('admin/platform/programs/save',{...free,operationId:crypto.randomUUID()},scoped)).status,409,'A stale form cannot revert the later Paid decision');
  assert.equal((await request('admin/platform/programs/save',input(paid.program,'UNKNOWN'),admin)).status,400);
  const settings=f.db.prepare('SELECT * FROM academy_settings WHERE setting_key=?').get('ProgramAccess:'+activity);assert.equal(settings.setting_value,'PAID');assert.equal(settings.updated_by_account_id,'account-0004');
  const revision=paid.program.revision,receipts=f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
  f.db.exec("CREATE TRIGGER reject_policy_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_REGISTRY' BEGIN SELECT RAISE(ABORT,'injected late audit failure'); END");
  assert.equal((await request('admin/platform/programs/save',input(paid.program,'FREE'),admin)).status,503);assert.equal((await current(admin)).revision,revision);assert.equal((await current(admin)).accessModel,'PAID');assert.equal(f.db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
  f.db.exec('DROP TRIGGER reject_policy_audit');
  const created=ok(await request('admin/platform/programs/create',{id:'PRG-'+crypto.randomUUID(),name:'New Free Program',status:'DRAFT',accessModel:'FREE',operationId:crypto.randomUUID()},admin));assert.equal(created.program.accessModel,'FREE');
  assert.equal(f.db.prepare('SELECT count(*) n FROM activity_policy_imports WHERE activity_key=?').get('PROGRAM:'+created.program.id).n,0,'New Programs need no fabricated import evidence');
  const rename={...input(created.program,'FREE'),name:'Renamed Free Program'};delete rename.accessModel;
  assert.equal(ok(await request('admin/platform/programs/save',rename,admin)).program.accessModel,'FREE','Unrelated saves preserve the current decision');
  assert.deepEqual(f.db.prepare('SELECT * FROM activity_policy_imports ORDER BY activity_key').all(),source);assert.deepEqual(f.db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),roles);assert.deepEqual(f.db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),publications);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
 }finally{f.db.close();}
});
