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
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.TIMETABLE_CARD_OUTPUT||'/private/tmp/academy-timetable-cards-10719';await mkdir(out,{recursive:true});
const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const admin=await f.login('0001'),student=await f.login('0002'),teacher=await f.login('0003'),errors=[];
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const write=async(action,input)=>ok(await f.call('/api/admin/platform/courses/'+action,{operationId:crypto.randomUUID(),...input},admin));
const details={name:'Arabic Adventures: Conversational Arabic for Kids',categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[0],startDate:'2026-10-21',endDate:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-10-21',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Course session with media',status:'SCHEDULED'}]};
const course=await write('save',{details});let c=ok(await f.call('/api/admin/platform/courses/get',course,admin)).course;
const reviewed=await write('validate',{...course,baseRevision:c.revision});assert.equal(reviewed.validation.valid,true,JSON.stringify(reviewed));const accepted=await write('accept',{...course,baseRevision:reviewed.revision,validationToken:reviewed.validation.token,acknowledgeWarnings:true});await write('publish',{...course,baseRevision:accepted.revision,validationToken:reviewed.validation.token});
f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('media-browser-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run('COURSE:'+course.courseId);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(v=>v.startsWith('.'))){res.writeHead(404);res.end();return;}if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method(),headers,...(req.method()==='POST'?{body:req.postDataBuffer()}:{})}),f.env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Isolated video</title>'}));
async function identity(token){await page.goto(base+'/version.json');await page.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',t);},token);}


if(process.env.CARD_LAYOUT_CSS)await page.route(/\/css\/m4l-academy-entrance\.css(?:\?|$)/,async route=>route.fulfill({contentType:'text/css',body:await readFile(process.env.CARD_LAYOUT_CSS)}));
const checks=[];
try{
 // Use a fixed browser clock so the active Join state is exercised every run.
 await page.clock.setFixedTime(new Date('2026-10-21T08:30:00Z'));
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Hifz','PROGRAM:'+attendanceProgramId);
 const scope='PROGRAM:'+attendanceProgramId,period={startDate:'2026-10-18',endDate:'2026-10-24'};
 const selected=ok(await f.media('sessions',{activityKey:scope,...period},admin)).sessions.find(s=>s.date==='2026-10-21');assert(selected);
 const made=ok(await f.media('create',{activityKey:scope,...period,sessionKey:selected.sessionKey,sessionVersion:selected.sessionVersion,operationId:crypto.randomUUID()},admin));
 ok(await f.media('save',{lessonId:made.lessonId,revision:1,operationId:crypto.randomUUID(),title:'Hifz lesson',summary:'',recordingUrls:['https://youtu.be/9IuTDcSs6vQ'],state:'PUBLISHED',commentsClosed:false},admin));ok(await f.mediaUpload({lessonId:made.lessonId,revision:2},admin));
 // Long Program names and mixed teacher/learner outlines share this exact layout.
 await page.route('**/api/academy/entrance',async route=>{
  const req=route.request(),headers={...req.headers()};delete headers.origin;
  const response=await worker.fetch(new Request('http://localhost/api/academy/entrance',{method:'POST',headers,body:JSON.stringify({...req.postDataJSON(),startDate:'2026-10-18'})}),f.env),body=await response.json();
  if(body.success)for(const rows of [body.timetable,body.personalTimetable,body.activity?.timetable])for(const row of rows||[]){if(row.kind==='PROGRAM'&&row.date!=='2026-10-21')row.activityName=({0:'Mothers of the Ummah',1:'Alimiyah',2:'Classical and Conversational Arabic',4:'Arabic Intensive',5:'Steps to My Rabb',6:'Reboot Your Maktab'})[new Date(row.date+'T12:00:00Z').getUTCDay()]||row.activityName;}
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:JSON.stringify(body)});
 });
 for(const [who,t,mode] of [['student',student,'learn'],['teacher',teacher,'teach'],['admin',admin,'learn'],['admin',admin,'teach']]){
  await identity(t);await page.goto(base+'/academy/#timetable/'+mode);await page.locator('#academy-sessions .join-open').first().waitFor();await page.locator('#academy-sessions [data-timetable-media]').first().waitFor();
  const seen=new Set();
  for(const width of [1000,320,390,600,768,1024,1200,1440,1920]){
   await page.setViewportSize({width,height:1100});
   const report=await page.locator('#academy-sessions .timetable-pill').evaluateAll(cards=>cards.map(card=>{
    const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};},details=card.querySelector('.timetable-pill-details'),copy=card.querySelector('.timetable-pill-copy'),title=card.querySelector('.preview-name'),join=card.querySelector('.timetable-join'),r=box(card),d=box(details),c=box(copy),range=document.createRange();range.selectNodeContents(title);
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');let wordWidth=0;for(const text of copy.children){context.font=getComputedStyle(text).font;for(const word of text.textContent.split(/\s+/))wordWidth=Math.max(wordWidth,context.measureText(word).width);}
    const buttons=[...card.querySelectorAll('button')].map(b=>({label:b.textContent.trim(),...box(b)}));
    return {name:title.textContent,card:r,details:d,copy:c,join:join?box(join):null,titleLines:range.getClientRects().length,minCopy:Math.min(wordWidth+4,78,d.w-8),states:card.className,buttons,overflow:card.scrollWidth>card.clientWidth+1};
   }));
   assert(report.length>7);
   for(const row of report.filter(row=>row.join).concat(report.filter(row=>!row.join))){
    assert(row.copy.w>=row.minCopy-1,who+'/'+mode+' '+width+' squeezed title: '+JSON.stringify(row));
    assert(!row.overflow,who+'/'+mode+' '+width+' card overflow: '+JSON.stringify(row));
    if(row.name==='Hifz')assert.equal(row.titleLines,1,who+'/'+mode+' Hifz wraps by letter at '+width);
    for(const b of row.buttons)assert(b.x>=row.card.x-1&&b.right<=row.card.right+1&&b.y>=row.card.y-1&&b.bottom<=row.card.bottom+1,'Button stays within card: '+JSON.stringify(row));
    if(row.join){assert(row.join.y>=row.details.bottom-1,'Join is below the complete time/title row');seen.add('active');}
    if(row.states.includes('next-lesson'))seen.add('next');if(row.states.includes('teacher'))seen.add('teacher');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page width '+width);
   if([390,1024,1440].includes(width)){await page.locator('#academy-sessions .join-open').first().screenshot({path:out+'/'+who+'-'+mode+'-active-'+width+'.png'});if(width===1440){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+who+'-'+mode+'-page.png',fullPage:true});}}
  }
  assert(seen.has('active'));checks.push(who+' '+mode+': active/upcoming/long-name/media cards fit nine screen widths');
  await page.locator('#academy-sessions .join-open [data-information]').first().click();await page.locator('#lesson-information[open]').waitFor();assert(await page.locator('#lesson-information-body .combined-lesson').count()>=1);await page.locator('#lesson-information-close').click();
  await page.locator('#academy-sessions [data-timetable-media$=YOUTUBE]').first().click();await page.locator('.lm-player').waitFor();await page.locator('.lm-dialog [data-lm=close]').click();
 }
 // Course cards must handle the same Join state, including long titles.
 await page.clock.setFixedTime(new Date('2026-10-21T10:30:00Z'));await identity(student);await page.goto(base+'/academy/#timetable/learn');await page.locator('#academy-sessions .join-open').first().waitFor();
 assert.match(await page.locator('#academy-sessions .join-open .preview-name').textContent(),/Arabic Adventures/);
 for(const width of [320,390,1000,1440]){await page.setViewportSize({width,height:1100});const result=await page.locator('#academy-sessions .join-open').evaluate(el=>{const d=el.querySelector('.timetable-pill-details').getBoundingClientRect(),j=el.querySelector('.timetable-join').getBoundingClientRect(),c=el.querySelector('.timetable-pill-copy').getBoundingClientRect();return {below:j.y>=d.bottom-1,copy:c.width,details:d.width,overflow:el.scrollWidth>el.clientWidth+1};});assert(result.below&&!result.overflow&&result.copy>=Math.min(78,result.details-8));}
 await page.locator('#academy-sessions .join-open').first().screenshot({path:out+'/course-active.png'});checks.push('Active Course with a long name keeps Join below readable details');
 for(const [kind,id,instant] of [['PROGRAM',attendanceProgramId,'2026-10-21T08:30:00Z'],['COURSE',course.courseId,'2026-10-21T10:30:00Z']])for(const mode of ['learn','teach']){
  await page.clock.setFixedTime(new Date(instant));await identity(admin);await page.goto(base+'/academy/#activity/'+kind+'/'+id+'/'+mode+'/timetable');await page.locator('#activity-sessions .join-open').first().waitFor();
  for(const width of [320,1000,1440]){await page.setViewportSize({width,height:1100});const safe=await page.locator('#activity-sessions .join-open').evaluateAll(cards=>cards.every(el=>{const d=el.querySelector('.timetable-pill-details').getBoundingClientRect(),j=el.querySelector('.timetable-join').getBoundingClientRect();return j.y>=d.bottom-1&&el.scrollWidth<=el.clientWidth+1;}));assert(safe,kind+' scoped '+mode+' '+width);}
 }
 checks.push('Scoped Program and Course LEARN/TEACH timetables use the same safe card layout');
 assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors,output:out}));
}catch(error){await page.screenshot({path:out+'/failure.png'});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
