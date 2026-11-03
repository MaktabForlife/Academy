import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSummary,dashboardTimetableAudience} from '../src/academy/d1/web-platform/dashboard.mjs';
const area={kind:'PROGRAM',id:'one',name:'Aalimiyah',roles:['GLOBAL_ADMIN','PROGRAM_ADMIN']};
const state={account:{active:true,global_admin:true},activities:[{kind:'PROGRAM',activity_id:'one',activity_key:'PROGRAM:one',active:true,lifecycle:'ACTIVE'}],contexts:[{role:'GLOBAL_ADMIN'}]};
test('Global Admin uses checked oversight timetable in Learn and Teach while ancillary readers keep the selected presentation',async()=>{
 for(const mode of ['learn','teach','admin']){
  const calls=[],read=async(path,body,audience)=>{calls.push({path,audience});if(path==='/api/academy/entrance')return {startDate:'2026-11-01',endDate:'2026-11-07',timezone:'Africa/Johannesburg',personalActivities:audience==='admin'?[area]:[],personalTimetable:audience==='admin'?[{kind:'PROGRAM',activityId:'one',activityName:'Aalimiyah',date:'2026-11-05',startTime:'09:30',endTime:'10:30',startsAt:Date.parse('2026-11-05T07:30:00Z'),endsAt:Date.parse('2026-11-05T08:30:00Z'),status:'SCHEDULED',subjectName:'Hadith'}]:[],timetable:[]};return {assessments:[],requests:[]};};
  const before=structuredClone(state),data=await dashboardSummary(state,{}, {mode,date:'2026-11-05'},read);
  assert.equal(data.mode,mode);assert.equal(data.timetable.length,1);assert.equal(calls[0].audience,'admin');assert(calls.slice(1).every(c=>c.audience===mode));assert.deepEqual(state,before);
 }
});
test('ordinary and scoped Admin accounts retain their selected timetable audience; presentation hints grant no authority',()=>{
 for(const global_admin of [false,0,undefined,'true'])for(const mode of ['learn','teach','admin'])assert.equal(dashboardTimetableAudience({account:{global_admin},contexts:[{role:'PROGRAM_ADMIN'}]},mode),mode);
 for(const global_admin of [true,1])for(const mode of ['learn','teach','admin'])assert.equal(dashboardTimetableAudience({account:{global_admin}},mode),'admin');
});
