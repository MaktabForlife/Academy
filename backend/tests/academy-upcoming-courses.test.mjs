import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upcomingCourseFixture} from './fixtures/academy-upcoming-course-fixture.mjs';
import {addDays,sunday} from '../src/academy/entrance.js';

const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('upcoming Courses are independent of the week, scoped to teaching authority, and safe before publication',async()=>{
 const f=await upcomingCourseFixture();
 try{
  const before=f.db.prepare('SELECT activity_key,publication_id,snapshot_json FROM timetable_publications ORDER BY activity_key,publication_id').all();
  for(const role of ['admin','teacher']){
   const home=ok(await f.call('/api/academy/entrance',{startDate:addDays(f.startDate,-7)},f.tokens[role]));
   assert.ok(home.personalActivities.some(a=>a.id===f.draft.courseId),'Authorised staff see unpublished Courses in navigation');
   if(role==='admin')assert.equal(home.personalActivities.length,f.db.prepare("SELECT count(*) n FROM activities WHERE active=1 AND lifecycle='ACTIVE'").get().n,'Global Admin inherits access to every active Program and Course');
   const upcoming=home.upcomingCourses.find(c=>c.id===f.published.courseId);
   assert.equal(upcoming.startDate,f.startDate);assert.equal(upcoming.canPlan,true);assert.equal(upcoming.canManage,role==='admin');
   assert.equal(home.upcomingCourses.some(c=>c.id===f.draft.courseId&&c.stage==='DRAFT'&&!c.canPlan),role==='admin','Unpublished setup stays in the Admin upcoming catalogue');
   assert.ok(!home.personalTimetable.some(l=>l.activityId===f.published.courseId),'Future lessons do not appear in the wrong week');
   assert.doesNotMatch(JSON.stringify(home.upcomingCourses),/zoom|secret|teacherId|sessions/i);
   const next=ok(await f.call('/api/academy/entrance',{startDate:f.startDate},f.tokens[role]));
   assert.ok(next.personalTimetable.some(l=>l.activityId===f.published.courseId&&l.date===f.startDate));
   assert.deepEqual(next.upcomingCourses,home.upcomingCourses);
  }
  for(const role of ['student','other']){
   const home=ok(await f.call('/api/academy/entrance',{},f.tokens[role]));
   assert.ok(!home.personalActivities.some(a=>a.id===f.draft.courseId));
   assert.ok(!home.upcomingCourses?.some(c=>[f.draft.courseId,f.published.courseId].includes(c.id)));
  }
  const publicHome=ok(await f.call('/api/academy/entrance',{}));
  assert.ok(!publicHome.activities.some(a=>a.id===f.draft.courseId));assert.equal(publicHome.upcomingCourses,undefined);
  assert.equal((await f.call('/api/academy/entrance',{id:f.draft.courseId},f.tokens.student)).status,404);
  const plan=ok(await f.call('/api/academy/planning/get',{activityKey:'COURSE:'+f.published.courseId,runId:f.published.runId,period:'WEEKLY',weekStart:sunday(f.startDate)},f.tokens.teacher));
  assert.equal(plan.canEdit,true);assert.ok(plan.content.lessons.some(l=>l.date===f.startDate));
  const courseKey='COURSE:'+f.published.courseId;
  f.db.prepare('INSERT INTO lesson_plan_requirements VALUES(?,0)').run(courseKey);
  for(const role of ['admin','teacher']){
   const hidden=ok(await f.call('/api/academy/entrance',{},f.tokens[role]));assert.equal(hidden.upcomingCourses.find(c=>c.id===f.published.courseId).canPlan,false);assert.equal(hidden.personalActivities.find(a=>a.id===f.published.courseId).plansRequired,false);
  }
  assert.equal((await f.call('/api/academy/planning/get',{activityKey:courseKey,runId:f.published.runId,weekStart:f.startDate},f.tokens.teacher)).body.code,'PLANS_NOT_REQUIRED');
  f.db.prepare('UPDATE lesson_plan_requirements SET plans_required=1 WHERE activity_key=?').run(courseKey);
  f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0003' AND activity_key IN (?,?)").run('COURSE:'+f.published.courseId,'COURSE:'+f.draft.courseId);
  const revoked=ok(await f.call('/api/academy/entrance',{},f.tokens.teacher));
  assert.ok(!revoked.upcomingCourses?.some(c=>[f.draft.courseId,f.published.courseId].includes(c.id)));
  assert.equal((await f.call('/api/academy/planning/get',{activityKey:'COURSE:'+f.published.courseId,runId:f.published.runId,period:'WEEKLY',weekStart:f.startDate},f.tokens.teacher)).status,403);
  assert.deepEqual(f.db.prepare('SELECT activity_key,publication_id,snapshot_json FROM timetable_publications ORDER BY activity_key,publication_id').all(),before);
 }finally{f.db.close();}
});
