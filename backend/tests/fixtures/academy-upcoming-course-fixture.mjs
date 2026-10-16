import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './academy-lesson-media-fixture.mjs';
import {addDays,sunday} from '../../src/academy/entrance.js';
import {dateInTimezone} from '../../src/lib/global-subject-delivery.js';

export async function upcomingCourseFixture({startDay=0}={}){
 const f=await mediaFixture();
 for(const migration of ['0022_academic_calendar.sql','0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../../migrations/academy/'+migration,import.meta.url),'utf8'));
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const tokens={admin:await f.login('0001'),teacher:await f.login('0003'),student:await f.login('0002'),other:await f.login('0006')};
 const startDate=addDays(sunday(dateInTimezone(new Date(),'Africa/Johannesburg')),14+startDay),endDate=addDays(startDate,21),base='/api/admin/platform/courses/';
 f.db.prepare("INSERT OR REPLACE INTO academy_teacher_designations VALUES('account-0003',1,1,?,'account-0001')").run(new Date().toISOString());
 const details={name:'Surah Al Kahf',categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[startDay],startDate,endDate,startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/99999999999',sessions:[]};
 const write=(action,input)=>f.call(base+action,{operationId:crypto.randomUUID(),...input},tokens.admin);
 const published=ok(await write('save',{details}));
 const review=ok(await write('validate',{...published,baseRevision:published.revision}));assert.equal(review.validation.valid,true,JSON.stringify(review));
 const accepted=ok(await write('accept',{...published,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));
 ok(await write('publish',{...published,baseRevision:accepted.revision,validationToken:review.validation.token}));
 const draft=ok(await write('save',{details:{...details,name:'Future draft',zoomLink:'https://zoom.us/j/unpublished-secret'}}));
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('upcoming-draft-teacher','account-0003',?,'TEACHER',1,'CONFIRMED')").run('COURSE:'+draft.courseId);
 return {...f,tokens,published,draft,startDate,endDate};
}
