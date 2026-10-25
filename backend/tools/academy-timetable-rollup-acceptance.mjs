// Real Program/Course pages and Worker against isolated synthetic D1/R2 only.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from '../tests/fixtures/academy-attendance-fixture.mjs';
import worker from '../src/academy-runtime.js';
const {chromium}=await import(process.env.MEDIA_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.TIMETABLE_ROLLUP_OUTPUT||'/private/tmp/academy-timetable-rollup-10753';await mkdir(out,{recursive:true});
const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003'),errors=[];
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const write=async(action,input)=>ok(await f.call('/api/admin/platform/courses/'+action,{operationId:crypto.randomUUID(),...input},admin));
const details={name:'Session Media Course',categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[0],startDate:'2026-10-21',endDate:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Course session with media',status:'SCHEDULED'}]};
details.endTime='14:00';details.sessions.push({...details.sessions[0],id:'CMSESSION-'+crypto.randomUUID(),startTime:'13:00',endTime:'14:00',title:'Second Course lesson'});
const course=await write('save',{details});let c=ok(await f.call('/api/admin/platform/courses/get',course,admin)).course;
const reviewed=await write('validate',{...course,baseRevision:c.revision});assert.equal(reviewed.validation.valid,true,JSON.stringify(reviewed));const accepted=await write('accept',{...course,baseRevision:reviewed.revision,validationToken:reviewed.validation.token,acknowledgeWarnings:true});await write('publish',{...course,baseRevision:accepted.revision,validationToken:reviewed.validation.token});
f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('media-browser-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run('COURSE:'+course.courseId);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(v=>v.startsWith('.'))){res.writeHead(404);res.end();return;}if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method(),headers,...(req.method()==='POST'?{body:url.pathname==='/api/academy/entrance'?JSON.stringify({...req.postDataJSON(),startDate:'2026-10-18'}):req.postDataBuffer()}:{})}),f.env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Isolated video</title>'}));
async function identity(token){await page.goto(base+'/version.json');await page.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',t);},token);}


const checks=[],program=attendanceProgramId;
async function countDay(host,date){return page.locator('#'+host+' .upcoming-day').filter({has:page.locator('time[datetime="'+date+'"]')}).locator('.timetable-pill').count();}
async function verify(who,t,adminRealm=false,assigned=false){
 await identity(t);
 for(const mode of (who==='student'?['learn']:who==='teacher'?['teach']:['teach'])){
  const entry=adminRealm?'/academy/admin/':'/academy/';
  await page.goto(base+entry+'#timetable/'+mode);
  await page.locator('#academy-sessions .timetable-pill').first().waitFor();
  for(const [kind,id,expected] of [['PROGRAM',program,adminRealm&&!assigned?1:2],['COURSE',course.courseId,adminRealm&&!assigned?1:2]]){
   await page.goto(base+entry+'#activity/'+kind+'/'+id+'/'+mode+'/timetable');
   await page.locator('#activity-sessions .timetable-pill').first().waitFor();
   assert.equal(await countDay('activity-sessions','2026-10-21'),expected,who+' '+kind+' cards per day');
   if(kind==='PROGRAM'){
    const cards=await page.locator('#activity-sessions .timetable-pill').evaluateAll(nodes=>nodes.map(card=>({title:card.querySelector('.preview-name').textContent,copy:card.querySelector('.timetable-pill-copy').textContent,time:card.querySelector('.preview-clock').textContent})));
    assert(cards.length&&cards.every(card=>card.title.includes('Shared lesson')||card.title==='Second lesson'));
    assert(cards.every(card=>!card.copy.includes('Synthetic Program 1')&&card.copy.includes('Synthetic learner 3')&&/\d{2}:\d{2}/.test(card.time)));
   }
   for(const width of [390,1440]){
    await page.setViewportSize({width,height:1050});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),who+' '+kind+' width '+width);
    await page.locator('#activity-schedule').screenshot({path:out+'/'+who+'-'+kind.toLowerCase()+'-'+width+'.png'});
   }
   const first=page.locator('#activity-sessions .upcoming-day').filter({has:page.locator('time[datetime="2026-10-21"]')}).locator('[data-information]').first();
   await first.click();await page.locator('#lesson-information[open]').waitFor();
   assert.equal(await page.locator('#lesson-information-body .combined-lesson').count(),expected===1?2:1);
   await page.locator('#lesson-information-close').click();
   checks.push(who+' '+kind+': '+expected+' cards, correct lesson details, phone/desktop fit');
  }
 }
}
try{
 await page.clock.setFixedTime(new Date('2026-10-21T08:30:00Z'));
 await verify('student',student);await verify('teacher',teacher);await verify('admin-inherited',admin,true);
 for(const scope of ['PROGRAM:'+program,'COURSE:'+course.courseId])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,'account-0001',?,'STUDENT',1,'CONFIRMED')").run('rollup-own-'+scope,scope);
 f.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,'rollup-browser-member','class-1','account-0001',1)").run('PROGRAM:'+program);
 await verify('admin-own-student',admin,true,true);
 assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors,output:out}));
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
