// Browser checks use real frontend/Worker code and an isolated synthetic database.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import {assessmentScope} from '../tests/fixtures/academy-assessment-fixture.mjs';
import worker from '../src/worker.js';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=process.env.ACADEMY_MOBILE_OUTPUT||path.join(tmpdir(),'academy-mobile-layout');
mkdirSync(out,{recursive:true});
const fixture=await mediaFixture();
const tokens={admin:await fixture.login('0001'),student:await fixture.login('0002'),teacher:await fixture.login('0003')};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/js/m4l-config.js') {res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true};');return;}
    if(url.pathname.startsWith('/__preview/signin/')) {
      const who=url.pathname.split('/').at(-1);if(!tokens[who])throw Error('Unknown synthetic account');
      res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Local Academy preview</title><script>localStorage.setItem("m4l_account_token",'+JSON.stringify(tokens[who])+');location.replace("/academy/");</script>');return;
    }
    if(url.pathname.startsWith('/api/')) {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),fixture.env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!/^\/(academy|account|programs|users|recorder|js|css|icons|images)(\/|$)/.test(url.pathname)&&!['/ummabbadacademy.png','/logo.png','/version.json'].includes(url.pathname)) {res.writeHead(404);res.end();return;}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep))throw Error('Invalid path');
    const file=url.pathname.endsWith('/')?path.join(target,'index.html'):target;
    const type=mime[path.extname(file)];if(!type)throw Error('Unsupported file');
    const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':type});res.end(bytes);
  } catch(error) {res.writeHead(error.code==='ENOENT'?404:500);res.end();}
});
await new Promise(resolve=>server.listen(Number(process.env.ACADEMY_MOBILE_PORT||0),'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
fixture.env.ALLOWED_ORIGINS=origin;
console.log('Local synthetic Academy preview: '+origin+'/academy/');

if(process.argv.includes('--serve')) {
  console.log('Synthetic admin preview: '+origin+'/__preview/signin/admin');
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  await new Promise(resolve=>server.close(resolve));fixture.db.close();
} else {
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.ACADEMY_BROWSER_RUNTIME||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  async function fits(label) {
    const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(el=>{
      const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&!el.closest('dialog:not([open])')&&!el.parentElement?.closest('.up-matrix-scroll,.pb-grid-scroll,.pm-scroll,.tt-scroll,.tt-planner-scroll,.cm-table-wrap,.as-table-scroll,.upcoming-strip,.activity-switcher,.academy-connected-activities,.learning-strip,.film-track,.cm-list,.pgm-tabs,.cm-tabs,.cm-workflow,.mp-scroll,.ma-scroll');
    }).slice(0,12).map(el=>el.tagName+'.'+el.className)}));
    assert.ok(result.scroll<=result.width+1,label+': '+JSON.stringify(result));checks.push(label);
  }
  async function go(url) {await page.goto(origin+url);await page.locator('.academy-menu-toggle').waitFor({state:'attached'});}
  async function signIn(who) {await go('/academy/');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},tokens[who]);}
  try {
    // Public sign-in remains visible without expanding the Academy menu.
    for(const width of [320,390,600,768,900,901,1440]) {
      await page.setViewportSize({width,height:900});await go('/academy/');await page.locator('#login-preview').waitFor();await fits('public home '+width);
      const toggle=page.locator('.academy-menu-toggle');
      assert.equal(await toggle.isVisible(),width<=900);
      if(width<=900) {
        assert.equal(await page.locator('.academy-menu-content').isVisible(),false);
        const box=await toggle.boundingBox();assert.ok(box.height>=44&&box.width>=44);
        await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await fits('expanded menu '+width);
        await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
        await toggle.click();await page.locator('.academy-menu-content [data-nav=about]').click();await page.locator('#about.active').waitFor();
        assert.equal(await page.locator('.academy-menu-content').isVisible(),false);await page.waitForFunction(()=>document.querySelector('#about h1')===document.activeElement);
      } else assert.equal(await page.locator('.academy-menu-content').isVisible(),true);
    }
    await page.setViewportSize({width:390,height:844});await go('/academy/');
    await page.screenshot({path:path.join(out,'phone-home.png'),fullPage:true});
    await page.screenshot({path:path.join(out,'phone-home-viewport.png')});
    await page.locator('#demo-username').fill('login-0002');await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview button[type=submit]').click();await page.locator('#academy-home-card').waitFor();
    await fits('student sign-in');
    await page.screenshot({path:path.join(out,'phone-student.png'),fullPage:true});
    for(const width of [320,390,768,1440]) {
      await signIn('admin');await page.setViewportSize({width,height:900});
      const pages=[['/academy/#administration','Academy administration'],['/users/','User profiles'],['/academy/subjects/','Subjects'],['/academy/courses/manage/','Courses'],['/programs/','Programs'],['/programs/timetable.html?program='+assessmentScope.slice(8),'Program timetable'],['/programs/manage.html?program='+assessmentScope.slice(8),'Program people'],['/academy/#activity/PROGRAM/'+assessmentScope.slice(8)+'/attendance','Attendance'],['/academy/#assessment-admin','Assessments'],['/academy/#progress-admin','Memorisation administration'],['/academy/library/','Library']];
      for(const [url,label] of pages) {
        await go(url);await page.waitForTimeout(300);await fits(label+' '+width);
        if(width===390&&['Academy administration','User profiles','Courses','Program timetable'].includes(label))await page.screenshot({path:path.join(out,'phone-'+label.toLowerCase().replaceAll(' ','-')+'.png'),fullPage:true});
      }
    }
    // Mobile editing and frozen-column scrolling against the real synthetic Worker.
    await page.setViewportSize({width:320,height:844});await go('/users/');await page.locator('#up-users tr').first().waitFor();
    const frozenBefore=await page.locator('#up-users tr td:first-child').first().boundingBox();
    await page.locator('.up-matrix-scroll').evaluate(el=>{el.scrollLeft=240;});
    const frozenAfter=await page.locator('#up-users tr td:first-child').first().boundingBox();assert.ok(Math.abs(frozenBefore.x-frozenAfter.x)<1);await fits('320px frozen name and independent sheet scroll');
    await page.locator('[data-unique-id][data-account="account-0008"]').fill('MobileTest8');
    await page.locator('[data-whatsapp-number][data-account="account-0008"]').fill('+27123456789');
    const saved=page.waitForResponse(response=>response.url().endsWith('/api/admin/platform/user-profiles/save'));
    await page.locator('#up-save-all').click();
    const saveResponse=await saved,saveResult=await saveResponse.json();
    assert.equal(JSON.parse(saveResponse.request().postData()).whatsappNumber,'+27123456789');
    assert.equal(saveResult.success,true,JSON.stringify(saveResult));
    assert.equal(saveResult.profile.whatsappNumber,'+27123456789',JSON.stringify(saveResult));
    await page.waitForFunction(()=>document.querySelector('#up-unsaved').textContent==='');
    await go('/users/');await page.locator('[data-unique-id][data-account="account-0008"]').waitFor();
    assert.equal(await page.locator('[data-unique-id][data-account="account-0008"]').inputValue(),'MobileTest8');
    assert.equal(await page.locator('[data-whatsapp-number][data-account="account-0008"]').inputValue(),'+27123456789');
    checks.push('320px Login ID and WhatsApp save and survive reload');
    // Open real Course details to exercise the responsive editor rather than its empty shell.
    await page.setViewportSize({width:390,height:844});await go('/academy/courses/manage/');await page.locator('.cm-course').first().waitFor();await page.locator('.cm-course').first().click();await page.locator('.cm-form-grid').waitFor();await fits('390px selected Course form');
    const fields=await page.locator('.cm-form-grid input:not([type=checkbox]):visible,.cm-form-grid select:visible').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize)})));assert.ok(fields.length>0&&fields.every(f=>f.height>=44&&f.font>=16),JSON.stringify(fields));
    await page.screenshot({path:path.join(out,'phone-course-details.png'),fullPage:true});
    // Crossing the desktop breakpoint closes the disclosure without hiding desktop links.
    await page.locator('.academy-menu-toggle').click();await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('.academy-menu-content').isVisible(),true);await fits('desktop after mobile resize');
    await go('/academy/');await page.screenshot({path:path.join(out,'desktop-home.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({checks,errors,syntheticDatabase:true,liveDataChanged:false},null,2));
    console.log('Mobile layout browser acceptance passed: '+checks.length+' checks. Evidence: '+out);
  } catch(error) {
    await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});
    writeFileSync(path.join(out,'failure.json'),JSON.stringify({url:page.url(),error:String(error),checks,errors},null,2));
    throw error;
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));fixture.db.close();}
}
