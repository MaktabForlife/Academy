import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from './fixtures/academy-attendance-fixture.mjs';
const scope='PROGRAM:'+attendanceProgramId,period={startDate:'2026-10-18',endDate:'2026-10-24'};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const save=(lessonId,revision,extra={})=>({lessonId,revision,operationId:crypto.randomUUID(),title:'Named media',summary:'Prepared notes',state:'PUBLISHED',commentsClosed:false,recordingUrls:[],...extra});
async function course(f,admin){
 const details={name:'Whole Course resources',accessModel:'PAID',timezone:'Africa/Johannesburg',categoryKey:'',weekdays:[],startDate:'',endDate:'',startTime:'',endTime:'',teacherId:'',zoomLink:'',sessions:[]};
 const r=ok(await f.call('/api/admin/platform/courses/save',{operationId:crypto.randomUUID(),details},admin)),activityKey='COURSE:'+r.courseId;
 for(const [who,role] of [['0002','STUDENT'],['0003','TEACHER']])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('named-course-'+who,'account-'+who,activityKey,role);
 return activityKey;
}
test('named videos and PDFs keep their identities and original download filenames across edits and exact retries',()=>use(async f=>{
 const admin=await f.login('0001'),teacher=await f.login('0003'),student=await f.login('0002');
 const selected=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions[0];
 const id=ok(await f.media('create',{activityKey:scope,...period,sessionKey:selected.sessionKey,sessionVersion:selected.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId;
 const videos=[{name:'Tarteel introduction',url:'https://youtu.be/9IuTDcSs6vQ'},{name:'Revision & questions',url:'https://youtu.be/ujm0T_jZd0U'}];
 ok(await f.media('save',save(id,1,{videos}),teacher));
 const before=ok(await f.media('get',{lessonId:id},admin)).assets;
 ok(await f.media('save',save(id,2,{videos:[{...videos[0],name:'Updated introduction'},videos[1]]}),teacher));
 const after=ok(await f.media('get',{lessonId:id},admin)).assets;assert.deepEqual(after.map(a=>a.id).sort(),before.map(a=>a.id).sort());assert(after.some(a=>a.name==='Updated introduction'));
 const uploaded=ok(await f.mediaUpload({lessonId:id,revision:3,filename:'original-notes.pdf',name:'Study guide'},teacher));
 const rename={lessonId:id,assetId:uploaded.assetId,revision:4,operationId:crypto.randomUUID(),name:'Week 1 · Study guide'};
 ok(await f.media('attachment-name',rename,teacher));assert.equal(ok(await f.media('attachment-name',rename,teacher)).replayed,true);
 const list=ok(await f.media('list',{activityKey:scope},student)),row=list.lessons[0];assert.equal(row.assets.find(a=>a.id===uploaded.assetId).name,rename.name);
 const response=await f.media('download',{lessonId:id,assetId:uploaded.assetId},student);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/original-notes.pdf/);
 const batch=ok(await f.media('timetable',{sessions:[{activityKey:scope,sessionKey:selected.sessionKey}]},student));assert(batch.lessons[0].assets.some(a=>a.name===rename.name));assert.doesNotMatch(JSON.stringify(batch),/youtu\.be|object_key|lessons\//);
 ok(await f.media('save',save(id,5,{recordingUrls:videos.map(v=>v.url)}),teacher));assert(ok(await f.media('get',{lessonId:id},admin)).assets.some(a=>a.name==='Updated introduction'),'An older client does not erase saved video names');
 assert.equal((await f.media('attachment-name',{...rename,revision:6,operationId:crypto.randomUUID(),name:'x'.repeat(181)},teacher)).status,400);
 assert.equal((await f.media('attachment-name',{...rename,revision:6,operationId:crypto.randomUUID(),assetId:'foreign'},teacher)).status,404);
 assert.equal((await f.media('attachment-name',{...rename,revision:6,operationId:crypto.randomUUID()},student)).status,403);
}));
test('Course PDFs are dateless, separately published, admin-managed and available across weeks while enrolled',()=>use(async f=>{
 const admin=await f.login('0001'),activityKey=await course(f,admin),teacher=await f.login('0003'),student=await f.login('0002'),unrelated=await f.login('0006');
 const input={activityKey,operationId:crypto.randomUUID()};
 for(const token of [teacher,student])assert.equal((await f.media('course-files-create',input,token)).status,403);
 assert.equal((await f.media('course-files-create',{...input,activityKey:scope},admin)).status,403);
 const made=ok(await f.media('course-files-create',input,admin));assert.equal(ok(await f.media('course-files-create',input,admin)).replayed,true);assert.equal(ok(await f.media('course-files-create',{...input,operationId:crypto.randomUUID()},admin)).lessonId,made.lessonId);
 const row=f.db.prepare('SELECT * FROM lesson_media_lessons WHERE lesson_id=?').get(made.lessonId);assert.equal(row.media_scope,'COURSE');assert.equal(row.lesson_date,'');assert.equal(row.session_key,null);
 let result=ok(await f.media('calendar',{activityKey,...period},student));assert.equal(result.courseFiles.media,null);assert.equal(result.sessions.length,0);
 assert.equal(ok(await f.media('calendar',{activityKey,...period,view:'learner'},admin)).courseFiles.media,null);
 const pdf=ok(await f.mediaUpload({lessonId:made.lessonId,revision:1,filename:'handbook.pdf',name:'Course handbook'},admin));
 assert.equal((await f.mediaUpload({lessonId:made.lessonId,revision:2},teacher)).status,403);
 assert.equal((await f.media('download',{lessonId:made.lessonId,assetId:pdf.assetId},student)).status,403);
 ok(await f.media('save',save(made.lessonId,2,{title:'Course PDFs'}),admin));
 for(const token of [student,teacher,admin])for(const dates of [period,{startDate:'2027-01-03',endDate:'2027-01-09'}]){
  result=ok(await f.media('calendar',{activityKey,...dates},token));assert.equal(result.courseFiles.media.assets[0].name,'Course handbook');assert.equal(result.sessions.length,0);assert.equal(result.lessons.length,0);assert.equal((await f.media('download',{lessonId:made.lessonId,assetId:pdf.assetId},token)).status,200);
 }
 assert.equal(ok(await f.media('calendar',{activityKey,...period},teacher)).courseFiles.canManage,false);
 assert.equal(ok(await f.media('calendar',{activityKey,...period,view:'learner'},admin)).courseFiles.canManage,false);
 assert.equal((await f.media('get',{lessonId:made.lessonId},teacher)).status,403);
 assert.equal((await f.media('save',save(made.lessonId,3,{videos:[{url:'https://youtu.be/9IuTDcSs6vQ',name:'Course-wide video'}]}),admin)).status,400);
 assert.equal((await f.media('calendar',{activityKey,...period},unrelated)).status,403);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE activity_key=? AND account_id='account-0002'").run(activityKey);
 assert.equal((await f.media('download',{lessonId:made.lessonId,assetId:pdf.assetId},student)).status,403);
 ok(await f.media('save',save(made.lessonId,3,{state:'HIDDEN'}),admin));assert.equal(ok(await f.media('calendar',{activityKey,...period},teacher)).courseFiles.media,null);assert.equal((await f.media('download',{lessonId:made.lessonId,assetId:pdf.assetId},teacher)).status,403);
}));
test('media-name upgrade preserves every stored file, link, lesson and comment',async()=>{
 const f=await mediaFixture({upgrade:false});try{
 f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0030_session_lesson_media.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
 const tables=['lesson_media_lessons','lesson_media_assets','lesson_media_links','lesson_media_comments'],before=Object.fromEntries(tables.map(t=>[t,f.db.prepare('SELECT * FROM '+t).all()]));
 f.db.exec(readFileSync(new URL('../migrations/academy/0031_media_names_and_course_pdfs.sql',import.meta.url),'utf8'));
 for(const table of tables){const rows=f.db.prepare('SELECT * FROM '+table).all();for(const row of rows){delete row.media_scope;delete row.display_name;}assert.deepEqual(rows,before[table]);}
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
