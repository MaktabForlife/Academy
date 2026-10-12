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
// Exercise multiple independent accounts without sharing the fixture's single fake IP limit.
fixture.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
const tokens={admin:await fixture.login('0001'),student:await fixture.login('0002'),teacher:await fixture.login('0003'),scopedAdmin:await fixture.login('0004')};
const hifzId='PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227';
fixture.db.prepare("UPDATE accounts SET login_link_id='Student2' WHERE account_id='account-0002'").run();
fixture.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'PROGRAM','Hifz',1,'ACTIVE',1)").run('PROGRAM:'+hifzId,hifzId);
fixture.db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('mobile-hifz-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) SELECT 'mobile-course-student','account-0002',activity_key,'STUDENT',1,'CONFIRMED' FROM activities WHERE kind='COURSE' LIMIT 1").run();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/js/m4l-config.js') {res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,HIFZ_PROGRAM_ID:'+JSON.stringify(hifzId)+',HIFZHELPER_URL:"https://maktab.hifz-helper.app/"};');return;}
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
      const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&!el.closest('dialog:not([open])')&&!el.parentElement?.closest('.up-matrix-scroll,.pb-grid-scroll,.pm-scroll,.tt-scroll,.tt-planner-scroll,.cm-table-wrap,.as-table-scroll,.upcoming-strip,.activity-switcher,.academy-connected-activities,.learning-strip,.film-track,.cm-list,.pgm-tabs,.cm-tabs,.cm-workflow,.workspace-tabs,.mp-scroll,.ma-scroll');
    }).slice(0,12).map(el=>el.tagName+'.'+el.className)}));
    assert.ok(result.scroll<=result.width+1,label+': '+JSON.stringify(result));checks.push(label);
  }
  async function go(url) {await page.goto(origin+url);await page.locator('.academy-menu-toggle').waitFor({state:'attached'});}
  async function signIn(who) {
    const result=await fixture.call('/api/account/login',{uniqueid:who==='student'?'Student2':'login-'+({admin:'0001',teacher:'0003',scopedAdmin:'0004'}[who]),pin:'1234'});
    assert.ok(result.body.token,who+' '+JSON.stringify(result));tokens[who]=result.body.token;
    await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},tokens[who]);
  }
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
    await page.locator('#demo-username').fill('Student2');await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview button[type=submit]').click();await page.locator('#academy-home-card').waitFor();
    await fits('student sign-in');
    await page.screenshot({path:path.join(out,'phone-student.png'),fullPage:true});
    await page.locator('#academy-tab-learn').waitFor();
    assert.equal(await page.locator('#academy-tab-teach').isVisible(),false);
    assert.equal(await page.locator('#academy-tab-admin').isVisible(),false);
    assert.equal(await page.locator('.academy-intro').isVisible(),false);
    assert.equal(await page.locator('#personal-pills').count(),0);
    assert.equal(await page.locator('.brand .site-version').isVisible(),true);
    assert.equal(await page.locator('.academy-learning-menu').count(),0);
    await page.locator('#academy-role-panel a[href*="/learn"]').first().waitFor();
    checks.push('Student home uses a Learn chooser and top-row version without duplicate welcome or Learning menus');
    // One authorised snapshot drives the role menus. Teacher visibility does not grant Student roles.
    for(const [who,expected] of [['teacher',['learn','teach']],['scopedAdmin',['learn','teach','admin']],['admin',['learn','teach','admin']]]) {
      await signIn(who);await go('/academy/');
      await page.waitForFunction(()=>document.querySelector('#academy-account-role').textContent.length>0);
      for(const key of ['learn','teach','admin']) assert.equal(await page.locator('#academy-tab-'+key).isVisible(),expected.includes(key),who+' '+key);
      for(const key of expected) {
        const tab=page.locator('#academy-tab-'+key);await tab.click();
        assert.equal(await tab.getAttribute('aria-selected'),'true');
        if(key==='admin') {
          await page.locator('#administration.active .workspace-tabs').waitFor();
          assert.equal(await page.locator('#academy-role-panel').isVisible(),false);
          assert.equal(await page.locator('#administration .workspace-tabs a').count(),8);
        } else {
          assert.equal(await page.locator('#academy-role-panel').getAttribute('aria-labelledby'),'academy-tab-'+key);
          assert.match(await page.locator('#academy-role-panel').innerText(),/Select a Program or Course/);
        }
      }
      if(who==='scopedAdmin') {
        assert.equal(await page.locator('#administration a[href="/users/"],#public-timetable-refresh').count(),0);
        assert.ok(await page.locator('#administration a[href*="program="],#administration a[href*="course="]').count()>0);
        await page.locator('#admin-tab-assessments').click();await page.locator('#admin-workspace a[href^="#assessment-admin/"]').first().waitFor();
        await page.locator('#admin-tab-courses').click();await fits('scoped Admin Course management');
      }
      if(who==='admin') {
        assert.equal(await page.locator('#administration a[href="/users/"]').count(),1);
        await page.locator('#academy-tab-admin').focus();await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#academy-tab-learn').getAttribute('aria-selected'),'true');
        assert.equal(await page.locator('#academy-tab-learn').evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('End');assert.equal(await page.locator('#academy-tab-admin').getAttribute('aria-selected'),'true');
        for(const width of [320,390,600,768,900,901,1440]) {
          await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));await fits('Academy Admin tabs '+width);
          const buttons=await page.locator('.academy-role-tabs button:visible').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.ok(buttons.every(h=>h>=44));
          const version=await page.locator('.brand .site-version').boundingBox(),profile=await page.locator('.academy-profile').boundingBox();assert.ok(version.y<profile.y);
          const strip=await page.locator('#administration .workspace-tabs').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,ys:[...el.children].map(n=>n.offsetTop)}));
          if(width<=900)assert.ok(strip.ys.every(y=>y===strip.ys[0]),JSON.stringify({width,...strip}));
          if(width<=390)assert.ok(strip.scroll>strip.width,JSON.stringify({width,...strip}));
          if(width===390)await page.screenshot({path:path.join(out,'phone-academy-menu.png')});
        }
        await page.setViewportSize({width:390,height:844});
        await page.locator('#admin-tab-users').focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.activeElement?.id==='admin-tab-courses');
        const activeBox=await page.locator('#admin-tab-courses').boundingBox();assert.ok(activeBox.x>=0&&activeBox.x+activeBox.width<=390);
        for(const key of ['users','attendance','planning','assessments','library','curriculum','programs','courses']) {
          await go('/academy/#administration/'+key);await page.locator('#admin-tab-'+key+'[aria-selected=true]').waitFor();await fits('central Admin '+key);
        }
      }
      await fits('Academy role menu '+who);
      await page.locator('#academy-sign-out').click();await page.locator('#login-preview').waitFor();
      assert.equal(await page.locator('#academy-home-card').isVisible(),false);
      await page.waitForFunction(()=>document.querySelector('#academy-role-panel').hidden);
      assert.equal(await page.locator('#academy-role-panel a').count(),0);
      assert.equal(await page.locator('.academy-intro').isVisible(),true);
      checks.push(who+' sign-out removes tools and restores public sign-in');
    }
    await signIn('student');await go('/academy/');await page.locator('#academy-tab-learn').waitFor();
    for(const width of [320,390,600,768,900,901,1440]) {
      await page.setViewportSize({width,height:844});await go('/academy/#overview/learn');
      const hifz=page.locator('#academy-role-panel .activity-pill-shortcut');await hifz.waitFor();
      assert.equal(await hifz.getAttribute('href'),'https://maktab.hifz-helper.app/Student2');assert.equal(await hifz.getAttribute('target'),'_blank');
      const cards=await page.locator('.academy-choice>a:first-of-type').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.ok(cards.length>=4&&cards.every(h=>h>=44&&h<=120),JSON.stringify(cards));
      await fits('compact Learn chooser '+width);
      await page.locator('#academy-role-panel a[href*="/learn"]').filter({hasText:'Mothers of the Ummah'}).click();
      await page.locator('#activity.active .workspace-tabs').waitFor();
      assert.deepEqual(await page.locator('#activity-menu [role=tab]').allTextContents(),['Timetable','Assessment','Library']);
      assert.equal(await page.locator('#activity-schedule').isVisible(),true);
      await page.locator('#mou-lesson-media').waitFor();
      assert.equal(await page.locator('#activity-support details').count(),3);
      assert.match(await page.locator('#activity-support').innerText(),/Messages|Academy calendar|Surahs and Duas tracker/);
      assert.ok((await page.locator('#activity .activity-heading').boundingBox()).height<130);
      await fits('learner Program timetable '+width);
      if(width===390)await page.screenshot({path:path.join(out,'phone-learner-program.png'),fullPage:true});
      await page.locator('#activity-tab-library').click();await page.locator('#activity-library').waitFor();
      assert.equal(await page.locator('#activity-schedule').isVisible(),false);assert.equal(await page.locator('#mou-lesson-media').isVisible(),false);
      assert.equal(await page.locator('#activity-library a[href="/academy/library/"]').count(),1);assert.equal(await page.locator('#activity-library a[href="/academy/open-library/"]').count(),1);
      await page.locator('#activity-tab-assessment').click();await page.locator('#as-panel').waitFor();await fits('learner assessment tab '+width);
      await page.locator('#activity-tab-assessment').focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.activeElement?.id==='activity-tab-timetable');
      await page.locator('#activity-back-link').click();await page.locator('#academy-role-panel').waitFor();
      await page.locator('#academy-role-panel a[href^="#activity/COURSE/"]').first().click();await page.waitForFunction(()=>document.querySelector('#activity-kind').textContent==='Course');
      assert.equal(await page.locator('#activity-tab-timetable').getAttribute('aria-selected'),'true');await fits('learner Course timetable '+width);
    }
    await signIn('teacher');await go('/academy/#overview/teach');
    await page.locator('#academy-role-panel a[href*="/teach"]').first().click();await page.locator('#activity-menu [role=tab]').first().waitFor();
    assert.deepEqual(await page.locator('#activity-menu [role=tab]').allTextContents(),['Timetable','Attendance','Planning','Assessment','Library']);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:844});await page.locator('#activity-tab-timetable').focus();await page.keyboard.press('End');await page.locator('#activity-library').waitFor();
      await page.waitForFunction(()=>document.activeElement?.id==='activity-tab-library');
      const box=await page.locator('#activity-tab-library').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);await fits('teaching swipeable tabs '+width);
    }
    await page.locator('#activity-tab-planning').click();await page.locator('#activity-planning').waitFor();assert.match(await page.locator('#activity-planning').innerText(),/coming soon/);
    await page.locator('#activity-tab-attendance').click();await page.locator('#pa-main').waitFor();await fits('teaching attendance tab');
    await page.screenshot({path:path.join(out,'teaching-workspace.png'),fullPage:true});
    checks.push('Learn and Teach open scoped Program/Course workspaces; tab keyboard focus and active horizontal visibility work');
    for(const width of [320,390,768,1440]) {
      await signIn('admin');await page.setViewportSize({width,height:900});
      const pages=[['/academy/#administration','Academy administration'],['/users/','User profiles'],['/academy/subjects/','Subjects'],['/academy/courses/manage/','Courses'],['/programs/','Programs'],['/programs/timetable.html?program='+assessmentScope.slice(8),'Program timetable'],['/programs/manage.html?program='+assessmentScope.slice(8),'Program people'],['/academy/#activity/PROGRAM/'+assessmentScope.slice(8)+'/attendance','Attendance'],['/academy/#assessment-admin','Assessments'],['/academy/#progress-admin','Memorisation administration'],['/academy/library/','Library']];
      for(const [url,label] of pages) {
        await go(url);await page.waitForTimeout(300);await fits(label+' '+width);
        if(width<=900&&url==='/users/') {
          const learning=page.locator('.academy-learning-menu');await learning.waitFor();
          assert.equal(await learning.evaluate(el=>el.open),false);
          await learning.locator('summary').click();
          assert.equal(await page.locator('.academy-connected-activities').isVisible(),true);
          await fits('connected workspace Learning menu '+width);
          await page.keyboard.press('Escape');
        }
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
