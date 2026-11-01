import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {noteRetentionFixture as fixture} from './fixtures/academy-note-retention-fixture.mjs';
import {recoverNoteRetention,pdfRetentionWrite} from '../src/academy/d1/note-retention.js';
import {noteExpiry} from '../src/academy/d1/note-retention-policy.js';
import {lessonPdfReference} from '../src/academy/d1/lesson-pdf-storage.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';import worker from '../src/academy-runtime.js';
const day=86400000,ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('calendar months clamp leap years and month ends',()=>{assert.equal(noteExpiry('2026-01-31T12:34:56.000Z',3),'2026-04-30T12:34:56.000Z');assert.equal(noteExpiry('2023-11-30T12:00:00.000Z',3),'2024-02-29T12:00:00.000Z');assert.throws(()=>noteExpiry('invalid',3));});
for(const split of [false,true])test('warn once, preserve the download window, then delete notes and bytes; split='+split,async()=>{
 const f=await fixture(split);try{
  const text=f.add('CLASS_NOTE'),pdf=f.add('PDF_NOTE');assert.throws(()=>f.db.prepare('DELETE FROM class_notes WHERE note_id=?').run(text),/retained/);assert.throws(()=>f.db.prepare('DELETE FROM lesson_note_versions WHERE note_id=?').run(pdf),/immutable/);
  const first=await f.tick();assert.equal(first.warned,1);assert.equal(first.removed,0);assert.equal(f.bytes.size,1);assert.equal(f.db.prepare('SELECT count(*) n FROM note_retention_recipients').get().n,0,'one class notice creates no per-learner rows');
  const student=await f.login('0002'),unrelated=await f.actor('none'),notices=ok(await f.request('list',{},student)).notices;assert.equal(notices.length,1);
  const detail=ok(await f.request('get',{noticeId:notices[0].id,operationId:crypto.randomUUID()},student)).notice;assert.match(detail.body,/download.*before this date/);
  assert.equal((await f.request('get',{noticeId:notices[0].id,operationId:crypto.randomUUID()},unrelated)).status,404);
  ok(await f.request('archive',{noticeId:notices[0].id,operationId:crypto.randomUUID()},student));assert.equal(ok(await f.request('list',{},student)).notices.length,0);
  await f.tick(3);assert.equal(f.db.prepare('SELECT count(*) n FROM note_retention_recipients').get().n,1,'only the learner who opened the notice has a receipt');
  const last=await f.tick(7+1/86400);assert.equal(last.removed,2);assert.equal(last.objectsDeleted,1);assert.equal(f.db.prepare('SELECT count(*) n FROM class_note_versions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,0);assert.equal(f.bytes.size,0);
  assert.equal((await f.tick(8)).objectsDeleted,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
test('a newer note sharing the PDF preserves its bytes',async()=>{const f=await fixture();try{f.add('PDF_NOTE');f.add('PDF_NOTE',f.time);await f.tick();await f.tick(8);assert.equal(f.bytes.size,1);assert.equal(f.deleted.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_entries').get().n,1);}finally{f.close();}});
test('policy extensions defer deletion; shortening never truncates a promised warning window',async()=>{const f=await fixture();try{f.add('PDF_NOTE');await f.tick();f.db.prepare('UPDATE note_retention_policy SET warning_days=1,revision=revision+1').run();await f.tick(2);assert.equal(f.bytes.size,1);f.db.prepare('UPDATE note_retention_policy SET months=12,revision=revision+1').run();await f.tick(8);assert.equal(f.bytes.size,1);assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='DELETED'").get().n,0);const item=f.db.prepare('SELECT * FROM note_retention_items').get();assert.equal(item.state,'TRACKED');assert.equal(item.warned_at,null);const next=(Date.parse(item.delete_after)-f.time.getTime())/day-f.db.prepare('SELECT warning_days FROM note_retention_policy').get().warning_days+1/86400;await f.tick(next);assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='WARNED'").get().n,1,'a changed deletion date gets its own single warning window');}finally{f.close();}});
test('PDF upload generations prevent deletion races and allow reupload after expiry',async()=>{const f=await fixture();try{const repository=academyD1Repository(f.env);await repository.ready();const p=(sql,...v)=>repository.db.prepare(sql).bind(...v),key='dev-split-v1/lesson-pdfs/sha256/'+'b'.repeat(64)+'.pdf',write=await pdfRetentionWrite(repository,p,key);f.db.prepare("INSERT INTO note_retention_objects VALUES(?,'DELETED','new-generation')").run(key);await assert.rejects(repository.db.batch([...write.before,...write.after]),/stale|constraint/i);const retry=await pdfRetentionWrite(repository,p,key);assert(retry.alternate);assert.notEqual(retry.objectKey,key);await repository.db.batch([...retry.before,...retry.after]);}finally{f.close();}});
for(const split of [false,true])test('Global Admin settings, validation, stale-save rejection and exact retries; split='+split,async()=>{
 const f=await fixture(split);try{
  const call=async(action,input,token)=>{const r=await worker.fetch(new Request('http://localhost/api/admin/platform/settings/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),f.env);return {status:r.status,body:await r.json()};};
  const global=await f.actor('global'),scoped=await f.actor('adminA'),initial=ok(await call('get',{},global));assert.deepEqual(initial.noteRetention,{months:3,warningDays:7});assert.equal((await call('get',{},scoped)).status,403);
  const beforeHead=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;const input={timezone:initial.timezone,noteRetention:{months:6,warningDays:14},revision:initial.revision,operationId:crypto.randomUUID()};assert.equal(ok(await call('save',input,global)).noteRetention.months,6);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,beforeHead,'retention-only settings do not republish timetables');assert.equal(ok(await call('save',input,global)).replayed,true);assert.equal((await call('save',{...input,operationId:crypto.randomUUID()},global)).status,409);
  const current=ok(await call('get',{},global));assert.equal((await call('save',{...input,revision:current.revision,noteRetention:{months:0,warningDays:0},operationId:crypto.randomUUID()},global)).status,400);
 }finally{f.close();}
});

test('official session PDFs expire through accepted readers while Course PDFs remain permanent',async()=>{
 const f=await fixture();try{
  const {acceptFixtureSetup}=await import('./fixtures/academy-accepted-fixture.mjs'),{acceptedRepository,acceptedHead}=await import('../src/academy/d1/setup-reader.js');
  const created=new Date(f.time.getTime()-130*day).toISOString(),area=f.scopes.programA,ids=[];
  for(const mediaScope of ['SESSION','COURSE']){
   const asset=crypto.randomUUID(),lesson=crypto.randomUUID(),sha='c'.repeat(64),object=lessonPdfReference('dev-split-v1/',asset,sha);ids.push(asset);
   f.db.prepare(`INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,summary,state,comments_closed,revision,source_publication_id,source_lessons_json,updated_at,session_key,run_id,teacher_ids_json,media_scope) VALUES(?,?,?,?,?,'10:00','11:00','account-0003','Teacher','','PUBLISHED',1,1,NULL,?,?,?,'','["account-0003"]',?)`).run(lesson,area,'messaging-200',created.slice(0,10),'PDF lesson',JSON.stringify([{classIds:['messaging-200']}]),created,JSON.stringify(['PROGRAM',created.slice(0,10),lesson]),mediaScope);
   f.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at,display_name) VALUES(?,?,'PDF',?,'Notes.pdf',5,?,'Notes')").run(asset,area,object,created);f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(lesson,asset);f.bytes.set('dev-split-v1/lesson-pdfs/sha256/'+sha+'.pdf','%PDF-');
  }
  await acceptFixtureSetup(f.env,await f.actor('global'),[area]);await f.tick();assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE kind='SESSION_PDF'").get().n,1);await f.tick(8);
  const source=academyD1Repository(f.env);await source.ready();const accepted=acceptedRepository(source,await acceptedHead(source)),assets=(await accepted.db.prepare("SELECT asset_id FROM lesson_media_assets WHERE kind='PDF'").all()).results;
  assert(!assets.some(a=>a.asset_id===ids[0]));assert(assets.some(a=>a.asset_id===ids[1]));assert.equal(f.bytes.size,1);
  const lesson=f.db.prepare('SELECT lesson_id FROM lesson_media_links WHERE asset_id=?').get(ids[0]).lesson_id,admin=await f.actor('global'),response=await worker.fetch(new Request('http://localhost/api/academy/lesson-media/download',{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify({lessonId:lesson,assetId:ids[0]})}),f.env);assert.equal(response.status,404,'An expired session PDF is hidden even from Admin while shared bytes remain for the Course');
 }finally{f.close();}
});

test('Studio-owned and frozen offerings are excluded before discovery and after warnings',async()=>{
 const f=await fixture();try{
  f.add('CLASS_NOTE');f.add('PDF_NOTE');
  f.db.exec('CREATE TABLE IF NOT EXISTS website_platform_access_ownership(activity_key TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL)');
  f.db.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',0)").run(f.scopes.programA);
  await f.tick();assert.equal(f.db.prepare('SELECT count(*) n FROM note_retention_items').get().n,0);assert.equal(f.bytes.size,1);
  f.db.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY'").run();await f.tick(1);assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='WARNED'").get().n,1);
  f.db.prepare("UPDATE website_platform_access_ownership SET state='FROZEN'").run();await f.tick(9);assert.equal(f.bytes.size,1);assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,1);
  f.db.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY'").run();await f.tick(10);assert.equal(f.bytes.size,0);
 }finally{f.close();}
});
test('an empty class gets the same shared notice and grace without per-learner delivery rows',async()=>{
 const f=await fixture();try{f.add('PDF_NOTE');f.db.prepare('DELETE FROM class_memberships WHERE activity_key=?').run(f.scopes.programA);await f.tick();assert.equal(f.bytes.size,1);assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='WARNED'").get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM note_retention_recipients').get().n,0);await f.tick(8);assert.equal(f.bytes.size,0);}finally{f.close();}
});

test('a PDF shared across Academy and Studio offerings retains its bytes; Library originals are never collected',async()=>{
 const f=await fixture();try{
  f.add('PDF_NOTE');f.add('PDF_NOTE',new Date(f.time.getTime()-130*day),'a'.repeat(64),f.scopes.programB);
  f.db.exec('CREATE TABLE IF NOT EXISTS website_platform_access_ownership(activity_key TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL)');f.db.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',0)").run(f.scopes.programB);
  const library='dev-split-v1/library/original.pdf';f.add('PDF_NOTE',new Date(f.time.getTime()-130*day),'b'.repeat(64),f.scopes.programA,library);
  await f.tick();await f.tick(8);assert(f.bytes.has('dev-split-v1/lesson-pdfs/sha256/'+'a'.repeat(64)+'.pdf'));assert(f.bytes.has(library));assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_entries').get().n,1);
 }finally{f.close();}
});

test('large immutable histories retire in bounded chunks, hide immediately and resume without resurrection',async()=>{
 const f=await fixture();try{
  const text=f.add('CLASS_NOTE'),pdf=f.add('PDF_NOTE');
  for(let revision=2;revision<=12;revision++){
   const previous=f.db.prepare('SELECT version_id FROM class_note_versions WHERE note_id=? ORDER BY revision DESC LIMIT 1').get(text).version_id;
   f.db.prepare('INSERT INTO class_note_versions SELECT ?,note_id,?,context_id,body,due_mode,due_date,due_context_id,due_json,source_head,?,reason,created_at,created_by FROM class_note_versions WHERE version_id=?').run(crypto.randomUUID(),revision,previous,previous);
   f.db.prepare('INSERT INTO lesson_note_versions SELECT ?,note_id,?,filename,display_name,byte_size,sha256,source_head,source_json,uploaded_by,uploaded_at FROM lesson_note_versions WHERE note_id=? LIMIT 1').run('NOTE-'+crypto.randomUUID(),'dev-split-v1/lesson-pdf-refs/NOTE-'+crypto.randomUUID()+'/'+'a'.repeat(64)+'.pdf',pdf);
  }
  await f.tick();const first=await f.tick(8);assert.equal(first.versionsDeleted,16);assert.equal(first.removed,0);assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='PURGING'").get().n,2);
  assert.equal(f.db.prepare('SELECT current_version_id FROM class_notes WHERE note_id=?').get(text).current_version_id,null);assert.equal(f.db.prepare('SELECT state FROM lesson_note_entries WHERE note_id=?').get(pdf).state,'WITHDRAWN');
  const final=await f.tick(8.1);assert.equal(final.versionsDeleted,8);assert.equal(final.removed,2);assert.equal(f.db.prepare('SELECT count(*) n FROM class_note_versions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});

test('maintenance has a dedicated hourly trigger and a request-owned D1 budget',async()=>{
 const {retentionBudget}=await import('../src/academy/d1/note-retention-budget.js'),{noteRetentionCron}=await import('../src/academy/d1/note-retention.js');assert.equal(noteRetentionCron,'7 * * * *');
 const f=await fixture();try{const budget=retentionBudget(f.env,2),db=budget.env.ACADEMY_DB.withSession('first-primary');await db.batch([db.prepare('SELECT 1'),db.prepare('SELECT 2')]);assert.equal(budget.state.calls,1,'a batch is one D1 call');await db.prepare('SELECT 3').first();assert.throws(()=>db.prepare('SELECT 4').all(),/continue next hour/);assert.equal(budget.state.calls,2);}finally{f.close();}
 const jobs=[];await worker.scheduled({cron:noteRetentionCron,scheduledTime:Date.now()},{ACADEMY_NOTE_RETENTION:'0'},{waitUntil:p=>jobs.push(p)});assert.equal(jobs.length,0,'the dedicated trigger never starts unrelated recovery jobs');
});

test('legacy Course PDF notes retain their delivery scope when classIds is empty',async()=>{
 const f=await fixture();try{f.add('PDF_NOTE',new Date(f.time.getTime()-130*day),'e'.repeat(64),f.scopes.courseA,null,{classIds:[],runId:'run-1'});const warned=await f.tick();assert.equal(warned.warned,1);const item=f.db.prepare('SELECT * FROM note_retention_items').get();assert.deepEqual(JSON.parse(item.class_ids_json),['run-1']);await f.tick(8);assert.equal(f.bytes.size,0);}finally{f.close();}
});

test('selected official PDF reads retain live-link revocation and later permanent-Course protection in split stores',async()=>{
 const f=await fixture(true);try{
  const {seedOfficialRetention}=await import('./fixtures/academy-note-retention-official-fixture.mjs'),{acceptFixtureSetup}=await import('./fixtures/academy-accepted-fixture.mjs');
  const seeded=await seedOfficialRetention(f),revoked=seeded.expired[0],promoted=seeded.expired[1];
  for(const db of [f.db,f.databases.admin])db.prepare('DELETE FROM lesson_media_links WHERE asset_id=?').run(revoked);
  await f.tick();assert.equal(f.db.prepare("SELECT count(*) n FROM note_retention_items WHERE state='WARNED'").get().n,3,'stale accepted links cannot restore revoked live links');
  assert(!f.db.prepare('SELECT 1 FROM note_retention_items WHERE ref_id=?').get(revoked));
  const lesson=f.databases.admin.prepare('SELECT lesson_id FROM lesson_media_links WHERE asset_id=?').get(promoted).lesson_id;
  for(const db of [f.db,f.databases.admin])db.prepare("UPDATE lesson_media_lessons SET media_scope='COURSE' WHERE lesson_id=?").run(lesson);
  await acceptFixtureSetup(f.env,await f.actor('global'),[f.scopes.programA]);
  for(let i=0;i<3;i++)await f.tick(8+i/24);
  assert.equal(f.db.prepare('SELECT state FROM note_retention_items WHERE ref_id=?').get(promoted).state,'EXEMPT','purge rechecks current accepted Course promotion after warning');
  assert(f.bytes.has(seeded.uniqueKey));for(const key of seeded.sharedKeys)assert(f.bytes.has(key));
 }finally{f.close();}
});
