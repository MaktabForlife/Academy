// Real Academy UI and Worker with disposable SQLite/R2 fixtures. No live data.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {classNotesFixture,seedClassNotes} from '../tests/fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ACADEMY_BROWSER_RUNTIME||'playwright');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const output=resolve(process.env.DASHBOARD_ARTIFACTS||'/private/tmp/academy-dashboard-acceptance');await mkdir(output,{recursive:true});
function seedDashboard(f){
 seedClassNotes(f);
 f.db.prepare("UPDATE class_memberships SET start_date='2026-01-01',end_date=CASE WHEN active=0 THEN '2026-12-31' ELSE end_date END WHERE activity_key=?").run(f.scopes.programA);
 const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Africa/Johannesburg'}).format(new Date()),day=offset=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),now=new Date().toISOString();
 for(const [id,name,offsets,status,published,kind,scope] of [
  ['current','Current Imtihaan',[-1,1],'SCHEDULED',1,'EXAM',f.scopes.programA],
  ['upcoming','Upcoming Imtihaan',[7],'SCHEDULED',1,'EXAM',f.scopes.programA],
  ['draft','Draft Imtihaan',[14],'REGISTERED',0,'EXAM',f.scopes.programA],
  ['past','Past Imtihaan',[-10],'SCHEDULED',1,'EXAM',f.scopes.programA],
  ['cancelled','Cancelled Imtihaan',[5],'CANCELLED',1,'EXAM',f.scopes.programA],
  ['complete','Complete Imtihaan',[3],'COMPLETE',1,'EXAM',f.scopes.programA],
  ['assignment','Assignment',[7],'SCHEDULED',1,'ASSIGNMENT',f.scopes.programA],
  ['private','Private Imtihaan',[7],'SCHEDULED',1,'EXAM',f.scopes.programB]
 ]){
  f.db.prepare("INSERT INTO assessment_registers(register_id,name,class_mode,status,created_at,created_by,updated_at) VALUES(?,?,'ALL',?,?,'account-0001',?)").run(id,name,status,now,now);
  f.db.prepare('INSERT INTO assessment_register_areas VALUES(?,?)').run(id,scope);
  const classId=f.db.prepare('SELECT class_id FROM classes WHERE activity_key=? AND active=1 LIMIT 1').get(scope).class_id;
  for(const [i,offset]of offsets.entries()){
   const assessmentId=id+'-'+i,date=day(offset);
   f.db.prepare("INSERT INTO assessments(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,schedule_published,examiner_id,created_at,created_by,updated_at,register_id,assessment_kind,available_from,due_at) VALUES(?,?,?,?,?,?,60,100,?,'account-0003',?,'account-0001',?,?,?,?,?)").run(assessmentId,scope,classId,'Paper '+i,'Qasas',date,published,now,now,id,kind,date+'T03:00:00+02:00',date+'T23:59:00+02:00');
   if(published&&scope===f.scopes.programA)f.db.prepare("INSERT INTO assessment_recipients(assessment_id,account_id,display_name) VALUES(?,'account-0002','Synthetic learner')").run(assessmentId);
  }
 }
}
const fixture=await classNotesFixture(seedDashboard),checks=[],errors=[],calls=[],snapshots=new Map();
const service=await fixture.notes(),source=(await service.run('sessions',{activityKey:fixture.scopes.programA,date:fixture.today})).sources[0];
const view=await service.run('get',{activityKey:fixture.scopes.programA,source});
await service.run('post',fixture.post(view,{body:'Dashboard preparation · read paragraphs 1–3.'}));
const checked=async result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const adminToken=await fixture.actor('global'),attendanceDate=new Date(Date.parse(fixture.today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const register=await checked(await fixture.call('/api/academy/attendance/get',{activityKey:fixture.scopes.programA,date:attendanceDate},adminToken));
const absenceLesson=register.lessons.find(row=>row.marks.length),presentLesson=register.lessons.find(row=>row!==absenceLesson&&row.marks.length);
const submitAttendance=async(rows,absent)=>{
 const current=await checked(await fixture.call('/api/academy/attendance/get',{activityKey:fixture.scopes.programA,date:attendanceDate},adminToken));
 return checked(await fixture.call('/api/academy/attendance/submit',{activityKey:fixture.scopes.programA,date:attendanceDate,generation:current.generation,scope:'lesson',anchor:rows[0].lesson.anchor,exceptions:Object.fromEntries(rows.map(r=>[r.lesson.anchor,absent?[{accountId:r.marks[0].accountId,status:'ABSENT'}]:[]])),baseRegisterIds:Object.fromEntries(current.lessons.map(r=>[r.lesson.anchor,r.registerId])),operationId:crypto.randomUUID()},adminToken));
};
await submitAttendance([absenceLesson],true);if(presentLesson)await submitAttendance([presentLesson],false);
const teachingWeek=new Date(Date.parse(fixture.today+'T12:00:00Z')-((new Date(fixture.today+'T12:00:00Z').getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);
for(const [actor,offset,action]of [['teacherA',0,'submit'],['teacherA',-7,'submit'],['dual',0,'save']]){
 const result=await fixture.call('/api/academy/planning/'+action,{activityKey:fixture.scopes.programA,period:'WEEKLY',weekStart:new Date(Date.parse(teachingWeek+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),revision:0,content:{title:'Dashboard plan',lessons:[{subject:'Qasas',activities:action==='save'?'Private draft text':'Submitted teaching plan'}]},operationId:crypto.randomUUID()},await fixture.actor(actor));await checked(result);
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true,LEARNING_OPERATIONS:3,IS_DEVELOPMENT:true}');return;}
  let path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+'/')||/\/(?:backend|node_modules|sources)\//.test(path.slice(root.length))||url.pathname.split('/').some(value=>value.startsWith('.'))){res.writeHead(404);res.end();return;}
  if((await stat(path)).isDirectory())path+='/index.html';
  res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',error=>errors.push(error.message));
let holdEntrance=false,releaseEntrance,backgroundGate,failEntranceOnce=false;
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;
 calls.push({path:url.pathname,workspace:headers['x-academy-workspace'],method:req.method()});
 if(url.pathname==='/api/academy/header-date'){await route.fulfill({status:200,json:{gregorian:fixture.today,hijri:'15 Jumada al-ula 1448'}});return;}
 if(failEntranceOnce&&url.pathname==='/api/academy/entrance'){failEntranceOnce=false;await route.fulfill({status:503,json:{success:false,error:'Synthetic temporary timetable outage'}});return;}
 if(holdEntrance&&['/api/academy/entrance','/api/academy/class-notes/timetable','/api/academy/assessments/list'].includes(url.pathname))await backgroundGate;
 const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method(),headers,...(req.method()==='POST'?{body:req.postDataBuffer()}:{})}),fixture.env);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(url.pathname==='/api/academy/entrance'&&response.ok)snapshots.set(headers['x-academy-workspace'],JSON.parse(bytes));
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
});
await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin!==base?route.abort():route.fallback();});
const dashboard=()=>page.locator('#dashboard.active');
async function identity(token,path='/academy/#timetable/learn'){
 await page.goto(base+'/version.json');await page.evaluate(value=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',value);},token);
 await page.goto(base+path);await dashboard().locator('#ad-title').waitFor();
}
async function capture(name){await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);await page.screenshot({path:output+'/'+name,fullPage:false});}
try{
 await page.goto(base+'/academy/#overview');
 const adminStart=calls.length;
 await page.locator('#academy-login').click();await page.locator('#demo-username').fill('separation-dual');await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview button[type=submit]').click();
 await page.waitForURL('**/academy/admin/#administration');await dashboard().locator('#ad-title').waitFor();
 assert.equal(calls.slice(adminStart).filter(call=>call.path==='/api/academy/entrance'&&call.workspace==='LEARN').length,0,'Admin sign-in must not build a personal timetable before opening Admin');
 assert.equal(calls.slice(adminStart).filter(call=>call.path==='/api/academy/entrance'&&call.workspace==='ADMIN').length,1,'Admin loads its destination timetable once');
 checks.push('Verified Admin sign-in opens Admin directly, avoiding a discarded personal timetable');
 await page.goto(base+'/version.json');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.goto(base+'/academy/#overview');
 backgroundGate=new Promise(resolve=>{releaseEntrance=resolve;});holdEntrance=true;
 const firstTimetable=page.waitForRequest(req=>new URL(req.url()).pathname==='/api/academy/entrance');
 await page.locator('#academy-login').click();await page.locator('#demo-username').fill('login-0002');await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview button[type=submit]').click();
 await firstTimetable;await page.locator('#academy-startup').waitFor();
 assert.equal(await page.locator('#overview').isVisible(),false,'Public Home stays hidden during the sign-in handover');
 assert.match(await page.locator('#academy-startup').innerText(),/Opening your dashboard/);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await capture('sign-in-loading-'+width+'.png');}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.academy-startup-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 holdEntrance=false;releaseEntrance();
 await dashboard().locator('#ad-title').waitFor();assert.equal(new URL(page.url()).hash,'#timetable/learn');
 assert.equal(await page.locator('#academy-startup').isVisible(),false);
 await page.setViewportSize({width:1440,height:1000});
 // A cold refresh validates the session once and starts only its final timetable.
 await page.evaluate(()=>sessionStorage.clear());const reloadStart=calls.length;
 backgroundGate=new Promise(resolve=>{releaseEntrance=resolve;});holdEntrance=true;
 const restoredTimetable=page.waitForRequest(req=>new URL(req.url()).pathname==='/api/academy/entrance');
 await page.reload();await restoredTimetable;await page.locator('#academy-startup').waitFor();
 assert.equal(await page.locator('#overview').isVisible(),false);
 assert.equal(calls.slice(reloadStart).filter(call=>call.path==='/api/account/session').length,1,'Cold page restoration shares one account check');
 assert.equal(calls.slice(reloadStart).filter(call=>call.path==='/api/academy/entrance').length,1,'Restoration does not discard an early timetable request');
 holdEntrance=false;releaseEntrance();await dashboard().locator('#ad-title').waitFor();
 // A failed cold load exposes a working retry instead of an endless animation.
 await page.evaluate(()=>sessionStorage.clear());failEntranceOnce=true;await page.reload();
 await page.locator('#academy-startup-title').filter({hasText:'Your dashboard couldn’t open'}).waitFor();
 assert.equal(await page.locator('#entrance-retry').isVisible(),true);assert.equal(await page.locator('#overview').isVisible(),false);
 await page.locator('#entrance-retry').click();await dashboard().locator('#ad-title').waitFor();
 assert.equal(await page.locator('#academy-startup').isVisible(),false);
 checks.push('Slow sign-in and cold restoration show a responsive loading screen at desktop and phone sizes; reduced motion, one session/timetable load, outage recovery and retry pass');
 await page.locator('#ad-timetable-host #academy-sessions .upcoming-day').first().waitFor();
 assert.equal(await page.locator('#ad-timetable-host #academy-sessions .upcoming-day').count(),7);
 const expected=snapshots.get('LEARN').personalActivities.filter(row=>row.roles?.length&&row.curriculumActive!==false&&['PROGRAM','COURSE'].includes(row.kind));
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),expected.length);
 assert.equal(await page.locator('#ad-navigation').getByRole('link',{name:'Visit website',exact:false}).count(),1);
 assert.equal(await page.locator('#ad-navigation').getByRole('link',{name:'Surahs and Duas Tracker',exact:true}).count(),1);
 await page.locator('#ad-assessments .ad-assessment-row').first().waitFor();
 assert.deepEqual(await page.locator('#ad-assessments strong').allTextContents(),['Past Imtihaan','Current Imtihaan','Assignment','Upcoming Imtihaan']);
 assert.deepEqual(await page.locator('#ad-assessments .ad-assessment-status').allTextContents(),['Current','Current','Upcoming','Upcoming']);
 const cachedAssessmentKeys=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.includes('dashboard')&&key.includes('assessments')).flatMap(key=>(JSON.parse(sessionStorage.getItem(key)).data.assessments||[]).flatMap(row=>Object.keys(row))));
 assert.ok(cachedAssessmentKeys.length);assert.ok(cachedAssessmentKeys.every(key=>['activityKey','title','registerId','phaseId','phaseName','registerStatus','examDate','assessmentKind','availableFrom','dueAt','timezone','published'].includes(key)),'Only timetable summary metadata enters the dashboard cache');
 const fyaBounds=await page.locator('.ad-attention').boundingBox(),assessmentBounds=await page.locator('.ad-assessments').boundingBox();
 assert.ok(assessmentBounds.y>=fyaBounds.y+fyaBounds.height,'Assessments is below FYA');
 await page.locator('#ad-assessments .ad-assessment-row').filter({hasText:'Current Imtihaan'}).first().click();
 await page.locator('#as-host .as-schedule-table tbody tr').first().waitFor();
 assert.equal(await page.locator('#as-host .as-schedule-table tbody tr').count(),2,'The link opens this Imtihaan timetable, including both dates');
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 const weekBox=await page.locator('.ad-week').boundingBox(),calendarBox=await page.locator('.ad-calendar').boundingBox();assert.ok(calendarBox.y>weekBox.y);
 await page.locator('.ad-calendar').scrollIntoViewIfNeeded();
 await page.frameLocator('#ad-calendar-host iframe').locator('#cal-grid button').first().waitFor();
 assert.ok(await page.frameLocator('#ad-calendar-host iframe').locator('#cal-grid button').count()>=28);
 const learnCalendar=page.frameLocator('#ad-calendar-host iframe');
 assert.equal(await learnCalendar.locator('#cal-term-list').isVisible(),false);
 await learnCalendar.getByRole('button',{name:'Terms',exact:true}).click();
 await learnCalendar.locator('#cal-terms-dialog[open]').waitFor();
 await learnCalendar.getByRole('button',{name:'Close term dates',exact:true}).click();
 assert.equal(await page.locator('#ad-calendar-actions').isVisible(),false);
 await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 const before=await page.locator('#ad-fya-count').innerText();
 await page.locator('#ad-attention [data-ad-note]').first().click();await page.locator('.cn-dialog .cn-text').filter({hasText:'Dashboard preparation'}).waitFor();
 await page.locator('.cn-dialog').getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await page.locator('#ad-fya-count').innerText(),before);
 checks.push('Real sign-in lands on Learn; every active authorised Program/Course has a linked tile; the original seven-day timetable and calendar are on the dashboard; reading a Class Note keeps its FYA action.');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow at '+width);
  const attention=await page.locator('.ad-attention').boundingBox(),assessments=await page.locator('.ad-assessments').boundingBox();assert.ok(assessments.y>=attention.y+attention.height,'Assessments follows FYA at '+width);
  if(width===1440||width===390)await capture('learn-'+width+'.png');
 }
 const first=expected.find(row=>row.kind==='PROGRAM');
 await page.goto(base+'/academy/#activity/PROGRAM/'+encodeURIComponent(first.id)+'/learn/assessment');await page.locator('#activity.active').waitFor();
 assert.equal(await page.locator('#activity .academy-calendar-section,#activity .academy-messages,#activity .academy-progress-section').count(),0);
 assert.equal(await page.locator('#activity-areas').isVisible(),false);
 await page.goto(base+'/academy/#activity/PROGRAM/'+encodeURIComponent(first.id)+'/learn/lesson-media');await page.locator('#activity.active').waitFor();
 assert.equal(await page.locator('#activity .academy-calendar-section,#activity .academy-messages').count(),0);
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 checks.push('Assessment and Lesson media keep their tools, with no duplicate chooser, Messages or calendar. Home returns to the dashboard.');

 await page.setViewportSize({width:1440,height:1000});await identity(await fixture.login('0003'),'/academy/#overview');
 assert.equal(new URL(page.url()).hash,'#timetable/teach','Normal entry gives teaching priority over learner access');
 await page.locator('#ad-plans a').first().waitFor();
 await page.locator('#ad-assessments .ad-assessment-row').first().waitFor();
 assert.deepEqual(await page.locator('#ad-assessments strong').allTextContents(),['Past Imtihaan','Current Imtihaan','Assignment','Upcoming Imtihaan']);
 await page.locator('#ad-assessments .ad-assessment-row').filter({hasText:'Current Imtihaan'}).first().click();
 await page.locator('#as-host .as-schedule-table tbody tr').first().waitFor();
 assert.equal(await page.locator('#as-host .as-schedule-table tbody tr').count(),2);
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 assert.doesNotMatch(await page.locator('#ad-attention').innerText(),/Submit your lesson plan|Lesson plan needs follow-up/);
 assert.equal(await page.locator('#ad-plans-title').innerText(),'Lesson plans due');
 await page.locator('#ad-attendance a').first().waitFor();
 const registerHref=await page.locator('#ad-attendance a').first().getAttribute('href');
 await page.locator('#ad-attendance a').first().click();await page.locator('#pa-workspace').waitFor();
 const registerParts=registerHref.split('/');
 assert.equal(await page.locator('#pa-date').inputValue(),registerParts.at(-2));
 assert.ok((await page.locator('#pa-classes [data-lesson]').evaluateAll(nodes=>nodes.map(node=>node.value))).includes(decodeURIComponent(registerParts.at(-1))));
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 await page.locator('.ad-calendar').scrollIntoViewIfNeeded();
 const calendarBounds=await page.locator('.ad-calendar').boundingBox(),attendanceBounds=await page.locator('#ad-attendance-panel').boundingBox();
 assert.ok(attendanceBounds.x>=calendarBounds.x+calendarBounds.width,'Attendance is beside the calendar on desktop');
 assert(attendanceBounds.height>=340,'Teacher review content retains its natural reading height');
 assert((await page.locator('#ad-plans-panel').boundingBox()).height>44,'Teacher plans retain a visible reading panel');assert.equal(await page.locator('#ad-plans').evaluate(el=>getComputedStyle(el).overflow),'visible','Teacher plans expand naturally instead of clipping their content');
 await page.screenshot({path:output+'/teacher-calendar-actions.png',fullPage:false});
 await dashboard().getByRole('button',{name:'Mark attendance',exact:true}).first().click();
 await page.locator('.ad-dialog').getByRole('heading',{name:'Mark attendance',exact:true}).waitFor();
 await page.locator('.ad-dialog .ad-tool-choice').first().click();await page.locator('#pa-main').waitFor();
 assert.ok(new URL(page.url()).hash.endsWith('/teach/attendance'));
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 await dashboard().getByRole('button',{name:'Submit plans',exact:true}).first().click();
 await page.locator('.ad-dialog .ad-tool-choice').first().click();await page.locator('#activity-planning.lp-root').waitFor();
 assert.ok(new URL(page.url()).hash.endsWith('/teach/planning'));
 assert.equal(await page.locator('#activity .academy-messages,#activity .academy-calendar-section,#activity .academy-progress-section').count(),0);
 await page.locator('[data-page-home]').click();await dashboard().waitFor();await capture('teach-desktop.png');
 checks.push('Teacher Mark attendance and Submit plans open the real scoped tools; the old Reminders, calendar and tracker panels are absent from teaching spaces.');

 await identity(await fixture.actor('dual'),'/academy/#overview');
 assert.equal(new URL(page.url()).pathname,'/academy/admin/');
 assert.equal(new URL(page.url()).hash,'#administration','An account with Admin, Teacher and Student roles lands on Admin');
 await page.locator('#ad-tools a').first().waitFor();
 const admin=snapshots.get('ADMIN');
 assert.ok(admin.personalActivities.filter(row=>row.roles?.includes('PROGRAM_ADMIN')).every(row=>[fixture.scopes.programA,fixture.scopes.courseA].includes(row.kind+':'+row.id)));
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),admin.personalActivities.filter(row=>row.roles?.includes('PROGRAM_ADMIN')&&row.curriculumActive!==false).length);
 assert.equal(await page.locator('#ad-next .ad-next-row[href*=PROGRAM]').count(),0);
 assert.equal(await page.locator('#ad-areas .ad-tile[href*=subject-1]').count(),0);
 assert.equal(await page.locator('#administration .academy-messages,#administration .academy-calendar-section,#administration .academy-progress-section').count(),0);
 assert.equal(await page.locator('#ad-navigation a[href="#progress-admin"]').count(),1);
 await capture('admin-desktop.png');
 assert.equal(await page.locator('#ad-attendance-title').innerText(),'Review attendance');
 assert.equal(await page.locator('#ad-plans-title').innerText(),'Review Lesson Plans');
 await page.waitForFunction(()=>document.getElementById('ad-attendance-count')?.textContent==='1'&&document.getElementById('ad-plans-count')?.textContent==='2');
 assert.equal(await page.locator('#ad-plans .ad-due').count(),0);assert.doesNotMatch(await page.locator('#ad-plans .ad-task-list').innerText(),/Submitted late|Submitted on time|Overdue|Plan due/);
 assert.match(await page.locator('#ad-attendance').innerText(),/1 absent/);assert.doesNotMatch(await page.locator('#ad-plans').innerText(),/Overdue|Not submitted|Private draft text/);
 const summary=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('dashboard')&&k.includes('attendance')).flatMap(k=>JSON.parse(sessionStorage.getItem(k)).data.lessons||[]));
 assert(summary.some(row=>row.absentCount===1));assert(summary.every(row=>!row.marks&&!row.learners&&!row.roster));
 await submitAttendance([absenceLesson],false);await page.evaluate(()=>M4L_ACADEMY_DASHBOARD.refresh(true));
 await page.waitForFunction(()=>document.getElementById('ad-attendance-count')?.textContent==='0');assert.match(await page.locator('#ad-attendance').innerText(),/No submitted registers with absentees/);
 checks.push('Admin reviews only absent submitted registers and submitted plans; current corrections remove resolved absence flags; cached summaries contain no learners or marks');
 assert.equal(await page.locator('#ad-assessment-title').innerText(),'Imtehaan');
 await page.locator('#ad-assessments .ad-assessment-row').first().waitFor();
 assert.deepEqual(await page.locator('#ad-assessments strong').allTextContents(),['Past Imtihaan','Current Imtihaan','Assignment','Upcoming Imtihaan']);
 await page.locator('#ad-assessments .ad-assessment-row').filter({hasText:'Current Imtihaan'}).first().click();
 await page.locator('#as-host .as-schedule-table tbody tr').first().waitFor();
 assert.equal(await page.locator('#as-host .as-schedule-table tbody tr').count(),2);
 assert.equal(await page.locator('#as-host .as-timetable h3').innerText(),'Current Imtihaan - All classes');
 assert.equal(await page.evaluate(()=>M4L_ACADEMY_WORKSPACE.current()),'ADMIN_TEACH');
 assert(new URL(page.url()).hash.endsWith('/teach/assessment/current'));
 assert(calls.some(call=>call.path==='/api/academy/assessments/list'&&call.workspace==='ADMIN_TEACH'));
 checks.push('Admin Imtehaan opens the correct Program and register in Admin-Teach');
 await identity(await fixture.actor('dual'),'/academy/admin/#administration');
 await page.locator('.ad-calendar').scrollIntoViewIfNeeded();
 const adminCalendar=page.frameLocator('#ad-calendar-host iframe');
 await adminCalendar.getByRole('button',{name:'Edit teacher availability',exact:true}).click();
 await adminCalendar.locator('#cal-teacher-dialog[open]').waitFor();
 const teacherOption=await adminCalendar.locator('#cal-teacher-choice option').evaluateAll(nodes=>nodes.find(node=>node.value)?.value);
 assert.ok(teacherOption);await adminCalendar.locator('#cal-teacher-choice').selectOption(teacherOption);
 await adminCalendar.locator('#cal-teacher-choose').click();await adminCalendar.locator('#cal-availability-dialog[open]').waitFor();
 await adminCalendar.getByRole('button',{name:'Close availability editor',exact:true}).click();
 assert.equal(await adminCalendar.getByRole('button',{name:'Teaching hours',exact:true}).count(),0,'Dashboard calendars do not request teacher workload');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(Math.round((await page.locator('#ad-attendance-panel').boundingBox()).height),340);
  assert.equal(Math.round((await page.locator('#ad-plans-panel').boundingBox()).height),340);
 }
 await page.setViewportSize({width:1440,height:1000});
 checks.push('Lesson-plan deadlines have their own fixed-height scrolling panel beside the calendar; Teacher attendance opens the exact date and lesson, Admin has review panels, and calendar Terms and scoped teacher availability open in dialogs without dashboard workload calculations.');
 await identity(await fixture.actor('none'));assert.equal(await page.locator('#ad-areas .ad-tile[href*=PROGRAM]').count(),0);assert.equal(await page.getByText('Dashboard preparation · read paragraphs 1–3.',{exact:true}).count(),0);
 checks.push('Scoped Admin gets only authorised areas and tracker management; accounts without private enrolments see no private Program or another user’s Class Notes.');

 await identity(await fixture.login('0002'));await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 await page.waitForTimeout(500);
 await page.evaluate(()=>{for(const key of Object.keys(sessionStorage)){if(!key.includes('dashboard')||!key.includes('assessments'))continue;const entry=JSON.parse(sessionStorage.getItem(key));for(const row of entry.data.assessments||[])if(row.registerId==='upcoming')row.phaseName='Saved upcoming Imtihaan';sessionStorage.setItem(key,JSON.stringify(entry));}});
 holdEntrance=true;backgroundGate=new Promise(resolve=>{releaseEntrance=resolve;});await page.reload();await dashboard().locator('#ad-title').waitFor();
 assert.equal(await page.locator('#ad-timetable-host .upcoming-day').count(),7);
 await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 assert.equal(await page.locator('#ad-attention [data-ad-note]').count(),1,'The saved Class Note is available before the background response');
 assert.deepEqual(await page.locator('#ad-assessments strong').allTextContents(),['Past Imtihaan','Current Imtihaan','Assignment','Saved upcoming Imtihaan'],'Saved Imtihaan appear before the background response');
 await service.run('post',fixture.post(view,{body:'New preparation posted while the saved dashboard is visible.'}));
 holdEntrance=false;releaseEntrance();releaseEntrance=null;
 await page.waitForFunction(()=>document.querySelectorAll('#ad-attention [data-ad-note]').length===2);
 await page.locator('#ad-assessments strong').filter({hasText:'Upcoming Imtihaan'}).waitFor();
 assert.equal(await page.locator('#ad-timetable-host .upcoming-day').count(),7);
 checks.push('A freshly cached dashboard and saved Class Note appear before delayed responses; a newly posted Class Note then appears in the background without losing the seven-day timetable.');

 await page.locator('#ad-navigation .ad-visit').click();await page.locator('#overview.active').waitFor();assert.equal(new URL(page.url()).hash,'#website');
 await page.locator('[data-page-home]').click();await dashboard().waitFor();
 // Focused presentation cases exercise several learning areas, duplicates and
 // ended/cancelled sessions without adding records to the connected service.
 await page.waitForTimeout(300);
 await page.evaluate(()=>{
  const t=Date.now(),base={status:'SCHEDULED',timezone:'Africa/Johannesburg',startsAt:t+600000,endsAt:t+4200000,startTime:'11:00',endTime:'12:00'};
  const program={id:'next-program',kind:'PROGRAM',name:'Next Program',roles:['STUDENT']},course={id:'next-course',kind:'COURSE',name:'Next Course',roles:['STUDENT']};
  const session=(area,extra)=>({...base,kind:area.kind,activityId:area.id,activityName:area.name,...extra});
  const inactive={id:'inactive-course',kind:'COURSE',name:'Completed Course',roles:['STUDENT'],curriculumActive:false},archived={id:'archived-program',kind:'PROGRAM',name:'Archived Program',roles:['STUDENT'],lifecycle:'ARCHIVED'};
  window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,personalActivities:[program,course,inactive,archived],personalTimetable:[
   session(program,{subjectName:'Fiqh',moduleName:'Purification'}),
   session(program,{subjectName:'Later duplicate',startsAt:t+7200000,endsAt:t+10800000}),
   session(course,{subjectName:'Arabic',moduleName:'Arabic',startsAt:t+300000,endsAt:t+3900000,startTime:'10:55'}),
   session(course,{subjectName:'Ended lesson',startsAt:t-7200000,endsAt:t-3600000}),
   session(program,{subjectName:'Cancelled lesson',status:'CANCELLED',startsAt:t+1000}),
   session({kind:'PROGRAM',id:'unassigned',name:'Unassigned'},{subjectName:'Private lesson'}),
   session(inactive,{subjectName:'Completed Course lesson'}),session(archived,{subjectName:'Archived Program lesson'})
  ],profile:{name:'Synthetic learner'},timezone:'Africa/Johannesburg'},
  {mode:'learn',activityHref:(row,tool,mode)=>'/academy/#activity/'+row.kind+'/'+row.id+'/'+mode+'/'+tool});
 });
 const next=page.locator('#ad-next .ad-next-row');
 assert.equal(await next.count(),3);
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),2,'Inactive areas stay off every dashboard list');
 assert.deepEqual(await next.locator('.ad-next-subject>strong').allTextContents(),['Arabic','Fiqh · Purification','Later duplicate']);
 assert.deepEqual(await next.locator('.ad-next-subject>span').allTextContents(),['Next Course','Next Program','Next Program']);
 assert.equal(await next.first().getAttribute('href'),'/academy/#activity/COURSE/next-course/learn/timetable');
 assert.match(await next.first().innerText(),/10:55–12:00/);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Next-session rows fit at '+width);
  assert.equal(await page.locator('.ad-menu-toggle').count(),0);
  assert.equal(await page.locator('[data-ad-contents-toggle]').isVisible(),width<1120);
  if(width!==320)await capture('next-sessions-'+width+'.png');
 }
 await identity(await fixture.actor('global'),'/academy/admin/#administration');
 await page.locator('#ad-assessments .ad-assessment-row').first().waitFor();
 assert.equal(await page.locator('#ad-scope').isVisible(),false);assert.equal(await page.locator('#ad-scope').count(),0);
 assert.deepEqual(await page.locator('#ad-navigation > :not([data-workspace-exit])').allTextContents(),['Users','Announcements','Attendance','Curriculum','Library','Lesson plans','Assessments','App settings','Update timetable']);
 const visit=page.locator('#ad-navigation').getByRole('link',{name:'Visit website',exact:false,includeHidden:true});assert.equal(await visit.count(),1);assert.equal(await visit.getAttribute('href'),'/academy/#website');assert.equal(await visit.getAttribute('data-workspace-exit'),'');
 if(!await visit.isVisible())await page.locator('[data-ad-contents-toggle]').click();await visit.click();await page.waitForURL(url=>url.pathname==='/academy/'&&url.hash==='#website');await page.locator('#overview.active').waitFor();
 await identity(await fixture.actor('global'),'/academy/admin/#administration');await page.locator('#ad-assessments .ad-assessment-row').first().waitFor();
 checks.push('Global Admin Visit website opens the public website and preserves the nine management menu entries');
 await page.locator('#ad-plans .ad-task-list li').first().waitFor();assert.equal(await page.locator('#ad-plans .ad-due').count(),0,'Review plans omits every status badge');assert.doesNotMatch(await page.locator('#ad-plans .ad-task-list').innerText(),/Submitted late|Submitted on time|Overdue|Plan due/);assert.equal(await page.locator('#ad-primary-actions button').count(),0);checks.push('Submitted plans remain reviewable without status labels or duplicate header review buttons');
 fixture.db.prepare('INSERT INTO assessment_register_areas VALUES(?,?)').run('current',fixture.scopes.programB);
 const otherClass=fixture.db.prepare('SELECT class_id FROM classes WHERE activity_key=? AND active=1 LIMIT 1').get(fixture.scopes.programB).class_id;
 for(const original of fixture.db.prepare("SELECT * FROM assessments WHERE register_id='current'").all()){
  const shared={...original,assessment_id:'shared-b-'+original.assessment_id,activity_key:fixture.scopes.programB,class_id:otherClass};
  fixture.db.prepare('INSERT INTO assessments('+Object.keys(shared).join(',')+') VALUES('+Object.keys(shared).map(()=>'?').join(',')+')').run(...Object.values(shared));
 }
 await page.evaluate(()=>M4L_ACADEMY_DASHBOARD.refresh(true));
 const sharedLinks=await page.locator('#ad-assessments .ad-assessment-row').filter({hasText:'Current Imtihaan'}).evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
 assert.equal(sharedLinks.length,2);assert(sharedLinks.includes('#activity/PROGRAM/'+fixture.scopes.programA.slice(8)+'/teach/assessment/current'));assert(sharedLinks.includes('#activity/PROGRAM/'+fixture.scopes.programB.slice(8)+'/teach/assessment/current'));
 checks.push('Global Admin banner removed without changing authority; a shared Imtehaan retains a separate correct Program link');
 await page.evaluate(()=>{
  const t=Date.now(),program={kind:'PROGRAM',id:'admin-program',name:'Admin Program',roles:['PROGRAM_ADMIN']},course={kind:'COURSE',id:'admin-course',name:'Admin Course',roles:['PROGRAM_ADMIN']};
  window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:true,personalActivities:[program,course],personalTimetable:[program,course].map(area=>({kind:area.kind,activityId:area.id,activityName:area.name,status:'SCHEDULED',startsAt:t+60000,endsAt:t+3600000,startTime:'11:00',endTime:'12:00',subjectName:'Admin upcoming lesson'})),profile:{name:'Synthetic admin'}},{mode:'admin',activityHref:(row,tool,mode)=>'/academy/admin/#activity/'+row.kind+'/'+row.id+'/'+mode+'/'+tool});
 });
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),2,'Admin keeps active Program and Course management tiles');
 assert.deepEqual(await page.locator('#ad-next .ad-next-subject>span').allTextContents(),['Admin Course'],'Only Admin Coming up next is Courses only');
 const priority=await page.evaluate(()=>{
  const landing=window.M4L_ACADEMY_DASHBOARD.landing;
  sessionStorage.setItem('m4l_dashboard_workspace:role-priority','learn');
  return [landing({profile:{uniqueid:'role-priority'},student:true,workspaceAccess:{admin:true,teach:true}}),landing({student:true,workspaceAccess:{teach:true}}),landing({student:true}),landing({globalAdmin:true})];
 });
 assert.deepEqual(priority,['/academy/admin/#administration','/academy/#timetable/teach','/academy/#timetable/learn','/academy/admin/#administration']);
 checks.push('Coming up next has one linked row per authorised Program/Course, ordered by start time, with subject/module, area and time; duplicates, ended and cancelled lessons are excluded, and rows fit desktop and phone screens.');
 checks.push('Normal landing uses Admin, then Teach, then Learn, regardless of a previously remembered lower workspace. Admin Coming up next shows Courses only, while active Program and Course management tiles remain available.');
 checks.push('Imtehaan sits below FYA and groups all published dated exams and assignment windows into linked timetables, including past unfinished registers. Draft, cancelled, completed, archived and unauthorised records stay out; saved summaries update in the background.');
 assert.equal(calls.some(call=>/class-notes\/(post|revise|withdraw)|enrolment\/(register|request-save)|planning\/(save|submit)/.test(call.path)),false,'Dashboard reads must not write records');
 assert.deepEqual(errors,[]);
 await writeFile(output+'/verification.json',JSON.stringify({success:true,checks,errors,calls},null,2));
 console.log(JSON.stringify({success:true,checks,output},null,2));
}catch(error){await capture('failure.png');await writeFile(output+'/failure.json',JSON.stringify({message:error.message,errors,calls},null,2));throw error;}
finally{holdEntrance=false;releaseEntrance?.();await browser.close();await new Promise(resolve=>server.close(resolve));fixture.close();}
