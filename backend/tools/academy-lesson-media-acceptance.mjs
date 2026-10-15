// Local acceptance: real Academy page + real Worker, isolated fixture D1/R2.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import worker from '../src/academy-runtime.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MEDIA_BROWSER_RUNTIME||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.MEDIA_ACCEPTANCE_OUTPUT||path.join(tmpdir(),'academy-lesson-media-acceptance');mkdirSync(out,{recursive:true});
const f=await mediaFixture(),tokens={student:await f.login('0002'),peer:await f.login('0008'),teacher:await f.login('0003'),admin:await f.login('0001'),other:await f.login('0005')},errors=[],calls=[];
let loseUpload=true,holdWatch=false,releaseWatch;
const server=createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),target=path.resolve(root,'.'+decodeURIComponent(url.pathname)),file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;if(!target.startsWith(root))throw Error('Invalid path');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MEDIA_CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)}),page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.origin;calls.push(url.pathname);
 const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method(),headers,...(req.method()==='POST'?{body:req.postDataBuffer()}:{})}),f.env);
 if(url.pathname.endsWith('/lesson-media/watch')&&holdWatch){holdWatch=false;await new Promise(resolve=>{releaseWatch=resolve;});}
 if(url.pathname.endsWith('/lesson-media/upload')&&loseUpload&&response.ok){loseUpload=false;await route.abort('connectionreset');return;}
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
});
await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated recording player</title>'}));
const activity='#activity/PROGRAM/PRG-656bcece-4310-49c7-87d7-ee06756f66c1';
const cards=()=>page.locator('#mou-lesson-media .lm-card');
async function identity(who){await page.goto(origin+'/version.json');await page.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',t);},tokens[who]);await page.goto(origin+'/academy/'+activity);await cards().first().waitFor();}
async function close(){await page.locator('.lm-dialog [data-lm=close]').click();await page.locator('.lm-dialog').waitFor({state:'detached'});}
async function action(name){await page.locator('.lm-dialog [data-lm="'+name+'"]').first().click();}
async function saved(){await page.waitForFunction(()=>{const d=document.querySelector('.lm-dialog');return d&&!d.hasAttribute('aria-busy')&&d.querySelector('[data-lm-dialog-message]')?.textContent==='Saved.';});}
try{
 await identity('student');assert.equal(await cards().count(),3);assert.equal(await page.locator('[data-lm=edit]').count(),0);assert.equal(calls.filter(p=>p.endsWith('/lesson-media/watch')).length,0);
 const heights=await cards().evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));assert.equal(new Set(heights).size,1);
 await cards().first().locator('[data-lm=watch]').click();await page.locator('.lm-player').waitFor();assert.match(await page.locator('.lm-player').getAttribute('src'),/CZPSPSG85NQ/);await close();assert.equal(await page.locator('.lm-player').count(),0);
 await cards().first().locator('[data-lm=discussion]').click();await page.locator('[data-lm-form=comment] textarea').fill('How can I practise this lesson? <script>alert(1)</script>');await page.locator('[data-lm-form=comment] button[type=submit]').click();await saved();assert.equal(await page.locator('.lm-comment .pending').innerText(),'Awaiting approval');assert.equal(await page.locator('.lm-comment script').count(),0);await close();
 await identity('peer');await cards().first().locator('[data-lm=discussion]').click();await page.getByText('No comments yet.',{exact:true}).waitFor();await close();
 await identity('teacher');assert.equal(await page.locator('[data-lm=watch]').count(),0);await cards().first().locator('[data-lm=discussion]').click();await page.locator('[data-decision=APPROVE]').waitFor();await page.screenshot({path:path.join(out,'01-teacher-moderation.png'),fullPage:true});await page.locator('[data-decision=APPROVE]').click();await saved();await close();
 await cards().first().locator('[data-lm=edit]').click();await page.locator('[name=summary]').fill('A short summary written by the teacher.');await page.locator('[data-lm-form=lesson] button[type=submit]').click();await saved();
 const pdf=process.env.MEDIA_DEMO_PDF?readFileSync(process.env.MEDIA_DEMO_PDF):Buffer.from('%PDF-1.4\n% isolated attachment fixture\n%%EOF');await page.locator('[name=file]').setInputFiles({name:'MOU demo guide.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('[data-lm-form=upload] button[type=submit]').click();await page.locator('[data-lm=retry]').waitFor();await action('retry');await saved();assert.equal(f.objects.size,1);assert.equal(await page.locator('.lm-files li').count(),1);await close();
 await identity('admin');await page.goto(origin+'/academy/'+activity+'/learn');await cards().first().waitFor();assert.equal(await page.locator('#mou-lesson-media [data-lm=edit]').count(),0);assert.equal(await page.locator('#mou-lesson-media [data-lm=watch]').count(),3);
 await page.goto(origin+'/programs/lesson-media.html?program=PRG-656bcece-4310-49c7-87d7-ee06756f66c1');await page.locator('#program-lesson-media .lm-card').first().waitFor();assert.equal(await page.locator('.pgm-tabs [aria-current=page]').innerText(),'Lesson media');assert.equal(await page.locator('#program-lesson-media [data-lm=edit]').count(),3);assert.equal(await page.locator('[data-shell-role=admin]').getAttribute('aria-pressed'),'true');
 await page.locator('#program-lesson-media [data-lm=edit]').first().click();await page.locator('[name=summary]').fill('An unfinished central media entry');let guarded=false;page.once('dialog',async d=>{guarded=true;await d.dismiss();});await page.locator('[data-page-refresh]').evaluate(el=>el.click());assert.equal(guarded,true);assert.equal(await page.locator('[name=summary]').inputValue(),'An unfinished central media entry');await page.locator('[name=summary]').fill('A short summary written by the teacher.');await page.locator('[data-lm-form=lesson] button[type=submit]').click();await saved();await close();
 await page.locator('#program-lesson-media').screenshot({path:path.join(out,'04-admin-central-lesson-media.png')});
 await identity('student');await page.locator('[data-lm=pdf]').first().click();await page.locator('.lm-pdf').waitFor();assert.match(await page.locator('.lm-pdf').getAttribute('src'),/^blob:/);await close();
 await cards().first().locator('[data-lm=discussion]').click();await page.locator('.lm-comment').waitFor();assert.equal(await page.locator('.lm-comment .pending').count(),0);await close();
 await page.locator('#mou-lesson-media').screenshot({path:path.join(out,'02-student-ribbon-desktop.png')});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('#mou-lesson-media').screenshot({path:path.join(out,'03-student-ribbon-mobile.png')});
 const count=calls.filter(p=>p.includes('/lesson-media/')).length;await page.evaluate(()=>{dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(1100);assert.equal(calls.filter(p=>p.includes('/lesson-media/')).length,count);
 holdWatch=true;await cards().first().locator('[data-lm=watch]').click();await page.waitForFunction(()=>document.querySelector('.lm-dialog')?.textContent.includes('Checking your access'));while(!releaseWatch)await new Promise(r=>setTimeout(r,20));await page.evaluate(t=>{localStorage.setItem('m4l_account_token',t);dispatchEvent(new Event('m4l-academy-session-ended'));},tokens.other);releaseWatch();await page.locator('.lm-dialog').waitFor({state:'detached'});assert.equal(await page.locator('.lm-player,.lm-pdf').count(),0);assert.equal(await page.locator('#mou-lesson-media').isVisible(),false);
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({checks:['three equal-sized cards','learner and authorised admin player','no player request before clicking','pending comments hidden from peers','teacher moderation and summary','central Admin Lesson media and refresh draft guard','Admin Learn omits editing controls','private PDF and idempotent lost-response retry','mobile layout','no focus polling','account change discards delayed player'],errors,mediaRequests:calls.filter(p=>p.includes('/lesson-media/')).length},null,2));console.log('Lesson media browser acceptance passed. Evidence: '+out);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.db.close();}
