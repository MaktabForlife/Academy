import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import worker from '../src/worker.js';
import {normalizeAvailability,availableForSession,availabilityBlocks} from '../src/academy/availability-ranges.js';
import {termBreaks} from '../src/academy/d1/academic-calendar.js';
const base='/api/academy/calendar/',av='/api/academy/teacher-availability/',scope='PROGRAM:'+PROGRAM_IDS[0];
async function use(fn,upgrade=true){const f=await courseFixture();for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql','0010_shared_module_catalogue.sql','0012_program_workspace.sql',...(upgrade?['0022_academic_calendar.sql']:[])])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected external request');};try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=original;f.db.close();}}
async function post(env,path,body={},token=''){const r=await worker.fetch(new Request('https://synthetic.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,n='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+n,pin:'1234'})).token;
const save=(env,entry,token,revision=0,operationId=crypto.randomUUID())=>post(env,base+'save',{entry,revision,operationId},token);
const term=(scopeKey='ACADEMY',extra={})=>({scopeKey,kind:'TERM',description:'Term one',startDate:'2026-01-12',endDate:'2026-03-20',...extra});
const unavailable=(extra={})=>({id:'AVAIL-week',kind:'WEEKLY',status:'UNAVAILABLE',weekdays:[1,3],startDate:'',endDate:'',allDay:false,startTime:'09:00',endTime:'12:00',...extra});

test('calendar requires authentication and the additive schema; learners receive no teacher availability',()=>use(async({env})=>{
 assert.equal((await post(env,base+'get')).status,401);const student=await login(env,'0002');const data=ok(await post(env,base+'get',{year:2026,month:10},student));assert.deepEqual(data.teachers,[]);assert.equal(data.availability,null);assert.equal(data.teachingWeek,null);assert.equal(data.canManageAcademy,false);assert.ok(data.events.some(e=>e.kind==='PUBLIC_HOLIDAY'));
 assert.equal((await post(env,base+'get',{teacherId:'account-0003'},student)).status,403);
 assert.equal((await save(env,term(),student)).status,403);
}));
test('calendar fails explicitly before its migration',()=>use(async({env})=>assert.equal((await post(env,base+'get',{},await login(env))).body.code,'ACADEMIC_CALENDAR_SCHEMA_REQUIRED'),false));
test('current term dates remain visible when browsing a different year',()=>use(async({env})=>{
 const admin=await login(env),first=ok(await post(env,base+'get',{},admin)),year=Number(first.today.slice(0,4));
 ok(await save(env,term('ACADEMY',{description:'Current term',startDate:first.today,endDate:first.today}),admin));
 const future=ok(await post(env,base+'get',{year:year+1,month:1},admin));assert.equal(future.currentTerms[0].description,'Current term');assert.equal(future.terms.length,0);
}));
test('Global Admin maintains terms, holidays and persistent public holiday overrides with exact retries',()=>use(async({env,db})=>{
 const admin=await login(env),id=crypto.randomUUID(),entry=term();const created=ok(await save(env,entry,admin,0,id));assert.equal(ok(await save(env,entry,admin,0,id)).replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n,1);
 assert.equal((await save(env,term('ACADEMY',{startDate:'2026-03-01'}),admin)).status,400);
 const moved=ok(await save(env,{kind:'PUBLIC_HOLIDAY',scopeKey:'ACADEMY',id:'SA-PUBLIC-HOLIDAY-2026-12-25',description:'Academy public holiday',startDate:'2026-12-24'},admin));
 let data=ok(await post(env,base+'get',{year:2026,month:12},admin));assert.ok(!data.events.some(e=>e.kind==='PUBLIC_HOLIDAY'&&e.startDate==='2026-12-25'));assert.ok(data.events.some(e=>e.id===moved.event.id&&e.startDate==='2026-12-24'));
 ok(await save(env,{...moved.event,active:false},admin,moved.event.revision));data=ok(await post(env,base+'get',{year:2026,month:12},admin));assert.ok(!data.events.some(e=>e.kind==='PUBLIC_HOLIDAY'&&['2026-12-24','2026-12-25'].includes(e.startDate)));
 ok(await save(env,{scopeKey:'ACADEMY',kind:'ACADEMY_HOLIDAY',description:'Academy break',startDate:'2026-07-01',endDate:'2026-07-08'},admin));
 assert.equal((await save(env,{...created.event,description:'Stale'},admin,0)).status,409);
 assert.ok(db.prepare('SELECT count(*) n FROM audit_events WHERE record_kind=?').get('ACADEMY_CALENDAR').n>=4);
 db.prepare('UPDATE academy_calendar_events SET description=? WHERE event_id=?').run('Updated by an older D1 editor',created.event.id);
 assert.equal(db.prepare('SELECT revision FROM academy_calendar_events WHERE event_id=?').get(created.event.id).revision,2);
 assert.equal((await save(env,{...created.event,description:'Old browser draft'},admin,1)).status,409);
}));
test('Program Admin edits only their own Program terms and holidays, with scope checked inside the transaction',()=>use(async({env,db})=>{
 const scoped=await login(env,'0004'),admin=await login(env);const saved=ok(await save(env,term(scope),scoped));
 assert.equal(saved.event.scopeKey,scope);assert.equal((await save(env,term(),scoped)).status,403);assert.equal((await save(env,term('PROGRAM:'+PROGRAM_IDS[1]),scoped)).status,403);
 assert.equal((await post(env,base+'get',{scopeKey:'PROGRAM:'+PROGRAM_IDS[1]},scoped)).status,403);
 assert.equal((await save(env,{...saved.event,scopeKey:'ACADEMY'},scoped,saved.event.revision)).status,403);
 const all=ok(await post(env,base+'get',{scopeKey:scope,year:2026,month:2},admin));assert.equal(all.terms[0].scopeKey,scope);
 db.exec("UPDATE role_assignments SET active=0 WHERE account_id='account-0004'; UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004'");assert.ok((await save(env,{...saved.event,description:'Revoked'},scoped,saved.event.revision)).status>=400);
}));
test('Program terms inherit Academy terms until their own terms exist; derived term breaks never rewrite lessons',()=>use(async({env,db})=>{
 const admin=await login(env),student=await login(env,'0002'),before=db.prepare('SELECT count(*) n FROM published_lessons').get().n;
 ok(await save(env,term(),admin));ok(await save(env,term('ACADEMY',{description:'Term two',startDate:'2026-04-06',endDate:'2026-06-20'}),admin));
 let data=ok(await post(env,base+'get',{scopeKey:scope,year:2026,month:3},student));assert.equal(data.terms.length,2);assert.ok(data.events.some(e=>e.kind==='TERM_BREAK'&&e.startDate==='2026-03-21'&&e.endDate==='2026-04-05'));
 ok(await save(env,term(scope,{description:'Program term',startDate:'2026-02-01',endDate:'2026-05-01'}),admin));data=ok(await post(env,base+'get',{scopeKey:scope,year:2026,month:3},student));assert.equal(data.terms.length,1);assert.equal(data.terms[0].description,'Program term');assert.equal(db.prepare('SELECT count(*) n FROM published_lessons').get().n,before);
}));
test('weekly and dated availability defaults available; dates override weekly entries and later entries win',()=>{
 const rules=normalizeAvailability([unavailable(),unavailable({id:'AVAIL-dates',kind:'DATES',status:'AVAILABLE',weekdays:[],startDate:'2026-10-12',endDate:'2026-10-16',startTime:'10:00',endTime:'11:00'})],'teacher');
 assert.equal(availableForSession([], '2026-10-12','09:00','10:00'),true);assert.equal(availableForSession(rules,'2026-10-13','09:00','10:00'),true);assert.equal(availableForSession(rules,'2026-10-12','09:00','10:00'),false);assert.equal(availableForSession(rules,'2026-10-12','10:00','11:00'),true);assert.equal(availableForSession(rules,'2026-10-12','09:30','10:30'),false);assert.equal(availableForSession(rules,'2026-10-19','10:00','11:00'),false);
 assert.deepEqual(availabilityBlocks(rules,'2026-10-12').map(r=>[r.status,r.startTime,r.endTime]),[['UNAVAILABLE','09:00','10:00'],['AVAILABLE','10:00','11:00'],['UNAVAILABLE','11:00','12:00']]);
 rules.push(unavailable({id:'AVAIL-later',kind:'DATES',weekdays:[],startDate:'2026-10-12',endDate:'2026-10-12',startTime:'10:30',endTime:'11:00'}));assert.equal(availableForSession(rules,'2026-10-12','10:00','11:00'),false);
 for(const bad of [unavailable({weekdays:[]}),unavailable({weekdays:[1,1]}),unavailable({startTime:'12:00'}),unavailable({kind:'DATES',startDate:'2026-02-30',endDate:'2026-03-01'}),null])assert.throws(()=>normalizeAvailability([bad],'teacher'));
});
test('teachers edit only themselves; Program Admins edit assigned teachers; Global Admin edits any teacher',()=>use(async({env,db})=>{
 const teacher=await login(env,'0003'),admin=await login(env),scoped=await login(env,'0004'),student=await login(env,'0002');const ranges=[unavailable(),unavailable({id:'AVAIL-holiday',kind:'DATES',weekdays:[],startDate:'2026-10-12',endDate:'2026-10-16',allDay:true})];
 const input={revision:0,ranges,operationId:crypto.randomUUID()};const result=ok(await post(env,av+'save',input,teacher));assert.equal(result.ranges.length,2);assert.equal(ok(await post(env,av+'save',input,teacher)).replayed,true);
 assert.equal((await post(env,base+'get',{teacherId:'account-0003',year:2026,month:10},student)).status,403);
 for(const token of [teacher,scoped,admin]){const data=ok(await post(env,base+'get',{teacherId:'account-0003',year:2026,month:10},token));assert.equal(data.availability.revision,1);assert.ok(data.availability.blocks.some(b=>b.date==='2026-10-12'));assert.equal(data.teachingWeek.displayOnly,true);}
 assert.equal((await post(env,av+'save',{...input,accountId:'account-0005',operationId:crypto.randomUUID()},teacher)).status,403);assert.equal((await post(env,av+'save',{...input,accountId:'account-0005',operationId:crypto.randomUUID()},scoped)).status,403);
 ok(await post(env,av+'save',{revision:1,ranges:[],accountId:'account-0003',operationId:crypto.randomUUID()},admin));assert.equal(db.prepare('SELECT count(*) n FROM teacher_availability_changes').get().n,2);
}));
test('term breaks merge overlapping terms and unknown years produce no assumed holiday',()=>{
 assert.deepEqual(termBreaks([],2027),[]);const breaks=termBreaks([{active:true,startDate:'2026-01-01',endDate:'2026-03-01'},{active:true,startDate:'2026-02-01',endDate:'2026-12-31'}],2026);assert.deepEqual(breaks,[]);
});
test('teaching hours count overlapping lessons once and exclude cancelled Course sessions',()=>use(async({env,db})=>{
 const admin=await login(env),teacher='account-0003';db.prepare('DELETE FROM published_lesson_teachers WHERE account_id=?').run(teacher);
 // Keep the synthetic total independent of the date when this test is run.
 for(const day of [0,1,2,3,4,5,6])for(const [id,start,end] of [['a','09:00','10:00'],['b','09:30','10:30']]){
  const anchor='hours-'+day+id;
  db.prepare("INSERT INTO published_lessons(activity_key,publication_id,lesson_anchor,kind,status,weekday,start_time,end_time,timezone,snapshot_json) VALUES(?,'program-publication-1',?,'LESSON','SCHEDULED',?,?,?,'Africa/Johannesburg','{}')").run(scope,anchor,day,start,end);
  db.prepare("INSERT INTO published_lesson_teachers VALUES(?,'program-publication-1',?,?)").run(scope,anchor,teacher);
 }
 const data=ok(await post(env,base+'get',{teacherId:teacher,year:2026,month:10},admin));
 assert.equal(data.teachingWeek.totalMinutes,630);
 const date=data.teachingWeek.startDate;
 db.prepare("INSERT INTO published_lessons(activity_key,publication_id,lesson_anchor,kind,status,lesson_date,start_time,end_time,timezone,snapshot_json) VALUES('COURSE:subject-1','publication-1','published-hours','LESSON','SCHEDULED',?,'13:00','15:00','Africa/Johannesburg',?)").run(date,JSON.stringify({sourcesessionid:'source-hours'}));
 db.prepare("INSERT INTO published_lesson_teachers VALUES('COURSE:subject-1','publication-1','published-hours',?)").run(teacher);
 const withCourse=ok(await post(env,base+'get',{teacherId:teacher,year:2026,month:10},admin));assert.equal(withCourse.teachingWeek.totalMinutes,750);
 db.prepare("INSERT INTO lesson_lifecycle VALUES('COURSE:subject-1','hours-cancel','publication-1','source-hours','CANCELLED',NULL,NULL)").run();
 const cancelled=ok(await post(env,base+'get',{teacherId:teacher,year:2026,month:10},admin));assert.equal(cancelled.teachingWeek.totalMinutes,630);
 ok(await post(env,av+'save',{revision:0,accountId:teacher,ranges:[unavailable({weekdays:[0,1,2,3,4,5,6],allDay:true})],operationId:crypto.randomUUID()},admin));
 const unavailableData=ok(await post(env,base+'get',{teacherId:teacher,year:2026,month:10},admin));assert.equal(unavailableData.teachingWeek.totalMinutes,630,'The teaching-hours display does not change the published schedule');
}));

 test('Admin learner and teaching calendars preserve their context; only central Admin manages terms, holidays and other teachers',()=>use(async({env,db})=>{
 env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const admin=await login(env),teacher=await login(env,'0003');
 const before=db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all();
 const learn=ok(await post(env,base+'get',{scopeKey:scope,view:'learn'},admin));assert.equal(learn.canManageAcademy,false);assert.deepEqual(learn.teachers,[]);assert.equal(learn.availability,null);assert.equal(learn.teachingWeek,null);assert.ok(learn.scopes.every(s=>!s.editable));assert.ok(learn.events.every(e=>!e.editable));
 const teach=ok(await post(env,base+'get',{scopeKey:scope,view:'teach'},admin));assert.equal(teach.availability.accountId,'account-0001');assert.equal(teach.availability.editable,true);assert.equal(teach.teachers.length,1);assert.equal(teach.canManageAcademy,false);assert.ok(teach.scopes.every(s=>!s.editable));
 ok(await post(env,av+'save',{accountId:'account-0001',revision:0,ranges:[],operationId:crypto.randomUUID()},admin));
 assert.equal((await post(env,base+'get',{view:'teach',teacherId:'account-0003'},admin)).status,403);
 const central=ok(await post(env,base+'get',{view:'admin',teacherId:'account-0003'},admin));assert.equal(central.canManageAcademy,true);assert.equal(central.availability.accountId,'account-0003');assert.ok(central.scopes.find(s=>s.key==='ACADEMY').editable);
 assert.equal((await post(env,base+'get',{teacherId:'account-0001'},teacher)).status,403);
 assert.deepEqual(db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),before);
}));
 test('Annual Hijri labels need a new dated entry each year and retain earlier dates; all are informational',()=>use(async({env,db})=>{
 const admin=await login(env),entry={scopeKey:'ACADEMY',kind:'ISLAMIC_DAY',description:'A significant day',startDate:'2026-10-20',annual:true,calendarYear:2026};
 const first=ok(await save(env,entry,admin)).event;
 let future=ok(await post(env,base+'get',{year:2027,month:10},admin));const carried=future.hijriEntries.find(e=>e.id===first.id);assert.equal(carried.dateRequired,true);assert.equal(carried.startDate,'');assert.ok(!future.events.some(e=>e.description===entry.description));
 const second=ok(await save(env,{...entry,id:first.id,startDate:'2027-10-09',calendarYear:2027},admin,first.revision)).event;assert.notEqual(first.id,second.id);assert.equal(db.prepare('SELECT start_date FROM academy_calendar_events WHERE event_id=?').get(first.id).start_date,'2026-10-20');
 future=ok(await post(env,base+'get',{year:2027,month:10},admin));assert.equal(future.events.find(e=>e.id===second.id).startDate,'2027-10-09');assert.notEqual(future.events.find(e=>e.id===second.id).teachingImpact,'NO_TEACHING');
 ok(await save(env,{...second,startDate:'2027-10-10',annual:false},admin,second.revision));future=ok(await post(env,base+'get',{year:2028,month:10},admin));assert.ok(!future.hijriEntries.some(e=>e.description===entry.description));assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events WHERE description=?').get(entry.description).n,2);
}));
 test('Annual Academy holidays repeat Gregorian dates, while generated SA holidays remain editable year-specific defaults',()=>use(async({env})=>{
 const admin=await login(env);const first=ok(await save(env,{scopeKey:'ACADEMY',kind:'ACADEMY_HOLIDAY',description:'Annual Academy day',startDate:'2026-10-20',endDate:'2026-10-20',annual:true},admin)).event;
 const future=ok(await post(env,base+'get',{year:2028,month:10},admin));const holiday=future.events.find(e=>e.id===first.id);assert.equal(holiday.startDate,'2028-10-20');assert.equal(holiday.teachingImpact,'NO_TEACHING');assert.equal(holiday.annual,true);
 assert.ok(future.events.some(e=>e.source==='SA_PUBLIC_HOLIDAY'&&e.teachingImpact==='NO_TEACHING'&&e.editable));
 assert.equal((await save(env,{scopeKey:'ACADEMY',kind:'PUBLIC_HOLIDAY',description:'Invalid repeat',startDate:'2026-10-21',annual:true},admin)).status,400);
}));

 test('Annual label changes reject a stale year editor, and retiring an undated label preserves earlier calendar history',()=>use(async({env,db})=>{
 const admin=await login(env),first=ok(await save(env,{scopeKey:'ACADEMY',kind:'ISLAMIC_DAY',description:'Annual concurrency',startDate:'2026-10-20',annual:true},admin)).event;
 const future=ok(await post(env,base+'get',{year:2027,month:10},admin)).hijriEntries.find(e=>e.id===first.id);
 ok(await save(env,{...first,annual:false},admin,first.revision));
 assert.equal((await save(env,{...future,startDate:'2027-10-09',calendarYear:2027,annualRevision:future.annualRevision},admin,future.revision)).status,409);
 const current=ok(await post(env,base+'get',{year:2026,month:10},admin)).hijriEntries.find(e=>e.id===first.id);ok(await save(env,{...current,annual:true},admin,current.revision));
 const pending=ok(await post(env,base+'get',{year:2028,month:10},admin)).hijriEntries.find(e=>e.id===first.id);ok(await save(env,{...pending,active:false,calendarYear:2028},admin,pending.revision));
 assert.equal(db.prepare('SELECT active FROM academy_calendar_events WHERE event_id=?').get(first.id).active,1);assert.ok(!ok(await post(env,base+'get',{year:2029,month:10},admin)).hijriEntries.some(e=>e.id===first.id));
}));
