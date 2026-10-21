import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window={};runInNewContext(readFileSync(new URL('../../js/m4l-timetable-periods.js',import.meta.url),'utf8'),{window,structuredClone});
const change=input=>JSON.parse(JSON.stringify(window.M4L_TIMETABLE_PERIODS.change(input)));
const periods=[{id:'P1',startTime:'07:00',endTime:'08:00'},{id:'P2',startTime:'08:30',endTime:'09:30'},{id:'P3',startTime:'10:00',endTime:'11:00'}];
const lesson=(id,startTime,endTime,weekdays=[1,2,3,4])=>({id,startTime,endTime,weekdays,classIds:['class-1','class-2'],teacherId:'teacher-1',additionalTeacherIds:[],moduleId:'module-1',zoomLink:'https://zoom.test/lesson'});
test('period changes retime every linked weekday/class without changing lesson identity or source data',()=>{
 const input={periods:structuredClone(periods),rules:[lesson('lesson-a','07:00','08:00'),{...lesson('lesson-b','07:00','08:00',[5]),classIds:['class-3']}],breaks:[],id:'P1',field:'startTime',value:'06:45'},before=structuredClone(input);
 const result=change(input);assert.equal(result.lessonsChanged,5);assert(result.rules.every(r=>r.startTime==='06:45'&&r.endTime==='08:00'));assert.deepEqual(result.rules.map(({startTime,...r})=>r),input.rules.map(({startTime,...r})=>r));assert.deepEqual(input,before);
});
test('a lesson spanning periods changes only at its outer boundaries',()=>{
 const rules=[lesson('span','07:00','11:00')];
 for(const [field,value] of [['startTime','08:45'],['endTime','09:45']])assert.deepEqual(change({periods,rules,id:'P2',field,value}).rules,rules);
 assert.equal(change({periods,rules,id:'P1',field:'startTime',value:'06:45'}).rules[0].startTime,'06:45');
 assert.equal(change({periods,rules,id:'P3',field:'endTime',value:'11:15'}).rules[0].endTime,'11:15');
});
test('partial lessons follow the edited period boundary; unrelated periods retain their times',()=>{
 const input={periods,rules:[lesson('partial','07:15','07:45'),lesson('later','10:00','11:00')],id:'P1',field:'endTime',value:'08:15'};
 const result=change(input);assert.equal(result.rules[0].startTime,'07:15');assert.equal(result.rules[0].endTime,'08:15');assert.deepEqual(result.rules[1],input.rules[1]);
});
test('period-aligned breaks follow the change and gap breaks remain unchanged',()=>{
 const breaks=[{id:'aligned',startTime:'07:00',endTime:'08:00',weekdays:[5],label:'Break'},{id:'gap',startTime:'08:10',endTime:'08:25',weekdays:[4],label:'Gap break'}];
 const result=change({periods,rules:[],breaks,id:'P1',field:'endTime',value:'08:20'});assert.equal(result.breaksChanged,1);assert.equal(result.breaks[0].endTime,'08:20');assert.deepEqual(result.breaks[1],breaks[1]);
 const restored=change({...result,id:'P1',field:'endTime',value:'08:00'});assert.deepEqual(restored.breaks,breaks);
});
test('invalid or overlapping periods and collapsed lessons/breaks reject the whole change',()=>{
 const input={periods:structuredClone(periods),rules:[lesson('partial','07:15','07:45')],breaks:[],id:'P1',field:'startTime'},before=structuredClone(input);
 for(const value of ['bad','24:00','08:00','08:10','07:50'])assert.throws(()=>change({...input,value}));
 assert.throws(()=>change({...input,id:'P2',value:'07:45'}),/cannot overlap/);assert.throws(()=>change({...input,id:'P1',field:'endTime',value:'08:45'}),/cannot overlap/);
 assert.throws(()=>change({...input,rules:[],breaks:[{id:'break',startTime:'07:15',endTime:'08:00',weekdays:[1]}],field:'endTime',value:'07:10'}),/no duration/);
 assert.deepEqual(input,before);
});
test('unchanged times do not create a draft edit',()=>assert.deepEqual(change({periods,rules:[],id:'P1',field:'startTime',value:'07:00'}),{changed:false}));
