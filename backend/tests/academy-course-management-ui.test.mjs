import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/academy-runtime.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const source=readFileSync(new URL('../../js/m4l-academy-course-management.js',import.meta.url),'utf8');
const markup=readFileSync(new URL('../../academy/courses/manage/index.html',import.meta.url),'utf8');
async function fixture(){const f=await courseFixture();f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';for(const m of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+m,import.meta.url),'utf8'));return f;}
async function screen(env,identity='0001',search='') {
 const login=await worker.fetch(new Request('http://localhost/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'login-'+identity,pin:'1234'})}),env);let token=(await login.json()).token;
 const elements=new Map(),events=new Map(),documentEvents=new Map(),requests=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',value:'',disabled:false,listeners:{},showModal(){this.open=true;},classList:{toggle(){},add(){},remove(){}},replaceChildren(){this.innerHTML='';},close(){this.open=false;},focus(){},setSelectionRange(){},querySelector:selector=>id==='course-dialog'?element('dialog:'+selector):null,querySelectorAll:()=>[],addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){}});return elements.get(id);};
 const context={console,URLSearchParams,crypto,Date,Map,Set,WeakMap,location:{search,origin:'http://localhost'},localStorage:{getItem:()=>token},document:{createElement:tag=>element('created:'+tag),getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(type,fn)=>documentEvents.set(type,[...(documentEvents.get(type)||[]),fn])},window:{M4L_ENROLMENT_WORKSPACE:{reset(){},canLeave:()=>true,open:async()=>{}},M4L_CONFIG:{API_BASE:''},addEventListener:(type,fn)=>events.set(type,fn)},fetch:async(path,options)=>{requests.push(path);return worker.fetch(new Request('http://localhost'+path,options),env);}};
 context.window.history={replaceState:(_state,_title,url)=>{context.location.search=url.startsWith('?')?url:'';}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../../js/m4l-time.js',import.meta.url),'utf8'),context);vm.runInContext(source,context);await documentEvents.get('DOMContentLoaded')[0]();
 const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,2));};await settle();
 return {element,requests,context,events,settle,enter:(field,value)=>documentEvents.get('input').at(-1)({target:{dataset:{field},value,type:'text'}}),chooseDay:day=>documentEvents.get('change').at(-1)({target:{dataset:{day:String(day)},checked:true,type:'checkbox'}}),chooseRole:(accountId,role,checked)=>documentEvents.get('change').at(-1)({target:{dataset:{person:accountId,role},checked,type:'checkbox'}}),searchPeople:value=>documentEvents.get('input').at(-1)({target:{id:'course-people-search',value,selectionStart:value.length}}),filter:async(key,value)=>{const el=element(key==='search'?'course-search':'course-status-filter');el.value=value;el.listeners[key==='search'?'input':'change']();await settle();},click:async(action,dataset={})=>{documentEvents.get('click')[0]({target:{closest:()=>({dataset:{cmAction:action,...dataset}})},preventDefault(){}});await settle();},changeToken:value=>{token=value;events.get('storage')({key:'m4l_account_token'});}};
}

test('Save participants persists every changed role even when search hides the users, without changing the published schedule',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env,'0001','?course=subject-1&run=run-1&tab=participants'),before=f.db.prepare('SELECT * FROM timetable_publications').all();
  let html=page.element('course-editor').innerHTML;assert.match(html,/data-stage="(?:PUBLISHED|ACTIVE)"/);assert.equal((html.match(/data-cm-action="save-participants"/g)||[]).length,2);assert.match(html,/data-cm-action="save-participants"[^>]* disabled/);
  const changes=[['account-0008','STUDENT'],['account-0009','TEACHER'],['account-0010','PROGRAM_ADMIN']];
  for(const [accountId,role] of changes)page.chooseRole(accountId,role,true);
  assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),true);page.searchPeople('no users match this filter');
  html=page.element('course-editor').innerHTML;assert.match(html,/No users match this view/);assert.match(html,/3 users have unsaved changes/);assert.match(html,/data-cm-save-state>Unsaved participant changes/);assert.doesNotMatch(html,/data-cm-action="save-participants"[^>]* disabled/);
  const reads=page.requests.filter(p=>p.endsWith('/participants')).length;
  await page.click('save-participants');assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);assert.match(page.element('course-message').textContent,/saved for 3 users/);
  assert.equal(page.requests.filter(p=>p.endsWith('/participants-save')).length,3);assert.equal(page.requests.filter(p=>p.endsWith('/participants')).length,reads,'saving does not reread the entire participant directory');
  for(const [accountId,role] of changes)assert.ok(f.db.prepare('SELECT role FROM effective_activity_roles WHERE account_id=? AND activity_key=?').all(accountId,'COURSE:subject-1').some(r=>r.role===role));
  assert.deepEqual(f.db.prepare('SELECT * FROM timetable_publications').all(),before);
  const reopened=await screen(f.env,'0001','?course=subject-1&run=run-1&tab=participants');html=reopened.element('course-editor').innerHTML;
  for(const [accountId,role] of changes)assert.match(html,new RegExp(`data-person="${accountId}" data-role="${role}" checked`));
  assert.match(html,/data-person="account-0001" data-role="PROGRAM_ADMIN" checked disabled/,'Global Admin access remains inherited');
 }finally{f.db.close();}
});

test('a lost participant save acknowledgement keeps only unfinished changes and retries the same operation',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env,'0001','?course=subject-1&run=run-1&tab=participants'),original=page.context.fetch,writes=[];
  page.context.fetch=async(path,options)=>{const result=await original(path,options);if(path.endsWith('/participants-save')){writes.push(JSON.parse(options.body));if(writes.length===2)throw Error('Connection lost');}return result;};
  page.chooseRole('account-0008','STUDENT',true);page.chooseRole('account-0009','TEACHER',true);page.chooseRole('account-0010','PROGRAM_ADMIN',true);
  await page.click('save-participants');assert.equal(writes.length,2);assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),true);assert.match(page.element('course-message').textContent,/1 of 3 users saved.*Connection lost.*Remaining participant changes are kept/);assert.match(page.element('course-editor').innerHTML,/2 users have unsaved changes/);
  await page.click('save-participants');assert.equal(writes.length,4);assert.equal(writes[1].operationId,writes[2].operationId);assert.equal(writes.filter(w=>w.accountId==='account-0008').length,1);assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);assert.match(page.element('course-editor').innerHTML,/All participant changes saved/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM effective_activity_roles WHERE activity_key='COURSE:subject-1' AND account_id='account-0009' AND role='TEACHER'").get().n,1);
 }finally{f.db.close();}
});

test('reverting a participant checkbox leaves no unsaved change or save request',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env,'0001','?course=subject-1&run=run-1&tab=participants');
  page.chooseRole('account-0008','TEACHER',true);assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),true);page.chooseRole('account-0008','TEACHER',false);assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);
  await page.click('save-participants');assert.equal(page.requests.filter(p=>p.endsWith('/participants-save')).length,0);
 }finally{f.db.close();}
});

test('Course workspace opens a compact editor, saves name-only drafts and presents publication validation',async()=>{
 const f=await fixture(),original=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('External request');};
 try{
  const page=await screen(f.env);assert.equal(page.element('course-workspace').hidden,false);assert.ok(page.element('course-account-name').textContent);assert.match(page.element('course-list').innerHTML,/Synthetic/);assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);assert.equal(page.requests.filter(p=>p.endsWith('/courses/list')).length,1);assert.equal(page.requests.filter(p=>p.endsWith('/courses/get')).length,0);
  await page.click('select',{course:'subject-1',run:'run-1'});assert.match(page.element('course-tabs').innerHTML,/Participants/);
  page.context.window.M4LCourses.newCourse();page.enter('name','A new workshop');await page.context.window.M4LCourses.save();assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);assert.match(page.element('course-editor').innerHTML,/A new workshop/);
  await page.context.window.M4LCourses.validate();assert.match(page.element('course-editor').innerHTML,/A few details need attention/);assert.match(page.element('course-editor').innerHTML,/Choose Free or Paid/);assert.ok(!page.element('course-editor').innerHTML.includes('data-cm-action="publish"'));
  const originalRequest=page.context.fetch;let release;page.context.fetch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return originalRequest(...args);};
  const late=page.context.window.M4LCourses.select('subject-1','run-1');page.changeToken('another-account');release();await assert.rejects(late,/account changed/);assert.equal(page.element('course-workspace').hidden,true);assert.equal(page.element('course-editor').innerHTML,'');assert.equal(page.element('course-list').innerHTML,'');assert.equal(outbound,0);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('students, teachers and unrelated Program Admins cannot load Course management records',async()=>{
 const f=await fixture();try{for(const id of ['0002','0003','0004']){const page=await screen(f.env,id);assert.equal(page.element('course-workspace').hidden,true);assert.match(page.element('course-access-message').textContent,/Global Admin/);assert.deepEqual(page.requests,['/api/account/session']);}}finally{f.db.close();}
});

test('assigned Course Admins select their Course with no create action; scheduling links open Sessions',async()=>{
 const f=await fixture();try{f.db.exec("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('course-admin-ui','account-0004','COURSE:subject-1','PROGRAM_ADMIN',1,'CONFIRMED')");const page=await screen(f.env,'0004','?view=scheduling');assert.equal(page.element('course-workspace').hidden,false);assert.equal(page.element('course-new').hidden,true);assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);await page.click('select',{course:'subject-1',run:'run-1'});assert.match(page.element('course-editor').innerHTML,/cm-sessions/);assert.ok(!page.element('course-editor').innerHTML.includes('GlobalSubject'));}finally{f.db.close();}
});

test('direct Course links work, and filtering or refreshing an empty view never picks a default',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env,'0001','?course=subject-1&run=run-1');assert.match(page.element('course-tabs').innerHTML,/Participants/);
  await page.filter('search','no-course-matches-this');assert.match(page.element('course-list').innerHTML,/No Courses match/);assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);assert.equal(new URLSearchParams(page.context.location.search).has('course'),false);
  await page.filter('search','');assert.match(page.element('course-list').innerHTML,/Synthetic/);assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);
  const gets=page.requests.filter(p=>p.endsWith('/courses/get')).length;page.element('course-refresh').listeners.click();await page.settle();assert.equal(page.requests.filter(p=>p.endsWith('/courses/get')).length,gets);assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);
  await page.click('select',{course:'subject-1',run:'run-1'});const stage=/data-stage="([^"]+)"/.exec(page.element('course-editor').innerHTML)[1];await page.filter('status',stage==='ACTIVE'?'CANCELLED':'ACTIVE');assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);assert.doesNotMatch(page.element('course-list').innerHTML,/aria-pressed="true"/);
  await page.filter('status','');const originalFetch=page.context.fetch;let release;page.context.fetch=async(...args)=>{if(args[0].endsWith('/courses/get'))await new Promise(resolve=>{release=resolve;});return originalFetch(...args);};const late=page.context.window.M4LCourses.select('subject-1','run-1');await page.filter('search','no-match');release();await late;assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/,'A late Course response cannot restore a selection cleared by filtering');
 }finally{f.db.close();}
});

test('a filter that hides unsaved Course edits requires confirmation and keeps the saved Course',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env);page.context.window.M4LCourses.newCourse();page.enter('name','Filter guarded draft');await page.context.window.M4LCourses.save();const courseId=new URLSearchParams(page.context.location.search).get('course');
  page.enter('name','Unfinished title');await page.filter('search','no-match');assert.match(page.element('course-dialog').innerHTML,/Unsaved changes/);assert.equal(page.element('course-search').value,'');
  page.element('dialog:[data-dialog-cancel]').listeners.click();await page.click('tab',{tab:'details'});assert.match(page.element('course-editor').innerHTML,/value="Unfinished title"/);assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),true);assert.equal(new URLSearchParams(page.context.location.search).get('course'),courseId);
  await page.filter('search','no-match');page.element('dialog:[data-dialog-confirm]').listeners.click();await page.settle();assert.match(page.element('course-editor').innerHTML,/>Select a course<\/h2>/);assert.equal(page.element('course-search').value,'no-match');assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);assert.equal(new URLSearchParams(page.context.location.search).has('course'),false);assert.equal(f.db.prepare('SELECT name FROM activities WHERE activity_id=?').get(courseId).name,'Filter guarded draft');
 }finally{f.db.close();}
});

test('new Course page uses delivery terminology and an honest private-media placeholder',()=>{
 assert.ok(!markup.includes('m4l-global-curriculum.js'));assert.ok(!markup.includes('m4l-global-course-scheduler.js'));assert.match(markup,/course-status-filter/);assert.match(markup,/CANCELLED/);assert.match(source,/Private Academy media storage is still to be connected/);assert.match(source,/Categorisation|categorisation/);assert.ok(!source.includes('data-gcm-tab="tasks"'));
});


test('schedule validation fills sessions, opens review, requires acceptance and retains that acceptance after reopening',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env);page.context.window.M4LCourses.newCourse();
  for(const [field,value] of Object.entries({name:'Auto workshop',accessModel:'FREE',startDate:'2026-10-12',endDate:'2026-10-25',startTime:'1200',endTime:'1pm',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901'}))page.enter(field,value);
  page.chooseDay(1);page.chooseDay(3);await page.context.window.M4LCourses.validate();
  let html=page.element('course-editor').innerHTML;assert.match(html,/cm-workflow/);assert.match(page.element('course-tabs').innerHTML,/Sessions · 4/);assert.match(html,/value="2026-10-12"/);assert.match(html,/value="2026-10-21"/);assert.match(html,/value="12:00"/);assert.match(html,/value="13:00"/);assert.doesNotMatch(html,/type="time"/);assert.ok(!html.includes('Synthetic learner 8'));
  assert.match(html,/Review &amp; accept sessions|Review & accept sessions/);assert.ok(!html.includes('data-cm-action="publish"'));
  await page.click('tab',{tab:'review'});assert.match(page.element('course-editor').innerHTML,/Accept reviewed sessions/);await page.click('accept');
  assert.match(page.element('course-editor').innerHTML,/Review accepted/);assert.match(page.element('course-editor').innerHTML,/data-cm-action="publish"/);
  const saved=f.db.prepare("SELECT a.activity_id,m.run_id FROM course_management_drafts m JOIN activities a USING(activity_key) WHERE a.name='Auto workshop'").get();
  await page.context.window.M4LCourses.select(saved.activity_id,saved.run_id,'review');assert.match(page.element('course-editor').innerHTML,/Review accepted/);
  await page.click('publish');assert.match(page.element('course-message').textContent,/published/);assert.equal(f.db.prepare('SELECT count(*) n FROM published_lessons WHERE activity_key=?').get('COURSE:'+saved.activity_id).n,4);
 }finally{f.db.close();}
});

test('typed clock entries survive draft reopening and regeneration uses the newly saved schedule',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env);page.context.window.M4LCourses.newCourse();
  for(const [field,value] of Object.entries({name:'Clock save regression',accessModel:'PAID',startDate:'2026-10-12',endDate:'2026-10-25',startTime:'830',endTime:'930',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901'}))page.enter(field,value);
  page.chooseDay(1);await page.context.window.M4LCourses.save();
  const saved=f.db.prepare("SELECT a.activity_id,m.run_id,m.details_json FROM course_management_drafts m JOIN activities a USING(activity_key) WHERE a.name='Clock save regression'").get();
  assert.equal(new URLSearchParams(page.context.location.search).get('course'),saved.activity_id);
  const reopened=await screen(f.env,'0001',page.context.location.search);assert.match(reopened.element('course-editor').innerHTML,/value="08:30"/);
  assert.equal(JSON.parse(saved.details_json).startTime,'08:30');assert.equal(JSON.parse(saved.details_json).endTime,'09:30');
  await page.context.window.M4LCourses.select(saved.activity_id,saved.run_id);
  assert.match(page.element('course-editor').innerHTML,/value="08:30"/);assert.match(page.element('course-editor').innerHTML,/value="09:30"/);
  await page.context.window.M4LCourses.validate();assert.match(page.element('course-tabs').innerHTML,/Sessions · 2/);
  await page.click('tab',{tab:'details'});page.enter('startTime','2100');page.enter('endTime','2130');page.enter('endDate','2026-10-12');
  await page.click('generate');assert.match(page.element('course-dialog').innerHTML,/Replace the draft sessions/);
  page.element('dialog:[data-dialog-confirm]').listeners.click();await page.settle();
  assert.match(page.element('course-tabs').innerHTML,/Sessions · 1/);assert.match(page.element('course-editor').innerHTML,/value="21:00"/);assert.match(page.element('course-editor').innerHTML,/value="21:30"/);
  const details=JSON.parse(f.db.prepare('SELECT details_json FROM course_management_drafts WHERE run_id=?').get(saved.run_id).details_json);
  assert.equal(details.sessions.length,1);assert.equal(details.sessions[0].date,'2026-10-12');assert.equal(details.sessions[0].startTime,'21:00');assert.equal(details.sessions[0].endTime,'21:30');
  await page.context.window.M4LCourses.select(saved.activity_id,saved.run_id,'sessions');assert.match(page.element('course-editor').innerHTML,/value="21:00"/);
 }finally{f.db.close();}
});

test('an older draft with manual sessions and no generation fingerprint can regenerate from its corrected schedule',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env);page.context.window.M4LCourses.newCourse();
  for(const [field,value] of Object.entries({name:'Older draft regression',accessModel:'FREE',startDate:'2026-10-12',endDate:'2026-10-25',startTime:'08:30',endTime:'09:30',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901'}))page.enter(field,value);
  page.chooseDay(1);for(let i=0;i<3;i++)await page.click('add-session');
  await page.click('tab',{tab:'details'});page.enter('startTime','');page.enter('endTime','');await page.context.window.M4LCourses.save();
  const saved=f.db.prepare("SELECT a.activity_id,m.run_id,m.schedule_sha256 FROM course_management_drafts m JOIN activities a USING(activity_key) WHERE a.name='Older draft regression'").get();assert.equal(saved.schedule_sha256,null);
  await page.context.window.M4LCourses.select(saved.activity_id,saved.run_id);page.enter('startTime','830');page.enter('endTime','930');
  await page.click('generate');assert.match(page.element('course-dialog').innerHTML,/Replace the draft sessions/);page.element('dialog:[data-dialog-confirm]').listeners.click();await page.settle();
  const details=JSON.parse(f.db.prepare('SELECT details_json FROM course_management_drafts WHERE run_id=?').get(saved.run_id).details_json);
  assert.deepEqual(details.sessions.map(s=>[s.date,s.startTime,s.endTime]),[['2026-10-12','08:30','09:30'],['2026-10-19','08:30','09:30']]);
 }finally{f.db.close();}
});


test('Course list is the first tab, preserves drafts across tabs and guards switching courses',async()=>{
 const f=await fixture();try{
  const page=await screen(f.env);
  assert.match(page.element('course-tabs').innerHTML,/id="cm-tab-list"[^>]*aria-selected="true"/);
  assert.match(page.element('course-tabs').innerHTML,/id="cm-tab-details"[^>]*disabled/);
  page.context.window.M4LCourses.newCourse();page.enter('name','Kept when returning to list');
  await page.click('tab',{tab:'list'});assert.equal(page.element('course-list-panel').hidden,false);assert.equal(page.element('course-editor').hidden,true);
  await page.click('tab',{tab:'details'});assert.equal(page.element('course-list-panel').hidden,true);assert.equal(page.element('course-editor').hidden,false);assert.match(page.element('course-editor').innerHTML,/value="Kept when returning to list"/);
  await page.click('tab',{tab:'list'});await page.click('select',{course:'subject-1',run:'run-1'});assert.match(page.element('course-dialog').innerHTML,/Unsaved changes/);
  page.element('dialog:[data-dialog-cancel]').listeners.click();await page.click('tab',{tab:'details'});assert.match(page.element('course-editor').innerHTML,/value="Kept when returning to list"/);
 }finally{f.db.close();}
});
