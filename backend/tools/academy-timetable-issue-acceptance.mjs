// Exercise validation and the nested lesson modal against a disposable database.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mediaFixture} from '../tests/fixtures/academy-lesson-media-fixture.mjs';
import {PROGRAM_IDS} from '../tests/fixtures/academy-migration-fixture.mjs';
import worker from '../src/academy-runtime.js';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const out=process.env.TIMETABLE_ISSUE_OUTPUT||'/private/tmp/academy-timetable-issue-acceptance';await mkdir(out,{recursive:true});
const f=await mediaFixture(),id=PROGRAM_IDS[0],activity='PROGRAM:'+id;
f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const token=await f.login('0001');
const module=f.db.prepare('SELECT module_id FROM modules WHERE activity_key=? LIMIT 1').get(activity);
f.db.prepare('DELETE FROM class_teacher_assignments WHERE activity_key=?').run(activity);
const draft={format:'105.3.2.2-weekly',timezone:'Africa/Johannesburg',planner:{periods:[{id:'PERIOD-issue',startTime:'10:00',endTime:'11:00'}],availability:[],limits:[]},rules:[{id:'RULE-missing-teacher',zoomLink:'https://zoom.us/j/11111111111',moduleId:module.module_id,teacherId:'',classIds:['class-1'],weekdays:[1,2,3],startTime:'10:00',endTime:'11:00'}]};
f.db.prepare('UPDATE timetable_drafts SET draft_json=? WHERE activity_key=?').run(JSON.stringify(draft),activity);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const r=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;}
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(404);res.end();return;}
 if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:950}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/version.json');await page.evaluate(t=>localStorage.setItem('m4l_account_token',t),token);
  await page.goto(origin+'/programs/?program='+id+'&tab=review');await page.locator('#tt-validate').click();
  await page.locator('#tt-validation').filter({hasText:'Assign at least one teacher'}).waitFor();assert.equal(await page.locator('#tt-planner').isVisible(),false);
  await page.locator('#tt-validation [data-open-issue]').first().click();
  await page.waitForFunction(()=>document.getElementById('pg-tab-timetable').getAttribute('aria-selected')==='true');
  const dialog=page.locator('#tt-quick-lesson-dialog');await dialog.waitFor();assert(await dialog.evaluate(d=>d.open&&d.getBoundingClientRect().width>0));assert(await page.locator('#tt-planner').isVisible());
  await page.screenshot({path:out+'/visible-lesson-editor-'+width+'.png',fullPage:false});
  if(width===390){
   await dialog.locator('[data-inline-teacher]').selectOption('account-0003');await page.locator('#tt-quick-save').click();await dialog.waitFor({state:'hidden'});
   await page.getByRole('tab',{name:'Review & publish',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/program-timetable/validate')),page.locator('#tt-validate').click()]);await page.locator('#tt-validate').isEnabled();
   await page.locator('#tt-validation').filter({hasText:'Assign at least one teacher'}).waitFor();
   const saved=JSON.parse(f.db.prepare('SELECT draft_json FROM timetable_drafts WHERE activity_key=?').get(activity).draft_json);assert(saved.rules.some(r=>r.teacherId==='account-0003'&&r.weekdays.includes(1)));assert(saved.rules.some(r=>r.weekdays.includes(2)&&r.weekdays.includes(3)),'Other weekday lessons remain in the draft');
   await page.locator('#tt-validation [data-open-issue]').first().click();await dialog.waitFor();assert(await page.locator('#tt-planner').isVisible());await page.locator('#tt-quick-cancel').click();
   checks.push('Teacher correction is saved; remaining weekday issues stay accessible without changing the published timetable');
  }else{
   await page.locator('#tt-quick-cancel').click();await dialog.waitFor({state:'hidden'});await page.getByRole('tab',{name:'Review & publish',exact:true}).click();assert(await page.locator('#tt-validate').isEnabled());
  }
  checks.push('Validation issue opens a visible, interactive lesson dialog at '+width+'px');await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/acceptance.json',JSON.stringify({result:'PASS',checks,errors},null,2));console.log(JSON.stringify({result:'PASS',output:out,checks,errors}));
}catch(error){console.error(JSON.stringify({error:error.message,errors}));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
