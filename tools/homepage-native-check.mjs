// Disposable GitHub runner only; all browser requests are intercepted fixtures.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {homepageProspectus} from '../portal/shared/programme-prospectus.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Run the native homepage check only on GitHub.');
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'.academy-pages'),out=resolve(process.env.RUNNER_TEMP,'homepage-native-evidence');
await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(process.env.REVIEW_BROWSER_MODULES,'node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true}),base='https://academy.invalid',errors=[],unexpectedApi=[],checks=[];
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const row={id:homepageProspectus.announcementId,title:'2027 Enrolments are open for current students',summary:'',message:'A new year of learning. Speak to the Academy.',imageUrl:'',imageAlt:'',pdfUrl:'',pdfName:'',enrolmentUrl:''};
const bootcamp={id:'00000000-0000-4000-8000-000000000002',title:'Surah Al-Kahf Bootcamp',summary:'A published course notice.',message:'Public announcement details.',imageUrl:'',imageAlt:'',pdfUrl:'',pdfName:'',enrolmentUrl:''};
const indexHTML=await readFile(resolve(assets,'index.html'),'utf8');
const htmlBase=new URL(indexHTML.match(/<base href="([^"]+)"/)?.[1]||'/',base);
const styles=[...indexHTML.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>{const url=new URL(match[1],htmlBase);return '<link rel="stylesheet" href="'+url.pathname+url.search+'">';}).join('');
const fixture='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body class="circle"><div class="academy-public wrap"><section id="academy-news" class="academy-news section rule"><div class="section-head"><div><span class="eyebrow">News &amp; announcements</span><h2>What’s happening.</h2></div></div><div id="academy-news-reel"><article class="academy-news-card" data-announcement="legacy"><h3>Legacy notice</h3><p>Old presentation.</p></article></div></section></div><script src="/circles/prospectus-2027.js"></script><script type="module">import {publicHome} from "/shared/public-home.mjs";window.fixtureRefresh=publicHome(document);window.fixtureRefresh();</script></body></html>';
async function pageFor(mode='published'){
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});let collections=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(url.pathname==='/__native-homepage-test.html')return route.fulfill({status:200,contentType:'text/html',body:fixture});
  if(url.pathname==='/api/public/academy-announcements'){
   collections++;if(mode==='legacy')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Not activated.',code:'ANNOUNCEMENTS_NOT_ACTIVATED'})});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schema:'ACADEMY_ANNOUNCEMENTS_PUBLIC_V2',success:true,generation:1,announcements:mode==='empty'?[]:mode==='withdrawn'?[bootcamp]:[mode==='with-pdf'?{...row,pdfUrl:base+'/api/public/academy-announcements/pdf?id='+row.id+'&asset='+'a'.repeat(64),pdfName:'Deferred.pdf'}:row,bootcamp]})});
  }
  if(url.pathname.startsWith('/api/')){unexpectedApi.push(url.pathname);return route.abort();}
  try{const path=resolve(assets,'.'+url.pathname);if(!path.startsWith(assets+'/'))throw Error('Invalid asset');return route.fulfill({status:200,contentType:mime[extname(path)]||'application/octet-stream',body:await readFile(path)});}catch{return route.fulfill({status:404,body:'Not found'});}
 });
 await page.goto(base+'/__native-homepage-test.html');return {page,collections:()=>collections};
}
try{
 const f=await pageFor(),page=f.page;
 await page.locator('.academy-prospectus-announcement [role=tab]').first().waitFor();
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('[data-prospectus-course]').count(),6);
 assert.equal(await page.locator('[data-full-prospectus]').count(),0);
 assert.equal(await page.locator('.announcement-public-panel .announcement-feature h3').textContent(),bootcamp.title);
 const right=await page.locator('.enrolments-banner').innerHTML();
 await page.locator('[data-prospectus-course=mothers]').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('[role=tab][aria-selected=true]').getAttribute('data-prospectus-course'),'tafseer');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.prospectusCourse),'tafseer');
 await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.prospectusCourse),'aalimiyah');
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.prospectusCourse),'arabic-adventures');
 checks.push('Native public-home controller renders the exact published prospectus, preserves Bootcamp and supports stable keyboard navigation.');
 const ids=await page.locator('[data-prospectus-course]').evaluateAll(nodes=>nodes.map(node=>node.dataset.prospectusCourse));
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:1100});
  for(const id of ids){
   await page.locator('[data-prospectus-course="'+id+'"]').click();
   assert.equal(await page.locator('.enrolments-banner').innerHTML(),right);
   const fit=await page.locator('.academy-prospectus-announcement').evaluate(host=>{
    const card=host.querySelector('.course-announcement-card'),r=card.getBoundingClientRect(),list=host.querySelector('[role=tablist]'),body=host.querySelector('.announcement-timetable');
    return {tabs:list.scrollWidth<=list.clientWidth+1&&[...list.children].every(tab=>{const t=tab.getBoundingClientRect();return t.left>=r.left-1&&t.right<=r.right+1&&tab.scrollWidth<=tab.clientWidth+1&&tab.scrollHeight<=tab.clientHeight+1;}),content:body.scrollWidth<=body.clientWidth+1&&body.scrollHeight<=body.clientHeight+1,page:document.documentElement.scrollWidth<=innerWidth};
   });
   if(!fit.tabs||!fit.content||!fit.page){
    const diagnostic=await page.locator('.announcement-timetable').evaluate(body=>({bounds:body.getBoundingClientRect().toJSON(),client:[body.clientWidth,body.clientHeight],scroll:[body.scrollWidth,body.scrollHeight],children:[...body.querySelectorAll('*')].filter(node=>{const r=node.getBoundingClientRect(),b=body.getBoundingClientRect();return r.right>b.right+1||r.bottom>b.bottom+1||node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1;}).map(node=>({tag:node.tagName,class:node.className,text:node.textContent.slice(0,90),bounds:node.getBoundingClientRect().toJSON(),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight]}))}));
    console.log('BROCHURE_LAYOUT_DIAGNOSTIC '+JSON.stringify({width,id,fit,diagnostic}));
    await page.locator('.academy-prospectus-announcement').screenshot({path:resolve(out,'native-homepage-failure.png')});
   }
   assert(fit.tabs&&fit.content&&fit.page,'Clipped native brochure at '+width+'px for '+id+': '+JSON.stringify(fit));
  }
  await page.locator('[data-prospectus-course=mothers]').click();
  if(width===390||width===1440)await page.locator('.academy-prospectus-announcement').screenshot({path:resolve(out,'native-homepage-'+width+'.png')});
  checks.push('Six native course panels and all tabs remain unclipped at '+width+'px.');
 }
 assert.equal(f.collections(),1,'Course selection must not trigger another collection or card request');
 await page.evaluate(()=>window.fixtureRefresh());assert.equal(f.collections(),1);
 await page.setViewportSize({width:1440,height:1100});
 await page.locator('[data-prospectus-details]').click();await page.getByRole('dialog').waitFor();
 assert.match(await page.getByRole('dialog').textContent(),/A new year of learning/);
 await page.keyboard.press('Escape');
 const empty=await pageFor('empty');await empty.page.waitForFunction(()=>document.getElementById('academy-news').hidden);
 assert.equal(await empty.page.locator('.academy-prospectus-announcement').isVisible(),false);
 assert.equal(await empty.page.locator('[data-prospectus-details]').count(),0);
 assert.equal(await empty.page.locator('[data-full-prospectus]').count(),0);await empty.page.close();
 const legacy=await pageFor('legacy');await legacy.page.locator('.announcements-master-detail').waitFor();
 assert.equal(await legacy.page.locator('.academy-prospectus-announcement').isVisible(),false);await legacy.page.close();
 const withdrawn=await pageFor('withdrawn');await withdrawn.page.locator('.announcement-feature h3').waitFor();
 assert.equal(await withdrawn.page.locator('.academy-prospectus-announcement').isVisible(),false);
 assert.equal(await withdrawn.page.locator('[data-prospectus-details]').count(),0);
 assert.equal(await withdrawn.page.locator('.announcement-public-panel').innerText(),await page.locator('.announcement-public-panel').innerText());await withdrawn.page.close();
 const attached=await pageFor('with-pdf');await attached.page.locator('[data-prospectus-details]').waitFor();
 assert.equal(await attached.page.locator('[data-full-prospectus]').count(),0);
 await attached.page.locator('[data-prospectus-details]').click();await attached.page.getByRole('dialog').waitFor();
 assert.equal(await attached.page.getByRole('dialog').locator('a[href*="/pdf"]').count(),0);await attached.page.close();
 checks.push('PDF-free published panel is visible; empty/legacy/withdrawn feeds remain authoritative; Bootcamp remains; no PDF links even when attached; one cached collection.');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpectedApi,[]);
 await writeFile(resolve(out,'native-homepage-check.json'),JSON.stringify({passed:true,commit:process.env.GITHUB_SHA,checks,errors,hostedReads:0,unexpectedApi,macWrites:0,pdfBytesUploaded:0,publication:'PDF dependency removed, public-notice authority retained. No hosted content changes in tests.'},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks:checks.length,hostedReads:0}));
}finally{await browser.close();}
