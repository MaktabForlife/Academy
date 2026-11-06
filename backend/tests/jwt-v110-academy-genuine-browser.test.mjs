import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createAcademyWorkerdFixture} from './jwt-v110-workerd-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','GitHub runners only.');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=12000){const end=Date.now()+timeout;for(;;){try{const value=await fn();if(value)return value;}catch{}if(Date.now()>=end)throw Error(message);await sleep(30);}}
class CDP{
 constructor(ws){this.events=[];this.ws=ws;this.next=0;this.pending=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id){this.onEvent?.(m);if(m.method==='Runtime.exceptionThrown')this.events.push({session:m.sessionId,text:m.params.exceptionDetails.text,url:m.params.exceptionDetails.url,line:m.params.exceptionDetails.lineNumber,description:String(m.params.exceptionDetails.exception?.description||'').split('\\n')[0]});return;}const entry=this.pending.get(m.id);if(!entry)return;this.pending.delete(m.id);clearTimeout(entry.timer);if(m.error)entry.reject(Error(entry.method+' failed'));else entry.resolve(m.result);});}
 static async open(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(Error('CDP connection failed')),{once:true});});return new CDP(ws);}
 call(method,params={},sessionId){const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(method+' timed out'));},10000);this.pending.set(id,{resolve,reject,timer,method});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 async evaluate(tab,expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},tab.session);if(r.exceptionDetails)throw Error('Synthetic browser evaluation failed');return r.result.value;}
 async openTab(url){const {targetId}=await this.call('Target.createTarget',{url:'about:blank'}),{sessionId}=await this.call('Target.attachToTarget',{targetId,flatten:true}),tab={id:targetId,session:sessionId};await this.call('Page.enable',{},sessionId);await this.call('Runtime.enable',{},sessionId);await this.call('Target.activateTarget',{targetId});await this.call('Page.navigate',{url},sessionId);await until(()=>this.evaluate(tab,'document.readyState==="complete"&&location.href!=="about:blank"'), 'Synthetic app did not load.');return tab;}
}

const origin='https://feature_worker.maktab4life.workers.dev';
const mime=path=>({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.fragment':'text/plain','.ico':'image/x-icon'}[extname(path)]||'application/octet-stream');
test('Genuine Chrome native PIN installs HttpOnly Feature cookies and uses the actual own Worker',async t=>{
 const evidence=process.env.JWT_V110_EVIDENCE,build=JSON.parse(readFileSync(join(evidence,'public-build.json'),'utf8')),allowed=new Set(build.files),fixture=await createAcademyWorkerdFixture(),directory=await mkdtemp(join(tmpdir(),'jwt-feature-chrome-'));
 let browser,cdp,tab,server,startupErrors='',startupDone=false;const api=[],staticRequests=[],missingAssets=[],networkFailures=[],blockedExternal=[];let outside=0,options=0,blockedPublicFonts=0,blockedLegacyImages=0,forceRefreshFailure=false;
 t.after(async()=>{
  if(!startupDone)try{await writeFile(join(evidence,'chrome-startup.json'),JSON.stringify({exitCode:browser?.exitCode,signalCode:browser?.signalCode,errors:startupErrors.slice(0,3000)})+'\n');}catch{}
  if(cdp&&tab){try{
   const page=await cdp.evaluate(tab,'({state:document.documentElement.dataset.uaaV110State,dialogOpen:document.getElementById("academy-login-dialog")?.open,pinLength:document.getElementById("demo-pin")?.value?.length,status:document.getElementById("login-status")?.textContent?.slice(0,200),path:location.pathname,headerPresent:Boolean(document.getElementById("academy-header-name")&&!document.getElementById("academy-header-name").hidden),privateFacade:Boolean(window.M4L_V110),control:window.__ciControl,frames:document.querySelectorAll("iframe[data-uaa-control]").length,selectorPresent:/^uaa-(session|context):/.test(localStorage.getItem("m4l_account_token")||"")})');
   const stored=await cdp.call('Storage.getCookies');
   await writeFile(join(evidence,'safe-browser-state.json'),JSON.stringify({page,api,missingAssets,networkFailures,blockedExternal,outside,blockedPublicFonts,blockedLegacyImages,options,cookies:stored.cookies.filter(c=>c.name.includes('uaa')).map(c=>({name:c.name,domain:c.domain,httpOnly:c.httpOnly,secure:c.secure,sameSite:c.sameSite})),exceptions:cdp.events.map(e=>({text:e.text,url:e.url,line:e.line}))},null,2)+'\n');
  }catch{}}
  try{await cdp?.call('Browser.close');}catch{}cdp?.ws.close();browser?.kill('SIGKILL');if(server)await new Promise(resolve=>server.close(resolve));await fixture.close();
 });
 const key=join(directory,'local-TLS.key'),cert=join(directory,'local-TLS.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=feature_worker.maktab4life.workers.dev','-addext','subjectAltName=DNS:feature_worker.maktab4life.workers.dev'],{stdio:'ignore'});
 server=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{void serve(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local browser fixture failed');});});
 async function serve(req,res){
  const url=new URL(req.url,origin);
  if(req.method==='OPTIONS')options++;
  if(url.pathname.startsWith('/api/')||/^\/auth\/v110\/(?:login|setup-pin|context|csrf|refresh|logout|logout-csrf)$/.test(url.pathname)){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw Error('Bounded local browser request');chunks.push(chunk);}
   const response=await fixture.runtime.dispatchFetch(url.href,{method:req.method,headers:{...req.headers,...(forceRefreshFailure?{'X-Feature-Test-Refresh-Deny':'1'}:{})},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const metrics=JSON.parse(response.headers.get('x-feature-local-budget'));api.push({path:url.pathname,method:req.method,status:response.status,metrics,...(url.pathname==='/auth/v110/refresh'?{foreground:JSON.parse(Buffer.concat(chunks).toString()).foreground}: {})});
   const headers=Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'&&k!=='content-length'));headers['set-cookie']=response.headers.getSetCookie();
   res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let file=decodeURIComponent(url.pathname).slice(1);if(!file||file.endsWith('/'))file+='index.html';
  if(!allowed.has(file)||file.split('/').some(p=>p==='..')){missingAssets.push(url.pathname);res.writeHead(404);res.end('Not found');return;}
  staticRequests.push({path:url.pathname,method:req.method});
  res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(join(build.directory,file)));
 }
 await new Promise(resolve=>server.listen(443,'127.0.0.1',resolve));
 const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);assert(executable,'Runner Chrome required');
 const version=execFileSync(executable,['--version'],{encoding:'utf8'}).trim(),profile=join(directory,'profile');await mkdir(profile);
 browser=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2','--num-raster-threads=1','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--no-proxy-server','--ignore-certificate-errors','--host-resolver-rules=MAP feature_worker.maktab4life.workers.dev 127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',chunk=>{if(!startupDone&&startupErrors.length<3000)startupErrors+=String(chunk);});
 const portFile=await until(async()=>{try{return await readFile(join(profile,'DevToolsActivePort'),'utf8');}catch{return null;}},'Chrome did not start',30000);startupDone=true;
 const [port,path]=portFile.trim().split('\n');cdp=await CDP.open('ws://127.0.0.1:'+port+path);
 cdp.onEvent=m=>{if(m.method==='Network.loadingFailed')networkFailures.push({error:m.params.errorText,type:m.params.type});if(m.method==='Fetch.requestPaused'){const url=new URL(m.params.request.url);const good=url.origin===origin;if(!good){const publicFont=m.params.request.method==='GET'&&['https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(url.origin)&&['Stylesheet','Font'].includes(m.params.resourceType);const publicLegacyImage=url.origin==='https://ummabbadacademy.com'&&m.params.request.method==='GET'&&m.params.resourceType==='Image'&&/^\/wp-content\/uploads\/20\d{2}\/(?:0[1-9]|1[0-2])\/.+\.(?:png|jpe?g|webp|gif|svg)$/i.test(url.pathname)&&![...url.searchParams.keys()].some(k=>/token|auth|session|sig|credential|password|pin/i.test(k));if(publicFont)blockedPublicFonts++;else if(publicLegacyImage)blockedLegacyImages++;else outside++;blockedExternal.push({origin:url.origin,method:m.params.request.method,type:m.params.resourceType,publicFont,publicLegacyImage});}void cdp.call(good?'Fetch.continueRequest':'Fetch.failRequest',good?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'},m.sessionId).catch(()=>{});}};
 const {targetId}=await cdp.call('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.call('Target.attachToTarget',{targetId,flatten:true});tab={id:targetId,session:sessionId};
 for(const name of ['Page.enable','Runtime.enable','Network.enable','Fetch.enable'])await cdp.call(name,name==='Fetch.enable'?{patterns:[{urlPattern:'*'}]}:{},sessionId);
 await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:'window.__ciControl=[];window.addEventListener("message",e=>{const m=e.data;if(m?.type?.startsWith("UAA_CONTROL"))window.__ciControl.push({type:m.type,ok:m.ok,code:m.code,active:m.state?.active});});'},sessionId);
 await cdp.call('Target.activateTarget',{targetId});await cdp.call('Page.navigate',{url:origin+'/academy/#login'},sessionId);
 await until(()=>cdp.evaluate(tab,'Boolean(document.querySelector("[data-uaa-open-sign-in]"))&&Boolean(window.M4L_ACADEMY_LOGIN)'),'Public Feature sign-in action missing',20000);
 const anonymousStart=api.length;
 const anonymousPublic=await cdp.evaluate(tab,'Promise.all(["/api/public/header-date","/api/public/academy-announcements"].map(async p=>{const r=await fetch(p);return{path:p,status:r.status};}))');
 assert(anonymousPublic.every(r=>[200,503].includes(r.status)),'Anonymous public reads must reach their native controlled responses');
 assert(!api.slice(anonymousStart).some(r=>['/auth/v110/csrf','/auth/v110/refresh','/auth/v110/logout-csrf'].includes(r.path)));
 await cdp.evaluate(tab,'document.querySelector("[data-uaa-open-sign-in]").click()');
 await until(()=>cdp.evaluate(tab,'Boolean(window.M4L_ACADEMY_LOGIN)&&document.getElementById("academy-login-dialog")?.open'),'Native public PIN dialog did not open',20000);
 await cdp.evaluate(tab,'document.getElementById("demo-username").focus()');
 await cdp.call('Input.insertText',{text:'feature-test-learner'},sessionId);
 await cdp.evaluate(tab,'document.getElementById("demo-pin").focus()');
 await cdp.call('Input.insertText',{text:'2468'},sessionId);
 await until(()=>cdp.evaluate(tab,'(async()=>document.documentElement.dataset.uaaV110State==="ready"&&(location.pathname==="/"?(await import("/api.mjs")).identity.account?.accountId==="feature-synthetic-learner-a":document.getElementById("academy-header-name")?.textContent==="Feature synthetic learner"))()'),'Actual native PIN/cookie sign-in did not reveal current account',25000);
 assert.equal(api.filter(r=>r.path==='/auth/v110/login'&&r.status===200).length,1,'Fourth digit should submit once');
 const cookieState=await cdp.call('Storage.getCookies');const cookies=cookieState.cookies.filter(c=>c.name==='__Secure-uaa_a'||c.name==='__Host-uaa_r');assert.equal(cookies.length,2);assert(cookies.every(c=>c.secure&&c.httpOnly&&c.domain==='feature_worker.maktab4life.workers.dev'&&c.sameSite==='Lax'));
 assert(await cdp.evaluate(tab,'!document.cookie.includes("uaa_")'),'HttpOnly credentials must be hidden from document.cookie');
 assert(await cdp.evaluate(tab,'/^uaa-(session|context):/.test(localStorage.getItem("m4l_account_token")||"")'),'Existing UI storage must contain a nonsecret selector');
 const read=activity=>cdp.evaluate(tab,'(async()=>{const r=await fetch("/api/academy/lesson-media/list",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("m4l_account_token"),"X-Academy-Workspace":"LEARN"},body:JSON.stringify({activityKey:'+JSON.stringify(activity)+'})});await r.json();return r.status;})()');
 assert.equal(await read('COURSE:FEATURE-SYNTHETIC-A'),200);assert.equal(await read('COURSE:FEATURE-SYNTHETIC-B'),403);
 const inspected=await fixture.runtime.getD1Database('ACADEMY_DB','api');
 const foregroundBefore=await inspected.prepare("SELECT last_fg_refresh_s,original_expires_at_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 await sleep(1100);
 // Advance only the renderer expiry clock; the issuer and SQL clocks remain real.
 // Use the actual Dashboard refresh control and its explicitly carried trusted event.
 await cdp.evaluate(tab,'window.__ciRealDateNow=Date.now;Date.now=()=>window.__ciRealDateNow()+901000;');
 await until(()=>cdp.evaluate(tab,'Boolean(document.querySelector("[data-circles-dashboard-refresh]"))'),'Native Dashboard refresh control missing',15000);
 const point=await cdp.evaluate(tab,'(()=>{const b=document.querySelector("[data-circles-dashboard-refresh]");b.scrollIntoView({block:"center"});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
 await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
 await until(()=>api.some(r=>r.path==='/auth/v110/refresh'&&r.status===200&&r.foreground===true),'Actual protected Dashboard action did not renew foreground',20000);
 await until(()=>api.some(r=>r.path==='/api/academy/hub/read'&&r.status===200),'Actual Dashboard read did not finish',15000);
 await cdp.evaluate(tab,'Date.now=window.__ciRealDateNow;');
 const foregroundAfter=await inspected.prepare("SELECT last_fg_refresh_s,original_expires_at_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 assert(foregroundAfter.last_fg_refresh_s>foregroundBefore.last_fg_refresh_s);assert.equal(foregroundAfter.original_expires_at_s,foregroundBefore.original_expires_at_s);assert(api.some(r=>r.path==='/auth/v110/refresh'&&r.status===200&&r.foreground===true));
 assert(await cdp.evaluate(tab,'document.documentElement.dataset.uaaV110State==="ready"'),'Ordinary same-session renewal must retain the checked private view');
 const unrelatedBefore=await inspected.prepare("SELECT last_fg_refresh_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 const unrelatedStart=api.length;
 await cdp.evaluate(tab,'(()=>{Date.now=()=>window.__ciRealDateNow()+901000;const b=document.createElement("button");b.id="jwt-ci-unrelated";b.textContent="Synthetic public action";b.style.cssText="position:fixed;top:10px;left:10px;z-index:2147483647";b.onclick=async()=>{window.__ciUnrelatedActive=navigator.userActivation.isActive;for(const p of ["/api/public/header-date","/api/public/academy-announcements"]){const r=await fetch(p);await r.json();}const r=await fetch("/api/academy/lesson-media/list",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("m4l_account_token"),"X-Academy-Workspace":"LEARN"},body:JSON.stringify({activityKey:"COURSE:FEATURE-SYNTHETIC-A"})});await r.json();window.__ciUnrelatedStatus=r.status;Date.now=window.__ciRealDateNow;};document.body.append(b);})()');
 const unrelatedPoint=await cdp.evaluate(tab,'(()=>{const r=document.getElementById("jwt-ci-unrelated").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...unrelatedPoint},sessionId);
 await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...unrelatedPoint},sessionId);
 await until(()=>cdp.evaluate(tab,'window.__ciUnrelatedStatus===200&&window.__ciUnrelatedActive===true'),'Unrelated active gesture/public and automatic protected reads did not finish',20000);
 const unrelatedCalls=api.slice(unrelatedStart),firstRefresh=unrelatedCalls.findIndex(r=>r.path==='/auth/v110/refresh');
 assert(firstRefresh>=2,'Public reads must not trigger an access replacement');
 assert(unrelatedCalls.slice(0,firstRefresh).every(r=>r.path.startsWith('/api/public/')));
 assert(unrelatedCalls.filter(r=>r.path==='/auth/v110/refresh').every(r=>r.foreground===false));
 const unrelatedAfter=await inspected.prepare("SELECT last_fg_refresh_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();assert.equal(unrelatedAfter.last_fg_refresh_s,unrelatedBefore.last_fg_refresh_s);
 await sleep(6000); // Let Chrome's transient user activation expire.
 await cdp.evaluate(tab,'window.__ciRealDateNow=Date.now;Date.now=()=>window.__ciRealDateNow()+901000;');
 const backgroundBefore=await inspected.prepare("SELECT last_fg_refresh_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 assert.equal(await read('COURSE:FEATURE-SYNTHETIC-A'),200);
 await cdp.evaluate(tab,'Date.now=window.__ciRealDateNow;');
 const backgroundAfter=await inspected.prepare("SELECT last_fg_refresh_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 assert.equal(backgroundAfter.last_fg_refresh_s,backgroundBefore.last_fg_refresh_s);assert(api.some(r=>r.path==='/auth/v110/refresh'&&r.status===200&&r.foreground===false));
 await cdp.call('Page.reload',{},sessionId);
 await until(()=>cdp.evaluate(tab,'(async()=>document.documentElement.dataset.uaaV110State==="ready"&&(location.pathname==="/"?(await import("/api.mjs")).identity.account?.accountId==="feature-synthetic-learner-a":document.getElementById("academy-header-name")?.textContent==="Feature synthetic learner"))()'),'Cookie session did not restore',25000);
 forceRefreshFailure=true;
 await cdp.evaluate(tab,'window.__ciRealDateNow=Date.now;Date.now=()=>window.__ciRealDateNow()+901000;');
 const rateStart=api.length;
 await cdp.evaluate(tab,'fetch("/api/academy/lesson-media/list",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("m4l_account_token"),"X-Academy-Workspace":"LEARN"},body:JSON.stringify({activityKey:"COURSE:FEATURE-SYNTHETIC-A"})}).then(()=>{window.__ciRateRejected=false;},()=>{window.__ciRateRejected=true;})');
 await until(()=>cdp.evaluate(tab,'window.__ciRateRejected===true'),'Controlled renewal rejection did not occur',15000);
 assert(api.slice(rateStart).some(r=>r.path==='/auth/v110/refresh'&&r.status===429));
 const logoutStart=api.length;
 await cdp.evaluate(tab,'(document.querySelector("[data-circles-sign-out]")||document.getElementById("academy-sign-out")).click()');
 await until(()=>api.some(r=>r.path==='/auth/v110/logout'&&r.status===200),'Own-family cancellation did not finish',15000);
 await until(()=>cdp.evaluate(tab,'document.documentElement.classList.contains("uaa-v110-masked")'),'Private display did not clear after logout');
 assert(!api.slice(logoutStart).some(r=>r.path==='/auth/v110/refresh'),'Explicit cancellation must not wait for replacement');
 const ended=await fixture.runtime.getD1Database('ACADEMY_DB','api');const active=await ended.prepare("SELECT count(*) n FROM account_sessions WHERE account_id='feature-synthetic-learner-a' AND revoked_at IS NULL").first();assert.equal(active.n,0);
 assert.equal(options,0);assert.equal(outside,0);assert(api.every(r=>r.metrics&&r.metrics.remoteCalls===0),'Every dispatched API must retain actual local telemetry');
 const totals={workerRequests:api.length,privateCoordinatorCalls:0,d1Statements:0,d1RoundTrips:0,d1RowsRead:0,d1RowsWritten:0,r2Operations:0};
 for(const r of api){totals.privateCoordinatorCalls+=r.metrics.coordinatorCalls;for(const v of Object.values(r.metrics.d1)){totals.d1Statements+=v.statements;totals.d1RoundTrips+=v.roundTrips;totals.d1RowsRead+=v.rowsRead;totals.d1RowsWritten+=v.rowsWritten;}totals.r2Operations+=Object.values(r.metrics.r2).reduce((a,b)=>a+b,0);}
 const report={schema:1,commit:process.env.GITHUB_SHA,kind:'GENUINE_CHROME_LOCAL_NATIVE_COOKIE_PILOT',version,origin,certificate:'Disposable self-signed certificate; Chrome trust errors ignored ONLY in this local fixture. Hosted TLS/DNS/cutover is not proved.',checks:{realNativePIN:true,fourthDigitSingleSubmit:true,browserInstalledHostOnlyHttpOnlyCookies:true,cookieHiddenFromJavaScript:true,nativeOwnAndOtherCourse:true,genuineForegroundOwnRefresh:true,backgroundReplacementDoesNotAdvanceClock:true,renewalClock:'Renderer expiry clock advanced; server/SQL clocks unchanged',reloadRestore:true,anonymousPublicReadsWithoutAuth:true,unrelatedActiveGestureDoesNotAdvanceClock:true,cancellationAfterFailedRenewal:true,serverCancellationObserved:true,browserReceiptOfCancellationIndependentlyProved:false,preflightRequests:options,outsideRequests:outside,blockedPublicFontRequests:blockedPublicFonts,blockedPublicLegacyImageRequests:blockedLegacyImages},publicDateSource:'Local unavailable-response stub; no request to the public calendar site',unavailablePublicServices:api.filter(r=>r.status===503&&r.path.startsWith('/api/public/')).map(r=>({path:r.path,status:r.status})),verificationD1Statements:7,blockedExternal,staticRequests:staticRequests.length,api,totals,hostedWorkerCalls:0,hostedDBChanges:0,limits:'Academy native workspace pilot only. No child admission, token-expiry wall-clock, visible freeze/first resumed paint, media Range or hosted proof.'};
 await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'genuine-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks,totals,hostedWorkerCalls:0}));
});
