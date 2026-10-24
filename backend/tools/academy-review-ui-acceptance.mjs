import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import {MOU_MEDIA_PROGRAM as activity} from '../src/academy/d1/lesson-media.js';
import worker from '../src/academy-runtime.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ACADEMY_HOME_OUTPUT||'/private/tmp/academy-review-10749';mkdirSync(out,{recursive:true});
const f=await mediaFixture();for(const migration of ['0022_academic_calendar.sql','0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));
f.env.ACADEMY_MEDIA_SEPARATION='1';
f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
// Disposable local marketing cards exercise real overflow and saved line breaks.
f.db.prepare('UPDATE program_settings SET public_card_json=?').run(JSON.stringify({time:'7pm',title:'Public Academy course',description:'Bootcamp.\nA 4 week journey.'}));
const course=f.db.prepare("SELECT * FROM activities WHERE kind='COURSE' LIMIT 1").get();
f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('planning-course-teacher','account-0003',?,'TEACHER',1,'CONFIRMED')").run(course.activity_key);
const reboot=f.db.prepare("SELECT activity_id FROM activities WHERE kind='PROGRAM' LIMIT 1").get().activity_id;
const images=new Map();f.env.LESSON_MEDIA_BUCKET={put:async(k,b)=>images.set(k,new Uint8Array(b)),get:async k=>images.has(k)?{body:images.get(k),etag:'synthetic',text:async()=>new TextDecoder().decode(images.get(k))}:null,delete:async k=>images.delete(k)};
const tokens={teacher:await f.login('0003'),admin:await f.login('0001'),student:await f.login('0002')};
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.pdf':'application/pdf','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,MY_LINKS:true,REBOOT_PROGRAM_ID:'+JSON.stringify(reboot)+'};');return;}
 if(url.pathname.startsWith('/__signin/')){const who=url.pathname.split('/').at(-1);if(!tokens[who])throw Error('Unknown synthetic identity');res.writeHead(200,{'Content-Type':'text/html'});res.end('<script>localStorage.clear();sessionStorage.clear();localStorage.setItem("m4l_account_token",'+JSON.stringify(tokens[who])+');location.replace("/academy/");</script>');return;}
 if(url.pathname==='/academy/open-library/catalogue'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({books:[]}));return;}
 if(url.pathname==='/api/academy/header-date'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true,gregorian:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hijri:'4 Jumada al-ula 1448',source:'https://jamiat.org.za/'}));return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root))throw Error('Invalid path');const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){console.log('SERVER ERROR',e);res.writeHead(e.code==='ENOENT'?404:500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;console.log('Synthetic planning preview: '+origin);
const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',r=>(new URL(r.request().url()).origin===origin||r.request().url().startsWith('blob:'))?r.continue():r.abort());
const signIn=async who=>{await page.goto(origin+'/__signin/'+who);await page.waitForURL('**/academy/');};


async function fits(label){const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,label+JSON.stringify(size));}
async function row(selector){return page.locator(selector).evaluate(el=>{const days=[...el.querySelectorAll('.upcoming-day')].map(day=>day.getBoundingClientRect());return {count:days.length,y:days.map(d=>d.y),width:el.clientWidth,scroll:el.scrollWidth};});}
async function arrows(title,button){const a=await page.locator(title).boundingBox(),b=await page.locator(button).boundingBox();assert(a&&b);assert(b.x>a.x+a.width-1);assert(Math.abs((a.y+a.height/2)-(b.y+b.height/2))<23,'Arrows share the heading row');}
try{
 await page.goto(origin+'/academy/');await page.locator('#academy-public-sessions time').first().waitFor();
 const initial=await page.locator('#academy-public-sessions').evaluate(el=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),days=[...el.querySelectorAll('.upcoming-day')],target=days.find(day=>day.querySelector('time').dateTime>=today&&day.querySelector('.preview-pill'))||days.find(day=>day.querySelector('time').dateTime>=today);return {left:el.scrollLeft,expected:target.offsetLeft-days[0].offsetLeft,max:el.scrollWidth-el.clientWidth};});
 assert(Math.abs(initial.left-Math.min(initial.expected,initial.max))<3,'Mobile Home focuses today or the next lesson; desktop opens on Sunday');checks.push('Mobile Home focuses today or the next lesson; desktop opens on Sunday');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});if(width>=1000)await page.waitForFunction(()=>document.getElementById('academy-public-sessions').scrollLeft===0);await fits('Home '+width);const days=await row('#academy-public-sessions');assert.equal(days.count,14);assert.equal(new Date((await page.locator('#academy-public-sessions time').first().getAttribute('datetime'))+'T12:00:00Z').getUTCDay(),0);assert(days.y.every(y=>Math.abs(y-days.y[0])<2));assert(days.scroll>days.width);await arrows('#public-timetable-title','#public-home-previous');
  assert.equal(await page.locator('#public-timetable-range').isVisible(),false);
  await page.locator('#public-home-next').click();await page.waitForFunction(()=>!document.getElementById('public-home-previous').disabled);await page.locator('#public-home-previous').click();await page.waitForFunction(()=>document.getElementById('academy-public-sessions').scrollLeft===0);
  const courses=await page.locator('#film-track').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,rows:[...el.children].filter(c=>!c.hidden).map(c=>c.getBoundingClientRect().y)}));assert(courses.scroll>courses.width);assert(courses.rows.every(y=>Math.abs(y-courses.rows[0])<2));
  if(width<768){const quick=await page.locator('#academy-public-quicklinks nav').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,card:el.firstElementChild.getBoundingClientRect().width}));assert(quick.scroll>quick.width);assert(quick.width/quick.card>=3&&quick.width/quick.card<=4);}
  if(width===390||width===1440)await page.screenshot({path:path.join(out,'home-'+width+'.png')});
 }
 checks.push('Home date columns, compact Quick links and self-paced course rails fit phone, tablet and desktop');
 for(const who of ['student','teacher','admin']){
  await signIn(who);const admin=who==='admin',mode=who==='teacher'?'teach':'learn';
  await page.goto(origin+(admin?'/academy/admin/#administration':'/academy/#timetable/'+mode));await page.locator('#academy-sessions time').first().waitFor();
  if(admin){assert.equal(await page.locator('#administration [data-recorder-link]').count(),0);await page.locator('#admin-tab-curriculum').waitFor();assert.equal(await page.locator('#admin-tab-curriculum').textContent(),'Subjects');}
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await fits(who);const days=await row('#academy-sessions');assert(days.y.every(y=>Math.abs(y-days.y[0])<2));await arrows('#schedule-title','#schedule-previous');assert.equal(await page.locator('#schedule-range').isVisible(),false);}
  const base=admin?'/academy/admin/':'/academy/';await page.goto(origin+base+'#activity/PROGRAM/'+reboot+'/'+mode);await page.locator('#activity-menu').waitFor();await page.locator('#activity-sessions time').first().waitFor();
  const recorder=page.locator('#activity-menu [data-recorder-link]');await recorder.waitFor();assert.match(await recorder.evaluate(el=>el.previousElementSibling.textContent),/Library/);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await fits(who+' Program');const days=await row('#activity-sessions');assert(days.y.every(y=>Math.abs(y-days.y[0])<2));await arrows('#activity-schedule-title','#activity-previous');}
  if(admin){
   await page.evaluate(()=>{const base=window.M4L_ACADEMY_SHELL_DATA;window.__curriculumFixture=base;window.M4L_ACADEMY_SHELL.update({...base,personalActivities:[...base.personalActivities,{kind:'COURSE',id:'synthetic-inactive',name:'Z inactive course',roles:['GLOBAL_ADMIN'],curriculumActive:false}]});});
   await page.setViewportSize({width:390,height:900});await page.locator('[data-curriculum-open]').click();assert.equal(await page.locator('#academy-curriculum-menu a[href*="synthetic-inactive"]').count(),0);await page.keyboard.press('Escape');
   await page.setViewportSize({width:1440,height:900});
   await page.locator('[data-curriculum-open]').click();const menu=page.locator('#academy-curriculum-menu');await menu.waitFor({state:'visible'});for(const label of ['Programs','Courses']){const names=await menu.getByRole('navigation',{name:label,exact:true}).locator('a').allTextContents();assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})));}assert.equal(await menu.locator('a[href*="synthetic-inactive"]').count(),1);await menu.getByRole('button',{name:'Close Curriculum menu'}).click();await page.evaluate(()=>window.M4L_ACADEMY_SHELL.update(window.__curriculumFixture));
   const calendar=page.locator('.academy-calendar-section');await calendar.locator('summary').click();const iframe=calendar.locator('iframe');await iframe.waitFor();const url=new URL(await iframe.getAttribute('src'),origin);assert.equal(url.searchParams.get('workspace'),'ADMIN_LEARN');await page.waitForFunction(()=>{const iframe=document.querySelector('.academy-calendar-frame');return iframe?.contentDocument?.readyState==='complete';});await iframe.contentFrame().locator('#cal-grid>*').first().waitFor();assert.doesNotMatch(await iframe.contentFrame().locator('body').innerText(),/not available to your account/);checks.push('Admin-Learn calendar retains its workspace and opens without learner enrolment');
  }
 }
 checks.push('Learn, Teach, Admin and Program timetable headings and rows; recorder follows Library and is absent from Manage Academy');
 await signIn('admin');
 for(const route of ['/academy/admin/#administration/planning','/academy/admin/#administration/announcements','/academy/admin/#administration/assessments','/academy/admin/#administration/library','/academy/admin/#administration/curriculum','/academy/admin/#activity/PROGRAM/'+reboot+'/teach','/programs/','/users/','/academy/subjects/','/academy/courses/manage/','/academy/library/manage/','/academy/pdf-tools/','/academy/enrolment/manage/','/academy/calendar/?workspace=ADMIN']){
  await page.goto(origin+route);console.log('Checking Close:',route);const close=page.locator('.academy-management-close');await close.waitFor({state:'visible'});assert.equal(await close.getAttribute('href'),'/academy/admin/#administration');await fits(route);if(route.includes('planning')||route.includes('#activity/'))await page.screenshot({path:path.join(out,route.includes('planning')?'admin-planning.png':'admin-teach.png')});
  if(route==='/academy/admin/#administration/planning'){const before=page.url();await page.evaluate(()=>{window.__planningGuard=window.M4L_PLANNING.canLeave;window.M4L_PLANNING.canLeave=()=>false;});await close.click();assert.equal(page.url(),before);await page.evaluate(()=>window.M4L_PLANNING.canLeave=window.__planningGuard);}
  if(route==='/academy/subjects/'){await page.locator('[data-curriculum-open]').click();await page.locator('#academy-curriculum-menu nav a').first().waitFor();assert(await page.locator('#academy-curriculum-menu nav a').count()>0);await page.keyboard.press('Escape');}
 }
 checks.push('Admin sections, readers and standalone management tools all have Close to Admin Home');
 await signIn('teacher');await page.goto(origin+'/academy/library/');await page.getByRole('button',{name:'My links',exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'My links',exact:true}).click();await page.locator('#personal-links form').waitFor();assert.equal(await page.locator('#personal-links h2').textContent(),'My links');checks.push('Existing My links opens its form after the availability response');
 for(const url of ['/academy/library/','/academy/open-library/']){
  await page.goto(origin+url);await page.setViewportSize({width:390,height:900});const button=page.getByRole('button',{name:'Library menu',exact:true});await button.waitFor();await button.click();const menu=page.locator('#library-view-menu');await menu.waitFor({state:'visible'});await page.waitForFunction(()=>Math.abs(document.getElementById('library-view-menu').getBoundingClientRect().right-innerWidth)<2);const box=await menu.boundingBox();assert(Math.abs(box.x+box.width-390)<2);assert.equal(await menu.getByRole('link',{name:'Public library',exact:true}).count(),1);assert.equal(await menu.getByRole('link',{name:'Bookmarks',exact:true}).count(),1);await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await menu.isVisible(),false);await page.setViewportSize({width:1440,height:900});await button.waitFor({state:'hidden'});assert.equal(await button.isVisible(),false);assert.equal(await page.locator('main>.al-tabs,main .al-tabs').isVisible(),true);
 }
 checks.push('Library labels and right sliding mobile menu preserve desktop tabs and Escape dismissal');
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({checks,errors,syntheticOnly:true},null,2));console.log(JSON.stringify({checks,errors,out}));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')});console.log('Browser errors',errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
