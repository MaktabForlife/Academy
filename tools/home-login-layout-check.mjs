// GitHub-only full published-page login/layout reproduction. No hosted requests.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import worker from '../backend/src/academy-runtime.js';
import {hosting} from '../backend/src/academy/hosting.mjs';
import {emptyCompatibilityDatabase} from '../backend/src/academy/separation/compatibility.js';
import {emptyShapes} from '../backend/src/academy/separation/empty-shapes.js';
import {splitEngine} from '../backend/src/academy/separation/engine.js';
assert.equal(process.env.GITHUB_ACTIONS,'true','Run only on disposable GitHub');
const fixtureRoot=resolve(process.env.HOME_LOGIN_FIXTURE_ROOT);
const {prepareFeatureSeed,featureSyntheticAccounts}=await import(pathToFileURL(resolve(fixtureRoot,'backend/tools/feature-synthetic-seed.mjs')).href);
const {sqliteD1}=await import(pathToFileURL(resolve(fixtureRoot,'backend/tools/academy-split/sqlite-d1.mjs')).href);
const {chromium}=await import(pathToFileURL(resolve(process.env.REVIEW_BROWSER_MODULES,'node_modules/playwright/index.mjs')).href);
const assets=resolve('.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'home-login-evidence');
await mkdir(out,{recursive:true});
const h=hosting(),base=h.academyPortalOrigin,errors=[],records=[],requests=[],blocked=[],nativeDenials=[],serviceCalls=[];
const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,crypto.randomUUID()+crypto.randomUUID()]));
const seed=await prepareFeatureSeed({pin:'2468',secrets});
const core=emptyCompatibilityDatabase(sqliteD1(seed.databases.core),emptyShapes,{currentGrants:true}),admin=sqliteD1(seed.databases.admin),engine=splitEngine({core,admin});
const cfg=JSON.parse(await readFile('backend/wrangler.feature.jsonc','utf8'));
const bridgeSecret=crypto.randomUUID()+crypto.randomUUID();
const studioFixture={async fetch(url,init){const request=new Request(url,init),u=new URL(request.url);assert.equal(u.origin,h.studioBackendOrigin);assert.equal(request.method,'POST');assert(request.headers.get('X-Maktab-Signature'));serviceCalls.push(u.pathname);if(u.pathname==='/internal/academy/events')return Response.json({success:true});if(u.pathname==='/internal/studio/hub-summary')return Response.json({navigation:{academia:[],mothers:true,hifz:null,tafseer:'/studio/?view=collections&collection=tafseer'},websites:[],rights:{websites:[]}});throw Error('Unexpected synthetic Studio operation');}};
const env={...cfg.vars,...secrets,ACADEMY_TO_WEBSITE_SECRET:bridgeSecret,WEBSITE_PLATFORM_SERVICE:studioFixture,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ACADEMY_DB:sqliteD1(seed.databases.core),ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:{getByName(){return {read:async(...args)=>({result:await engine.read(...args)}),write:async(...args)=>({result:await engine.write(...args)})};}},AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},ALLOWED_ORIGINS:base};
const originalFetch=globalThis.fetch;let remoteAttempts=0;
globalThis.fetch=async()=>{remoteAttempts++;throw Error('Unexpected server remote call');};
const browser=await chromium.launch({headless:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
async function native(url,options={}){
 const response=await worker.fetch(new Request(url,options),env,{waitUntil(){throw Error('Unexpected background work');}});
 if(!response.ok){let value;try{value=await response.clone().json();}catch{}nativeDenials.push({path:new URL(url).pathname,status:response.status,code:value?.code||null});}
 return response;
}
const context=await browser.newContext({viewport:{width:2048,height:1100},reducedMotion:'reduce',serviceWorkers:'block'});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
let holdBootstrap=null,heldBootstrap=null,failBootstrap=false,holdRefinement=null,heldRefinement=null;
const baselineApp=await readFile(resolve(process.env.HOME_LOGIN_BASELINE_ROOT,'portal/circles/app.js'),'utf8');
let useBaselineApp=false;
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin===h.academyApiOrigin&&url.pathname.startsWith('/api/')||url.origin===base&&url.pathname.startsWith('/api/')){
  let kind='';try{kind=JSON.parse(url.searchParams.get('request')||req.postData()||'{}').kind||'';}catch{}
  requests.push({path:url.pathname,kind});
  if(kind==='bootstrap'&&holdBootstrap){heldBootstrap?.();await holdBootstrap;}
  if(kind==='bootstrap'&&failBootstrap)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'SYNTHETIC_BOOTSTRAP_FAILURE',error:'Synthetic check unavailable.'})});
  const response=await native(url.href,{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postDataBuffer()}:{})});
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 }
 if(url.origin!==base){blocked.push(url.origin);return route.abort();}
 if(url.pathname==='/circles-login.mjs'&&holdRefinement){heldRefinement?.();await holdRefinement;}
 if(url.pathname==='/circles/app.js'&&useBaselineApp)return route.fulfill({status:200,contentType:'text/javascript',body:baselineApp});
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';
 try{const file=resolve(assets,'.'+decodeURIComponent(name));assert(file.startsWith(assets+'/'));return route.fulfill({status:200,contentType:mime[extname(file)]||'application/octet-stream',body:await readFile(file)});}
 catch{return route.fulfill({status:404,body:'Not found'});}
});
await page.addInitScript(()=>{
 window.__homeLayoutFrames=[];
 const sample=()=>{
  const hero=document.querySelector('#learning-circles'),raw=document.querySelector('[data-home-area=mothers]'),hub=document.querySelector('#animated-hub');
  const visible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  if(visible(hero)&&visible(raw)&&raw.textContent.includes('Classrooms to nurture')){
   if(window.__homeLayoutFrames.length<60)window.__homeLayoutFrames.push({workspace:new URL(location.href).searchParams.get('workspace'),width:raw.getBoundingClientRect().width,hubWidth:hub?.getBoundingClientRect().width});
  }
  requestAnimationFrame(sample);
 };requestAnimationFrame(sample);
});
try{
 // Freeze the real sequential public-render/refinement boundary in both source versions.
 for(const baseline of [true,false]){
  useBaselineApp=baseline;let release,arrived;holdRefinement=new Promise(done=>release=done);const reached=new Promise(done=>arrived=done);heldRefinement=arrived;
  const navigation=page.goto(base+'/?login=1',{waitUntil:'commit'});await navigation;await reached;
  await page.locator('[data-home-area=mothers]').waitFor({state:'attached'});
  const raw=await page.locator('[data-home-area=mothers]').evaluate(el=>({hidden:el.hidden,visible:Boolean(el.getClientRects().length),width:el.getBoundingClientRect().width,hubWidth:document.querySelector('#animated-hub').getBoundingClientRect().width,text:el.textContent.includes('Classrooms to nurture')}));
  records.push({case:'unrefined-public-render',source:baseline?'frozen-fb739eed':'candidate',...raw});
  assert.equal(raw.text,true);assert.equal(raw.visible,baseline);
  if(baseline)assert(raw.width>=raw.hubWidth-1,'Frozen screenshot-shaped full-width card must reproduce');
  await page.screenshot({path:resolve(out,baseline?'baseline-raw-mothers.png':'candidate-raw-mothers.png'),fullPage:true});
  release();holdRefinement=null;await page.locator('#circles-sign-in[open]').waitFor();
 }
 useBaselineApp=false;
 await page.goto(base+'/?login=1',{waitUntil:'domcontentloaded'});
 await page.locator('#circles-sign-in[open]').waitFor();
 await page.locator('#circles-sign-in-form input[name=uniqueid]').fill(featureSyntheticAccounts[0].login);
 const pin=page.locator('#circles-sign-in-form input[name=pin]');await pin.click();await pin.pressSequentially('2468');
 await page.locator('#circles-sign-in-form button[type=submit]').click();
 await page.waitForFunction(()=>new URL(location.href).searchParams.get('workspace')==='admin'&&document.querySelector('#circles-dashboard')?.getClientRects().length);
 await page.screenshot({path:resolve(out,'after-login-2048.png'),fullPage:true});
 const after=await page.evaluate(()=>({url:location.pathname+location.search,admin:document.body.dataset.circlesDashboardMode,rawFrames:window.__homeLayoutFrames,heroClass:document.querySelector('#learning-circles').className}));
 records.push({case:'real-native-pin-admin-transition',...after});
 assert.equal(after.admin,'admin');assert(after.heroClass.includes('circles-button-dashboard'));
 for(const width of [320,390,768,1024,1440,2048]){
  await page.setViewportSize({width,height:1100});
  await page.waitForTimeout(60);
  const layout=await page.evaluate(()=>{
   const dashboard=document.querySelector('#circles-dashboard'),b=dashboard.getBoundingClientRect(),hub=document.querySelector('#animated-hub');
   return {scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,dashboardWidth:b.width,dashboardHeight:b.height,publicHeroVisible:Boolean(hub.getClientRects().length)};
  });records.push({case:'signed-in-admin-layout',width,...layout});
  assert(layout.dashboardWidth>0&&layout.dashboardHeight>0,'Checked Admin dashboard must actually be visible');
  assert(layout.scrollWidth<=layout.clientWidth+1,'Horizontal overflow at '+width);assert.equal(layout.publicHeroVisible,false,'Admin must hide the public composition');
 }
 await page.setViewportSize({width:2048,height:1100});
 // Actual packaged native launcher and Home consumer, with the real synthetic native open handler.
 const pagesBefore=context.pages().length;
 await page.locator('[data-circles-academy-action]').filter({hasText:'Curriculum'}).click();
 await page.waitForURL(base+'/academy/admin/#administration/curriculum');
 await page.waitForFunction(()=>Boolean(window.M4L_CIRCLES_RETURN));await page.evaluate(()=>window.M4L_CIRCLES_RETURN.ready());
 assert.equal(context.pages().length,pagesBefore);assert.equal(page.isClosed(),false);
 const home=page.locator('[aria-label="Return to your Circles dashboard"]').first();
 assert.equal(await home.getAttribute('href'),base+'/?workspace=admin');
 await page.screenshot({path:resolve(out,'same-tab-curriculum.png'),fullPage:true});
 await home.click();await page.waitForURL(base+'/?workspace=admin');
 await page.waitForFunction(()=>document.body.dataset.circlesDashboardMode==='admin'&&document.querySelector('#circles-dashboard')?.getClientRects().length);
 assert.equal(context.pages().length,pagesBefore);assert.equal(page.isClosed(),false);
 records.push({case:'packaged-native-curriculum-home-roundtrip',sameTab:true,extraPages:0,returnedMode:'admin'});
 let release;holdBootstrap=new Promise(done=>release=done);let reached;const reachedPromise=new Promise(done=>reached=done);heldBootstrap=reached;
 const navigation=page.goto(base+'/?workspace=admin',{waitUntil:'domcontentloaded'});await navigation;await reachedPromise;
 assert.equal(await page.locator('#experience').isVisible(),false,'Dashboard request must hide unfinished public composition');
 assert.equal(await page.locator('#circles-dashboard-entry').isVisible(),true);
 await page.screenshot({path:resolve(out,'held-admin-entry.png'),fullPage:true});
 records.push({case:'slow-admin-bootstrap',privateAndPublicHomeHidden:true});
 release();holdBootstrap=null;
 await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-circles-home-state')&&document.body.dataset.circlesDashboardMode==='admin');
 assert.equal(await page.locator('#circles-dashboard').isVisible(),true);
 await page.screenshot({path:resolve(out,'checked-admin-entry.png'),fullPage:true});
 records.push({case:'checked-admin-entry',rawFrames:await page.evaluate(()=>window.__homeLayoutFrames)});
 failBootstrap=true;await page.goto(base+'/?workspace=admin',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.getAttribute('data-circles-home-state')==='error');
 assert.equal(await page.locator('#experience').isVisible(),false);
 assert.equal(await page.locator('#circles-dashboard-entry button').isVisible(),true);
 await page.screenshot({path:resolve(out,'failed-admin-entry.png'),fullPage:true});
 records.push({case:'failed-admin-bootstrap',homeHidden:true,retryVisible:true});failBootstrap=false;
 assert.deepEqual(errors,[],'Page errors');assert.equal(remoteAttempts,0);
}finally{
 await page.screenshot({path:resolve(out,'final-state.png'),fullPage:true}).catch(()=>{});
 await writeFile(resolve(out,'report.json'),JSON.stringify({commit:process.env.GITHUB_SHA,records,pageErrors:errors,nativeDenials,syntheticStudioFixtureCalls:serviceCalls,studioAuthorizationParityProved:false,requestCounts:requests.reduce((a,r)=>({...a,[r.path+':'+r.kind]:(a[r.path+':'+r.kind]||0)+1}),{}),blockedExternalOrigins:[...new Set(blocked)],remoteAttempts,hostedRequests:0,hostedDBReads:0,syntheticNativeSQLiteOnly:true},null,2));
 await browser.close();seed.close();globalThis.fetch=originalFetch;
}
