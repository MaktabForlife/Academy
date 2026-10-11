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
