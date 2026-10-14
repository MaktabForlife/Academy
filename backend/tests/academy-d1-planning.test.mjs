import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {MOU_MEDIA_PROGRAM as area} from '../src/academy/d1/lesson-media.js';
import {planningInstant} from '../src/academy/d1/lesson-planning.js';
const week='2026-10-19',content=()=>({title:'Weekly plan',overview:'Prepare the class',reflection:'',lessons:[{date:week,className:'Class A',subject:'Quran',objectives:'Read clearly',activities:'Read and revise',resources:'Pages 1–4'}]});
export async function planningFixture(){const f=await mediaFixture();for(const migration of ['0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));return f;}
async function use(fn){const f=await planningFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const post=(f,action,input,token)=>f.call('/api/academy/planning/'+action,input,token);
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const key={activityKey:area,weekStart:week,period:'WEEKLY'};
const change=(f,action,input,token)=>post(f,action,{...input,operationId:crypto.randomUUID()},token);
test('planning scopes, expected missing plans, private drafts, submissions and admin feedback',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0004'),student=await f.login('0002'),other=await f.login('0006');
 assert.equal((await post(f,'list',{view:'teacher'},student)).status,403);
 assert.equal((await post(f,'list',{view:'admin'},teacher)).status,403);
 const board=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week},admin));assert.equal(board.plans.length,2);assert.ok(board.plans.every(p=>!p.planId));
 let mine=ok(await post(f,'get',key,teacher));assert.equal(mine.revision,0);
 const request={...key,revision:0,content:content(),operationId:crypto.randomUUID()};
 ok(await post(f,'save',request,teacher));assert.equal(ok(await post(f,'save',request,teacher)).replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,1);
 assert.equal((await post(f,'get',{...key,teacherId:'account-0003'},admin)).status,409);
 assert.equal((await post(f,'get',{...key,teacherId:'account-0003'},other)).status,403);
 assert.equal((await change(f,'save',{...key,teacherId:'account-0006',revision:0,content:content()},teacher)).status,403);
 ok(await change(f,'submit',{...key,revision:1,content:content()},teacher));
 let review=ok(await post(f,'get',{...key,teacherId:'account-0003'},admin));assert.equal(review.canEdit,false);assert.equal(review.canComment,true);
 const comment={...key,teacherId:'account-0003',submittedRevision:2,body:'Please add revision activities.',operationId:crypto.randomUUID()};ok(await post(f,'comment',comment,admin));assert.equal(ok(await post(f,'comment',comment,admin)).replayed,true);
 assert.equal(ok(await post(f,'get',key,teacher)).comments.length,1);
 assert.equal((await change(f,'comment',{...key,submittedRevision:2,body:'Self approval'},teacher)).status,403);
 const changed=content();changed.overview='Private revision';ok(await change(f,'save',{...key,revision:2,content:changed},teacher));
 review=ok(await post(f,'get',{...key,teacherId:'account-0003'},admin));assert.equal(review.content.overview,'Prepare the class');assert.equal(ok(await post(f,'get',key,teacher)).content.overview,'Private revision');
 const submittedView=ok(await post(f,'get',{...key,view:'admin'},teacher));assert.equal(submittedView.content.overview,'Prepare the class');assert.equal(submittedView.canEdit,false,'Opening a submitted cell never opens a newer private draft');
 assert.equal((await change(f,'save',{...key,revision:2,content:content()},teacher)).status,409);
 ok(await change(f,'submit',{...key,revision:3,content:changed},teacher));assert.equal((await change(f,'comment',{...comment,submittedRevision:2},admin)).status,409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_revisions').get().n,4);
 assert.throws(()=>f.db.exec('DELETE FROM lesson_plan_comments'),/append-only/);
}));
test('deadline policies, extensions, timezones, late submissions and whole-course preferences',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0001'),scoped=await f.login('0004');
 assert.equal(planningInstant('2026-10-18','18:00','Africa/Johannesburg'),'2026-10-18T16:00:00.000Z');
 let b=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week},admin));assert.equal(b.plans[0].dueAt,'2026-10-18T16:00:00.000Z');
 ok(await change(f,'policy',{activityKey:area,revision:0,weeklyDay:5,weeklyTime:'17:00',courseLeadDays:5},scoped));assert.equal((await change(f,'policy',{activityKey:area,revision:0,weeklyDay:0,weeklyTime:'18:00',courseLeadDays:3},scoped)).status,409);
 b=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week},admin));assert.equal(b.plans[0].dueAt,'2026-10-16T15:00:00.000Z');
 ok(await change(f,'deadline',{...key,teacherId:'account-0003',revision:0,dueDate:'2026-10-20',dueTime:'18:00',reason:'Approved extension'},scoped));
 assert.equal(ok(await post(f,'get',key,teacher)).dueAt,'2026-10-20T16:00:00.000Z');
 assert.equal((await change(f,'deadline',{...key,teacherId:'account-0003',revision:1,dueDate:'2026-10-15',dueTime:'18:00',reason:'Earlier'},scoped)).status,400);
 const c=f.db.prepare("SELECT * FROM activities WHERE kind='COURSE' LIMIT 1").get(),run=f.db.prepare('SELECT * FROM course_runs WHERE activity_key=? LIMIT 1').get(c.activity_key);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('planning-course-role','account-0003',c.activity_key,'TEACHER');
 const all={activityKey:c.activity_key,runId:run.run_id,period:'ENTIRE',weekStart:''};let draft=ok(await post(f,'get',all,teacher));assert.equal(draft.period,'ENTIRE');
 const full=content();full.lessons[0].date='';ok(await change(f,'submit',{...all,revision:0,content:full},teacher));
 b=ok(await post(f,'list',{view:'admin',activityKey:c.activity_key,weekStart:week},admin));assert.equal(b.plans.find(p=>p.teacherId==='account-0003').period,'ENTIRE');
 assert.equal((await change(f,'policy',{activityKey:c.activity_key,revision:0,weeklyDay:0,weeklyTime:'18:00',courseLeadDays:3},scoped)).status,403);
 assert.equal((await post(f,'get',{...key,period:'ENTIRE'},teacher)).status,400);
}));
test('planning saves roll back atomically and retries are idempotent',()=>use(async f=>{
 const teacher=await f.login('0003');f.db.exec("CREATE TRIGGER reject_plan_revision BEFORE INSERT ON lesson_plan_revisions BEGIN SELECT RAISE(ABORT,'injected failure');END");
 assert.equal((await change(f,'submit',{...key,revision:0,content:content()},teacher)).status,503);
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM operation_receipts WHERE dataset_key='LESSON_PLANS'").get().n,0);
 f.db.exec('DROP TRIGGER reject_plan_revision');
 // Ordinary retries remain idempotent after a successful save.
 const request={...key,revision:0,content:content(),operationId:crypto.randomUUID()};ok(await post(f,'submit',request,teacher));assert.equal(ok(await post(f,'submit',request,teacher)).replayed,true);
}));
function intercept(f,onCommit){const binding=f.env.ACADEMY_DB.withSession(),sql=new WeakMap();function tag(s,q){sql.set(s,q);const bind=s.bind;s.bind=(...values)=>tag(bind(...values),q);return s;}f.env.ACADEMY_DB={withSession:()=>({...binding,prepare:q=>tag(binding.prepare(q),q),batch:async ss=>{if(sql.get(ss[0])?.startsWith('INSERT INTO academy_write_guards'))return onCommit(ss,binding);return binding.batch(ss);}})};}
test('lost acknowledgements recover the committed receipt without duplicate plans or comments',()=>use(async f=>{
 const teacher=await f.login('0003');let lost=false;intercept(f,async(ss,b)=>{const result=await b.batch(ss);if(!lost){lost=true;throw Error('Lost acknowledgement');}return result;});
 const request={...key,revision:0,content:content(),operationId:crypto.randomUUID()};assert.equal(ok(await post(f,'submit',request,teacher)).replayed,true);assert.equal(ok(await post(f,'submit',request,teacher)).replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_revisions').get().n,1);
 const admin=await f.login('0004');lost=false;const comment={...key,teacherId:'account-0003',submittedRevision:1,body:'Feedback survives a lost acknowledgement.',operationId:crypto.randomUUID()};assert.equal(ok(await post(f,'comment',comment,admin)).replayed,true);assert.equal(ok(await post(f,'comment',comment,admin)).replayed,true);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plan_comments').get().n,1);
}));
test('teacher authority revoked between planning and commit blocks every write',()=>use(async f=>{
 const teacher=await f.login('0003');let revoked=false;intercept(f,async(ss,b)=>{if(!revoked){revoked=true;f.db.prepare("UPDATE role_assignments SET active=0 WHERE activity_key=? AND account_id='account-0003'").run(area);}return b.batch(ss);});
 assert.equal((await change(f,'submit',{...key,revision:0,content:content()},teacher)).status,401);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,0);
}));
test('late submissions remain allowed, first submission timing survives edits, and concurrent edits conflict',()=>use(async f=>{
 const teacher=await f.login('0003'),past={...key,weekStart:'2026-10-05'},c=content();c.lessons[0].date='2026-10-05';
 ok(await change(f,'submit',{...past,revision:0,content:c},teacher));const mine=ok(await post(f,'get',past,teacher));assert.equal(mine.status,'SUBMITTED_LATE');
 const results=await Promise.all([change(f,'save',{...past,revision:1,content:{...c,overview:'A'}},teacher),change(f,'save',{...past,revision:1,content:{...c,overview:'B'}},teacher)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(ok(await post(f,'get',past,teacher)).submittedAt,mine.submittedAt);
 const admin=await f.login('0004');ok(await change(f,'policy',{activityKey:area,revision:0,weeklyDay:5,weeklyTime:'16:00',courseLeadDays:7},admin));assert.equal(ok(await post(f,'get',past,teacher)).dueAt,mine.dueAt,'A new default does not rewrite submitted deadline history');
}));

test('admin week grid loads bounded neighbouring weeks and keeps submissions in the correct teacher/week cells',()=>use(async f=>{
 const teacher=await f.login('0003'),admin=await f.login('0004'),other=await f.login('0006');
 for(const date of ['2026-10-05','2026-10-19','2026-11-09']){const c=content();c.lessons[0].date=date;ok(await change(f,'submit',{...key,weekStart:date,revision:0,content:c},teacher));}
 const privateDraft=content();privateDraft.overview='Never visible to administrators';privateDraft.lessons[0].date='2026-10-12';ok(await change(f,'save',{...key,weekStart:'2026-10-12',revision:0,content:privateDraft},other));
 const b=ok(await post(f,'list',{view:'admin',activityKey:area,weekStart:week,weekCount:8},admin));
 assert.deepEqual(b.weeks,['2026-10-05','2026-10-12','2026-10-19','2026-10-26','2026-11-02','2026-11-09','2026-11-16','2026-11-23']);
 assert.equal(b.plans.length,16);assert.equal(b.areas.find(a=>a.key===area).teachers.length,2);
 assert.deepEqual(b.plans.filter(p=>p.submittedAt).map(p=>p.weekStart).sort(),['2026-10-05','2026-10-19','2026-11-09']);
 assert.equal(JSON.stringify(b).includes(privateDraft.overview),false);
 const review=ok(await post(f,'get',{...key,weekStart:'2026-10-05',teacherId:'account-0003'},admin));assert.equal(review.content.lessons[0].date,'2026-10-05');
 assert.equal((await post(f,'list',{view:'admin',weekStart:week,weekCount:99},admin)).status,400);
 assert.equal(ok(await post(f,'list',{view:'teacher',activityKey:area,weekStart:week,weekCount:8},teacher)).weeks.length,1);
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
 let b=ok(await post(f,'list',{view:'admin',activityKey:k.activityKey,weekStart:week,weekCount:8},admin));assert(b.plans.some(p=>p.teacherId==='account-0003'&&p.weekStart===week&&p.canSubmit));
 ok(await change(f,'submit',{...k,revision:0,content:content()},teacher));
 for(const stage of ['COMPLETE','CANCELLED','ARCHIVED']){
  closeCourse(f,k,stage);
  assert.equal((await change(f,'submit',{...k,revision:1,content:content()},teacher)).body.code,'PLANNING_CLOSED');
  assert.equal((await change(f,'save',{...k,revision:1,content:content()},teacher)).status,409);
  const mine=ok(await post(f,'get',k,teacher));assert.equal(mine.canEdit,false);assert.equal(mine.courseStage,stage);
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
