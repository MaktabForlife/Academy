import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';

const ORIGIN='https://maktabhelper.app',HOST='maktabhelper.app';
const MANIFEST='055eee5ec812cb034ab3d618276749b7cecccf9ec5e19caf9a03d770fa4bc91f';
const COMMON='0229b34114e9a4c0b130d44b5f5570cb7de09b53424a32f12856f5ba2706e3d4';
const ACCOUNT='feature-synthetic-global',ID='feature-test-admin',A='__Secure-uaa_a',R='__Host-uaa_r';
const tuple=['accountId','sessionId','parentId','browserId','browserGeneration','credentialEpoch','securityVersion','unlockGeneration','originalSignedAtMs','originalExpiresAtMs','lastForegroundRefreshMs'];
const opaque=s=>typeof s==='string'&&/^[-A-Za-z0-9_]{43}$/.test(s);
const check=(v,c)=>{if(!v)throw Object.assign(Error(c),{safeCode:c});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'ACADEMY_DEPLOYED_FEATURE_AUTH_PROTOCOL_SAFE_V1',status:'FAIL',scope:'DEPLOYED_ACADEMY_FEATURE_ONLY',AI:'OFF',productionLegacyStudioHifzTouched:false,SQLRequests:0,CFRequests:0,applicationRequests:0,assetRequests:0,http503Count:0,checks:{},statuses:[],browserUIJourney:'NOT_CLAIMED_PROTOCOL_ONLY',genuinePINFormAlreadyConfirmed:true,privateValuesOrFingerprintsReported:false,browserClosed:false};
let evidence;
async function json(p){return JSON.parse(await readFile(p,'utf8'));}
function account(v){check(v?.accountId===ACCOUNT&&String(v.uniqueid||'').toLowerCase()===ID,'NATIVE_ACCOUNT');}
function dataProof(v){check(opaque(v),'ACTUAL_CSRF_REQUIRED');return v;}
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


async function main(){
 check(process.platform==='linux'&&process.version==='v24.22.1','NODE_PIN');
 check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.DEBUG&&!process.env.NODE_DEBUG&&!process.env.DEBUG_FILE&&!process.env.PWDEBUG&&!process.env.CLOUDFLARE_API_TOKEN&&!process.env.GITHUB_TOKEN&&!process.env.GH_TOKEN,'ENV_SCOPE');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true','CI_SCOPE');
 const inputs=(await json(process.env.GITHUB_EVENT_PATH)).inputs||{};
 check(inputs.modern_stage==='browser'&&inputs.expected_sha===process.env.GITHUB_SHA&&inputs.package_manifest_sha256===MANIFEST,'DISPATCH_PIN');
 const temp=await realpath(process.env.RUNNER_TEMP),gate=await json(join(temp,'academy-feature-browser-private/gate.json'));
 check(gate.sourceSHA===process.env.GITHUB_SHA&&gate.activationReceiptSHA256===inputs.upload_receipt_sha256&&gate.activationSourceSHA===inputs.browser_activation_source_sha&&gate.runAttested===true&&gate.oneParentAttested===true,'ATTESTED_ACTIVATION_REQUIRED');
 const receiptBytes=await readFile(join(temp,'academy-feature-browser-activation/sanitized.json'));
 check(sha(receiptBytes)===inputs.upload_receipt_sha256,'ACTIVATION_RECEIPT_PIN');
 const receipt=JSON.parse(receiptBytes);
 check(receipt.status==='PASS_TWO_REVIEWED_VERSIONS_ACTIVE'&&receipt.sourceSHA===inputs.browser_activation_source_sha&&receipt.packageManifestSHA256===MANIFEST&&receipt.commonSHA256===COMMON&&receipt.AI==='OFF'&&receipt.childDelivery==='OFF','ACTIVE_PACKAGE_PIN');
 report.sourceSHA=process.env.GITHUB_SHA;report.runId=process.env.GITHUB_RUN_ID;
 report.activationRunId=inputs.upload_run_id;report.activationSourceSHA=receipt.sourceSHA;
 report.activeVersions=receipt.activationAttempts;report.packageManifestSHA256=MANIFEST;
 evidence=join(temp,'academy-feature-browser-evidence');await mkdir(evidence,{recursive:true,mode:0o700});
 let pin=process.env.FEATURE_TEST_ADMIN_PIN;delete process.env.FEATURE_TEST_ADMIN_PIN;
 check(typeof pin==='string'&&/^[0-9]{4}$/.test(pin),'PROTECTED_PIN');
 const req=createRequire(join(temp,'academy-feature-browser-tools/package.json'));
 check(req('playwright/package.json').version==='1.58.2'&&req('playwright-core/package.json').version==='1.58.2','PLAYWRIGHT_PIN');
 check(process.env.PLAYWRIGHT_BROWSERS_PATH===join(temp,'academy-feature-browser-binaries'),'BROWSER_PATH');
 const {chromium}=req('playwright');
 let browser,phase='public-static',fatal=null;const contexts=[];
 const methods=new Map([
  ['/js/m4l-config-root-only-v1.js','GET'],['/api/account/check','POST'],['/auth/v110/login','POST'],
  ['/auth/v110/context','GET'],['/api/account/session','POST'],['/auth/v110/refresh','POST'],
  ['/auth/v110/logout-csrf','GET'],['/auth/v110/logout','POST']
 ]);
 const labels=new Map([...methods.keys()].map(p=>[p,p.split('/').at(-1)]));
 const stop=c=>{if(!fatal)fatal=c;};
 const guard=()=>check(!fatal,fatal||'TRANSPORT_SCOPE');
 async function context(){
  const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});contexts.push(ctx);
  await ctx.route('**/*',async route=>{
   try{
    guard();const r=route.request(),u=new URL(r.url());
    check(u.origin===ORIGIN&&!u.search&&methods.get(u.pathname)===r.method(),'EXACT_FEATURE_PROTOCOL_ROUTE');
    check(r.resourceType()!=='script','APPLICATION_SCRIPT_NOT_SELECTED');
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))report.applicationRequests++;else report.assetRequests++;
    check(report.applicationRequests<=20&&report.assetRequests<=3,'REQUEST_BUDGET');
    await route.continue();
   }catch(e){stop(e.safeCode||'PROTOCOL_ROUTE_STOP');try{await route.abort();}catch{}}
  });
  return ctx;
 }
 async function document(ctx){
  const page=await ctx.newPage();page.setDefaultTimeout(15000);
  const response=await page.goto(ORIGIN+'/js/m4l-config-root-only-v1.js',{waitUntil:'domcontentloaded'});
  guard();check(response?.status()===200,'STATIC_DOCUMENT');
  check(await page.evaluate(()=>['application/javascript','text/javascript'].includes(document.contentType)&&Function.prototype.toString.call(window.fetch).includes('[native code]')),'NATIVE_BROWSER_FETCH_REQUIRED');
  return page;
 }
 async function call(page,path,method,headers={},body,expected=200){
  report.checkpoint=phase;
  const pending=page.waitForResponse(r=>r.url()===ORIGIN+path&&r.request().method()===method,{timeout:15000});
  const packet=await page.evaluate(async({path,method,headers,body})=>{
   try{
    const r=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',redirect:'error',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(10000)});
    const reader=r.body.getReader(),chunks=[];let size=0;
    for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>262144){await reader.cancel();return {status:r.status,tooLarge:true};}chunks.push(p.value);}
    const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.byteLength;}
    let value;try{value=JSON.parse(new TextDecoder().decode(all));}catch{return {status:r.status,jsonFailed:true};}
    return {status:r.status,value};
   }catch{return {transportFailed:true};}
  },{path,method,headers,body});
  const response=await pending;guard();
  report.statuses.push({stage:phase,endpoint:labels.get(path),status:packet.status??null});
  if(packet.status===503)report.http503Count++;
  check(!packet.transportFailed&&!packet.tooLarge&&!packet.jsonFailed,'NATIVE_BROWSER_RESPONSE');
  check(packet.status===expected,'AUTH_HTTP_UNEXPECTED');
  return {value:packet.value,response,setCookies:(await response.headersArray()).filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value)};
 }
 async function nativeSession(page,selector,proof){
  const p=await call(page,'/api/account/session','POST',{'Content-Type':'application/json',Authorization:'Bearer '+selector,'X-UAA-CSRF':dataProof(proof)},'{}');
  check(p.value.success===true,'NATIVE_SESSION');account(p.value.account);return p;
 }
 const timer=setTimeout(()=>{stop('PROTOCOL_DEADLINE');if(browser)void browser.close().catch(()=>{});},120000);timer.unref();
 try{
  browser=await chromium.launch({headless:true});check(browser.version()==='145.0.7632.6','CHROMIUM_PIN');
  report.chromiumVersion=browser.version();report.playwrightVersion='1.58.2';
  const ctx=await context(),page=await document(ctx);
  phase='existing-account';
  let p=await call(page,'/api/account/check','POST',{'Content-Type':'application/json'},JSON.stringify({uniqueid:ID}));
  check(p.value.success===true&&p.value.account?.pinsetup===true,'EXISTING_PIN_ACCOUNT');report.checks.existingAccount=true;
  phase='native-pin-login';
  p=await call(page,'/auth/v110/login','POST',{'Content-Type':'application/json'},JSON.stringify({uniqueid:ID,pin}));
  pin='';check(p.value.success===true&&p.value.cookieSession===true&&typeof p.value.sessionKey==='string'&&p.value.sessionKey.startsWith('uaa-session:'),'NATIVE_PIN_LOGIN');
  account(p.value.account);const login=p.value,firstDisplay=display(login.browserContext);
  cookieDirectives(p.setCookies);const first=await pair(ctx);claims(first,firstDisplay);
  report.checks.login=true;report.checks.secureHttpOnlyCookies=true;
  phase='checked-context-before-refresh';
  p=await call(page,'/auth/v110/context','GET');const before=display(p.value.session);same(firstDisplay,before);
  let selector=typeof p.value.sessionKey==='string'?p.value.sessionKey:login.sessionKey,csrf=opaque(p.value.csrf)?p.value.csrf:login.csrf;
  phase='checked-native-session-before-refresh';await nativeSession(page,selector,csrf);
  report.checks.contextAndNativeSessionBefore=true;
  phase='refresh';
  p=await call(page,'/auth/v110/refresh','POST',{'Content-Type':'application/json','X-UAA-CSRF':dataProof(csrf)},'{}');
  check(p.value.refreshed===true,'NATIVE_REFRESH');const rotated=display(p.value.browserContext);same(before,rotated);cookieDirectives(p.setCookies);
  phase='checked-context-after-refresh';p=await call(page,'/auth/v110/context','GET');const after=display(p.value.session);same(before,after);
  if(typeof p.value.sessionKey==='string')selector=p.value.sessionKey;if(opaque(p.value.csrf))csrf=p.value.csrf;
  phase='checked-native-session-after-refresh';await nativeSession(page,selector,csrf);
  const current=await pair(ctx),expiry=claims(current,after);
  check([A,R].every(n=>current.find(c=>c.name===n).value!==first.find(c=>c.name===n).value),'CURRENT_PAIR_ROTATION');
  report.checks.refresh=true;report.checks.contextAndNativeSessionAfter=true;
  report.checks.identityEpochBrowserAndOriginalDeadlinesPreserved=true;report.checks.lastForegroundUnchanged=true;
  const replaySelector=selector,replayCSRF=csrf;
  phase='logout-proof';p=await call(page,'/auth/v110/logout-csrf','GET');const logoutCSRF=dataProof(p.value.csrf);
  check(expiry>Date.now()/1000+15,'CURRENT_PAIR_EXPIRED');
  phase='logout';p=await call(page,'/auth/v110/logout','POST',{'Content-Type':'application/json','X-UAA-CSRF':logoutCSRF},'{}');
  check(p.value.success===true&&p.value.cancelled===true,'NATIVE_LOGOUT');cookieDirectives(p.setCookies,true);
  check(!(await ctx.cookies(ORIGIN)).some(c=>[A,R].includes(c.name)),'LOGOUT_COOKIE_CLEAR');
  report.checks.logout=true;report.checks.logoutCookiesCleared=true;
  const replay=await context(),probe=await document(replay);
  async function restore(){
   check(expiry>Date.now()/1000+15,'REPLAY_PAIR_EXPIRED');
   await replay.addCookies(current.map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path,expires:c.expires,httpOnly:c.httpOnly,secure:c.secure,sameSite:c.sameSite})));
  }
  async function rejected(path,method,headers={},body){
   await restore();const r=await call(probe,path,method,headers,body,401);
   const h=await r.response.request().allHeaders(),parts=new Map(String(h.cookie||'').split(';').map(s=>{const i=s.indexOf('=');return [s.slice(0,i).trim(),s.slice(i+1).trim()];}));
   check([A,R].every(n=>parts.get(n)===current.find(c=>c.name===n).value),'SAME_CURRENT_PAIR_REQUIRED');
  }
  phase='revoked-current-context';await rejected('/auth/v110/context','GET');
  phase='revoked-current-native-session';await rejected('/api/account/session','POST',{'Content-Type':'application/json',Authorization:'Bearer '+replaySelector,'X-UAA-CSRF':replayCSRF},'{}');
  phase='revoked-current-refresh';await rejected('/auth/v110/refresh','POST',{'Content-Type':'application/json','X-UAA-CSRF':replayCSRF},'{}');
  report.checks.sameCurrentUnexpiredCredentialsRejectedAtAllThree=true;
  report.loginPOSTs=1;report.refreshPOSTs=2;report.logoutPOSTs=1;
  report.nativeLoginWindowRequests=2;report.csrfRefreshLogoutWindowRequests=4;
  report.httpRefreshForeground=false;report.idleExtensionProven=false;guard();
  report.status='PASS_DEPLOYED_FEATURE_LOGIN_REFRESH_LOGOUT_AND_REVOCATION';
 }finally{
  clearTimeout(timer);pin='';
  for(const ctx of contexts)try{await ctx.close();}catch{}
  if(browser){await browser.close();report.browserClosed=true;}
 }
}
try{await main();}catch(e){report.status='FAIL';report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.safeCode||'')?e.safeCode:'PROTOCOL_DRIVER_STOP';process.exitCode=1;}
if(evidence)await writeFile(join(evidence,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report));
