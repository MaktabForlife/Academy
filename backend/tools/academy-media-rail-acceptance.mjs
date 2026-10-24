// Local presentation checks; no hosted accounts, data or network requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/private/tmp/academy-media-rail-acceptance';mkdirSync(out,{recursive:true});
const requests=[],errors=[],outside=[],checks=[],pdf=readFileSync(path.join(root,'academy/pdf-compare/sample.pdf'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.pdf':'application/pdf','.png':'image/png','.svg':'image/svg+xml','.ftl':'text/plain','.wasm':'application/wasm','.ttf':'font/ttf','.bcmap':'application/octet-stream'};
function calendar(input){
 const kind=input.activityKey.split(':')[0],activityName=kind==='COURSE'?'Tafseer & Tadabbur — a complete introduction':'Mothers of the Ummah';
 const sessions=Array.from({length:6},(_,i)=>{
  const date=new Date(Date.parse(input.startDate+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),title=i===1?'A longer lesson title about knowledge, practice and building a daily routine':'Lesson '+(i+1);
  const assets=Array.from({length:i===2?16:2},(_,j)=>({id:'asset-'+i+'-'+j,kind:j%2?'PDF':'YOUTUBE',name:j%2?'Lesson <Guide> '+(i+1)+'.pdf':'Recording '+(i+1)+' — understanding the lesson',filename:'lesson-'+(i+1)+'.pdf'}));
  return {sessionKey:'session-'+i,date,title,startTime:'09:00',endTime:'10:00',teacherName:i===1?'Teacher with a longer display name':'Teacher '+(i+1),classNames:['Class A'],canManage:false,canContribute:false,media:{id:'lesson-'+i,activityKey:input.activityKey,date,title,state:'PUBLISHED',summary:'Published lesson summary',canView:true,canManage:false,assets}};
 });
 return {success:true,kind,activityName,timezone:'Africa/Johannesburg',runId:'',runs:[],sessions,lessons:sessions.map(s=>s.media),canManage:false};
}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname.startsWith('/test/')){
  const kind=url.pathname.endsWith('COURSE')?'COURSE':'PROGRAM';res.writeHead(200,{'Content-Type':'text/html'});
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/m4l-lesson-media.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4edf6;color:#302735;font:14px Arial}main{max-width:1120px;padding:12px;margin:auto}</style><main><section id="media"></section></main><script>window.M4L_CONFIG={API_BASE:location.origin,MEDIA_SEPARATION:true};localStorage.setItem('m4l_account_token','synthetic');</script><script src="/js/m4l-lesson-media.js"></script><script>M4L_LESSON_MEDIA.open({hostId:'media',activityKey:'${kind}:fixture',learnerView:true});</script>`);return;
 }
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString()||'{}');requests.push({path:url.pathname,input});
  if(url.pathname.endsWith('/download')){res.writeHead(200,{'Content-Type':'application/pdf'});res.end(pdf);return;}
  const result=url.pathname.endsWith('/calendar')?calendar(input):url.pathname.endsWith('/watch')?{success:true,embedUrl:'https://www.youtube-nocookie.com/embed/9IuTDcSs6vQ?rel=0'}:null;
  assert(result,'Unexpected API action');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));assert(file.startsWith(root)&&!url.pathname.includes('/backend/'));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
}catch(error){res.writeHead(404);res.end(String(error));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{
 const url=new URL(route.request().url());if(url.origin===origin||url.protocol==='blob:')return route.continue();
 if(url.origin==='https://www.youtube-nocookie.com')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated recording player</title>'});
 outside.push(url.href);return route.abort();
});
try{
 for(const kind of ['PROGRAM','COURSE'])for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/test/'+kind);await page.locator('.lm-media-card').first().waitFor();
  assert.equal(await page.locator('.lm-media-card').count(),6);assert.equal(await page.locator('.lm-day,.lm-timetable').count(),0);
  const boxes=await page.locator('.lm-media-card').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height,y:r.y};}));
  assert(boxes.every(b=>Math.abs(b.width-boxes[0].width)<1&&Math.abs(b.height-boxes[0].height)<1&&Math.abs(b.y-boxes[0].y)<1),'Equal-sized cards stay on one rail');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page fits the viewport');
  assert.match(await page.locator('.lm-card-date').first().textContent(),/^[A-Z][a-z]{2} \d{2} [A-Z][a-z]{2} \d{2}$/);
  assert.equal(await page.locator('.lm-card-title').first().textContent(),kind==='COURSE'?'Tafseer & Tadabbur — a complete introduction':'Lesson 1');
  assert.equal(await page.locator('.lm-card-teacher').count(),kind==='PROGRAM'?6:0);
  for(const selector of ['.lm-card-chat','.lm-card-file'])assert((await page.locator(selector).first().boundingBox()).height>=36);
  assert.equal(await page.locator('.lm-card-file svg').count(),26,'Every video/PDF has its own icon and name');
  const before=requests.length;await page.getByRole('button',{name:'Chat coming soon',exact:true}).first().click();await page.getByRole('heading',{name:'Chat coming soon',exact:true}).waitFor();assert.equal(requests.length,before);await page.locator('.lm-dialog [data-lm=close]').click();
  await page.getByRole('button',{name:'Next media cards',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.lm-media-rail').scrollLeft>0);assert.equal(requests.length,before,'Rail navigation adds no API requests');
  await page.locator('.lm-media-rail').evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
  await page.screenshot({path:path.join(out,kind.toLowerCase()+'-'+width+'.png'),fullPage:false});
  await page.getByRole('button',{name:'Open PDF: Lesson <Guide> 1.pdf',exact:true}).click();await page.frameLocator('.lm-pdf').locator('.page[data-page-number="1"] canvas').waitFor({state:'visible'});assert(await page.locator('.lm-dialog a[download]').isVisible());await page.locator('.lm-dialog [data-lm=close]').click();
  await page.getByRole('button',{name:'Open video: Recording 1 — understanding the lesson',exact:true}).click();await page.locator('.lm-player').waitFor();await page.locator('.lm-dialog [data-lm=close]').click();
  const date=await page.locator('[data-lm-date]').inputValue();await page.getByRole('button',{name:'Next week',exact:true}).click();await page.waitForFunction(date=>document.querySelector('[data-lm-date]').value!==date,date);await page.locator('.lm-media-rail[aria-busy=false]').waitFor();assert.equal(await page.locator('.lm-media-card').count(),6);
  if(width===390){await page.locator('[data-lm-date]').fill('2026-09-06');await page.locator('[data-lm-date]').press('Tab');await page.locator('.lm-card-date').first().filter({hasText:'Sun 06 Sep 26'}).waitFor();}
  checks.push(kind+' rail: '+width+'px, equal cards, named file actions, chat placeholder and date navigation');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);const report={passed:true,checks,errors,outside,hostedDataAccessed:false,output:out};writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
