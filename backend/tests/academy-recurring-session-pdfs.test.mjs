import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import worker from '../src/academy-runtime.js';import {separationFixture} from './fixtures/academy-separation-fixture.mjs';import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()});
async function use(run){const f=await separationFixture();try{
 for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql','0036_class_notes.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
 await initialiseAcceptedSetup(f.env.ACADEMY_DB);Object.assign(f.env,{ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'});
 f.day=academyDate(new Date(),'Africa/Johannesburg');f.area=f.scopes.programA;const tokens={admin:await f.actor('global'),teacher:await f.login('0003'),otherTeacher:await f.login('0006'),student:await f.login('0002')};
 f.send=async(action,input={},who='teacher',bytes)=>{const path=action.startsWith('/')?action:'/api/academy/lesson-media/'+action,response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':who==='admin'?'ADMIN':who==='student'?'LEARN':'TEACH',...(!bytes?{'Content-Type':'application/json'}:{})},body:bytes||JSON.stringify({activityKey:f.area,...input})}),f.env);return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};};
 f.tokens=tokens;f.calendar=(day=f.day,who='teacher')=>f.send('calendar',{startDate:day,endDate:day},who);
 f.session=async(day=f.day)=>ok(await f.calendar(day)).sessions.find(s=>s.canContribute);
 f.upload=async(session,extra={},who='teacher')=>{const bytes=Buffer.from('%PDF-1.4\n% '+(extra.label||'session resource')+'\n%%EOF'),metadata={...op(),activityKey:f.area,startDate:session.date,endDate:session.date,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,filename:'session.pdf',name:'Shared session PDF',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...extra};return f.send('note-upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,bytes);};
 f.publish=async(edit,date=nextDate(f.day))=>{const old=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=? ORDER BY version_no DESC LIMIT 1').get(f.area),snapshot=JSON.parse(old.snapshot_json);edit(snapshot);snapshot.effectiveFrom=date;const row={...old,publication_id:crypto.randomUUID(),version_no:old.version_no+1,effective_from:date,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(row);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));f.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(row.publication_id,f.area);await acceptFixtureSetup(f.env,tokens.admin,[f.area]);};
 await run(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}}
const resource=(view,id)=>view.sessions.find(s=>s.media?.assets.some(a=>a.id===id));
test('one recurring file is reused across accepted occurrences while this-lesson PDFs stay dated',()=>use(async f=>{
 const session=await f.session(),once=ok(await f.upload(session)),shared=ok(await f.upload(session,{attachmentScope:'RECURRING'}));
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,2);
 const now=ok(await f.calendar(f.day,'student')),future=ok(await f.calendar(nextDate(f.day,7),'student'));assert(resource(now,once.versionId));assert(resource(now,shared.versionId));assert(!resource(future,once.versionId));const row=resource(future,shared.versionId);assert(row);assert.equal(row.media.assets.find(a=>a.id===shared.versionId).attachmentScope,'RECURRING');
 ok(await f.send('download',{lessonId:row.media.id,assetId:shared.versionId,sessionKey:row.sessionKey,date:row.date},'student'));assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,2);
 const forged=ok(await f.send('timetable',{sessions:[{activityKey:f.area,sessionKey:JSON.stringify(['PROGRAM',nextDate(f.day,7),'another-rule@1']),recurringKey:JSON.stringify(['RECURRING','PROGRAM','RULE-shared'])}]},'student'));assert(!forged.lessons.some(r=>r.assets.some(a=>a.id===shared.versionId)));
}));
test('an author replaces or withdraws one recurring resource for all occurrences and retains immutable history',()=>use(async f=>{
 const original=ok(await f.upload(await f.session(),{attachmentScope:'RECURRING'})),future=await f.session(nextDate(f.day,7)),updated=ok(await f.upload(future,{attachmentScope:'RECURRING',noteId:original.noteId,revision:1,label:'replacement'}));
 assert.notEqual(updated.versionId,original.versionId);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_entries').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,2);
 for(const day of [f.day,nextDate(f.day,7)]){const view=ok(await f.calendar(day,'student'));assert(resource(view,updated.versionId));assert(!resource(view,original.versionId));}
 assert.equal((await f.upload(future,{attachmentScope:'LESSON',noteId:original.noteId,revision:2})).status,403);
 ok(await f.send('note-withdraw',{...op(),noteId:original.noteId,revision:2,startDate:future.date,endDate:future.date,sessionKey:future.sessionKey,sessionVersion:future.sessionVersion}));assert(!resource(ok(await f.calendar(future.date,'student')),updated.versionId));assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,2);
}));
test('unassigned teachers cannot read metadata or bytes and lose contribution rights after revocation',()=>use(async f=>{
 const posted=ok(await f.upload(await f.session(),{attachmentScope:'RECURRING'})),student=resource(ok(await f.calendar(f.day,'student')),posted.versionId),other=await f.calendar(f.day,'otherTeacher');
 if(other.status===200)assert(!resource(other.body,posted.versionId));else assert([401,403].includes(other.status));assert([401,403].includes((await f.send('download',{lessonId:student.media.id,assetId:posted.versionId,sessionKey:student.sessionKey,date:student.date},'otherTeacher')).status));
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0003' AND activity_key=?").run(f.area);assert([401,403].includes((await f.send('download',{lessonId:student.media.id,assetId:posted.versionId,sessionKey:student.sessionKey,date:student.date})).status));
}));
test('republishing labels or clock times keeps the binding, while a different module or class does not inherit the PDF',()=>use(async f=>{
 const posted=ok(await f.upload(await f.session(),{attachmentScope:'RECURRING'})),future=nextDate(f.day,7);
 await f.publish(s=>{s.rules[0].moduleName='Renamed visible label';s.rules[0].startTime='09:00';s.rules[0].endTime='10:00';});assert(resource(ok(await f.calendar(future,'student')),posted.versionId));
 await f.publish(s=>{s.rules[0].moduleId='a-different-accepted-identity';});assert(!resource(ok(await f.calendar(future,'student')),posted.versionId));
}));
test('a teacher change preserves the recurring PDF for the new teacher but ends the former teacher’s future contribution rights',()=>use(async f=>{
 f.tokens.otherTeacher=await f.actor('teacherA');const original=await f.session(),posted=ok(await f.upload(original,{attachmentScope:'RECURRING'})),future=nextDate(f.day,7);f.db.prepare('DELETE FROM class_teacher_assignments WHERE activity_key=? AND account_id=?').run(f.area,'account-0003');
 await f.publish(s=>{s.rules[0].teacherId=f.actors.teacherA;s.rules[0].teacherIds=[f.actors.teacherA];s.rules[0].teacherNames=['New assigned teacher'];});
 const view=ok(await f.calendar(future,'otherTeacher')),row=resource(view,posted.versionId);assert(row);ok(await f.send('download',{lessonId:row.media.id,assetId:posted.versionId,sessionKey:row.sessionKey,date:row.date},'otherTeacher'));
 assert(!resource(ok(await f.calendar(future)),posted.versionId));assert.equal((await f.upload(original,{attachmentScope:'RECURRING',noteId:posted.noteId,revision:1})).status,403);
 assert.equal((await f.send('note-withdraw',{...op(),noteId:posted.noteId,revision:1,startDate:original.date,endDate:original.date,sessionKey:original.sessionKey,sessionVersion:original.sessionVersion})).status,403);
 assert.equal((await f.upload(row,{attachmentScope:'RECURRING',noteId:posted.noteId,revision:1},'otherTeacher')).status,403,'A new Teacher cannot replace another author’s file');
}));
test('a Course resource follows the accepted source session when rescheduled and remains isolated from another source session',()=>use(async f=>{
 f.area='COURSE:subject-1';for(const [id,role]of [['account-0003','TEACHER'],['account-0002','STUDENT']])f.db.prepare("INSERT OR IGNORE INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('course-recurring-'+id,id,f.area,role);
 let publication=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=?').get(f.area);const snapshot=JSON.parse(publication.snapshot_json);
 const publish=async()=>{const previous=publication.publication_id;publication={...publication,publication_id:crypto.randomUUID(),version_no:publication.version_no+1,effective_from:f.day};snapshot.publication.PublicationID=publication.publication_id;publication.snapshot_json=JSON.stringify(snapshot);const cols=Object.keys(publication);f.db.prepare('INSERT INTO timetable_publications('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(publication));
  for(const table of ['published_lessons','published_lesson_teachers'])for(const old of f.db.prepare('SELECT * FROM '+table+' WHERE publication_id=?').all(previous)){const row={...old,publication_id:publication.publication_id};if(table==='published_lessons')row.lesson_date=snapshot.sessions[0].SessionDate;const columns=Object.keys(row);f.db.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));}
  f.db.prepare('UPDATE course_run_state SET current_publication_id=? WHERE activity_key=?').run(publication.publication_id,f.area);await acceptFixtureSetup(f.env,await f.actor('global'),[f.area]);};
 snapshot.sessions[0].SessionDate=f.day;await publish();
 const session=await f.session();assert(session);const posted=ok(await f.upload(session,{attachmentScope:'RECURRING'}));
 snapshot.sessions[0].SessionDate=nextDate(f.day,7);snapshot.sessions[0].StartTime='09:00';await publish();
 const moved=resource(ok(await f.calendar(nextDate(f.day,7),'student')),posted.versionId);assert(moved);ok(await f.send('download',{lessonId:moved.media.id,assetId:posted.versionId,sessionKey:moved.sessionKey,date:moved.date},'student'));assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,1);
 snapshot.sessions[0].SourceSessionID='different-source-session';await publish();assert(!resource(ok(await f.calendar(nextDate(f.day,7),'student')),posted.versionId));
}));
test('the ten-PDF limit combines dated and recurring resources and checks every occurrence before adding a recurring PDF',()=>use(async f=>{
 const session=await f.session(),future=await f.session(nextDate(f.day,7));for(let i=0;i<9;i++)ok(await f.upload(future,{label:'dated-'+i}));const shared=ok(await f.upload(session,{attachmentScope:'RECURRING'}));
 assert.equal((await f.upload(future)).body.code,'MEDIA_PDF_LIMIT');assert.equal((await f.upload(session,{attachmentScope:'RECURRING'})).body.code,'MEDIA_PDF_LIMIT');ok(await f.upload(future,{attachmentScope:'RECURRING',noteId:shared.noteId,revision:1,label:'replacement at cap'}));assert.equal(f.db.prepare("SELECT count(*) n FROM lesson_note_entries WHERE state='ACTIVE'").get().n,10);
}));
