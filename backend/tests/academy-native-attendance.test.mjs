import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {acceptedRepository} from '../src/academy/d1/setup-reader.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {nativeAttendance} from '../src/academy/d1/native-attendance.js';
import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
const today=()=>academyDate(new Date(),'Africa/Johannesburg');
async function use(fn,seed){
 const f=await separationFixture();try{
  for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
  if(seed)await seed(f);f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0034_assessment_operations.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');const head=(await initialiseAcceptedSetup(f.env.ACADEMY_DB)).head;
  f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';
  f.service=async(workspace='ADMIN',who='global')=>{
   const token=who==='original-teacher'?await f.login('0003'):await f.actor(who),source=academyD1Repository(f.env);await source.ready();
   const request=new Request('http://localhost/api/academy/attendance/get',{headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace}}),auth=await authenticatedD1Account(request,f.env,source);
   return nativeAttendance(acceptedRepository(source,head),auth);
  };
  f.input=(data,extra={})=>({activityKey:scopes.programA,generation:data.generation,date:data.date,scope:'day',exceptions:Object.fromEntries(data.lessons.map(r=>[r.lesson.anchor,[]])),baseRegisterIds:Object.fromEntries(data.lessons.map(r=>[r.lesson.anchor,r.registerId])),operationId:crypto.randomUUID(),...extra});
  await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
 }finally{f.close();}
}
test('fresh native attendance records a real zero-absence register and leaves legacy records untouched',()=>use(async f=>{
 const legacy=f.db.prepare('SELECT * FROM attendance_registers').all(),service=await f.service(),data=await service.run('get',{activityKey:scopes.programA,date:today()});assert(data.lessons.length);
 const input=f.input(data),result=await service.run('submit',input);assert.equal(result.submittedLessons,data.lessons.length);
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_absences').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_days').get().n,1);
 assert(f.db.prepare('SELECT * FROM attendance_register_versions').all().every(r=>r.submitted_by===f.actors.global));
 assert.deepEqual(f.db.prepare('SELECT * FROM attendance_registers').all(),legacy);assert.equal((await service.run('submit',input)).replayed,true);
 const read=await service.run('get',{activityKey:scopes.programA,date:today()});assert.equal(read.complete,true);assert(read.learners.every(r=>r.dayFraction===1));
 await assert.rejects(service.run('submit',{...input,generation:undefined}),e=>e.code==='ATTENDANCE_GENERATION_CHANGED');
}));
test('corrections append sparse absences, use the sealed roster and reject stale bases',()=>use(async f=>{
 const service=await f.service(),data=await service.run('get',{activityKey:scopes.programA,date:today()}),first=f.input(data),row=data.lessons[0],accountId=row.marks[0].accountId;
 first.exceptions[row.lesson.anchor]=[{accountId,status:'ABSENT'}];await service.run('submit',first);
 const saved=await service.run('get',{activityKey:scopes.programA,date:today()}),rosters=f.db.prepare('SELECT count(*) n FROM attendance_roster_versions').get().n;f.db.prepare('UPDATE class_memberships SET active=0 WHERE account_id=?').run(accountId);
 const correction=f.input(saved);await service.run('submit',correction);
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_days').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_roster_versions').get().n,rosters);
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_absences').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_register_versions').get().n,data.lessons.length+1);
 const read=await service.run('get',{activityKey:scopes.programA,date:today()});assert(read.lessons[0].marks.some(m=>m.accountId===accountId&&m.status==='PRESENT'));
 await assert.rejects(service.run('submit',{...correction,operationId:crypto.randomUUID()}),e=>e.code==='ROW_CHANGED');
 assert.throws(()=>f.db.exec('DELETE FROM attendance_absences'),/append_only/);assert.throws(()=>f.db.exec('UPDATE attendance_roster_members SET display_name=\'Changed\''),/immutable/);
}));
test('past FIRST requires reliable dated eligibility; future FIRST remains unavailable',()=>use(async f=>{
 const service=await f.service(),date=nextDate(today(),-1),data=await service.run('get',{activityKey:scopes.programA,date});assert(data.lessons.length);assert(data.lessons.every(r=>!r.rosterReliable));
 await assert.rejects(service.run('submit',f.input(data)),e=>e.code==='ATTENDANCE_ROSTER_REQUIRED');
 f.db.prepare("UPDATE class_memberships SET start_date='2026-01-01',end_date=CASE WHEN active=0 THEN '2026-12-31' ELSE end_date END WHERE activity_key=?").run(scopes.programA);
 const dated=await service.run('get',{activityKey:scopes.programA,date});assert(dated.lessons.every(r=>r.rosterReliable));await service.run('submit',f.input(dated));
 const future=await service.run('get',{activityKey:scopes.programA,date:nextDate(today())});await assert.rejects(service.run('submit',f.input(future)),e=>e.code==='FUTURE_ATTENDANCE');
}));
test('four recorded sessions count one date and three present sessions equal three quarters of a day',()=>use(async f=>{
 const service=await f.service(),data=await service.run('get',{activityKey:scopes.programA,date:today()});assert.equal(data.lessons.filter(r=>r.lesson.classId==='class-1').length,4);
 const input=f.input(data),accountId=data.lessons[0].marks[0].accountId;input.exceptions[data.lessons[0].lesson.anchor]=[{accountId,status:'ABSENT'}];await service.run('submit',input);
 const report=await service.run('report',{activityKey:scopes.programA,startDate:today(),endDate:today(),accountId});assert.equal(report.days.length,1);assert.equal(report.days[0].dayFraction,.75);assert.equal(report.learners[0].recordedDays,1);assert.equal(report.learners[0].attendedDays,.75);assert.equal(report.learners[0].percentage,75);
},async f=>{
 const original=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=? LIMIT 1').get(scopes.programA),snapshot=JSON.parse(original.snapshot_json),base=snapshot.rules[0];
 snapshot.rules=Array.from({length:4},(_,i)=>({...base,id:'RULE-native-'+i,startTime:String(8+i).padStart(2,'0')+':00',endTime:String(9+i).padStart(2,'0')+':00'}));
 const row={...original,publication_id:'native-four-sessions',version_no:original.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(row);
 f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));
 f.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(row.publication_id,scopes.programA);
}));
test('preview cannot write and a storage failure rolls back all explicit targets',()=>use(async f=>{
 const preview=await f.service('TEACH'),view=await preview.run('get',{activityKey:scopes.programA,date:today()});assert.equal(view.readOnly,true);await assert.rejects(preview.run('submit',f.input(view)),e=>e.code==='PREVIEW_READ_ONLY');
 const service=await f.service(),data=await service.run('get',{activityKey:scopes.programA,date:today()}),input=f.input(data);input.exceptions[data.lessons[0].lesson.anchor]=[{accountId:data.lessons[0].marks[0].accountId,status:'ABSENT'}];
 f.db.exec("CREATE TRIGGER reject_native_absence BEFORE INSERT ON attendance_absences BEGIN SELECT RAISE(ABORT,'injected_failure'); END");await assert.rejects(service.run('submit',input),/injected_failure/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_days').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_register_versions').get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM operation_receipts WHERE dataset_key='NATIVE_ATTENDANCE'").get().n,0);
}));

test('a substitute with no Teacher role has only the exact dated attendance grant and loses it on revocation',()=>use(async f=>{
 const admin=await f.service(),data=await admin.run('get',{activityKey:scopes.programA,date:today()}),lesson=data.lessons[0].lesson;
 const grant=await admin.run('substitute-save',{activityKey:scopes.programA,generation:data.generation,date:today(),stableKey:lesson.stableKey,accountId:f.actors.none,operationId:crypto.randomUUID()});
 const substitute=await f.service('TEACH','none'),view=await substitute.run('get',{activityKey:scopes.programA,date:today()});
 assert.equal(view.lessons.length,1);assert.equal(view.lessons[0].lesson.stableKey,lesson.stableKey);assert.equal(view.canAdmin,false);
 assert.equal(f.db.prepare('SELECT count(*) n FROM role_assignments WHERE account_id=?').get(f.actors.none).n,0);
 await substitute.run('submit',f.input(view));
 await assert.rejects(substitute.run('roster-get',{activityKey:scopes.courseA,runId:'forged'}),e=>e.status===403);
 await admin.run('substitute-revoke',{activityKey:scopes.programA,generation:data.generation,assignmentId:grant.assignmentId,revision:1,operationId:crypto.randomUUID()});
 await assert.rejects(substitute.run('get',{activityKey:scopes.programA,date:today()}),e=>e.status===403);
}));
test('current role revocation rejects a Teacher commit made with an earlier authenticated state',()=>use(async f=>{
 const teacher=await f.service('TEACH','original-teacher'),data=await teacher.run('get',{activityKey:scopes.programA,date:today()});assert(data.lessons.length);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0003' AND activity_key=? AND role='TEACHER'").run(scopes.programA);
 await assert.rejects(teacher.run('submit',f.input(data)),e=>e.code==='ATTENDANCE_CHANGED');
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_days').get().n,0);
}));
test('a newly accepted setup head rejects an old-page first register without creating partial records',()=>use(async f=>{
 const service=await f.service(),data=await service.run('get',{activityKey:scopes.programA,date:today()}),head=f.db.prepare('SELECT * FROM setup_heads WHERE head_id=(SELECT head_id FROM setup_head_state)').get(),next={...head,head_id:crypto.randomUUID(),batch_id:crypto.randomUUID()},columns=Object.keys(next);
 const batch={...f.db.prepare('SELECT * FROM setup_batches WHERE batch_id=?').get(head.batch_id),batch_id:next.batch_id},batchColumns=Object.keys(batch);f.db.prepare('INSERT INTO setup_batches('+batchColumns.join(',')+') VALUES('+batchColumns.map(()=>'?').join(',')+')').run(...Object.values(batch));
 f.db.prepare('INSERT INTO setup_heads('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(next));
 f.db.prepare('INSERT INTO setup_head_components SELECT ?,table_name,scope_key,component_id FROM setup_head_components WHERE head_id=?').run(next.head_id,head.head_id);
 f.db.prepare('UPDATE setup_head_state SET head_id=?').run(next.head_id);
 await assert.rejects(service.run('submit',f.input(data)),e=>e.code==='ATTENDANCE_CHANGED');
 assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_days').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_register_versions').get().n,0);
}));
test('Course attendance uses an explicitly reviewed delivery roster and preserves previously sealed days',()=>use(async f=>{
 const service=await f.service(),scope='COURSE:subject-1',data=await service.run('get',{activityKey:scope,date:today()});assert(data.lessons.length);assert(data.lessons.every(r=>!r.canSubmit));
 const roster=await service.run('roster-get',{activityKey:scope,runId:'run-1'});assert.equal(roster.revision,0);assert(!roster.prefill.some(r=>r.accountId===f.actors.global));
 const save={activityKey:scope,runId:'run-1',generation:data.generation,revision:roster.revision,prefillRevision:roster.prefillRevision,intervals:[{accountId:'account-0002',joinDate:today(),leaveDate:'',state:'VALID'}],operationId:crypto.randomUUID()};
 await service.run('roster-save',save);const reviewed=await service.run('get',{activityKey:scope,date:today()});assert(reviewed.lessons.every(r=>r.canSubmit));await service.run('submit',f.input(reviewed,{activityKey:scope}));
 const current=await service.run('roster-get',{activityKey:scope,runId:'run-1'});await service.run('roster-save',{...save,operationId:crypto.randomUUID(),revision:current.revision,prefillRevision:current.prefillRevision,intervals:[]});
 const sealed=await service.run('get',{activityKey:scope,date:today()});assert(sealed.learners.some(r=>r.accountId==='account-0002'&&r.dayFraction===1));
 assert.equal(f.db.prepare("SELECT count(*) n FROM role_assignments WHERE account_id='account-0002' AND activity_key=?").get(scope).n,0);
},async f=>{
 const p=f.db.prepare("SELECT * FROM timetable_publications WHERE activity_key='COURSE:subject-1'").get(),snapshot=JSON.parse(p.snapshot_json);snapshot.sessions.forEach(s=>{s.SessionDate=today();s.PublicationID='native-course-publication';});snapshot.publication.PublicationID='native-course-publication';const row={...p,publication_id:'native-course-publication',version_no:p.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(row);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));f.db.prepare('UPDATE course_run_state SET current_publication_id=? WHERE run_id=?').run(row.publication_id,'run-1');
}));
