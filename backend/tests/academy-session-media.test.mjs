import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from './fixtures/academy-attendance-fixture.mjs';
const scope='PROGRAM:'+attendanceProgramId,period={startDate:'2026-10-01',endDate:'2026-10-31'};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const create=(f,token,session,activityKey=scope,extra={})=>f.media('create',{activityKey,...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID(),...extra},token);
const save=(lessonId,extra={})=>({lessonId,operationId:crypto.randomUUID(),revision:1,title:'Session recordings and notes',summary:'Prepared lesson notes',recordingUrls:['https://youtu.be/9IuTDcSs6vQ','https://youtu.be/ujm0T_jZd0U'],state:'PUBLISHED',commentsClosed:false,...extra});
test('Program session media is scoped, starts as draft, retries exactly and never duplicates a session',()=>use(async f=>{
 const admin=await f.login('0001'),teacher=await f.login('0003'),student=await f.login('0002'),other=await f.login('0006');
 const sessions=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions;assert(sessions.length);assert(sessions.every(s=>s.sessionKey&&!JSON.stringify(s).includes('zoom.us')));
 assert.equal((await f.media('sessions',{activityKey:scope,...period},student)).status,403);
 assert.equal((await f.media('sessions',{activityKey:scope,...period},other)).status,403);
 const own=ok(await f.media('sessions',{activityKey:scope,...period},teacher)).sessions;assert(own.every(s=>s.teacherIds.includes('account-0003')));
 const input={activityKey:scope,...period,sessionKey:sessions[0].sessionKey,sessionVersion:sessions[0].sessionVersion,operationId:crypto.randomUUID()},created=ok(await f.media('create',input,admin));
 assert.equal(ok(await f.media('create',input,admin)).replayed,true);assert.equal(ok(await create(f,admin,sessions[0])).lessonId,created.lessonId);
 assert.equal(ok(await f.media('list',{activityKey:scope},student)).lessons.length,0);
 assert.equal(f.db.prepare('SELECT state FROM lesson_media_lessons WHERE lesson_id=?').get(created.lessonId).state,'DRAFT');
 assert.equal((await create(f,admin,{...sessions[0],sessionVersion:'stale'})).status,409);
 assert.equal((await f.media('get',{activityKey:'PROGRAM:unrelated',lessonId:created.lessonId},admin)).status,403);
 ok(await f.media('save',save(created.lessonId),admin));
 const row=ok(await f.media('list',{activityKey:scope},student)).lessons[0];assert.equal(row.assets.length,2);assert.equal(row.canManage,false);assert.equal(row.canView,true);assert.doesNotMatch(JSON.stringify(row),/youtube|youtu\.be|object_key/);
 assert.equal((await f.media('get',{lessonId:created.lessonId},other)).status,403);
}));
test('Program learners see only their classes; revoking membership closes cached PDF/video references',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');
 const sessions=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions,selected=sessions.find(s=>s.classIds.includes('class-1'));
 const id=ok(await create(f,admin,selected)).lessonId;ok(await f.media('save',save(id),admin));const upload=ok(await f.mediaUpload({lessonId:id,revision:2},admin));
 assert.equal((await f.media('download',{lessonId:id,assetId:upload.assetId},student)).status,200);
 f.db.prepare('UPDATE class_memberships SET active=0 WHERE activity_key=? AND account_id=?').run(scope,'account-0002');
 assert.equal(ok(await f.media('list',{activityKey:scope},student)).lessons.length,0);
 assert.equal((await f.media('download',{lessonId:id,assetId:upload.assetId},student)).status,403);
}));
test('Course media attaches to a saved session without a Program class and remains while enrolled',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003');
 const details={name:'Permanent Course',categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[1],startDate:'2026-09-21',endDate:'2026-09-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-09-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Course lesson one',status:'SCHEDULED'}]};
 const saved=ok(await f.call('/api/admin/platform/courses/save',{operationId:crypto.randomUUID(),details},admin)),activityKey='COURSE:'+saved.courseId;
 for(const [who,role] of [['0002','STUDENT'],['0003','TEACHER']])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('course-media-'+who,'account-'+who,activityKey,role);
 const selected=ok(await f.media('sessions',{activityKey,runId:saved.runId},teacher)).sessions[0];assert(selected);assert.deepEqual(selected.classIds,[]);
 const id=ok(await create(f,teacher,selected,activityKey,{runId:saved.runId})).lessonId;ok(await f.media('save',save(id),teacher));
 assert.equal(f.db.prepare('SELECT class_id FROM lesson_media_lessons WHERE lesson_id=?').get(id).class_id,null);
 let list=ok(await f.media('list',{activityKey},student));assert.equal(list.lessons.length,1);assert.equal(list.lessons[0].assets.length,2);
 const asset=list.lessons[0].assets[0];assert.equal((await f.media('watch',{lessonId:id,assetId:asset.id},student)).status,200);
 const calendarInput={activityKey,runId:saved.runId,startDate:'2026-09-20',endDate:'2026-09-26'};const learnerCalendar=ok(await f.media('calendar',calendarInput,student));assert.equal(learnerCalendar.sessions.length,1);assert.equal(learnerCalendar.sessions[0].media.assets.length,2);assert.equal(learnerCalendar.sessions[0].canManage,false);const staffCalendar=ok(await f.media('calendar',calendarInput,teacher));assert.equal(staffCalendar.sessions[0].sessionKey,selected.sessionKey);assert.equal(staffCalendar.sessions[0].media.id,id);assert.equal(staffCalendar.runId,saved.runId);
 const draft=f.db.prepare('SELECT details_json FROM course_management_drafts WHERE activity_key=?').get(activityKey);const revised=JSON.parse(draft.details_json);revised.sessions.push({...revised.sessions[0],id:'CMSESSION-unreleased',title:'Unreleased Course session'});f.db.prepare('UPDATE course_management_drafts SET details_json=? WHERE activity_key=?').run(JSON.stringify(revised),activityKey);assert.doesNotMatch(JSON.stringify(ok(await f.media('calendar',calendarInput,student))),/Unreleased/);
 f.db.prepare("UPDATE course_management_drafts SET stage='COMPLETE' WHERE activity_key=?").run(activityKey);assert.equal(ok(await f.media('list',{activityKey},student)).lessons.length,1);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE activity_key=? AND account_id='account-0002'").run(activityKey);
 assert.equal((await f.media('watch',{lessonId:id,assetId:asset.id},student)).status,403);
}));
test('MOU recordings remain permanent and pagination does not skip sessions sharing a date',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');assert.equal(ok(await f.media('list',{},student)).lessons.length,3);
 f.db.prepare("UPDATE academy_settings SET setting_value='0' WHERE setting_key='LessonMediaPilot'").run();assert.equal(ok(await f.media('list',{},student)).lessons.length,3);
 const old=f.db.prepare('SELECT * FROM lesson_media_lessons LIMIT 1').get();
 for(let n=0;n<35;n++)f.db.prepare('INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,updated_at,teacher_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('MOU-page-'+String(n).padStart(2,'0'),old.activity_key,old.class_id,'2026-10-20','Session '+n,'09:00','10:00',old.teacher_id,old.teacher_name,'PUBLISHED',old.updated_at,old.teacher_ids_json);
 const first=ok(await f.media('list',{},admin)),second=ok(await f.media('list',{before:first.before},admin));assert.equal(first.lessons.length,30);assert.equal(second.lessons.length,8);assert.equal(new Set([...first.lessons,...second.lessons].map(r=>r.id)).size,38);const calendar=ok(await f.media('calendar',{startDate:'2026-10-18',endDate:'2026-10-24'},admin));assert.equal(calendar.sessions.length,35,'The weekly calendar includes all sessions beyond the old 30-card page');
}));

test('migration preserves every existing media lesson, attachment and discussion with foreign keys intact',async()=>{
 const f=await mediaFixture({upgrade:false});try{
  f.db.prepare("INSERT INTO lesson_media_comments(comment_id,lesson_id,account_id,body,state,staff,created_at,updated_at) VALUES('legacy-discussion','MOU-20261006','account-0002','Keep this discussion','APPROVED',0,'2026-10-06','2026-10-06')").run();
  const tables=['lesson_media_lessons','lesson_media_assets','lesson_media_links','lesson_media_comments'],before=Object.fromEntries(tables.map(t=>[t,f.db.prepare('SELECT * FROM '+t).all()]));
  f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0030_session_lesson_media.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
  for(const table of tables){const after=f.db.prepare('SELECT * FROM '+table).all();if(table==='lesson_media_lessons')for(const row of after){delete row.session_key;delete row.run_id;delete row.teacher_ids_json;}assert.deepEqual(after,before[table]);}
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});


test('weekly media calendar matches saved sessions, counts attachments and keeps learner publication/class boundaries',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003');
 const sessions=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions,selected=sessions.find(row=>row.classIds.includes('class-1'));
 const lessonId=ok(await create(f,admin,selected)).lessonId;
 let calendar=ok(await f.media('calendar',{activityKey:scope,...period},admin));
 assert.equal(calendar.sessions.filter(row=>row.media?.id===lessonId).length,1);assert.equal(calendar.sessions.find(row=>row.media?.id===lessonId).media.state,'DRAFT');
 assert.equal(ok(await f.media('calendar',{activityKey:scope,...period},student)).sessions.length,0);
 assert.equal(ok(await f.media('calendar',{activityKey:scope,...period,view:'learner'},admin)).sessions.length,0);
 ok(await f.media('save',save(lessonId),admin));ok(await f.mediaUpload({lessonId,revision:2},admin));
 calendar=ok(await f.media('calendar',{activityKey:scope,...period},student));assert.equal(calendar.sessions.length,1);assert.equal(calendar.sessions[0].canManage,false);assert.equal(calendar.sessions[0].media.canView,true);assert.equal(calendar.sessions[0].media.assets.filter(a=>a.kind==='YOUTUBE').length,2);assert.equal(calendar.sessions[0].media.assets.filter(a=>a.kind==='PDF').length,1);assert.doesNotMatch(JSON.stringify(calendar),/youtu\.be|youtube_id|object_key|zoom\.us/);
 const staff=ok(await f.media('calendar',{activityKey:scope,...period},teacher));assert(staff.sessions.every(row=>row.media||row.teacherIds.includes('account-0003')));
 f.db.prepare('UPDATE class_memberships SET active=0 WHERE activity_key=? AND account_id=?').run(scope,'account-0002');assert.equal(ok(await f.media('calendar',{activityKey:scope,...period},student)).sessions.length,0);
 assert.equal((await f.media('calendar',{activityKey:scope,startDate:'2026-10-01',endDate:'2026-12-01'},admin)).status,400);
 assert.equal((await f.media('calendar',{activityKey:'PROGRAM:unrelated',...period},student)).status,403);
}));
test('calendar preserves permanent media without a matching current timetable and browsing never writes data',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),activityKey='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1';
 const before=f.db.prepare('SELECT count(*) n FROM audit_events').get().n;
 for(const token of [admin,student]){const result=ok(await f.media('calendar',{activityKey,startDate:'2026-10-04',endDate:'2026-10-10'},token));assert.equal(result.sessions.length,3);assert(result.sessions.every(row=>row.savedMedia&&row.media.assets.length===1));}
 const empty=ok(await f.media('calendar',{activityKey,startDate:'2026-11-01',endDate:'2026-11-07',initial:true},student));assert.equal(empty.suggestedDate,'2026-10-08');assert.equal(empty.sessions.length,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events').get().n,before);
}));

test('continuous media feed keeps older weeks, conditional refreshes are cheap and current authority is rechecked',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),activityKey='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1';
 const initial=ok(await f.media('feed',{activityKey},student));assert.equal(initial.sessions.length,3);assert(initial.sessions.every(s=>s.savedMedia&&s.media.assets.length));assert(initial.cacheRevision);assert.doesNotMatch(JSON.stringify(initial),/youtu\.be|youtube_id|object_key|zoom\.us/);
 const audit=f.db.prepare('SELECT count(*) n FROM audit_events').get().n;
 const unchanged=ok(await f.media('feed',{activityKey,ifRevision:initial.cacheRevision},student));assert.equal(unchanged.notModified,true);assert.equal(unchanged.sessions,undefined);assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events').get().n,audit);
 assert.notEqual(ok(await f.media('feed',{activityKey},admin)).cacheRevision,initial.cacheRevision,'Conditional tokens cannot cross accounts');
 f.db.prepare('UPDATE academy_write_state SET version=version+1').run();const updated=ok(await f.media('feed',{activityKey,ifRevision:initial.cacheRevision},student));assert.notEqual(updated.cacheRevision,initial.cacheRevision);assert.equal(updated.notModified,undefined);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(activityKey);
 assert([401,403].includes((await f.media('feed',{activityKey,ifRevision:updated.cacheRevision},student)).status),'A cache validator never bypasses access checks');
}));
test('continuous feed cursor includes all saved sessions across dates without duplicates',()=>use(async f=>{
 const admin=await f.login('0001'),old=f.db.prepare('SELECT * FROM lesson_media_lessons LIMIT 1').get(),activityKey=old.activity_key;
 for(let n=0;n<35;n++)f.db.prepare('INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,updated_at,teacher_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('feed-'+String(n).padStart(2,'0'),activityKey,old.class_id,n<10?'2026-09-20':'2026-10-20','Session '+n,'09:00','10:00',old.teacher_id,old.teacher_name,'PUBLISHED',old.updated_at,old.teacher_ids_json);
 const first=ok(await f.media('feed',{activityKey},admin)),second=ok(await f.media('feed',{activityKey,before:first.before},admin));assert.equal(first.lessons.length,30);assert.equal(second.lessons.length,8);assert.equal(new Set([...first.lessons,...second.lessons].map(r=>r.id)).size,38);assert.equal(first.cacheRevision,second.cacheRevision);
}));
