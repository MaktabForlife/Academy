import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedFixture,ok,scope,correction} from './fixtures/academy-recorded-context-fixture.mjs';
import {academyDate} from '../src/academy/d1/academy-clock.js';
const use=fn=>async()=>{const f=await recordedFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}};
const row=(f,id)=>f.db.prepare('SELECT * FROM lesson_media_lessons WHERE lesson_id=?').get(id);
const snapshot=(f,tables)=>Object.fromEntries(tables.map(t=>[t,f.db.prepare('SELECT * FROM '+t).all()]));
test('native options are active curriculum and registered teachers; labels and foreign IDs cannot be submitted',use(async f=>{
 const {lessonId}=await f.create(),options=ok(await f.request('context-options',{lessonId},f.scoped));
 assert(options.subjects.some(s=>s.key==='SUBJECT:recorded-subject'));assert(options.subjects.some(s=>s.key==='MODULE:recorded-subject-module'));assert(!options.subjects.some(s=>/inactive/.test(s.key)));
 assert(options.teachers.some(t=>t.id==='account-0006'));assert(!options.teachers.some(t=>t.id==='account-0001'),'Global Admin alone is not a teacher designation');
 for(const extra of [{subjectKey:'Synthetic recorded-subject'},{subjectKey:'MODULE:inactive-module'},{subjectKey:'MODULE:inactive-subject-module'},{subjectKey:'SUBJECT:foreign'},{teacherIds:['account-0002']},{teacherIds:['account-0001']},{teacherIds:['account-0006','ACCOUNT-0006']},{teacherIds:[]},{reason:''}])assert.equal((await f.request('context-save',correction(lessonId,extra),f.scoped)).status,400,JSON.stringify(extra));
 f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0006'").run();assert.equal((await f.request('context-save',correction(lessonId),f.admin)).status,400);assert.equal(row(f,lessonId).revision,1);
}));
test('only current scoped Admin workspace can inspect or correct, including explicit preview denials',use(async f=>{
 const {lessonId}=await f.create(),teacher=await f.login('0003'),student=await f.login('0002'),foreign=await f.login('0005');
 for(const [token,workspace] of [[teacher,'ADMIN'],[teacher,'TEACH'],[student,'LEARN'],[foreign,'ADMIN'],[f.admin,'LEARN'],[f.admin,'TEACH'],[f.admin,'ADMIN_LEARN'],[f.admin,'ADMIN_TEACH']])for(const action of ['context-options','context-save'])assert.equal((await f.request(action,correction(lessonId),token,workspace)).status,403,workspace+' '+action);
 for(const action of ['context-options','context-save'])assert.equal((await f.request(action,correction(lessonId,{view:'learner'}),f.admin)).status,403);
 ok(await f.request('context-options',{lessonId},f.scoped));
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0004' AND activity_key=? AND role='PROGRAM_ADMIN'").run(scope);f.db.prepare("UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004' AND activity_key=?").run(scope);
 assert.equal((await f.request('context-options',{lessonId},f.scoped)).status,403);assert.equal((await f.request('context-save',correction(lessonId),f.scoped)).status,403);assert.equal(row(f,lessonId).revision,1);
}));
test('revoked session, inactive account and credential epoch invalidate an already-open correction',use(async f=>{
 const {lessonId}=await f.create();ok(await f.request('context-options',{lessonId},f.scoped));
 f.db.prepare("UPDATE account_sessions SET revoked_at='2026-11-01' WHERE account_id='account-0004'").run();assert.equal((await f.request('context-save',correction(lessonId),f.scoped)).status,401);
 f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0001'").run();assert.equal((await f.request('context-options',{lessonId},f.admin)).status,401);f.db.prepare("UPDATE accounts SET active=1 WHERE account_id='account-0001'").run();
 f.db.prepare("UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id='account-0001'").run();assert.equal((await f.request('context-save',correction(lessonId),f.admin)).status,401);assert.equal(row(f,lessonId).revision,1);
}));
test('one-day correction changes grouping/display only, preserving every permission, timetable and upload/expiry anchor',use(async f=>{
 const {lessonId,session}=await f.create(),other=await f.create('2026-10-28');
 f.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES('original-upload',?,'MP4','session-recordings/original','original.mp4',212,'2026-10-27T08:30:00Z')").run(scope);f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(lessonId,'original-upload');
 const before=row(f,lessonId),otherBefore=row(f,other.lessonId),tables=['timetable_publications','published_lessons','published_lesson_classes','published_lesson_teachers','role_assignments','class_memberships','lesson_media_assets','lesson_media_links','lesson_media_comments'],untouched=snapshot(f,tables);
 const initial=ok(await f.request('get',{lessonId},f.admin));ok(await f.request('context-save',correction(lessonId),f.scoped));
 const after=row(f,lessonId),detail=ok(await f.request('get',{lessonId},f.admin));
 for(const key of Object.keys(before).filter(k=>!['source_lessons_json','title','revision','updated_at'].includes(k)))assert.deepEqual(after[key],before[key],key);
 const source=JSON.parse(after.source_lessons_json);delete source[0].recordedContext;assert.deepEqual(source,JSON.parse(before.source_lessons_json));assert.deepEqual(snapshot(f,tables),untouched);assert.deepEqual(row(f,other.lessonId),otherBefore);
 assert.equal(detail.lesson.teacher,f.db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0006'").get().display_name);
 assert.deepEqual(detail.lesson.recordingGroup.subjectIdentity,['module','recorded-subject-module']);assert.deepEqual(detail.lesson.recordingGroup.teacherIds,['account-0006']);assert.notEqual(detail.lesson.recordingGroup.key,initial.lesson.recordingGroup.key);assert.deepEqual(detail.assets,initial.assets);
 const alternate=await f.login('0006'),original=await f.login('0003');assert.equal((await f.request('get',{lessonId},alternate,'TEACH')).status,403);ok(await f.request('get',{lessonId},original,'TEACH'));
 const sessions=ok(await f.request('sessions',{startDate:'2026-10-27',endDate:'2026-10-27'},f.admin)).sessions;assert.deepEqual(sessions.find(s=>s.sessionKey===session.sessionKey),session);
 const audit=f.db.prepare("SELECT changed_fields_json FROM audit_events WHERE record_id=? AND action='context-save'").get(lessonId);assert.equal(JSON.parse(audit.changed_fields_json).permissionAnchorsUnchanged,true);
}));
test('stale revisions, exact retries, operation collisions, reset and custom lesson titles are preserved',use(async f=>{
 const {lessonId}=await f.create(),input=correction(lessonId);ok(await f.request('context-save',input,f.scoped));const audit=f.db.prepare('SELECT count(*) n FROM audit_events').get().n;
 assert.equal(ok(await f.request('context-save',input,f.scoped)).replayed,true);assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events').get().n,audit);
 assert.equal((await f.request('context-save',{...input,reason:'Changed request'},f.scoped)).status,409);assert.equal((await f.request('context-save',correction(lessonId),f.scoped)).status,409);
 f.db.prepare("UPDATE lesson_media_lessons SET title='Custom lesson title' WHERE lesson_id=?").run(lessonId);
 ok(await f.request('context-save',correction(lessonId,{revision:2,subjectKey:'SUBJECT:recorded-subject'}),f.scoped));assert.equal(row(f,lessonId).title,'Custom lesson title');
 ok(await f.request('context-save',correction(lessonId,{revision:3,reset:true}),f.scoped));assert.equal(row(f,lessonId).title,'Custom lesson title');assert(!JSON.parse(row(f,lessonId).source_lessons_json)[0].recordedContext);
}));
test('late transaction failure rolls back correction, audit, receipt and write revision together',use(async f=>{
 const {lessonId}=await f.create(),tables=['lesson_media_lessons','audit_events','operation_receipts','academy_write_state'],before=snapshot(f,tables),input=correction(lessonId);
 f.db.exec("CREATE TRIGGER fail_context_receipt BEFORE INSERT ON operation_receipts WHEN NEW.dataset_key='LESSON_MEDIA' BEGIN SELECT RAISE(ABORT,'synthetic late failure'); END;");
 assert.equal((await f.request('context-save',input,f.admin)).status,503);assert.deepEqual(snapshot(f,tables),before);f.db.exec('DROP TRIGGER fail_context_receipt');ok(await f.request('context-save',input,f.admin));
}));
test('write-time authority and native option races cannot commit with stale settings',use(async f=>{
 const {lessonId}=await f.create(),original=f.env.ACADEMY_DB,session=original.withSession('first-primary');let race=true;
 f.env.ACADEMY_DB={...original,withSession:()=>({...session,async batch(statements){if(race&&statements.some(s=>s.sql.includes('UPDATE lesson_media_lessons SET source_lessons_json'))){race=false;f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0004' AND activity_key=?").run(scope);f.db.prepare("UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004' AND activity_key=?").run(scope);}return session.batch(statements);}})};
 assert([401,403,409].includes((await f.request('context-save',correction(lessonId),f.scoped)).status));assert.equal(row(f,lessonId).revision,1);
 f.env.ACADEMY_DB=original;
}));
test('past-date feed and creation on 27–28 October stay bounded, preserve default week and find saved rows beyond pagination',use(async f=>{
 for(const date of ['2026-10-27','2026-10-28']){const feed=ok(await f.request('feed',{sessionDate:date},f.admin));assert.equal(feed.startDate,date);assert.equal(feed.endDate,date);assert(feed.sessions.some(s=>s.date===date&&!s.media));await f.create(date);}
 const id=f.db.prepare('SELECT lesson_id FROM lesson_media_lessons WHERE activity_key=? AND lesson_date=? LIMIT 1').get(scope,'2026-10-27').lesson_id;ok(await f.request('context-save',correction(id),f.admin));const base=row(f,id);
 for(let n=0;n<35;n++)f.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,lesson_date,title,start_time,end_time,teacher_name,state,updated_at) VALUES(?,?,'2026-10-31','Later','','','','DRAFT',?)").run('newer-'+n,scope,base.updated_at);
 const selected=ok(await f.request('feed',{sessionDate:'2026-10-27'},f.admin));assert.equal(selected.sessions.find(s=>s.media?.id===id).title,'Synthetic recorded-subject module');assert(selected.lessons.length<=32);
 const defaultFeed=ok(await f.request('feed',{},f.admin)),today=academyDate(new Date(),'Africa/Johannesburg');assert(defaultFeed.startDate<=today&&defaultFeed.endDate>=today);assert.equal(defaultFeed.sessionDate,'');assert.notEqual(defaultFeed.cacheRevision,selected.cacheRevision);
 const unchanged=ok(await f.request('feed',{sessionDate:'2026-10-27',ifRevision:selected.cacheRevision},f.admin));assert.equal(unchanged.notModified,true);
 for(const value of ['2026-02-30','bad',{},1])assert.equal((await f.request('feed',{sessionDate:value},f.admin)).status,400);
 assert.equal((await f.request('feed',{sessionDate:'2026-10-27'},await f.login('0002'),'LEARN')).status,400);
}));
test('published corrections invalidate feed revisions while publication and class withdrawal still deny readers',use(async f=>{
 const {lessonId}=await f.create();f.db.prepare("UPDATE lesson_media_lessons SET state='PUBLISHED' WHERE lesson_id=?").run(lessonId);const student=await f.login('0002');
 const initial=ok(await f.request('feed',{},student,'LEARN'));ok(await f.request('context-save',correction(lessonId),f.admin));const updated=ok(await f.request('feed',{ifRevision:initial.cacheRevision},student,'LEARN'));assert.notEqual(updated.cacheRevision,initial.cacheRevision);const lesson=updated.lessons.find(l=>l.id===lessonId);assert.equal(lesson.canManage,false);assert.equal(lesson.canCorrectContext,false);assert.deepEqual(lesson.lessons,[]);
 f.db.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").run(lessonId);assert(!ok(await f.request('feed',{},student,'LEARN')).lessons.some(l=>l.id===lessonId));
 f.db.prepare("UPDATE lesson_media_lessons SET state='PUBLISHED' WHERE lesson_id=?").run(lessonId);f.db.prepare("UPDATE class_memberships SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);assert(!ok(await f.request('feed',{},student,'LEARN')).lessons.some(l=>l.id===lessonId));
}));
test('restoring scheduled context preserves the historical teacher label and changes only the selected day',use(async f=>{
 const {lessonId}=await f.create(),original=row(f,lessonId),input=correction(lessonId);ok(await f.request('context-save',input,f.admin));
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0003' AND activity_key=? AND role='TEACHER'").run(scope);
 ok(await f.request('context-save',correction(lessonId,{revision:2,subjectKey:'SCHEDULED',teacherIds:['account-0003']}),f.admin));assert.equal(ok(await f.request('get',{lessonId},f.admin)).lesson.teacher,original.teacher_name);
 ok(await f.request('context-save',correction(lessonId,{revision:3,reset:true}),f.admin));const restored=row(f,lessonId);assert.equal(restored.title,original.title);assert.equal(restored.source_lessons_json,original.source_lessons_json);
 assert.equal((await f.request('context-options',{lessonId:'MOU-20261006'},f.admin)).status,403,'Legacy entries without a supported native session are held');
 const sources=JSON.parse(restored.source_lessons_json);f.db.prepare('UPDATE lesson_media_lessons SET source_lessons_json=? WHERE lesson_id=?').run(JSON.stringify([...sources,...sources]),lessonId);assert.equal((await f.request('context-save',correction(lessonId,{revision:4}),f.admin)).status,403,'Ambiguous multi-session sources cannot be relabelled');
}));
test('a curriculum removal racing the save retries against fresh options and leaves no correction',use(async f=>{
 const {lessonId}=await f.create(),original=f.env.ACADEMY_DB,session=original.withSession('first-primary');let race=true;
 f.env.ACADEMY_DB={...original,withSession:()=>({...session,async batch(statements){if(race&&statements.some(s=>s.sql.includes('UPDATE lesson_media_lessons SET source_lessons_json'))){race=false;f.db.prepare("UPDATE modules SET active=0 WHERE module_id='recorded-subject-module'").run();f.db.prepare('UPDATE academy_write_state SET version=version+1').run();}return session.batch(statements);}})};
 assert.equal((await f.request('context-save',correction(lessonId),f.admin)).status,400);assert.equal(row(f,lessonId).revision,1);assert(!JSON.parse(row(f,lessonId).source_lessons_json)[0].recordedContext);f.env.ACADEMY_DB=original;
}));
