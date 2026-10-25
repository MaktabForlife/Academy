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
const fixture=await classNotesFixture(seedClassNotes),checks=[],errors=[],calls=[],snapshots=new Map();
const service=await fixture.notes(),source=(await service.run('sessions',{activityKey:fixture.scopes.programA,date:fixture.today})).sources[0];
const view=await service.run('get',{activityKey:fixture.scopes.programA,source});
await service.run('post',fixture.post(view,{body:'Dashboard preparation · read paragraphs 1–3.'}));
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
let holdEntrance=false,releaseEntrance,backgroundGate;
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;
 calls.push({path:url.pathname,workspace:headers['x-academy-workspace'],method:req.method()});
 if(holdEntrance&&['/api/academy/entrance','/api/academy/class-notes/timetable'].includes(url.pathname))await backgroundGate;
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
 await page.locator('#academy-login').click();await page.locator('#demo-username').fill('login-0002');await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview button[type=submit]').click();
 await dashboard().locator('#ad-title').waitFor();assert.equal(new URL(page.url()).hash,'#timetable/learn');
 await page.locator('#ad-timetable-host #academy-sessions .upcoming-day').first().waitFor();
 assert.equal(await page.locator('#ad-timetable-host #academy-sessions .upcoming-day').count(),7);
 const expected=snapshots.get('LEARN').personalActivities.filter(row=>row.roles?.length&&['PROGRAM','COURSE'].includes(row.kind));
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),expected.length);
 assert.equal(await page.locator('#ad-navigation').getByRole('link',{name:'Visit website',exact:false}).count(),1);
 assert.equal(await page.locator('#ad-navigation').getByRole('link',{name:'Surahs and Duas Tracker',exact:true}).count(),1);
 const weekBox=await page.locator('.ad-week').boundingBox(),calendarBox=await page.locator('.ad-calendar').boundingBox();assert.ok(calendarBox.y>weekBox.y);
 await page.locator('.ad-calendar').scrollIntoViewIfNeeded();
 await page.frameLocator('#ad-calendar-host iframe').locator('#cal-grid button').first().waitFor();
 assert.ok(await page.frameLocator('#ad-calendar-host iframe').locator('#cal-grid button').count()>=28);
 await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 const before=await page.locator('#ad-fya-count').innerText();
 await page.locator('#ad-messages [data-ad-note]').first().click();await page.locator('.cn-dialog .cn-text').filter({hasText:'Dashboard preparation'}).waitFor();
 await page.locator('.cn-dialog').getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await page.locator('#ad-fya-count').innerText(),before);
 checks.push('Real sign-in lands on Learn; every authorised Program/Course has a linked tile; the original seven-day timetable and calendar are on the dashboard; reading a Class Note keeps its FYA action.');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow at '+width);
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
 assert.equal(await page.locator('#ad-areas .ad-tile').count(),2);
 assert.equal(await page.locator('#ad-areas .ad-tile[href*=subject-1]').count(),0);
 assert.equal(await page.locator('#administration .academy-messages,#administration .academy-calendar-section,#administration .academy-progress-section').count(),0);
 assert.equal(await page.locator('#ad-navigation a[href="#progress-admin"]').count(),1);
 await capture('admin-desktop.png');
 await identity(await fixture.actor('none'));assert.equal(await page.locator('#ad-areas .ad-tile[href*=PROGRAM]').count(),0);assert.equal(await page.getByText('Dashboard preparation · read paragraphs 1–3.',{exact:true}).count(),0);
 checks.push('Scoped Admin gets only authorised areas and tracker management; accounts without private enrolments see no private Program or another user’s Class Notes.');

 await identity(await fixture.login('0002'));await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 await page.waitForTimeout(500);
 holdEntrance=true;backgroundGate=new Promise(resolve=>{releaseEntrance=resolve;});await page.reload();await dashboard().locator('#ad-title').waitFor();
 assert.equal(await page.locator('#ad-timetable-host .upcoming-day').count(),7);
 await page.locator('#ad-attention [data-ad-note]').first().waitFor();
 assert.equal(await page.locator('#ad-attention [data-ad-note]').count(),1,'The saved Class Note is available before the background response');
 await service.run('post',fixture.post(view,{body:'New preparation posted while the saved dashboard is visible.'}));
 holdEntrance=false;releaseEntrance();releaseEntrance=null;
 await page.waitForFunction(()=>document.querySelectorAll('#ad-attention [data-ad-note]').length===2);
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
  window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,personalActivities:[program,course],personalTimetable:[
   session(program,{subjectName:'Fiqh',moduleName:'Purification'}),
   session(program,{subjectName:'Later duplicate',startsAt:t+7200000,endsAt:t+10800000}),
   session(course,{subjectName:'Arabic',moduleName:'Arabic',startsAt:t+300000,endsAt:t+3900000,startTime:'10:55'}),
   session(course,{subjectName:'Ended lesson',startsAt:t-7200000,endsAt:t-3600000}),
   session(program,{subjectName:'Cancelled lesson',status:'CANCELLED',startsAt:t+1000}),
   session({kind:'PROGRAM',id:'unassigned',name:'Unassigned'},{subjectName:'Private lesson'})
  ],profile:{name:'Synthetic learner'},timezone:'Africa/Johannesburg'},
  {mode:'learn',activityHref:(row,tool,mode)=>'/academy/#activity/'+row.kind+'/'+row.id+'/'+mode+'/'+tool});
 });
 const next=page.locator('#ad-next .ad-next-row');
 assert.equal(await next.count(),2);
 assert.deepEqual(await next.locator('.ad-next-subject>strong').allTextContents(),['Arabic','Fiqh · Purification']);
 assert.deepEqual(await next.locator('.ad-next-subject>span').allTextContents(),['Next Course','Next Program']);
 assert.equal(await next.first().getAttribute('href'),'/academy/#activity/COURSE/next-course/learn/timetable');
 assert.match(await next.first().innerText(),/10:55–12:00/);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Next-session rows fit at '+width);
  assert.equal(await page.locator('.ad-menu-toggle').isVisible(),width<800);
  if(width!==320)await capture('next-sessions-'+width+'.png');
 }
 const priority=await page.evaluate(()=>{
  const landing=window.M4L_ACADEMY_DASHBOARD.landing;
  sessionStorage.setItem('m4l_dashboard_workspace:role-priority','learn');
  return [landing({profile:{uniqueid:'role-priority'},student:true,workspaceAccess:{admin:true,teach:true}}),landing({student:true,workspaceAccess:{teach:true}}),landing({student:true}),landing({globalAdmin:true})];
 });
 assert.deepEqual(priority,['/academy/admin/#administration','/academy/#timetable/teach','/academy/#timetable/learn','/academy/admin/#administration']);
 checks.push('Coming up next has one linked row per authorised Program/Course, ordered by start time, with subject/module, area and time; duplicates, ended and cancelled lessons are excluded, and rows fit desktop and phone screens.');
 checks.push('Normal landing uses Admin, then Teach, then Learn, regardless of a previously remembered lower workspace.');
 assert.equal(calls.some(call=>/class-notes\/(post|revise|withdraw)|enrolment\/(register|request-save)|planning\/(save|submit)/.test(call.path)),false,'Dashboard reads must not write records');
 assert.deepEqual(errors,[]);
 await writeFile(output+'/verification.json',JSON.stringify({success:true,checks,errors,calls},null,2));
 console.log(JSON.stringify({success:true,checks,output},null,2));
}catch(error){await capture('failure.png');await writeFile(output+'/failure.json',JSON.stringify({message:error.message,errors,calls},null,2));throw error;}
finally{holdEntrance=false;releaseEntrance?.();await browser.close();await new Promise(resolve=>server.close(resolve));fixture.close();}
