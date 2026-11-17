import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const ORIGIN='https://maktabhelper.app',HOST='maktabhelper.app';
const MANIFEST='055eee5ec812cb034ab3d618276749b7cecccf9ec5e19caf9a03d770fa4bc91f';
const COMMON='0229b34114e9a4c0b130d44b5f5570cb7de09b53424a32f12856f5ba2706e3d4';
const ID='feature-test-admin',ACCOUNT='feature-synthetic-global';
const A='__Secure-uaa_a',R='__Host-uaa_r',HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,RUN=/^[1-9][0-9]{0,19}$/;
const opaque=s=>typeof s==='string'&&/^[-A-Za-z0-9_]{43}$/.test(s);
const tuple=['accountId','sessionId','parentId','browserId','browserGeneration','credentialEpoch','securityVersion','unlockGeneration','originalSignedAtMs','originalExpiresAtMs','lastForegroundRefreshMs'];
const report={schema:'ACADEMY_FEATURE_BROWSER_ACCEPTANCE_SAFE_V1',status:'FAIL',AI:'OFF',productionAndLegacyTouched:false,SQLRequests:0,CFRequests:0,githubGETRequests:0,applicationRequests:0,assetRequests:0,http503Count:0,blockedRequests:0,accountChecks:0,loginPOSTs:0,refreshPOSTs:0,statuses:[],checks:{},privateValuesOrFingerprintsReported:false,browserClosed:false};
const fail=code=>{throw Object.assign(Error(code),{safeCode:code});};
const check=(ok,code)=>{if(!ok)fail(code);};
const sha=b=>createHash('sha256').update(b).digest('hex');
let inputs,temp,evidence,privateDir;

async function bytes(p,max=262144){
 const s=await lstat(p);
 check(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'FILE_SHAPE');
 return readFile(p);
}

async function json(p,max){
 try{return JSON.parse((await bytes(p,max)).toString('utf8'));}
 catch(e){if(e.safeCode)throw e;fail('JSON_SHAPE');}
}

async function directory(p){
 await mkdir(p,{recursive:true,mode:0o700});
 check(await realpath(p)===p,'DIRECTORY_SCOPE');
}

async function context(){
 check(process.platform==='linux'&&process.versions.node==='24.22.1','NODE_PIN');
 check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.NODE_DEBUG&&!process.env.DEBUG&&!process.env.PWDEBUG&&!process.env.DEBUG_FILE&&!process.env.CLOUDFLARE_API_TOKEN,'ENV_SCOPE');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true','CI_SCOPE');
 inputs=(await json(process.env.GITHUB_EVENT_PATH,1048576)).inputs||{};
 check(inputs.modern_stage==='browser'&&!['true',true].includes(inputs.credential_preflight)&&!['true',true].includes(inputs.check_only),'BROWSER_STAGE_ONLY');
 check(HEX40.test(inputs.expected_sha||'')&&inputs.expected_sha===process.env.GITHUB_SHA&&RUN.test(process.env.GITHUB_RUN_ID||''),'SOURCE_PIN');
 check(RUN.test(inputs.upload_run_id||'')&&HEX64.test(inputs.upload_receipt_sha256||'')&&HEX40.test(inputs.browser_activation_source_sha||'')&&UUID.test(inputs.browser_api_version||'')&&UUID.test(inputs.browser_coordinator_version||''),'ACTIVATION_INPUTS');
 check(inputs.package_manifest_sha256===MANIFEST,'PACKAGE_PIN');
 temp=await realpath(process.env.RUNNER_TEMP);
 evidence=join(temp,'academy-feature-browser-evidence');
 privateDir=join(temp,'academy-feature-browser-private');
 await directory(evidence);
 report.sourceSHA=process.env.GITHUB_SHA;
 report.runId=process.env.GITHUB_RUN_ID;
}

async function selectedReceipt(){
 const b=await bytes(join(temp,'academy-feature-browser-activation/sanitized.json'),65536);
 check(sha(b)===inputs.upload_receipt_sha256,'ACTIVATION_RECEIPT_PIN');
 let r;
 try{r=JSON.parse(b.toString('utf8'));}
 catch{fail('ACTIVATION_RECEIPT_JSON');}
 check(r.schema==='ACADEMY_FEATURE_RELEASE_SAFE_RESULT_V1'&&r.stage==='activate'&&r.status==='PASS_TWO_REVIEWED_VERSIONS_ACTIVE'&&!r.errorCategory,'ACTIVATION_RECEIPT_STATUS');
 check(r.sourceSHA===inputs.browser_activation_source_sha&&r.runId===inputs.upload_run_id&&r.packageManifestSHA256===MANIFEST&&r.commonSHA256===COMMON&&r.AI==='OFF'&&r.childDelivery==='OFF','ACTIVATION_RECEIPT_CONTEXT');
 check(r.SQLRequests===0&&r.applicationRequests===0&&r.CLIInvocations===0&&r.activationTransport==='OFFICIAL_REST_EXPLICIT_VERSION'&&r.POSTRequests===2&&Array.isArray(r.POSTOutcomes)&&r.POSTOutcomes.length===2&&['coordinator','api'].every(role=>r.POSTOutcomes.some(p=>p.role===role&&p.operation==='deployment'&&p.confirmed===true&&p.apiSuccess===true&&Number.isInteger(p.HTTPStatus)&&p.HTTPStatus>=200&&p.HTTPStatus<300))&&r.journalApprovalAndActualReadbackVerified===true&&r.privateNativeSelectionEqualAndShapeValid===true&&r.nativeLoginRefreshLogoutAcceptance==='NOT_RUN','ACTIVATION_RECEIPT_GATES');
 check(Array.isArray(r.activationAttempts)&&r.activationAttempts.length===2&&r.activationAttempts.some(v=>v.name==='feature_worker'&&v.id===inputs.browser_api_version)&&r.activationAttempts.some(v=>v.name==='academy-feature-split-coordinator'&&v.id===inputs.browser_coordinator_version),'ACTIVATED_PAIR');
 report.activationSourceSHA=r.sourceSHA;
 report.activationRunId=r.runId;
 report.apiVersion=inputs.browser_api_version;
 report.coordinatorVersion=inputs.browser_coordinator_version;
 report.activationReceiptSHA256=inputs.upload_receipt_sha256;
 report.packageManifestSHA256=MANIFEST;
 return r;
}

async function github(path){
 check(process.env.GITHUB_TOKEN&&++report.githubGETRequests<=2,'GITHUB_CONTEXT');
 let r;
 try{
  r=await fetch('https://api.github.com/repos/MaktabForlife/Academy/'+path,{
   headers:{
    Authorization:'Bearer '+process.env.GITHUB_TOKEN,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2026-03-10'
   },
   redirect:'error',
   signal:AbortSignal.timeout(20000)
  });
 }catch{fail('GITHUB_READ_FAILED');}
 check(r.ok,'GITHUB_READ_STATUS');
 const reader=r.body.getReader(),parts=[];
 let size=0;
 for(;;){
  const p=await reader.read();
  if(p.done)break;
  size+=p.value.byteLength;
  if(size>1048576){
   await reader.cancel();
   fail('GITHUB_READ_SIZE');
  }
  parts.push(p.value);
 }
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch{fail('GITHUB_READ_JSON');}
}

async function verify(){
 check(!process.env.FEATURE_TEST_ADMIN_PIN,'PIN_NOT_FOR_GATE');
 const receipt=await selectedReceipt();
 const run=await github('actions/runs/'+receipt.runId);
 check(run.workflow_id===409340312&&run.event==='workflow_dispatch'&&run.head_branch==='feature-preview'&&run.head_sha===receipt.sourceSHA&&run.status==='completed'&&run.conclusion==='success','ACTIVATION_RUN_ATTESTATION');
 const commit=await github('commits/'+process.env.GITHUB_SHA);
 check(commit.sha===process.env.GITHUB_SHA&&commit.parents?.length===1&&commit.parents[0].sha===receipt.sourceSHA,'ONE_ADDITIVE_PARENT_REQUIRED');
 await directory(privateDir);
 await writeFile(join(privateDir,'gate.json'),JSON.stringify({
  schema:'ACADEMY_FEATURE_BROWSER_GATE_V1',
  sourceSHA:process.env.GITHUB_SHA,
  activationReceiptSHA256:inputs.upload_receipt_sha256,
  activationSourceSHA:receipt.sourceSHA,
  runAttested:true,
  oneParentAttested:true
 })+'\n',{mode:0o600,flag:'wx'});
 report.status='PASS_RECEIPT_AND_ONE_PARENT_GATE_ONLY';
}

function display(s){
 check(s?.app==='academy'&&s.accountId===ACCOUNT&&['accountId','sessionId','parentId','browserId'].every(k=>typeof s[k]==='string'&&s[k].length>0)&&tuple.filter(k=>!['accountId','sessionId','parentId','browserId'].includes(k)).every(k=>Number.isSafeInteger(s[k])&&s[k]>=0),'DISPLAY_SHAPE');
 check(Number.isSafeInteger(s.serverNowMs)&&s.originalExpiresAtMs>s.serverNowMs&&s.originalExpiresAtMs-s.originalSignedAtMs<=604800000&&s.lastForegroundRefreshMs>=s.originalSignedAtMs&&s.serverNowMs-s.lastForegroundRefreshMs<5400000,'DISPLAY_LIFETIMES');
 return Object.fromEntries([...tuple,'serverNowMs'].map(k=>[k,s[k]]));
}

function same(a,b){
 check(tuple.every(k=>a[k]===b[k]),'IDENTITY_OR_DEADLINE_CHANGED');
}

function cookieDirectives(headers,clearing=false){
 for(const name of [A,R]){
  const found=headers.filter(v=>v.startsWith(name+'='));
  check(found.length===1,'COOKIE_DIRECTIVE_COUNT');
  const parts=found[0].split(';');
  const attrs=new Map(parts.slice(1).map(x=>{
   const i=x.indexOf('=');
   return i<0
    ?[x.trim().toLowerCase(),true]
    :[x.slice(0,i).trim().toLowerCase(),x.slice(i+1).trim()];
  }));
  check(attrs.get('secure')===true&&attrs.get('httponly')===true&&attrs.get('path')==='/'&&String(attrs.get('samesite')).toLowerCase()==='lax','COOKIE_FLAGS');
  check(name===A?String(attrs.get('domain')||'').replace(/^\./,'')===HOST:!attrs.has('domain'),'COOKIE_DOMAIN');
  const age=String(attrs.get('max-age'));
  check(/^[0-9]+$/.test(age)&&(clearing?Number(age)===0:Number(age)>0&&Number(age)<=(name===A?900:604800)),'COOKIE_MAX_AGE');
 }
}

async function pair(ctx){
 const all=await ctx.cookies(ORIGIN),p=all.filter(c=>[A,R].includes(c.name));
 check(p.length===2&&p.some(c=>c.name===A)&&p.some(c=>c.name===R),'COOKIE_PAIR');
 for(const c of p){
  check(c.secure&&c.httpOnly&&c.path==='/'&&c.sameSite==='Lax'&&c.expires>Date.now()/1000&&(c.name===A?c.domain.replace(/^\./,'')===HOST:c.domain===HOST),'COOKIE_JAR_SCOPE');
 }
 return p;
}

function claims(p,s){
 const raw=p.find(c=>c.name===A).value;
 check(raw.length<=3800&&raw.split('.').length===3,'ACCESS_SHAPE');
 let h,c;
 try{
  h=JSON.parse(Buffer.from(raw.split('.')[0],'base64url'));
  c=JSON.parse(Buffer.from(raw.split('.')[1],'base64url'));
 }catch{fail('ACCESS_SHAPE');}
 check(h.alg==='ES256'&&h.typ==='uaa-access+jwt'&&c.iss===ORIGIN&&c.aud==='urn:ummabbadacademy:academy:api'&&c.ver===1,'ACCESS_ISSUER_AUDIENCE');
 for(const [claim,key] of [
  ['sub','accountId'],['sid','sessionId'],['psid','parentId'],
  ['bsid','browserId'],['bv','browserGeneration'],['ce','credentialEpoch'],
  ['pv','securityVersion'],['ue','unlockGeneration']
 ]){
  check(c[claim]===s[key],'ACCESS_DISPLAY_MISMATCH');
 }
 check(c.s_iat*1000===s.originalSignedAtMs&&c.s_exp*1000===s.originalExpiresAtMs&&Number.isSafeInteger(c.iat)&&Number.isSafeInteger(c.exp)&&c.exp-c.iat>0&&c.exp-c.iat<=900&&c.exp<=c.s_exp&&c.s_exp-c.s_iat<=604800&&c.exp>Date.now()/1000+15,'ACCESS_LIFETIMES');
 check(p.find(x=>x.name===R).expires<=c.s_exp+2,'REFRESH_ABSOLUTE_EXPIRY');
 return c.exp;
}

async function browserJourney(){
 check(!process.env.GITHUB_TOKEN&&!process.env.GH_TOKEN,'NO_GITHUB_CREDENTIAL_IN_BROWSER');
 let pin=process.env.FEATURE_TEST_ADMIN_PIN;
 delete process.env.FEATURE_TEST_ADMIN_PIN;
 check(typeof pin==='string'&&/^[0-9]{4}$/.test(pin),'FOUR_DIGIT_PROTECTED_PIN');
 const gate=await json(join(privateDir,'gate.json'),4096);
 await selectedReceipt();
 check(gate.schema==='ACADEMY_FEATURE_BROWSER_GATE_V1'&&gate.sourceSHA===process.env.GITHUB_SHA&&gate.activationReceiptSHA256===inputs.upload_receipt_sha256&&gate.activationSourceSHA===inputs.browser_activation_source_sha&&gate.runAttested===true&&gate.oneParentAttested===true,'RECEIPT_GATE_REQUIRED');
 const tools=join(temp,'academy-feature-browser-tools');
 const req=createRequire(join(tools,'package.json'));
 check(req('playwright/package.json').version==='1.58.2'&&req('playwright-core/package.json').version==='1.58.2','PLAYWRIGHT_PIN');
 const bs=await json(join(tools,'node_modules/playwright-core/browsers.json'),65536);
 check(['chromium','chromium-headless-shell'].every(n=>bs.browsers.some(b=>b.name===n&&b.revision==='1208'&&b.browserVersion==='145.0.7632.6')),'CHROMIUM_PIN');
 check(process.env.PLAYWRIGHT_BROWSERS_PATH===join(temp,'academy-feature-browser-binaries'),'BROWSER_PATH');
 const {chromium}=req('playwright');
 let browser,phase='public',fatal=null,login=null,csrf='',logout=null,refresh=null,specimen=null;
 const native={},contexts=[],jobs=new Set();
 const requestMeta=new WeakMap(),loginTimes=[],jwtTimes=[];
 const maxRolling={login:0,csrfRefresh:0};
 report.maxRequestsInRolling60Seconds=maxRolling;
 const stop=c=>{if(!fatal)fatal=c;};
 const guard=()=>{if(fatal)fail(fatal);};
 const labels=new Map([
  ['/api/account/check','check'],
  ['/auth/v110/login','login'],
  ['/auth/v110/context','context'],
  ['/api/account/session','session'],
  ['/auth/v110/csrf','csrf'],
  ['/auth/v110/refresh','refresh'],
  ['/auth/v110/logout-csrf','logout-csrf'],
  ['/auth/v110/logout','logout']
 ]);
 const jwtPaths=new Set([
  '/auth/v110/csrf','/auth/v110/refresh',
  '/auth/v110/logout-csrf','/auth/v110/logout'
 ]);
 const postPaths=new Set([
  '/api/account/check','/auth/v110/login','/api/account/session',
  '/auth/v110/refresh','/auth/v110/logout','/api/academy/hub/open'
 ]);

 function tick(list,max,key){
  const now=Date.now();
  while(list.length&&list[0]<=now-60000)list.shift();
  check(list.length<max,'RATE_BUDGET_STOP');
  list.push(now);
  maxRolling[key]=Math.max(maxRolling[key],list.length);
 }

 async function pace(){
  for(;;){
   guard();
   const now=Date.now();
   const ends=[
    loginTimes.length>=5?loginTimes[0]+60050:0,
    jwtTimes.length>=9?jwtTimes[0]+60050:0
   ];
   const ms=Math.max(...ends)-now;
   if(ms<=0)break;
   await delay(Math.min(ms,1000));
  }
 }

 async function wait(test,code,ms=20000){
  const end=Date.now()+ms;
  while(Date.now()<end){
   guard();
   if(await test())return;
   await delay(50);
  }
  guard();
  fail(code);
 }

 async function observe(response){
  const request=response.request(),m=requestMeta.get(request);
  if(!m)return;
  const status=response.status(),label=labels.get(m.path);
  if(status===503)report.http503Count++;
  if(label||status===503)report.statuses.push({phase:m.phase,endpoint:label||(m.application?'other-application':'asset'),status,stageHeader:null});

  if(m.kind==='replay'&&label){
   const h=await request.allHeaders();
   const parts=new Map(String(h.cookie||'').split(';').map(v=>{
    const i=v.indexOf('=');
    return [v.slice(0,i).trim(),v.slice(i+1).trim()];
   }));
   check(specimen&&[A,R].every(n=>parts.get(n)===specimen.find(c=>c.name===n).value),'REPLAY_MUST_SEND_CURRENT_PAIR');
   check(status===401,'REPLAY_NOT_401');
   return;
  }

  if(m.path==='/auth/v110/context'&&['public','enter','account'].includes(m.phase)){
   check(status===401,'UNSIGNED_CONTEXT_UNEXPECTED');
   return;
  }

  if(m.path==='/auth/v110/context'&&m.phase==='signed-out'){
   check(status===401,'SIGNED_OUT_CONTEXT_UNEXPECTED');
   report.checks.signedOutContext401=true;
   return;
  }

  if(m.application)check(status>=200&&status<300,'APPLICATION_HTTP_UNEXPECTED');
  else if(['script','stylesheet','document'].includes(request.resourceType())){
   check(status>=200&&status<400,'ASSET_HTTP_UNEXPECTED');
  }

  if(!label)return;
  check(status===200,'AUTH_HTTP_UNEXPECTED');

  if(label==='logout'){
   cookieDirectives(
    (await response.headersArray())
     .filter(h=>h.name.toLowerCase()==='set-cookie')
     .map(h=>h.value),
    true
   );
  }

  if(['csrf','logout-csrf','check','login','context','session','refresh','logout'].includes(label)){
   const b=await response.body();
   check(b.length<=262144,'AUTH_RESPONSE_SIZE');
   let value;
   try{value=JSON.parse(b.toString('utf8'));}
   catch{fail('AUTH_RESPONSE_JSON');}
   if(opaque(value.csrf))csrf=value.csrf;

   if(label==='check'){
    check(value.success===true&&value.account?.pinsetup===true,'EXISTING_PIN_SETUP_REQUIRED');
    report.checks.accountCheck=true;
   }

   if(label==='login'){
    check(value.success===true&&value.cookieSession===true&&value.account?.accountId===ACCOUNT&&typeof value.account?.uniqueid==='string'&&value.account.uniqueid.trim().toUpperCase()===ID.toUpperCase()&&typeof value.sessionKey==='string'&&value.sessionKey.startsWith('uaa-session:')&&opaque(value.csrf),'LOGIN_NATIVE_CONTRACT');
    login={sessionKey:value.sessionKey,display:display(value.browserContext)};
    cookieDirectives(
     (await response.headersArray())
      .filter(h=>h.name.toLowerCase()==='set-cookie')
      .map(h=>h.value)
    );
    report.checks.genuineLogin=true;
   }

   if(label==='context'){
    native[m.phase]??={};
    native[m.phase].display=display(value.session);
   }

   if(label==='session'){
    const headers=await request.allHeaders();
    check(value.success===true&&value.account?.accountId===ACCOUNT&&typeof value.account?.uniqueid==='string'&&value.account.uniqueid.trim().toUpperCase()===ID.toUpperCase()&&request.postData()==='{}'&&typeof headers.authorization==='string'&&headers.authorization.startsWith('Bearer uaa-')&&opaque(headers['x-uaa-csrf']),'NATIVE_SESSION_CONTRACT');
    native[m.phase]??={};
    native[m.phase].selector=headers.authorization;
    native[m.phase].csrf=headers['x-uaa-csrf'];
    native[m.phase].session=true;
   }

   if(label==='refresh'){
    check(value.refreshed===true,'REFRESH_CONTRACT');
    refresh=display(value.browserContext);
    cookieDirectives(
     (await response.headersArray())
      .filter(h=>h.name.toLowerCase()==='set-cookie')
      .map(h=>h.value)
    );
    report.checks.refresh=true;
   }

   if(label==='logout'){
    check(value.success===true&&value.cancelled===true,'LOGOUT_CONTRACT');
    logout=true;
    report.checks.nativeLogout=true;
   }
  }
 }

 async function make(kind){
  const ctx=await browser.newContext({
   serviceWorkers:'block',
   acceptDownloads:false
  });
  contexts.push(ctx);

  await ctx.routeWebSocket('**/*',ws=>{
   stop('WEBSOCKET_REFUSED');
   ws.close();
  });

  ctx.on('response',response=>{
   let task;
   task=observe(response)
    .catch(e=>stop(e.safeCode||'RESPONSE_OBSERVATION_STOP'))
    .finally(()=>jobs.delete(task));
   jobs.add(task);
  });

  await ctx.route('**/*',async route=>{
   const r=route.request();
   try{
    guard();
    report.lastObservedPhase=phase;
    const u=new URL(r.url());
    check(u.origin===ORIGIN&&!u.username&&!u.password,'ORIGIN_SCOPE');
    const path=u.pathname,method=r.method();

    if(kind==='replay'&&r.resourceType()==='script'){
     report.blockedRequests++;
     await route.abort();
     return;
    }

    check(!/\/(?:setup-pin|setup\/(?:initialize|install)|provision|ai|transcription|jobs)(?:\/|$)/i.test(path),'FORBIDDEN_ROUTE');
    const application=path.startsWith('/api/')||labels.has(path);

    if(kind==='replay'&&application){
     check(
      (phase==='replay-context'&&path==='/auth/v110/context'&&method==='GET')||
      (phase==='replay-session'&&path==='/api/account/session'&&method==='POST')||
      (phase==='replay-refresh'&&path==='/auth/v110/refresh'&&method==='POST'),
      'REPLAY_ROUTE'
     );
    }

    check(['GET','HEAD'].includes(method)||method==='POST'&&postPaths.has(path),'WRITE_ROUTE_REFUSED');

    if(path==='/api/account/check'){
     check(phase==='account'&&++report.accountChecks===1,'ONE_ACCOUNT_CHECK');
     const b=JSON.parse(r.postData()||'null');
     check(Object.keys(b).length===1&&b.uniqueid===ID,'ACCOUNT_CHECK_BODY');
     tick(loginTimes,5,'login');
    }

    if(path==='/auth/v110/login'){
     check(phase==='login'&&++report.loginPOSTs===1,'ONE_PIN_SUBMISSION');
     const b=JSON.parse(r.postData()||'null');
     check(Object.keys(b).length===2&&b.uniqueid===ID&&b.pin===pin,'PIN_SUBMISSION_BODY');
     tick(loginTimes,5,'login');
    }

    if(path==='/auth/v110/refresh'){
     check(
      (kind==='main'&&phase==='refresh'&&report.refreshPOSTs===0)||
      (kind==='replay'&&phase==='replay-refresh'&&report.refreshPOSTs===1),
      'UNPLANNED_REFRESH_BLOCKED'
     );
     report.refreshPOSTs++;
     check(r.postData()==='{}','REFRESH_BODY');
    }

    if(jwtPaths.has(path))tick(jwtTimes,10,'csrfRefresh');
    requestMeta.set(r,{phase,path,kind,application});
    if(application)report.applicationRequests++;
    else report.assetRequests++;
    check(report.applicationRequests<=96&&report.assetRequests<=512,'REQUEST_BUDGET_STOP');
    await route.continue();
   }catch(e){
    report.blockedRequests++;
    stop(e.safeCode||'REQUEST_SCOPE_STOP');
    try{await route.abort();}catch{}
   }
  });

  return ctx;
 }

 async function ready(page,key){
  await wait(async()=>Boolean(
   native[key]?.display&&
   native[key]?.session&&
   await page.evaluate(()=>
    document.body.classList.contains('academy-signed-in')&&
    document.documentElement.dataset.uaaV110State==='ready'
   )&&
   await page.locator('#academy-sign-out').isVisible()
  ),'NATIVE_PAGE_NOT_CHECKED');
  guard();
  return native[key];
 }

 async function raw(page,path,method,headers={}){
  const result=await page.evaluate(async({path,method,headers})=>{
   try{
    const r=await fetch(path,{
     method,
     headers,
     credentials:'same-origin',
     cache:'no-store',
     redirect:'error',
     ...(method==='POST'?{body:'{}'}:{})
    });
    await r.arrayBuffer();
    return {status:r.status};
   }catch{return {transportFailed:true};}
  },{path,method,headers});
  guard();
  check(!result.transportFailed,'BROWSER_TRANSPORT_STOP');
  return result.status;
 }

 const journeyTimer=setTimeout(()=>{
  stop('JOURNEY_DEADLINE');
  if(browser)void browser.close().catch(()=>{});
 },300000);
 journeyTimer.unref();
 try{
  browser=await chromium.launch({headless:true});
  check(browser.version()==='145.0.7632.6','RUNNING_BROWSER_PIN');
  report.chromiumVersion=browser.version();
  report.playwrightVersion='1.58.2';

  const ctx=await make('main'),page=await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
  guard();

  phase='enter';
  const link=page.getByRole('link',{name:'Open Academy',exact:true});
  check(await link.count()===1,'OPEN_ACADEMY_LINK');
  check(new URL(await link.getAttribute('href'),ORIGIN).href===ORIGIN+'/academy/?signin=1#login','OPEN_ACADEMY_TARGET');
  await link.click();
  await page.waitForURL(u=>u.origin===ORIGIN&&u.pathname==='/academy/');

  const form=page.locator('#login-preview');
  const gateButton=page.getByRole('button',{name:'Sign in at Academy',exact:true});
  await wait(async()=>await form.isVisible()||await gateButton.isVisible(),'LOGIN_GATE_NOT_VISIBLE');
  if(!await form.isVisible())await gateButton.click();
  await form.waitFor({state:'visible'});

  const id=form.locator('#demo-username'),pinField=form.locator('#demo-pin');
  check(await id.count()===1&&await pinField.count()===1&&await pinField.inputValue()==='','NATIVE_FORM');
  await id.fill(ID);

  phase='account';
  await form.locator('button[type=submit]').click();
  await wait(()=>report.checks.accountCheck===true,'ACCOUNT_CHECK_NOT_OBSERVED');
  await wait(async()=>await pinField.isEnabled(),'PIN_NOT_READY');
  await pace();

  phase='login';
  await pinField.pressSequentially(pin,{delay:70});
  await wait(()=>Boolean(login),'LOGIN_NOT_OBSERVED');
  pin='';

  await wait(async()=>
   await page.evaluate(()=>document.body.classList.contains('academy-signed-in')&&document.documentElement.dataset.uaaV110State==='ready')&&
   await page.locator('#academy-sign-out').isVisible(),
   'LOGIN_NATIVE_UI_NOT_READY'
  );

  const first=await pair(ctx);
  claims(first,login.display);

  phase='native-before';
  await page.goto(ORIGIN+'/academy/#timetable/learn',{waitUntil:'domcontentloaded'});
  const before=await ready(page,phase);
  same(login.display,before.display);
  report.checks.actualNativeSelectorAndCSRFCaptured=true;
  report.checks.contextAndNativePageBefore=true;

  await pace();
  phase='refresh';
  check(opaque(before.csrf),'ACTUAL_NATIVE_CSRF');
  check(await raw(page,'/auth/v110/refresh','POST',{
   'Content-Type':'application/json',
   'X-UAA-CSRF':before.csrf
  })===200,'REFRESH_HTTP');
  await wait(()=>Boolean(refresh),'REFRESH_NOT_OBSERVED');
  same(before.display,refresh);

  phase='native-after';
  await page.reload({waitUntil:'domcontentloaded'});
  const after=await ready(page,phase);
  same(before.display,after.display);

  const current=await pair(ctx);
  specimen=current;
  const currentExpiry=claims(current,after.display);
  check([A,R].every(n=>current.find(c=>c.name===n).value!==first.find(c=>c.name===n).value),'COOKIES_DID_NOT_ROTATE');
  report.checks.currentRotatedUnexpiredPair=true;
  report.checks.identityEpochBrowserAndDeadlinesPreserved=true;
  report.checks.lastForegroundUnchanged=true;
  report.checks.contextAndNativePageAfter=true;

  await pace();
  check(currentExpiry>Date.now()/1000+15,'CURRENT_PAIR_EXPIRED_BEFORE_LOGOUT');
  phase='logout';
  await page.locator('#academy-sign-out').click();
  await wait(()=>logout===true,'NATIVE_LOGOUT_NOT_OBSERVED');
  check(!(await ctx.cookies(ORIGIN)).some(c=>[A,R].includes(c.name)),'COOKIE_CLEAR_FAILED');

  phase='signed-out';
  await page.reload({waitUntil:'domcontentloaded'});
  await wait(async()=>
   await page.evaluate(()=>
    !document.body.classList.contains('academy-signed-in')&&
    !localStorage.getItem('m4l_account_token')
   )&&
   !await page.locator('#academy-sign-out').isVisible(),
   'NATIVE_PRIVACY_NOT_CLEARED'
  );
  report.checks.signedOutPrivacyAndReload=true;
  await wait(()=>report.checks.signedOutContext401===true,'SIGNED_OUT_CONTEXT_NOT_OBSERVED');
  while(jobs.size){
   await Promise.all([...jobs]);
   guard();
  }
  await ctx.close();

  const replay=await make('replay'),probe=await replay.newPage();
  phase='replay-document';
  await probe.goto(ORIGIN+'/js/m4l-config-root-only-v1.js',{waitUntil:'domcontentloaded'});
  check(await probe.evaluate(()=>
   ['text/javascript','application/javascript'].includes(document.contentType)&&
   Function.prototype.toString.call(window.fetch).includes('[native code]')
  ),'REPLAY_DOCUMENT_NOT_NATIVE');

  const restoreCurrent=()=>replay.addCookies(current.map(c=>({
   name:c.name,
   value:c.value,
   domain:c.domain,
   path:c.path,
   expires:c.expires,
   httpOnly:c.httpOnly,
   secure:c.secure,
   sameSite:c.sameSite
  })));

  await restoreCurrent();
  check(currentExpiry>Date.now()/1000+15,'CURRENT_PAIR_EXPIRED_BEFORE_REPLAY');
  phase='replay-context';
  check(await raw(probe,'/auth/v110/context','GET')===401,'CURRENT_CONTEXT_NOT_REVOKED');

  await restoreCurrent();
  check(currentExpiry>Date.now()/1000+15,'CURRENT_PAIR_EXPIRED_BEFORE_SESSION_REPLAY');
  phase='replay-session';
  check(await raw(probe,'/api/account/session','POST',{
   'Content-Type':'application/json',
   Authorization:after.selector,
   'X-UAA-CSRF':after.csrf
  })===401,'CURRENT_NATIVE_SESSION_NOT_REVOKED');

  await pace();
  check(currentExpiry>Date.now()/1000+15,'CURRENT_PAIR_EXPIRED_BEFORE_REFRESH_REPLAY');
  await restoreCurrent();
  phase='replay-refresh';
  check(await raw(probe,'/auth/v110/refresh','POST',{
   'Content-Type':'application/json',
   'X-UAA-CSRF':after.csrf
  })===401,'CURRENT_REFRESH_NOT_REVOKED');

  while(jobs.size){
   await Promise.all([...jobs]);
   guard();
  }

  report.checks.sameCurrentPairRejectedAtAllThreeEndpoints=true;
  check(report.loginPOSTs===1&&report.refreshPOSTs===2,'ONE_JOURNEY_COUNTS');
  report.maxRequestsInRolling60Seconds=maxRolling;
  report.rateLimits={
   nativeLogin:{limit:5,seconds:60},
   csrfRefresh:{limit:10,seconds:60}
  };
  report.httpRefreshForeground=false;
  report.idleExtensionProven=false;
  report.checks.receiptBoundActivation=true;
  guard();
  report.status='PASS_GENUINE_LOGIN_REFRESH_LOGOUT_CURRENT_CREDENTIAL_REJECTION';
 }finally{
  clearTimeout(journeyTimer);
  pin='';
  let closed=true;
  for(const c of contexts){
   try{await c.close();}
   catch{closed=false;}
  }
  if(browser){
   try{
    await browser.close();
    report.browserClosed=true;
   }catch{closed=false;}
  }
  if(!closed){
   report.status='FAIL';
   fail('BROWSER_CLEANUP_STOP');
  }
 }
}

const mode=process.argv[2];
try{
 await context();
 if(mode==='inputs'){
  check(!process.env.FEATURE_TEST_ADMIN_PIN,'NO_PIN_IN_INPUT_CHECK');
  report.status='PASS_BROWSER_INPUTS_ONLY';
 }else if(mode==='verify'){
  await verify();
 }else if(mode==='browser'){
  await browserJourney();
 }else{
  fail('MODE');
 }
}catch(e){
 report.status='FAIL';
 report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.safeCode||'')
  ?e.safeCode
  :'INTERNAL_STOP_NO_RETRY';
 process.exitCode=1;
}

if(evidence&&(mode==='browser'||report.status==='FAIL')){
 try{
  await writeFile(
   join(evidence,'sanitized.json'),
   JSON.stringify(report,null,2)+'\n',
   {mode:0o600,flag:'wx'}
  );
 }catch{
  report.status='FAIL';
  report.errorCategory='SAFE_RECEIPT_WRITE_FAILED';
  process.exitCode=1;
 }
}
console.log(JSON.stringify(report));
