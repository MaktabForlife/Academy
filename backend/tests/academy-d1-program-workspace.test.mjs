import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {moduleId,subject} from './fixtures/academy-d1-learning-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {programToday,WEEKLY_SCHEMA} from '../src/programs/weekly-timetable.js';
import worker from '../src/academy-runtime.js';
const id=PROGRAM_IDS[0],activity='PROGRAM:'+id,tt='/api/admin/platform/program-timetable/',av='/api/academy/teacher-availability/';
const tomorrow=()=>new Date(Date.parse(programToday('Africa/Johannesburg')+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export async function programFixture(){const f=await courseFixture();for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql','0010_shared_module_catalogue.sql','0012_program_workspace.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';return f;}
export async function post(env,path,body={},token=''){const r=await worker.fetch(new WorkspaceRequest('https://synthetic.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};}
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
test('Admin manages Teacher availability; Teach stays read only and ranges, notices and retries are retained',()=>use(async({env,db})=>{
 const teacher=await login(env,'0003'),admin=await login(env),scoped=await login(env,'0004'),student=await login(env,'0002');
 const initial=ok(await post(env,av+'get',{},teacher));assert.equal(initial.available,false);assert.equal(initial.configured,false);
 const ranges=[{id:'AVAIL-synthetic',weekday:1,startTime:'830',endTime:'11h30'}],input={accountId:'account-0003',revision:0,ranges,operationId:crypto.randomUUID()};
 assert.equal((await post(env,av+'get',{accountId:'account-0005'},teacher)).status,403);
 assert.equal((await post(env,av+'save',{...input,accountId:'account-0005'},teacher)).status,403);
 assert.equal((await post(env,av+'save',input,teacher)).status,403);const result=ok(await post(env,av+'save',input,admin));assert.equal(result.ranges[0].startTime,'08:30');assert.ok(result.notified>=2);
 assert.equal(ok(await post(env,av+'save',input,admin)).replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability WHERE account_id=?').get('account-0002').n,0);
 assert.equal(ok(await post(env,av+'get',{},admin)).notices.length,1);assert.equal(ok(await post(env,av+'get',{},scoped)).notices.length,1);assert.equal(ok(await post(env,av+'get',{},student)).notices.length,0);
 assert.equal((await change(env,av+'save',{revision:0,ranges:[]},student)).status,403);
 assert.equal((await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[]},admin)).status,409);
 assert.equal((await change(env,av+'save',{accountId:'account-0003',revision:1,ranges:[...result.ranges,{...result.ranges[0],id:'AVAIL-overlap'}]},admin)).status,400);
}));
test('sessions require teachers, obey Zoom precedence and central availability at publication',()=>use(async({env,db})=>{
 const admin=await login(env),teacher=await login(env,'0003'),current=await get(env,admin),d={...draft(),timetableId:current.timetableId,programZoomLink:'https://zoom.us/j/99999999999'};
 let review=ok(await post(env,tt+'preview',{id,draft:d,effectiveFrom:tomorrow()},admin));assert.equal(review.valid,true,JSON.stringify(review));assert.ok(review.occurrences.every(r=>r.zoomLink===d.programZoomLink));assert.ok(!review.warnings.some(w=>/not entered/.test(w)));
 const unassigned=structuredClone(d);unassigned.rules[0].teacherMode='NONE';unassigned.rules[0].teacherId='';
 db.prepare('DELETE FROM class_teacher_assignments WHERE activity_key=? AND class_id=?').run(activity,'class-1');
 review=ok(await post(env,tt+'preview',{id,draft:unassigned},admin));assert.equal(review.valid,false);assert.ok(review.issues.some(i=>/at least one teacher/.test(i.message)));assert.ok(review.occurrences.length>0,'An unvalidated draft remains shareable');assert.ok(review.occurrences.every(r=>r.teacherIds.length===0));
 await save(env,admin,d);const saved=await get(env,admin);const input={id,draft:saved.draft,revision:saved.revision,effectiveFrom:tomorrow()};
 assert.equal((await change(env,tt+'publish',{...input,effectiveFrom:programToday('Africa/Johannesburg')},admin)).status,409);
 ok(await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[{id:'AVAIL-limited',weekday:1,startTime:'08:00',endTime:'09:00'}]},admin));
 assert.equal((await change(env,tt+'publish',input,admin)).status,409);assert.equal(db.prepare('SELECT count(*) n FROM program_timetable_records WHERE status=?').get('PUBLISHED').n,0);
 ok(await change(env,av+'save',{accountId:'account-0003',revision:1,ranges:[]},admin));
 const published=ok(await change(env,tt+'publish',input,admin));assert.ok(published.publicationId);assert.equal((await get(env,admin)).timetableEditable,false);
 const alreadyPublished=await get(env,admin),rejected=await change(env,tt+'validate',{id,revision:alreadyPublished.revision,draft:alreadyPublished.draft,effectiveFrom:tomorrow()},admin);
 assert.equal(rejected.status,409);assert.equal(rejected.body.code,'TIMETABLE_READ_ONLY');
 assert.ok(db.prepare('SELECT zoom_link FROM published_lessons WHERE publication_id=?').all(published.publicationId).every(r=>r.zoom_link===d.programZoomLink));
}));
test('validation is invalidated by availability changes; copies get new IDs and keep originals',()=>use(async({env,db})=>{
 const admin=await login(env),teacher=await login(env,'0003');await save(env,admin);let current=await get(env,admin);
 const validated=ok(await change(env,tt+'validate',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));assert.equal(validated.valid,true);assert.equal((await get(env,admin)).timetableStatus,'VALID');
 ok(await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[{id:'AVAIL-1',weekday:1,startTime:'10:00',endTime:'11:00'}]},admin));assert.equal((await get(env,admin)).timetableStatus,'DRAFT');
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
 const admin=await login(env);db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON teacher_availability_notices BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[]},admin)).status,503);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
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

test('Global Admin edits all teachers, scoped Admin edits assigned teachers, and notices name the changed teacher',()=>use(async({env,db})=>{
 const admin=await login(env),scoped=await login(env,'0004'),teacher=await login(env,'0003');
 db.prepare('INSERT INTO academy_teacher_designations VALUES(?,1,1,?,?)').run('account-0009',new Date().toISOString(),'account-0001');
 const target='account-0009';
 assert.equal((await post(env,av+'get',{accountId:target},scoped)).status,403);
 assert.equal((await change(env,av+'save',{accountId:target,revision:0,ranges:[]},scoped)).status,403);
 assert.equal(ok(await post(env,av+'get',{accountId:target},admin)).available,true);
 const input={accountId:target,revision:0,ranges:[{id:'AVAIL-admin',weekday:4,startTime:'2030',endTime:'21h30'}],operationId:crypto.randomUUID()};
 const changed=ok(await post(env,av+'save',input,admin));assert.equal(changed.accountId,target);assert.equal(changed.teacherName,'Synthetic learner 9');assert.equal(changed.ranges[0].startTime,'20:30');
 assert.equal(ok(await post(env,av+'save',input,admin)).replayed,true);
 assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability WHERE account_id=?').get('account-0001').n,0);
 assert.equal(db.prepare('SELECT account_id FROM teacher_availability_changes').get().account_id,target);
 assert.equal(db.prepare("SELECT actor_account_id FROM audit_events WHERE record_kind='TEACHER_AVAILABILITY'").get().actor_account_id,'account-0001');
 assert.equal((await post(env,av+'get',{accountId:target},teacher)).status,403);
 assert.equal((await post(env,av+'get',{accountId:'account-0002'},admin)).status,403,'A Student does not become a teacher through this endpoint');
 let own=ok(await post(env,av+'get',{accountId:'account-0003'},scoped));assert.equal(own.available,true);
 ok(await change(env,av+'save',{accountId:'account-0003',revision:own.revision,ranges:[{id:'AVAIL-scoped',weekday:1,startTime:'09:00',endTime:'12:00'}]},scoped));
 assert.equal(ok(await post(env,av+'get',{},teacher)).ranges[0].startTime,'09:00');
 assert.ok(ok(await post(env,av+'get',{},scoped)).notices.some(n=>n.teacher==='Synthetic learner 3'));
 assert.equal((await change(env,av+'save',{accountId:'account-0003',revision:own.revision,ranges:[]},admin)).status,409);
 // A designated teacher becomes editable through a default class assignment.
 db.prepare('UPDATE class_teacher_assignments SET account_id=? WHERE activity_key=? AND class_id=?').run(target,activity,'class-1');
 assert.equal(ok(await post(env,av+'get',{accountId:target},scoped)).available,true);
 const page=await get(env,scoped);assert.equal(page.catalog.teachers.find(t=>t.id===target).availabilityEditable,true);
 db.prepare('DELETE FROM class_teacher_assignments WHERE account_id=?').run(target);
 assert.equal((await post(env,av+'get',{accountId:target},scoped)).status,403);
 assert.equal((await get(env,scoped)).catalog.teachers.find(t=>t.id===target).availabilityEditable,false);
 assert.equal((await post(env,av+'get',{accountId:[]},admin)).status,400);
}));

test('availability admin authority is rechecked inside the write transaction',()=>use(async({env,db})=>{
 const scoped=await login(env,'0004'),base=env.ACADEMY_DB.withSession(),sql=new WeakMap();let revoked=false;
 // Keep statements owned by the original binding while intercepting its batch.
 const originals=new WeakMap();
 const prepare=source=>{const wrap=statement=>{const result={...statement,bind:(...values)=>wrap(statement.bind(...values))};originals.set(result,statement);sql.set(result,source);return result;};return wrap(base.prepare(source));};
 env.ACADEMY_DB={withSession:()=>({prepare,batch:async statements=>{if(!revoked&&sql.get(statements[0])?.includes('INSERT INTO academy_write_guards')){revoked=true;db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0004' AND activity_key=?").run(activity);db.prepare("UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004' AND activity_key=?").run(activity);db.exec('UPDATE academy_write_state SET version=version+1');}return base.batch(statements.map(s=>originals.get(s)||s));}})};
 const response=await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[]},scoped);
 assert.ok([401,403].includes(response.status),JSON.stringify(response));assert.equal(revoked,true);
 assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM operation_receipts WHERE dataset_key='TEACHER_AVAILABILITY'").get().n,0);
}));

test('class teachers are inherited by validation, availability checks and publication, including older unassigned draft rows',()=>use(async({env,db})=>{
 const admin=await login(env),scoped=await login(env,'0004'),teacher=await login(env,'0003'),d=draft();d.rules[0].teacherId='';d.rules[0].teacherMode='NONE';
 let review=ok(await post(env,tt+'preview',{id,draft:d},admin));assert.equal(review.valid,true,JSON.stringify(review));assert.ok(review.occurrences.every(r=>r.teacherId==='account-0003'&&r.assignmentMode==='CLASS'));
 await save(env,admin,d);let current=await get(env,admin);
 ok(await change(env,tt+'validate',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 assert.equal((await get(env,scoped)).timetableStatus,'VALID','UI-only edit permissions do not change validation fingerprints between admins');
 ok(await change(env,av+'save',{accountId:'account-0003',revision:0,ranges:[{id:'AVAIL-inherited',weekday:1,startTime:'08:00',endTime:'09:00'}]},scoped));
 review=ok(await post(env,tt+'preview',{id,draft:d},admin));assert.equal(review.valid,false);assert.ok(review.issues.some(i=>/unavailable/.test(i.message)));
 ok(await change(env,av+'save',{accountId:'account-0003',revision:1,ranges:[]},admin));current=await get(env,admin);
 const publication=ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 const published=db.prepare('SELECT snapshot_json FROM timetable_publications WHERE publication_id=?').get(publication.publicationId);
 assert.ok(JSON.parse(published.snapshot_json).rules.every(r=>r.teacherId==='account-0003'&&r.assignmentMode==='CLASS'));
}));

test('publishing a new draft Program activates it atomically and exposes future lessons after fresh Academy sign-in',()=>use(async({env,db})=>{
 const admin=await login(env),newId='PRG-'+crypto.randomUUID(),key='PROGRAM:'+newId;
 const created=ok(await change(env,'/api/admin/platform/programs/create',{id:newId,name:'Synthetic new Program',timezone:'Africa/Johannesburg',status:'DRAFT'},admin));assert.equal(created.program.status,'DRAFT');
 let current=ok(await post(env,tt+'get',{id:newId},admin));
 const newClass=current.setup.rows.classes[0];
 ok(await change(env,tt+'manage-save',{id:newId,kind:'classes',record:{...newClass,TeacherAccountID:'account-0003'},creating:false,baseRowRevision:current.setup.rowRevisions.classes[newClass.ClassID]},admin));
 current=ok(await post(env,tt+'get',{id:newId},admin));const newSubject='PS-'+crypto.randomUUID();
 const shared=ok(await change(env,'/api/admin/platform/academy-subjects/save',{mode:'create',subjectName:'Synthetic publishing subject'},admin)).subject;
 ok(await change(env,tt+'manage-save',{id:newId,kind:'subjects',record:{ProgramSubjectID:newSubject,SubjectID:shared.SubjectID,Active:true},creating:true,baseRowRevision:current.setup.emptyRowRevision},admin));
 current=ok(await post(env,tt+'get',{id:newId},admin));
 const d={...draft(),timetableId:current.timetableId};d.rules[0]={...d.rules[0],moduleId:'',programSubjectId:newSubject,teacherId:'',classIds:[newClass.ClassID]};
 ok(await change(env,tt+'save',{id:newId,revision:current.revision,draft:d},admin));current=ok(await post(env,tt+'get',{id:newId},admin));
 const input={id:newId,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow(),operationId:crypto.randomUUID()};
 assert.equal(ok(await post(env,tt+'preview',input,admin)).valid,true);
 // Even an error after activation and publication must leave the entire Program as a draft.
 db.exec("CREATE TRIGGER fail_program_publish BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_TIMETABLE' AND NEW.action='publish' BEGIN SELECT RAISE(ABORT,'synthetic late publication failure'); END");
 assert.equal((await post(env,tt+'publish',input,admin)).status,503);
 assert.deepEqual({...db.prepare('SELECT lifecycle,active,website_visible FROM activities WHERE activity_key=?').get(key)},{lifecycle:'DRAFT',active:0,website_visible:0});
 assert.equal(db.prepare('SELECT count(*) n FROM timetable_publications WHERE activity_key=?').get(key).n,0);
 db.exec('DROP TRIGGER fail_program_publish');
 const published=ok(await post(env,tt+'publish',input,admin));assert.ok(published.publicationId);
 const activation=db.prepare('SELECT lifecycle,active,website_visible,revision FROM activities WHERE activity_key=?').get(key);
 assert.equal(activation.lifecycle,'ACTIVE');assert.equal(activation.active,1);assert.equal(activation.website_visible,1);assert.equal(activation.revision,Number(created.program.revision)+1);
 assert.equal(ok(await post(env,tt+'publish',input,admin)).replayed,true);
 assert.equal(db.prepare('SELECT revision FROM activities WHERE activity_key=?').get(key).revision,activation.revision,'Retry cannot activate or advance revisions twice');
 const fresh=ok(await post(env,tt+'get',{id:newId},admin));assert.equal(fresh.program.status,'ACTIVE');assert.equal(fresh.timetableStatus,'PUBLISHED');assert.equal(fresh.timetableEditable,false);
 assert.equal(ok(await post(env,'/api/admin/platform/programs/list',{},admin)).programs.find(p=>p.id===newId).status,'ACTIVE');
 // A stale Programs table must not silently save Draft over the newly active Program.
 assert.equal((await change(env,'/api/admin/platform/programs/save',{id:newId,name:created.program.name,status:'DRAFT',timezone:'Africa/Johannesburg',revision:created.program.revision},admin)).status,409);
 for(const n of ['0001','0003']){const freshToken=await login(env,n),home=ok(await post(env,'/api/academy/entrance',{startDate:input.effectiveFrom},freshToken));assert.ok(home.personalTimetable.some(l=>l.activityId===newId),JSON.stringify(home.personalTimetable));}
 const before=ok(await post(env,'/api/academy/entrance',{startDate:programToday('Africa/Johannesburg')},admin));assert.ok(!before.personalTimetable.some(l=>l.activityId===newId&&l.date<input.effectiveFrom),'Future publication does not expose earlier occurrences');
}));

test('a saved single-class Zoom link validates and publishes with no Program or lesson link',()=>use(async({env,db})=>{
 const admin=await login(env),link='https://zoom.us/j/22222222222';let current=await get(env,admin);
 const row=current.setup.rows.classes.find(c=>c.ClassID==='class-1');
 ok(await change(env,tt+'manage-save',{id,kind:'classes',record:{...row,ZoomLink:link},creating:false,baseRowRevision:current.setup.rowRevisions.classes[row.ClassID]},admin));
 const d={...draft(),programZoomLink:''};d.rules[0].zoomLink='';await save(env,admin,d);current=await get(env,admin);
 assert.equal(current.draft.programZoomLink,'');assert.equal(current.draft.rules[0].zoomLink,'');assert.equal(current.catalog.classes.find(c=>c.id==='class-1').zoomLink,link);
 const validation=ok(await change(env,tt+'validate',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));assert.equal(validation.valid,true,JSON.stringify(validation));assert.ok(validation.occurrences.every(r=>r.zoomLink===link&&r.zoomSource==='CLASS'));
 current=await get(env,admin);const published=ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 const lessons=db.prepare('SELECT zoom_link FROM published_lessons WHERE publication_id=?').all(published.publicationId);assert.ok(lessons.length);assert.ok(lessons.every(r=>r.zoom_link===link));
}));

for(const programLink of ['', 'https://zoom.us/j/99999999999'])test(`class link changes do not require republishing with ${programLink?'a published Program default':'no explicit Program Zoom setting'}`,()=>use(async({env,db})=>{
 const admin=await login(env),first='https://zoom.us/j/22222222222',second='https://zoom.us/j/33333333333';
 db.prepare('INSERT INTO academy_settings(setting_key,setting_value) VALUES(?,?)').run('ProgramAccess:'+activity,'FREE');
 db.prepare('UPDATE classes SET zoom_link=? WHERE activity_key=? AND class_id=?').run(first,activity,'class-1');
 const d={...draft(),programZoomLink:programLink};d.rules[0].zoomLink='';
 await save(env,admin,d);let current=await get(env,admin);
 assert.equal(current.program.programZoomConfigured,false);
 ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 const frozen=db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all();
 const {academyD1Repository}=await import('../src/academy/d1/repository.js'),{d1Entrance}=await import('../src/academy/d1/entrance.js'),{d1LessonJoin}=await import('../src/academy/d1/lesson-join.js');
 const repository=academyD1Repository(env),now=new Date(tomorrow()+'T08:00:00Z');
 const data=await d1Entrance(repository,null,null,{startDate:tomorrow()},now),lesson=data.timetable.find(r=>r.activityId===id),join={joinKey:lesson.joinKey,date:lesson.date};
 assert.equal((await d1LessonJoin(repository,null,join,now)).joinUrl,programLink||first);
 for(const link of [second,'']){
  current=await get(env,admin);const row=current.setup.rows.classes.find(c=>c.ClassID==='class-1');
  ok(await change(env,tt+'manage-save',{id,kind:'classes',record:{...row,ZoomLink:link},creating:false,baseRowRevision:current.setup.rowRevisions.classes[row.ClassID]},admin));
  if(programLink||link)assert.equal((await d1LessonJoin(repository,null,join,now)).joinUrl,programLink||link);
  else await assert.rejects(d1LessonJoin(repository,null,join,now),error=>error.code==='LESSON_UNAVAILABLE');
 }
 assert.deepEqual(db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),frozen,'Class changes preserve published timetable history');
 assert.equal(db.prepare('SELECT count(*) n FROM academy_settings WHERE setting_key=?').get('ProgramZoom:'+activity).n,0);
}));

test('Program Zoom saves independently of a published timetable and current joining uses Program, session then class links',()=>use(async({env,db})=>{
 const admin=await login(env),scoped=await login(env,'0004'),teacher=await login(env,'0003');
 const registry='/api/admin/platform/programs/',currentProgram=async()=>ok(await post(env,registry+'list',{},admin)).programs.find(p=>p.id===id);
 const input=(p,link)=>({id,name:p.name,status:p.status,timezone:p.timezone,durationYears:p.durationYears,revision:p.revision,programZoomLink:link,operationId:crypto.randomUUID()});
 const legacy='https://zoom.us/j/99999999999?pwd=legacy',first='https://zoom.us/j/88888888888?pwd=first',second='https://zoom.us/j/77777777777?pwd=second',classLink='https://zoom.us/j/22222222222';
 await save(env,admin,{...draft(),programZoomLink:legacy});
 let program=await currentProgram();assert.equal(program.programZoomLink,legacy);assert.equal(program.programZoomConfigured,false,'An older draft link is preserved before an explicit Program decision');
 const sourceDrafts=db.prepare('SELECT * FROM timetable_drafts ORDER BY activity_key,scope_key').all();
 const request={...input(program,first),accessModel:'FREE'};
 assert.equal((await post(env,registry+'save',request,teacher)).status,403);
 assert.equal((await post(env,registry+'save',{...request,id:PROGRAM_IDS[1]},scoped)).status,403);
 const saved=ok(await post(env,registry+'save',request,scoped));assert.equal(saved.program.programZoomLink,first);assert.equal(saved.program.programZoomConfigured,true);
 assert.equal(ok(await post(env,registry+'save',request,scoped)).replayed,true);
 assert.deepEqual(db.prepare('SELECT * FROM timetable_drafts ORDER BY activity_key,scope_key').all(),sourceDrafts,'A Program setting save does not edit the timetable draft');
 let current=await get(env,admin);assert.equal(current.draft.programZoomLink,first);
 const preview=ok(await post(env,tt+'preview',{id,draft:{...current.draft,programZoomLink:legacy},effectiveFrom:tomorrow()},admin));assert.equal(preview.valid,true);assert.ok(preview.occurrences.every(r=>r.zoomLink===first),'The current Program setting overrides an older client draft');
 ok(await change(env,tt+'publish',{id,revision:current.revision,draft:current.draft,effectiveFrom:tomorrow()},admin));
 current=await get(env,admin);assert.equal(current.timetableEditable,false);
 const frozen=db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),records=db.prepare('SELECT * FROM program_timetable_records ORDER BY timetable_id').all();
 program=await currentProgram();ok(await post(env,registry+'save',input(program,second),scoped));
 const {academyD1Repository}=await import('../src/academy/d1/repository.js'),{d1Entrance}=await import('../src/academy/d1/entrance.js'),{d1LessonJoin,websiteEntrance}=await import('../src/academy/d1/lesson-join.js'),{publicTimetableSnapshot,publicTimetableDay}=await import('../src/academy/d1/public-timetable.js');
 const repository=academyD1Repository(env),now=new Date(tomorrow()+'T08:00:00Z');
 const data=await d1Entrance(repository,null,null,{startDate:tomorrow()},now),lesson=data.timetable.find(r=>r.activityId===id),join={joinKey:lesson.joinKey,date:lesson.date};
 assert.equal((await d1LessonJoin(repository,null,join,now)).joinUrl,second,'A published lesson uses the changed Program link without republishing');
 assert.doesNotMatch(JSON.stringify(websiteEntrance(data)),/zoom\.us/);assert.doesNotMatch(JSON.stringify(publicTimetableSnapshot(data,publicTimetableDay(now),now)),/zoom\.us/);
 program=await currentProgram();ok(await post(env,registry+'save',input(program,''),scoped));
 assert.equal((await d1LessonJoin(repository,null,join,now)).joinUrl,draft().rules[0].zoomLink,'Clearing the Program link restores the published session link');
 current=await get(env,admin);assert.equal(current.draft.programZoomLink,'','Clearing does not resurrect the old draft link');assert.equal(current.timetableEditable,false);
 db.prepare('UPDATE classes SET zoom_link=? WHERE activity_key=? AND class_id=?').run(classLink,activity,'class-1');
 const withoutSession={...draft(),programZoomLink:legacy};withoutSession.rules[0].zoomLink='';
 const fallback=ok(await post(env,tt+'preview',{id,draft:withoutSession},admin));assert.ok(fallback.occurrences.every(r=>r.zoomLink===classLink),'Cleared Program plus no session link uses the class link');
 assert.deepEqual(db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),frozen);assert.deepEqual(db.prepare('SELECT * FROM program_timetable_records ORDER BY timetable_id').all(),records,'Program Zoom saves keep immutable timetable records unchanged');
 assert.equal((await post(env,registry+'save',input(program,first),scoped)).status,409,'An old revision cannot restore a previous Program link');
 program=await currentProgram();assert.equal((await post(env,registry+'save',input(program,'javascript:alert(1)'),admin)).status,400);assert.equal((await post(env,registry+'save',input(program,'https://user:password@zoom.us/j/1'),admin)).status,400);
 const receipts=db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
 db.exec("CREATE TRIGGER reject_program_zoom_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_REGISTRY' BEGIN SELECT RAISE(ABORT,'late Program Zoom audit failure'); END");
 assert.equal((await post(env,registry+'save',input(program,first),admin)).status,503);assert.equal((await currentProgram()).programZoomLink,'');assert.equal((await currentProgram()).revision,program.revision);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);db.exec('DROP TRIGGER reject_program_zoom_audit');
 const freshId='PRG-'+crypto.randomUUID(),fresh=ok(await change(env,registry+'create',{id:freshId,name:'Program with link before timetable',status:'DRAFT',programZoomLink:first},admin));
 assert.equal(fresh.program.programZoomLink,first);assert.equal(ok(await post(env,tt+'get',{id:freshId},admin)).draft.programZoomLink,first);
 assert.equal(db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').get('ProgramZoom:'+activity).setting_value,'');
}));

test('Publish follow-up refreshes the public snapshot within the Free-plan budget and exact retries do not republish',()=>use(async({env,db,queries})=>{
 const objects=new Map();let puts=0;
 env.MEDIA_BUCKET={get:async key=>objects.has(key)?{etag:String(puts),json:async()=>JSON.parse(objects.get(key))}:null,
  put:async(key,value,options)=>{if(options.onlyIf.etagMatches!==undefined?options.onlyIf.etagMatches!==String(puts):objects.has(key))return null;puts++;objects.set(key,value);return {etag:String(puts)};}};
 db.prepare('INSERT INTO academy_teacher_designations VALUES(?,1,1,?,?)').run('account-0006',new Date().toISOString(),'account-0001');
 const token=await login(env,'0004');await save(env,token,{...draft(),rules:draft().rules.map(r=>({...r,startTime:'13:00',endTime:'14:00',additionalTeacherIds:['account-0005','account-0006']}))});const current=await get(env,token),publicationCount=db.prepare('SELECT count(*) n FROM timetable_publications').get().n;
 const snapshot=()=>worker.fetch(new WorkspaceRequest('https://synthetic.invalid/api/academy/entrance/public-snapshot'),env);
 assert.equal((await snapshot()).status,200);assert.equal(puts,1);
 const input={id,draft:current.draft,revision:current.revision,effectiveFrom:tomorrow(),operationId:crypto.randomUUID()};
 let before=queries.length;const result=ok(await post(env,tt+'publish',input,token));
 assert.ok(queries.length-before<=50,`Publication used ${queries.length-before} queries`);console.log(`Publication with three teachers: ${queries.length-before} D1 queries`);assert.equal(puts,1,'The committed publication is confirmed before the separate snapshot request');
 before=queries.length;ok(await post(env,tt+'refresh-public',{id,publicationId:result.publicationId},token));
 assert.ok(queries.length-before<=50,`Snapshot refresh used ${queries.length-before} queries`);console.log(`Publication snapshot follow-up: ${queries.length-before} D1 queries`);assert.equal(puts,2);assert.equal(result.effectiveFrom,tomorrow());
 const preview=await (await snapshot()).json();assert.ok(preview.timetable.some(row=>row.activityId===id&&row.date===tomorrow()));
 assert.ok(preview.timetable.filter(row=>row.activityId===id&&row.startTime==='13:00').every(row=>row.date>=tomorrow()),'New hours wait until the effective date; the older publication can remain in effect today');
 assert.doesNotMatch(JSON.stringify(preview),/zoom\.|teacherId|classId|account_id|joinUrl|teacherName|classNames/);
 const retry=ok(await post(env,tt+'publish',input,token));assert.equal(retry.publicationId,result.publicationId);ok(await post(env,tt+'refresh-public',{id,publicationId:retry.publicationId},token));
 assert.equal(db.prepare('SELECT count(*) n FROM timetable_publications').get().n,publicationCount+1);
 assert.equal((await post(env,'/api/admin/platform/public-timetable/refresh',{},token)).status,403,'Publication follow-up does not widen manual Academy authority');
 assert.equal((await post(env,tt+'refresh-public',{id:PROGRAM_IDS[1],publicationId:result.publicationId},token)).status,403);
 assert.equal((await post(env,tt+'refresh-public',{id,publicationId:'uncommitted'},token)).status,409);
 const student=await login(env,'0002');assert.equal((await post(env,tt+'refresh-public',{id,publicationId:result.publicationId},student)).status,403);
 db.prepare("DELETE FROM role_assignments WHERE account_id='account-0004' AND role='PROGRAM_ADMIN'").run();
 db.prepare("UPDATE role_import_reviews SET status='REJECTED',reviewed_by_account_id='account-0001',reviewed_at=? WHERE account_id='account-0004'").run(new Date().toISOString());
 assert.equal((await post(env,tt+'refresh-public',{id,publicationId:result.publicationId},token)).status,401,'Current authority is required again after publication');
}));

test('failed publication never refreshes; failed snapshot replacement cannot turn a committed publication into a failed save',()=>use(async({env,db})=>{
 let puts=0;env.MEDIA_BUCKET={get:async()=>null,put:async()=>{puts++;throw Error('Synthetic R2 outage');}};
 const admin=await login(env);await save(env,admin);let current=await get(env,admin);
 const invalid={id,revision:current.revision,draft:current.draft,effectiveFrom:programToday('Africa/Johannesburg'),operationId:crypto.randomUUID()};
 assert.equal((await post(env,tt+'publish',invalid,admin)).status,409);assert.equal(puts,0);
 const input={...invalid,effectiveFrom:tomorrow(),operationId:crypto.randomUUID()},published=ok(await post(env,tt+'publish',input,admin));
 assert.equal(puts,0);assert.equal((await post(env,tt+'refresh-public',{id,publicationId:published.publicationId},admin)).status,503);assert.equal(puts,1);
 assert.equal((await get(env,admin)).timetableStatus,'PUBLISHED');assert.ok(db.prepare('SELECT publication_id FROM timetable_publications WHERE publication_id=?').get(published.publicationId));
 env.MEDIA_BUCKET.put=async()=>({etag:'recovered'});
 const retry=ok(await post(env,tt+'publish',input,admin));assert.equal(retry.publicationId,published.publicationId);ok(await post(env,tt+'refresh-public',{id,publicationId:retry.publicationId},admin));
}));

test('People availability lists preserve Global and scoped teacher editing authority',()=>use(async({env,db})=>{
 const admin=await login(env),scoped=await login(env,'0004');
 const read=async token=>ok(await post(env,tt+'manage-get',{id,includeOverview:true},token)).teacherAvailability;
 assert.ok((await read(admin)).teachers.some(t=>t.id==='account-0003'));
 assert.ok((await read(scoped)).teachers.some(t=>t.id==='account-0003'));
 db.prepare("DELETE FROM role_assignments WHERE account_id='account-0003'").run();db.prepare("DELETE FROM class_teacher_assignments WHERE account_id='account-0003'").run();
 db.prepare('DELETE FROM timetable_drafts').run();
 const current=await read(scoped);assert.ok(!current.teachers.some(t=>t.id==='account-0003'));assert.ok(!current.availability.some(a=>a.teacherId==='account-0003'));
}));
