import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enrolmentFixture,ok} from './fixtures/academy-enrolment-fixture.mjs';
import {WEEKLY_SCHEMA} from '../src/programs/weekly-timetable.js';
const programs='/api/admin/platform/programs/',courses='/api/admin/platform/courses/';
async function use(fn){const f=await enrolmentFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const write=(f,path,input,token=f.tokens.admin)=>f.call(path,{operationId:crypto.randomUUID(),...input},token);
const sourceProgram=f=>f.db.prepare('SELECT * FROM activities WHERE activity_key=?').get(f.program.activity_key);
async function seedSchedule(f){
 const p=f.program.activity_key,m=f.db.prepare('SELECT * FROM modules WHERE activity_key=? AND active=1 LIMIT 1').get(p),c=f.db.prepare('SELECT * FROM classes WHERE activity_key=? AND active=1 LIMIT 1').get(p);
 const d={format:WEEKLY_SCHEMA,timezone:'Africa/Johannesburg',rules:[{id:'RULE-original',moduleId:m.module_id,programSubjectId:m.program_subject_id,classIds:[c.class_id],teacherId:'account-0003',weekdays:[1],startTime:'07:00',endTime:'08:00',zoomLink:'https://zoom.us/j/12345678901'}]};
 f.db.prepare('UPDATE timetable_drafts SET draft_json=? WHERE activity_key=?').run(JSON.stringify(d),p);return {d,m,c};
}
test('Program copying remaps curriculum, classes and schedule into an unpublished independent draft',()=>use(async f=>{
 const original=sourceProgram(f),{d,m,c}=await seedSchedule(f);ok(await f.submit());
 const sourceBefore=f.db.prepare('SELECT * FROM timetable_drafts WHERE activity_key=?').get(original.activity_key),people=f.db.prepare('SELECT count(*) n FROM accounts').get().n;
 const input={id:original.activity_id,revision:String(original.revision),name:'Copied Program',copySchedule:true,operationId:crypto.randomUUID()};
 const result=ok(await f.call(programs+'copy',input,f.tokens.admin)),key='PROGRAM:'+result.program.id;assert.notEqual(result.program.id,original.activity_id);assert.equal(ok(await f.call(programs+'copy',input,f.tokens.admin)).program.id,result.program.id);
 const copy=f.db.prepare('SELECT * FROM activities WHERE activity_key=?').get(key);assert.equal(copy.lifecycle,'DRAFT');assert.equal(copy.active,0);assert.equal(copy.website_visible,0);
 const module=f.db.prepare('SELECT * FROM modules WHERE activity_key=? AND name=?').get(key,m.name),cls=f.db.prepare('SELECT * FROM classes WHERE activity_key=? AND name=?').get(key,c.name);assert(module);assert.notEqual(module.module_id,m.module_id);assert.notEqual(cls.class_id,c.class_id);
 const draft=JSON.parse(f.db.prepare('SELECT draft_json FROM timetable_drafts WHERE activity_key=?').get(key).draft_json);assert.equal(draft.rules.length,1);assert.equal(draft.rules[0].moduleId,module.module_id);assert.deepEqual(draft.rules[0].classIds,[cls.class_id]);assert.notEqual(draft.rules[0].id,d.rules[0].id);assert.equal(draft.rules[0].startTime,'07:00');assert.equal(f.db.prepare('SELECT status FROM program_timetable_records WHERE activity_key=?').get(key).status,'DRAFT');
 for(const table of ['class_memberships','role_assignments','timetable_publications','attendance_registers','program_resources','class_module_progress','academy_enrolment_catalogue','academy_enrolment_request_items'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table+' WHERE activity_key=?').get(key).n,0,table);
 assert.equal(f.db.prepare('SELECT count(*) n FROM accounts').get().n,people);assert.deepEqual(f.db.prepare('SELECT * FROM timetable_drafts WHERE activity_key=?').get(original.activity_key),sourceBefore);
 const list=ok(await f.call(programs+'list',{},f.tokens.admin));const row=list.programs.find(p=>p.id===copy.activity_id);ok(await write(f,programs+'save',{id:row.id,revision:row.revision,name:'Edited copy',status:row.status,timezone:row.timezone,durationYears:row.durationYears}));assert.equal(sourceProgram(f).name,original.name);
}));
test('structure-only Program copies omit teacher selections and reject stale or unauthorised copies',()=>use(async f=>{
 const original=sourceProgram(f);await seedSchedule(f);const input={id:original.activity_id,revision:String(original.revision),name:'Structure only',copySchedule:false};
 const copied=ok(await write(f,programs+'copy',input)),key='PROGRAM:'+copied.program.id;
 for(const t of ['timetable_drafts','class_teacher_assignments','role_assignments'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t+' WHERE activity_key=?').get(key).n,0);
 assert.equal((await write(f,programs+'copy',{...input,revision:'999'})).status,409);assert.equal((await write(f,programs+'copy',{...input,name:''})).status,400);assert.equal((await write(f,programs+'copy',input,f.tokens.student)).status,403);
 const scoped=await f.login('0004');assert.equal((await write(f,programs+'copy',input,scoped)).status,403);
}));
test('active and draft Courses can be copied with fresh identities, cleared dates and no learner access',()=>use(async f=>{
 for(const source of [f.published,f.draft]){
  const original=ok(await f.call(courses+'get',source,f.tokens.admin)).course;const input={...source,baseRevision:original.revision,name:original.details.name+' copy',copySchedule:true,reuseMedia:false,operationId:crypto.randomUUID()};
  const result=ok(await f.call(courses+'copy',input,f.tokens.admin));assert.equal(ok(await f.call(courses+'copy',input,f.tokens.admin)).courseId,result.courseId);assert.notEqual(result.courseId,source.courseId);
  const c=ok(await f.call(courses+'get',result,f.tokens.admin)).course;assert.equal(c.stage,'DRAFT');assert.equal(c.details.startDate,'');assert.equal(c.details.endDate,'');assert.deepEqual(c.details.sessions,[]);assert.equal(c.details.startTime,original.details.startTime);assert.equal(c.currentPublication,'');assert.equal(c.validationToken,'');
  for(const t of ['role_assignments','course_subscription_decisions','course_resources','timetable_publications','academy_enrolment_catalogue'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t+' WHERE activity_key=?').get(c.activityKey).n,0,t);
  assert.deepEqual(ok(await f.call(courses+'get',source,f.tokens.admin)).course,original);
  const review=ok(await write(f,courses+'validate',{...result,baseRevision:c.revision}));assert.equal(review.validation.valid,false);assert(review.validation.errors.some(e=>e.field==='startDate'));
 }
}));
test('Course copies can omit schedule settings, preserve public-card content and require Global Admin',()=>use(async f=>{
 let original=ok(await f.call(courses+'get',f.published,f.tokens.admin)).course;
 const card={time:'12:00',title:'Course title',description:'Course introduction'};ok(await write(f,courses+'public-card-save',{...f.published,baseCardRevision:original.publicCardRevision,publicCard:card}));original=ok(await f.call(courses+'get',f.published,f.tokens.admin)).course;
 const input={...f.published,baseRevision:original.revision,name:'Blank schedule copy',copySchedule:false,reuseMedia:false};
 const result=ok(await write(f,courses+'copy',input)),c=ok(await f.call(courses+'get',result,f.tokens.admin)).course;assert.deepEqual(c.publicCard,card);for(const k of ['startTime','endTime','teacherId','zoomLink'])assert.equal(c.details[k],'');assert.deepEqual(c.details.weekdays,[]);
 assert.equal((await write(f,courses+'copy',input,f.tokens.other)).status,403);assert.equal((await write(f,courses+'copy',input,f.tokens.student)).status,403);
 assert.equal((await write(f,courses+'copy',{...input,baseRevision:'stale'})).status,409);
}));

test('Program copies retain editable learner/class enrolments while draft access stays closed',()=>use(async f=>{
 const source=sourceProgram(f),before=f.db.prepare('SELECT * FROM class_memberships WHERE activity_key=? ORDER BY enrollment_id').all(source.activity_key),accounts=f.db.prepare('SELECT count(*) n FROM accounts').get().n;
 const input={id:source.activity_id,revision:String(source.revision),name:'Program with draft roster',copySchedule:true,copyEnrollments:true,operationId:crypto.randomUUID()},copied=ok(await f.call(programs+'copy',input,f.tokens.admin)),key='PROGRAM:'+copied.program.id;
 assert.equal(ok(await f.call(programs+'copy',input,f.tokens.admin)).program.id,copied.program.id);
 const membership=f.db.prepare('SELECT * FROM class_memberships WHERE activity_key=? AND account_id=?').get(key,'account-0002');assert(membership);assert(!before.some(r=>r.enrollment_id===membership.enrollment_id));assert.equal(f.db.prepare('SELECT count(*) n FROM accounts').get().n,accounts);
 const session=ok(await f.call('/api/account/session',{},f.tokens.student));assert(!JSON.stringify(session).includes(copied.program.id));
 const management=ok(await f.call('/api/admin/platform/program-timetable/manage-get',{id:copied.program.id},f.tokens.admin)),another=management.rows.classes.find(c=>c.ClassID!==membership.class_id);assert(another);
 ok(await write(f,'/api/admin/platform/program-timetable/manage-save',{id:copied.program.id,kind:'student-class',record:{AccountID:'account-0002',ClassID:another.ClassID},baseRowRevision:management.studentClassRevisions['account-0002']}));assert.equal(f.db.prepare('SELECT class_id FROM class_memberships WHERE activity_key=? AND account_id=? AND active=1').get(key,'account-0002').class_id,another.ClassID);
 let directory=ok(await f.call('/api/admin/platform/user-profiles/get',{},f.tokens.admin)),scope=directory.scopes.find(s=>s.id===copied.program.id),account=directory.accounts.find(a=>a.accountId==='account-0008'),grant=account.assignments.find(g=>g.scopeId===copied.program.id);assert(scope.draftStudentEditable);assert.equal(grant.accessAllowed,false);
 ok(await write(f,'/api/admin/platform/user-profiles/save',{mode:'matrix-roles',accountId:account.accountId,scopeType:'PROGRAM',scopeId:scope.id,roles:['STUDENT'],baseRevision:grant.revision,scopeRevision:scope.revision}));
 const list=ok(await f.call(programs+'list',{},f.tokens.admin)),row=list.programs.find(p=>p.id===scope.id);ok(await write(f,programs+'save',{id:row.id,revision:row.revision,name:row.name,status:'ACTIVE',timezone:row.timezone,durationYears:row.durationYears}));
 assert(JSON.stringify(ok(await f.call('/api/account/session',{},f.tokens.student))).includes(copied.program.id));assert.deepEqual(f.db.prepare('SELECT * FROM class_memberships WHERE activity_key=? ORDER BY enrollment_id').all(source.activity_key),before);
}));

test('Course copies retain dated sessions and editable learner enrolments without enabling draft access',()=>use(async f=>{
 const sourcePeople=ok(await f.call(courses+'participants',f.published,f.tokens.admin)),learner=sourcePeople.accounts.find(a=>a.accountId==='account-0002');ok(await write(f,courses+'participants-save',{...f.published,accountId:learner.accountId,roles:['STUDENT'],baseRevision:learner.assignment.revision,scopeRevision:sourcePeople.scope.revision}));
 const original=ok(await f.call(courses+'get',f.published,f.tokens.admin)).course;
 f.db.prepare("INSERT INTO modules(activity_key,module_id,name,sort_order,active) VALUES(?,'copy-module','Course module',1,1)").run(original.activityKey);
 f.db.prepare("INSERT INTO tasks(activity_key,task_id,module_id,name,sort_order,active) VALUES(?,'copy-task','copy-module','Course task',1,1)").run(original.activityKey);
 const copied=ok(await write(f,courses+'copy',{...f.published,baseRevision:original.revision,name:'Course with editable roster',copySchedule:true,copyTimetable:true,copyEnrollments:true,reuseMedia:false})),key='COURSE:'+copied.courseId,c=ok(await f.call(courses+'get',copied,f.tokens.admin)).course;
 assert.equal(c.draftAccessHeld,true);assert.equal(c.details.startDate,original.details.startDate);assert.equal(c.details.sessions.length,original.details.sessions.length);assert(c.details.sessions.every(s=>!original.details.sessions.some(old=>old.id===s.id)));assert.equal(c.validationToken,'');assert.equal(c.acceptedToken,'');
 const module=f.db.prepare('SELECT * FROM modules WHERE activity_key=?').get(key),task=f.db.prepare('SELECT * FROM tasks WHERE activity_key=?').get(key);assert.notEqual(module.module_id,'copy-module');assert.equal(task.module_id,module.module_id);
 let people=ok(await f.call(courses+'participants',copied,f.tokens.admin));assert(people.scope.draftStudentEditable);let student=people.accounts.find(a=>a.accountId==='account-0002');assert(student.assignment.roles.includes('STUDENT'));assert.equal(student.assignment.accessAllowed,false);assert(!JSON.stringify(ok(await f.call('/api/account/session',{},f.tokens.student))).includes(copied.courseId));
 ok(await write(f,courses+'participants-save',{...copied,accountId:student.accountId,roles:[],baseRevision:student.assignment.revision,scopeRevision:people.scope.revision}));people=ok(await f.call(courses+'participants',copied,f.tokens.admin));student=people.accounts.find(a=>a.accountId==='account-0008');ok(await write(f,courses+'participants-save',{...copied,accountId:student.accountId,roles:['STUDENT'],baseRevision:student.assignment.revision,scopeRevision:people.scope.revision}));
 const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),details={...c.details,startDate:addDays(c.details.startDate,35),endDate:addDays(c.details.endDate,35),sessions:c.details.sessions.map(s=>({...s,date:addDays(s.date,35)}))};
 const saved=ok(await write(f,courses+'save',{...copied,baseRevision:c.revision,details})),review=ok(await write(f,courses+'validate',{...copied,baseRevision:saved.revision}));assert(review.validation.valid,JSON.stringify(review));assert.equal(review.generated,0,'Copied individual session edits survive validation');
 const accepted=ok(await write(f,courses+'accept',{...copied,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));ok(await write(f,courses+'publish',{...copied,baseRevision:accepted.revision,validationToken:review.validation.token}));
 people=ok(await f.call(courses+'participants',copied,f.tokens.admin));assert(people.accounts.find(a=>a.accountId==='account-0008').assignment.accessAllowed);assert(!people.accounts.find(a=>a.accountId==='account-0002').assignment.accessAllowed);
 assert.equal(f.db.prepare("SELECT active FROM course_subscription_decisions WHERE activity_key=? AND account_id='account-0002'").get(original.activityKey).active,1);assert.deepEqual(ok(await f.call(courses+'get',f.published,f.tokens.admin)).course,original);
}));

test('draft enrolment copy rolls back atomically and refuses forged options or authority',()=>use(async f=>{
 const source=sourceProgram(f),n=f.db.prepare('SELECT count(*) n FROM activities').get().n,input={id:source.activity_id,revision:String(source.revision),name:'Rollback roster',copySchedule:true,copyEnrollments:true};
 f.db.exec("CREATE TRIGGER copy_roster_failure BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_REGISTRY' AND NEW.action='copy' BEGIN SELECT RAISE(ABORT,'copy rollback'); END");assert((await write(f,programs+'copy',input)).status>=400);assert.equal(f.db.prepare('SELECT count(*) n FROM activities').get().n,n);f.db.exec('DROP TRIGGER copy_roster_failure');
 assert.equal((await write(f,programs+'copy',{...input,copyEnrollments:'yes'})).status,400);assert.equal((await write(f,programs+'copy',input,f.tokens.student)).status,403);
}));
