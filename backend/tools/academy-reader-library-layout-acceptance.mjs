import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {courseFixture} from '../tests/fixtures/academy-d1-course-fixture.mjs';
import worker from '../src/academy-runtime.js';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),output=process.env.PDF_TOOLS_ACCEPTANCE_OUTPUT||'/private/tmp/academy-library-display-10787';await mkdir(output,{recursive:true});
const {chromium}=await import(process.env.PDF_TOOLS_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
function pdf(text){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 3 /Kids [3 0 R 5 0 R 7 0 R] >>'];for(let page=1;page<=3;page++){const stream=`BT /F1 18 Tf 50 700 Td (${text} page ${page}) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${objects.length+2} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let data='%PDF-1.7\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(data));data+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(data);data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(data);}
const f=await courseFixture(),requests=[],errors=[],outside=[];
f.db.exec(await readFile(new URL('../migrations/academy/0025_pdf_bookmarks.sql',import.meta.url),'utf8'));
const post=async(path,body={},token='')=>{const response=await worker.fetch(new Request('http://synthetic.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),f.env),data=await response.json();assert(response.ok,JSON.stringify(data));return data;};
const admin=(await post('/api/account/login',{uniqueid:'login-0001',pin:'1234'})).token,teacher=(await post('/api/account/login',{uniqueid:'login-0003',pin:'1234'})).token;
const subjects=['Akhlaaq','Aqaaid','Duas','Fiqh','Hadith','History','Qasas','Tafseer','Tajweed','Very long curriculum subject heading that wraps across several lines'];
const books=subjects.map((subject,i)=>({id:'EXTERNAL:INTERNET_ARCHIVE:sample'+i,title:'Sample book '+i,subject,pdfUrl:'https://archive.org/download/sample/book'+i+'.pdf'}));

const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ftl':'text/plain','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/preview/')){const token=url.pathname.endsWith('/teacher')?teacher:admin;res.setHeader('Content-Type','text/html');res.end(`<script>localStorage.setItem('m4l_account_token',${JSON.stringify(token)});location.replace('/academy/pdf-tools/')</script>`);return;}if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}if(url.pathname==='/academy/open-library/catalogue'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({books}));return;}if(url.pathname==='/api/academy/open-library/metadata/public'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,records:[]}));return;}if(url.pathname.startsWith('/pdf-file/')){res.setHeader('Content-Type','application/pdf');res.end(pdf('Synthetic lesson'));return;}if(url.pathname==='/api/academy/header-date'){requests.push({path:url.pathname});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,gregorian:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hijri:'12 Jumada al-ula 1448'}));return;}if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;requests.push({path:url.pathname,body:body?JSON.parse(body):null});const response=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:body||undefined}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')||path.includes('/backend/')||url.pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end();return;}if((await stat(path)).isDirectory())path+='/index.html';res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=base;
const browser=await chromium.launch({headless:true,executablePath:process.env.PDF_TOOLS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true,hasTouch:true});
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==base&&!route.request().url().startsWith('blob:')){outside.push(route.request().url());return route.abort();}return route.continue();});
await context.addInitScript(()=>{try{localStorage.setItem('pdfjs.preferences',JSON.stringify({annotationEditorMode:0,enableComment:true,enableSignatureEditor:true,enableHighlightFloatingButton:true}));}catch{}});
let page=await context.newPage(),reader;

const checks=[];
try{
 await context.addInitScript(token=>localStorage.setItem('m4l_account_token',token),teacher);
 await page.goto(base+'/academy/pdf-reader/');
 const pane=page.locator('#pr-pane-0'),list=pane.locator('[data-books]');
 await pane.locator('[data-library]').click();await pane.locator('.pr-subject').first().waitFor();
 await page.evaluate(()=>{const host=document.querySelector('.pr-favourites>div');host.innerHTML=Array.from({length:3},(_,i)=>'<div class="pr-bookmark-row"><button>Saved sample '+i+'<small>Page '+(i+1)+'</small></button><button>Remove</button></div>').join('');});
 for(const [width,height] of [[1600,900],[1440,740],[1024,768],[768,1024],[390,844],[320,568]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>document.querySelectorAll('.pr-subject').forEach(el=>el.open=false));
  const sizes=await pane.locator('.pr-subject').evaluateAll(els=>els.map(el=>({name:el.querySelector('summary').textContent,group:el.getBoundingClientRect().height,summary:el.querySelector('summary').getBoundingClientRect().height})));
  await page.screenshot({path:output+'/library-'+width+'.png'});
  for(const size of sizes)assert(size.group>=size.summary-1,'Clipped subject at '+width+': '+JSON.stringify(size));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert(await list.evaluate(el=>el.scrollHeight>el.clientHeight),'library scrolls '+width);
  const last=pane.locator('.pr-subject').last();await last.locator('summary').click();await last.getByRole('button',{name:'Sample book 9',exact:true}).waitFor({state:'visible'});const bounds=await last.evaluate(el=>({group:el.getBoundingClientRect().height,content:el.scrollHeight}));assert(bounds.group>=bounds.content-1,'Expanded subject clipped '+width);
  await last.getByRole('button',{name:'Sample book 9',exact:true}).scrollIntoViewIfNeeded();
  assert(await pane.getByRole('button',{name:'Close Library drawer',exact:true}).isVisible());
  checks.push('Full subject labels, expanded book and scrolling at '+width+'x'+height);
 }
 await page.setViewportSize({width:1440,height:740});await pane.getByRole('button',{name:'Close Library drawer',exact:true}).click();await page.locator('#pr-split').click();const second=page.locator('#pr-pane-1');await second.locator('[data-library]').click();await second.locator('.pr-subject').first().waitFor();
 for(const size of await second.locator('.pr-subject').evaluateAll(els=>els.map(el=>({group:el.getBoundingClientRect().height,summary:el.querySelector('summary').getBoundingClientRect().height}))))assert(size.group>=size.summary-1,'Split PDF 2 subject clipped');
 const secondLast=second.locator('.pr-subject').last();await secondLast.locator('summary').click();await secondLast.getByRole('button',{name:'Sample book 9',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:output+'/split-pdf-2.png'});checks.push('Split PDF 2 retains complete subjects and reachable books');
 await page.addStyleTag({content:'.pr-drawer{font-size:200%}.pr-subject summary{font-size:inherit}'});
 for(const size of await second.locator('.pr-subject').evaluateAll(els=>els.map(el=>({group:el.getBoundingClientRect().height,summary:el.querySelector('summary').getBoundingClientRect().height}))))assert(size.group>=size.summary-1,'Large-text subject clipped');checks.push('Larger subject text grows the rows');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,hostedDatabaseAccessed:false,output}));
}catch(error){console.error(error.message);await page.screenshot({path:output+'/failure.png'});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();}
