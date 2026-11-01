import test from 'node:test';
import assert from 'node:assert/strict';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {seedRecordedOptions,ok,correction} from './fixtures/academy-recorded-context-fixture.mjs';
const seed=f=>{seedRecordedOptions(f);f.db.exec("DELETE FROM modules WHERE module_id LIKE 'inactive%';DELETE FROM program_subjects WHERE program_subject_id='inactive-subject';DELETE FROM subject_catalog WHERE subject_id='inactive-subject';");};
const create=async(f,admin,date='2026-10-27')=>{const activityKey=f.scopes.programA,period={activityKey,startDate:date,endDate:date},session=ok(await f.request('sessions',period,admin)).sessions[0];assert(session);return ok(await f.request('create',{...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId;};
test('split published correction stays private until exact accepted change; old reader head, assets, caches and timetable remain consistent',async()=>{
 const f=await splitVideoFixture(seed);try{
  const admin=await f.source.actor('adminA'),global=await f.source.actor('global'),student=await f.source.login('0002'),scope=f.scopes.programA,lessonId=await create(f,admin),request=(action,input={},token=admin,workspace='ADMIN')=>f.request(action,{activityKey:scope,...input},token,workspace);
  const published=ok(await request('save',{lessonId,revision:1,operationId:crypto.randomUUID(),title:'Shared lesson',summary:'Original reader summary',state:'PUBLISHED',commentsClosed:true,videos:[{name:'Original video',url:'https://youtu.be/9IuTDcSs6vQ'}]}));
  ok(await f.request('/api/academy/changes/accept',published.acceptedChange,admin));
  const before=ok(await request('feed',{},student,'LEARN')),original=before.lessons.find(l=>l.id===lessonId);assert(original);const head=f.databases.core.prepare('SELECT head_id FROM setup_head_state').get().head_id;
  const tables=['timetable_publications','published_lessons','published_lesson_teachers','class_memberships','role_assignments','lesson_media_assets','lesson_media_links'],untouched=Object.fromEntries(Object.entries(f.databases).map(([owner,db])=>[owner,Object.fromEntries(tables.filter(t=>db.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(t)).map(t=>[t,db.prepare('SELECT * FROM '+t).all()]))]));
  const input=correction(lessonId,{revision:2}),changed=ok(await request('context-save',input));assert(changed.acceptedChange);assert.equal(ok(await request('context-save',input)).replayed,true);
  assert.equal(f.databases.core.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);
  const pending=ok(await request('feed',{},student,'LEARN')).lessons.find(l=>l.id===lessonId);assert.equal(pending.title,original.title);assert.deepEqual(pending.recordingGroup,original.recordingGroup);
  assert.equal((await request('context-save',input,student,'LEARN')).status,403);
  const accepted=ok(await f.request('/api/academy/changes/accept',changed.acceptedChange,admin));assert(accepted.head);const after=ok(await request('feed',{ifRevision:before.cacheRevision},student,'LEARN')),current=after.lessons.find(l=>l.id===lessonId);assert.notEqual(after.cacheRevision,before.cacheRevision);assert.equal(current.title,'Synthetic recorded-subject module');assert.deepEqual(current.recordingGroup.subjectIdentity,['module','recorded-subject-module']);assert.deepEqual(current.assets,original.assets);assert.equal(current.canManage,false);assert.equal(current.canCorrectContext,false);
  for(const [owner,tablesBefore] of Object.entries(untouched))for(const [table,rows] of Object.entries(tablesBefore))assert.deepEqual(f.databases[owner].prepare('SELECT * FROM '+table).all(),rows,owner+' '+table);

  // Immediate withdrawal remains effective even against an accepted definition.
  ok(await request('save',{lessonId,revision:3,operationId:crypto.randomUUID(),title:current.title,summary:'',state:'HIDDEN',commentsClosed:true,videos:[{name:'Original video',url:'https://youtu.be/9IuTDcSs6vQ'}]}));assert(!ok(await request('feed',{},student,'LEARN')).lessons.some(l=>l.id===lessonId));
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
test('split current authority rejects scoped-role and session revocation after options; another Admin cannot replay the receipt',async()=>{
 const f=await splitVideoFixture(seed);try{
  const admin=await f.source.actor('adminA'),global=await f.source.actor('global'),lessonId=await create(f,admin);ok(await f.request('context-options',{lessonId},admin));const input=correction(lessonId);ok(await f.request('context-save',input,admin));assert.equal((await f.request('context-save',input,global)).status,409);
  f.databases.core.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?").run(f.actors.adminA,f.scopes.programA);assert([401,403].includes((await f.request('context-save',correction(lessonId,{revision:2}),admin)).status));
  f.databases.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(new Date().toISOString(),f.actors.global);assert.equal((await f.request('context-options',{lessonId},global)).status,401);
 }finally{f.close();}
});
test('split correction rolls both stores back on an Admin apply failure and revalidates live curriculum flags',async()=>{
 const f=await splitVideoFixture(seed);try{
  const admin=await f.source.actor('adminA'),lessonId=await create(f,admin),input=correction(lessonId),before=Object.fromEntries(Object.entries(f.databases).map(([owner,db])=>[owner,{media:db.prepare('SELECT * FROM lesson_media_lessons').all(),receipts:db.prepare('SELECT * FROM operation_receipts').all(),audit:db.prepare('SELECT * FROM audit_events').all()}]));
  f.databases.admin.exec("CREATE TRIGGER fail_recorded_apply BEFORE UPDATE OF source_lessons_json ON lesson_media_lessons BEGIN SELECT RAISE(ABORT,'constraint synthetic correction failure'); END;");
  assert.equal((await f.request('context-save',input,admin)).status,503);
  for(const [owner,prior] of Object.entries(before)){const db=f.databases[owner];assert.deepEqual(db.prepare('SELECT * FROM lesson_media_lessons').all(),prior.media);assert.deepEqual(db.prepare('SELECT * FROM operation_receipts').all(),prior.receipts);assert.deepEqual(db.prepare('SELECT * FROM audit_events').all(),prior.audit);}
  f.databases.admin.exec('DROP TRIGGER fail_recorded_apply');
  f.databases.admin.prepare("UPDATE modules SET name='Unpublished curriculum name' WHERE module_id='recorded-subject-module'").run();
  assert(ok(await f.request('context-options',{lessonId},admin)).subjects.some(s=>s.name==='Unpublished curriculum name'),'Admin options retain unpublished curriculum definitions');
  // Repoint an unpublished Admin subject to another native catalogue entry.
  const alternate=f.databases.admin.prepare("SELECT subject_key FROM subject_catalog WHERE subject_key<>'ACADEMY:recorded-subject' LIMIT 1").get().subject_key;
  f.databases.admin.prepare("UPDATE program_subjects SET subject_key=? WHERE program_subject_id='recorded-subject'").run(alternate);
  f.databases.core.prepare('UPDATE subject_catalog SET active=0 WHERE subject_key=?').run(alternate);
  assert(!ok(await f.request('context-options',{lessonId},admin)).subjects.some(s=>s.key==='SUBJECT:recorded-subject'),'An unpublished reference still obeys the new target’s Core active flag');
  f.databases.core.prepare("UPDATE modules SET active=0 WHERE module_id='recorded-subject-module'").run();
  assert(!ok(await f.request('context-options',{lessonId},admin)).subjects.some(s=>s.key==='MODULE:recorded-subject-module'),'Core live inactive flag overrides Admin definition');assert.equal((await f.request('context-save',input,admin)).status,400);
 }finally{f.close();}
});
