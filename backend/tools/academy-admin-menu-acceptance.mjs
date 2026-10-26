// Real UI/Worker, synthetic SQLite/R2. Never writes to the preview database.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {separationFixture,separationScopes as scopes} from '../tests/fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {publicTimetableDay,publicTimetableKey} from '../src/academy/d1/public-timetable.js';
import worker from '../src/academy-runtime.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ACADEMY_SETUP_OUTPUT||'/private/tmp/academy-admin-menu-acceptance';mkdirSync(out,{recursive:true});
const f=await separationFixture(),token=await f.actor('global'),errors=[],requests=[];
const objects=new Map();let etag=0,storageFails=false;
f.env.MEDIA_BUCKET={get:async key=>{const value=objects.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.body)}:null;},put:async(key,body,{onlyIf}={})=>{
 if(storageFails)throw Error('Synthetic snapshot storage failure');
 const current=objects.get(key);if(onlyIf?.etagMatches!==undefined&&onlyIf.etagMatches!==current?.etag||onlyIf?.etagDoesNotMatch==='*'&&current)return null;
 const value={body,etag:String(++etag)};objects.set(key,value);return {etag:value.etag};
}};
const refreshCount=()=>requests.filter(r=>r.path==='/api/academy/cache/refresh').length;
const snapshot=()=>objects.get(publicTimetableKey(f.env,publicTimetableDay())+'.accepted-'+f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id);
f.db.exec(readFileSync(new URL('../migrations/academy/0032_accepted_setup.sql',import.meta.url),'utf8'));
f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0034_assessment_operations.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
const baseline=await initialiseAcceptedSetup(f.env.ACADEMY_DB);
  f.env.ACADEMY_ACCEPTED_SETUP='1';
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,ACCEPTED_SETUP:true};');return;}
 if(url.pathname==='/api/academy/header-date'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true,gregorian:new Date().toISOString().slice(0,10),hijri:'13 Jumada al-ula 1448'}));return;}
 if(url.pathname.startsWith('/api/')){const bytes=[];for await(const chunk of req)bytes.push(chunk);requests.push({path:url.pathname,head:req.headers['x-academy-setup']});const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(bytes)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const target=path.resolve(root,'.'+url.pathname);if(!target.startsWith(root))throw Error();const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;
 const content=readFileSync(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});res.end(content);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
async function open(url){await page.goto(origin+url);await page.waitForFunction(()=>window.M4L_ACADEMY_SHELL_DATA?.signedIn);}
try{
 const expected=['Users','Announcements','Attendance','Curriculum','Library','Lesson plans','Assessments','App settings','Update timetable'];
 await page.goto(origin+'/version.json');await page.evaluate(t=>localStorage.setItem('m4l_account_token',t),token);
 await open('/academy/admin/#administration');await page.locator('.academy-admin-tools:not([hidden])').waitFor();
 assert.deepEqual(await page.locator('.academy-admin-links').locator(':scope > *').allTextContents(),expected);
 assert.deepEqual(await page.locator('#ad-tools').locator(':scope > *').allTextContents(),['Surahs and Duas Tracker','Library','Voice Recorder']);
 const sidebar=await page.locator('#ad-navigation').locator(':scope > *').allTextContents();assert.deepEqual(sidebar.slice(3,12),expected);
 assert.equal(await page.locator('.academy-admin-links').evaluate(nav=>getComputedStyle(nav).position),'static','Admin pills must stay in normal flow rather than cover page controls');assert.equal(await page.getByRole('button',{name:'Review setup',exact:true}).count(),0);assert.equal(await page.locator('script[src*="m4l-academy-setup"]').count(),0);
 await open('/academy/admin/#administration/curriculum');assert.deepEqual(await page.locator('#admin-workspace .workspace-actions > a').allTextContents(),['Subjects','Programs','Courses']);
 await open('/academy/admin/#administration/planning');await page.getByRole('heading',{name:'Manage Lesson plans',exact:true}).waitFor();
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,'admin-menu-'+width+'.png'),fullPage:true});}
 await open('/users/');assert.deepEqual(await page.locator('.academy-admin-links').locator(':scope > *').allTextContents(),expected);assert.equal(await page.locator('main a[href*="/academy/enrolment/manage/"]').first().isVisible(),true);
 await page.locator('.academy-admin-links [data-admin-public-refresh]').click();await page.locator('[data-admin-refresh-status]').filter({hasText:'Public timetable refreshed.'}).waitFor();assert(snapshot());
 const scoped=await f.actor('adminA');await page.goto(origin+'/version.json');await page.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',t);},scoped);await open('/academy/admin/#administration');
 assert.deepEqual(await page.locator('.academy-admin-links').locator(':scope > *').allTextContents(),['Users','Attendance','Curriculum','Library','Lesson plans','Assessments']);assert.equal(await page.locator('[data-admin-public-refresh]').count(),0);
 assert.deepEqual(await page.locator('#ad-tools').locator(':scope > *').allTextContents(),['Surahs and Duas Tracker','Library','Voice Recorder']);
 await open('/academy/admin/#administration/users');assert.equal(await page.locator('#admin-workspace a[href*="/academy/enrolment/manage/"]').isVisible(),true);
 assert.deepEqual(errors,[]);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 const result={passed:true,checks:['nine Admin destinations in the requested order','same menu on management subpages','Curriculum groups Subjects, Programs and Courses','Enrolments under Users','Lesson plans label','Admin Quick tools contains only three requested shortcuts','manual Update timetable fallback warms public R2','scoped Admin keeps filtered destinations and no Global Admin actions','no Review setup UI or script','mobile and desktop fit'],pageErrors:errors};writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,output:out}));
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.close();}
