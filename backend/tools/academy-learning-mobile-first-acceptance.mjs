// Feature development uses synthetic SQLite/R2 only; every external request is blocked.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mobileFirstFixture} from './mobile-first-preview/fixture.mjs';
import worker from '../src/academy-runtime.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.resolve(process.env.LEARNING_MOBILE_OUTPUT||'../../outputs/academy-mobile-first-local');mkdirSync(out,{recursive:true});
const f=await mobileFirstFixture();
const tokens=Object.fromEntries(await Promise.all(['studentA','teacherA','global'].map(async who=>[who,await f.actor(who)])));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.ico':'image/x-icon'};
const calls=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true,LEARNING_OPERATIONS:3,IS_DEVELOPMENT:true};');return;}
 if(url.pathname.startsWith('/__signin/')){const who=url.pathname.split('/').at(-1);if(!tokens[who])throw Error('Unknown test account');const target=who==='teacherA'?'/academy/#activity/PROGRAM/'+f.scopes.programA.slice(8)+'/teach/planning':who==='global'?'/academy/admin/#administration':'/academy/#timetable/learn';res.setHeader('Content-Type','text/html');res.end('<script>localStorage.clear();sessionStorage.clear();sessionStorage.setItem("m4l_header_date",JSON.stringify({gregorian:new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),hijri:"15 Jumada al-ula 1448",savedAt:Date.now()}));localStorage.setItem("m4l_account_token",'+JSON.stringify(tokens[who])+');location.replace('+JSON.stringify(target)+');</script>');return;}
 if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,gregorian:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hijri:'15 Jumada al-ula 1448'}));return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const part of req)chunks.push(part);calls.push({path:url.pathname,workspace:req.headers['x-academy-workspace']});const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root)||/\/(backend|node_modules|\.git)\//.test(target.slice(root.length)))throw Error('Not public');const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end();}});
await new Promise(done=>server.listen(Number(process.env.LEARNING_MOBILE_PORT||0),'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
if(process.argv.includes('--serve')){
 console.log(JSON.stringify({origin,teacher:origin+'/__signin/teacherA',learn:origin+'/__signin/studentA',admin:origin+'/__signin/global',syntheticOnly:true}));
 await new Promise(done=>{process.once('SIGTERM',done);process.once('SIGINT',done);});await new Promise(done=>server.close(done));f.close();
}else{
 const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[],checks=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const area='/academy/#activity/PROGRAM/'+f.scopes.programA.slice(8),contents=()=>page.locator('#activity-menu .workspace-contents');
 const ready=async()=>{await page.waitForFunction(()=>document.body.classList.contains('academy-learning-layout'));};
 const identity=async who=>{await page.goto(origin+'/__signin/'+who);await page.waitForURL(url=>!url.pathname.startsWith('/__signin/'));};
 const fit=async label=>{const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert(size.s<=size.w+1,label+JSON.stringify(size));checks.push(label);};
 const choose=async label=>{if(!await contents().evaluate(el=>el.open))await contents().locator('summary').click();await contents().getByRole('link',{name:label,exact:true}).click();};
 const screenshot=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,name),fullPage:false});};
 try{
  await identity('studentA');await page.locator('#ad-title').waitFor();await ready();
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:950});await fit('Learn dashboard fits '+width);
   const layout=await page.locator('.ad-layout').evaluate(el=>getComputedStyle(el).display);
   assert.equal(layout,width>=1120?'grid':'block');assert.equal(await page.locator('.ad-menu-toggle').isVisible(),width<1120);
  }
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#ad-navigation').isVisible(),false);await page.locator('[data-ad-nav-toggle]').click();await page.locator('#ad-navigation').waitFor({state:'visible'});await page.locator('#ad-navigation a').first().focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#ad-navigation').isVisible(),false);await screenshot('learn-phone.png');checks.push('Dashboard Contents opens and closes by keyboard');
  await page.goto(origin+area+'/learn');await page.locator('#activity-tab-timetable').waitFor({state:'attached'});await ready();
  assert.equal(await contents().evaluate(el=>el.open),false);await contents().locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await contents().evaluate(el=>el.open),true);
  assert.equal(await contents().locator('[role=tab]').count(),0);assert.equal(await contents().getByRole('link',{name:'Attendance',exact:true}).count(),0);assert.equal(await contents().getByRole('link',{name:'Planning',exact:true}).count(),0);
  assert.deepEqual(await contents().getByRole('link').allTextContents(),['Timetable','Assessment','Lesson media','Library']);
  await contents().getByRole('link',{name:'Timetable',exact:true}).focus();const oldHash=new URL(page.url()).hash;await page.keyboard.press('ArrowDown');assert.equal(new URL(page.url()).hash,oldHash);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Assessment');await page.keyboard.press('Escape');assert.equal(await contents().evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');checks.push('Contents uses normal links, role-specific choices, arrow focus and Escape');
  await choose('Assessment');await page.locator('#as-host .as-schedule-table').waitFor();assert.equal(await contents().evaluate(el=>el.open),false);assert.equal(await contents().locator('[aria-current=page]').textContent(),'Assessment');assert.equal(await page.evaluate(()=>document.activeElement.id),'activity-title');await fit('Learner assessment table stays inside the reading panel');await screenshot('assessment-phone.png');
  await choose('Timetable');await page.locator('#activity-sessions .upcoming-day').first().waitFor();
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:950});await fit('Learn Program fits '+width);await page.waitForFunction(expected=>document.querySelector('.workspace-contents')?.open===expected,width>=1120);
   const rail=await page.locator('#activity-sessions').evaluate(el=>({swipe:el.scrollWidth>el.clientWidth,pageWidth:el.clientWidth,day:el.querySelector('.upcoming-day').getBoundingClientRect().width}));assert(rail.swipe);assert(rail.day<=rail.pageWidth+1);
   await screenshot('program-'+width+'.png');
  }
  checks.push('The same Contents expands as the desktop sidebar; the timetable remains swipeable');
  await page.setViewportSize({width:390,height:844});await contents().locator('summary').click();await contents().getByRole('button',{name:'Class Notes',exact:true}).click();assert.equal(await contents().evaluate(el=>el.open),false);await fit('Class Notes view fits phone');
  await choose('Lesson media');await page.locator('#activity-lesson-media:not([hidden])').waitFor();await fit('Learner lesson media fits phone');await screenshot('lesson-media-phone.png');
  await choose('Library');await page.locator('#al-content').waitFor();await ready();await fit('Shared Library reader fits phone');assert.equal(await page.evaluate(()=>M4L_ACADEMY_WORKSPACE.current()),'LEARN');checks.push('Class Notes, lesson media and Library retain the learner workspace');
  await identity('teacherA');await page.locator('[data-lp-field=activities]').first().waitFor();await ready();await page.waitForFunction(()=>!document.querySelector('[data-lp-field=activities]').disabled);
  assert.equal(await page.locator('.lp-lesson').count(),1);await contents().locator('summary').click();assert.deepEqual(await contents().getByRole('link').allTextContents(),['Timetable','Attendance','Planning','Assessment','Lesson media','Library']);await page.keyboard.press('Escape');
  await page.locator('[data-lp-field=activities]').first().fill('السلام عليكم\nRead, discuss and revise the lesson together.');await page.locator('[data-lp=add]').click();assert.equal(await page.locator('.lp-lesson').count(),2);assert.match(await page.locator('[data-lp-field=activities]').first().inputValue(),/Read, discuss/);
  page.once('dialog',dialog=>dialog.dismiss());await choose('Lesson media');await page.waitForURL(url=>url.hash.endsWith('/teach/planning'));assert.match(await page.locator('[data-lp-field=activities]').first().inputValue(),/Read, discuss/);checks.push('Teacher Contents preserves the existing unsaved-plan guard');
  const savedPlan=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/academy/planning/get'&&r.request().method()==='POST');await page.locator('[data-lp=save]').click();await savedPlan;await page.locator('.lp-message').filter({hasText:'Draft saved.'}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-lp-field=activities]')&&!document.querySelector('[data-lp-field=activities]').disabled);if(!await page.locator('.lp-lesson').first().evaluate(el=>el.open))await page.locator('.lp-lesson').first().locator('summary').click();
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:950});await fit('Teacher planner fits '+width);await page.locator('.lp-lesson').first().evaluate(el=>el.open=true);await page.locator('[data-lp-field=activities]').first().waitFor({state:'visible'});
   const form=await page.locator('[data-lp-field=activities]').first().evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),height:el.getBoundingClientRect().height}));assert(form.font>=16);assert(form.height>=144,JSON.stringify(form));
   const buttons=await page.locator('.lp-primary-actions button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height));assert(buttons.every(h=>h>=44));await screenshot('planner-'+width+'.png');
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await fit('Planner reflows at 200 percent text size');await page.evaluate(()=>document.documentElement.style.fontSize='');checks.push('Planner has readable inputs, touch targets and 200 percent text reflow');
  await choose('Attendance');await page.locator('#pa-workspace').waitFor();await fit('Teacher attendance fits phone');const classes=await page.locator('.pa-classes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(classes,1);await screenshot('attendance-phone.png');
  if(f.mobileCourse){await page.goto(origin+'/academy/#activity/COURSE/'+f.mobileCourse.activity_id+'/teach');await page.locator('#activity-title').filter({hasText:f.mobileCourse.name}).waitFor();await ready();await fit('Course teaching uses the same phone reading structure');assert.equal(await contents().evaluate(el=>el.open),false);}
  await identity('global');await page.locator('#ad-title').waitFor();assert.equal(await page.evaluate(()=>document.body.classList.contains('academy-learning-layout')),false);assert.equal(await page.locator('#ad-title').innerText(),'Your administration dashboard');
  await page.goto(origin+'/academy/admin/#activity/PROGRAM/'+f.scopes.programA.slice(8)+'/teach/planning');await page.locator('[data-lp-field=activities]').first().waitFor();await ready();assert.equal(await page.evaluate(()=>M4L_ACADEMY_WORKSPACE.current()),'ADMIN_TEACH');await fit('Admin-Teach shares the reading layout and preserves its authority');
  await page.goto(origin+'/academy/#website');await page.locator('#overview.active').waitFor();assert.equal(await page.evaluate(()=>document.body.classList.contains('academy-learning-layout')),false);checks.push('Admin management and public website retain their layout; Admin-Teach keeps its realm');
  assert.deepEqual(errors,[]);const result={passed:true,baseline:'107.84',version:'107.88',branch:'feature/academy-mobile-first',checks,errors,requests:calls.length,liveDataChanged:false};writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});writeFileSync(path.join(out,'failure.html'),await page.content());console.error(JSON.stringify({checks,errors}));throw error;}
 finally{await browser.close();await new Promise(done=>server.close(done));f.close();}
}
