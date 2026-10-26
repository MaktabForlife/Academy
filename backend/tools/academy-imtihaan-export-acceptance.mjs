// Real Register icons and PDF export, with disposable native assessment data only.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {separationFixture,separationScopes as scopes} from '../tests/fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import worker from '../src/academy-runtime.js';

const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.IMTIHAAN_EXPORT_OUTPUT||'/private/tmp/academy-imtihaan-export';mkdirSync(out,{recursive:true});
const {chromium}=require(process.env.ASSESSMENT_BROWSER_RUNTIME||'playwright');
const {PDFDocument}=require('../../js/vendor/pdf-lib-1.17.1.min.js');
const f=await separationFixture(),token=await f.actor('global'),op=()=>({operationId:crypto.randomUUID()});
for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
await initialiseAcceptedSetup(f.env.ACADEMY_DB);Object.assign(f.env,{ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
const call=async(action,input)=>{
 const result=await worker.fetch(new Request('http://localhost/api/academy/assessments/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),f.env);
 const body=await result.json();assert.equal(result.status,200,JSON.stringify(body));return body;
};
const register=await call('register-create',{...op(),name:'Mixed exam and assignment export',activityKeys:[scopes.programA],classMode:'ALL',status:'REGISTERED'});
const common={activityKey:scopes.programA,classId:'class-1',subject:'Qasas',maximumMark:100};
const made=await call('schedule-batch',{...op(),registerId:register.registerId,revision:1,rows:[
 {...common,title:'Exam paper',assessmentKind:'EXAM',timingMode:'TIMED',examDate:'2026-12-04',durationMinutes:60,allowanceMinutes:15},
 {...common,title:'Assignment paper',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,availableFrom:'2026-10-01T08:00:00Z',dueDate:'2026-12-05',durationMinutes:null},
 {...common,title:'Assignment without deadline',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',examDate:null,availableFrom:'2026-10-01T08:00:00Z',durationMinutes:null}
]});
assert.equal(f.db.prepare('SELECT due_at FROM assessments WHERE assessment_id=?').get(made.assessmentIds[1]).due_at,'2026-12-05T11:00:00.000Z');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,IS_DEVELOPMENT:true,SETUP_PUBLICATION:true,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true}');return;}
 if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end('{"success":true,"gregorian":"2026-10-26","hijri":"15 Jumada al-ula 1448"}');return;}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const result=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 const target=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!target.startsWith(root))throw Error('Invalid path');res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');res.end(readFileSync(target));
}catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.ASSESSMENT_CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[],checks=[];let downloads=0;
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));page.on('download',()=>downloads++);
await page.route('**/*',r=>new URL(r.request().url()).origin===origin||r.request().url().startsWith('blob:')?r.continue():r.abort());
await page.addInitScript(()=>{
 Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
 window.scheduleText=[];
 const fill=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(this.canvas.width===1684){window.scheduleText.push(String(text));window.scheduleCanvas=this.canvas;}return fill.call(this,text,...args);};
});
const url=origin+'/academy/admin/#assessment-admin/PROGRAM/'+scopes.programA.slice(8);
const row=()=>page.locator('[data-register-row="'+register.registerId+'"]');
const idle=()=>page.waitForFunction(()=>!document.querySelector('.view.active [aria-busy="true"]'));
const click=async action=>{await row().locator('[data-as="'+action+'"] svg').click();await idle();};
async function pdfDownload(action,name){
 const waiting=page.waitForEvent('download');await click(action);const file=await waiting;
 await file.saveAs(join(out,name));const pdf=await PDFDocument.load(readFileSync(join(out,name)));assert.equal(pdf.getPageCount(),1);return file;
}
try{
 await page.goto(origin+'/version.json');await page.evaluate(value=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',value);},token);
 await page.goto(url);await row().locator('[data-as="download-schedule-pdf"]').waitFor();
 const draft=await pdfDownload('download-schedule-pdf','mixed-draft.pdf');assert.match(draft.suggestedFilename(),/-draft.pdf$/);
 const text=await page.evaluate(()=>window.scheduleText);for(const value of ['4 Dec 2026','5 Dec 2026','13:00','No due date'])assert(text.includes(value),value+' '+JSON.stringify(text));
 assert(!text.includes('12:59'));checks.push('Actual download icon exports a mixed exam/assignment schedule with its 13:00 deadline and no-deadline assignment');
 const png=await page.evaluate(()=>window.scheduleCanvas.toDataURL('image/png').split(',')[1]);writeFileSync(join(out,'mixed-schedule.png'),Buffer.from(png,'base64'));
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedSchedule={title:data.title,name:data.files[0].name,type:data.files[0].type,size:data.files[0].size};}});});
 await click('share-schedule-pdf');const shared=await page.evaluate(()=>window.sharedSchedule);assert.equal(shared.type,'application/pdf');assert(shared.size>1000);assert.match(shared.name,/-draft.pdf$/);checks.push('Actual share icon hands the generated schedule PDF to the native sharing function');
 await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
 await pdfDownload('share-schedule-pdf','share-fallback.pdf');assert.match(await page.locator('[data-as-message]').innerText(),/PDF downloaded/);checks.push('Unsupported native file sharing downloads the same schedule as a shareable PDF');
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}});});
 const before=downloads;await click('share-schedule-pdf');assert.equal(downloads,before);assert.match(await page.locator('[data-as-message]').innerText(),/Sharing cancelled/);checks.push('Cancelling the share sheet does not trigger a download');
 await call('register-release',{...op(),registerId:register.registerId,revision:made.revision});await page.goto(url);await row().locator('[data-as="download-schedule-pdf"]').waitFor();
 const final=await pdfDownload('download-schedule-pdf','mixed-final.pdf');assert.match(final.suggestedFilename(),/-final.pdf$/);checks.push('Released schedules export as Final PDFs');
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await row().screenshot({path:join(out,'register-icons-'+width+'.png')});}
 assert.deepEqual(errors,[]);const result={passed:true,checks,errors,liveDataChanged:false};writeFileSync(join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.log('Browser errors',errors);await page.screenshot({path:join(out,'failure.png')});throw e;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.close();}
