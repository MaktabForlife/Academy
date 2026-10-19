// Local browser regression for the actual header + warm Library cache interaction.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
const [assetsArg,outputArg]=process.argv.slice(2),assets=resolve(assetsArg),out=resolve(outputArg);
mkdirSync(out,{recursive:true});
const books=[
 {id:'EXTERNAL:INTERNET_ARCHIVE:existing-book',title:'Existing book',subject:'Books',resourceType:'EBOOK',pdfUrl:'https://archive.org/download/existing-book/book.pdf'},
 {id:'EXTERNAL:INTERNET_ARCHIVE:class-duas',title:'Class Duas',subject:'Duas',resourceType:'EBOOK',pdfUrl:'https://archive.org/download/class-duas/class%20duas.pdf'},
 {id:'EXTERNAL:INTERNET_ARCHIVE:hadith-grade-1-7',title:'Tasheelul Ahadith wal Akhlaaq',subject:'Hadith',resourceType:'EBOOK',pdfUrl:'https://archive.org/download/hadith-grade-1-7/Hadith%20grade%201-7.pdf'}
];
const reads={catalogue:0,metadata:0},errors=[];let origin,unavailable=false;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin}');return;}
  if(url.pathname==='/academy/open-library/catalogue'||url.pathname==='/api/academy/open-library/metadata/public'){
   const catalogue=url.pathname.endsWith('/catalogue');reads[catalogue?'catalogue':'metadata']++;
   res.writeHead(unavailable?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify(unavailable?{error:'Synthetic unavailable source'}:catalogue?{books}:{success:true,records:[]}));return;
  }
  const file=resolve(assets,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(assets+'/'))throw Error('INVALID_PATH');
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.ACADEMY_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const checks=[];
try{
 await page.goto(origin+'/version.json');
 await page.evaluate(book=>localStorage.setItem('m4l_library_v1:'+location.origin+':public',JSON.stringify({version:1,savedAt:Date.now(),data:{books:[book],records:[]}})),books[0]);
 await page.goto(origin+'/academy/open-library/');await page.locator('.ol-card').waitFor();assert.equal(await page.locator('.ol-card').count(),1);assert.deepEqual(reads,{catalogue:0,metadata:0});checks.push('A valid weekly snapshot is reused on arrival without automatic network reads');
 assert.equal(await page.locator('#ol-refresh').isVisible(),false);assert.equal(await page.locator('[data-page-refresh]').isVisible(),true);
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 await page.locator('[data-page-refresh]').click();await page.locator('[data-resource="'+books[2].id+'"]').waitFor();
 assert.equal(await page.locator('.ol-card').count(),3);assert.deepEqual(reads,{catalogue:1,metadata:1});assert.equal(navigations,0);assert.equal(await page.locator('#ol-status').innerText(),'');checks.push('Header Refresh invokes the CSS-hidden Library action, updates both sources and displays the new cards without reloading');
 for(const book of books.slice(1)){await page.locator('#ol-search').fill(book.title);assert.equal(await page.locator('.ol-card').count(),1);assert.equal(await page.locator('[data-resource="'+book.id+'"]').isVisible(),true);}await page.locator('#ol-search').fill('');checks.push('Class Duas and Tasheelul Ahadith wal Akhlaaq are searchable after refreshing');
 await page.screenshot({path:join(out,'refreshed-library-1440.png')});
 for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});assert.equal(await page.locator('[data-page-refresh]').isVisible(),true);assert.equal(await page.locator('.ol-card').count(),3);const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1);await page.screenshot({path:join(out,'refreshed-library-'+width+'.png')});}checks.push('Updated cards and the shared Refresh control remain usable on phone and tablet');
 await page.reload();await page.locator('.ol-card').first().waitFor();assert.equal(await page.locator('.ol-card').count(),3);assert.deepEqual(reads,{catalogue:1,metadata:1});checks.push('A revisit uses the replaced snapshot and keeps both new resources');
 unavailable=true;await page.locator('[data-page-refresh]').click();await page.locator('#ol-status').filter({hasText:'Showing saved resources'}).waitFor();assert.equal(await page.locator('.ol-card').count(),3);checks.push('A failed explicit refresh preserves the saved resources and shows the existing retry message');
 assert.deepEqual(errors,[]);const report={success:true,checks,reads,errors,syntheticOnly:true,liveDataChanged:false};writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:join(out,'failure.png')});throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
