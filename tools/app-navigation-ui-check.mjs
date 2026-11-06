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
const {chromium,webkit}=await import(pathToFileURL(resolve(process.env.REVIEW_BROWSER_MODULES,'node_modules/playwright/index.mjs')).href);
const assets=resolve('.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'app-navigation-evidence');
await mkdir(out,{recursive:true});
const h=hosting(),base=h.academyPortalOrigin,errors=[],records=[],requests=[],blocked=[],nativeDenials=[],serviceCalls=[];
const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,crypto.randomUUID()+crypto.randomUUID()]));
const seed=await prepareFeatureSeed({pin:'2468',secrets});
const core=emptyCompatibilityDatabase(sqliteD1(seed.databases.core),emptyShapes,{currentGrants:true}),admin=sqliteD1(seed.databases.admin),engine=splitEngine({core,admin});
const cfg=JSON.parse(await readFile('backend/wrangler.feature.jsonc','utf8'));
const bridgeSecret=crypto.randomUUID()+crypto.randomUUID();
const studioFixture={async fetch(url,init){const request=new Request(url,init),u=new URL(request.url);assert.equal(u.origin,h.studioBackendOrigin);assert.equal(request.method,'POST');assert(request.headers.get('X-Maktab-Signature'));serviceCalls.push(u.pathname);if(u.pathname==='/internal/academy/events')return Response.json({success:true});if(u.pathname==='/internal/studio/hub-summary')return Response.json({navigation:{academia:[],mothers:true,hifz:null,tafseer:'/studio/?view=collections&collection=tafseer'},websites:[],rights:{websites:[]}});throw Error('Unexpected synthetic Studio operation');}};
const env={...cfg.vars,...secrets,ACADEMY_TO_WEBSITE_SECRET:bridgeSecret,WEBSITE_PLATFORM_SERVICE:studioFixture,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ACADEMY_DB:sqliteD1(seed.databases.core),ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:{getByName(){return {read:async(...args)=>({result:await engine.read(...args)}),write:async(...args)=>({result:await engine.write(...args)})};}},AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},ALLOWED_ORIGINS:base};
const originalFetch=globalThis.fetch;let remoteAttempts=0,syntheticHeaderDateCalls=0;
globalThis.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url);if(url.href==='https://jamiat.org.za/'){syntheticHeaderDateCalls++;return new Response('<html><body>Synthetic date unavailable</body></html>',{headers:{'Content-Type':'text/html'}});}remoteAttempts++;throw Error('Unexpected server remote call');};
const browserName=process.env.HOME_LOGIN_BROWSER||'chromium';assert(['chromium','webkit'].includes(browserName));
const browser=await ({chromium,webkit}[browserName]).launch({headless:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
async function native(url,options={}){
 const response=await worker.fetch(new Request(url,options),env,{waitUntil(){throw Error('Unexpected background work');}});
 if(!response.ok){let value;try{value=await response.clone().json();}catch{}nativeDenials.push({path:new URL(url).pathname,status:response.status,code:value?.code||null});}
 return response;
}
const context=await browser.newContext({viewport:{width:2048,height:1100},reducedMotion:'reduce',serviceWorkers:'block'});
const opener=await context.newPage();
const opening=context.waitForEvent('page');await opener.evaluate(()=>{window.open('about:blank');});const page=await opening;
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin===h.academyApiOrigin&&url.pathname.startsWith('/api/')||url.origin===base&&url.pathname.startsWith('/api/')){
  let kind='';try{kind=JSON.parse(url.searchParams.get('request')||req.postData()||'{}').kind||'';}catch{}
  requests.push({path:url.pathname,kind});

  const headers={...req.headers()};delete headers['if-none-match'];
  const response=await native(url.href,{method:req.method(),headers,...(req.postData()?{body:req.postDataBuffer()}:{})});
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 }
 if(url.origin!==base){blocked.push(url.origin);return route.abort();}
 let name=url.pathname;if(name.endsWith('/'))name+='index.html';
 try{const file=resolve(assets,'.'+decodeURIComponent(name));assert(file.startsWith(assets+'/'));return route.fulfill({status:200,contentType:mime[extname(file)]||'application/octet-stream',body:await readFile(file)});}
 catch{return route.fulfill({status:404,body:'Not found'});}
});
try{
 await page.goto(base+'/?login=1',{waitUntil:'domcontentloaded'});await page.locator('#circles-sign-in[open]').waitFor();
 await page.locator('#circles-sign-in-form input[name=uniqueid]').fill(featureSyntheticAccounts[0].login);
 const pin=page.locator('#circles-sign-in-form input[name=pin]');await pin.click();await pin.pressSequentially('2468');await page.locator('#circles-sign-in-form button[type=submit]').click();
 await page.waitForFunction(()=>document.body.dataset.circlesDashboardMode==='admin');
 assert.equal(await page.evaluate(()=>Boolean(window.opener)),true);
 const count=context.pages().length;
 for(const label of ['Users','Curriculum','Library']){
  const tool=page.locator('#circles-dashboard [data-circles-academy-action]').filter({hasText:label}).first();await tool.click();
  await page.waitForURL(url=>url.origin===base&&url.pathname!=='/');
  await page.waitForFunction(()=>Boolean(window.M4L_CIRCLES_RETURN));await page.evaluate(()=>window.M4L_CIRCLES_RETURN.ready());
  assert.equal(context.pages().length,count,'Native '+label+' cannot open another tab');assert.equal(page.isClosed(),false);
  const home=page.locator('[aria-label="Return to your Circles dashboard"]').first();assert.equal(await home.getAttribute('href'),base+'/?workspace=admin');
  if(label==='Library'){
   const anchors=await page.locator('[data-pdf-reader],#al-open').evaluateAll(nodes=>nodes.map(n=>({target:n.getAttribute('target'),href:n.getAttribute('href')})));
   assert(anchors.every(a=>a.target!=='_blank'),'Internal PDF reader cannot open another tab');
  }
  await page.screenshot({path:resolve(out,'native-'+label.toLowerCase()+'.png'),fullPage:true});
  const destination=await page.evaluate(()=>location.pathname+location.search+location.hash);
  await home.click();await page.waitForURL(base+'/?workspace=admin');
  await page.waitForFunction(()=>document.body.dataset.circlesDashboardMode==='admin'&&document.querySelector('#circles-dashboard')?.getClientRects().length);
  assert.equal(context.pages().length,count);assert.equal(page.isClosed(),false);assert.equal(opener.isClosed(),false);
  records.push({case:'native-same-tab-home',tool:label,destination,extraPages:0,openerRetained:true,homeMode:'admin'});
 }
 assert.deepEqual(errors,[]);assert.equal(remoteAttempts,0);
}finally{
 await page.screenshot({path:resolve(out,'final-state.png'),fullPage:true}).catch(()=>{});
 await writeFile(resolve(out,'report.json'),JSON.stringify({commit:process.env.GITHUB_SHA,browserEngine:browserName,records,pageErrors:errors,nativeDenials,syntheticStudioFixtureCalls:serviceCalls,studioAuthorizationParityProved:false,legacyHifzSameTabProved:false,reverseStudioToAcademySameTabProved:false,requestCounts:requests.reduce((a,r)=>({...a,[r.path+':'+r.kind]:(a[r.path+':'+r.kind]||0)+1}),{}),blockedExternalOrigins:[...new Set(blocked)],remoteAttempts,syntheticHeaderDateCalls,hostedRequests:0,hostedDBReads:0,syntheticNativeSQLiteOnly:true},null,2));
 await browser.close();seed.close();globalThis.fetch=originalFetch;
}
