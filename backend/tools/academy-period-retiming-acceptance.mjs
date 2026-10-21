// Period retiming and immediate clash warnings against a disposable database.
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
const out=process.env.PERIOD_RETIMING_OUTPUT||'/private/tmp/academy-period-retiming-acceptance';await mkdir(out,{recursive:true});
const f=await mediaFixture(),id=PROGRAM_IDS[0],activity='PROGRAM:'+id;
f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};const token=await f.login('0001');
const module=f.db.prepare('SELECT module_id FROM modules WHERE activity_key=? LIMIT 1').get(activity);
for(const [classId,name] of [['class-other','Other class'],['class-learner','Shared learner class']])f.db.prepare('INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)').run(activity,classId,name);
f.db.prepare("INSERT OR IGNORE INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('period-teacher','account-0006',?,'TEACHER',1,'CONFIRMED')").run(activity);
f.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,'period-shared-learner','class-learner','account-0002',1)").run(activity);
const ranges=[1,2,3,4,5].map(weekday=>({id:'AVAIL-period-'+weekday,weekday,startTime:'06:45',endTime:weekday===3?'08:10':'09:00'}));
f.db.prepare('INSERT OR REPLACE INTO teacher_availability VALUES(?,?,1,?)').run('account-0003',JSON.stringify(ranges),new Date().toISOString());
const lesson=(id,classId,teacherId,weekdays,startTime,endTime)=>({id,moduleId:module.module_id,teacherId,classIds:[classId],weekdays,startTime,endTime,zoomLink:'https://zoom.us/j/11111111111'});
const draft={format:'105.3.2.2-weekly',timezone:'Africa/Johannesburg',planner:{periods:[{id:'PERIOD-1',startTime:'07:00',endTime:'08:00'},{id:'PERIOD-2',startTime:'08:30',endTime:'09:30'},{id:'PERIOD-3',startTime:'10:00',endTime:'11:00'}],availability:[],limits:[]},rules:[lesson('RULE-linked','class-1','account-0003',[1,2,3,4,5],'07:00','08:00'),lesson('RULE-teacher','class-other','account-0003',[1],'08:15','08:45'),{...lesson('RULE-additional','class-other','account-0006',[2],'08:15','08:45'),additionalTeacherIds:['account-0003']},lesson('RULE-learner','class-learner','account-0006',[4],'08:15','08:45'),lesson('RULE-spanning','class-other','account-0006',[6],'08:30','11:00')],breaks:[{id:'BREAK-gap',weekdays:[5],startTime:'08:10',endTime:'08:25',label:'Morning break'}]};
f.db.prepare('UPDATE timetable_drafts SET draft_json=? WHERE activity_key=?').run(JSON.stringify(draft),activity);
const publishedBefore=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=?').all(activity);
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
  const page=await browser.newPage({viewport:{width,height:1050}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/version.json');await page.evaluate(t=>localStorage.setItem('m4l_account_token',t),token);await page.goto(origin+'/programs/?program='+id+'&tab=timetable');await page.locator('#tt-board [data-period]').first().waitFor();
  await page.locator('#tt-board-modes [data-board-mode=program]').click();assert.equal(await page.locator('#tt-board .is-conflict').count(),0);
  const end=()=>page.locator('[data-period=PERIOD-1][data-time=endTime]');await end().fill('08:20');await end().press('Tab');
  await page.waitForFunction(()=>document.querySelector('[data-rule-id=RULE-linked] .tt-board-lesson-label').textContent.includes('07:00–08:20'));
  for(const day of [1,2,3,4,5])assert.match(await page.locator('[data-rule-id=RULE-linked][data-board-day="'+day+'"] .tt-board-lesson-label').textContent(),/07:00–08:20/);
  assert.match(await page.locator('[data-rule-id=RULE-teacher] .tt-board-lesson-label').first().textContent(),/08:15–08:45/);
  assert.match(await page.locator('#tt-board-clashes').textContent(),/^8 scheduled lessons/);
  for(const [rule,day,why] of [['RULE-linked',1,'already teaches'],['RULE-teacher',1,'already teaches'],['RULE-additional',2,'already teaches'],['RULE-linked',3,'unavailable'],['RULE-linked',4,'learner belongs'],['RULE-linked',5,'overlaps a break']]){
   const card=page.locator('[data-rule-id='+rule+'][data-board-day="'+day+'"]').first();assert.match(await card.getAttribute('class'),/is-conflict/);assert.match(await card.locator('.tt-board-issue').textContent(),new RegExp(why));
  }
  await page.locator('#tt-board-clashes').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/period-clashes-'+width+'.png',fullPage:false});
  await page.locator('#tt-undo-placement').click();assert.equal(await end().inputValue(),'08:00');assert.equal(await page.locator('#tt-board .is-conflict').count(),0);assert.equal(await page.locator('#tt-board-clashes').isVisible(),false);
  if(width===1440){
   const outer=page.locator('[data-period=PERIOD-3][data-time=endTime]');await outer.fill('11:15');await outer.press('Tab');await page.waitForFunction(()=>[...document.querySelectorAll('[data-rule-id=RULE-spanning] .tt-board-lesson-label')].some(e=>e.textContent.includes('08:30–11:15')));
   await end().fill('08:20');await end().press('Tab');await page.locator('#tt-board-save').click();await page.locator('#tt-message').filter({hasText:'Weekly draft saved.'}).waitFor();
   const saved=JSON.parse(f.db.prepare('SELECT draft_json FROM timetable_drafts WHERE activity_key=?').get(activity).draft_json);assert.equal(saved.rules.find(r=>r.id==='RULE-linked').endTime,'08:20');assert.equal(saved.rules.find(r=>r.id==='RULE-spanning').endTime,'11:15');
   await page.reload();await page.locator('#tt-board [data-period]').first().waitFor();await page.locator('#tt-board-modes [data-board-mode=program]').click();assert.match(await page.locator('#tt-board-clashes').textContent(),/^8 scheduled lessons/);
   await page.getByRole('tab',{name:'Review & publish',exact:true}).click();await page.locator('#tt-validate').click();await page.locator('#tt-validation').filter({hasText:'Resolve these items'}).waitFor();assert(await page.locator('#tt-open-publish').isDisabled());
   await page.getByRole('tab',{name:'Timetable',exact:true}).click();await end().fill('08:00');await end().press('Tab');assert.equal(await page.locator('#tt-board .is-conflict').count(),0);await page.locator('#tt-board-save').click();await page.locator('#tt-message').filter({hasText:'Weekly draft saved.'}).waitFor();
   await page.getByRole('tab',{name:'Review & publish',exact:true}).click();await page.locator('#tt-validate').click();await page.locator('#tt-validation').filter({hasText:'Weekly timetable checked'}).waitFor();
   checks.push('Spanning boundaries, save/reload, validation blocking and resolution pass');
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=?').all(activity),publishedBefore);checks.push('All weekdays retime; teacher, additional-teacher, availability, learner and break clashes highlight; Undo clears warnings at '+width+'px');await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/acceptance.json',JSON.stringify({result:'PASS',checks,errors},null,2));console.log(JSON.stringify({result:'PASS',output:out,checks,errors}));
}catch(error){console.error(JSON.stringify({error:error.message,errors}));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
