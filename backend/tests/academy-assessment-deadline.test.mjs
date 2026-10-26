import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timingFields,collectionPolicy} from '../src/academy/d1/assessment-timing.js';

const assignment={assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',availableFrom:'2026-01-01T00:00:00Z'};
for(const [timezone,date,expected] of [
 ['Africa/Johannesburg','2026-12-05','2026-12-05T11:00:00.000Z'],
 ['Asia/Riyadh','2026-12-05','2026-12-05T10:00:00.000Z'],
 ['Europe/London','2026-07-05','2026-07-05T12:00:00.000Z'],
 ['Europe/London','2026-12-05','2026-12-05T13:00:00.000Z']
])test('assignment due date has a 13:00 deadline in '+timezone+' on '+date,async()=>{
 const result=await timingFields({}, {...assignment,dueDate:date},null,timezone);
 assert.equal(result.due,expected);assert.equal(result.cutoff,null);
});
test('opening after 13:00 on the chosen due day is rejected',async()=>{
 await assert.rejects(timingFields({}, {...assignment,availableFrom:'2026-12-05T14:00',dueDate:'2026-12-05'},null,'Africa/Johannesburg'),/due date must follow opening/);
});
test('13:00 is the late boundary while manual Close submissions controls uploads',()=>{
 const row={assessment_kind:'ASSIGNMENT',timing_mode:'UNTIMED',timezone:'Africa/Johannesburg',available_from:'2026-12-01T00:00:00Z',due_at:'2026-12-05T11:00:00.000Z'};
 assert.equal(collectionPolicy(row,null,null,new Date('2026-12-05T10:59:59Z')).late,false);
 const deadline=collectionPolicy(row,null,null,new Date('2026-12-05T11:00:00Z'));assert.equal(deadline.late,true);assert.equal(deadline.open,true);
 assert.equal(collectionPolicy(row,{closed_at:'2026-12-05T11:00:00Z'},null,new Date('2026-12-05T11:00:01Z')).open,false);
});
test('optional due dates remain optional and saving unrelated fields does not rewrite an existing deadline',async()=>{
 assert.equal((await timingFields({},assignment,null,'Africa/Johannesburg')).due,null);
 const current={assessment_kind:'ASSIGNMENT',timing_mode:'UNTIMED',available_from:assignment.availableFrom,timezone:'Africa/Johannesburg',due_at:'2026-12-05T22:00:00.000Z'};
 assert.equal((await timingFields({},assignment,current)).due,current.due_at);
 assert.equal((await timingFields({}, {...assignment,dueDate:'2026-12-05'},current)).due,'2026-12-05T11:00:00.000Z');
});
test('exam opening and end-of-day cutoff are unaffected by the assignment deadline',async()=>{
 const result=await timingFields({}, {assessmentKind:'EXAM',timingMode:'TIMED',examDate:'2026-12-05',durationMinutes:60},null,'Africa/Johannesburg');
 assert.equal(result.opens,'2026-12-05T01:00:00.000Z');assert.equal(result.cutoff,'2026-12-05T22:00:00.000Z');assert.equal(result.due,null);
});
