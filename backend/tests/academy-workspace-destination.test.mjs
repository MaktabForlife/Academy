import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardChoice,dashboardSummary} from '../src/academy/d1/web-platform/dashboard.mjs';
import {programmeChoice} from '../src/academy/d1/web-platform/navigation.mjs';
import {selectWorkspace,guardWorkspace,readerPreview,actualRole} from '../src/academy/d1/workspace-access.js';
import {academyDestination} from '../../academy/website-platform/connect/destinations.mjs';

const activity={activity_key:'PROGRAM:programme-one',activity_id:'programme-one',kind:'PROGRAM',active:true,lifecycle:'ACTIVE'},other={...activity,activity_key:'PROGRAM:programme-two',activity_id:'programme-two'};
const ctx=role=>({scope:'COURSE',courseId:activity.activity_id,courseName:'Programme one',role});
const state=(globalAdmin=false,contexts=[])=>({account:{active:true,global_admin:globalAdmin},activities:[activity,other],contexts,roles:contexts.filter(c=>c.scope==='COURSE').map(c=>({activity_key:activity.activity_key,role:c.role})),subscriptions:[]});
const choose=(s,mode,tool='activity',activityKey=activity.activity_key)=>dashboardChoice(s,{mode,tool,activityKey});
const failure=fn=>assert.throws(fn,e=>e.status===403);
test('explicit dashboard view corrects the reported legacy shortcut while public navigation remains compatible',()=>{
 const s=state(true,[{scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'}]),env={WEBSITE_PLATFORM_NAVIGATION:JSON.stringify({alimiyah:activity.activity_id})};
 assert.equal(programmeChoice(s,'alimiyah',env).destination,'/academy/admin/#activity/PROGRAM/programme-one');
 assert.equal(choose(s,'teach').destination,'/academy/admin/#activity/PROGRAM/programme-one/teach');
});
function native(s,destination){
 const url=new URL(destination,'https://academy.test'),suffix=url.hash.match(/\/(learn|teach)(?:\/|$)/)?.[1],workspace=url.pathname==='/academy/admin/'?(suffix?'ADMIN_'+suffix.toUpperCase():'ADMIN'):suffix.toUpperCase();
 const auth=selectWorkspace(new Request('https://academy.test/api/academy/entrance',{headers:{'X-Academy-Workspace':workspace}}),{state:s});
 assert.equal(academyDestination(destination,'https://academy.test'),url.href);
 return auth;
}
test('Global Admin-only context opens the native Teach audience with staff tools and unchanged grants',()=>{
 const s=state(true,[{scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'}]),before=structuredClone(s);
 for(const tool of ['activity','timetable','planning','attendance']){
  const result=choose(s,'teach',tool);assert.equal(result.context.role,'GLOBAL_ADMIN');
  assert.equal(result.destination,'/academy/admin/#activity/PROGRAM/programme-one/teach'+(tool==='activity'?'':'/'+tool));
  const auth=native(s,result.destination);assert.equal(auth.workspaceContext,'ADMIN_TEACH');assert.equal(auth.workspace,'TEACH');assert(actualRole(auth,activity.activity_key,'TEACHER'));
  guardWorkspace(new Request('https://academy.test/api/academy/planning/save'),auth,{});
  failure(()=>guardWorkspace(new Request('https://academy.test/api/admin/platform/programs/save'),auth,{}));
 }
 assert.deepEqual(s,before,'Selecting a view never persists teacher/learner grants');
});
test('Global Admin Learn stays in the existing class audience preview and Admin stays in management',()=>{
 const s=state(true,[{scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'}]),learn=choose(s,'learn'),auth=native(s,learn.destination);
 assert.equal(learn.destination,'/academy/admin/#activity/PROGRAM/programme-one/learn');assert.equal(auth.workspaceContext,'ADMIN_LEARN');assert(readerPreview(auth,activity.activity_key));assert.deepEqual(auth.state.roles,[]);
 failure(()=>guardWorkspace(new Request('https://academy.test/api/academy/planning/save'),auth,{}));
 const admin=choose(s,'admin');assert.equal(admin.destination,'/academy/admin/#activity/PROGRAM/programme-one');assert.equal(native(s,admin.destination).workspace,'ADMIN');
});
test('ordinary Teacher and Learner retain distinct personal views and cannot request management',()=>{
 const s=state(false,[ctx('TEACHER'),ctx('STUDENT')]);
 for(const mode of ['teach','learn']){const result=choose(s,mode);assert.equal(result.destination,'/academy/#activity/PROGRAM/programme-one/'+mode);assert.equal(native(s,result.destination).workspaceContext,mode.toUpperCase());}
 failure(()=>choose(s,'admin'));failure(()=>choose(state(false,[ctx('STUDENT')]),'teach'));failure(()=>choose(state(false,[ctx('TEACHER')]),'learn'));
 failure(()=>choose(s,'teach','activity',other.activity_key));
});
test('inherited scoped Admin audience remains programme-bound while explicit personal assignments take precedence',()=>{
 const s=state(false,[ctx('PROGRAM_ADMIN'),{...ctx('TEACHER'),courseId:other.activity_id}]);
 const result=choose(s,'teach');assert.equal(result.destination,'/academy/admin/#activity/PROGRAM/programme-one/teach');assert.equal(result.context.role,'PROGRAM_ADMIN');
 const auth=native(s,result.destination);assert(actualRole(auth,activity.activity_key,'TEACHER'));assert(!actualRole(auth,'PROGRAM:unrelated','TEACHER'));
 const explicit=state(false,[ctx('PROGRAM_ADMIN'),ctx('TEACHER'),ctx('STUDENT')]);assert.equal(choose(explicit,'teach').destination,'/academy/#activity/PROGRAM/programme-one/teach');assert.equal(choose(explicit,'learn').destination,'/academy/#activity/PROGRAM/programme-one/learn');
 failure(()=>choose(s,'admin','activity',other.activity_key));
});
test('current role removal, activity withdrawal and forged selections fail closed',()=>{
 const s=state(true,[{scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'}]);
 failure(()=>choose({...s,account:{...s.account,global_admin:false},contexts:[]},'teach'));
 for(const value of [{active:false},{lifecycle:'ARCHIVED'}])failure(()=>choose({...s,activities:[{...activity,...value}]},'teach'));
 assert.throws(()=>choose({...s,account:{...s.account,active:false}},'teach'),e=>e.status===401);
 assert.throws(()=>dashboardChoice(s,{mode:'teach',tool:'activity',activityKey:activity.activity_key,role:'GLOBAL_ADMIN'}));
 failure(()=>choose(s,'learn','planning'));failure(()=>choose(s,'learn','attendance'));
});
test('programme navigation uses current exact mappings and selected authority without changing personal summaries or read count',async()=>{
 const global=state(true,[{scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'}]),env={WEBSITE_PLATFORM_NAVIGATION:JSON.stringify({alimiyah:activity.activity_id,reboot:other.activity_id})};
 for(const mode of ['learn','teach','admin']){
  const calls=[],read=async(path,input,selected)=>{calls.push({path,input,selected});if(path==='/api/academy/entrance')return {startDate:'2026-11-01',endDate:'2026-11-07',timezone:'Africa/Johannesburg',personalActivities:[],personalTimetable:[],calendarEvents:[]};if(path.endsWith('/list'))return {assessments:[]};if(path.endsWith('/get'))return {requests:[]};throw Error('Unexpected read '+path);};
  const before=structuredClone(global),summary=await dashboardSummary(global,env,{mode},read);
  assert.deepEqual(summary.programmeNavigation,[{navigationKey:'alimiyah',activityKey:activity.activity_key},{navigationKey:'reboot',activityKey:other.activity_key}]);assert.deepEqual(summary.activities,[]);assert.deepEqual(summary.timetable,[]);assert.equal(calls.length,mode==='admin'?3:2);assert.deepEqual(global,before);
 }
 const read=async path=>path==='/api/academy/entrance'?{startDate:'2026-11-01',endDate:'2026-11-07',timezone:'Africa/Johannesburg',personalActivities:[],personalTimetable:[]}:{assessments:[]};
 const teacher=await dashboardSummary(state(false,[ctx('TEACHER')]),env,{mode:'teach'},read);assert.deepEqual(teacher.programmeNavigation,[{navigationKey:'alimiyah',activityKey:activity.activity_key}]);
 const learner=await dashboardSummary(state(false,[ctx('STUDENT')]),env,{mode:'learn'},read);assert.deepEqual(learner.programmeNavigation,[{navigationKey:'alimiyah',activityKey:activity.activity_key}]);
 const withdrawn={...global,activities:[{...activity,active:false},{...other,lifecycle:'ARCHIVED'}]};assert.deepEqual((await dashboardSummary(withdrawn,env,{mode:'teach'},read)).programmeNavigation,[]);
});
