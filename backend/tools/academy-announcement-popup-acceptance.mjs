// All learner rosters and requests in this browser run are synthetic.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {enrolmentFixture,ok} from '../tests/fixtures/academy-enrolment-fixture.mjs';
const [assetsArg,outputArg]=process.argv.slice(2),assets=resolve(assetsArg),out=resolve(outputArg);mkdirSync(out,{recursive:true});
const f=await enrolmentFixture(),checks=[],errors=[],failures=[];let origin,loseCopy=false;
const posterId=crypto.randomUUID(),svgPoster='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#eee3f1"/><text x="300" y="100" font-size="32" text-anchor="middle" fill="#704578">Academy announcement</text><text x="300" y="930" font-size="26" text-anchor="middle">Full poster bottom</text></svg>';
const objects=new Map();f.env.LESSON_MEDIA_BUCKET={async put(k,b){objects.set(k,new Uint8Array(b));},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}};
const message=Array.from({length:25},(_,i)=>"Complete announcement paragraph "+(i+1)).join("\n")+"\n[Join the Academy](/academy/enrolment/)\n[Contact Admin](https://wa.me/27828478639)\n<img src=x onerror=alert(1)>";
const form=new FormData();form.append("metadata",JSON.stringify({id:posterId,revision:0,operationId:crypto.randomUUID(),title:"Academy poster with details",message,imageAlt:"Complete Academy poster",active:true,order:0,removeImage:false,removePdf:false}));form.append("image",new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=","base64")],{type:"image/png"}),"poster.png");form.append("pdf",new Blob(["%PDF-1.4\n% Synthetic prospectus\n%%EOF"],{type:"application/pdf"}),"prospectus.pdf");
const saved=await worker.fetch(new Request("http://localhost/api/admin/platform/announcements/save",{method:"POST",headers:{Authorization:"Bearer "+f.tokens.admin},body:form}),f.env);assert.equal(saved.status,200,await saved.clone().text());
const second=JSON.parse(form.get('metadata'));Object.assign(second,{id:crypto.randomUUID(),title:'Academy prospectus',order:1,operationId:crypto.randomUUID()});form.set('metadata',JSON.stringify(second));const secondSaved=await worker.fetch(new Request('http://localhost/api/admin/platform/announcements/save',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin},body:form}),f.env);assert.equal(secondSaved.status,200);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG='+JSON.stringify({API_BASE:origin,ENV_NAME:'development',IS_DEVELOPMENT:true,HIFZHELPER_URL:'https://maktab.hifz-helper.app/'}));return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);if(loseCopy&&url.pathname==='/api/admin/platform/programs/copy'&&response.status===200){loseCopy=false;res.writeHead(503,{'Content-Type':'application/json','X-Synthetic-Lost-Ack':'yes'});res.end(JSON.stringify({success:false,error:'Synthetic lost acknowledgement. Retry the same request.'}));return;}if(url.pathname==='/api/academy/announcements/image'&&response.status===200){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(svgPoster);return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const name=decodeURIComponent(url.pathname),file=resolve(assets,'.'+name+(name.endsWith('/')?'index.html':''));if(!file.startsWith(assets+'/'))throw Error('INVALID_PATH');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
 }catch(e){if(!res.headersSent)res.writeHead(e.code==='ENOENT'?404:500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function pageFor(role,width=1440){const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<700,hasTouch:width<700});if(role)await context.addInitScript(t=>localStorage.setItem('m4l_account_token',t),f.tokens[role]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.url().includes('/api/')&&r.status()>=400&&!r.headers()['x-synthetic-lost-ack']&&!r.headers()['x-synthetic-announcement-failure'])failures.push({path:new URL(r.url()).pathname,status:r.status(),role});});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());page.on('dialog',d=>d.accept());return {page,context};}
const noOverflow=async page=>{const s=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert(s.s<=s.w+1,JSON.stringify(s));};
try{
 for(const role of [undefined,'student'])for(const width of [320,390,1440]){
  const {page,context}=await pageFor(role,width);let release,arrived,headers;
  const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{arrived=resolve;});
  await page.route('**/api/academy/announcements',async route=>{headers=route.request().headers();arrived();await held;await route.continue();});
  await page.goto(origin+'/academy/',{waitUntil:'domcontentloaded'});await started;
  const news=page.locator('#academy-announcements');await news.getByRole('status').filter({hasText:'Loading announcements…'}).waitFor();assert.equal(await news.getAttribute('aria-busy'),'true');
  for(const name of ['authorization','x-academy-workspace','x-academy-setup','x-academy-class'])assert.equal(headers[name],undefined);
  await page.evaluate(()=>window.dispatchEvent(new Event('m4l-academy-session')));
  if(width===390)await page.screenshot({path:join(out,'announcement-loading-'+(role||'visitor')+'-'+width+'.png'),fullPage:false});
  release();await page.getByRole('button',{name:'Open announcement: Academy poster with details',exact:true}).waitFor();assert.equal(await news.getAttribute('aria-busy'),'false');assert.equal(await news.getByText('Announcements could not be loaded.').count(),0);await noOverflow(page);
  checks.push('Slow initial announcement load survives session restoration: '+(role||'visitor')+' '+width);
  await context.close();
 }
 for(const width of [390,1440]){
  const {page,context}=await pageFor(undefined,width);let attempts=0,release,arrived;
  const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{arrived=resolve;});
  await page.route('**/api/academy/announcements',async route=>{
   if(++attempts===1){await route.fulfill({status:503,contentType:'application/json',headers:{'X-Synthetic-Announcement-Failure':'yes'},body:JSON.stringify({success:false})});return;}
   arrived();await held;await route.continue();
  });
  await page.goto(origin+'/academy/');const news=page.locator('#academy-announcements');await news.getByRole('button',{name:'Try again',exact:true}).click();await started;
  await news.getByRole('status').filter({hasText:'Loading announcements…'}).waitFor();assert.equal(await news.getAttribute('aria-busy'),'true');assert.equal(await news.getByText('Announcements could not be loaded.').count(),0);assert.equal(await news.getByRole('button',{name:'Try again',exact:true}).count(),0);
  await page.screenshot({path:join(out,'announcement-retry-loading-'+width+'.png'),fullPage:false});release();await page.getByRole('button',{name:'Open announcement: Academy poster with details',exact:true}).waitFor();assert.equal(await news.getAttribute('aria-busy'),'false');
  checks.push('Failed request retries with a loading message: '+width);await context.close();
 }
 const {page:visitor}=await pageFor();await visitor.goto(origin+'/academy/');const opener=visitor.getByRole('button',{name:'Open announcement: Academy poster with details',exact:true});await opener.waitFor();
 for(const width of [390,1440]){
  await visitor.setViewportSize({width,height:1000});assert.equal(await visitor.locator('.announcement-slide').count(),2);
  assert.equal(await visitor.locator('#academy-announcements .announcement-copy').count(),0);assert.equal(await visitor.locator('#academy-announcements .announcement-message').count(),0);assert.equal(await visitor.locator('#academy-announcements h3').count(),0);await visitor.screenshot({path:join(out,'announcement-bricks-'+width+'.png'),fullPage:false});
  await visitor.setViewportSize({width,height:1000});await opener.click();const dialog=visitor.locator('dialog.announcement-lightbox');await dialog.waitFor({state:'visible'});await visitor.waitForFunction(()=>document.querySelector('.announcement-lightbox img').complete&&document.querySelector('.announcement-lightbox img').naturalHeight===1000);
  assert.equal(await dialog.getByRole('heading',{name:'Academy poster with details'}).count(),1);assert.match(await dialog.locator('.announcement-message').innerText(),/Complete announcement paragraph 25/);assert.equal(await dialog.locator('img').count(),1);assert.equal(await dialog.locator('script').count(),0);
  assert.equal(await dialog.getByRole('link',{name:'Join the Academy',exact:true}).getAttribute('href'),origin+'/academy/enrolment/');assert.equal(await dialog.getByRole('link',{name:'Contact Admin',exact:true}).getAttribute('href'),'https://wa.me/27828478639');assert((await dialog.getByRole('link',{name:'Open PDF · prospectus.pdf',exact:true}).getAttribute('href')).includes('/api/academy/announcements/pdf?id='));
  const dimensions=await dialog.evaluate(d=>{const i=d.querySelector('img'),r=i.getBoundingClientRect();return {width:d.clientWidth,scroll:d.scrollWidth,height:d.getBoundingClientRect().height,viewport:innerHeight,ratio:r.width/r.height};});assert(dimensions.scroll<=dimensions.width+1);assert(dimensions.height<=dimensions.viewport);assert(Math.abs(dimensions.ratio-0.6)<0.01);await noOverflow(visitor);await visitor.screenshot({path:join(out,'announcement-popup-'+width+'.png'),fullPage:true});await dialog.evaluate(d=>d.scrollTop=d.scrollHeight);await visitor.screenshot({path:join(out,'announcement-popup-links-'+width+'.png'),fullPage:true});
  await visitor.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert(await opener.evaluate(n=>n===document.activeElement));
 }
 checks.push('Poster opens a complete uncropped image with heading and all message paragraphs');checks.push('Internal, WhatsApp and PDF links remain clickable and safely rendered');checks.push('Phone and desktop modal layouts fit the viewport and preserve the poster aspect ratio');checks.push('Escape closes the popup and returns keyboard focus to its picture');
 await opener.click();await visitor.getByRole('button',{name:'Close announcement',exact:true}).click();await visitor.locator('dialog.announcement-lightbox').waitFor({state:'detached'});assert.equal(await visitor.locator('dialog.announcement-lightbox').count(),0);checks.push('Close button removes the popup');checks.push('Homepage contains image bricks without separate headings or message text');
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);const report={success:true,checks,errors,failures,syntheticOnly:true,liveAnnouncementsCreated:0};writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
