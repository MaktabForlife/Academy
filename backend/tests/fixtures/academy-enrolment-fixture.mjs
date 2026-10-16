import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {upcomingCourseFixture} from './academy-upcoming-course-fixture.mjs';
import worker from '../../src/academy-runtime.js';
import {payloadHash} from '../../src/programs/timetable-model.js';
export const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
export async function enrolmentFixture(){
 const f=await upcomingCourseFixture();f.db.exec(readFileSync(new URL('../../migrations/academy/0026_enrolment_requests.sql',import.meta.url),'utf8'));
 f.db.exec(readFileSync(new URL('../../migrations/academy/0027_enrolment_profile_contacts.sql',import.meta.url),'utf8'));
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 f.get=async(path,token='')=>{const r=await worker.fetch(new Request('http://localhost'+path,{headers:token?{Authorization:'Bearer '+token}:{}}),f.env);return {status:r.status,body:await r.json()};};
 f.enrol=(action,input={},token=f.tokens.admin)=>f.call('/api/admin/platform/enrolment/'+action,input,token);
 f.write=(action,input={},token=f.tokens.admin)=>f.enrol(action,{operationId:crypto.randomUUID(),...input},token);
 f.program=f.db.prepare("SELECT * FROM activities WHERE kind='PROGRAM' LIMIT 1").get();
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('enrolment-scoped-admin','account-0006',?,'PROGRAM_ADMIN',1,'CONFIRMED')").run('COURSE:'+f.published.courseId);
 const entry=async(key,cost,active=true)=>{const id=crypto.randomUUID();ok(await f.write('catalogue-save',{id,activityKey:key,year:2027,cost,active,order:0,baseRevision:0}));return {id,revision:1};};
 f.courseEntry=await entry('COURSE:'+f.published.courseId,'R350 for the Course');f.programEntry=await entry(f.program.activity_key,'R300 per term');f.hiddenEntry=await entry('COURSE:'+f.draft.courseId,'Contact Admin',false);
 f.submission=(changes={})=>({operationId:crypto.randomUUID(),name:'New learner',whatsapp:'+27 82 123 4567',paid:false,entries:[f.courseEntry,f.programEntry],...changes});
 f.submit=(input=f.submission(),token=f.tokens.student)=>f.call('/api/academy/enrolment/submit',input,token);
 // Seed pre-106.89 inbox records only; anonymous submission is now prohibited.
 f.legacySubmit=async(input=f.submission(),account=null)=>{const id=crypto.randomUUID(),at=new Date().toISOString(),person={name:input.name,whatsapp:input.whatsapp,paid:input.paid},hash=await payloadHash({person,account,entries:input.entries.slice().sort((a,b)=>a.id.localeCompare(b.id))});f.db.prepare('INSERT INTO academy_enrolment_requests VALUES(?,?,?,?,?,?,?,1,?,?)').run(id,input.operationId,hash,account,person.name,person.whatsapp,Number(person.paid),at,at);for(const item of input.entries){const e=f.db.prepare('SELECT e.*,a.name FROM academy_enrolment_catalogue e JOIN activities a USING(activity_key) WHERE entry_id=?').get(item.id);f.db.prepare('INSERT INTO academy_enrolment_request_items VALUES(?,?,?,?,?,?)').run(id,e.entry_id,e.activity_key,e.name,e.enrolment_year,e.cost_text);}return {status:200,body:{id}};};
 return f;
}
