import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {MOU_MEDIA_PROGRAM as area} from '../src/academy/d1/lesson-media.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
const week='2026-10-19',content=()=>({title:'Weekly plan',overview:'Prepare the class',reflection:'',lessons:[{date:week,className:'Class A',subject:'Quran',objectives:'Read clearly',activities:'Read and revise',resources:'Pages 1–4'}]});
export async function planningFixture(){const f=await mediaFixture();for(const migration of ['0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));return f;}
async function use(fn){const f=await planningFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const post=(f,action,input,token)=>f.call('/api/academy/planning/'+action,input,token);
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const key={activityKey:area,weekStart:week,period:'WEEKLY'};
const change=(f,action,input,token)=>post(f,action,{...input,operationId:crypto.randomUUID()},token);
test('new Program plans start with one blank section and bounded curriculum/class choices, preserving saved content',()=>use(async f=>{
 f.db.prepare("INSERT INTO subject_catalog VALUES('ACADEMY:planning-choice','ACADEMY','planning-choice','Hadith',1)").run();
 f.db.prepare("INSERT INTO program_subjects VALUES(?,'planning-subject','ACADEMY:planning-choice',1)").run(area);
 f.db.prepare("INSERT INTO modules(activity_key,module_id,program_subject_id,name,sort_order,active) VALUES(?,'planning-module','planning-subject','Mishkaat',1,1)").run(area);
 for(const [id,name]of [['choice-a','Class A'],['choice-b','Class B'],['choice-other','Unassigned class']])f.db.prepare('INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)').run(area,id,name);
 for(const [id,responsibility]of [['choice-a','ADDITIONAL'],['choice-b','DEFAULT']])f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,?,'account-0003',?)").run(area,id,responsibility);
 const teacher=await f.login('0003'),mine=ok(await post(f,'get',key,teacher));
 assert.deepEqual(mine.content.lessons,[{date:'',className:'Class B',subject:'',objectives:'',activities:'',resources:''}]);
 assert.deepEqual(mine.choices,{subjects:['Hadith','Hadith · Mishkaat'],classes:['Class B','Class A'],defaultClass:'Class B'});
 const saved=content();saved.lessons[0].subject='Former subject label';saved.lessons[0].className='Former class';
 ok(await change(f,'save',{...key,revision:0,content:saved},teacher));
 assert.deepEqual(ok(await post(f,'get',key,teacher)).content,saved);
 assert.equal((await post(f,'get',{...key,activityKey:'PROGRAM:outside-scope'},teacher)).status,403);
}));
test('Program chooser uses accepted curriculum and class labels rather than unpublished Admin edits',async()=>{
 const f=await classNotesFixture(f=>f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,'class-1',?,'ADDITIONAL')").run(f.scopes.programA,f.actors.teacherA));
 try{
  const teacher=await f.actor('teacherA'),input={activityKey:f.scopes.programA,weekStart:week,period:'WEEKLY',view:'teacher'};
  const before=ok(await post(f,'get',input,teacher));assert(before.choices.subjects.length);assert(before.choices.classes.length);
  f.db.prepare("UPDATE subject_catalog SET name='Private curriculum rename' WHERE subject_key IN(SELECT subject_key FROM program_subjects WHERE activity_key=?)").run(f.scopes.programA);
  f.db.prepare("UPDATE classes SET name='Private class rename' WHERE activity_key=? AND class_id='class-1'").run(f.scopes.programA);
  const after=ok(await post(f,'get',input,teacher));assert.deepEqual(after.choices,before.choices);assert.equal(after.content.lessons.length,1);assert.equal(after.content.lessons[0].activities,'');
 }finally{f.close();}
});
test('manual Submit shares only its snapshot; later saves stay private and no statuses are calculated',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0004'),student=await f.login('0002');
 assert.equal((await post(f,'list',{view:'admin'},teacher)).status,403);assert.equal((await post(f,'list',{view:'teacher'},student)).status,403);
 assert.equal(ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week},admin)).plans.length,0);
 const request={...key,revision:0,content:content(),operationId:crypto.randomUUID()};ok(await post(f,'save',request,teacher));assert(ok(await post(f,'save',request,teacher)).replayed);
 assert.equal((await post(f,'get',{...key,teacherId:'account-0003'},admin)).status,409);
 ok(await change(f,'submit',{...key,revision:1,content:content()},teacher));
 const changed=content();changed.overview='Private next revision';ok(await change(f,'save',{...key,revision:2,content:changed},teacher));
 const review=ok(await post(f,'get',{...key,teacherId:'account-0003'},admin));assert.equal(review.content.overview,'Prepare the class');assert.equal(review.canEdit,false);
 assert.equal(ok(await post(f,'get',key,teacher)).content.overview,changed.overview);
 const list=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week},admin));assert.equal(list.plans.length,1);assert(!JSON.stringify(list).includes(changed.overview));
 for(const field of ['status','dueAt','deadlineRevision','sessionRequirements','comments','canComment'])assert(!Object.hasOwn(review,field),field);
 assert.equal(f.db.prepare('SELECT submitted_due_at FROM lesson_plans').get().submitted_due_at,null);
 ok(await change(f,'submit',{...key,revision:3,content:changed},teacher));assert.equal(ok(await post(f,'get',{...key,teacherId:'account-0003'},admin)).content.overview,changed.overview);
 assert.equal((await change(f,'save',{...key,revision:2,content:content()},teacher)).status,409);
 assert.throws(()=>f.db.exec('DELETE FROM lesson_plan_revisions'),/append-only/);
}));
test('Admin curriculum contains all active areas, no synthetic missing plans and persists one scoped requirement',()=>use(async f=>{
 const admin=await f.login('0001'),scoped=await f.login('0004'),teacher=await f.login('0003');
 f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES('COURSE:manual-empty','manual-empty','COURSE','AAA empty course',1,'ACTIVE',0)").run();
 f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES('COURSE:manual-inactive','manual-inactive','COURSE','Inactive course',0,'ARCHIVED',0)").run();
 for(const id of ['manual-empty','manual-inactive'])f.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run('COURSE:'+id);
 const list=ok(await post(f,'list',{view:'admin'},admin));assert(list.areas.some(a=>a.key==='COURSE:manual-empty'));assert(!list.areas.some(a=>a.key==='COURSE:manual-inactive'));assert.deepEqual(list.areas.map(a=>a.name),list.areas.map(a=>a.name).sort((a,b)=>a.localeCompare(b)));assert.deepEqual(list.plans,[]);
 const off={activityKey:area,plansRequired:false,previousRequired:true,operationId:crypto.randomUUID()};
 assert.equal((await post(f,'requirement',off,teacher)).status,403);ok(await post(f,'requirement',off,scoped));assert(ok(await post(f,'requirement',off,scoped)).replayed);
 assert.equal(ok(await post(f,'list',{view:'admin'},admin)).areas.find(a=>a.key===area).plansRequired,false);
 assert.equal((await post(f,'get',key,teacher)).body.code,'PLANS_NOT_REQUIRED');assert.equal((await change(f,'submit',{...key,revision:0,content:content()},teacher)).status,403);
 assert(!ok(await post(f,'list',{view:'teacher'},teacher)).areas.some(a=>a.key===area));
 assert.equal((await change(f,'requirement',{...off,plansRequired:true,previousRequired:true},admin)).status,409);
 assert.equal((await change(f,'requirement',{activityKey:'COURSE:manual-empty',plansRequired:false,previousRequired:true},scoped)).status,403);
}));
test('disabling and re-enabling planning preserves every stored draft and submission',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0001');ok(await change(f,'submit',{...key,revision:0,content:content()},teacher));
 const before=f.db.prepare('SELECT * FROM lesson_plans').get();
 ok(await change(f,'requirement',{activityKey:area,previousRequired:true,plansRequired:false},admin));
 assert.equal((await post(f,'get',{...key,teacherId:'account-0003'},admin)).status,403);assert.deepEqual(f.db.prepare('SELECT * FROM lesson_plans').get(),before);
 ok(await change(f,'requirement',{activityKey:area,previousRequired:false,plansRequired:true},admin));assert.equal(ok(await post(f,'get',{...key,teacherId:'account-0003'},admin)).content.overview,before.submitted_json&&content().overview);
}));
test('retired planning workflows reject old tabs without changing saved history',()=>use(async f=>{
 const admin=await f.login('0001');for(const action of ['policy','deadline','comment','sessions','session-policy']){const result=await change(f,action,{activityKey:area},admin);assert.equal(result.status,410,action);}
 for(const table of ['lesson_plan_policies','lesson_plan_deadlines','lesson_plan_comments'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
}));
test('saved weeks and entire-course submissions remain selectable without generated expectations',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0001');for(const date of ['2026-10-05','2026-10-19','2026-11-09']){const c=content();c.lessons[0].date=date;ok(await change(f,'submit',{...key,weekStart:date,revision:0,content:c},teacher));}
 const list=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week,weekCount:8},admin));assert.equal(list.weeks.length,8);assert.equal(list.plans.length,3);
 const k=courseTeacher(f),entire={...k,period:'ENTIRE',weekStart:''},c=content();c.lessons[0].date='';ok(await change(f,'submit',{...entire,revision:0,content:c},teacher));assert.equal(ok(await post(f,'get',entire,teacher)).period,'ENTIRE');
 assert.equal((await post(f,'list',{view:'admin',weekCount:99},admin)).status,400);
}));
function intercept(f,onCommit){const binding=f.env.ACADEMY_DB.withSession(),sql=new WeakMap();function tag(s,q){sql.set(s,q);const bind=s.bind;s.bind=(...values)=>tag(bind(...values),q);return s;}f.env.ACADEMY_DB={withSession:()=>({...binding,prepare:q=>tag(binding.prepare(q),q),batch:async ss=>{if(sql.get(ss[0])?.startsWith('INSERT INTO academy_write_guards'))return onCommit(ss,binding);return binding.batch(ss);}})};}
test('manual submission retries preserve a single committed plan after a lost acknowledgement',()=>use(async f=>{
 const teacher=await f.login('0003');let lost=false;intercept(f,async(ss,b)=>{const result=await b.batch(ss);if(!lost){lost=true;throw Error('Lost acknowledgement');}return result;});
 const input={...key,revision:0,content:content(),operationId:crypto.randomUUID()};assert(ok(await post(f,'submit',input,teacher)).replayed);assert(ok(await post(f,'submit',input,teacher)).replayed);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,1);
}));
test('revocation and a requirement disabled during a pending save cannot write a plan',()=>use(async f=>{
 const teacher=await f.login('0003');let disabled=false;intercept(f,async(ss,b)=>{if(!disabled){disabled=true;f.db.prepare('INSERT INTO lesson_plan_requirements VALUES(?,0)').run(area);}return b.batch(ss);});
 assert((await change(f,'submit',{...key,revision:0,content:content()},teacher)).status>=400);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,0);
}));
function courseTeacher(f){
 const c=f.db.prepare("SELECT * FROM activities WHERE kind='COURSE' LIMIT 1").get(),run=f.db.prepare('SELECT * FROM course_runs WHERE activity_key=? LIMIT 1').get(c.activity_key);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('grid-course-teacher','account-0003',c.activity_key,'TEACHER');
 f.db.prepare('UPDATE course_runs SET start_date=?,end_date=?,active=1 WHERE activity_key=? AND run_id=?').run('2026-09-01','2026-09-05',c.activity_key,run.run_id);
 return {activityKey:c.activity_key,runId:run.run_id,period:'WEEKLY',weekStart:week};
}
function closeCourse(f,k,stage){f.db.prepare("INSERT INTO course_management_drafts(activity_key,run_id,details_json,stage,updated_at,updated_by_account_id) VALUES(?,?,'{}',?,?,'account-0001') ON CONFLICT(activity_key,run_id) DO UPDATE SET stage=excluded.stage").run(k.activityKey,k.runId,stage,new Date().toISOString());}
test('Course plans remain open after the scheduled end date and close only with completion/cancellation/archive',()=>use(async f=>{
 const k=courseTeacher(f),teacher=await f.login('0003'),admin=await f.login('0001');
 let b=ok(await post(f,'list',{view:'admin',activityKey:k.activityKey,weekStart:week,weekCount:8},admin));assert.equal(b.plans.length,0);assert.equal(ok(await post(f,'get',k,teacher)).canSubmit,true);
 ok(await change(f,'submit',{...k,revision:0,content:content()},teacher));
 for(const stage of ['COMPLETE','CANCELLED','ARCHIVED']){
  closeCourse(f,k,stage);
  assert.equal((await change(f,'submit',{...k,revision:1,content:content()},teacher)).body.code,'PLANNING_CLOSED');
  assert.equal((await change(f,'save',{...k,revision:1,content:content()},teacher)).status,409);
  const mine=ok(await post(f,'get',k,teacher));assert.equal(mine.canEdit,false);
  const review=ok(await post(f,'get',{...k,teacherId:'account-0003'},admin));assert.equal(review.content.overview,'Prepare the class');
  b=ok(await post(f,'list',{view:'admin',activityKey:k.activityKey,weekStart:week,weekCount:8},admin));assert.equal(b.plans.length,1);assert.equal(b.plans[0].canSubmit,false);assert.equal(b.areas.find(a=>a.key===k.activityKey).runs[0].canSubmit,false);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_revisions').get().n,1);
}));
test('a Course closed during a pending submission cannot receive a new plan',()=>use(async f=>{
 const k=courseTeacher(f),teacher=await f.login('0003');let closed=false;
 intercept(f,async(ss,b)=>{if(!closed){closed=true;closeCourse(f,k,'COMPLETE');f.db.exec('UPDATE academy_write_state SET version=version+1 WHERE singleton=1');}return b.batch(ss);});
 const r=await change(f,'submit',{...k,revision:0,content:content()},teacher);assert.equal(r.status,409);assert.equal(r.body.code,'PLANNING_CLOSED');assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,0);
}));
