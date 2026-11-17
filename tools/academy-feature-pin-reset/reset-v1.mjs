import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash,randomInt,randomBytes,createCipheriv,publicEncrypt,createPublicKey,constants,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const ORIGIN='https://maktabhelper.app',HOST='maktabhelper.app';
const MANIFEST='055eee5ec812cb034ab3d618276749b7cecccf9ec5e19caf9a03d770fa4bc91f';
const COMMON='0229b34114e9a4c0b130d44b5f5570cb7de09b53424a32f12856f5ba2706e3d4';
const ACCOUNT='feature-synthetic-global',ID='feature-test-admin',A='__Secure-uaa_a',R='__Host-uaa_r';
const TARGETS=['feature-test-learner','feature-test-outsider','feature-test-scoped-admin'];
const opaque=s=>typeof s==='string'&&/^[-A-Za-z0-9_]{43}$/.test(s);
const check=(v,c)=>{if(!v)throw Object.assign(Error(c),{safeCode:c});};
const fail=c=>check(false,c);
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'ACADEMY_FEATURE_NATIVE_PIN_RESET_SAFE_V1',status:'FAIL',scope:'DEPLOYED_ACADEMY_FEATURE_ONLY',AI:'OFF',productionLegacyStudioHifzTouched:false,SQLRequests:0,CFRequests:0,applicationRequests:0,assetRequests:0,http503Count:0,statuses:[],accounts:[],privateValuesOrFingerprintsReported:false,adminPINReset:false,adminResetRestriction:'ANOTHER_GLOBAL_ADMIN_REQUIRED',browserClosed:false};
let evidence,delivery,publicKey;
const json=async p=>JSON.parse(await readFile(p,'utf8'));
async function encryptDelivery(){
 if(!delivery||!publicKey||!evidence)return;
 const key=randomBytes(32),iv=randomBytes(12),aad=Buffer.from(JSON.stringify({scope:'ACADEMY_FEATURE_TEST_CREDENTIALS_MSI_ONLY',sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID}));
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const plain=Buffer.from(JSON.stringify(delivery));
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);plain.fill(0);
 const wrapped=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);key.fill(0);
 const packet={schema:'ACADEMY_FEATURE_MSI_ENCRYPTED_CREDENTIALS_V1',algorithm:'RSA-OAEP-SHA256+A256GCM',aad:aad.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),wrappedKey:wrapped.toString('base64'),ciphertext:encrypted.toString('base64')};
 await writeFile(join(evidence,'msi-encrypted.json'),JSON.stringify(packet)+'\n',{mode:0o600,flag:'wx'});
 report.MSIDeliveryEncrypted=true;
 for(const a of delivery.accounts)a.pin=null;
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

async function main(){
 check(process.platform==='linux'&&process.version==='v24.22.1','NODE_PIN');
 check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.DEBUG&&!process.env.NODE_DEBUG&&!process.env.DEBUG_FILE&&!process.env.PWDEBUG&&!process.env.CLOUDFLARE_API_TOKEN&&!process.env.GITHUB_TOKEN&&!process.env.GH_TOKEN,'ENV_SCOPE');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true','CI_SCOPE');
 const inputs=(await json(process.env.GITHUB_EVENT_PATH)).inputs||{};
 check(inputs.modern_stage==='pin-reset'&&inputs.expected_sha===process.env.GITHUB_SHA&&inputs.package_manifest_sha256===MANIFEST,'DISPATCH_PIN');
 const temp=await realpath(process.env.RUNNER_TEMP),gate=await json(join(temp,'academy-feature-pin-reset-private/gate.json'));
 check(gate.sourceSHA===process.env.GITHUB_SHA&&gate.activationReceiptSHA256===inputs.upload_receipt_sha256&&gate.activationSourceSHA===inputs.browser_activation_source_sha&&gate.runAttested===true&&gate.oneParentAttested===true,'ATTESTED_ACTIVATION_REQUIRED');
 const receiptBytes=await readFile(join(temp,'academy-feature-pin-reset-activation/sanitized.json'));
 check(sha(receiptBytes)===inputs.upload_receipt_sha256,'ACTIVATION_RECEIPT_PIN');
 const receipt=JSON.parse(receiptBytes);
 check(receipt.status==='PASS_TWO_REVIEWED_VERSIONS_ACTIVE'&&receipt.sourceSHA===inputs.browser_activation_source_sha&&receipt.packageManifestSHA256===MANIFEST&&receipt.commonSHA256===COMMON&&receipt.AI==='OFF'&&receipt.childDelivery==='OFF','ACTIVE_PACKAGE_PIN');
 report.sourceSHA=process.env.GITHUB_SHA;report.runId=process.env.GITHUB_RUN_ID;report.activeVersions=receipt.activationAttempts;
 evidence=join(temp,'academy-feature-pin-reset-evidence');await mkdir(evidence,{recursive:true,mode:0o700});
 publicKey=createPublicKey(await readFile('tools/academy-feature-pin-reset/DELIVERY-PUBLIC.pem'));
 check(publicKey.asymmetricKeyType==='rsa'&&publicKey.asymmetricKeyDetails.modulusLength===3072,'MSI_PUBLIC_KEY');
 let pin=process.env.FEATURE_TEST_ADMIN_PIN;delete process.env.FEATURE_TEST_ADMIN_PIN;
 check(typeof pin==='string'&&/^[0-9]{4}$/.test(pin),'PROTECTED_PIN');
 delivery={scope:'ACADEMY_FEATURE_ONLY',origin:ORIGIN,sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,accounts:[{uniqueId:ID,pin,status:'EXISTING_ADMIN_PIN_UNCHANGED'}]};
 const req=createRequire(join(temp,'academy-feature-browser-tools/package.json'));
 check(req('playwright/package.json').version==='1.58.2'&&req('playwright-core/package.json').version==='1.58.2','PLAYWRIGHT_PIN');
 check(process.env.PLAYWRIGHT_BROWSERS_PATH===join(temp,'academy-feature-browser-binaries'),'BROWSER_PATH');
 const {chromium}=req('playwright');
 let browser,phase='public-static',fatal=null;const contexts=[],active=[];const targetIds=new Set();
 const methods=new Map([['/js/m4l-config-root-only-v1.js','GET'],['/api/account/check','POST'],['/auth/v110/login','POST'],['/auth/v110/setup-pin','POST'],['/auth/v110/context','GET'],['/api/account/session','POST'],['/api/admin/platform/user-profiles/get','POST'],['/api/admin/platform/user-profiles/save','POST'],['/auth/v110/logout-csrf','GET'],['/auth/v110/logout','POST']]);
 const guard=()=>check(!fatal,fatal||'TRANSPORT_SCOPE');
 async function context(){
  const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});contexts.push(ctx);
  await ctx.route('**/*',async route=>{
   try{
    guard();const r=route.request(),u=new URL(r.url());
    check(u.origin===ORIGIN&&!u.search&&methods.get(u.pathname)===r.method()&&r.resourceType()!=='script','EXACT_FEATURE_RESET_ROUTE');
    if(r.method()==='POST'){
     const b=JSON.parse(r.postData()||'{}');check(b&&typeof b==='object'&&!Array.isArray(b),'BODY');
     if(u.pathname==='/api/admin/platform/user-profiles/save')check(Object.keys(b).sort().join(',')==='accountId,baseRevision,mode,operationId'&&b.mode==='reset-pin'&&targetIds.has(b.accountId)&&b.accountId!==ACCOUNT&&/^[a-f0-9]{64}$/.test(b.baseRevision)&&/^[a-f0-9-]{36}$/.test(b.operationId),'RESET_SCOPE');
     else if(u.pathname==='/auth/v110/login')check(Object.keys(b).sort().join(',')==='pin,uniqueid'&&b.uniqueid===ID&&/^[0-9]{4}$/.test(b.pin),'ADMIN_LOGIN_SCOPE');
     else if(u.pathname==='/auth/v110/setup-pin')check(Object.keys(b).sort().join(',')==='pin,pinConfirmation,uniqueid'&&TARGETS.includes(b.uniqueid)&&/^[0-9]{4}$/.test(b.pin)&&b.pinConfirmation===b.pin,'SETUP_SCOPE');
     else if(u.pathname==='/api/account/check')check(Object.keys(b).join(',')==='uniqueid'&&[ID,...TARGETS].includes(b.uniqueid),'CHECK_SCOPE');
     else check(Object.keys(b).length===0,'EMPTY_REQUEST_REQUIRED');
    }
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))report.applicationRequests++;else report.assetRequests++;
    check(report.applicationRequests<=40&&report.assetRequests<=4,'REQUEST_BUDGET');await route.continue();
   }catch(e){fatal=e.safeCode||'RESET_ROUTE_STOP';try{await route.abort();}catch{}}
  });return ctx;
 }
 async function document(ctx){
  const page=await ctx.newPage();page.setDefaultTimeout(15000);
  const response=await page.goto(ORIGIN+'/js/m4l-config-root-only-v1.js',{waitUntil:'domcontentloaded'});guard();check(response?.status()===200,'STATIC_DOCUMENT');
  check(await page.evaluate(()=>['application/javascript','text/javascript'].includes(document.contentType)&&Function.prototype.toString.call(window.fetch).includes('[native code]')),'NATIVE_FETCH');return page;
 }
 async function call(page,path,method,headers={},body,expected=200){
  report.checkpoint=phase;
  const pending=page.waitForResponse(r=>r.url()===ORIGIN+path&&r.request().method()===method,{timeout:15000});pending.catch(()=>{});
  const packet=await page.evaluate(async({path,method,headers,body})=>{
   try{const r=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',redirect:'error',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(10000)});
    const reader=r.body.getReader(),chunks=[];let size=0;for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>524288){await reader.cancel();return {status:r.status,tooLarge:true};}chunks.push(p.value);}
    const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.byteLength;}let value;try{value=JSON.parse(new TextDecoder().decode(all));}catch{return {status:r.status,jsonFailed:true};}return {status:r.status,value};
   }catch{return {transportFailed:true};}
  },{path,method,headers,body});
  if(packet.transportFailed){await pending.catch(()=>null);check(false,'UNCERTAIN_REQUEST_NO_RETRY');}
  const response=await pending;guard();report.statuses.push({stage:phase,endpoint:path,status:packet.status??null});if(packet.status===503)report.http503Count++;
  check(!packet.tooLarge&&!packet.jsonFailed,'NATIVE_RESPONSE');
  if(packet.status!==expected){const c=packet.value?.code;report.serverErrorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(c||'')?c:'UNEXPECTED_HTTP';check(false,'NATIVE_HTTP_UNEXPECTED');}
  return {value:packet.value,setCookies:(await response.headersArray()).filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value)};
 }
 const post=(page,path,body,headers={})=>call(page,path,'POST',{'Content-Type':'application/json',...headers},JSON.stringify(body));
 async function logout(p){
  phase='logout-'+p.id;let r=await call(p.page,'/auth/v110/logout-csrf','GET');check(opaque(r.value.csrf),'LOGOUT_CSRF');
  r=await post(p.page,'/auth/v110/logout',{}, {'X-UAA-CSRF':r.value.csrf});check(r.value.success===true&&r.value.cancelled===true,'LOGOUT');p.closed=true;
 }
 function authHeaders(selector,csrf){check(typeof selector==='string'&&selector.startsWith('uaa-')&&opaque(csrf),'NATIVE_AUTH');return {Authorization:'Bearer '+selector,'X-UAA-CSRF':csrf,'X-Academy-Workspace':'ADMIN'};}
 const strip=a=>Object.fromEntries(Object.entries(a).filter(([k])=>!['pinSetup','credentialEpoch','revision'].includes(k)));
 const timer=setTimeout(()=>{fatal='RESET_DEADLINE';if(browser)void browser.close().catch(()=>{});},150000);timer.unref();
 try{
  browser=await chromium.launch({headless:true});check(browser.version()==='145.0.7632.6','CHROMIUM_PIN');
  const ctx=await context(),page=await document(ctx);phase='admin-login';
  let p=await post(page,'/auth/v110/login',{uniqueid:ID,pin});pin='';check(p.value.success===true&&p.value.cookieSession===true&&p.value.account?.accountId===ACCOUNT,'GENUINE_ADMIN_LOGIN');cookieDirectives(p.setCookies);await pair(ctx);
  const admin={id:ID,page,closed:false};active.push(admin);const login=p.value;
  p=await call(page,'/auth/v110/context','GET');
  const selector=p.value.sessionKey||login.sessionKey,csrf=p.value.csrf||login.csrf,h=authHeaders(selector,csrf);
  phase='native-admin-session';p=await post(page,'/api/account/session',{},h);check(p.value.success===true&&p.value.account?.accountId===ACCOUNT,'CURRENT_NATIVE_ADMIN');
  phase='profiles-before';p=await post(page,'/api/admin/platform/user-profiles/get',{},h);
  const before=p.value;
  check(before.success===true&&before.currentAccountId===ACCOUNT&&before.resetPinEditable===true&&before.accounts?.length===4,'FOUR_CURRENT_NATIVE_PROFILES');
  check(before.accounts.filter(a=>a.academyAdmin).length===1&&before.accounts.some(a=>a.accountId===ACCOUNT&&a.academyAdmin&&a.uniqueId===ID),'ONE_ACTUAL_GLOBAL_ADMIN');
  const expected=new Set([ID,...TARGETS]);check(before.accounts.every(a=>expected.has(a.uniqueId)&&a.active&&a.pinSetup===true),'EXACT_CURRENT_ACCOUNTS');
  const targets=TARGETS.map(id=>before.accounts.find(a=>a.uniqueId===id));check(targets.every(a=>a&&a.accountId!==ACCOUNT&&!a.academyAdmin),'THREE_RESET_TARGETS');for(const a of targets)targetIds.add(a.accountId);
  for(const a of targets){
   phase='reset-'+a.uniqueId;const outcome={uniqueId:a.uniqueId,resetAttempted:true,resetConfirmed:false,newPINSetupConfirmed:false,loginConfirmed:false};report.accounts.push(outcome);
   p=await post(page,'/api/admin/platform/user-profiles/save',{mode:'reset-pin',accountId:a.accountId,baseRevision:a.revision,operationId:randomUUID()},h);
   check(p.value.success===true&&p.value.reset===true&&p.value.accountId===a.accountId,'NATIVE_RESET_CONFIRMED');outcome.resetConfirmed=true;
  }
  phase='profiles-after-reset';p=await post(page,'/api/admin/platform/user-profiles/get',{},h);
  check(p.value.success===true&&p.value.accounts?.length===4,'FOUR_PROFILES_PRESERVED');
  for(const a of before.accounts){const b=p.value.accounts.find(v=>v.accountId===a.accountId);check(b&&JSON.stringify(strip(a))===JSON.stringify(strip(b)),'PROFILE_OR_RIGHTS_CHANGED');check(a.accountId===ACCOUNT?b.pinSetup===true&&b.credentialEpoch===a.credentialEpoch:b.pinSetup===false&&b.credentialEpoch===a.credentialEpoch+1,'RESET_EPOCH_AND_SETUP');}
  report.profileIDsNamesRolesAndRightsPreserved=true;
  await logout(admin);
  const used=new Set([delivery.accounts[0].pin]);
  for(const a of targets){
   const o=report.accounts.find(v=>v.uniqueId===a.uniqueId),ctx=await context(),page=await document(ctx);
   phase='check-reset-'+a.uniqueId;p=await post(page,'/api/account/check',{uniqueid:a.uniqueId});check(p.value.success===true&&p.value.account?.pinsetup===false,'RESET_READY_FOR_SETUP');
   let next;do{next=String(randomInt(1000,10000));}while(used.has(next));used.add(next);
   const entry={uniqueId:a.uniqueId,pin:null,status:'RESET_NEW_PIN_SETUP_PENDING'};delivery.accounts.push(entry);
   phase='setup-'+a.uniqueId;p=await post(page,'/auth/v110/setup-pin',{uniqueid:a.uniqueId,pin:next,pinConfirmation:next});
   check(p.value.success===true&&p.value.cookieSession===true&&p.value.account?.accountId===a.accountId,'NATIVE_SETUP_LOGIN');cookieDirectives(p.setCookies);await pair(ctx);
   entry.pin=next;entry.status='RESET_AND_NEW_PIN_SET';o.newPINSetupConfirmed=true;
   const own={id:a.uniqueId,page,closed:false};active.push(own);const setup=p.value;
   phase='verify-session-'+a.uniqueId;p=await call(page,'/auth/v110/context','GET');
   const ownSelector=p.value.sessionKey||setup.sessionKey,ownCSRF=p.value.csrf||setup.csrf;
   p=await post(page,'/api/account/session',{},authHeaders(ownSelector,ownCSRF));check(p.value.success===true&&p.value.account?.accountId===a.accountId,'NATIVE_NEW_PIN_SESSION');o.loginConfirmed=true;
   await logout(own);next='';
  }
  report.status='PASS_THREE_NATIVE_PIN_RESETS_ADMIN_PIN_UNCHANGED';guard();
 }finally{
  clearTimeout(timer);pin='';
  for(const p of active.filter(p=>!p.closed))try{await logout(p);}catch{}
  for(const ctx of contexts)try{await ctx.close();}catch{}
  if(browser){await browser.close();report.browserClosed=true;}
 }
}
try{await main();}catch(e){report.status='FAIL';report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.safeCode||'')?e.safeCode:'RESET_DRIVER_STOP';process.exitCode=1;}
try{await encryptDelivery();}catch{report.status='FAIL';report.errorCategory='MSI_ENCRYPTION_FAILED';process.exitCode=1;}
if(evidence)await writeFile(join(evidence,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report));
