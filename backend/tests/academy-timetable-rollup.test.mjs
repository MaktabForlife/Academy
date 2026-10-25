import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDatabase,setCell,appendRecord} from './fixtures/academy-d1-fixture.mjs';
import {fixtureTab} from './fixtures/academy-migration-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1Entrance} from '../src/academy/d1/entrance.js';
import {selectWorkspace} from '../src/academy/d1/workspace-access.js';

test('Admin rollups distinguish named/co-teachers, dated class memberships and Course enrolments in every reader',async()=>{
 const f=await fixtureDatabase(12,s=>{
  const tab=fixtureTab(s,'ProgramTimetablePublications',1),index=tab.rows[0].indexOf('SnapshotJSON'),snapshot=JSON.parse(tab.rows[1][index]);
  snapshot.rules[0].teacherIds=['account-0003','ACCOUNT-0001'];tab.rows[1][index]=JSON.stringify(snapshot);
  setCell(s,'PublishedGlobalTimetableSessions',1,'TeacherAccountID','account-0001');
  setCell(s,'GlobalTimetablePublications',1,'SessionCount',2);
  appendRecord(s,'PublishedGlobalTimetableSessions',{PublishedSessionID:'rollup-session-2',SourceSessionID:'rollup-source-2',PublicationID:'publication-1',RunID:'run-1',SubjectID:'subject-1',RunName:'Synthetic run',SubjectName:'Synthetic subject',ModuleName:'Inherited lesson',TeacherName:'Other teacher',Timezone:'Africa/Johannesburg',ModuleID:'module-1',TeacherAccountID:'account-0003',SessionDate:'2026-10-10',StartTime:'10:00',EndTime:'11:00',ZoomLink:'https://zoom.us/j/12345678901'});
 });
 try{
  const publications=f.db.prepare("SELECT activity_key,publication_id,snapshot_json FROM timetable_publications WHERE pattern='WEEKLY' ORDER BY activity_key").all();
  const [teaching,learning]=publications;
  f.db.prepare("UPDATE class_memberships SET active=0 WHERE activity_key=? AND account_id='account-0001'").run(learning.activity_key);
  f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('rollup-student','account-0001',?,'STUDENT',1,'CONFIRMED')").run(learning.activity_key);
  const classId=JSON.parse(learning.snapshot_json).rules[0].classIds[0];
  f.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,start_date,end_date,active) VALUES(?,'rollup-member',?,'account-0001','2026-10-10','2026-10-11',1)").run(learning.activity_key,classId);
  const project=async workspace=>{
   const repository=academyD1Repository(f.env),state=await repository.byId('account-0001');
   const auth=selectWorkspace(new Request('http://localhost/api/academy/entrance',{headers:{'X-Academy-Workspace':workspace}}),{state,user:{accountid:'account-0001',role:'GLOBAL_ADMIN'}});
   return d1Entrance(repository,auth.state,auth.user,{startDate:'2026-10-09'},new Date('2026-10-09T08:30:00Z'),{auth});
  };
  for(const workspace of ['ADMIN','ADMIN_TEACH','ADMIN_LEARN']){
   const home=await project(workspace),named=home.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===teaching.activity_key),enrolled=home.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===learning.activity_key);
   assert(named.length&&enrolled.length,workspace);
   assert(named.every(r=>r.assignedParticipation==='teacher'&&!r.summarize),workspace+' co-teacher lessons stay separate');
   assert(enrolled.filter(r=>['2026-10-10','2026-10-11'].includes(r.date)).every(r=>r.assignedParticipation==='student'&&!r.summarize),workspace+' dated own lessons stay separate');
   assert(enrolled.filter(r=>!['2026-10-10','2026-10-11'].includes(r.date)).every(r=>r.assignedParticipation===''&&r.summarize===(workspace!=='ADMIN_LEARN')),workspace+' other lessons use only inherited teaching access');
   const courses=home.personalTimetable.filter(r=>r.kind==='COURSE');assert.equal(courses.length,2);
   assert.equal(courses[0].assignedParticipation,'teacher');assert.equal(courses[0].summarize,false);
   assert.equal(courses[1].assignedParticipation,'');assert.equal(courses[1].summarize,workspace!=='ADMIN_LEARN');
  }
  f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('rollup-course-student','account-0001','COURSE:subject-1','STUDENT',1,'CONFIRMED')").run();
  for(const workspace of ['ADMIN','ADMIN_TEACH']){
   const rows=(await project(workspace)).personalTimetable.filter(r=>r.kind==='COURSE');
   assert(rows.every(r=>!r.summarize));assert.equal(rows[1].assignedParticipation,'student');
  }
 }finally{f.db.close();}
});
