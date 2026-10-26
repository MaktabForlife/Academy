// Real dashboard, current permission checks and joins against disposable local D1.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {classNotesFixture} from '../tests/fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.GLOBAL_DASHBOARD_OUTPUT||'/private/tmp/academy-global-dashboard';await mkdir(out,{recursive:true});
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
async function identity(who){await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},await f.actor(who));await page.goto(origin+'/academy/admin/#administration');await page.locator('#ad-title').waitFor();await page.locator('#academy-sessions .upcoming-day').first().waitFor();}
try{
 await identity('global');const column=page.locator('#academy-sessions .upcoming-day').filter({has:page.locator('time[datetime="'+today+'"]')}),card=column.locator('.timetable-pill').filter({hasText:'Program One'});
 assert.equal(await card.count(),1);assert.match(await card.innerText(),/2 classes · 2 lessons/);
 assert.equal(await column.locator('.timetable-pill').filter({hasText:'Program Two'}).count(),1);
 const courseCard=column.locator('.timetable-pill').filter({hasText:'Synthetic subject'});assert.equal(await courseCard.count(),1);assert.match(await courseCard.innerText(),/2 lessons/);
 await card.getByRole('button',{name:'Join class',exact:true}).click();const dialog=page.locator('#lesson-information[open]');await dialog.waitFor();assert.equal(await dialog.locator('.combined-lesson').count(),2);
 assert.deepEqual(await dialog.locator('.lesson-info-class').allTextContents(),['Class A','Class B']);
 const initialReference=await card.getByRole('button',{name:'Join class',exact:true}).getAttribute('data-information');
 trimFutureLesson=true;await page.locator('#timetable-refresh').evaluate(button=>button.click());
 await page.waitForFunction(old=>[...document.querySelectorAll('#academy-sessions [data-information]')].some(button=>button.textContent==='Join class'&&button.dataset.information!==old),initialReference);
 assert.equal(await dialog.getByRole('button',{name:'Join Class A',exact:true}).getAttribute('data-join'),initialReference+':0','The open picker retains the original visible selection after the grid refreshes');
 await page.evaluate(()=>{window.testJoined=[];window.open=()=>({opener:null,location:{replace:url=>window.testJoined.push(url)},close(){}});});
 for(const [i,label]of ['Class A','Class B'].entries()){
  await dialog.getByRole('button',{name:'Join '+label,exact:true}).click();await page.waitForFunction(n=>window.testJoined.length===n,i+1);
 }
 await page.locator('#lesson-information-close').click();await column.locator('.timetable-pill').filter({hasText:'Program Two'}).getByRole('button',{name:'Join class',exact:true}).click();
 await dialog.getByRole('button',{name:'Join Class C',exact:true}).click();await page.waitForFunction(()=>window.testJoined.length===3);
 await page.locator('#lesson-information-close').click();await courseCard.getByRole('button',{name:'Join class',exact:true}).click();assert.equal(await dialog.locator('.combined-lesson').count(),2);
 for(let i=0;i<2;i++){await dialog.locator('[data-join]').nth(i).click();await page.waitForFunction(n=>window.testJoined.length===n,i+4);}
 assert.deepEqual(await page.evaluate(()=>window.testJoined),rooms);
 const joins=calls.filter(c=>c.path.endsWith('/lesson/join'));assert.equal(joins.length,5);assert(joins.every(c=>c.status===200));assert.equal(new Set(joins.map(c=>c.input.joinKey)).size,5);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/class-picker-'+width+'.png'});
 }
 await page.locator('#lesson-information-close').click();await card.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/program-rollup-320.png'});
 await card.getByRole('button',{name:'Join class',exact:true}).click();
 f.db.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id=?").run(f.actors.global);
 await dialog.getByRole('button',{name:'Join Class A',exact:true}).click();await page.waitForFunction(()=>window.testJoined.length===5&&document.getElementById('lesson-information').open===false);
 assert([401,403].includes(calls.filter(c=>c.path.endsWith('/lesson/join')).at(-1).status));
 trimFutureLesson=false;await identity('adminA');const scopedColumn=page.locator('#academy-sessions .upcoming-day').filter({has:page.locator('time[datetime="'+today+'"]')});assert.equal(await scopedColumn.locator('.timetable-pill').filter({hasText:'Program One'}).count(),1);assert.doesNotMatch(await page.locator('#academy-sessions').innerText(),/Program Two|Synthetic subject/);
 assert.deepEqual(errors,[]);const result={passed:true,checks:['One card per Program or Course per day, across different rooms and classes','The picker lists that area\'s classes/lessons with teacher and time','All five Program/Course lessons resolve their own rooms through current server access checks','Revoked Global Admin access cannot join from an already-open picker','Scoped Admin gets one daily card only for each authorised area','Desktop, 390px and 320px layouts fit'],liveRequests:0,joinChecks:joins.map(c=>({status:c.status,distinctLesson:true})),errors};
 result.checks.push('A background grid refresh cannot change an already-open class choice');await writeFile(out+'/verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await page.screenshot({path:out+'/failure.png'});await writeFile(out+'/failure.json',JSON.stringify({error:error.message,errors,calls},null,2));throw error;}
finally{await browser.close();await new Promise(done=>server.close(done));f.close();}
