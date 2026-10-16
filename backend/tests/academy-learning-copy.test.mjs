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
