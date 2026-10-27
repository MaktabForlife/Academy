import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {mp4} from './fixtures/academy-session-video-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {actorProof,verifyActor,verifyActorVersion} from '../src/academy/separation/proof.js';
import {academyDate} from '../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const op=()=>crypto.randomUUID();
test('split Core grants, cached permissions, historical publication and retained recordings enforce paid months',async()=>{
 const f=await splitVideoFixture();try{
  const core=f.databases.core,scope=f.scopes.programA;
  core.exec(readFileSync(new URL('../migrations/academy-core/0006_program_monthly_subscriptions.sql',import.meta.url),'utf8'));
  for(const db of Object.values(f.databases))db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',scope);
  f.source.env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';
  const admin=await f.source.actor('global'),student=await f.source.login('0002');
  const monthly=(action,input)=>f.request('/api/admin/platform/program-monthly-subscriptions/'+action,{activityKey:scope,...input},admin);
  ok(await monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()}));
  ok(await monthly('grid-save',{policyRevision:1,operationId:op(),entries:['2024-01','2025-01'].map(month=>({accountId:'account-0002',month,subscribed:true,revision:0,classIds:['class-1']}))}));
  const grid=ok(await monthly('grid',{years:[2024,2025,2026],search:'0002'}));
  assert.deepEqual(Object.keys(grid.students[0].months).sort(),['2024-01','2025-01'],'Cross-year grid grants are read from authoritative Core');
  ok(await monthly('configure',{mode:'activate',policyRevision:2,reviewed:true,operationId:op()}));
  const made=ok(await f.request('historical-create',{activityKey:scope,date:'2024-01-16',title:'Tafseer January 2024',classIds:['class-1'],operationId:op()},admin));
  const start=ok(await f.request('video-start',{lessonId:made.lessonId,revision:1,filename:'archive.mp4',size:mp4.length,operationId:op()},admin));
  const part=ok(await f.request('video-part?metadata='+encodeURIComponent(JSON.stringify({lessonId:made.lessonId,uploadToken:start.uploadToken,partNumber:1})),{},admin,'ADMIN',mp4));
  const uploaded=ok(await f.request('video-complete',{lessonId:made.lessonId,uploadToken:start.uploadToken,parts:[{partNumber:1,etag:part.etag}]},admin));
  for(const db of Object.values(f.databases))db.prepare('UPDATE lesson_media_assets SET created_at=? WHERE asset_id=?').run('2024-01-01T00:00:00Z',uploaded.assetId);
  const pdfBytes=Buffer.from('%PDF-1.4\n% historical Tafseer PDF\n%%EOF'),pdfInput={lessonId:made.lessonId,revision:2,filename:'historical.pdf',size:pdfBytes.length,sha256:createHash('sha256').update(pdfBytes).digest('hex'),operationId:op()};
  const pdf=ok(await f.request('upload?metadata='+encodeURIComponent(JSON.stringify(pdfInput)),{},admin,'ADMIN',pdfBytes));
  ok(await f.request('save',{lessonId:made.lessonId,revision:3,title:'Tafseer January 2024',summary:'',state:'PUBLISHED',commentsClosed:true,videos:[],operationId:op()},admin));
  assert.equal(ok(await f.request('list',{activityKey:scope,month:'2024-01'},student,'LEARN')).lessons.length,0,'Draft setup stays private before explicit acceptance');
  await f.accept(admin,scope);
  core.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=? AND role='STUDENT'").run(scope);
  const row=ok(await f.request('/api/academy/monthly-media/list',{activityKey:scope,month:'2024-01'},student,'LEARN')).lessons[0];assert.equal(row.id,made.lessonId);assert(row.assets[0].retained);
  const watch=ok(await f.request('watch',{lessonId:made.lessonId,assetId:uploaded.assetId},student,'LEARN'));
  const pdfResponse=await worker.fetch(new Request('http://localhost/api/academy/lesson-media/download',{method:'POST',headers:{Authorization:'Bearer '+student,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify({lessonId:made.lessonId,assetId:pdf.assetId})}),f.source.env);assert.equal(pdfResponse.status,200);
  // Age the live Core object metadata without changing the immutable accepted attachment definition.
  const objectKey=core.prepare('SELECT object_key FROM lesson_media_assets WHERE asset_id=?').get(uploaded.assetId).object_key;assert(objectKey.startsWith('dev-split-v1/retained-program-recordings/'));
  const bytes=f.source.env.LESSON_MEDIA_BUCKET.objects.get(objectKey);bytes.uploaded=new Date('2024-01-01T00:00:00Z');
  assert.equal((await worker.fetch(new Request('http://localhost'+watch.playbackPath,{headers:{Range:'bytes=4-11'}}),f.source.env)).status,206);
  const repo=academyD1Repository(f.source.env),auth=await authenticatedD1Account(new Request('http://localhost/api/academy/monthly-media/months',{headers:{Authorization:'Bearer '+student,'X-Academy-Workspace':'LEARN'}}),f.source.env,repo),proof=actorProof(auth),version=await verifyActor(f.core,proof);
  assert(auth.state.contexts.some(c=>c.role==='MEDIA_READER'&&c.mediaOnly&&c.courseId===scope.slice(8)));assert.equal(auth.state.roles.some(r=>r.activity_key===scope&&r.role==='STUDENT'),false);
  const current=ok(await monthly('get',{month:'2024-01'})),entry=current.students.find(s=>s.accountId==='account-0002');
  ok(await monthly('save',{month:'2024-01',policyRevision:current.policy.revision,operationId:op(),entries:[{accountId:entry.accountId,subscribed:false,revision:entry.revision,classIds:entry.classIds,note:'Correct mistaken month'}]}));
  await assert.rejects(()=>verifyActor(f.core,proof),/permissions changed/);await assert.rejects(()=>verifyActorVersion(f.core,proof,version),/permissions changed/);
  const denied=await worker.fetch(new Request('http://localhost'+watch.playbackPath),f.source.env);assert([401,403].includes(denied.status));
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});

test('teacher note PDFs and timetable indicators use the same month gate, including direct downloads',async()=>{
 const f=await splitVideoFixture();try{
  const scope=f.scopes.programA,core=f.databases.core;
  core.exec(readFileSync(new URL('../migrations/academy-core/0006_program_monthly_subscriptions.sql',import.meta.url),'utf8'));
  for(const db of Object.values(f.databases))db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',scope);
  f.source.env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';
  const admin=await f.source.actor('global'),teacher=await f.source.login('0003'),student=await f.source.login('0002'),date=academyDate(new Date(),'Africa/Johannesburg');
  const session=ok(await f.request('sessions',{activityKey:scope,startDate:date,endDate:date},teacher,'TEACH')).sessions.find(s=>s.classIds.includes('class-1'));assert(session);
  const monthly=(action,input)=>f.request('/api/admin/platform/program-monthly-subscriptions/'+action,{activityKey:scope,...input},admin);
  ok(await monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()}));
  ok(await monthly('save',{month:(Number(date.slice(0,4))-1)+'-01',policyRevision:1,operationId:op(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['class-1']}]}));
  ok(await monthly('configure',{mode:'activate',policyRevision:2,reviewed:true,operationId:op()}));
  const bytes=Buffer.from('%PDF-1.4\n% monthly teacher note fixture\n%%EOF'),metadata={activityKey:scope,startDate:date,endDate:date,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,filename:'note.pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),operationId:op()};
  const posted=ok(await f.request('note-upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},teacher,'TEACH',bytes));
  const before=ok(await f.request('feed',{activityKey:scope},student,'LEARN'));assert(!before.lessons.some(l=>l.assets.some(a=>a.id===posted.versionId)));
  const request=async(input)=>worker.fetch(new Request('http://localhost/api/academy/lesson-media/download',{method:'POST',headers:{Authorization:'Bearer '+student,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify(input)}),f.source.env);
  const note=core.prepare('SELECT container_id FROM lesson_note_entries WHERE note_id=?').get(posted.noteId),input={lessonId:note.container_id,assetId:posted.versionId};
  assert.equal((await request({...input,date:(Number(date.slice(0,4))-1)+'-01-01'})).status,403,'A supplied payment-month date cannot change the trusted session date');
  const refs={sessions:[{activityKey:scope,sessionKey:session.sessionKey}]};assert.equal(ok(await f.request('timetable',refs,student,'LEARN')).lessons.length,0);
  ok(await monthly('save',{month:date.slice(0,7),policyRevision:3,operationId:op(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['class-1']}]}));
  assert.equal((await request(input)).status,200);assert(ok(await f.request('timetable',refs,student,'LEARN')).lessons.some(l=>l.assets.some(a=>a.id===posted.versionId)));
  const archive=ok(await f.request('/api/academy/monthly-media/list',{activityKey:scope,month:date.slice(0,7)},student,'LEARN'));assert(archive.lessons.some(l=>l.assets.some(a=>a.id===posted.versionId)),'The paid-month archive includes Teacher PDF notes as well as official attachments');
 }finally{f.close();}
});
