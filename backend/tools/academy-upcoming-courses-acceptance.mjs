// Packaged UI acceptance uses synthetic accounts and blocks external requests.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {upcomingCourseFixture} from '../tests/fixtures/academy-upcoming-course-fixture.mjs';
import {sunday,addDays} from '../src/academy/entrance.js';
const [assetsArg,outputArg]=process.argv.slice(2),assets=resolve(assetsArg),output=resolve(outputArg);mkdirSync(output,{recursive:true});
const f=await upcomingCourseFixture({startDay:1}),checks=[],errors=[],apiFailures=[];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf'};
let origin;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG='+JSON.stringify({API_BASE:origin,ENV_NAME:'development',IS_DEVELOPMENT:true,HIFZHELPER_URL:'https://maktab.hifz-helper.app/'}));return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const name=decodeURIComponent(url.pathname),file=resolve(assets,'.'+name+(name.endsWith('/')?'index.html':''));if(!file.startsWith(assets+'/'))throw Error('INVALID_PATH');const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const role of ['admin','teacher','student','other']){
  const context=await browser.newContext();await context.addInitScript(t=>localStorage.setItem('m4l_account_token',t),f.tokens[role]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.url().includes('/api/')&&r.status()>=400)apiFailures.push({role,path:new URL(r.url()).pathname,status:r.status()});});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/academy/#timetable/'+(role==='student'?'learn':'teach'));
   await page.locator('#timetable-areas .workspace-area-group').first().waitFor();
   const groups=page.locator('#timetable-areas .workspace-area-group');
   assert.equal(await groups.getByRole('heading',{name:'Programs',exact:true}).count(),1);
   if(['admin','teacher'].includes(role)){
    assert.equal(await groups.getByRole('heading',{name:'Courses',exact:true}).count(),1);
    const course=page.locator('.upcoming-course').filter({has:page.getByRole('heading',{name:'Surah Al Kahf',exact:true})});await course.waitFor();
    assert.match(await course.innerText(),/Planning/);assert.match(await page.locator('#timetable-areas [aria-label="Courses"]').innerText(),/Future draft/);
    assert(!await page.locator('#academy-sessions').innerText().then(t=>t.includes('Surah Al Kahf')));
    await page.screenshot({path:join(output,role+'-'+width+'.png')});
    await course.getByRole('button',{name:'Show starting week'}).click();await page.waitForFunction(()=>document.getElementById('academy-sessions').innerText.includes('Surah Al Kahf'));
    assert.equal(await page.locator('#schedule-date').inputValue(),sunday(f.startDate));
    await course.getByRole('link',{name:'Planning',exact:true}).click();
    await page.locator('#activity-planning [data-lp-change="week"]').waitFor();
    assert.equal(await page.locator('#activity-planning [data-lp-change="week"]').inputValue(),addDays(f.startDate,-new Date(f.startDate+'T12:00Z').getUTCDay()+1));
    assert.equal(await page.locator('#activity-planning [data-lp-change="run"]').inputValue(),f.published.runId);
    await page.locator('#activity-planning textarea').first().waitFor();
    checks.push({role,width,groups:true,upcoming:true,startingWeek:true,planningOffering:true});
   }else{
    assert(await page.locator('#upcoming-courses').isHidden());assert(!await page.locator('#timetable-areas').innerText().then(t=>t.includes('Future draft')));
    checks.push({role,width,privateUpcomingHidden:true});
   }
   const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,role+' '+width+' overflow');
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(apiFailures,[]);
 const report={success:true,checks,errors,apiFailures,syntheticOnly:true,liveDataChanged:false};writeFileSync(join(output,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
