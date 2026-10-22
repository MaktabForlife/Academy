// Real UI/Worker, synthetic SQLite/R2. Never writes to the preview database.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {separationFixture,separationScopes as scopes} from '../tests/fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import worker from '../src/academy-runtime.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ACADEMY_BROWSER_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ACADEMY_SETUP_OUTPUT||'/private/tmp/academy-setup-acceptance';mkdirSync(out,{recursive:true});
const f=await separationFixture(),token=await f.actor('global'),errors=[],requests=[];
f.db.exec(readFileSync(new URL('../migrations/academy/0032_accepted_setup.sql',import.meta.url),'utf8'));
const baseline=await initialiseAcceptedSetup(f.env.ACADEMY_DB);f.env.ACADEMY_ACCEPTED_SETUP='1';
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,ACCEPTED_SETUP:true};');return;}
 if(url.pathname.startsWith('/api/')){const bytes=[];for await(const chunk of req)bytes.push(chunk);requests.push({path:url.pathname,head:req.headers['x-academy-setup']});const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(bytes)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const target=path.resolve(root,'.'+url.pathname);if(!target.startsWith(root))throw Error();const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;
 const content=readFileSync(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});res.end(content);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
async function open(url){await page.goto(origin+url);await page.waitForFunction(()=>window.M4L_ACADEMY_SHELL_DATA?.signedIn);}
try{
 await page.goto(origin+'/version.json');await page.evaluate(t=>localStorage.setItem('m4l_account_token',t),token);
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Reviewed setup browser name',scopes.programA);
 await open('/academy/#timetable/learn');assert(!(await page.locator('body').innerText()).includes('Reviewed setup browser name'));
 assert(requests.some(r=>r.path==='/api/academy/entrance'&&r.head===baseline.head));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await open('/academy/admin/#administration');
  await page.locator('#setup-publication-review').click();await page.locator('dialog input[value="'+scopes.programA+'"]').check();
  await page.locator('[data-setup-review]').click();await page.locator('[data-setup-publish]').waitFor({state:'visible'});
  assert((await page.locator('dialog[aria-label="Review setup publication"]').innerText()).includes('Program and Course details'));
  assert.equal(await page.locator('dialog[aria-label="Review setup publication"]').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0),true);
  await page.screenshot({path:path.join(out,'setup-review-'+width+'.png'),fullPage:true});
  if(width===1440){await page.locator('[data-setup-close]').click();assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,baseline.head);}
  else{await page.locator('[data-setup-publish]').click();await page.locator('dialog[aria-label="Review setup publication"]').waitFor({state:'detached'});}
 }
 await open('/academy/#timetable/learn');assert((await page.locator('body').innerText()).includes('Reviewed setup browser name'));
 assert.notEqual(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,baseline.head);
 assert.deepEqual(errors,[]);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 const result={passed:true,checks:['private draft name','pinned reader request','desktop and mobile frozen review','cancel leaves accepted head unchanged','explicit whole-change publication','new reader receives accepted name'],pageErrors:errors};
 writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,output:out}));
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.close();}
