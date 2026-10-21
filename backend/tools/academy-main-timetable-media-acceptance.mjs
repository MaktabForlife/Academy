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
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.MAIN_TIMETABLE_MEDIA_OUTPUT||'/private/tmp/academy-main-timetable-media-10718';await mkdir(out,{recursive:true});
const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003'),errors=[];
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const write=async(action,input)=>ok(await f.call('/api/admin/platform/courses/'+action,{operationId:crypto.randomUUID(),...input},admin));
const details={name:'Session Media Course',categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[0],startDate:'2026-10-21',endDate:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Course session with media',status:'SCHEDULED'}]};
const course=await write('save',{details});let c=ok(await f.call('/api/admin/platform/courses/get',course,admin)).course;
const reviewed=await write('validate',{...course,baseRevision:c.revision});assert.equal(reviewed.validation.valid,true,JSON.stringify(reviewed));const accepted=await write('accept',{...course,baseRevision:reviewed.revision,validationToken:reviewed.validation.token,acknowledgeWarnings:true});await write('publish',{...course,baseRevision:accepted.revision,validationToken:reviewed.validation.token});
f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('media-browser-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run('COURSE:'+course.courseId);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(v=>v.startsWith('.'))){res.writeHead(404);res.end();return;}if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method(),headers,...(req.method()==='POST'?{body:req.postDataBuffer()}:{})}),f.env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Isolated video</title>'}));
async function identity(token){await page.goto(base+'/version.json');await page.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',t);},token);}

const checks=[];
const period={startDate:'2026-10-18',endDate:'2026-10-24'},scope='PROGRAM:'+attendanceProgramId;
async function attach(activityKey,selected,extra={}){
 const made=ok(await f.media('create',{activityKey,...period,...extra,sessionKey:selected.sessionKey,sessionVersion:selected.sessionVersion,operationId:crypto.randomUUID()},admin));
 ok(await f.media('save',{lessonId:made.lessonId,revision:1,operationId:crypto.randomUUID(),title:selected.title,summary:'Published notes',recordingUrls:['https://youtu.be/9IuTDcSs6vQ','https://youtu.be/ujm0T_jZd0U'],state:'PUBLISHED',commentsClosed:false},admin));
 ok(await f.mediaUpload({lessonId:made.lessonId,revision:2,filename:'Notes for '+selected.title+'.pdf'},admin));return made.lessonId;
}
try{
 const programSessions=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions;
 const selected=programSessions.find(s=>s.date==='2026-10-21'&&s.classIds.includes('class-1'));assert(selected);const programMediaId=await attach(scope,selected);
 const courseSession=ok(await f.media('sessions',{activityKey:'COURSE:'+course.courseId,runId:course.runId},admin)).sessions[0];await attach('COURSE:'+course.courseId,courseSession,{runId:course.runId});
 const refs=[{activityKey:'COURSE:'+course.courseId,sessionKey:courseSession.sessionKey}],courseRefs=ok(await f.media('timetable',{sessions:refs},student));assert.equal(courseRefs.lessons.length,1);
 const projected=ok(await f.call('/api/academy/entrance',{startDate:period.startDate},student));assert(projected.personalTimetable.some(s=>s.kind==='COURSE'&&s.mediaSessionKey===courseSession.sessionKey),'Published Course uses the saved session identity');
 checks.push('Program and Course publications match their exact media sessions');
 let mediaReads=0;page.on('request',r=>{if(r.url().endsWith('/lesson-media/timetable'))mediaReads++;});
 for(const [identityToken,mode] of [[student,'learn'],[teacher,'teach'],[admin,'learn'],[admin,'teach']]){
  await identity(identityToken);await page.goto(base+'/academy/#timetable/'+mode);
  await page.locator('#academy-sessions [data-timetable-media]').first().waitFor();
  // Grouped Program cards retain the primary Details control beside media actions.
  const cards=page.locator('#academy-sessions .timetable-pill').filter({has:page.locator('[data-timetable-media]')});assert(await cards.count()>=1);
  const card=cards.first();await card.locator('[data-information]').click();await page.locator('#lesson-information[open]').waitFor();assert(await page.locator('#lesson-information-body .combined-lesson').count()>=1);await page.locator('#lesson-information button').filter({hasText:/Close/}).click();
  const video=card.locator('[data-timetable-media$=YOUTUBE]');assert.match(await video.first().getAttribute('aria-label'),/Open videos/);await video.first().click();
  await page.locator('.lm-dialog [data-lm=watch]').first().waitFor();assert.equal(await page.locator('.lm-dialog [data-lm=watch]').count(),2);const chosenAsset=await page.locator('.lm-dialog [data-lm=watch]').last().getAttribute('data-asset');const youtube=f.db.prepare('SELECT youtube_id FROM lesson_media_assets WHERE asset_id=?').get(chosenAsset).youtube_id;await page.locator('.lm-dialog [data-lm=watch]').last().click();await page.locator('.lm-player').waitFor();assert.equal(await page.locator('.lm-player').getAttribute('src'),'https://www.youtube-nocookie.com/embed/'+youtube+'?rel=0');await page.locator('.lm-dialog [data-lm=close]').click();
  await card.locator('[data-timetable-media$=PDF]').first().click();await page.locator('.lm-pdf').waitFor();assert.match(await page.locator('.lm-dialog a[download]').getAttribute('download'),/Notes for/);await page.locator('.lm-dialog [data-lm=close]').click();
  assert.equal(await page.locator('#workspace-library-link').isVisible(),true);assert.equal(await page.locator('#workspace-library-link').getAttribute('href'),'/academy/library/');
  assert.equal(await page.locator('#learn-enrolment-entry').isVisible(),mode==='learn');
  await page.screenshot({path:out+'/'+(identityToken===admin?'admin-':identityToken===teacher?'teacher-':'student-')+mode+'.png',fullPage:true});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Main timetable fits '+width);}
  checks.push(mode+' timetable media opens video choices and private PDF; Details and Library retained');
 }
 await identity(student);await page.goto(base+'/academy/#timetable/learn');await page.locator('#academy-sessions [data-timetable-media]').first().waitFor();
 const before=mediaReads;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(100);assert.equal(mediaReads,before,'Returning to the page reuses the bounded metadata lookup');
 // Remove membership after metadata has already rendered: click-time media authority wins.
 f.db.prepare('UPDATE class_memberships SET active=0 WHERE activity_key=? AND account_id=?').run(scope,'account-0002');
 const buttons=await page.locator('#academy-sessions [data-timetable-media$=YOUTUBE]').all();let target;
 for(const b of buttons){const label=await b.getAttribute('aria-label');if(label.includes(selected.title)){target=b;break;}}
 assert(target);await target.click();await page.locator('.lm-dialog [data-lm=watch]').first().click();await page.locator('[data-lm-dialog-message]').filter({hasText:/assigned learners/}).waitFor();assert.equal(await page.locator('.lm-player').count(),0);await page.locator('.lm-dialog [data-lm=close]').click();checks.push('Revoked access cannot use a cached main-timetable media reference');
 await page.locator('#academy-sessions [data-timetable-media$=PDF]').last().click();await page.locator('.lm-pdf').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('m4l-academy-session-ended')));await page.waitForFunction(()=>!document.querySelector('.lm-dialog'));checks.push('Session end removes the open private PDF');
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(base+'/academy/#timetable');await page.locator('#academy-sessions .upcoming-day').first().waitFor();assert.equal(await page.locator('[data-timetable-media]').count(),0);assert.equal(await page.locator('#workspace-main-actions').isVisible(),false);checks.push('Public timetable contains no protected media icons');
 assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify({checks,errors,mediaReads},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors,output:out}));
}catch(error){console.log('Browser errors',errors);await page.screenshot({path:out+'/failure.png'});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
