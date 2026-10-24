// Disposable local accounts; external requests are blocked and no microphone is opened.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from '../tests/fixtures/academy-attendance-fixture.mjs';
import worker from '../src/academy-runtime.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.RECORDER_OUTPUT||'/private/tmp/academy-recorder-10744';mkdirSync(out,{recursive:true});
const f=await mediaFixture();
for(const migration of ['0022_academic_calendar.sql','0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));
f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
const tokens={student:await f.login('0002'),teacher:await f.login('0003'),admin:await f.login('0001'),scoped:await f.login('0004')};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
let origin;const requests=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){
  // Bind the actual UI integration to this disposable fixture's Program.
  res.setHeader('Content-Type','text/javascript');res.end(`window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,REBOOT_PROGRAM_ID:${JSON.stringify(attendanceProgramId)}};`);return;
 }
 if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,gregorian:new Date().toISOString().slice(0,10),hijri:'13 Jumada al-ula 1448'}));return;}
 if(url.pathname==='/academy/open-library/catalogue'){res.setHeader('Content-Type','application/json');res.end('{"books":[]}');return;}
 if(url.pathname.startsWith('/api/')){
  requests.push({path:url.pathname,method:req.method,workspace:req.headers['x-academy-workspace']});
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await worker.fetch(new Request(origin+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const file=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root))throw Error('Invalid local path');
 const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(bytes);
}catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end(error.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[],errors=[];
try{
 for(const width of [390,1440]){
  for(const [role,url,selector,workspace] of [
   ['student','/academy/','#academy-recorder-nav','LEARN'],
   ['teacher','/academy/','#academy-recorder-nav','LEARN'],
   ['admin','/academy/','#academy-recorder-nav','LEARN'],
   ['student',`/academy/#activity/PROGRAM/${attendanceProgramId}/learn`,'#activity-menu [data-recorder-link]','LEARN'],
   ['teacher',`/academy/#activity/PROGRAM/${attendanceProgramId}/teach`,'#activity-menu [data-recorder-link]','TEACH'],
   ['admin',`/academy/admin/#activity/PROGRAM/${attendanceProgramId}/learn`,'#activity-menu [data-recorder-link]','ADMIN_LEARN'],
   ['admin',`/academy/admin/#activity/PROGRAM/${attendanceProgramId}/teach`,'#activity-menu [data-recorder-link]','ADMIN_TEACH']
  ]){
   const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
   await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   await page.addInitScript(token=>{localStorage.setItem('m4l_account_token',token);},tokens[role]);
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(origin+url);const link=page.locator(selector);await link.waitFor({state:'visible'});
   assert.match(await link.getAttribute('href'),/^\/recorder\/\?academy=1/);
   if(selector.startsWith('#activity-menu'))assert.match(await link.evaluate(el=>el.previousElementSibling.textContent),/Library/);
   if(role==='teacher'&&workspace==='TEACH'&&width===390){
    const before=page.url();
    await page.evaluate(()=>{window.__recorderPlanningGuard=window.M4L_PLANNING.canLeave;window.M4L_PLANNING.canLeave=()=>false;});
    await link.click();assert.equal(page.url(),before,'A retained planning draft blocks recorder navigation');
    await page.evaluate(()=>{window.M4L_PLANNING.canLeave=window.__recorderPlanningGuard;delete window.__recorderPlanningGuard;});
   }
   await link.click();await page.waitForURL('**/recorder/?**');
   assert.equal(new URL(page.url()).searchParams.get('workspace'),workspace);
   await page.locator('.page-card').first().waitFor();
   assert.equal(await page.locator('.recorder-header').isVisible(),false);
   assert.equal(await page.getByText('← Academy Voice Recorder',{exact:true}).count(),0);
   assert.equal(await page.locator('.academy-page-actions [data-page-home]').isVisible(),true);
   if(workspace.startsWith('ADMIN'))assert.equal(await page.locator('.academy-role-tabs').isVisible(),false,'Admin banner has no second navigation row');
   assert.equal(await page.locator('#image-selector-current').textContent(),'Part 1');
   assert.equal(await page.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   const count=requests.length;
   await page.locator('.page-card').first().click();await page.locator('#record-screen.active').waitFor();
   assert.equal(await page.locator('.recorder-header').isVisible(),true);
   await page.locator('#page-pill').click();await page.locator('#page-select-screen.active').waitFor();
   assert.equal(await page.locator('.recorder-header').isVisible(),false);
   assert.equal(requests.length,count,'Selecting pages creates no API requests or learner work');
   if(role==='admin'&&workspace==='ADMIN')await page.screenshot({path:join(out,'admin-recorder-'+width+'.png'),fullPage:false});
   checks.push(`${role} ${workspace} direct recorder at ${width}px`);await context.close();
  }
 }
 // Saved links skip the removed intermediate screen too.
 const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.addInitScript(token=>localStorage.setItem('m4l_account_token',token),tokens.student);
 await page.goto(origin+'/academy/#recorder');await page.waitForURL('**/recorder/?**');await page.locator('.page-card').first().waitFor();checks.push('Saved recorder hash opens the page selector directly');
 await page.goto(origin+'/recorder/');await page.locator('.page-card').first().waitFor();assert.equal(await page.locator('.recorder-header').isVisible(),true);checks.push('Standalone recorder retains its selector heading');
 assert.deepEqual(errors,[]);writeFileSync(join(out,'report.json'),JSON.stringify({checks,requests,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
