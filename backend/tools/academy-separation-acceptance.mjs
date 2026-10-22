// Real frontend and Worker, isolated synthetic SQLite/R2, no live writes.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {separationFixture,separationScopes as scopes,separationActors as actors} from '../tests/fixtures/academy-separation-fixture.mjs';
import worker from '../src/academy-runtime.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ACADEMY_BROWSER_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ACADEMY_SEPARATION_OUTPUT||'/private/tmp/academy-separation-phase1';mkdirSync(out,{recursive:true});
const f=await separationFixture(),tokens={};for(const role of ['global','adminA','teacherA','studentA','dual'])tokens[role]=await f.actor(role);
for(const who of ['studentA','dual'])f.db.prepare('INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,?,?,?,1)').run(scopes.programA,'browser-'+who,'class-1',actors[who]);
for(const who of ['teacherA','dual'])f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,?,?,'ADDITIONAL')").run(scopes.programA,'class-1',actors[who]);
const made=await f.call('create',{operationId:crypto.randomUUID(),activityKey:scopes.programA,classId:'class-1',title:'Synthetic separation assessment',subject:'Qasas',examDate:'2026-10-22',durationMinutes:60,maximumMark:100},tokens.global);assert.equal(made.status,200);
const examId=made.body.assessmentId;assert.equal((await f.call('publish',{operationId:crypto.randomUUID(),assessmentId:examId,revision:1},tokens.global)).status,200);
await f.seedCoursePdf();
const requests=[],errors=[];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true};');return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);requests.push({path:url.pathname,workspace:req.headers['x-academy-workspace']});const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const target=path.resolve(root,'.'+url.pathname);if(!target.startsWith(root))throw Error();const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;
 const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.pdf':'application/pdf'}[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)}),page=await browser.newPage({viewport:{width:1440,height:1000}});
let dismissNextDialog=false;page.on('pageerror',error=>errors.push(String(error)));page.on('dialog',dialog=>{if(dismissNextDialog){dismissNextDialog=false;return dialog.dismiss();}return dialog.accept();});
await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
async function identity(role,url){console.log('Checking '+role+' '+url);await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},tokens[role]);await page.goto(origin+url);await ready();}
async function ready(){await page.waitForFunction(()=>window.M4L_ACADEMY_SHELL_DATA?.signedIn&&document.querySelector('#entrance-message')?.textContent!=='Loading Academy information…');}
const activity=mode=>'/academy/#activity/PROGRAM/'+encodeURIComponent(scopes.programA.slice(8))+'/'+mode+'/assessment';
const checks=[];
const settled=()=>page.evaluate(()=>new Promise(resolve=>{scrollTo(0,0);requestAnimationFrame(()=>requestAnimationFrame(resolve));}));
try{
 for(const who of Object.keys(tokens))for(const mode of ['learn','teach']){
  await identity(who,activity(mode));
  if((who==='teacherA'&&mode==='learn')||(who==='studentA'&&mode==='teach')){assert.equal(await page.locator('.view.active [data-as="open"]').count(),0);assert.equal(await page.locator('.view.active [data-form]').count(),0);checks.push({who,mode,restricted:true});continue;}
  await page.locator('.view.active [data-as="open"]').first().waitFor();
  assert.equal(await page.locator('.view.active .as-tabs').count(),0);
  if(mode==='learn'){assert.equal(await page.locator('.as-schedule-table th').filter({hasText:/Duration|Total mark/}).count(),0);}
  await page.locator('.view.active [data-as="open"]').first().click();await page.locator('.as-detail-heading').waitFor();
  assert.equal(await page.locator('[data-as="release-paper"],[data-as="delete-session"],[data-form="review-paper"]').count(),0);
  if(mode==='learn')assert(!await page.locator('#as-host').innerText().then(t=>/60 minutes|Total 100|undefined/.test(t)));
  if(['global','adminA'].includes(who)&&mode==='teach')assert.equal(await page.locator('[data-as="ready-assessment"]:enabled').count(),0);
  checks.push({who,mode,assessment:true});
 }
 await identity('global','/academy/#assessment-admin');await page.waitForURL('**/academy/admin/#assessment-admin');await ready();assert.equal(await page.locator('#as-admin-host .as-tabs').count(),1);checks.push({legacyAdminHandoff:true});
 await identity('global','/academy/admin/#administration/settings');await page.locator('#admin-app-settings input').waitFor();assert.equal(await page.locator('#admin-app-settings input').inputValue(),'Africa/Johannesburg');
 await identity('global','/academy/#timetable/learn');
 await page.locator('#academy-tab-teach').click();await page.waitForFunction(()=>window.M4L_ACADEMY_SHELL_DATA?.workspace==='TEACH');
 await page.locator('#academy-tab-learn').click();await page.waitForFunction(()=>window.M4L_ACADEMY_SHELL_DATA?.workspace==='LEARN');
 assert(requests.some(r=>r.path==='/api/academy/entrance'&&r.workspace==='TEACH'));assert(requests.some(r=>r.path==='/api/academy/entrance'&&r.workspace==='LEARN'));
 checks.push({workspaceSwitch:true});
 await identity('teacherA',activity('teach').replace('/assessment','/planning'));
 await page.locator('[data-lp-field="overview"]').fill('Synthetic unsaved teaching plan');dismissNextDialog=true;
 await page.locator('#academy-tab-learn').click();await page.waitForFunction(()=>location.hash.endsWith('/teach/planning'));
 assert.equal(await page.locator('[data-lp-field="overview"]').inputValue(),'Synthetic unsaved teaching plan');assert.equal(await page.evaluate(()=>M4L_ACADEMY_WORKSPACE.current()),'TEACH');
 await page.locator('#academy-tab-learn').click();await page.waitForFunction(()=>M4L_ACADEMY_SHELL_DATA?.workspace==='LEARN');
 await page.evaluate(hash=>{location.hash=hash;},activity('teach').replace('/academy/','').replace('/assessment','/planning'));
 await page.locator('[data-lp-field="overview"]').waitFor();assert.equal(await page.locator('[data-lp-field="overview"]').inputValue(),'Synthetic unsaved teaching plan');checks.push({unsavedGuardAndDraftRestore:true});
 await identity('global','/academy/#timetable/learn');
 for(const width of [320,360,390,430,768,820,1024,1280,1440]){
  await page.setViewportSize({width,height:900});await settled();assert.equal(await page.locator('.academy-banners').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Learn fits '+width);
  await page.screenshot({path:path.join(out,'learn-'+width+'.png'),fullPage:true});
 }
 await identity('global','/academy/#timetable/teach');for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await settled();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Teach fits '+width);await page.screenshot({path:path.join(out,'teach-'+width+'.png'),fullPage:true});}
 await identity('global','/academy/admin/#administration');for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await settled();assert.equal(await page.locator('.academy-banners').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Admin fits '+width);await page.screenshot({path:path.join(out,'admin-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,widths:[320,360,390,430,768,820,1024,1280,1440],pageErrors:errors,requests:requests.length},null,2));
 console.log(JSON.stringify({checks:checks.length,screenshots:17,pageErrors:errors.length,output:out}));
}catch(error){console.log(JSON.stringify({url:page.url(),errors,body:(await page.locator('body').innerText()).slice(-5000),requests:requests.slice(-10)}));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.close();}
