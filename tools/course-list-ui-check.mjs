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
const assets=resolve('.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'course-list-evidence');
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
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));

await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin===h.academyApiOrigin&&url.pathname.startsWith('/api/')||url.origin===base&&url.pathname.startsWith('/api/')){
  let kind='';try{kind=JSON.parse(url.searchParams.get('request')||req.postData()||'{}').kind||'';}catch{}
  requests.push({path:url.pathname,kind});

  // These visual regressions request full native responses. WebKit's route
  // interception cannot deliver a 304; HTTP conditional-cache parity is outside this test.
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
 const credential=await page.evaluate(()=>localStorage.getItem('m4l_account_token'));
 const request=async(action,input={})=>{const response=await native(new URL('/api/admin/platform/courses/'+action,base).href,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+credential,'Origin':base,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)});const value=await response.json();assert.equal(response.status,200,JSON.stringify({action,status:response.status,code:value.code,error:value.error}));return value;};
 const created=[];
 for(const [name,accessModel,startDate]of [['Older Z','PAID','2026-09-01'],['Latest B','PAID','2026-10-20'],['Latest A','PAID','2026-10-20'],['Free course','FREE','2026-10-25']]){
  const value=await request('save',{operationId:crypto.randomUUID(),details:{name,accessModel,startDate,endDate:'2026-10-31',timezone:'Africa/Johannesburg',categoryKey:'',weekdays:[],sessions:[],startTime:'',endTime:'',teacherId:'',zoomLink:''}});
  created.push({name,courseId:value.courseId,runId:value.runId});
 }
 await page.goto(base+'/academy/courses/manage/',{waitUntil:'domcontentloaded'});await page.locator('#course-workspace:not([hidden])').waitFor();await page.locator('#course-list .cm-course-list').waitFor();
 await page.locator('#course-status-filter').selectOption('DRAFT');
 const names=await page.locator('#course-list .cm-course-open').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label').replace(/^Open /,'')));
 assert.deepEqual(names,['Latest A','Latest B','Older Z','Feature synthetic Course A','Feature synthetic Course B','Free course']);
 records.push({case:'native-list-group-order',names,seededExistingCoursesRetained:true});
 const initialSettingsWrites=requests.filter(r=>r.path.endsWith('/courses/save')||r.path.endsWith('/courses/status')).length;
 await page.locator('#course-search').fill('Latest');await page.locator('#course-search').fill('');await page.locator('#course-status-filter').selectOption('');
 assert.equal(requests.filter(r=>r.path.endsWith('/courses/save')||r.path.endsWith('/courses/status')).length,initialSettingsWrites,'View changes cannot write settings');
 await page.locator('#course-status-filter').selectOption('DRAFT');
 const dateText=await page.locator('.cm-course-dates').allTextContents();assert(dateText.every(x=>!x.includes('2026-10-31')));
 const keys=await page.locator('#course-list .cm-course-open').evaluateAll(nodes=>nodes.map(n=>n.dataset.course+':'+n.dataset.run));assert.equal(new Set(keys).size,keys.length);
 for(const width of [390,768,1440,2048]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(50);
  const box=await page.locator('#course-list-panel').boundingBox();assert(box&&box.width>0&&box.width<=1061);
  const geometry=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,listClient:document.querySelector('#course-list').clientWidth,listScroll:document.querySelector('#course-list').scrollWidth}));
  assert(geometry.scroll<=geometry.client+1,'Course page must not overflow at '+width);
  records.push({case:'course-list-layout',width,panelWidth:box.width,...geometry});
  if(width===390||width===2048)await page.screenshot({path:resolve(out,'course-list-'+width+'.png'),fullPage:true});
 }
 const row=created.find(c=>c.name==='Latest A'),choice=model=>page.locator('[data-cm-action="list-policy"][data-model="'+model+'"][data-course="'+row.courseId+'"][data-run="'+row.runId+'"]');
 await choice('FREE').click();await page.locator('#course-dialog[open]').waitFor();assert.match(await page.locator('#course-dialog').textContent(),/Save this Course draft as Free/);await page.locator('[data-dialog-confirm]').click();
 await page.waitForFunction(({id,run})=>document.querySelector('[data-cm-action="list-policy"][data-model="FREE"][data-course="'+id+'"][data-run="'+run+'"]')?.checked,{id:row.courseId,run:row.runId});
 assert.equal(await choice('PAID').isChecked(),false);const checked=(await request('get',{courseId:row.courseId,runId:row.runId})).course;assert.equal(checked.details.accessModel,'FREE');assert.equal(checked.details.endDate,'2026-10-31');records.push({case:'actual-list-policy-save',savedModel:'FREE',endDateRetained:true});
 await page.waitForFunction(()=>!document.querySelector('#course-refresh').disabled);
 const archive=()=>page.locator('[data-cm-action="list-archive"][data-course="'+row.courseId+'"][data-run="'+row.runId+'"]');
 await archive().click();await page.locator('#course-dialog[open]').waitFor();await page.locator('[data-dialog-cancel]').click();assert.equal((await request('get',{courseId:row.courseId,runId:row.runId})).course.stage,'DRAFT');
 await archive().click();await page.locator('[data-dialog-confirm]').click();await page.waitForFunction(id=>!document.querySelector('#course-list .cm-course-open[data-course="'+id+'"]'),row.courseId);
 assert.equal((await request('get',{courseId:row.courseId,runId:row.runId})).course.stage,'ARCHIVED');await page.waitForFunction(()=>!document.querySelector('#course-refresh').disabled);await page.locator('#course-status-filter').selectOption('');assert.equal(await archive().isChecked(),true);assert.equal(await archive().isDisabled(),true);
 records.push({case:'actual-list-archive',confirmationRequired:true,stage:'ARCHIVED',showAllRetainsRow:true});
 await page.goto(base+'/academy/courses/manage/',{waitUntil:'domcontentloaded'});await page.locator('#course-list .cm-course-list').waitFor();assert.equal(await page.locator('#course-status-filter').inputValue(),'AVAILABLE');assert.equal(await page.locator('#course-list .cm-course-open[data-course="'+row.courseId+'"]').count(),0);
 await page.locator('#course-search').fill('No synthetic match');assert.match(await page.locator('#course-list').textContent(),/No Courses match/);records.push({case:'default-hidden-and-empty-view',archivedHidden:true});
 assert.deepEqual(errors,[]);assert.equal(remoteAttempts,0);
}finally{
 await page.screenshot({path:resolve(out,'final-state.png'),fullPage:true}).catch(()=>{});
 await writeFile(resolve(out,'report.json'),JSON.stringify({commit:process.env.GITHUB_SHA,browserEngine:browserName,records,pageErrors:errors,nativeDenials,syntheticStudioFixtureCalls:serviceCalls,studioAuthorizationParityProved:false,requestCounts:requests.reduce((a,r)=>({...a,[r.path+':'+r.kind]:(a[r.path+':'+r.kind]||0)+1}),{}),blockedExternalOrigins:[...new Set(blocked)],remoteAttempts,syntheticHeaderDateCalls,hostedRequests:0,hostedDBReads:0,syntheticNativeSQLiteOnly:true},null,2));
 await browser.close();seed.close();globalThis.fetch=originalFetch;
}
