import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {nextDate,academyDate} from '../src/academy/d1/academy-clock.js';
import {seedClassNotes} from './fixtures/academy-class-notes-fixture.mjs';

async function use(fn,seed=seedClassNotes){const f=await classNotesFixture(seed);try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.close();}}
async function view(f,service){const {sources}=await service.run('sessions',{activityKey:f.scopes.programA,date:f.today});const source=sources.find(r=>r.classId==='class-1'&&r.startTime==='10:00');assert(source);return service.run('get',{activityKey:source.activityKey,source});}
test('multiple class notes preserve long text, next matching session, author and idempotent retry',()=>use(async f=>{
 const service=await f.notes('LEARN','original-student'),data=await view(f,service);assert.equal(data.nextDue.date,nextDate(f.today));assert.equal(data.nextDue.target.startTime,'10:00');
 const input=f.post(data),made=await service.run('post',input);assert.equal((await service.run('post',input)).replayed,true);await service.run('post',{...input,operationId:crypto.randomUUID(),body:'Second independent note'});
 const saved=await service.run('get',{activityKey:f.scopes.programA,noteId:made.noteId});assert.equal(saved.notes.length,2);assert.equal(saved.notes.find(n=>n.id===made.noteId).body,input.body);assert.equal(saved.notes.find(n=>n.id===made.noteId).authorId,'account-0002');
 assert.throws(()=>f.db.exec("UPDATE class_note_versions SET body='changed'"),/immutable/);assert.throws(()=>f.db.exec('DELETE FROM class_notes'),/retained/);
 const ref=saved.nextDue.target,reminder=await service.run('timetable',{sessions:[{activityKey:ref.activityKey,date:ref.date,sessionKey:ref.sessionKey}]});assert.equal(reminder.sessions[0].dueNotes.length,2);
 await service.run('get',{activityKey:f.scopes.programA,noteId:made.noteId});assert.equal((await service.run('timetable',{sessions:[ref]})).sessions[0].dueNotes.length,2);
}));
test('own corrections and due-only changes retain versions; stale writes and retry misuse fail',()=>use(async f=>{
 const service=await f.notes('LEARN','original-student'),data=await view(f,service),made=await service.run('post',f.post(data));
 const date=nextDate(f.today,3),due=(await service.run('due',{activityKey:f.scopes.programA,contextId:made.contextId,due:{mode:'DATE',date}})).due;
 const input={activityKey:f.scopes.programA,noteId:made.noteId,revision:1,body:'Corrected text',due:{mode:'DATE',date,token:due.token},operationId:crypto.randomUUID()};await service.run('revise',input);
 await assert.rejects(service.run('revise',{...input,operationId:crypto.randomUUID()}),e=>e.code==='CLASS_NOTE_CHANGED');await assert.rejects(service.run('revise',{...input,body:'misused retry'}),e=>e.code==='OPERATION_ID_REUSED');
 await service.run('revise',{...input,revision:2,operationId:crypto.randomUUID(),due:{keep:true}});
 const history=await service.run('history',{activityKey:f.scopes.programA,noteId:made.noteId});assert.equal(history.versions.length,3);assert.equal(history.versions[0].due.date,date);
}));
test('real class membership is required; Teacher and scoped Admin can correct and withdraw; Admin-Learn is read-only',()=>use(async f=>{
 const student=await f.notes('LEARN','original-student'),data=await view(f,student),made=await student.run('post',f.post(data));
 const outsider=await f.notes('LEARN','studentA');await assert.rejects(outsider.run('get',{activityKey:f.scopes.programA,noteId:made.noteId}),e=>e.status===403);
 const adminPreview=await f.notes('ADMIN_LEARN');assert.equal((await view(f,adminPreview)).source.canPost,false);await assert.rejects(adminPreview.run('post',f.post(data)),e=>e.code==='PREVIEW_READ_ONLY');
 const wrongAdmin=await f.notes('ADMIN','adminB');await assert.rejects(wrongAdmin.run('get',{activityKey:f.scopes.programA,noteId:made.noteId}),e=>e.status===403);
 const teacher=await f.notes('TEACH','original-teacher');await teacher.run('revise',{activityKey:f.scopes.programA,noteId:made.noteId,revision:1,body:'Teacher correction',due:{keep:true},operationId:crypto.randomUUID()});
 const admin=await f.notes('ADMIN','adminA');await admin.run('withdraw',{activityKey:f.scopes.programA,noteId:made.noteId,revision:2,operationId:crypto.randomUUID()});
 const withdrawn=(await student.run('get',{activityKey:f.scopes.programA,noteId:made.noteId})).notes[0];assert.equal(withdrawn.state,'WITHDRAWN');assert.equal(withdrawn.body,undefined);assert.equal((await student.run('history',{activityKey:f.scopes.programA,noteId:made.noteId})).versions.length,0);assert.equal((await admin.run('history',{activityKey:f.scopes.programA,noteId:made.noteId})).versions.length,2);
}));
test('fixed date without a lesson is kept and missing next session requires a date',()=>use(async f=>{
 const s=await f.notes('LEARN','original-student'),{sources}=await s.run('sessions',{activityKey:f.scopes.programA,date:f.today}),source=sources.find(r=>r.startTime==='11:00'),data=await s.run('get',{activityKey:f.scopes.programA,source});
 // This fixture has no subject/module identifiers, so guessing by title is forbidden.
 assert.equal(data.nextDue,null);await assert.rejects(s.run('post',f.post(data)),e=>e.code==='CLASS_NOTE_DUE_REQUIRED');
 const date=nextDate(f.today,1),due=(await s.run('due',{activityKey:f.scopes.programA,source,due:{mode:'DATE',date}})).due;assert.equal(due.target,null);
 const made=await s.run('post',f.post(data,{due:{mode:'DATE',date,token:due.token}}));assert.equal((await s.run('get',{activityKey:f.scopes.programA,noteId:made.noteId})).notes[0].due.date,date);
},()=>{}));
test('shared lessons are class-specific and explicit relinking keeps one note and its source history',()=>use(async f=>{
 const admin=await f.notes(),data=await view(f,admin),made=await admin.run('post',f.post(data));
 const {sources}=await admin.run('sessions',{activityKey:f.scopes.programA,date:nextDate(f.today)}),wrong=sources.find(r=>r.classId==='class-shared'),target=sources.find(r=>r.classId==='class-1'&&r.startTime==='10:00');
 const base={activityKey:f.scopes.programA,noteId:made.noteId,revision:1,source:wrong,sourceToken:wrong.token,due:{mode:'DATE',date:nextDate(f.today,3)},reason:'Correct lesson',operationId:crypto.randomUUID()};await assert.rejects(admin.run('relink',base),e=>e.status===409);
 const due=(await admin.run('due',{activityKey:f.scopes.programA,source:target,due:base.due})).due;
 await admin.run('relink',{...base,operationId:crypto.randomUUID(),source:target,sourceToken:target.token,due:{...base.due,token:due.token}});
 const history=await admin.run('history',{activityKey:f.scopes.programA,noteId:made.noteId});assert.notEqual(history.versions[0].contextId,history.versions[1].contextId);assert.equal(history.versions[0].reason,'Correct lesson');assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,1);
}));
test('transaction failure rolls back note, versions, audit and receipt; current access revocation rejects stale state',()=>use(async f=>{
 const s=await f.notes('LEARN','original-student'),data=await view(f,s),input=f.post(data);f.db.exec("CREATE TRIGGER reject_note BEFORE INSERT ON class_note_versions BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
 await assert.rejects(s.run('post',input),/injected_failure/);assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM operation_receipts WHERE dataset_key='CLASS_NOTES'").get().n,0);f.db.exec('DROP TRIGGER reject_note');
 f.db.prepare("UPDATE class_memberships SET active=0 WHERE account_id='account-0002'").run();await assert.rejects(s.run('post',input),e=>e.status===403);
}));

test('Course notes need both genuine delivery membership and learning access; NEXT skips other Teachers and modules',()=>use(async f=>{
 const activityKey='COURSE:subject-1',student=await f.notes('LEARN','original-student'),admin=await f.notes(),source=(await admin.run('sessions',{activityKey,date:f.today})).sources[0];
 await assert.rejects(student.run('get',{activityKey,source}),e=>e.status===403);
 f.db.prepare("INSERT INTO attendance_delivery_rosters VALUES(?,'run-1',1,?,'account-0003')").run(activityKey,new Date().toISOString());
 for(const [id,account]of [['cn-member','account-0002'],['cn-none',f.actors.none]])f.db.prepare("INSERT INTO attendance_delivery_members(interval_id,activity_key,run_id,account_id,join_date,state,created_at,created_by) VALUES(?,?,'run-1',?,?,'VALID',?,'account-0003')").run(id,activityKey,account,f.today,new Date().toISOString());
 const data=await student.run('get',{activityKey,source});assert.equal(data.nextDue.date,nextDate(f.today,3));
 const made=await student.run('post',f.post(data));assert.equal((await student.run('get',{activityKey,noteId:made.noteId})).notes.length,1);
 const noLearning=await f.notes('LEARN','none');await assert.rejects(noLearning.run('get',{activityKey,noteId:made.noteId}),e=>e.status===403);
 f.db.prepare("UPDATE attendance_delivery_members SET state='VOID' WHERE interval_id='cn-member'").run();await assert.rejects(student.run('get',{activityKey,noteId:made.noteId}),e=>e.status===403);
},f=>{
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('cn-course-student','account-0002','COURSE:subject-1','STUDENT',1,'CONFIRMED')").run();
 const row=f.db.prepare("SELECT * FROM timetable_publications WHERE activity_key='COURSE:subject-1'").get(),snapshot=JSON.parse(row.snapshot_json),today=academyDate(new Date(),'Africa/Johannesburg'),first=snapshot.sessions[0];
 snapshot.sessions=Array.from({length:4},(_,i)=>({...first,SessionDate:nextDate(today,i),PublishedSessionID:'published-cn-'+i,SourceSessionID:'source-cn-'+i,...(i===1?{TeacherAccountID:'account-0004'}:i===2?{ModuleID:'another-module'}:{})}));
 const updated={...row,publication_id:'course-notes-publication',version_no:row.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(updated);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(updated));f.db.prepare("UPDATE course_run_state SET current_publication_id=? WHERE activity_key=? AND run_id='run-1'").run(updated.publication_id,row.activity_key);
}));

test('a newer accepted head blocks an old-page post atomically',()=>use(async f=>{
 const service=await f.notes('LEARN','original-student'),data=await view(f,service),input=f.post(data),head=f.db.prepare('SELECT * FROM setup_heads WHERE head_id=(SELECT head_id FROM setup_head_state)').get(),next={...head,head_id:crypto.randomUUID(),batch_id:crypto.randomUUID()};
 const batch={...f.db.prepare('SELECT * FROM setup_batches WHERE batch_id=?').get(head.batch_id),batch_id:next.batch_id},insert=(name,row)=>{const columns=Object.keys(row);f.db.prepare('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));};insert('setup_batches',batch);insert('setup_heads',next);f.db.prepare('INSERT INTO setup_head_components SELECT ?,table_name,scope_key,component_id FROM setup_head_components WHERE head_id=?').run(next.head_id,head.head_id);f.db.prepare('UPDATE setup_head_state SET head_id=?').run(next.head_id);
 await assert.rejects(service.run('post',input),e=>e.code==='CLASS_NOTE_CHANGED');assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,0);
}));

test('accepted Course occurrence mapping follows rescheduled source/target; a cancelled target needs review',()=>use(async f=>{
 const activityKey='COURSE:subject-1',publish=(change)=>{const row=f.db.prepare('SELECT p.* FROM timetable_publications p JOIN course_run_state s ON p.publication_id=s.current_publication_id WHERE s.activity_key=?').get(activityKey),snapshot=JSON.parse(row.snapshot_json);change(snapshot);const updated={...row,publication_id:crypto.randomUUID(),version_no:row.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(updated);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(updated));f.db.prepare('UPDATE course_run_state SET current_publication_id=? WHERE activity_key=?').run(updated.publication_id,activityKey);};
 publish(s=>{const first=s.sessions[0];s.sessions=[{...first,SessionDate:f.today},{...first,SourceSessionID:'cn-next-occurrence',PublishedSessionID:'cn-next-published',SessionDate:nextDate(f.today,2)}];});await f.accept(activityKey);
 let service=await f.notes();let source=(await service.run('sessions',{activityKey,date:f.today})).sources[0],data=await service.run('get',{activityKey,source}),made=await service.run('post',f.post(data));
 publish(s=>{s.sessions[0].SessionDate=nextDate(f.today);s.sessions[1].SessionDate=nextDate(f.today,4);});await f.accept(activityKey);service=await f.notes();data=await service.run('get',{activityKey,noteId:made.noteId});assert.equal(data.source.moved,true);assert.equal(data.source.date,nextDate(f.today));assert.equal(data.notes[0].due.date,nextDate(f.today,4));assert.equal(data.notes[0].due.originalDate,nextDate(f.today,2));
 const refs=(await service.run('sessions',{activityKey,date:nextDate(f.today)})).sources.concat((await service.run('sessions',{activityKey,date:nextDate(f.today,4)})).sources),cards=await service.run('timetable',{sessions:refs});assert.equal(cards.sessions[0].noteCount,1);assert.equal(cards.sessions[1].dueNotes[0].id,made.noteId);
 publish(s=>s.sessions[1].SessionKind='BREAK');await f.accept(activityKey);service=await f.notes();data=await service.run('get',{activityKey,noteId:made.noteId});assert.equal(data.notes[0].due.needsReview,true);assert.equal(data.notes[0].body,'Prepare paragraphs 1–3. حفظ الدرس');assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,1);
},()=>{}));

test('large lesson lists and version histories remain reachable through bounded pages',()=>use(async f=>{
 const service=await f.notes(),data=await view(f,service);let made;
 for(let i=0;i<52;i++)made=await service.run('post',f.post(data,{body:'Independent note '+i}));
 const first=await service.run('get',{activityKey:f.scopes.programA,source:data.source});assert.equal(first.notes.length,50);assert(first.before);
 const older=await service.run('get',{activityKey:f.scopes.programA,source:data.source,before:first.before});assert.equal(older.notes.length,2);assert.equal(older.before,null);assert.equal(new Set([...first.notes,...older.notes].map(n=>n.id)).size,52);
 for(let revision=1;revision<52;revision++)await service.run('revise',{activityKey:f.scopes.programA,noteId:made.noteId,revision,body:'Retained correction '+revision,due:{keep:true},operationId:crypto.randomUUID()});
 const history=await service.run('history',{activityKey:f.scopes.programA,noteId:made.noteId});assert.equal(history.versions.length,50);const oldHistory=await service.run('history',{activityKey:f.scopes.programA,noteId:made.noteId,beforeRevision:history.beforeRevision});assert.equal(oldHistory.versions.length,2);assert.equal(oldHistory.versions.at(-1).revision,1);
}));
