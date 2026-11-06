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
 let browser,cdp;const api=[],staticRequests=[];let outside=0,options=0;
 t.after(async()=>{try{await cdp?.call('Browser.close');}catch{}cdp?.ws.close();browser?.kill('SIGKILL');await new Promise(resolve=>server.close(resolve));await fixture.close();});
 const key=join(directory,'local-TLS.key'),cert=join(directory,'local-TLS.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=feature_worker.maktab4life.workers.dev','-addext','subjectAltName=DNS:feature_worker.maktab4life.workers.dev'],{stdio:'ignore'});
 const server=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{void serve(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local browser fixture failed');});});
 async function serve(req,res){
  const url=new URL(req.url,origin);
  if(req.method==='OPTIONS')options++;
  if(url.pathname.startsWith('/api/')||/^\/auth\/v110\/(?:login|setup-pin|context|csrf|refresh)$/.test(url.pathname)){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw Error('Bounded local browser request');chunks.push(chunk);}
   const response=await fixture.runtime.dispatchFetch(url.href,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const metrics=JSON.parse(response.headers.get('x-feature-local-budget'));api.push({path:url.pathname,method:req.method,status:response.status,metrics,...(url.pathname==='/auth/v110/refresh'?{foreground:JSON.parse(Buffer.concat(chunks).toString()).foreground}: {})});
   const headers=Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'&&k!=='content-length'));headers['set-cookie']=response.headers.getSetCookie();
   res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let file=decodeURIComponent(url.pathname).slice(1);if(!file||file.endsWith('/'))file+='index.html';
  if(!allowed.has(file)||file.split('/').some(p=>p==='..')){res.writeHead(404);res.end('Not found');return;}
  staticRequests.push({path:url.pathname,method:req.method});
  res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(join(build.directory,file)));
 }
 await new Promise(resolve=>server.listen(443,'127.0.0.1',resolve));
 const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);assert(executable,'Runner Chrome required');
 const version=execFileSync(executable,['--version'],{encoding:'utf8'}).trim();
 browser=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--no-proxy-server','--ignore-certificate-errors','--host-resolver-rules=MAP feature_worker.maktab4life.workers.dev 127.0.0.1','--remote-debugging-port=0','--user-data-dir='+directory,'about:blank'],{stdio:'ignore'});
 const portFile=await until(async()=>{try{return await readFile(join(directory,'DevToolsActivePort'),'utf8');}catch{return null;}},'Chrome did not start');
 const [port,path]=portFile.trim().split('\n');cdp=await CDP.open('ws://127.0.0.1:'+port+path);
 cdp.onEvent=m=>{if(m.method==='Fetch.requestPaused'){const url=new URL(m.params.request.url);const good=url.origin===origin;if(!good)outside++;void cdp.call(good?'Fetch.continueRequest':'Fetch.failRequest',good?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'},m.sessionId);}};
 const {targetId}=await cdp.call('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.call('Target.attachToTarget',{targetId,flatten:true}),tab={id:targetId,session:sessionId};
 for(const name of ['Page.enable','Runtime.enable','Network.enable','Fetch.enable'])await cdp.call(name,name==='Fetch.enable'?{patterns:[{urlPattern:'*'}]}:{},sessionId);
 await cdp.call('Target.activateTarget',{targetId});await cdp.call('Page.navigate',{url:origin+'/academy/#login'},sessionId);
 await until(()=>cdp.evaluate(tab,'Boolean(document.querySelector("[data-uaa-open-sign-in]"))&&Boolean(window.M4L_ACADEMY_LOGIN)'),'Public Feature sign-in action missing',20000);
 await cdp.evaluate(tab,'document.querySelector("[data-uaa-open-sign-in]").click()');
 await until(()=>cdp.evaluate(tab,'Boolean(window.M4L_ACADEMY_LOGIN)&&document.getElementById("academy-login-dialog")?.open'),'Native public PIN dialog did not open',20000);
 await cdp.evaluate(tab,'document.getElementById("demo-username").focus()');
 await cdp.call('Input.insertText',{text:'feature-test-learner'},sessionId);
 await cdp.evaluate(tab,'document.getElementById("demo-pin").focus()');
 await cdp.call('Input.insertText',{text:'2468'},sessionId);
 await until(()=>cdp.evaluate(tab,'document.documentElement.dataset.uaaV110State==="ready"&&document.getElementById("academy-header-name")?.textContent==="Feature synthetic learner"'),'Actual native PIN/cookie sign-in did not reveal current account',25000);
 assert.equal(api.filter(r=>r.path==='/auth/v110/login'&&r.status===200).length,1,'Fourth digit should submit once');
 const cookieState=await cdp.call('Storage.getCookies');const cookies=cookieState.cookies.filter(c=>c.name==='__Secure-uaa_a'||c.name==='__Host-uaa_r');assert.equal(cookies.length,2);assert(cookies.every(c=>c.secure&&c.httpOnly&&c.domain==='feature_worker.maktab4life.workers.dev'&&c.sameSite==='Lax'));
 assert(await cdp.evaluate(tab,'!document.cookie.includes("uaa_")'),'HttpOnly credentials must be hidden from document.cookie');
 assert(await cdp.evaluate(tab,'/^uaa-(session|context):/.test(localStorage.getItem("m4l_account_token")||"")'),'Existing UI storage must contain a nonsecret selector');
 const read=activity=>cdp.evaluate(tab,'(async()=>{const r=await fetch("/api/academy/lesson-media/list",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("m4l_account_token"),"X-Academy-Workspace":"LEARN"},body:JSON.stringify({activityKey:'+JSON.stringify(activity)+'})});await r.json();return r.status;})()');
 assert.equal(await read('COURSE:FEATURE-SYNTHETIC-A'),200);assert.equal(await read('COURSE:FEATURE-SYNTHETIC-B'),403);
 const inspected=await fixture.runtime.getD1Database('ACADEMY_DB','api');
 const foregroundBefore=await inspected.prepare("SELECT last_fg_refresh_s,original_expires_at_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 await sleep(1100);
 // Advance ONLY the renderer's expiry clock; issuer/SQL clocks stay real.
 // A trusted Chrome click must trigger this app's own required renewal.
 await cdp.evaluate(tab,'(()=>{window.__ciRealDateNow=Date.now;Date.now=()=>window.__ciRealDateNow()+901000;const b=document.createElement("button");b.id="jwt-ci-foreground";b.textContent="Synthetic foreground query";b.style.cssText="position:fixed;top:10px;left:10px;z-index:2147483647";b.onclick=async()=>{const r=await fetch("/api/academy/lesson-media/list",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("m4l_account_token"),"X-Academy-Workspace":"LEARN"},body:JSON.stringify({activityKey:"COURSE:FEATURE-SYNTHETIC-A"})});await r.json();window.__ciForegroundStatus=r.status;Date.now=window.__ciRealDateNow;};document.body.append(b);})()');
 const point=await cdp.evaluate(tab,'(()=>{const r=document.getElementById("jwt-ci-foreground").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
 await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
 await until(()=>cdp.evaluate(tab,'window.__ciForegroundStatus===200'),'Actual foreground-triggered own renewal/query did not finish',20000);
 const foregroundAfter=await inspected.prepare("SELECT last_fg_refresh_s,original_expires_at_s FROM jwt_v110_families WHERE account_id='feature-synthetic-learner-a' AND revoked=0").first();
 assert(foregroundAfter.last_fg_refresh_s>foregroundBefore.last_fg_refresh_s);assert.equal(foregroundAfter.original_expires_at_s,foregroundBefore.original_expires_at_s);assert(api.some(r=>r.path==='/auth/v110/refresh'&&r.status===200&&r.foreground===true));
 assert(await cdp.evaluate(tab,'document.documentElement.dataset.uaaV110State==="ready"'),'Ordinary same-session renewal must retain the checked private view');
 await cdp.call('Page.reload',{},sessionId);
 await until(()=>cdp.evaluate(tab,'document.documentElement.dataset.uaaV110State==="ready"&&document.getElementById("academy-header-name")?.textContent==="Feature synthetic learner"'),'Cookie session did not restore',25000);
 await cdp.evaluate(tab,'document.getElementById("academy-sign-out").click()');
 await until(()=>api.some(r=>r.path==='/api/account/logout'&&r.status===200),'Actual logout was not acknowledged',15000);
 await until(()=>cdp.evaluate(tab,'document.documentElement.classList.contains("uaa-v110-masked")'),'Private display did not clear after logout');
 const ended=await fixture.runtime.getD1Database('ACADEMY_DB','api');const active=await ended.prepare("SELECT count(*) n FROM account_sessions WHERE account_id='feature-synthetic-learner-a' AND revoked_at IS NULL").first();assert.equal(active.n,0);
 assert.equal(options,0);assert.equal(outside,0);assert(api.every(r=>r.metrics.remoteCalls===0));
 const totals={workerRequests:api.length,privateCoordinatorCalls:0,d1Statements:0,d1RoundTrips:0,d1RowsRead:0,d1RowsWritten:0,r2Operations:0};
 for(const r of api){totals.privateCoordinatorCalls+=r.metrics.coordinatorCalls;for(const v of Object.values(r.metrics.d1)){totals.d1Statements+=v.statements;totals.d1RoundTrips+=v.roundTrips;totals.d1RowsRead+=v.rowsRead;totals.d1RowsWritten+=v.rowsWritten;}totals.r2Operations+=Object.values(r.metrics.r2).reduce((a,b)=>a+b,0);}
 const report={schema:1,commit:process.env.GITHUB_SHA,kind:'GENUINE_CHROME_LOCAL_NATIVE_COOKIE_PILOT',version,origin,certificate:'Disposable self-signed certificate; Chrome trust errors ignored ONLY in this local fixture. Hosted TLS/DNS/cutover is not proved.',checks:{realNativePIN:true,fourthDigitSingleSubmit:true,browserInstalledHostOnlyHttpOnlyCookies:true,cookieHiddenFromJavaScript:true,nativeOwnAndOtherCourse:true,genuineForegroundOwnRefresh:true,renewalClock:'Renderer expiry clock advanced; server/SQL clocks unchanged',reloadRestore:true,logoutAcknowledged:true,preflightRequests:options,outsideRequests:outside},verificationD1Statements:3,staticRequests:staticRequests.length,api,totals,hostedWorkerCalls:0,hostedDBChanges:0,limits:'Academy native workspace pilot only. No child admission, token-expiry wall-clock, visible freeze/first resumed paint, media Range or hosted proof.'};
 await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'genuine-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks,totals,hostedWorkerCalls:0}));
});
