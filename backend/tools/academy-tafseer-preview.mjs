// Disposable synthetic preview, loopback only. Never opens or copies a live database.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {monthlyFixture,scope} from '../tests/fixtures/academy-monthly-subscriptions-fixture.mjs';
import worker from '../src/academy-runtime.js';

const port=Number(process.env.TAFSEER_PREVIEW_PORT||4318);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a local preview port between 1024 and 65535.');
const origin='http://127.0.0.1:'+port,root=resolve(fileURLToPath(new URL('../../',import.meta.url))),f=await monthlyFixture();
f.env.ALLOWED_ORIGINS=origin;
f.db.prepare("UPDATE accounts SET display_name='Sample account '||substr(account_id,-4)").run();
const admin=await f.login('0001'),student=await f.login('0002'),op=()=>crypto.randomUUID();
const ok=result=>{if(result.status!==200)throw Error(JSON.stringify(result.body));return result.body;};
ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
for(const month of ['2024-01','2025-01','2026-10']){
 const current=ok(await f.monthly('get',{month},admin));
 ok(await f.monthly('save',{month,policyRevision:current.policy.revision,operationId:op(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['mou-class'],paymentReference:'LOCAL SAMPLE'}]},admin));
}
for(const [date,title] of [['2024-01-16','Tafseer · January 2024 sample'],['2025-01-14','Tafseer · January 2025 sample']]){
 const lesson=ok(await f.media('historical-create',{date,title,classIds:['mou-class'],operationId:op()},admin));
 ok(await f.media('save',{lessonId:lesson.lessonId,revision:1,title,summary:'Local sample lesson. Attach the original recording or PDFs in Admin.',state:'PUBLISHED',commentsClosed:true,videos:[],operationId:op()},admin));
}
ok(await f.monthly('configure',{mode:'activate',policyRevision:f.db.prepare('SELECT revision FROM program_monthly_media_policies').get().revision,reviewed:true,operationId:op()},admin));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.bcmap':'application/octet-stream','.ttf':'font/ttf','.wasm':'application/wasm','.mjs':'text/javascript; charset=utf-8','.ftl':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Local sample only');return;}
  const url=new URL(req.url,origin);
  if(url.pathname==='/sample/admin'||url.pathname==='/sample/student'){
   const isAdmin=url.pathname.endsWith('/admin'),destination=isAdmin?'/programs/?program='+encodeURIComponent(scope.slice(8))+'&tab=participants&participants=monthly':'/academy/monthly-media/';
   res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store'});res.end('<!doctype html><title>Local sample</title><script>localStorage.setItem("m4l_account_token",'+JSON.stringify(isAdmin?admin:student)+');location.replace('+JSON.stringify(destination)+');</script>');return;
  }
  if(url.pathname==='/'){
   res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store'});res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Tafseer sample</title><main style="font:18px system-ui;max-width:700px;margin:3rem auto;padding:1rem"><h1>Tafseer · local sample</h1><p>Disposable sample accounts and records. Restarting clears your edits. Nothing connects to Development.</p><p><a href="/sample/admin">Open Admin monthly subscriptions and historical lessons</a></p><p><a href="/sample/student">Open student paid months (2024 / 2025 / 2026)</a></p><p>Use the same tab to switch accounts. Media you upload stays only in this process.</p></main>');return;
  }
  if(url.pathname==='/js/m4l-config.js'){
   res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});res.end('window.M4L_CONFIG={API_BASE:"",MEDIA_SEPARATION:false,LOCAL_TAFSEER_SAMPLE:true};');return;
  }
  if(url.pathname.startsWith('/api/')){
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await worker.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();return;
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const file=resolve(root,'.'+pathname);
  if(!file.startsWith(root+sep)||pathname.includes('/.')||pathname.startsWith('/backend/')||pathname.startsWith('/docs/')||!mime[extname(file)]){res.writeHead(404);res.end('Not found');return;}
  if(!(await stat(file)).isFile())throw Object.assign(Error('Not found'),{code:'ENOENT'});
  res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});await pipeline(createReadStream(file),res);
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(error.code==='ENOENT'?'Not found':'Local preview could not complete this request.');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local synthetic Tafseer preview: '+origin));
const stop=()=>server.close(()=>{f.db.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
