// Local browser acceptance of the packaged Academy with synthetic data and no Google settings.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {cleanupFixture} from '../tests/fixtures/academy-cleanup-fixture.mjs';
const [assetsArg,outputArg]=process.argv.slice(2),assets=resolve(assetsArg),output=resolve(outputArg);mkdirSync(output,{recursive:true,mode:0o700});
const f=await cleanupFixture(),tokens={};
for(const [who,id] of [['admin','0001'],['learner','0002']]){const r=await worker.fetch(new Request('http://localhost/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'login-'+id,pin:'1234'})}),f.env);assert.equal(r.status,200);tokens[who]=(await r.json()).token;}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf'};
let origin;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.M4L_CONFIG='+JSON.stringify({API_BASE:origin,ENV_NAME:'development',IS_DEVELOPMENT:true,HIFZHELPER_URL:'https://maktab.hifz-helper.app/'}));return;}
 if(url.pathname==='/academy/open-library/catalogue'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({books:[]}));return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const name=decodeURIComponent(url.pathname),file=resolve(assets,'.'+name+(name.endsWith('/')?'index.html':''));if(!file.startsWith(assets+'/'))throw Error('INVALID_PATH');const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){if(!res.headersSent)res.writeHead(e.code==='ENOENT'?404:500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;f.env.ALLOWED_ORIGINS=origin;
const {chromium}=createRequire(import.meta.url)('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[],errors=[],failures=[];
try{
 for(const [role,token] of Object.entries(tokens)){
  const context=await browser.newContext();await context.addInitScript(value=>localStorage.setItem('m4l_account_token',value),token);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400&&!r.url().includes('/public-snapshot')&&!(role==='learner'&&r.status()===403&&r.url().endsWith('/metadata/list')))failures.push({path:new URL(r.url()).pathname,status:r.status()});});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   const paths=role==='admin'?['/academy/','/users/','/programs/','/academy/courses/manage/','/academy/library/manage/']:['/academy/','/academy/library/'];
   for(const path of paths){console.log(JSON.stringify({checking:role,path,width}));await page.goto(origin+path);const ready=path==='/academy/'?'#academy-header-name':path==='/users/'?'#up-users tr':path==='/programs/'?'#program-workspace':path==='/academy/courses/manage/'?'#course-list-panel':path==='/academy/library/manage/'?'#olm-add':'#al-content';await page.locator(ready).first().waitFor({state:'visible'});assert(await page.locator('body').isVisible());const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+2,role+' '+path+' horizontal overflow');checks.push({role,path,width});if(path==='/academy/'||path==='/academy/library/manage/')await page.screenshot({path:join(output,role+'-'+width+'-'+(path.includes('manage')?'library':'home')+'.png')});}
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 const report={success:true,checks:checks.length,details:checks,pageErrors:errors,failedLocalRequests:failures,syntheticOnly:true,liveDataAccessed:false};writeFileSync(join(output,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));f.db.close();f.metadata.close();}
