import test from 'node:test';
import assert from 'node:assert/strict';
import {courseReaderSessions} from '../src/academy/d1/course-reader-sessions.js';
const activity={activity_key:'COURSE:kahf',activity_id:'kahf'},auth={workspace:'LEARN',state:{},user:{},classView:{activityKey:activity.activity_key,classId:'published-offering'}};
function fixture(range){const reads=[];return {reads,repository:{db:{prepare(sql){return {bind(...values){reads.push({sql,values});return {first:async()=>range};}};}}}};}
test('all course dates come from its accepted publications and use the normal account/class projection',async()=>{
 const f=fixture({start_date:'2026-10-18',end_date:'2026-11-08'}),dates=['2026-10-18','2026-10-25','2026-11-01','2026-11-08'];let calls=0;
 const result=await courseReaderSessions(f.repository,auth,activity,{entrance:async(repo,state,user,input,now,options)=>{
  calls++;assert.equal(repo,f.repository);assert.equal(state,auth.state);assert.equal(user,auth.user);assert.equal(options.auth,auth);assert.equal(options.days,22);assert.equal(input.id,'kahf');assert.equal(input.startDate,dates[0]);
  return {activity:{id:'kahf'},timezone:'Africa/Johannesburg',personalTimetable:[...dates.map(date=>({kind:'COURSE',activityId:'kahf',date,joinKey:'opaque-reference',joinUrl:'https://zoom.invalid/private'})),{kind:'COURSE',activityId:'another',date:dates[0]}]};
 }});
 assert.equal(calls,1);assert.equal(result.sessions.length,4);assert.deepEqual(result.sessions.map(s=>s.date),dates);assert.doesNotMatch(JSON.stringify(result),/zoom\.invalid|joinUrl|another/);assert.deepEqual(f.reads[0].values,['COURSE:kahf','published-offering','published-offering']);
});
test('no publication or an unsupported date span never fabricates sessions or widens the read',async()=>{
 for(const range of [null,{}, {start_date:'2026-10-18',end_date:'2028-10-18'}]){
  const f=fixture(range);let called=false;const result=await courseReaderSessions(f.repository,auth,activity,{entrance:async()=>{called=true;}});assert.equal(called,false);assert.deepEqual(result.sessions,[]);
 }
});
