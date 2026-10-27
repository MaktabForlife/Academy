import {classNotesFixture,seedClassNotes} from '../../tests/fixtures/academy-class-notes-fixture.mjs';
import {readFileSync} from 'node:fs';
export async function mobileFirstFixture(){
const f=await classNotesFixture(f=>{
 seedClassNotes(f);
 f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,'class-1',?,'ADDITIONAL')").run(f.scopes.programA,f.actors.teacherA);
 f.db.prepare("INSERT INTO class_memberships VALUES(?,'mobile-first-learner','class-1',?,'2026-01-01',NULL,1)").run(f.scopes.programA,f.actors.studentA);
 f.mobileCourse=f.db.prepare("SELECT a.activity_key,a.activity_id,a.name FROM activities a JOIN course_runs r USING(activity_key) WHERE a.kind='COURSE' AND a.active=1 AND r.active=1 LIMIT 1").get();
 if(f.mobileCourse)f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('mobile-first-course-teacher',?,?,'TEACHER',1,'CONFIRMED')").run(f.actors.teacherA,f.mobileCourse.activity_key);
 const now=new Date().toISOString(),today=now.slice(0,10);
 f.db.prepare("INSERT INTO assessment_registers(register_id,name,class_mode,status,created_at,created_by,updated_at) VALUES('mobile-exam','Current Imtehaan','ALL','SCHEDULED',?,'account-0001',?)").run(now,now);
 f.db.prepare('INSERT INTO assessment_register_areas VALUES(?,?)').run('mobile-exam',f.scopes.programA);
 f.db.prepare("INSERT INTO assessments(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,schedule_published,examiner_id,created_at,created_by,updated_at,register_id,assessment_kind) VALUES('mobile-paper',?,'class-1','Reading and revision','Qasas',?,60,100,1,?,?,'account-0001',?,'mobile-exam','EXAM')").run(f.scopes.programA,today,f.actors.teacherA,now,now);
 f.db.prepare("INSERT INTO assessment_recipients(assessment_id,account_id,display_name) VALUES('mobile-paper',?,'Synthetic studentA')").run(f.actors.studentA);
});
for(const name of ['0037_session_mp4.sql','0038_messaging.sql']){f.db.exec('BEGIN');try{f.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}catch(error){f.db.exec('ROLLBACK');f.close();throw error;}}
f.env.ACADEMY_MESSAGING='1';
return f;
}
