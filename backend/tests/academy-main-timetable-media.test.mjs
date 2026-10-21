import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from './fixtures/academy-attendance-fixture.mjs';
const scope='PROGRAM:'+attendanceProgramId;
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('main timetable matches exact Program sessions and only exposes accessible published attachment references',async()=>{
 const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 try{
  const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003'),other=await f.login('0006');
  const period={startDate:'2026-10-18',endDate:'2026-10-24'},session=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions[0];
  const sessions=[{activityKey:scope,sessionKey:session.sessionKey}],input={sessions};
  const created=ok(await f.media('create',{activityKey:scope,...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin));
  const query=token=>f.media('timetable',input,token);
  assert.deepEqual(ok(await query(admin)).lessons,[],'Even admins only get published media on the main timetable');
  ok(await f.media('save',{lessonId:created.lessonId,operationId:crypto.randomUUID(),revision:1,title:'Main timetable attachments',summary:'',recordingUrls:['https://youtu.be/9IuTDcSs6vQ','https://youtu.be/ujm0T_jZd0U'],state:'PUBLISHED',commentsClosed:false},admin));
  ok(await f.mediaUpload({lessonId:created.lessonId,revision:2},admin));
  for(const token of [admin,student,teacher]){const result=ok(await query(token));assert.equal(result.lessons.length,1);assert.equal(result.lessons[0].sessionKey,session.sessionKey);assert.equal(result.lessons[0].assets.length,3);assert.doesNotMatch(JSON.stringify(result),/youtu\.be|youtube_id|object_key|zoom\.us/);}
  assert.deepEqual(ok(await query(other)).lessons,[]);
  const entrance=ok(await f.call('/api/academy/entrance',{startDate:period.startDate},student));
  assert(entrance.personalTimetable.some(row=>row.kind==='PROGRAM'&&row.activityId===attendanceProgramId&&row.mediaSessionKey===session.sessionKey),'Displayed lesson uses the media session identity');
  const visitor=ok(await f.call('/api/academy/entrance',{startDate:period.startDate}));assert(visitor.timetable.every(row=>!row.mediaSessionKey));
  assert.equal((await query('')).status,401);
  assert.deepEqual(ok(await f.media('timetable',{sessions:[{activityKey:scope,sessionKey:session.sessionKey+'different'}]},student)).lessons,[]);
  assert.equal((await f.media('timetable',{sessions:Array(401).fill(sessions[0])},admin)).status,400);
  f.db.prepare('UPDATE class_memberships SET active=0 WHERE activity_key=? AND account_id=?').run(scope,'account-0002');
  assert.deepEqual(ok(await query(student)).lessons,[]);
  const asset=ok(await query(admin)).lessons[0].assets.find(a=>a.kind==='YOUTUBE');assert.equal((await f.media('watch',{lessonId:created.lessonId,assetId:asset.id},student)).status,403);
  f.db.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").run(created.lessonId);assert.deepEqual(ok(await query(admin)).lessons,[]);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
