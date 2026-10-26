// Isolated Library editor and reader checks; real metadata writes use disposable D1/DO storage.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openLibraryFixture} from '../tests/fixtures/academy-d1-open-library-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {PDF_TOOL_DEFAULTS} from '../../js/m4l-pdf-tools-model.mjs';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.LIBRARY_EDITOR_OUTPUT||'/private/tmp/academy-library-editor-10712';await mkdir(out,{recursive:true});
const f=await openLibraryFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
async function post(path,input,token=''){
 const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),f.env),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
}
const token=(await post('/api/account/login',{uniqueid:'login-0001',pin:'1234'})).token,subjects=new Map();
for(const name of ['Zuhd','Tafseer','Quran','Hadith','Duas','Arabic']){
 const added=await post('/api/admin/platform/academy-subjects/save',{mode:'create',subjectName:name,operationId:crypto.randomUUID()},token);subjects.set(name,'ACADEMY:'+added.subject.SubjectID);
}
const id=name=>'EXTERNAL:INTERNET_ARCHIVE:'+name;
const books=[['uncat-z','Zebra guide','EBOOK','Archive keyword'],['uncat-a','Alpha guide','EBOOK','Archive keyword'],['arabic-z','Zebra recording','VIDEO','Arabic'],['arabic-a','Old source title','EBOOK','Arabic'],['duas','Morning duas','AUDIO','Duas'],['hadith','Hadith lessons','EBOOK','Hadith'],['quran','Quran lessons','EBOOK','Quran'],['tafseer','Tafseer lessons','EBOOK','Tafseer'],['zuhd','Zuhd lessons','EBOOK','Zuhd']].map(([key,title,resourceType,subject])=>({id:id(key),title,resourceType,subject,source:'Internet Archive',pdfUrl:resourceType==='EBOOK'?'https://archive.org/download/'+key+'/book.pdf':undefined}));
const collection={id:id('yassarnal-quraan'),title:'Yassarnal Quraan',resourceType:'EBOOK',source:'Internet Archive',volumes:[1,2].map(number=>({number,label:'Part '+number,pdfUrl:'https://archive.org/download/yassarnal-quraan/Part'+number+'.pdf'}))};books.push(collection);
for(const book of books.filter(book=>subjects.has(book.subject))){
 const record={id:book.id,title:book.id===id('arabic-a')?'Arabic essentials':book.title,resourceType:book.resourceType,subjectRef:subjects.get(book.subject),subject:book.subject,moduleRef:'',learningAreaRefs:[]};
 f.metadata.prepare('INSERT INTO open_library_metadata VALUES(?,?,?,?,?)').run(book.id,JSON.stringify(record),1,'2026-10-21','synthetic');
}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
const reads={catalogue:0,metadata:0},errors=[],checks=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}
 if(url.pathname==='/academy/open-library/catalogue'){reads.catalogue++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({books}));return;}
 if(url.pathname==='/api/academy/pdf-tools/defaults'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,settings:PDF_TOOL_DEFAULTS}));return;}
 if(url.pathname.startsWith('/api/')){
  if(url.pathname.endsWith('/metadata/public'))reads.metadata++;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await worker.fetch(new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(part=>part.startsWith('.')))throw Error('INVALID_PATH');if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});let current;
try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1050}});current=page;page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/version.json');await page.evaluate(token=>localStorage.setItem('m4l_account_token',token),token);await page.goto(origin+'/academy/library/manage/');await page.locator('.olm-resource-choice').filter({hasText:'Zebra guide'}).waitFor();
  const headings=await page.locator('.olm-subject-heading span').allTextContents();assert.deepEqual(headings,['Uncategorised','Arabic','Duas','Hadith','Quran','Tafseer','Zuhd']);
  const column=name=>page.locator('.olm-subject-column').filter({has:page.locator('.olm-subject-heading span',{hasText:new RegExp('^'+name+'$')})});
  assert.deepEqual(await column('Uncategorised').locator('.olm-resource-choice strong').allTextContents(),['Alpha guide','Yassarnal Quraan','Zebra guide']);assert.deepEqual(await column('Arabic').locator('.olm-resource-choice strong').allTextContents(),['Arabic essentials','Zebra recording']);
  await page.locator('#olm-browser-title').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/subject-columns-'+width+'.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('#olm-resource-board').evaluate(el=>el.scrollWidth>el.clientWidth));
  await page.locator('#olm-next').click();await page.waitForFunction(()=>document.getElementById('olm-resource-board').scrollLeft>20);assert.equal(await page.locator('#olm-previous').isEnabled(),true);
  await page.locator('#olm-resource-board').focus();await page.keyboard.press('Home');await page.locator('#olm-resource-board').evaluate(el=>el.scrollLeft=0);
  await page.locator('[data-resource-id="'+id('uncat-a')+'"]').click();await page.locator('#olm-title').fill('Unsaved resource title');
  await page.locator('#olm-search').fill('no matching resource');assert.equal(await page.locator('.olm-resource-choice').count(),0);assert.equal(await page.locator('#olm-title').inputValue(),'Unsaved resource title');
  await page.locator('#olm-search').fill('Zebra recording');assert.equal(await page.locator('.olm-resource-choice').count(),1);page.once('dialog',d=>d.dismiss());await page.locator('.olm-resource-choice').click();assert.equal(await page.locator('#olm-title').inputValue(),'Unsaved resource title');
  page.once('dialog',d=>d.accept());await page.locator('.olm-resource-choice').click();assert.equal(await page.locator('#olm-editor-title').textContent(),'Zebra recording');assert.equal(await page.locator('#olm-book').inputValue(),id('arabic-z'));
  await page.locator('#olm-search').fill('');
  if(width===1440){
   await page.locator('[data-resource-id="'+id('uncat-a')+'"]').click();await page.locator('#olm-title').fill('A newly classified guide');await page.locator('#olm-subject').selectOption(subjects.get('Duas'));await page.locator('#olm-save').click();await page.locator('#olm-status').filter({hasText:'Resource saved.'}).waitFor();
   assert.deepEqual(await column('Duas').locator('.olm-resource-choice strong').allTextContents(),['A newly classified guide','Morning duas']);assert.equal(await column('Uncategorised').locator('[data-resource-id="'+id('uncat-a')+'"]').count(),0);
   await page.reload();await page.locator('[data-resource-id="'+id('uncat-a')+'"]').waitFor();assert.equal(await column('Duas').locator('[data-resource-id="'+id('uncat-a')+'"]').count(),1);
   const saved=f.metadata.prepare('SELECT metadata FROM open_library_metadata WHERE id=?').get(id('uncat-a'));assert.equal(JSON.parse(saved.metadata).subject,'Duas');
   // Restore only the disposable fixture for the next viewport.
   f.metadata.prepare('DELETE FROM open_library_metadata WHERE id=?').run(id('uncat-a'));
   checks.push('An edit moves the resource to its saved subject, alphabetically; the real coordinator retains the edit after reload');
  }
  const readsBefore={...reads};await page.evaluate(books=>localStorage.setItem('m4l_library_v1:'+location.origin+':public',JSON.stringify({version:1,savedAt:Date.now(),data:{books:books.map(book=>book.id.endsWith(':yassarnal-quraan')?{...book,volumes:book.volumes.map(v=>({...v,label:v.label+' and '+v.number}))}:book),records:[]}})),books);
  await page.goto(origin+'/academy/pdf-reader/?book='+encodeURIComponent(collection.id));await page.locator('#pr-volume-dialog').waitFor({state:'visible'});assert.deepEqual(await page.locator('#pr-volume-options button').allTextContents(),['Part 1','Part 2']);assert(reads.catalogue-readsBefore.catalogue<=1,'At most one background catalogue refresh');assert(reads.metadata-readsBefore.metadata<=1,'At most one background metadata refresh');await page.screenshot({path:out+'/correct-volume-labels-'+width+'.png'});
  checks.push('Alphabetical subject columns, keyboard/arrow scrolling, search preservation, discard protection and cached volume labels pass at '+width+'px');await page.close();
 }
 const cachedRecord=JSON.parse(f.metadata.prepare('SELECT metadata FROM open_library_metadata WHERE id=?').get(id('duas')).metadata);f.metadata.prepare('UPDATE open_library_metadata SET metadata=? WHERE id=?').run(JSON.stringify({...cachedRecord,title:''}),id('duas'));
 const cachePage=await browser.newPage();current=cachePage;cachePage.on('pageerror',e=>errors.push(e.message));await cachePage.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await cachePage.goto(origin+'/version.json');await cachePage.evaluate(token=>localStorage.setItem('m4l_account_token',token),token);await cachePage.goto(origin+'/academy/library/manage/');const cachedTitle=cachePage.locator('[data-resource-id="'+id('duas')+'"] strong');await cachedTitle.filter({hasText:'Morning duas'}).waitFor();assert.equal(await cachePage.locator('.al-tabs').count(),0);
 let blockedCatalogue=0;await cachePage.route('**/academy/open-library/catalogue',route=>{blockedCatalogue++;return route.abort();});await cachePage.reload();await cachedTitle.filter({hasText:'Morning duas'}).waitFor();await cachePage.waitForLoadState('networkidle');assert.equal(blockedCatalogue,1);assert.equal(await cachedTitle.innerText(),'Morning duas');assert.equal(await cachePage.locator('[data-resource-id="'+id('arabic-a')+'"] strong').innerText(),'Arabic essentials');assert.equal((await cachePage.locator('.olm-resource-choice strong').allTextContents()).some(title=>title.startsWith('EXTERNAL:')),false);await cachePage.screenshot({path:out+'/cached-titles-catalogue-unavailable.png'});checks.push('Readable catalogue names survive a failed refresh, assigned titles take priority, and admin learner tabs are absent');await cachePage.close();
 const guest=await browser.newPage();current=guest;await guest.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await guest.goto(origin+'/academy/library/manage/');assert.equal(await guest.locator('#olm-browser').isVisible(),false);assert.equal(await guest.locator('#olm-form').isVisible(),false);await guest.close();
 assert.deepEqual(errors,[]);const report={result:'PASS',checks,errors,liveDataChanged:false};await writeFile(out+'/acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,output:out}));
}catch(error){await current?.screenshot({path:out+'/failure.png',fullPage:true});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();f.metadata.close();}
