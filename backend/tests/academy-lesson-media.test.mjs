import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {youtubeId,MOU_MEDIA_PROGRAM} from '../src/academy/d1/lesson-media.js';
import {historicalPublications} from '../src/academy/d1/historical-timetable.js';
import {publicationRecord,publicationSchedule} from '../src/programs/weekly-timetable.js';
import {readFileSync} from 'node:fs';
const use=fn=>async()=>{const f=await mediaFixture();try{await fn(f);}finally{f.db.close();}},op=()=>({operationId:crypto.randomUUID()}),id='MOU-20261006';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const save=(input={})=>({...op(),lessonId:id,revision:1,title:'Tarteel & Tadabbur',summary:'',recordingUrl:'https://youtu.be/9IuTDcSs6vQ',state:'PUBLISHED',commentsClosed:false,...input});
test('current learners and authorised admins can view recordings; unrelated teachers remain scoped',use(async f=>{
 const student=await f.login('0002'),admin=await f.login('0001'),teacher=await f.login('0003'),other=await f.login('0005');
 const list=ok(await f.media('list',{},student));assert.equal(list.lessons.length,3);assert.equal(list.canView,true);assert.equal(list.canManage,false);assert.doesNotMatch(JSON.stringify(list),/youtube|youtu\.be|9IuTDcSs6vQ|object_key/);
 assert.match(ok(await f.media('watch',{lessonId:id,assetId:'video-6'},student)).embedUrl,/youtube-nocookie/);
 assert.match(ok(await f.media('watch',{lessonId:id,assetId:'video-6'},admin)).embedUrl,/youtube-nocookie/);
 assert.equal((await f.media('watch',{lessonId:id,assetId:'video-6'},teacher)).status,200);assert.equal((await f.media('watch',{lessonId:id,assetId:'video-6'},other)).status,403);
 assert.equal((await f.media('list')).status,401);assert.equal((await f.media('get',{lessonId:id},student)).status,403);
 assert.equal(ok(await f.media('get',{lessonId:id},teacher)).assets[0].url,'https://youtu.be/9IuTDcSs6vQ');
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(MOU_MEDIA_PROGRAM);
 assert.ok([401,403].includes((await f.media('watch',{lessonId:id,assetId:'video-6'},student)).status));
 assert.ok([401,403].includes((await f.media('comments',{lessonId:id},student)).status));
}));
test('disabled accounts, reset credentials, revoked sessions and hidden lessons cannot view cached media',use(async f=>{
 const student=await f.login('0002'),admin=await f.login('0001');
 ok(await f.media('save',save({state:'HIDDEN'}),admin));assert.equal((await f.media('watch',{lessonId:id,assetId:'video-6'},student)).status,403);assert.equal(ok(await f.media('list',{},student)).lessons.length,2);
 f.db.prepare("UPDATE account_sessions SET revoked_at='2026-10-10T00:00:00Z' WHERE account_id='account-0002'").run();assert.equal((await f.media('list',{},student)).status,401);
 const next=await f.login('0008');f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0008'").run();assert.equal((await f.media('list',{},next)).status,401);
 const teacher=await f.login('0003');f.db.prepare("UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id='account-0003'").run();assert.equal((await f.media('get',{lessonId:id},teacher)).status,401);
}));
test('only assigned teachers and scoped/global admins can manage; teaching directory is not authority',use(async f=>{
 const admin=await f.login('0001'),scoped=await f.login('0004'),teacher=await f.login('0003'),unassigned=await f.login('0006'),other=await f.login('0005');
 assert.equal(ok(await f.media('list',{},unassigned)).lessons.length,3);assert.equal((await f.media('save',save(),unassigned)).status,403);assert.equal((await f.media('save',save(),other)).status,403);
 ok(await f.media('save',save(),scoped));ok(await f.media('save',save({revision:2,summary:'Reviewed notes'}),teacher));ok(await f.media('save',save({revision:3}),admin));
 f.db.prepare("UPDATE activities SET lifecycle='ARCHIVED' WHERE activity_key=?").run(MOU_MEDIA_PROGRAM);assert.equal((await f.media('list',{},admin)).status,403);
}));
test('student comments wait for approval; own edits return to review and staff reply immediately',use(async f=>{
 const student=await f.login('0002'),peer=await f.login('0008'),teacher=await f.login('0003');
 const input={...op(),lessonId:id,body:'A useful lesson <script>alert(1)</script>'},posted=ok(await f.media('comment-save',input,student));assert.equal(posted.state,'PENDING');
 assert.equal(ok(await f.media('comment-save',input,student)).replayed,true);assert.equal(ok(await f.media('comments',{lessonId:id},student)).comments.length,1);assert.equal(ok(await f.media('comments',{lessonId:id},peer)).comments.length,0);
 assert.equal((await f.media('comment-moderate',{...op(),lessonId:id,commentId:posted.commentId,revision:1,decision:'APPROVE'},peer)).status,403);
 ok(await f.media('comment-moderate',{...op(),lessonId:id,commentId:posted.commentId,revision:1,decision:'APPROVE'},teacher));assert.equal(ok(await f.media('comments',{lessonId:id},peer)).comments.length,1);
 const reply=ok(await f.media('comment-save',{...op(),lessonId:id,parentId:posted.commentId,body:'Thank you for your question.'},teacher));assert.equal(reply.state,'APPROVED');
 ok(await f.media('comment-save',{...op(),lessonId:id,commentId:posted.commentId,revision:2,body:'Updated question'},student));assert.equal(ok(await f.media('comments',{lessonId:id},peer)).comments.some(c=>c.id===posted.commentId),false);
 assert.equal((await f.media('comment-save',{...op(),lessonId:'MOU-20261007',parentId:reply.commentId,body:'Cross-lesson reply'},peer)).status,400);
 assert.equal((await f.media('comment-save',{...op(),lessonId:id,commentId:reply.commentId,revision:1,body:'Hijack'},peer)).status,403);
}));
test('moderation revisions, pinned comments, deletion and closing discussions are enforced',use(async f=>{
 const student=await f.login('0002'),admin=await f.login('0001'),teacher=await f.login('0003');
 const c=ok(await f.media('comment-save',{...op(),lessonId:id,body:'Question'},student));
 ok(await f.media('comment-moderate',{...op(),lessonId:id,commentId:c.commentId,revision:1,decision:'APPROVE'},admin));
 assert.equal((await f.media('comment-moderate',{...op(),lessonId:id,commentId:c.commentId,revision:1,decision:'HIDE'},admin)).status,409);
 ok(await f.media('comment-moderate',{...op(),lessonId:id,commentId:c.commentId,revision:2,decision:'PIN'},admin));assert.equal(ok(await f.media('comments',{lessonId:id},student)).comments[0].pinned,true);
 ok(await f.media('comment-moderate',{...op(),lessonId:id,commentId:c.commentId,revision:3,decision:'DELETE'},student));assert.equal(ok(await f.media('comments',{lessonId:id},student)).comments.length,0);
 ok(await f.media('save',save({commentsClosed:true}),teacher));assert.equal((await f.media('comment-save',{...op(),lessonId:id,body:'Closed'},student)).status,409);
 ok(await f.media('comment-save',{...op(),lessonId:id,body:'Staff announcement'},teacher));
}));
test('media saves are idempotent, conflicting saves preserve the winning entry, failure rolls back',use(async f=>{
 const admin=await f.login('0001'),input=save({summary:'First'});ok(await f.media('save',input,admin));assert.equal(ok(await f.media('save',input,admin)).replayed,true);
 assert.equal((await f.media('save',{...input,summary:'Different'},admin)).status,409);assert.equal((await f.media('save',save({summary:'Stale'}),admin)).status,409);
 f.db.exec("CREATE TRIGGER fail_media BEFORE UPDATE ON lesson_media_lessons BEGIN SELECT RAISE(ABORT,'synthetic media failure'); END;");
 assert.equal((await f.media('save',save({revision:2,summary:'Rejected'}),admin)).status,503);assert.equal(f.db.prepare('SELECT summary FROM lesson_media_lessons WHERE lesson_id=?').get(id).summary,'First');
 assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
}));
test('private PDF uploads, download scope, removed attachments and lost-response retries',use(async f=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),other=await f.login('0005');
 const uploaded=await f.mediaUpload({},teacher),asset=ok(uploaded).assetId;assert.equal((await f.mediaUpload(uploaded.metadata,teacher)).body.replayed,true);assert.equal(f.objects.size,1);
 const download=await f.media('download',{lessonId:id,assetId:asset},student);assert.equal(download.status,200);assert.match(download.body,/%PDF/);assert.equal(download.headers.get('cache-control'),'private, no-store');
 assert.equal((await f.media('download',{lessonId:id,assetId:asset},other)).status,403);assert.equal((await f.media('download',{lessonId:'MOU-20261007',assetId:asset},student)).status,404);
 ok(await f.media('attachment-remove',{...op(),lessonId:id,assetId:asset,revision:2},teacher));assert.equal((await f.media('download',{lessonId:id,assetId:asset},student)).status,404);
 assert.equal((await f.mediaUpload({revision:3},student)).status,403);
 assert.equal((await f.mediaUpload({revision:3},teacher,Buffer.from('not a PDF'))).status,400);
 const size=f.objects.size;f.db.exec("CREATE TRIGGER fail_media_file BEFORE INSERT ON lesson_media_assets BEGIN SELECT RAISE(ABORT,'synthetic file failure'); END;");assert.equal((await f.mediaUpload({revision:3},teacher)).status,503);assert.equal(f.objects.size,size+1);
}));
test('YouTube links accept supported secure formats and reject foreign hosts or malformed IDs',()=>{
 for(const url of ['https://youtu.be/9IuTDcSs6vQ?si=test','https://www.youtube.com/watch?v=9IuTDcSs6vQ','https://youtube.com/embed/9IuTDcSs6vQ'])assert.equal(youtubeId(url),'9IuTDcSs6vQ');
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=9IuTDcSs6vQ','http://youtu.be/9IuTDcSs6vQ','https://user:pass@youtu.be/9IuTDcSs6vQ','https://youtu.be/no'])assert.throws(()=>youtubeId(url));
});
test('bounded historical projection adds 6–7 October and leaves every later publication unchanged',use(async f=>{
 const base=f.db.prepare("SELECT * FROM timetable_publications WHERE pattern='WEEKLY' LIMIT 1").get(),snapshot=JSON.parse(base.snapshot_json);snapshot.programId=MOU_MEDIA_PROGRAM.slice(8);snapshot.effectiveFrom='2026-10-08';delete snapshot.endDate;
 f.db.prepare('INSERT INTO timetable_publications VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(MOU_MEDIA_PROGRAM,'MOU-PUB','WEEKLY',1,'WEEKLY','2026-10-01','account-0001','2026-10-08',null,'Africa/Johannesburg',JSON.stringify(snapshot),'0'.repeat(64),'EXACT');
 f.db.prepare('INSERT INTO program_historical_extensions VALUES(?,?,?,?,?,?,?)').run('MOU-HISTORY',MOU_MEDIA_PROGRAM,'MOU-PUB','2026-10-06','2026-10-07','Confirmed history','2026-10-12');
 const db={prepare:sql=>({bind:(...values)=>({all:async()=>({results:f.db.prepare(sql).all(...values)})}),first:async()=>f.db.prepare(sql).get()})};
 const extra=await historicalPublications({db},'2026-10-06','2026-10-12'),program={id:snapshot.programId},original=publicationRecord({PublicationID:'MOU-PUB',VersionNo:1,SnapshotJSON:JSON.stringify(snapshot)},program),historical=extra.map(p=>publicationRecord({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json},program));
 assert(!Object.hasOwn(extra[0],'teacher_accounts_json'));
 const teacher=snapshot.rules[0].teacherIds[0];f.db.prepare('UPDATE accounts SET display_name=? WHERE account_id=?').run('Renamed historical teacher',teacher);
 const signedExtra=await historicalPublications({db},'2026-10-06','2026-10-12',true);
 assert(JSON.parse(signedExtra[0].teacher_accounts_json).some(a=>a.account_id===teacher&&a.display_name==='Renamed historical teacher'));
 assert.equal(publicationSchedule([original,...historical],'2026-10-06').currentPublicationId,'MOU-HISTORY');assert.equal(publicationSchedule([original,...historical],'2026-10-07').currentPublicationId,'MOU-HISTORY');
 for(let day=8;day<=31;day++){const date=`2026-10-${String(day).padStart(2,'0')}`;assert.deepEqual(publicationSchedule([original,...historical],date).publications.find(p=>p.id==='MOU-PUB'),publicationSchedule([original],date).publications[0]);}
 assert.equal(f.db.prepare("SELECT snapshot_json FROM timetable_publications WHERE publication_id='MOU-PUB'").get().snapshot_json,JSON.stringify(snapshot));assert.equal((await historicalPublications({db},'2026-10-09','2026-10-15')).length,0);
}));
test('frontend keeps recording links out of cached metadata and resets protected views on session changes',()=>{
 const js=readFileSync(new URL('../../js/m4l-lesson-media.js',import.meta.url),'utf8');assert.doesNotMatch(js,/setInterval|localStorage\.setItem|sessionStorage\.setItem/);assert.match(js,/m4l-academy-session-ended/);assert.match(js,/URL\.revokeObjectURL/);assert.match(js,/generation/);
});

test('admin learner media preview hides management controls and unpublished content without assigning Student',use(async f=>{
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 const admin=await f.login('0001'),scoped=await f.login('0004'),other=await f.login('0005'),student=await f.login('0002');
 const roles=f.db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all();
 ok(await f.media('save',save({state:'HIDDEN'}),admin));
 ok(await f.media('comment-save',{...op(),lessonId:'MOU-20261007',body:'Private pending question'},student));
 for(const token of [admin,scoped]){
  const list=ok(await f.media('list',{view:'learner'},token));
  assert.equal(list.learnerPreview,true);assert.equal(list.canManage,false);assert.equal(list.canView,true);
  assert.equal(list.lessons.length,2);assert.ok(list.lessons.every(l=>!l.canManage&&l.canView));
  assert.equal((await f.media('watch',{lessonId:id,assetId:'video-6'},token)).status,403);
  const comments=ok(await f.media('comments',{lessonId:'MOU-20261007',view:'learner'},token));assert.equal(comments.canManage,false);assert.equal(comments.comments.length,0);
 }
 assert.equal((await f.media('list',{view:'learner'},other)).status,403);
 assert.deepEqual(f.db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),roles);
}));

test('an uncertain commit acknowledgement retains the accepted private object for original-operation recovery',use(async f=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),original=f.env.ACADEMY_DB,session=original.withSession('first-primary');let loseCommit=true,failReceipt=false;
 const wrapped={...session,prepare(sql){const statement=session.prepare(sql);if(!sql.includes('FROM operation_receipts'))return statement;const wrap=stmt=>({...stmt,bind:(...v)=>wrap(stmt.bind(...v)),first:async(...args)=>{if(failReceipt){failReceipt=false;throw Error('synthetic receipt connection loss');}return stmt.first(...args);}});return wrap(statement);},async batch(statements){const result=await session.batch(statements);if(loseCommit&&statements.some(s=>s.sql.includes('INSERT INTO lesson_media_assets'))){loseCommit=false;failReceipt=true;throw Error('synthetic lost acknowledgement after commit');}return result;}};
 f.env.ACADEMY_DB={...original,withSession:()=>wrapped};const uploaded=await f.mediaUpload({},teacher);assert.equal(uploaded.status,503);f.env.ACADEMY_DB=original;
 const asset=f.db.prepare("SELECT a.* FROM lesson_media_assets a JOIN lesson_media_links l USING(asset_id) WHERE l.lesson_id=? AND a.kind='PDF'").get(id);assert(asset);assert(f.objects.has(asset.object_key));
 const retried=ok(await f.mediaUpload(uploaded.metadata,teacher));assert.equal(retried.assetId,asset.asset_id);assert.equal(retried.replayed,true);assert.equal(f.objects.size,1);assert.equal((await f.media('download',{lessonId:id,assetId:asset.asset_id},student)).status,200);
}));

test('one editor save renames PDFs, removes chosen links and updates videos atomically while preserving stored bytes',use(async f=>{
 const admin=await f.login('0001');const first=ok(await f.mediaUpload({lessonId:id,revision:1,name:'First PDF'},admin)),second=ok(await f.mediaUpload({lessonId:id,revision:2,name:'Second PDF'},admin));
 const objects=[...f.objects.keys()],body=save({revision:3,title:'Updated attachment editor',summary:'One saved change',videos:[{name:'Named recording',url:'https://youtu.be/9IuTDcSs6vQ'}],attachmentNames:[{assetId:first.assetId,name:'Renamed PDF'}],removeAssetIds:[second.assetId]});
 const saved=ok(await f.media('save',body,admin));assert.equal(ok(await f.media('save',body,admin)).replayed,true);
 const detail=ok(await f.media('get',{lessonId:id},admin));assert.equal(detail.lesson.revision,4);assert.equal(detail.lesson.title,body.title);assert.equal(detail.assets.find(a=>a.id===first.assetId).name,'Renamed PDF');assert(!detail.assets.some(a=>a.id===second.assetId));assert.equal(detail.assets.find(a=>a.kind==='YOUTUBE').name,'Named recording');assert.deepEqual([...f.objects.keys()],objects);assert.equal(saved.revision,4);
}));
test('combined editor save rejects foreign PDF identities and rolls back metadata when a later statement fails',use(async f=>{
 const admin=await f.login('0001'),first=ok(await f.mediaUpload({lessonId:id,revision:1,name:'Unchanged'},admin)),foreign=ok(await f.mediaUpload({lessonId:'MOU-20261007',revision:1},admin));
 const body=save({revision:2,title:'Atomic editor',attachmentNames:[{assetId:first.assetId,name:'Must roll back'}],removeAssetIds:[]});
 assert.equal((await f.media('save',{...body,attachmentNames:[{assetId:foreign.assetId,name:'Forbidden'}]},admin)).status,404);
 f.db.exec("CREATE TRIGGER fail_editor_title BEFORE UPDATE OF title ON lesson_media_lessons BEGIN SELECT RAISE(ABORT,'synthetic editor failure'); END;");assert.equal((await f.media('save',body,admin)).status,503);
 let detail=ok(await f.media('get',{lessonId:id},admin));assert.equal(detail.lesson.revision,2);assert.equal(detail.assets.find(a=>a.id===first.assetId).name,'Unchanged');
 f.db.exec('DROP TRIGGER fail_editor_title');ok(await f.media('save',body,admin));detail=ok(await f.media('get',{lessonId:id},admin));assert.equal(detail.assets.find(a=>a.id===first.assetId).name,'Must roll back');assert.equal(detail.lesson.title,'Atomic editor');
}));
