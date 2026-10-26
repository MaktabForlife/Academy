import {test} from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';import {planningMonday} from '../src/academy/d1/lesson-planning.js';import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},operation=()=>({operationId:crypto.randomUUID()});
async function use(run){const f=await classNotesFixture();try{
 f.env.ACADEMY_MEDIA_SEPARATION='1';const tokens={admin:await f.actor('global'),scoped:await f.actor('adminA'),other:await f.actor('adminB'),teacher:await f.login('0003'),student:await f.login('0002')};f.area=f.scopes.programA;f.today=academyDate(new Date(),'Africa/Johannesburg');f.week=planningMonday(nextDate(f.today,14));
 f.call=async(action,input={},who='admin',workspace)=>{const path=action.startsWith('/')?action:'/api/academy/planning/'+action,response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace||(who==='teacher'?'TEACH':who==='student'?'LEARN':'ADMIN'),'Content-Type':'application/json'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 f.options=async(who='admin')=>ok(await f.call('sessions',{activityKey:f.area},who));
 f.requirements=async(choice,{date=nextDate(f.today),who='admin',revision,rows}={})=>{const options=await f.options(who);return f.call('session-policy',{...operation(),activityKey:f.area,revision:revision??options.revision,effectiveFrom:date,rows:rows||options.sessions.map(s=>({...s,choice}))},who);};
 f.get=async(week=f.week)=>ok(await f.call('get',{activityKey:f.area,runId:f.runId,period:'WEEKLY',weekStart:week},'teacher'));
 f.areaPolicy=async(required)=>{const area=ok(await f.call('list',{view:'admin',activityKey:f.area,weekStart:f.week})).areas.find(a=>a.key===f.area),result=ok(await f.call('policy',{...operation(),activityKey:f.area,revision:area.policy.revision,plansRequired:required,weeklyDay:area.policy.weeklyDay,weeklyTime:area.policy.weeklyTime,courseLeadDays:area.policy.courseLeadDays}));if(result.acceptedChange)ok(await f.call('/api/academy/changes/accept',result.acceptedChange));return result;};
 await run(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}}
test('sessions inherit the area default and an explicit optional choice removes required-plan warnings without blocking saving',()=>use(async f=>{
 const options=await f.options();assert(options.sessions.length);assert(options.sessions.every(s=>s.choice==='INHERIT'));assert.equal((await f.get()).plansRequired,true);
 const result=ok(await f.requirements('OPTIONAL'));assert.equal(result.acceptedChange,undefined,'A live session policy needs no extra acceptance request');
 const plan=await f.get();assert.equal(plan.plansRequired,false);assert.equal(plan.status,'OPTIONAL');assert(plan.sessionRequirements.length);assert(plan.sessionRequirements.every(s=>s.required===false));assert.equal(plan.canEdit,true);
 const board=ok(await f.call('list',{view:'admin',activityKey:f.area,weekStart:f.week})),row=board.plans.find(p=>p.teacherId==='account-0003');assert.equal(row.status,'OPTIONAL');
 ok(await f.call('save',{...operation(),activityKey:f.area,period:'WEEKLY',weekStart:f.week,revision:0,content:{title:'Optional plan',overview:'',reflection:'',lessons:[{date:'',className:'Class A',subject:'Lesson',objectives:'',activities:'Prepare the lesson.',resources:''}]}},'teacher'));assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_plans').get().n,1);
}));
test('a required session overrides an optional area and restoration returns to inheritance from its effective day',()=>use(async f=>{
 await f.areaPolicy(false);assert.equal((await f.get()).plansRequired,false);
 ok(await f.requirements('REQUIRED',{who:'scoped'}));assert.equal((await f.get()).plansRequired,true);
 ok(await f.requirements('INHERIT',{date:nextDate(f.week,7),who:'scoped'}));assert.equal((await f.get()).plansRequired,true);assert.equal((await f.get(nextDate(f.week,7))).plansRequired,false);
}));
test('future choices retain earlier requirements and previously saved plans',()=>use(async f=>{
 const original=await f.get();ok(await f.call('save',{...operation(),activityKey:f.area,period:'WEEKLY',weekStart:f.week,revision:0,content:{title:'Keep this saved plan',overview:'Existing plan',reflection:'',lessons:[]}},'teacher'));
 const row=f.db.prepare('SELECT * FROM lesson_plans').get();ok(await f.requirements('OPTIONAL',{date:nextDate(f.week,7)}));assert.equal((await f.get()).plansRequired,original.plansRequired);assert.equal((await f.get(nextDate(f.week,7))).plansRequired,false);assert.deepEqual(f.db.prepare('SELECT * FROM lesson_plans').get(),row);
 assert.equal((await f.requirements('OPTIONAL',{date:f.today})).status,400);
}));
test('one atomic batch checks accepted session versions and current scoped Admin permission',()=>use(async f=>{
 for(const [who,workspace]of [['teacher','TEACH'],['student','LEARN'],['admin','ADMIN_LEARN']])assert.equal((await f.call('sessions',{activityKey:f.area},who,workspace)).status,403);
 assert.equal((await f.call('sessions',{activityKey:f.area},'other')).status,403);
 const options=await f.options(),rows=options.sessions.map(s=>({...s,choice:'OPTIONAL'}));rows.at(-1).sessionVersion='stale';assert.equal((await f.requirements('OPTIONAL',{rows})).status,409);assert.equal(f.db.prepare("SELECT 1 FROM academy_settings WHERE setting_key LIKE 'LessonPlanSessions:%'").get(),undefined);
 ok(await f.requirements('OPTIONAL'));assert.equal((await f.requirements('REQUIRED',{revision:0})).status,409);
}));
test('Course session requirements inherit the Course default and retain optional weekly and whole-course editing',()=>use(async f=>{
 f.area='COURSE:subject-1';const original=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=?').get(f.area),snapshot=JSON.parse(original.snapshot_json),row={...original,publication_id:crypto.randomUUID(),version_no:original.version_no+1};snapshot.publication.PublicationID=row.publication_id;snapshot.sessions[0].SessionDate=f.week;row.snapshot_json=JSON.stringify(snapshot);const columns=Object.keys(row);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));
 f.runId=f.db.prepare('SELECT run_id FROM course_runs WHERE activity_key=?').get(f.area).run_id;f.db.prepare('UPDATE course_run_state SET current_publication_id=? WHERE activity_key=?').run(row.publication_id,f.area);f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('course-session-plan-teacher','account-0003',?,'TEACHER',1,'CONFIRMED')").run(f.area);await acceptFixtureSetup(f.env,await f.actor('global'),[f.area]);
 const options=ok(await f.call('sessions',{activityKey:f.area,startDate:f.week,runId:f.runId}));assert.equal(options.sessions.length,1);assert.equal(options.sessions[0].choice,'INHERIT');assert.equal((await f.get()).plansRequired,true);
 ok(await f.requirements('OPTIONAL',{rows:options.sessions.map(s=>({...s,choice:'OPTIONAL'}))}));assert.equal((await f.get()).plansRequired,false);
 const entire=ok(await f.call('get',{activityKey:f.area,runId:f.runId,period:'ENTIRE'},'teacher'));assert.equal(entire.plansRequired,false);assert.equal(entire.canEdit,true);
}));
