// Run on a disposable GitHub runner only. Never contacts live Academy services.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {programmes,announcements} from '../portal/circles/homepage-review-data.mjs';
if(!process.env.GITHUB_ACTIONS)throw Error('This review runs only on GitHub; do not generate output on the owner’s Mac.');
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'homepage-review-evidence');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local.invalid').pathname,file=resolve(directory,'.'+pathname);if(!file.startsWith(directory+'/'))throw Error('Outside public assets');const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(resolve(process.env.REVIEW_BROWSER_MODULES,'node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const url=new URL(route.request().url());requests.push(url.href);if(url.origin===base||url.protocol==='data:')return route.continue();return route.abort();});
try{
 await page.goto(base+'/circles/homepage-review.html');
 await page.locator('#course-announcement-panel h3').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#news [role=tab]').count(),6);
 assert.equal(await page.locator('#course-announcement-panel h3').textContent(),'Mothers of the Ummah');
 assert.match(await page.locator('[data-course-schedule]').getAttribute('data-schedule-summary'),/Monday–Thursday · 09:30–10:30 SAST/);
 assert.equal(await page.locator('[data-course-fee]').textContent(),'R500 per month');
 assert.equal(await page.locator('#timetables, #programme-panel, a[href="#timetables"]').count(),0);
 checks.push('One joined card with six course tabs in announcements; no separate bottom timetable or dead timetable links.');
 const enrolmentsBefore=await page.locator('.enrolments-banner').innerHTML();
 assert.equal(await page.locator('#full-prospectus-link').getAttribute('aria-disabled'),'true');
 const firstTab=await page.locator('#announcement-tab-mothers').elementHandle();
 await page.locator('#announcement-tab-mothers').focus();
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('[role=tab][aria-selected=true]').getAttribute('id'),'announcement-tab-tafseer');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'announcement-tab-tafseer');
 assert.match(await page.locator('[data-course-schedule]').getAttribute('data-schedule-summary'),/Saturday · 08:30–09:30 SAST/);
 assert.equal(await page.locator('[data-course-fee]').textContent(),'R300 per month');
 await page.keyboard.press('ArrowLeft');
 assert(await firstTab.evaluate(node=>node===document.activeElement));
 await page.keyboard.press('Home');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'announcement-tab-aalimiyah');
 await page.keyboard.press('End');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'announcement-tab-arabic-adventures');
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'announcement-tab-aalimiyah');
 checks.push('Arrow, Home and End keys activate tabs, wrap around and retain stable keyboard focus.');
 for(const programme of programmes){
  const tab=page.locator('#announcement-tab-'+programme.id);
  await tab.click();
  assert.equal(await page.locator('#course-announcement-panel h3').textContent(),programme.name);
  assert.equal(await page.locator('#course-announcement-panel').getAttribute('aria-labelledby'),'announcement-tab-'+programme.id);
  assert.equal(await tab.getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[role=tab][tabindex="0"]').count(),1);
  if(!programme.schedule.length)assert.match(await page.locator('[data-course-schedule]').getAttribute('data-schedule-summary'),/confirm the 2027 days and times/);
  if(!programme.fee)assert.match(await page.locator('[data-course-fee]').textContent(),/Confirm current fees/);
  assert.equal(await page.locator('.enrolments-banner').innerHTML(),enrolmentsBefore,'General 2027 enrolments stays independent of the selected course');
  assert((await page.locator('.course-announcement-body').boundingBox()).height<=420,'Course card stays compact');


 }
 checks.push('Independent left course/timetable card with six fitted tabs and typed English/Arabic names; right 2027 enrolments remains unchanged across course selection.');
 await page.locator('.programme-card a[data-programme="mothers"]').click();
 assert.equal(await page.locator('#course-announcement-panel h3').textContent(),'Mothers of the Ummah');
 await page.locator('.pathway-worship').click();
 assert.equal(await page.locator('#course-announcement-panel h3').textContent(),'Tafseer and Tadabbur');
 checks.push('Programme overview and welcome links select the matching course inside announcements.');
 assert.equal(await page.locator('#news-briefs .news-brief').count(),2);
 assert.match(await page.locator('.pathway-course-names').textContent(),/Tafseer and Tadabbur/);
 assert.match(await page.locator('.pathway-course-names').textContent(),/Mothers of the Ummah/);
 await page.locator('#news-briefs details summary').first().click();
 assert(await page.locator('#news-briefs details').first().evaluate(node=>node.open));
 await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs');review.setAnnouncements([]);});
 assert.equal(await page.locator('#news-briefs .news-brief').count(),0);
 assert.equal(await page.locator('#news [role=tab]').count(),6);
 await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs'),{announcements}=await import('/circles/homepage-review-data.mjs');review.setAnnouncements([announcements[1]]);});
 assert.equal(await page.locator('#news-briefs .news-brief').count(),1);
 await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs'),{announcements}=await import('/circles/homepage-review-data.mjs');review.setAnnouncements(Array.from({length:5},(_,i)=>({...announcements[i%announcements.length],id:'extra-'+i})));});
 assert.equal(await page.locator('#news-briefs .news-brief').count(),5);
 await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs'),{announcements}=await import('/circles/homepage-review-data.mjs');review.setAnnouncements([{...announcements[1],title:'<img src=x onerror=alert(1)>'}]);});
 assert.equal(await page.locator('#news-briefs h3 img').count(),0);
 assert.match(await page.locator('#news-briefs h3').textContent(),/<img/);
 await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs'),{announcements}=await import('/circles/homepage-review-data.mjs');review.setAnnouncements(announcements);review.chooseProgramme('mothers');});
 checks.push('General news supports zero, one and five items, readable expanded details and safely escaped editable titles.');
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1100});
  await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs');review.chooseProgramme('mothers');});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow at '+width);
  assert.equal(await page.locator('#timetables').count(),0);
  const separation=await page.locator('#announcement-layout').evaluate(node=>{
   const left=node.querySelector('.timetable-frame').getBoundingClientRect(),right=node.querySelector('.enrolments-banner').getBoundingClientRect();
   return {sideBySide:right.left>=left.right-1&&Math.abs(right.top-left.top)<1,stacked:right.top>=left.bottom-1};
  });
  assert(width>900?separation.sideBySide:separation.stacked,'Course card and general enrolments layout at '+width+'px');

  const tabFit=await page.locator('#announcement-feature').evaluate(card=>{
   const bounds=card.getBoundingClientRect(),list=card.querySelector('[role=tablist]'),tabs=[...list.querySelectorAll('[role=tab]')];
   return {fits:tabs.every(tab=>{const r=tab.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1&&tab.scrollWidth<=tab.clientWidth+1&&tab.scrollHeight<=tab.clientHeight+1;}),noScroll:list.scrollWidth<=list.clientWidth+1,rows:new Set(tabs.map(tab=>Math.round(tab.getBoundingClientRect().top))).size};
  });
  assert(tabFit.fits&&tabFit.noScroll,'All six complete tab labels must fit over the card at '+width+'px');
  if(width>700)assert.equal(tabFit.rows,1,'Desktop tabs must remain in one row');

  for(const programme of programmes){
   await page.evaluate(async(id)=>{const {review}=await import('/circles/homepage-review.mjs');review.chooseProgramme(id);},programme.id);
   const overflow=await page.locator('.course-announcement-body').evaluate(node=>[...node.children].some(child=>child.scrollHeight>child.clientHeight+1||child.scrollWidth>child.clientWidth+1));
   assert.equal(overflow,false,'Course panel content overflow at '+width+'px for '+programme.id);
  }
  await page.evaluate(async()=>{const {review}=await import('/circles/homepage-review.mjs');review.chooseProgramme('mothers');});

  checks.push('No horizontal page overflow at '+width+'px.');
  if(width===390||width===1440){
   await page.locator('#news').screenshot({path:resolve(out,'announcements-'+width+'.png')});
   await page.locator('#announcement-feature').screenshot({path:resolve(out,'course-tabs-'+width+'.png')});
   await page.locator('#announcement-layout').screenshot({path:resolve(out,'announcement-layout-'+width+'.png')});
   await page.locator('#home').screenshot({path:resolve(out,'circle-'+width+'.png')});
  }
 }
 assert.deepEqual(errors,[]);
 assert(!requests.some(url=>new URL(url).pathname.startsWith('/api/')));
 checks.push('No live account/API/database requests or browser errors.');
 // Larger page rendering must not push a course tab outside its card.
 await page.setViewportSize({width:1440,height:1100});
 for(const zoom of [1.25,1.5,2]){
  await page.evaluate(value=>{document.documentElement.style.zoom=String(value);},zoom);
  assert(await page.locator('#announcement-feature').evaluate(card=>{
   const r=card.getBoundingClientRect(),list=card.querySelector('[role=tablist]');
   return list.scrollWidth<=list.clientWidth+1&&[...list.querySelectorAll('[role=tab]')].every(tab=>{const t=tab.getBoundingClientRect();return t.left>=r.left-1&&t.right<=r.right+1&&tab.scrollWidth<=tab.clientWidth+1;});
  }),'Tabs must fit the card at '+zoom+'x rendering');
 }
 await page.evaluate(()=>{document.documentElement.style.removeProperty('zoom');});
 assert.equal(await page.locator('#announcement-feature .enrolments-banner').count(),0);
 assert.match(await page.locator('.enrolments-lockup').textContent(),/2027/);
 assert.match(await page.locator('.enrolments-contact-strip').textContent(),/\+27 82 847 8639/);
 assert.equal(await page.locator('#full-prospectus-link').getAttribute('href'),null,'HTTP-only review never exposes the local PDF');
 checks.push('All six tabs stay within the separate green-framed card, including larger rendering; enrolments heading, full-prospectus action and typed contact strip match the owner mockup.');


 // Self-contained copy for review: CSS, fonts and scripts stay in the artifact.
 let html=await readFile(resolve(directory,'circles/homepage-review.html'),'utf8');html=html.replace('<script src="/hosting-config.js"></script>','<script>'+await readFile(resolve(directory,'hosting-config.js'),'utf8')+'</script>');
 const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)];
 for(const [tag,href]of styles){let css=await readFile(resolve(directory,'.'+href),'utf8');for(const match of [...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)]){if(match[2].startsWith('data:'))continue;const asset=match[2].startsWith('/')?resolve(directory,'.'+match[2]):resolve(dirname(resolve(directory,'.'+href)),match[2]);try{const bytes=await readFile(asset),type=mime[extname(asset)]||'application/octet-stream';css=css.replace(match[0],'url("data:'+type+';base64,'+bytes.toString('base64')+'")');}catch{}}html=html.replace(tag,'<style>'+css+'</style>');}
 const data=await readFile(resolve(directory,'circles/homepage-review-data.mjs'),'utf8'),script=await readFile(resolve(directory,'circles/homepage-review.mjs'),'utf8');
 const inline=data.replace(/^export /gm,'')+'\n'+script.replace(/^import .*?;\n/,'').replace(/^export /gm,'');
 html=html.replace('<script type="module" src="/circles/homepage-review.mjs"></script>','<script type="module">'+inline.replace(/<\/script/gi,'<\\/script')+'</script>');
 await writeFile(resolve(out,'homepage-review-standalone.html'),html);
 await writeFile(resolve(out,'OPEN-PREVIEW.txt'),'Open homepage-review-standalone.html. Keep the extracted preview folder in Downloads, next to the original 2027 prospectus copy.pdf. View the full prospectus opens that existing local PDF. The PDF is not included or uploaded. Design review only; not deployed.\n');
 const standalone=await browser.newPage();await standalone.route('**/*',route=>route.request().url().startsWith('file:')||route.request().url().startsWith('data:')?route.continue():route.abort());await standalone.goto(pathToFileURL(resolve(out,'homepage-review-standalone.html')).href);await standalone.locator('#course-announcement-panel h3').waitFor();await standalone.locator('#announcement-tab-tafseer').click();assert.match(await standalone.locator('[data-course-schedule]').getAttribute('data-schedule-summary'),/Saturday · 08:30–09:30 SAST/);assert.equal(await standalone.locator('[data-course-fee]').textContent(),'R300 per month');assert.equal(await standalone.locator('#timetables').count(),0);assert.equal(await standalone.locator('#full-prospectus-link').getAttribute('aria-disabled'),null);assert.equal(await standalone.locator('#full-prospectus-link').getAttribute('href'),'../2027%20prospectus%20copy.pdf');assert.equal(decodeURIComponent(new URL(await standalone.locator('#full-prospectus-link').getAttribute('href'),standalone.url()).pathname).split('/').at(-1),'2027 prospectus copy.pdf');await standalone.close();checks.push('Standalone HTML keeps fonts/scripts offline and links only to the second PDF already on the owner Mac; no PDF contents uploaded.');
 await writeFile(resolve(out,'review.json'),JSON.stringify({passed:true,commit:process.env.GITHUB_SHA,checks,errors,liveRequests:0,macWrites:0,pdfUploaded:false,prospectus:'Second owner-supplied PDF remains local; final integration must reuse the existing Admin announcement attachment.',programmeFacts:'Drafts from existing 2027 catalogue and owner-supplied flyers; missing values remain unconfirmed.'},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks:checks.length,output:out}));
}finally{await browser.close();await new Promise(done=>server.close(done));}
