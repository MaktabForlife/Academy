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
fixture.db.prepare("UPDATE accounts SET login_link_id='Admin1' WHERE account_id='account-0001'").run();
fixture.db.prepare("UPDATE accounts SET login_link_id='Teacher3' WHERE account_id='account-0003'").run();
fixture.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'PROGRAM','Hifz',1,'ACTIVE',1)").run('PROGRAM:'+hifzId,hifzId);
fixture.db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('mobile-hifz-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('mobile-hifz-teacher','account-0003',?,'TEACHER',1,'CONFIRMED')").run('PROGRAM:'+hifzId);
fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) SELECT 'mobile-course-student','account-0002',activity_key,'STUDENT',1,'CONFIRMED' FROM activities WHERE kind='COURSE' LIMIT 1").run();
for(const stage of ['CANCELLED','ARCHIVED']) {
 const id='course-menu-'+stage.toLowerCase(),scope='COURSE:'+id,run='run-menu-'+stage;
 fixture.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'COURSE',?,1,'ACTIVE',1)").run(scope,id,stage==='CANCELLED'?'Cancelled fixture':'Archived fixture');
 fixture.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run(scope);
 fixture.db.prepare("INSERT INTO course_settings(activity_key,legacy_access_model,policy_review_state) VALUES(?,'FREE','CONFIRMED')").run(scope);
 fixture.db.prepare("INSERT INTO course_runs(activity_key,run_id,name,timezone,active) VALUES(?,?,?,'Africa/Johannesburg',1)").run(scope,run,id);
 fixture.db.prepare('INSERT INTO course_run_state(activity_key,run_id,stage) VALUES(?,?,?)').run(scope,run,stage);
 fixture.db.prepare("INSERT INTO course_run_access VALUES(?,?,'FREE')").run(scope,run);
 fixture.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,'account-0002',?,'STUDENT',1,'CONFIRMED')").run('menu-'+stage,scope);
}
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
    const file=/^\/account\/[^/.]+\/?$/.test(url.pathname)?path.join(root,'account/index.html'):url.pathname.endsWith('/')?path.join(target,'index.html'):target;
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
    const result=await fixture.call('/api/account/login',{uniqueid:({student:'Student2',admin:'Admin1',teacher:'Teacher3',scopedAdmin:'login-0004'}[who]),pin:'1234'});
    assert.ok(result.body.token,who+' '+JSON.stringify(result));tokens[who]=result.body.token;
    await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},tokens[who]);
  }
  try {
    for(const width of [320,390,600,768,900,901,1440]) {
      await page.setViewportSize({width,height:900});await go('/academy/');await fits('public two-banner home '+width);
      assert.equal(await page.locator('.academy-banners').isVisible(),true);assert.equal(await page.locator('.academy-account-bar').isVisible(),true);
      await page.locator('.academy-menu-toggle').click();const menu=page.locator('#academy-menu-drawer');await menu.waitFor();
      assert.equal(await menu.getAttribute('data-side'),'right');
      const items=await menu.locator('[data-nav]').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width>0).map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
      assert.ok(items.length>=4&&items.every(i=>Math.abs(i.x-items[0].x)<2));
      const plain=await menu.locator('[data-nav]').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width>0).map(n=>({border:getComputedStyle(n).borderTopWidth,font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})));assert.ok(plain.every(n=>n.border==='0px'&&n.font<=14&&n.height>=44));
      assert.equal(await page.locator('[data-page-home] .page-action-label').innerText(),'Home');assert.equal(await page.locator('[data-page-refresh] .page-action-label').innerText(),'Refresh');
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await page.locator('.academy-menu-toggle').evaluate(n=>n===document.activeElement),true);
      await page.locator('.academy-menu-toggle').click();await menu.locator('[data-nav=hifz]').click();await page.locator('#progress.active').waitFor();await page.locator('.mp-card').first().waitFor();
      assert.equal(await page.locator('#progress h1').innerText(),'Surahs and Duas');assert.equal(await page.locator('#hifdh-helper').isVisible(),false);assert.match(await page.locator('#mp-root').innerText(),/Visitor preview/);
      assert.equal(await page.locator('#mp-personal-close').isVisible(),false);assert.equal(await page.locator('#progress .mp-toolbar').isVisible(),false);
      assert.equal(await page.locator('#progress h1').evaluate(n=>getComputedStyle(n).fontSize),'28px');
      await page.evaluate(()=>scrollTo(0,600));const banner=await page.locator('.academy-banners').boundingBox();assert.ok(Math.abs(banner.y)<1);await fits('public Hifz and persistent banners '+width);
      if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'phone-public-hifz.png')});}
    }
    for(const alias of ['hifdh','progress']){await go('/academy/#'+alias);await page.locator('#progress.active .mp-card').first().waitFor();assert.equal(await page.locator('#progress h1').innerText(),'Surahs and Duas');}
    for(const [who,keys] of [['student',['learn']],['teacher',['learn','teach']],['scopedAdmin',['learn','teach','admin']],['admin',['learn','teach','admin']]]) {
      await signIn(who);await go('/academy/');await page.locator('#academy-header-name').waitFor();await page.waitForFunction(()=>document.querySelector('#academy-account-role').textContent.length>0);
      assert.equal(await page.locator('.academy-global-strip:visible,#activity-switcher:visible,.academy-page-tools:visible,#academy-role-panel:visible').count(),0,'Home omits both legacy shortcut rows at desktop and mobile sizes');
      if(who==='admin')await page.screenshot({path:path.join(out,'desktop-home-draft.png')});
      for(const key of ['learn','teach','admin'])assert.equal(await page.locator('#academy-tab-'+key).isVisible(),keys.includes(key),who+' '+key);
      for(const key of keys.filter(k=>k!=='admin')){
        await page.locator('#academy-tab-'+key).click();const drawer=page.locator('#academy-'+key+'-drawer');await drawer.waitFor();assert.equal(await drawer.getAttribute('data-side'),key==='learn'?'left':'right');
        assert.equal(await drawer.locator('a').filter({hasText:/Cancelled fixture|Archived fixture/}).count(),0);assert.equal(await drawer.locator('.academy-drawer-list small').count(),0);
        assert.equal(await drawer.locator('.academy-drawer-list a[href*="'+hifzId+'"]').count(),0,'Hifz Program is replaced by the external helper');
        assert.equal(await drawer.locator('.academy-drawer-list a[href$="#hifz"],.academy-drawer-list a[href$="#progress"]').count(),0,'The public tracker is available only in the website menu');
        if(key==='teach'&&['admin','teacher'].includes(who))assert.equal(await drawer.locator('.academy-hifz-shortcut').getAttribute('href'),'https://maktab.hifz-helper.app/'+({admin:'Admin1',teacher:'Teacher3'}[who]));
        const links=await drawer.locator('.academy-drawer-list a').evaluateAll(ns=>ns.map(n=>({border:getComputedStyle(n).borderTopWidth,font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})));assert.ok(links.every(n=>n.border==='0px'&&n.font<=14&&n.height>=44));
        await page.keyboard.press('Escape');assert.equal(await drawer.isVisible(),false);
      }
      if(keys.includes('admin')){
        await page.locator('#academy-tab-admin').click();await page.locator('#administration.active').waitFor();
        assert.equal(await page.locator('.admin-management-menu').locator('button,a').first().innerText(),'Teach');
        await page.locator('#admin-teach').click();await page.locator('#academy-teach-drawer').waitFor();assert.equal(await page.locator('#academy-teach-drawer').getAttribute('data-side'),'left');await page.keyboard.press('Escape');
        assert.equal(await page.locator('#admin-tab-users').getAttribute('href'),who==='admin'?'/users/':await page.locator('#admin-tab-users').getAttribute('href'));
        assert.ok((await page.locator('#admin-tab-assessments').getAttribute('href')).startsWith('#assessment-admin'));
        if(who==='scopedAdmin')assert.equal(await page.locator('#public-timetable-refresh').count(),0);
      }
      await fits('role access '+who);
      await page.locator('#academy-sign-out').click();await page.locator('#login-preview').waitFor();assert.equal(await page.locator('.academy-account-bar').isVisible(),true);assert.equal(await page.locator('#academy-sign-out').isVisible(),false);
      assert.equal(await page.locator('#academy-learn-drawer a').count(),0);
    }
    checks.push('Hifz is public through Menu only; Learn and Teach link directly to the current account’s HifzHelper');
    await signIn('student');await page.setViewportSize({width:390,height:900});await go('/academy/#hifz');await page.locator('#hifdh-helper').waitFor();assert.equal(await page.locator('#hifdh-helper').getAttribute('href'),'https://maktab.hifz-helper.app/Student2');
    for(const width of [320,390]){await page.setViewportSize({width,height:900});const height=(await page.locator('#progress .page-heading').boundingBox()).height;assert.ok(height<100,'Compact Hifz heading allows two lines on narrow phones: '+height);await fits('compact signed-in Hifz header '+width);}
    await page.screenshot({path:path.join(out,'phone-member-hifz.png')});
    await page.locator('#academy-tab-learn,[data-shell-role=learn]').click();await page.locator('#academy-learn-drawer .academy-hifz-shortcut').waitFor();assert.equal(await page.locator('#academy-learn-drawer .academy-hifz-shortcut').getAttribute('href'),'https://maktab.hifz-helper.app/Student2');
    await page.keyboard.press('Escape');
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});await page.locator('#academy-tab-learn,[data-shell-role=learn]').click();await page.locator('#academy-learn-drawer a').filter({hasText:'Mothers of the Ummah'}).first().click();await page.locator('#activity-menu [role=tab]').first().waitFor();
      assert.equal(await page.locator('#activity-back-link').isVisible(),false);assert.equal(await page.locator('#activity-role').innerText(),'');
      assert.deepEqual(await page.locator('#activity-menu [role=tab]').allTextContents(),['Timetable','Assessment','Library']);
      assert.equal(await page.locator('#activity-support a[href="#progress"],#activity-support a[href="#hifz"]').count(),0);
      assert.ok((await page.locator('#activity .activity-heading').boundingBox()).height<85);await fits('compact learner Program '+width);
      if(width===390)await page.screenshot({path:path.join(out,'phone-program.png'),fullPage:true});
      await page.locator('#activity-tab-library').click();await page.locator('#al-content').waitFor();assert.equal(new URL(page.url()).pathname,'/academy/library/');
      assert.equal(await page.locator('.al-tabs [aria-current=page]').innerText(),'For you');assert.equal(await page.locator('.al-header').isVisible(),false);
      assert.equal(await page.locator('.academy-banners').isVisible(),true);await fits('For you Library from Program '+width);
      if(width===390)await page.screenshot({path:path.join(out,'phone-library.png'),fullPage:true});
    }
    await signIn('admin');
    const pages=[['/academy/#administration','Admin'],['/academy/#administration/attendance','Admin Attendance'],['/users/','Users'],['/academy/subjects/','Curriculum'],['/academy/courses/manage/','Courses'],['/programs/','Programs'],['/programs/timetable.html?program='+assessmentScope.slice(8),'Program timetable'],['/programs/manage.html?program='+assessmentScope.slice(8),'Program people'],['/programs/attendance.html?program='+assessmentScope.slice(8),'Attendance'],['/academy/#assessment-admin','Assessments'],['/academy/#progress-admin','Hifdh management'],['/academy/library/','Library'],['/academy/library/manage/','Library management'],['/academy/open-library/','Browse'],['/academy/teaching/','Availability'],['/programs/library.html?program='+assessmentScope.slice(8),'Program Library'],['/programs/library-view.html?program='+assessmentScope.slice(8),'Library viewer'],['/programs/media.html?program='+assessmentScope.slice(8),'Program media'],['/recorder/?academy=1','Recorder'],['/account/Admin1','Account']];
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      for(const [url,label]of pages){await go(url);await page.locator('.academy-page-actions #academy-sign-out,.academy-page-actions #ac-signout').waitFor();await fits(label+' two banners '+width);
        assert.equal(await page.locator('main [data-page-content-refresh]:visible').count(),0,'The banner is the only ordinary Refresh control on '+label);
        assert.equal(await page.locator('.academy-banners').locator('>section').isVisible(),true);
        if(['Assessments','Hifdh management','Admin Attendance'].includes(label))assert.equal(await page.locator('#academy-tab-admin').getAttribute('aria-pressed'),'true');
        if(['Users','Programs','Courses','Curriculum','Library management','Program timetable','Program people','Program Library','Library viewer','Program media','Attendance'].includes(label))assert.equal(await page.locator('[data-shell-role=admin]').getAttribute('aria-pressed'),'true');
        const manageHeading=({'Admin':'Manage Academy','Admin Attendance':'Manage Attendance','Users':'Manage Users','Programs':'Manage Programs','Courses':'Manage Courses','Curriculum':'Manage Subjects & Modules','Assessments':'Manage Assessments','Hifdh management':'Manage Surahs and Duas','Library management':'Manage Library'})[label];if(manageHeading){assert.equal(await page.locator('main h1:visible').first().innerText(),manageHeading);assert.equal(await page.locator('main .eyebrow:visible,main .pb-eyebrow:visible').filter({hasText:'Academy administration'}).count(),0);}
        if(['Programs','Program timetable','Program people'].includes(label)){await page.locator('.pgm-unified').waitFor();assert.deepEqual(await page.locator('.pgm-unified .pgm-tabs a').allTextContents(),['Program List','Timetable','People']);assert.equal(await page.locator('main h1:visible').count(),1);}
        if(label==='Users'){await page.locator('#up-users tr').first().waitFor();assert.deepEqual(await page.locator('#up-tabs button').allTextContents(),['User Details','Programs','Courses']);for(const tab of ['programs','courses','details']){await page.locator('#up-tab-'+tab).click();assert.equal(await page.locator('#up-tab-'+tab).getAttribute('aria-selected'),'true');assert.equal(await page.locator('#up-head th:visible').filter({hasText:'Login ID'}).count(),tab==='details'?1:0);}checks.push('split Users tabs '+width);}
        if(label==='Programs'){await page.locator('#program-workspace').waitFor();assert.equal(await page.locator('#program-intro').isVisible(),false);assert.doesNotMatch(await page.locator('#program-message').innerText(),/Ready|Open a Program/);}
        if(label==='Courses'){assert.equal(await page.locator('#course-management-back').isVisible(),false);assert.equal(await page.locator('#course-refresh').isVisible(),false);await page.locator('#course-list .cm-course').first().waitFor();assert.equal(await page.locator('#course-editor .cm-empty h2').innerText(),'Select a course');assert.equal(await page.locator('#course-list [aria-pressed=true]').count(),0);}
        if(label==='Library management'){assert.equal(await page.locator('.al-intro h1').innerText(),'Manage Library');assert.equal(await page.locator('.al-intro h1').evaluate(n=>getComputedStyle(n).fontSize),'28px');}
        if(label==='Curriculum')assert.equal(await page.locator('.up-titlebar a').count(),0);
        if(label==='Admin'){const teach=await page.locator('#admin-teach').boundingBox(),users=await page.locator('#admin-tab-users').boundingBox();assert.ok(teach&&users&&teach.x>=0&&teach.x<users.x&&Math.abs(teach.y-users.y)<2,JSON.stringify({teach,users}));}
        for(const selector of ['[data-page-home]','[data-page-refresh]'])assert.ok((await page.locator(selector).boundingBox()).height>=44);
        await page.evaluate(()=>scrollTo(0,700));assert.ok(Math.abs((await page.locator('.academy-banners').boundingBox()).y)<1);
        if(width===390&&['Admin','Admin Attendance','Users','Courses','Programs','Curriculum','Library management','Program timetable'].includes(label)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'phone-'+label.replaceAll(' ','-')+'.png')});}
      }
    }
    await page.setViewportSize({width:390,height:900});await go('/academy/courses/manage/');await page.locator('#course-list .cm-course').filter({has:page.locator('.cm-pill[data-stage=ACTIVE]')}).first().click();await page.locator('#course-editor [data-field=name]').waitFor();
    await page.locator('#cm-tab-list').click();await page.locator('#course-status-filter').selectOption('CANCELLED');await page.locator('#course-editor .cm-empty h2').waitFor();assert.equal(await page.locator('#course-editor .cm-empty h2').innerText(),'Select a course');assert.equal(new URL(page.url()).searchParams.has('course'),false);assert.equal(await page.locator('#course-list [aria-pressed=true]').count(),0);await fits('Courses filtered empty selection');await page.screenshot({path:path.join(out,'phone-courses-empty-selection.png')});
    await page.locator('#course-status-filter').selectOption('');await page.locator('#course-list .cm-course').first().waitFor();const coursesRefresh=page.waitForResponse(r=>r.url().endsWith('/api/admin/platform/courses/list'));await page.locator('[data-page-refresh]').click();await coursesRefresh;assert.equal(await page.locator('#course-editor .cm-empty h2').innerText(),'Select a course');
    checks.push('Courses waits for an explicit selection; filtering clears a hidden selection and Refresh keeps the empty editor');
    await go('/programs/?program='+assessmentScope.slice(8));await page.locator('.pgm-unified').waitFor();
    await page.locator('.pgm-tabs a').filter({hasText:/^Timetable$/}).click();await page.locator('#tt-workspace').waitFor();assert.equal(await page.locator('.pgm-tabs [aria-current=page]').innerText(),'Timetable');
    await page.locator('.pgm-tabs a').filter({hasText:/^People$/}).click();await page.locator('#pm-workspace').waitFor();assert.equal(await page.locator('.pgm-tabs [aria-current=page]').innerText(),'People');assert.doesNotMatch(await page.locator('#pm-message').innerText(),/Ready\./);
    await page.locator('.pgm-tabs a').filter({hasText:/^Program List$/}).click();await page.locator('#program-workspace').waitFor();assert.equal(new URL(page.url()).searchParams.get('program'),assessmentScope.slice(8));
    checks.push('Program List, Timetable and People share a heading and preserve the selected Program across page tabs');
    await go('/academy/courses/manage/');await page.locator('#course-new').click();await page.locator('[data-field=name]').fill('Browser retained Course draft');await page.locator('#cm-tab-list').click();assert.equal(await page.locator('#course-editor').isVisible(),false);await page.locator('#cm-tab-details').click();assert.equal(await page.locator('[data-field=name]').inputValue(),'Browser retained Course draft');
    await page.locator('#cm-tab-list').click();await page.locator('#course-list .cm-course').first().click();await page.locator('#course-dialog').waitFor();await page.locator('[data-dialog-cancel]').click();await page.locator('#cm-tab-details').click();assert.equal(await page.locator('[data-field=name]').inputValue(),'Browser retained Course draft');
    await page.locator('#cm-tab-list').click();await page.locator('#course-list .cm-course').first().click();await page.locator('[data-dialog-confirm]').click();await page.locator('#course-editor [data-field=name]').waitFor();
    await page.locator('#cm-tab-details').focus();await page.keyboard.press('End');await page.locator('#cm-tab-review[aria-selected=true]').waitFor();const reviewBox=await page.locator('#cm-tab-review').boundingBox();assert.ok(reviewBox.x>=0&&reviewBox.x+reviewBox.width<=390);await page.keyboard.press('Home');await page.locator('#cm-tab-list[aria-selected=true]').waitFor();await page.locator('#cm-tab-details').click();await page.screenshot({path:path.join(out,'phone-course-details.png')});
    assert.equal(await page.locator('#course-list-panel').isVisible(),false);const selectedRefresh=page.waitForResponse(r=>r.url().endsWith('/api/admin/platform/courses/get'));await page.locator('[data-page-refresh]').click();await selectedRefresh;assert.equal(await page.locator('#course-list-panel').isVisible(),false);
    checks.push('Course list shares one swipe row, keeps drafts across tabs, guards selection and supports banner Refresh from Details');
    await go('/academy/#administration');await page.locator('#admin-tab-attendance').click();await page.locator('#administration #admin-workspace').waitFor();assert.equal(new URL(page.url()).hash,'#administration/attendance');assert.equal(await page.locator('#administration h1').innerText(),'Manage Attendance');assert.match(await page.locator('#admin-workspace').innerText(),/coming soon/);assert.equal(await page.locator('#pa-main').isVisible(),false);
    checks.push('Central Admin Attendance opens its own Coming soon page, separate from teaching registers');
    await go('/academy/#administration');await page.locator('#admin-tab-users').click();await page.locator('#up-users tr').first().waitFor();assert.equal(new URL(page.url()).pathname,'/users/');
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});assert.equal(await page.locator('#up-refresh').isVisible(),false);
      const add=await page.locator('#up-add').boundingBox(),save=await page.locator('#up-save-all').boundingBox();assert.ok(Math.abs(add.y-save.y)<2&&save.x>add.x);
      const reset=page.locator('[data-reset-pin="account-0002"]');assert.equal(await reset.innerText(),'Reset PIN');assert.equal(await reset.locator('svg').count(),0);
      const rowHeight=await page.locator('#up-users tr').first().evaluate(n=>n.getBoundingClientRect().height);assert.ok(rowHeight<=60,'Compact profile row: '+rowHeight);
      if(width===390)await page.screenshot({path:path.join(out,'phone-users-draft.png')});await fits('compact User profiles '+width);
    }
    await page.locator('[data-reset-pin="account-0002"]').click();await page.locator('#up-reset-dialog').waitFor();await page.locator('#up-reset-cancel').click();assert.equal(await page.locator('#up-reset-dialog').isVisible(),false);
    checks.push('User profiles keeps Admin selected, groups Add user and Save all, uses compact rows and labelled PIN resets');
    await page.locator('[data-unique-id][data-account="account-0008"]').fill('MobileTest8');
    for(const tab of ['programs','courses','details']){await page.locator('#up-tab-'+tab).click();if(tab!=='details')await page.screenshot({path:path.join(out,'desktop-user-'+tab+'.png')});}await page.locator('#up-tab-details').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#up-tab-programs').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('#up-tab-details').getAttribute('aria-selected'),'true');assert.equal(await page.locator('[data-unique-id][data-account="account-0008"]').inputValue(),'MobileTest8');
    const profileRefresh=page.waitForResponse(r=>r.url().endsWith('/api/admin/platform/user-profiles/get'));await page.locator('[data-page-refresh]').click();await profileRefresh;
    await page.waitForFunction(()=>document.querySelector('#up-message').textContent==='Unfinished entries kept.');assert.equal(await page.locator('[data-unique-id][data-account="account-0008"]').inputValue(),'MobileTest8');
    const warned=page.waitForEvent('dialog').then(async d=>{assert.equal(d.type(),'beforeunload');await d.dismiss();});await page.locator('[data-page-home]').click();await warned;assert.equal(await page.locator('[data-unique-id][data-account="account-0008"]').inputValue(),'MobileTest8');
    checks.push('One banner Refresh reuses the page action, reloads current records and preserves unsaved profile entries');
    await page.locator('#up-save-all').click();await page.waitForFunction(()=>document.querySelector('#up-unsaved').textContent==='');
    await page.locator('[data-page-home]').click();await page.locator('#academy-tab-admin').waitFor();await page.locator('#academy-tab-admin').click();await page.locator('#admin-tab-assessments').click();await page.locator('#as-admin-host .as-workspace').waitFor();assert.equal(new URL(page.url()).hash,'#assessment-admin');
    assert.equal(await page.locator('#as-admin-host .as-workspace>.as-toolbar').count(),0);assert.equal(await page.locator('#as-admin-host [data-as=refresh]').count(),0);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});const strip=page.locator('#as-admin-host .as-tabs');
      const positions=await strip.locator('button').evaluateAll(ns=>ns.map(n=>n.offsetTop));if(width<=900)assert.ok(positions.every(y=>y===positions[0]));
      await strip.locator('[data-tab=reports]').click();await page.locator('[data-tab=reports][aria-pressed=true]').waitFor();
      const selected=await strip.locator('[data-tab=reports]').boundingBox(),help=await page.locator('#as-admin-host .as-help-button').boundingBox();assert.ok(selected.x>=0&&selected.x+selected.width<=help.x&&help.x+help.width<=width);
      await page.locator('#as-admin-host .as-help-button').click();await page.locator('#as-help-dialog').waitFor();await page.keyboard.press('Escape');
      await fits('compact assessment navigation '+width);
      if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'phone-assessment-draft.png')});}
    }
    checks.push('Assessment pills stay in a swipe row with adjacent help; duplicate heading and internal refresh removed');
    const fresh=page.waitForResponse(r=>r.url().endsWith('/api/academy/assessments/list'));await page.locator('[data-page-refresh]').click();await fresh;await page.locator('#as-admin-host .as-workspace').waitFor();assert.equal(new URL(page.url()).hash,'#assessment-admin');
    await go('/academy/library/');await page.locator('.academy-page-actions #ac-signout').click();await page.locator('#login-preview').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('m4l_account_token')),null);
    checks.push('Admin pills open editors directly; Home and Refresh preserve cancelled unsaved edits; Refresh retains the active page; connected Sign out clears access');
    assert.deepEqual(errors,[]);
    writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({checks,errors,syntheticDatabase:true,liveDataChanged:false},null,2));console.log('Mobile layout browser acceptance passed: '+checks.length+' checks. Evidence: '+out);
  } catch(error) {
    await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});
    writeFileSync(path.join(out,'failure.json'),JSON.stringify({url:page.url(),error:String(error),checks,errors},null,2));
    throw error;
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));fixture.db.close();}
}
