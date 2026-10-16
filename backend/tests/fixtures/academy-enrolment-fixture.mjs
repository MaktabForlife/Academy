import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {upcomingCourseFixture} from './academy-upcoming-course-fixture.mjs';
import worker from '../../src/academy-runtime.js';
export const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
export async function enrolmentFixture(){
 const f=await upcomingCourseFixture();f.db.exec(readFileSync(new URL('../../migrations/academy/0026_enrolment_requests.sql',import.meta.url),'utf8'));
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 f.get=async(path,token='')=>{const r=await worker.fetch(new Request('http://localhost'+path,{headers:token?{Authorization:'Bearer '+token}:{}}),f.env);return {status:r.status,body:await r.json()};};
 f.enrol=(action,input={},token=f.tokens.admin)=>f.call('/api/admin/platform/enrolment/'+action,input,token);
 f.write=(action,input={},token=f.tokens.admin)=>f.enrol(action,{operationId:crypto.randomUUID(),...input},token);
 f.program=f.db.prepare("SELECT * FROM activities WHERE kind='PROGRAM' LIMIT 1").get();
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('enrolment-scoped-admin','account-0006',?,'PROGRAM_ADMIN',1,'CONFIRMED')").run('COURSE:'+f.published.courseId);
 const entry=async(key,cost,active=true)=>{const id=crypto.randomUUID();ok(await f.write('catalogue-save',{id,activityKey:key,year:2027,cost,active,order:0,baseRevision:0}));return {id,revision:1};};
 f.courseEntry=await entry('COURSE:'+f.published.courseId,'R350 for the Course');f.programEntry=await entry(f.program.activity_key,'R300 per term');f.hiddenEntry=await entry('COURSE:'+f.draft.courseId,'Contact Admin',false);
 f.submission=(changes={})=>({operationId:crypto.randomUUID(),name:'New learner',whatsapp:'+27 82 123 4567',paid:false,entries:[f.courseEntry,f.programEntry],...changes});
 f.submit=(input=f.submission(),token='')=>f.call('/api/academy/enrolment/submit',input,token);
 return f;
}
