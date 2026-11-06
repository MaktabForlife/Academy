// Disposable GitHub only; real paired native/Studio Workers, synthetic data.
import assert from 'node:assert/strict';
import https from 'node:https';import http from 'node:http';import net from 'node:net';import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hosting} from '../backend/src/academy/hosting.mjs';
import {serveAcademySite} from '../backend/tools/academy-site.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
process.env.ACADEMY_SOURCE=resolve('.');
const studioRoot=resolve('studio-source'),assets=resolve('.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'original-reader-evidence');
// The generic paired fixture defaults the portal to Studio itself. The real
// connector correctly rejects that. Select the explicit reviewed synthetic
// portal binding in a disposable copy; application source and guards are exact.
const fixturePath=studioRoot+'/tests/fixture.mjs',fixtureText=await readFile(fixturePath,'utf8'),fixtureMarker="const env={PLATFORM_ENABLED:'1',";
assert.equal(fixtureText.split(fixtureMarker).length,2);
const configuredFixture=fixtureText.replace(fixtureMarker,"const env={ACADEMY_PORTAL_ORIGIN:"+JSON.stringify(hosting().academyPortalOrigin)+",PLATFORM_ENABLED:'1',");
await writeFile(studioRoot+'/tests/ui-original-reader-fixture.mjs',configuredFixture);
const {fixture}=await import(pathToFileURL(studioRoot+'/tests/ui-original-reader-fixture.mjs'));
const {accessFixture,signIn}=await import(pathToFileURL(studioRoot+'/tests/access-fixture.mjs'));
const {chromium,webkit}=await import(pathToFileURL(resolve(process.env.REVIEW_BROWSER_MODULES,'node_modules/playwright/index.mjs')));
const h=hosting(),portal=h.academyPortalOrigin,studio=h.studioOrigin,website='site-course';
const f=await fixture({academy:true,authorityMode:'ACADEMY',dashboard:true,websiteOrigin:studio,verification:{accountSeconds:43200,adminSeconds:60,liveSeconds:43200}});
const access=await accessFixture(f);await access.recover(2);await signIn(f,'studentA');await f.run('DELETE FROM sessions');
const source=async(path,body,token='')=>f.runtime.dispatchFetch('https://academy.test'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:portal,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const login=await source('/api/account/login',{uniqueid:'separation-studentA',pin:'1234'}),signed=await login.json();assert.equal(login.status,200);assert(signed.token);
await mkdir(out,{recursive:true});
const browserName=process.env.REVIEW_BROWSER||'chromium';assert(['chromium','webkit'].includes(browserName));const browser=await({chromium,webkit}[browserName]).launch({headless:true});
const originalFetch=globalThis.fetch;let nodeRemoteAttempts=0;globalThis.fetch=async()=>{nodeRemoteAttempts++;throw Error('Unexpected remote call');};
const errors=[],records=[],calls=[],blocked=[],diagnostics=[],sockets=new Set();let candidateMode=false,proxyConnections=0;
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
async function fileResponse(root,path){
 const file=resolve(root,'.'+decodeURIComponent(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root+'/'))return new Response('Not found',{status:404});
 try{return new Response(await readFile(file),{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
}
// Private TLS material exists only in the disposable runner, outside artifacts.
// Certificate verification is relaxed only in this closed synthetic context;
// this is NOT real-host TLS/CSP proof. The proxy never resolves/connects a host.
const tlsRoot=resolve(process.env.RUNNER_TEMP,'original-reader-private-tls');await mkdir(tlsRoot,{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tlsRoot+'/key.pem','-out',tlsRoot+'/cert.pem','-days','1','-subj','/CN=synthetic-loopback-review'],{stdio:'ignore'});
async function respond(url,method,headers,body){
 const candidate=candidateMode;
 if(url.origin===h.academyApiOrigin&&url.pathname.startsWith('/api/')){
  calls.push({candidate,app:'academy',path:url.pathname,method});
  return f.runtime.dispatchFetch(new URL(url.pathname+url.search,'https://academy.test').href,{method,headers,...(body.length?{body}:{})});
 }
 if(url.origin===studio&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))){
  calls.push({candidate,app:'studio',path:url.pathname,method,hasCookie:Boolean(headers.cookie)});
  const response=await f.runtime.dispatchFetch(url.href,{method,headers,...(body.length?{body}:{})});
  let safe;try{const data=await response.clone().json();safe={signedIn:data.signedIn,code:data.code,error:data.error,hasWebsite:Boolean(data.website),hasAccount:Boolean(data.account),websiteError:data.errors?.website};}catch{}
  const set=response.headers.get('Set-Cookie');diagnostics.push({candidate,app:'studio',path:url.pathname,status:response.status,...safe,...(set?{setCookieName:set.split('=')[0],setCookieFlags:set.split(';').slice(1).map(x=>x.trim())}:{})});
  return response;
 }
 if(url.origin===portal&&url.pathname==='/__review/original-reader'){
  const module=candidate?'/js/m4l-existing-media-view.mjs':'/__review/frozen-existing-media-view.mjs';
  return new Response('<!doctype html><html><body><main id="links"></main><script type="module">import {existingSourceWebsiteLinks'+(candidate?',academyReaderOrigin':'')+'} from '+JSON.stringify(module)+';const origin='+JSON.stringify(studio)+',readerOrigin='+(candidate?'academyReaderOrigin('+JSON.stringify({portalOrigin:portal,studioOrigin:studio,currentOrigin:portal,websiteOrigin:studio})+')':'origin')+';document.getElementById("links").innerHTML=existingSourceWebsiteLinks([{websiteId:'+JSON.stringify(website)+',title:"Selected synthetic original",websitePublished:true}],{origin,readerOrigin});</script></body></html>',{headers:{'Content-Type':'text/html'}});
 }
 if(url.origin===portal&&url.pathname==='/__review/frozen-existing-media-view.mjs')return fileResponse(resolve('baseline-source'),'/js/m4l-existing-media-view.mjs');
 if(url.origin===portal)return serveAcademySite(new Request(url.href,{method}),{ASSETS:{fetch:r=>fileResponse(assets,new URL(r.url).pathname)}});
 if(url.origin===studio)return fileResponse(studioRoot+'/public',url.pathname);
 throw Error('Unknown synthetic origin');
}
const allowedOrigins=new Set([portal,studio,h.academyApiOrigin]),allowedHosts=new Set([...allowedOrigins].map(v=>new URL(v).hostname));
const server=https.createServer({key:await readFile(tlsRoot+'/key.pem'),cert:await readFile(tlsRoot+'/cert.pem')},async(req,res)=>{
 try{
  const url=new URL(req.url,'https://'+req.headers.host);if(!allowedOrigins.has(url.origin)){res.writeHead(403);res.end();return;}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw Error('Synthetic request limit');chunks.push(chunk);}
  const response=await respond(url,req.method,{...req.headers},Buffer.concat(chunks));
  const headers=Object.fromEntries(response.headers),cookies=response.headers.getSetCookie?.();if(cookies?.length)headers['set-cookie']=cookies;
  res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){diagnostics.push({transportError:true,name:error.name});if(!res.headersSent)res.writeHead(500);res.end('Synthetic transport failed');}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const localPort=server.address().port;
const proxy=http.createServer((_req,res)=>{res.writeHead(403);res.end();});
proxy.on('connect',(req,client,head)=>{
 const target=new URL('http://'+req.url);
 if(!allowedHosts.has(target.hostname)||target.port!=='443'){blocked.push('proxy:'+target.hostname);client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 proxyConnections++;const upstream=net.connect({host:'127.0.0.1',port:localPort},()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
 for(const socket of [client,upstream]){sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{client.destroy();upstream.destroy();});}
});
await new Promise(done=>proxy.listen(0,'127.0.0.1',done));const proxyUrl='http://127.0.0.1:'+proxy.address().port;
async function contextFor(candidate){
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',proxy:{server:proxyUrl},ignoreHTTPSErrors:true});
 await context.addInitScript(({portal,token})=>{if(location.origin===portal)localStorage.setItem('m4l_account_token',token);},{portal,token:signed.token});
 context.on('page',page=>page.on('pageerror',e=>errors.push({candidate,message:e.message})));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(allowedOrigins.has(url.origin))return route.continue();blocked.push(url.origin);return route.abort();});
 return context;
}
try{
 // Frozen old link reaches the actual reader without a Studio session, so it
 // asks for sign-in even though the Academy origin has a valid native token.
 candidateMode=false;const before=await contextFor(false),oldPage=await before.newPage();await oldPage.goto(portal+'/__review/original-reader');
 const oldLink=oldPage.getByRole('link',{name:'Read original website'});assert.equal(await oldLink.getAttribute('href'),studio+'/studio/?website='+website);
 const oldChildPromise=before.waitForEvent('page');await oldLink.click();const oldChild=await oldChildPromise;
 await oldChild.locator('#sign-in-dialog[open]').waitFor();records.push({case:'frozen-direct-link',asksForSecondSignIn:true,target:new URL(oldChild.url()).pathname+new URL(oldChild.url()).search});await oldChild.screenshot({path:resolve(out,'baseline-second-signin.png'),fullPage:true});await before.close();
 await f.run('DELETE FROM sessions');
 candidateMode=true;const after=await contextFor(true),page=await after.newPage();await page.goto(portal+'/__review/original-reader');
 const link=page.getByRole('link',{name:'Read original website'});assert.equal(await link.getAttribute('href'),portal+'/studio/?website='+website);assert.equal(await link.getAttribute('target'),'_blank');assert((await link.getAttribute('rel')).includes('noopener'));
 const start=calls.length,next=after.waitForEvent('page');await link.click();const child=await next;
 await child.locator('#course-reader:not([hidden])').waitFor({timeout:25000});assert.match(await child.locator('#course-reader').textContent(),/Synthetic whole Course/);
 assert.equal(new URL(child.url()).origin+new URL(child.url()).pathname+new URL(child.url()).search,studio+'/studio/?website='+website);assert.equal(new URL(child.url()).hash,'#view=home');assert.equal(await child.locator('#sign-in-dialog').isVisible(),false);assert.equal(await child.evaluate(()=>window.opener===null),true);assert.equal(after.pages().length,2);
 assert.equal(page.url(),portal+'/__review/original-reader');
 const flow=calls.slice(start);assert.equal(flow.filter(x=>x.app==='academy'&&x.path==='/api/academy/hub/studio-start'&&x.method==='POST').length,1);assert.equal(flow.filter(x=>x.app==='studio'&&x.path==='/auth/exchange'&&x.method==='POST').length,1);assert.equal(flow.filter(x=>x.path==='/auth/login'||x.path==='/api/account/login').length,0);
 assert(!/[#&](?:code|state|verifier)=/.test(new URL(child.url()).hash));assert(!(await child.evaluate(()=>sessionStorage.getItem('m4l_studio_native_connect_v1'))));
 records.push({case:'candidate-existing-native-pkce',exactSelectedWebsite:true,readerVisibleWithoutExtraOpen:true,noSecondPin:true,newTabException:true,noopener:true,previousPageRetained:true,sourceIssuances:1,exchanges:1,flow});
 await child.screenshot({path:resolve(out,'candidate-original-reader.png'),fullPage:true});await after.close();
 assert.deepEqual(errors,[]);assert.equal(nodeRemoteAttempts,0);
}finally{
 for(const [ci,context]of browser.contexts().entries())for(const [pi,page]of context.pages().entries()){
  try{diagnostics.push({cookies:(await context.cookies()).map(c=>({name:c.name,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite})),context:ci,page:pi,url:new URL(page.url()).origin+new URL(page.url()).pathname,status:await page.locator('[role=status]').allTextContents(),connectRetry:await page.locator('#academy-connect-retry:not([hidden])').count()});await page.screenshot({path:resolve(out,'failure-context-'+ci+'-'+pi+'.png'),fullPage:true});}catch{}
 }
 await writeFile(resolve(out,'report.json'),JSON.stringify({commit:process.env.GITHUB_SHA,studioSource:'3c420f35c30297cfcc41cfab24f030e51bb7831e',browser:browserName,records,calls,diagnostics,pageErrors:errors,blockedOrigins:[...new Set(blocked)],nodeRemoteAttempts,hostedApplicationCalls:0,hostedD1Calls:0,syntheticPairedWorkers:true,transport:'closed-loopback-https-proxy',syntheticSelfSignedTlsOnly:true,realHostedTlsProved:false,proxyConnections,explicitSyntheticPortalBinding:true,applicationWorkerSourceUnchanged:true,fixtureLinkContainer:true,actualFullCourseMediaPageProved:false},null,2));
 await browser.close();for(const socket of sockets)socket.destroy();await Promise.all([new Promise(done=>proxy.close(done)),new Promise(done=>server.close(done))]);globalThis.fetch=originalFetch;await f.close();
}
