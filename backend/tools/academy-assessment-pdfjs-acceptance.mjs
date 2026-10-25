// Frontend-only PDF delivery checks. All API responses and identities are synthetic.
// The normal regression suite separately exercises the real file permissions.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=fileURLToPath(new URL('../../',import.meta.url)),out='/tmp/academy-assessment-pdfjs';mkdirSync(out,{recursive:true});
const bytes=readFileSync(join(root,'academy/pdf-compare/sample.pdf')),requests=[],checks=[],errors=[];
const assessment={id:'synthetic-assessment',activityKey:'PROGRAM:synthetic',activityName:'Synthetic Program',className:'Synthetic class',title:'PDF reading',subject:'Quran',examDate:'2026-10-24',published:true,paperState:'APPROVED',paperReleased:true,paperAvailable:true,paperFileId:'synthetic-paper',canTeach:true,durationMinutes:60,maximumMark:100};
const learner={accountId:'synthetic-learner',name:'Synthetic learner',answerFileId:'synthetic-answer',submissionId:'synthetic-submission',submissionNumber:1,markState:'UPLOADED',mark:null};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.ftl':'text/plain','.wasm':'application/wasm','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/synthetic-assessment'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/m4l-academy-assessments.css"></head><body><main id="fixture"></main><script>window.M4L_CONFIG={API_BASE:location.origin};localStorage.setItem("m4l_account_token","synthetic-token");</script><script src="/js/m4l-academy-workspace.js"></script><script src="/js/m4l-academy-assessments.js"></script><script>M4L_ACADEMY_ASSESSMENTS.open({hostId:"fixture",view:"teacher",activityKey:"PROGRAM:synthetic"});</script></body></html>');return;
 }
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const part of req)body+=part;const input=body?JSON.parse(body):{};
  requests.push({path:url.pathname,authorization:req.headers.authorization,workspace:req.headers['x-academy-workspace'],input});
  assert.equal(req.headers.authorization,'Bearer synthetic-token');
  if(url.pathname.endsWith('/download')){assert(['synthetic-paper','synthetic-answer'].includes(input.fileId));res.setHeader('Content-Type','application/pdf');res.end(bytes);return;}
  res.setHeader('Content-Type','application/json');
  if(url.pathname.endsWith('/list'))res.end(JSON.stringify({success:true,assessments:[assessment],classes:[],phases:[],timezone:'Africa/Johannesburg'}));
  else if(url.pathname.endsWith('/get'))res.end(JSON.stringify({success:true,assessment,learners:[learner],history:[]}));
  else throw Error('Unexpected synthetic API action: '+url.pathname);
  return;
 }
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root)||!['/js/','/css/','/pdf-viewer/'].some(prefix=>url.pathname.startsWith(prefix)))throw Error('Invalid test asset');
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<700,hasTouch:width<700,acceptDownloads:true}),page=await context.newPage();let downloads=0;
  page.on('download',()=>downloads++);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/synthetic-assessment?workspace=TEACH');await page.getByRole('button',{name:'Open assessment',exact:true}).click();
  await page.frameLocator('#as-pdf-dialog iframe').locator('.page[data-page-number="1"] canvas').waitFor({state:'visible'});
  assert.equal(downloads,0,'Opening a PDF must not start a download');
  await page.screenshot({path:join(out,'paper-'+width+'.png')});
  const downloaded=page.waitForEvent('download');await page.locator('#as-pdf-dialog a[download]').click();const file=await downloaded;await file.saveAs(join(out,'paper-'+width+'.pdf'));assert.deepEqual(readFileSync(join(out,'paper-'+width+'.pdf')),bytes);
  await page.locator('#as-pdf-dialog [data-pdf-close]').click();
  assert.equal(await page.locator('.as-timetable tbody tr').count(),1);assert.equal(await page.locator('.as-learner,[data-as=view-answer],[data-review-confirm]').count(),0);assert(!requests.some(request=>/confirm|mark|release/.test(request.path)));
  await page.getByRole('button',{name:'Open assessment',exact:true}).click();await page.locator('#as-pdf-dialog').waitFor();await page.evaluate(()=>M4L_ACADEMY_ASSESSMENTS.reset());assert.equal(await page.locator('#as-pdf-dialog').count(),0);
  checks.push('Row opens PDF.js paper directly; exact-byte download, table retained and reset: '+width);await context.close();
 }
 assert.deepEqual(errors,[]);assert(requests.every(request=>request.workspace==='TEACH'));const report={success:true,checks,errors,syntheticOnly:true,liveRequests:0};writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
