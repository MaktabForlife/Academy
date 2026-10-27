// Real dashboard, current permission checks and joins against disposable local D1.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {classNotesFixture} from '../tests/fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {readFileSync} from 'node:fs';
import {recoverWeeklyAbsentees} from '../src/academy/d1/weekly-absentees.js';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.WEEKLY_ABSENTEES_OUTPUT||'/private/tmp/academy-weekly-dashboard';await mkdir(out,{recursive:true});
const timezone='Africa/Johannesburg',clock=at=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at),today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const start=clock(new Date(Date.now()-60000)),end=clock(new Date(Date.now()+1800000));
const rooms=Array.from({length:5},(_,i)=>'https://zoom.us/j/1234500000'+(i+1));
const f=await classNotesFixture(f=>{
 let room=0;
 for(const [scope,name]of [[f.scopes.programA,'Program One'],[f.scopes.programB,'Program Two']]){
  f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run(name,scope);
  f.db.prepare('DELETE FROM academy_settings WHERE setting_key=?').run('ProgramZoom:'+scope.toUpperCase());
  const current=f.db.prepare("SELECT * FROM timetable_publications WHERE activity_key=? AND pattern='WEEKLY' ORDER BY version_no DESC LIMIT 1").get(scope),snapshot=JSON.parse(current.snapshot_json),base=snapshot.rules[0];
  const first=f.db.prepare('SELECT class_id FROM classes WHERE activity_key=? AND active=1 LIMIT 1').get(scope).class_id;
  const classes=scope===f.scopes.programA?[[first,'Class A'],['dashboard-extra','Class B']]:[[first,'Class C']];
  if(scope===f.scopes.programA)f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'dashboard-extra','Class B',1)").run(scope);
  snapshot.programZoomLink='';snapshot.rules=classes.map(([id,label],index)=>({...base,id:'dashboard-rule-'+index,classIds:[id],classNames:[label],weekdays:[0,1,2,3,4,5,6],startTime:start,endTime:end,moduleName:'Dashboard lesson '+label,zoomLink:rooms[room++]}));
  const published={...current,publication_id:crypto.randomUUID(),version_no:current.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(published);
  f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(published));
  f.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(published.publication_id,scope);
 }
 const course=f.db.prepare("SELECT * FROM timetable_publications WHERE pattern='COURSE' LIMIT 1").get(),snapshot=JSON.parse(course.snapshot_json),publication=crypto.randomUUID(),runId=course.scope_key;
 snapshot.publication={...snapshot.publication,PublicationID:publication,VersionNo:course.version_no+1,SessionCount:2,PublishStartDate:today,PublishEndDate:today};
 snapshot.sessions=[0,1].map(i=>({...snapshot.sessions[0],PublicationID:publication,PublishedSessionID:'dashboard-course-'+i,SourceSessionID:'dashboard-course-source-'+i,SessionDate:today,StartTime:start,EndTime:end,ModuleName:'Course lesson '+(i+1),ZoomLink:rooms[i+3]}));
 const published={...course,publication_id:publication,version_no:course.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(published);
 f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(published));
 f.db.prepare('UPDATE course_run_state SET stage=\'PUBLISHED\',current_publication_id=? WHERE activity_key=? AND run_id=?').run(publication,course.activity_key,runId);
 f.db.prepare('UPDATE course_runs SET start_date=?,end_date=? WHERE activity_key=? AND run_id=?').run(today,today,course.activity_key,runId);
});
for(const migration of ['0038_messaging.sql','0040_weekly_absentees.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));
f.env.ACADEMY_MESSAGING='1';f.env.ACADEMY_WEEKLY_ABSENTEES='1';
await recoverWeeklyAbsentees(f.env,new Date('2026-11-02T05:00:00Z'));
let trimFutureLesson=false;
const calls=[],errors=[],types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,IS_DEVELOPMENT:true}');return;}
 if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({gregorian:today,hijri:'15 Jumada al-ula 1448'}));return;}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),headers=new Headers(req.headers);
  if(trimFutureLesson&&url.pathname==='/api/academy/entrance')headers.delete('X-Academy-Read-Revision');
  const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}:{})}),f.env);
  calls.push({path:url.pathname,status:response.status,...(url.pathname.endsWith('/lesson/join')?{input:JSON.parse(body.toString())}:{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(trimFutureLesson&&url.pathname==='/api/academy/entrance'&&response.ok){const data=await response.json(),index=data.personalTimetable.findIndex(row=>row.date!==today);assert(index>=0);data.personalTimetable.splice(index,1);res.end(JSON.stringify(data));}
  else res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(404);res.end();return;}
 if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
async function identity(who,workspace){await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},await f.actor(who));await page.goto(origin+(workspace==='ADMIN'?'/academy/admin/#administration':workspace.startsWith('ADMIN_')?'/academy/admin/#timetable/'+workspace.slice(6).toLowerCase():'/academy/#timetable/'+workspace.toLowerCase()));await page.locator('#dashboard.active #ad-title').waitFor();await page.locator('#ad-status').waitFor();await page.waitForTimeout(450);}
const checks=[];
try{
 for(const [who,workspace]of [['global','ADMIN'],['adminA','ADMIN'],['teacherA','TEACH'],['studentA','LEARN'],['global','ADMIN_TEACH'],['global','ADMIN_LEARN']]){
  const begin=calls.length;await identity(who,workspace);await page.evaluate(()=>window.M4L_ACADEMY_DASHBOARD.refresh(true));
  assert.equal(await page.locator('#ad-attendance-panel').count(),0);
  assert.doesNotMatch(await page.locator('#dashboard.active').innerText(),/Mark attendance|Review attendance/);
  assert.equal(await page.locator('#dashboard.active a[href*="attendance"],#dashboard.active [data-ad-choose="attendance"]').count(),0);
  assert.equal(calls.slice(begin).filter(c=>/attendance/.test(c.path)).length,0,'Dashboard must not read attendance registers');
  for(const width of [390,1440]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+workspace+'-'+width+'.png'});}
  checks.push(workspace+' dashboard has no attendance UI or attendance requests');
 }
 await identity('global','ADMIN');
 await page.getByRole('button',{name:'View inbox',exact:false}).click();
 await page.locator('.am-dialog').getByRole('button',{name:/Weekly absentees/}).first().click();
 await page.getByText('No recorded absentees in your current areas for this week.',{exact:false}).waitFor();
 assert.match(await page.locator('.am-body').innerText(),/2026-10-26 to 2026-11-01/);
 await page.screenshot({path:out+'/weekly-inbox.png',fullPage:true});
 checks.push('Weekly report opens from the ordinary Messages inbox');
 // Deliberately open the ordinary register after proving dashboard calls are absent.
 await page.goto(origin+'/academy/admin/#administration/attendance/program/'+encodeURIComponent(f.scopes.programA.slice(8)));
 await page.locator('#pa-workspace').waitFor();await page.waitForTimeout(400);
 assert(calls.some(c=>c.path==='/api/academy/attendance/get'&&c.status===200));
 checks.push('Admin attendance tools remain available and load the real register on explicit opening');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/verification.json',JSON.stringify({passed:true,checks,calls},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure.json',JSON.stringify({error:error.message,errors,calls},null,2));throw error;}
finally{await browser.close();await new Promise(done=>server.close(done));f.close();}
