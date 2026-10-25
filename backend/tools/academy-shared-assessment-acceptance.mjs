// Actual pages and Worker with disposable D1/R2. All external browser traffic is blocked.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {separationFixture,separationScopes as scopes} from '../tests/fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import worker from '../src/academy-runtime.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ACADEMY_SHARED_ASSESSMENT_OUTPUT||'/private/tmp/academy-shared-assessment-10751';mkdirSync(out,{recursive:true});
const f=await separationFixture(),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()});
f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'review-second','Second review class',1)").run(scopes.programA);
f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,'review-second','account-0003','ADDITIONAL')").run(scopes.programA);
f.db.prepare("INSERT INTO class_memberships VALUES(?,'shared-browser-membership','review-second',?,NULL,NULL,1)").run(scopes.programA,f.actors.studentA);
const tokens={admin:await f.actor('global'),scoped:await f.actor('adminA'),teacher:await f.login('0003'),student:await f.login('0002')};
const call=async(path,input={},who='admin')=>{const r=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'Content-Type':'application/json','X-Academy-Workspace':who==='admin'?'ADMIN':who==='teacher'?'TEACH':'LEARN'},body:JSON.stringify(input)}),f.env);return {status:r.status,body:await r.json()};};
const details={name:'Media review Course',categoryKey:'',accessModel:'FREE',timezone:'Africa/Johannesburg',weekdays:[0],startDate:'2026-10-25',endDate:'2026-10-25',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-10-25',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Course media review session',status:'SCHEDULED'}]};
const course=ok(await call('/api/admin/platform/courses/save',{...op(),details}));let c=ok(await call('/api/admin/platform/courses/get',course)).course;
const checked=ok(await call('/api/admin/platform/courses/validate',{...op(),...course,baseRevision:c.revision}));assert(checked.validation.valid);const accepted=ok(await call('/api/admin/platform/courses/accept',{...op(),...course,baseRevision:checked.revision,validationToken:checked.validation.token,acknowledgeWarnings:true}));ok(await call('/api/admin/platform/courses/publish',{...op(),...course,baseRevision:accepted.revision,validationToken:checked.validation.token}));
for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
await initialiseAcceptedSetup(f.env.ACADEMY_DB);Object.assign(f.env,{ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'});
async function acceptMedia(key){const input={scopes:[key],families:['media']},review=ok(await call('/api/admin/platform/setup/review',input)),frozen=ok(await call('/api/admin/platform/setup/freeze',{...input,digest:review.digest}));ok(await call('/api/admin/platform/setup/publish',{batchId:frozen.batchId,digest:frozen.digest}));}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,SETUP_PUBLICATION:true,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true}');return;}
 if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,gregorian:'2026-10-25',hijri:'14 Jumada al-ula 1448'}));return;}
 if(url.pathname==='/academy/open-library/catalogue'){res.setHeader('Content-Type','application/json');res.end('{"books":[]}');return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const r=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root))throw Error('Invalid path');res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
}catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),checks=[],errors=[];
await context.route('**/*',r=>new URL(r.request().url()).origin===origin||r.request().url().startsWith('blob:')?r.continue():r.abort());page.on('pageerror',e=>errors.push(String(e)));
async function identity(who,url){await page.goto(origin+'/version.json');await page.evaluate(token=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',token);},tokens[who]);await page.goto(origin+url);}
async function fits(label){const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,label+JSON.stringify(size));}
async function idle(){await page.waitForFunction(()=>!document.querySelector('.view.active [aria-busy=true]'));}
async function saved(){await page.waitForFunction(()=>{const dialog=document.querySelector('.lm-dialog');return dialog&&!dialog.hasAttribute('aria-busy')&&dialog.querySelector('[data-lm-dialog-message]')?.textContent==='Saved.';});}
async function editorSave(){await page.locator('.lm-editor-actions button[type=submit]').click();await saved();}
async function closeEditor(discard=false){if(discard)page.once('dialog',d=>d.accept());await page.locator('.lm-dialog [data-lm=close]').click();await page.locator('.lm-dialog').waitFor({state:'detached'});}
try{
 page.on('dialog',d=>d.accept());
 const registerId=ok(await call('/api/academy/assessments/register-create',{...op(),name:'Reboot 2026',activityKeys:[scopes.programA],classMode:'ALL',status:'REGISTERED'})).registerId;
 const made=ok(await call('/api/academy/assessments/create',{...op(),registerId,activityKey:scopes.programA,classId:'class-1',classes:[{activityKey:scopes.programA,classId:'class-1'},{activityKey:scopes.programA,classId:'review-second'}],title:'Shared browser paper',subject:'Qasas',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,availableFrom:'2026-10-01T08:00:00Z',dueDate:'2026-10-24',durationMinutes:null,maximumMark:100})),id=made.assessmentId,second=made.assessmentIds[1];
 await identity('admin','/academy/admin/#assessment-admin/PROGRAM/'+scopes.programA.slice(8));await page.locator('[data-as=open-register][data-id="'+registerId+'"]').click();await idle();
 assert.match(await page.locator('.ar-status-controls').textContent(),/Imtihaan status: Registered/);
 await page.getByRole('button',{name:'Validate schedule',exact:true}).click();await idle();assert.match(await page.locator('.ar-validation').textContent(),/Validation passed/);
 assert(f.db.prepare('SELECT schedule_published FROM assessments').all().every(a=>!a.schedule_published),'Validation must not release dates');
 await page.getByRole('button',{name:'Release schedule',exact:true}).click();
 const scheduleDialog=page.getByRole('dialog',{name:'Confirm publish'});await scheduleDialog.waitFor();await scheduleDialog.getByRole('button',{name:'Publish',exact:true}).click();await scheduleDialog.waitFor({state:'hidden'});await idle();
 assert.match(await page.locator('.ar-status-controls').textContent(),/Imtihaan status: Scheduled/);assert(f.db.prepare('SELECT schedule_published,paper_released_at FROM assessments').all().every(a=>a.schedule_published&&!a.paper_released_at));
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await fits('Registered to Scheduled '+width);await page.screenshot({path:join(out,'scheduled-'+width+'.png')});}
 checks.push('Reboot 2026 validates and moves from Registered to Scheduled through the page for shared untimed assignments, preserving null durations and separate paper release');
 await identity('teacher','/academy/#activity/PROGRAM/'+scopes.programA.slice(8)+'/teach/assessment');await page.locator('[data-as=open][data-id="'+id+'"]').click();await page.locator('[data-assessment-group]').waitFor();await idle();
 assert.equal(await page.locator('[data-assessment-class] option').count(),2);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await fits('Shared assessment '+width);await page.screenshot({path:join(out,'shared-'+width+'.png')});}
 await page.locator('[data-as=back]').click();await idle();await page.locator('[data-as=paper-attachment][data-id="'+id+'"]').click();await idle();const paper=page.locator('#as-paper-dialog [data-form=paper]');assert.equal(await paper.locator('[name=timingMode]').inputValue(),'UNTIMED');assert.equal(await paper.locator('[name=durationMinutes]').isDisabled(),true);await paper.locator('[name=paper]').setInputFiles({name:'shared-once.pdf',mimeType:'application/pdf',buffer:readFileSync(join(root,'academy/pdf-compare/sample.pdf'))});await paper.getByRole('button',{name:'Submit paper for moderation',exact:true}).click();await idle();
 await page.waitForFunction(()=>document.querySelector('#as-paper-dialog [data-paper-message]')?.textContent==='Saved.');
 const rows=f.db.prepare('SELECT * FROM assessments').all();assert.equal(new Set(rows.map(a=>a.paper_file_id)).size,1);assert(rows.every(a=>a.paper_state==='IN_REVIEW'&&!a.paper_released_at));assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_files WHERE kind='PAPER'").get().n,1);
 await page.locator('[data-as=close-paper]').click();await idle();await page.locator('[data-as=open][data-id="'+id+'"]').click();await idle();await page.locator('[data-assessment-class]').selectOption(second);await idle();await page.waitForFunction(id=>document.querySelector('[data-assessment-class]')?.value===id,second);assert.equal(await page.locator('[data-as=download]').count(),1);
 await page.locator('[data-as=download]').click();await page.locator('#as-pdf-dialog').waitFor();await page.locator('#as-pdf-dialog [data-pdf-close]').click();await idle();checks.push('Teacher attaches one untimed assignment PDF through the popup for two classes and opens it from either class');
 await identity('admin','/academy/admin/#assessment-admin/PROGRAM/'+scopes.programA.slice(8));await page.locator('[data-as=open-register]').first().click();await page.locator('[data-as=open][data-id="'+id+'"]').click();await page.locator('[data-form=review-paper]').waitFor();await idle();await page.locator('[name=paperReviewed]').check();await page.locator('[data-form=review-paper] button[value=APPROVE]').click();
 // The real publication dialog is part of the current shared setup boundary.
 const reviewDialog=page.getByRole('dialog',{name:'Confirm publish'});await reviewDialog.waitFor();await reviewDialog.getByRole('button',{name:'Publish',exact:true}).click();await reviewDialog.waitFor({state:'hidden'});
 await idle();if(f.db.prepare('SELECT paper_state FROM assessments').all().some(a=>a.paper_state!=='APPROVED'))throw Error('Shared approval did not reach both classes');
 if(await page.locator('[data-as=release-paper]').count()){await page.locator('[data-as=release-paper]').click();await idle();}
 assert(f.db.prepare('SELECT paper_released_at FROM assessments').all().every(a=>a.paper_released_at));
 assert.equal(await page.locator('[data-as=release][data-category=marks]').first().textContent(),'Release marks for all classes');checks.push('Admin approval and explicit paper release apply to every class; whole-class result controls identify the shared scope');
 assert.deepEqual(errors,[]);const report={success:true,checks,errors,syntheticOnly:true,liveDataChanged:false};writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.log('Browser errors',errors);await page.screenshot({path:join(out,'failure.png')});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.close();}
