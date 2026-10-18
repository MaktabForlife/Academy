// Exercise the packaged site with synthetic accounts; no live data or outbound messages.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
import worker from '../src/academy-runtime.js';
import {enrolmentFixture} from '../tests/fixtures/academy-enrolment-fixture.mjs';

const [assetsArg,outputArg]=process.argv.slice(2),assets=resolve(assetsArg),out=resolve(outputArg);
mkdirSync(out,{recursive:true});
const f=await enrolmentFixture(),checks=[],errors=[],accountFailures=[];
if(!f.db.prepare("SELECT 1 FROM sqlite_master WHERE name='academy_pdf_bookmarks'").get())f.db.exec(readFileSync(new URL('../migrations/academy/0025_pdf_bookmarks.sql',import.meta.url),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.ftl':'text/plain','.wasm':'application/wasm'};
let origin,currentPage;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,HIFZHELPER_URL:"https://maktab.hifz-helper.app/"}');return;}
  if(url.pathname==='/academy/open-library/catalogue'){res.setHeader('Content-Type','application/json');res.end('{"books":[]}');return;}
  if(['/api/academy/open-library/metadata/public','/api/academy/open-library/metadata/list'].includes(url.pathname)){res.setHeader('Content-Type','application/json');res.end('{"success":true,"records":[]}');return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);
   if(url.pathname==='/api/account/session'&&response.status!==200)accountFailures.push(response.status);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/account/'))pathname='/account/';
  const file=resolve(assets,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(assets+'/'))throw Error('INVALID_PATH');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function pageFor(role){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 if(role)await context.addInitScript(token=>{if(!sessionStorage.getItem('synthetic-session-seeded')){localStorage.setItem('m4l_account_token',token);sessionStorage.setItem('synthetic-session-seeded','1');}},f.tokens[role]);
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push({url:page.url(),error:e.message}));return page;
}
const roles=page=>page.locator('.academy-account-bar .academy-role-tabs button:visible');
async function header(page,url,expected){
 currentPage=page;await page.goto(origin+url);await page.locator('.academy-banners .academy-account-bar').waitFor({state:'visible'});
 if(expected.length)await page.waitForFunction(count=>document.querySelectorAll('.academy-account-bar .academy-role-tabs button:not([hidden])').length===count,expected.length);
 assert.equal(await page.locator('.academy-banners').count(),1,url+' brand header');assert.equal(await page.locator('.academy-account-bar').count(),1,url+' account header');
 assert.deepEqual(await roles(page).allTextContents(),expected,url+' workspace permissions');
 for(const selector of ['[data-page-home]','[data-page-refresh]'])assert.equal(await page.locator('.academy-banners>.sidebar '+selector+',.academy-banners>.academy-connected-sidebar '+selector).isVisible(),true,url+' '+selector);
 const bounds=await page.locator('.academy-banners').boundingBox(),size=await page.evaluate(()=>({w:innerWidth,h:innerHeight,s:document.documentElement.scrollWidth}));
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=size.w+1,url+' header width');assert.ok(bounds.y>=-1&&bounds.y+bounds.height<size.h,url+' header height');
 const overflow=await page.locator('.academy-banners').evaluate(n=>n.scrollWidth>n.clientWidth+1);assert.equal(overflow,false,url+' header contents fit');
 await page.evaluate(()=>scrollTo(0,500));assert.ok(Math.abs((await page.locator('.academy-banners').boundingBox()).y)<1,url+' sticky header');await page.evaluate(()=>scrollTo(0,0));
}
try{
 const admin=await pageFor('admin');
 const pages=[];
 for(const root of ['academy','account','programs','users','recorder','activities'])for(const name of readdirSync(join(assets,root),{recursive:true}).filter(n=>n.endsWith('.html'))){
  const file=root+'/'+name;let url='/'+file.replace(/index\.html$/,'');
  if(root==='programs')url+='?program='+encodeURIComponent(f.program.activity_id);
  if(root==='recorder')url+='?academy=1';
  pages.push({file,url});
 }
 for(const width of [320,390,768,1440]){
  await admin.setViewportSize({width,height:1000});
  for(const {file,url} of pages){
   await header(admin,url,['LEARN','TEACH','ADMIN']);
   assert.match(await admin.locator('.academy-account-bar').innerText(),/Global Admin/);
   if(file==='academy/enrolment/index.html'){
    assert.equal(await roles(admin).filter({hasText:'LEARN'}).getAttribute('aria-pressed'),'true');
    await admin.screenshot({path:join(out,'enroll-now-header-'+width+'.png'),fullPage:false});
   }
   if(file==='academy/pdf-reader/index.html'){
    const work=await admin.locator('#pr-workspace').boundingBox(),toolbar=await admin.locator('.pr-header').boundingBox();
    assert.ok(work.height>350&&work.y+work.height<=1001,'Reader fills remaining viewport '+width);
    assert.ok(work.y>=toolbar.y+toolbar.height-1,'Reader controls remain above PDF panes');
    assert.equal(await admin.locator('#pr-close-reader').isVisible(),true);
    await admin.screenshot({path:join(out,'pdf-reader-header-'+width+'.png'),fullPage:false});
   }
  }
  checks.push('All '+pages.length+' standalone entry points have one persistent account header at '+width+'px');
 }
 for(const [role,expected] of [['student',['LEARN']],['teacher',['LEARN','TEACH']],['other',['LEARN','TEACH','ADMIN']],[null,[]]]){
  const page=await pageFor(role);
  for(const url of ['/academy/enrolment/','/academy/pdf-reader/','/programs/library.html','/activities/kaaba-puzzle/']){
   await header(page,url,expected);
   assert.equal(await page.locator('#academy-login').isVisible(),!role);
   assert.equal(await page.locator('#ac-signout').isVisible(),Boolean(role));
  }
  checks.push((role||'Visitor')+' retains correct workspace, login and sign-out controls');
 }
 for(const [label,hash] of [['LEARN','#timetable/learn'],['TEACH','#timetable/teach'],['ADMIN','#administration']]){
  await header(admin,'/academy/enrolment/',['LEARN','TEACH','ADMIN']);await roles(admin).filter({hasText:label}).click();await admin.waitForURL('**/academy/'+hash);
 }
 await header(admin,'/academy/enrolment/',['LEARN','TEACH','ADMIN']);
 await admin.locator('[data-page-home]').click();await admin.waitForURL('**/academy/#overview');
 await header(admin,'/academy/enrolment/',['LEARN','TEACH','ADMIN']);
 await Promise.all([admin.waitForEvent('load'),admin.locator('[data-page-refresh]').click()]);await admin.locator('.academy-account-bar').waitFor();
 checks.push('Enroll now LEARN, TEACH, ADMIN, Home and Refresh controls navigate correctly');
 await admin.goto(origin+'/academy/calendar/?embed=1&view=learn');await admin.locator('#cal-content').waitFor();assert.equal(await admin.locator('.academy-banners,.academy-account-bar').count(),0);checks.push('Embedded Calendar inherits the parent header without a duplicate');
 await header(admin,'/academy/pdf-reader/',['LEARN','TEACH','ADMIN']);
 await admin.locator('#pr-split').click();await admin.locator('#pr-focus:not([disabled])').waitFor();await admin.locator('#pr-focus').click();assert.equal(await admin.locator('#pr-workspace').getAttribute('class'),'pr-workspace is-split is-focused');await admin.locator('#pr-focus').click();assert.equal(await admin.locator('#pr-pane-1').isVisible(),true);checks.push('PDF split and focus controls still work below the shared header');
 await admin.locator('#ac-signout').click();await admin.waitForURL('**/academy/#overview');assert.equal(await admin.evaluate(()=>localStorage.getItem('m4l_account_token')),null);checks.push('Sign out clears the account and returns to Academy home');
 assert.deepEqual(errors,[]);assert.deepEqual(accountFailures,[]);
 const report={success:true,entryPoints:pages.map(p=>p.file),checks,errors,accountFailures,syntheticOnly:true,liveDataChanged:false,whatsappMessagesSent:false};writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){if(currentPage){await currentPage.screenshot({path:join(out,'failure.png')});console.error(JSON.stringify({error:error.message,url:currentPage.url(),errors}));}throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
