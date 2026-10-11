import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {moduleId,subject} from './fixtures/academy-d1-learning-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {programToday,WEEKLY_SCHEMA} from '../src/programs/weekly-timetable.js';
import worker from '../src/worker.js';
const id=PROGRAM_IDS[0],activity='PROGRAM:'+id,tt='/api/admin/platform/program-timetable/',av='/api/academy/teacher-availability/';
const tomorrow=()=>new Date(Date.parse(programToday('Africa/Johannesburg')+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export async function programFixture(){const f=await courseFixture();for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql','0010_shared_module_catalogue.sql','0012_program_workspace.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';return f;}
export async function post(env,path,body={},token=''){const r=await worker.fetch(new Request('https://synthetic.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,n='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+n,pin:'1234'})).token;
const change=(env,path,body,token)=>post(env,path,{...body,operationId:crypto.randomUUID()},token);
const get=async(env,token)=>ok(await post(env,tt+'get',{id},token));
const draft=()=>({format:WEEKLY_SCHEMA,timezone:'Africa/Johannesburg',rules:[{id:'RULE-workspace',moduleId,programSubjectId:subject,classIds:['class-1'],teacherId:'account-0003',weekdays:[0,1,2,3,4,5,6],startTime:'10:00',endTime:'11:00',zoomLink:'https://zoom.us/j/11111111111'}]});
async function use(fn){const f=await programFixture(),original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected external request');};try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=original;f.db.close();}}
const save=async(env,token,d=draft())=>{const current=await get(env,token);return ok(await change(env,tt+'save',{id,revision:current.revision,draft:{...d,timetableId:current.timetableId}},token));};

test('Program drafts require only a name and create one editable class atomically',()=>use(async({env,db})=>{
 const admin=await login(env),request={id:'PRG-'+crypto.randomUUID(),name:'New Program',status:'DRAFT',timezone:'Africa/Johannesburg',durationYears:'',operationId:crypto.randomUUID()};
 const result=ok(await post(env,'/api/admin/platform/programs/create',request,admin));assert.equal(result.program.status,'DRAFT');
 assert.equal(ok(await post(env,'/api/admin/platform/programs/create',request,admin)).replayed,true);
 const classes=db.prepare('SELECT * FROM classes WHERE activity_key=?').all('PROGRAM:'+request.id);assert.equal(classes.length,1);assert.match(classes[0].name,/New Program Class \d{4}/);assert.equal(classes[0].zoom_link,null);
 const scoped=await login(env,'0004'),current=await get(env,scoped);
 const changed=ok(await change(env,'/api/admin/platform/programs/save',{id,name:'Scoped name change',status:'ARCHIVED',revision:current.program.revision,durationYears:'',timezone:current.program.timezone},scoped));assert.equal(changed.program.name,'Scoped name change');assert.equal(changed.program.status,'ACTIVE');
 assert.equal((await change(env,'/api/admin/platform/programs/create',{...request,id:'PRG-'+crypto.randomUUID()},scoped)).status,403);
}));
test('teaching availability is self-only, validates ranges, records scoped notices and replays exactly',()=>use(async({env,db})=>{
 const teacher=await login(env,'0003'),admin=await login(env),scoped=await login(env,'0004'),student=await login(env,'0002');
 const initial=ok(await post(env,av+'get',{},teacher));assert.equal(initial.available,true);assert.equal(initial.configured,false);
 const ranges=[{id:'AVAIL-synthetic',weekday:1,startTime:'830',endTime:'11h30'}],input={revision:0,ranges,accountId:'account-0002',operationId:crypto.randomUUID()};
 const result=ok(await post(env,av+'save',input,teacher));assert.equal(result.ranges[0].startTime,'08:30');assert.ok(result.notified>=2);
 assert.equal(ok(await post(env,av+'save',input,teacher)).replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability WHERE account_id=?').get('account-0002').n,0);
 assert.equal(ok(await post(env,av+'get',{},admin)).notices.length,1);assert.equal(ok(await post(env,av+'get',{},scoped)).notices.length,1);assert.equal(ok(await post(env,av+'get',{},student)).notices.length,0);
 assert.equal((await change(env,av+'save',{revision:0,ranges:[]},student)).status,403);
 assert.equal((await change(env,av+'save',{revision:0,ranges:[]},teacher)).status,409);
 assert.equal((await change(env,av+'save',{revision:1,ranges:[...result.ranges,{...result.ranges[0],id:'AVAIL-overlap'}]},teacher)).status,400);
}));
test('sessions require teachers, obey Zoom precedence and central availability at publication',()=>use(async({env,db})=>{
 const admin=await login(env),teacher=await login(env,'0003'),current=await get(env,admin),d={...draft(),timetableId:current.timetableId,programZoomLink:'https://zoom.us/j/99999999999'};
 let review=ok(await post(env,tt+'preview',{id,draft:d,effectiveFrom:tomorrow()},admin));assert.equal(review.valid,true,JSON.stringify(review));assert.ok(review.occurrences.every(r=>r.zoomLink===d.programZoomLink));assert.ok(!review.warnings.some(w=>/not entered/.test(w)));
 const unassigned=structuredClone(d);unassigned.rules[0].teacherMode='NONE';unassigned.rules[0].teacherId='';review=ok(await post(env,tt+'preview',{id,draft:unassigned},admin));assert.equal(review.valid,false);assert.ok(review.issues.some(i=>/at least one teacher/.test(i.message)));assert.ok(review.occurrences.length>0,'An unvalidated draft remains shareable');assert.ok(review.occurrences.every(r=>r.teacherIds.length===0));
 await save(env,admin,d);const saved=await get(env,admin);const input={id,draft:saved.draft,revision:saved.revision,effectiveFrom:tomorrow()};
 assert.equal((await change(env,tt+'publish',{...input,effectiveFrom:programToday('Africa/Johannesburg')},admin)).status,409);
 ok(await change(env,av+'save',{revision:0,ranges:[{id:'AVAIL-limited',weekday:1,startTime:'08:00',endTime:'09:00'}]},teacher));
 assert.equal((await change(env,tt+'publish',input,admin)).status,409);assert.equal(db.prepare('SELECT count(*) n FROM program_timetable_records WHERE status=?').get('PUBLISHED').n,0);
 ok(await change(env,av+'save',{revision:1,ranges:[]},teacher));
 const published=ok(await change(env,tt+'publish',input,admin));assert.ok(published.publicationId);assert.equal((await get(env,admin)).timetableEditable,false);
 assert.ok(db.prepare('SELECT zoom_link FROM published_lessons WHERE publication_id=?').all(published.publicationId).every(r=>r.zoom_link===d.programZoomLink));
}));
test('validation is invalidated by availability changes; copies get new IDs and keep originals',()=>use(async({env,db})=>{
 const admin=await login(env),teacher=await login(env,'0003');await save(env,admin);let current=await get(env,admin);
 const validated=ok(await change(env,tt+'validate',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));assert.equal(validated.valid,true);assert.equal((await get(env,admin)).timetableStatus,'VALID');
 ok(await change(env,av+'save',{revision:0,ranges:[{id:'AVAIL-1',weekday:1,startTime:'10:00',endTime:'11:00'}]},teacher));assert.equal((await get(env,admin)).timetableStatus,'DRAFT');
 const stale=await get(env,admin);assert.equal(ok(await post(env,tt+'record',{id,timetableId:stale.timetableId},admin)).status,'DRAFT');assert.equal(ok(await post(env,tt+'history',{id},admin)).records.find(r=>r.id===stale.timetableId).status,'DRAFT');
 current=await get(env,admin);const input={id,revision:current.revision,timetableId:current.timetableId,operationId:crypto.randomUUID()},copy=ok(await post(env,tt+'copy',input,admin));assert.notEqual(copy.timetableId,current.timetableId);assert.equal(ok(await post(env,tt+'copy',input,admin)).timetableId,copy.timetableId);
 const copied=await get(env,admin);assert.equal(copied.draft.rules.length,1);assert.equal(copied.timetableStatus,'DRAFT');assert.equal(copied.draft.timetableId,copy.timetableId);assert.equal(db.prepare('SELECT count(*) n FROM program_timetable_records').get().n,2);
 assert.equal((await change(env,tt+'save',{id,revision:copied.revision,draft:current.draft},admin)).status,409);
 assert.equal((await change(env,tt+'copy',{id:PROGRAM_IDS[1],revision:copied.revision,timetableId:copy.timetableId},admin)).status,409);
}));
test('cancelling a publication preserves snapshots, stops joining and never revives older schedules',()=>use(async({env,db})=>{
 const admin=await login(env);await save(env,admin);let current=await get(env,admin);
 const pub=ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin)),snapshot=db.prepare('SELECT snapshot_json FROM timetable_publications WHERE publication_id=?').get(pub.publicationId).snapshot_json;
 current=await get(env,admin);ok(await change(env,tt+'status',{id,revision:current.revision,timetableId:current.timetableId,status:'CANCELLED'},admin));
 assert.equal(db.prepare('SELECT snapshot_json FROM timetable_publications WHERE publication_id=?').get(pub.publicationId).snapshot_json,snapshot);
 const history=ok(await post(env,tt+'history',{id},admin));assert.equal(history.publications.find(p=>p.id===pub.publicationId).status,'CANCELLED');
 const home=ok(await post(env,'/api/academy/entrance',{startDate:tomorrow()},admin));assert.ok(!home.personalTimetable.some(l=>l.activityId===id));
 assert.equal((await post(env,'/api/academy/lesson/join',{date:tomorrow(),joinKey:pub.publicationId},admin)).status,403);
 const record=ok(await post(env,tt+'record',{id,timetableId:current.timetableId},admin));assert.equal(record.status,'CANCELLED');assert.equal(record.occurrences.length,7);
 const copy=ok(await change(env,tt+'copy',{id,revision:current.revision,timetableId:current.timetableId},admin));assert.notEqual(copy.timetableId,current.timetableId);assert.equal((await get(env,admin)).timetableEditable,true);
}));
test('availability changes roll back completely when a notice cannot be saved',()=>use(async({env,db})=>{
 const teacher=await login(env,'0003');db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON teacher_availability_notices BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await change(env,av+'save',{revision:0,ranges:[]},teacher)).status,503);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
}));
test('public cards are saved together as JSON and never inferred from lesson times or Program names',()=>use(async({env,db})=>{
 const admin=await login(env),scoped=await login(env,'0004');let current=await get(env,scoped);
 const publicCard={time:'7am',title:'Ladies Alimiyah',description:'4 yr structured scholarship of **Quran, Sunnah, and Islamic law**'};
 const input={id,revision:current.program.revision,name:current.program.name,durationYears:'',timezone:current.program.timezone,status:'ACTIVE',publicCard,operationId:crypto.randomUUID()};
 const saved=ok(await post(env,'/api/admin/platform/programs/save',input,scoped));assert.deepEqual(saved.program.publicCard,publicCard);assert.equal(ok(await post(env,'/api/admin/platform/programs/save',input,scoped)).replayed,true);
 assert.deepEqual(JSON.parse(db.prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').get(activity).public_card_json),publicCard);
 current=await get(env,scoped);assert.equal((await change(env,'/api/admin/platform/programs/save',{...input,revision:current.program.revision,publicCard:{...publicCard,description:'x'.repeat(241)}},scoped)).status,400);
 assert.equal((await change(env,'/api/admin/platform/programs/save',{...input,revision:current.program.revision,publicCard:{...publicCard,time:''}},scoped)).status,400);
 await save(env,admin);current=await get(env,admin);ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 const {academyD1Repository}=await import('../src/academy/d1/repository.js'),{d1Entrance}=await import('../src/academy/d1/entrance.js'),{publicTimetableSnapshot,publicTimetableDay}=await import('../src/academy/d1/public-timetable.js');
 const repository=academyD1Repository(env);await repository.ready();const now=new Date(tomorrow()+'T07:00:00Z'),data=await d1Entrance(repository,null,null,{startDate:tomorrow()},now);
 const lesson=data.timetable.find(row=>row.activityId===id);assert.equal(lesson.startTime,'10:00');assert.deepEqual(lesson.publicCard,publicCard);
 const snapshot=publicTimetableSnapshot(data,publicTimetableDay(now),now),card=snapshot.timetable.find(row=>row.activityId===id);assert.deepEqual(card.publicCard,publicCard);assert.ok(!JSON.stringify(snapshot).includes('zoom.us'));
 // Stored snapshot reads whitelist the JSON again; unexpected keys cannot leak.
 card.publicCard.privateUrl='https://private.invalid';assert.deepEqual(publicTimetableSnapshot(snapshot,publicTimetableDay(now),now).timetable.find(row=>row.activityId===id).publicCard,publicCard);
}));
