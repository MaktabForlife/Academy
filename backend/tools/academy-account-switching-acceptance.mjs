// Uses real local PIN/session endpoints with disposable synthetic accounts only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
import worker from '../src/academy-runtime.js';
import {enrolmentFixture} from '../tests/fixtures/academy-enrolment-fixture.mjs';
import {rememberedKey} from '../../js/m4l-academy-accounts.mjs';

const assets=resolve(process.argv[2]||'../.academy-pages'),out=resolve(process.argv[3]||'/private/tmp/academy-accounts-browser');mkdirSync(out,{recursive:true});
const f=await enrolmentFixture(),errors=[],calls=[],checks=[],trace=[],responses=[];
if(!f.db.prepare("SELECT 1 FROM sqlite_master WHERE name='academy_pdf_bookmarks'").get())f.db.exec(readFileSync(new URL('../migrations/academy/0025_pdf_bookmarks.sql',import.meta.url),'utf8'));
let origin,holdLogin=false,releaseLogin,heldToken,failLogout=false;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.ttf':'font/ttf','.ftl':'text/plain','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true}');return;}
  if(url.pathname==='/academy/open-library/catalogue'){res.setHeader('Content-Type','application/json');res.end('{"books":[]}');return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   calls.push({path:url.pathname,authorization:req.headers.authorization||''});
   if(failLogout&&url.pathname==='/api/account/logout'){failLogout=false;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"success":false,"error":"Synthetic logout unavailable"}');return;}
   const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}:{})}),f.env);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(url.pathname.startsWith('/api/account/')){const result=JSON.parse(bytes);responses.push({path:url.pathname,status:response.status,id:result.account?.uniqueid,error:result.error});}
   if(holdLogin&&url.pathname==='/api/account/login'&&response.status===200){holdLogin=false;heldToken=JSON.parse(bytes).token;await new Promise(r=>{releaseLogin=r;});}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);return;
  }
  let path=decodeURIComponent(url.pathname);if(path.startsWith('/account/'))path='/account/';
  const file=resolve(assets,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(assets+'/'))throw Error('Invalid path');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(()=>{const remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key==='m4l_account_token')console.debug('ACCOUNT-TRACE '+new Error('Session removed').stack);return remove.call(this,key);};});
context.on('page',p=>p.on('console',message=>{if(message.text().startsWith('ACCOUNT-TRACE '))trace.push(message.text());}));
let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const token=()=>page.evaluate(()=>localStorage.getItem('m4l_account_token'));
const chooser=()=>page.locator('#academy-account-switcher');
async function ready(p=page){await p.waitForFunction(()=>Boolean(window.M4L_ACADEMY_ACCOUNTS));}
async function open(){await page.locator('#academy-switch-account').click();await chooser().waitFor({state:'visible'});}
async function fill(id='login-0001',pin='1234'){await page.locator('#account-switch-id').fill(id);await page.locator('#account-switch-pin').fill(pin);}
async function submit(){await chooser().locator('[type=submit]').click();}
const sessionStatus=async t=>(await f.call('/api/account/session',{},t)).status;
try{
 await page.goto(origin+'/academy/#login');await ready();await page.locator('#academy-login-dialog').waitFor({state:'visible'});
 const accountCalls=()=>calls.filter(c=>c.path.startsWith('/api/account/'));
 assert.equal(accountCalls().length,0,'Opening Login does not query remembered IDs or accounts');
 assert.equal(await page.locator('#academy-remember-id').isChecked(),true,'Login remembers IDs by default');
 await page.locator('#demo-username').fill('login-0002');await page.locator('#demo-pin').fill('1234');
 await page.locator('#login-preview [type=submit]').click();await page.waitForFunction(()=>location.hash==='#timetable/learn');await ready();
 const studentToken=await token(),key=rememberedKey(origin);
 assert.equal(await sessionStatus(studentToken),200);let saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(saved[0].id,'login-0002');
 assert.deepEqual(Object.keys(saved[0]),['id','name','lastUsed']);checks.push('Successful optional login remembers ID/name/time only; opening the chooser makes no account lookup');
 await open();assert.equal(await page.locator('#account-switch-pin').inputValue(),'');assert.equal(await page.locator('[data-switch-remember]').isChecked(),true,'Switch account remembers IDs by default');
 await fill('login-0001','9999');await submit();await page.locator('[data-switch-status]').filter({hasText:'Incorrect PIN'}).waitFor();
 assert.equal(await token(),studentToken);assert.equal(await sessionStatus(studentToken),200);assert(!calls.some(c=>c.path==='/api/account/logout'));
 await fill('login-0001','');const count=accountCalls().length;await submit();assert.equal(accountCalls().length,count);await chooser().locator('[data-switch-close]').click();assert.equal(await token(),studentToken);
 checks.push('Wrong/missing PIN and cancellation preserve the existing session and do not revoke it');

 await open();await fill();holdLogin=true;await submit();await page.waitForFunction(()=>document.querySelector('[data-switch-status]').textContent==='Checking PIN…');
 for(let i=0;i<100&&!releaseLogin;i++)await new Promise(r=>setTimeout(r,10));assert(releaseLogin);
 await chooser().locator('[data-switch-close]').click();releaseLogin();
 await page.waitForFunction(()=>!document.querySelector('#academy-account-switcher').open);for(let i=0;i<100&&await sessionStatus(heldToken)!==401;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(await sessionStatus(heldToken),401);assert.equal(await token(),studentToken);checks.push('Cancelling a delayed successful PIN response discards and revokes its unused session');

 await open();await fill();await page.evaluate(()=>{window.syntheticUnsaved=e=>e.preventDefault();window.addEventListener('beforeunload',window.syntheticUnsaved);});
 const beforeGuard=accountCalls().length;await submit();await page.locator('[data-switch-status]').filter({hasText:'unfinished work'}).waitFor();assert.equal(accountCalls().length,beforeGuard);assert.equal(await token(),studentToken);
 await page.evaluate(()=>window.removeEventListener('beforeunload',window.syntheticUnsaved));
 failLogout=true;await submit();await page.locator('[data-switch-status]').filter({hasText:'Synthetic logout unavailable'}).waitFor();assert.equal(await token(),studentToken);assert.equal(await sessionStatus(studentToken),200);
 checks.push('Unfinished-work guards block switching; a failed old-session logout keeps the original account');

 const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(origin+'/activities/kaaba-puzzle/');await ready(other);
 await page.evaluate(()=>{sessionStorage.setItem('m4l_read_v1:synthetic-old-private','private');localStorage.setItem('m4l_library_v1:synthetic:personal:old','private');});
 await fill();await submit();await page.waitForURL('**/academy/admin/#administration');await ready();await other.waitForURL('**/academy/admin/#administration');
 const adminToken=await token();assert.notEqual(adminToken,studentToken);assert.equal(await sessionStatus(studentToken),401);assert.equal(await sessionStatus(adminToken),200);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('m4l_read_v1:synthetic-old-private')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('m4l_library_v1:synthetic:personal:old')),null);
 saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.deepEqual(saved.map(r=>r.id),['login-0001','login-0002']);
 checks.push('Valid PIN revokes the old session, clears private caches and moves every open tab to the new authorised workspace');

 // Local storage names/IDs are untrusted hints and do not grant permissions.
 await page.evaluate(k=>{const rows=JSON.parse(localStorage.getItem(k));rows[0].name='<img src=x onerror="window.syntheticXss=true">';rows[0].contexts=[{role:'GLOBAL_ADMIN'}];localStorage.setItem(k,JSON.stringify(rows));},key);
 await open();assert.equal(await chooser().locator('img').count(),0);assert.equal(await page.evaluate(()=>window.syntheticXss),undefined);
 await chooser().locator('[data-remembered-id="login-0002"]').click();assert.equal(await page.locator('#account-switch-pin').inputValue(),'');assert.equal(await page.locator('#account-switch-pin').getAttribute('type'),'password');
 await page.locator('#account-switch-pin').fill('1234');await submit();await page.waitForURL('**/academy/#timetable/learn');await ready();assert.equal(await page.locator('[data-shell-role=admin]').isVisible(),false);
 checks.push('Remembered names render as text and local role hints cannot grant Admin access; every selection starts with an empty hidden PIN');

 await page.evaluate(k=>{const rows=JSON.parse(localStorage.getItem(k));rows.find(row=>row.id==='login-0001').name='Synthetic Admin';localStorage.setItem(k,JSON.stringify(rows));},key);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await open();
  const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('#academy-account-switcher').getBoundingClientRect().toJSON()}));
  assert(fit.scroll<=fit.width+1,'Page fits '+width);assert(fit.dialog.x>=0&&fit.dialog.right<=width+1,'Chooser fits '+width);
  await page.screenshot({path:join(out,'switch-account-'+width+'.png')});await chooser().locator('[data-switch-close]').click();
 }
 checks.push('Account controls and chooser fit 320, 390, 768 and 1440 pixel layouts');
 await page.locator('#academy-sign-out').click();await page.locator('#academy-login').waitFor({state:'visible'});await page.locator('#academy-login').click();
 assert.equal(await page.locator('#login-preview [data-remembered-id]').count(),2);await page.reload();await ready();await page.locator('#academy-login').click();
 assert.equal(await page.locator('#login-preview [data-remembered-id]').count(),2);await page.screenshot({path:join(out,'remembered-login.png')});
 const beforeRemove=accountCalls().length;await page.locator('#login-preview .forget-account').first().click();assert.equal(await page.locator('#login-preview [data-remembered-id]').count(),1);
 await page.locator('#login-preview').getByRole('button',{name:'Forget all remembered IDs',exact:true}).click();assert.equal(await page.locator('#login-preview [data-remembered-id]').count(),0);assert.equal(accountCalls().length,beforeRemove);
 checks.push('Sign out and refresh retain opted-in IDs; remove/forget operate locally without deleting accounts or making API requests');

 await page.goto(origin+'/account/login-0003?academy=1');await ready();await page.locator('#login-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#login-form-remember-id').isChecked(),true,'Personal-link login remembers IDs by default');
 assert.equal(await page.locator('#setup-form-remember-id').isChecked(),true,'PIN setup remembers IDs by default');
 await page.locator('#login-pin').fill('1234');await page.locator('#login-form [type=submit]').click();await page.waitForURL('**/academy/#timetable/teach');await ready();
 assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key))[0].id,'login-0003');
 checks.push('Personal-link PIN login also supports the optional remembered-ID preference');

 const teacherToken=await token();await f.call('/api/account/logout',{},teacherToken);
 await open();await fill('login-0002');await submit();await page.waitForURL('**/academy/#timetable/learn');await ready();assert.equal(await sessionStatus(await token()),200);
 checks.push('A previously expired/revoked session does not prevent a fresh PIN-verified switch');

 await other.goto(origin+'/activities/kaaba-puzzle/');await ready(other);await other.locator('#academy-switch-account').click();await other.locator('[data-switch-close]').click();
 await other.evaluate(()=>{window.syntheticUnsaved=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',window.syntheticUnsaved);});
 other.on('dialog',dialog=>dialog.dismiss());
 await open();await fill();await submit();await page.waitForURL('**/academy/admin/#administration');await ready();
 await other.locator('.academy-account-changing').waitFor({state:'visible'});assert.equal(await other.locator('.academy-banners').isVisible(),false,'The old private header is covered even if navigation is cancelled');
 await other.evaluate(()=>window.removeEventListener('beforeunload',window.syntheticUnsaved));await other.getByRole('link',{name:'Open account',exact:true}).click();await other.waitForURL('**/academy/admin/#administration');
 checks.push('Another tab with unfinished work keeps its former interface hidden when navigation is held, with working Open account recovery');

 const restoredToken=await f.login('0002');assert.equal(typeof restoredToken,'string');assert.equal(await sessionStatus(restoredToken),200);await page.evaluate(t=>{localStorage.setItem('m4l_account_token',t);window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));},restoredToken);
 await page.waitForURL('**/academy/#timetable/learn');await ready();assert.equal(await page.locator('[data-shell-role=admin]').isVisible(),false);
 checks.push('A back/forward restored document with changed account ownership opens the current account instead of retaining old authority');
 await open();await chooser().getByRole('button',{name:'Use another ID',exact:true}).click();assert.equal(await page.locator('[data-switch-remember]').isChecked(),true,'Entering another ID keeps the default selected');
 await fill('login-0003');await page.locator('[data-switch-remember]').uncheck();await submit();await page.waitForURL('**/academy/#timetable/teach');await ready();
 assert(!(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).some(row=>row.id==='login-0003'),'An explicitly unticked ID is not retained');
 await open();assert.equal(await page.locator('[data-switch-remember]').isChecked(),true,'The next switch starts with the default selected');await chooser().locator('[data-switch-close]').click();
 checks.push('Remember ID defaults to selected for Login, personal-link login, PIN setup and account switching; explicitly unticking it still prevents remembering that ID');
 assert.deepEqual(errors,[]);
 const report={success:true,syntheticOnly:true,liveDataChanged:false,checks,errors};writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:join(out,'failure.png')});console.error(JSON.stringify({error:error.message,url:page.url(),errors,trace:trace.slice(-12),responses:responses.slice(-15)}));throw error;}
finally{releaseLogin?.();await browser.close();await new Promise(r=>server.close(r));f.db.close();}
