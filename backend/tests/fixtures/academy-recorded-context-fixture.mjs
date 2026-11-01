import assert from 'node:assert/strict';
import {videoFixture} from './academy-session-video-fixture.mjs';
import {attendanceProgramId} from './academy-attendance-fixture.mjs';
import worker from '../../src/academy-runtime.js';
export const scope='PROGRAM:'+attendanceProgramId;
export const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
export function seedRecordedOptions(f){
 for(const [id,active] of [['recorded-subject',1],['inactive-subject',0]]){
  f.db.prepare("INSERT INTO subject_catalog VALUES(?,'ACADEMY',?,?,1)").run('ACADEMY:'+id,id,'Synthetic '+id);
  f.db.prepare('INSERT INTO program_subjects VALUES(?,?,?,?)').run(scope,id,'ACADEMY:'+id,active);
  f.db.prepare('INSERT INTO modules VALUES(?,?,?,NULL,?,1,1)').run(scope,id+'-module',id,'Synthetic '+id+' module');
 }
 f.db.prepare("INSERT INTO modules VALUES(?,'inactive-module',NULL,NULL,'Inactive module',1,0)").run(scope);
 for(const [who,role] of [['0004','PROGRAM_ADMIN'],['0006','TEACHER']])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('recorded-'+who,'account-'+who,scope,role);
}
export async function recordedFixture(){
 const f=await videoFixture();seedRecordedOptions(f);
 f.request=async(action,input={},token,workspace='ADMIN')=>{
  const response=await worker.fetch(new Request('http://localhost/api/academy/lesson-media/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,...input})}),f.env);
  return {status:response.status,body:await response.json()};
 };
 f.admin=await f.login('0001');f.scoped=await f.login('0004');
 f.create=async(date='2026-10-27')=>{
  const input={activityKey:scope,startDate:date,endDate:date},session=ok(await f.request('sessions',input,f.admin)).sessions[0];assert(session);
  return {...ok(await f.request('create',{...input,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},f.admin)),session};
 };
 return f;
}
export const correction=(lessonId,extra={})=>({lessonId,operationId:crypto.randomUUID(),revision:1,subjectKey:'MODULE:recorded-subject-module',teacherIds:['account-0006'],reason:'Synthetic one-day recording correction',...extra});
