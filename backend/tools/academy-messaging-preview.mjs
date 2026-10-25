// A complete local Academy preview: synthetic accounts, in-memory split stores,
// real messaging HTTP handlers. This server never forwards requests to a host.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {messagingFixture} from '../tests/fixtures/academy-messaging-fixture.mjs';
import {academyDate} from '../src/academy/d1/academy-clock.js';
import {recoverMessaging} from '../src/academy/d1/messaging.js';
import worker from '../src/academy-runtime.js';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
const publicDirectories=new Set(['academy','account','programs','users','recorder','activities','js','css','images','assets','icons','fonts','pdf-viewer']);
export async function startMessagingPreview({port=0}={}){
 const f=await messagingFixture({split:true}),tokens={student:await f.login('0002'),teacher:await f.login('0003'),programAdmin:await f.actor('adminA'),globalAdmin:await f.actor('global')};
 const welcome=await f.send({scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'class-1'}]},tokens.teacher,'TEACH',{subject:'Preparation for our next lesson',body:'Please revise the vocabulary on page 25.\nBring your reading notes to the next class.\n\nمراجعة المفردات قبل الدرس',requiresAcknowledgement:true});
 if(welcome.status!==200)throw Error(JSON.stringify(welcome));
 const noteCall=async(action,input)=>{
  const response=await worker.fetch(new Request('http://localhost/api/academy/class-notes/'+action,{method:'POST',headers:{Authorization:'Bearer '+tokens.student,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify(input)}),f.env),data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;
 };
 const date=academyDate(new Date(),'Africa/Johannesburg'),activityKey=f.scopes.programA;
 const source=(await noteCall('sessions',{activityKey,date})).sources.find(s=>s.classId==='class-1'&&s.startTime==='10:00');
 if(source){const view=await noteCall('get',{activityKey,source});if(view.nextDue)await noteCall('post',{activityKey,source,sourceToken:source.token,body:'Class reading preparation\nAisha: paragraphs 1–3.\nEveryone: revise page 25.',due:{mode:'NEXT',token:view.nextDue.token},operationId:crypto.randomUUID()});}
 let running=false;
 const tick=setInterval(async()=>{if(running)return;running=true;try{await recoverMessaging(f.env);}catch(e){console.error('Local messaging recovery:',e.message);}finally{running=false;}},5000);tick.unref();
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),host=req.headers.host||'';
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.headers.origin&&!['http://'+host,'http://localhost:'+server.address().port,'http://127.0.0.1:'+server.address().port].includes(req.headers.origin)){res.writeHead(403);res.end();return;}
   if(url.pathname==='/preview/bootstrap'){
    const role=url.searchParams.get('role')||'student';if(!Object.hasOwn(tokens,role)){res.writeHead(400);res.end();return;}
    const workspace=['programAdmin','globalAdmin'].includes(role)?'ADMIN':role==='teacher'?'TEACH':'LEARN',destination=workspace==='ADMIN'?'/academy/admin/#administration':'/academy/#timetable/'+workspace.toLowerCase();
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>Local Academy preview</title><p>Opening the synthetic ${role} dashboard…</p><script>localStorage.clear();sessionStorage.clear();localStorage.setItem('m4l_account_token',${JSON.stringify(tokens[role])});location.replace(${JSON.stringify(destination)});</script>`);return;
   }
   if(url.pathname==='/'){
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Academy messaging · local preview</title><style>body{font:18px system-ui;background:#f4eef8;color:#4c3559;max-width:760px;margin:60px auto;padding:24px}a{display:block;background:white;border:1px solid #ddcce6;padding:18px;margin:12px 0;border-radius:12px;color:#684272}p{line-height:1.6}</style><h1>Academy messaging</h1><p>Local preview with synthetic accounts and 200 test recipients. All records stay on this computer. Choose a dashboard:</p>'+Object.keys(tokens).map(role=>'<a href="/preview/bootstrap?role='+role+'">'+({student:'Student',teacher:'Teacher',programAdmin:'Program Admin',globalAdmin:'Global Admin'}[role])+'</a>').join(''));return;
   }
   if(url.pathname.startsWith('/api/')){
    if(!['GET','HEAD','POST','OPTIONS'].includes(req.method)){res.writeHead(405);res.end();return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>150000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const headers=new Headers(req.headers);headers.delete('origin');
    const request=new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,ACCEPTED_SETUP:true,LEARNING_OPERATIONS:3,MEDIA_SEPARATION:true};');return;}
   const pathname=decodeURIComponent(url.pathname);if(pathname.split('/').some(v=>v.startsWith('.'))||!publicDirectories.has(pathname.split('/')[1])&&!['/version.json','/ummabbadacademy.png','/academy.png','/favicon.ico'].includes(pathname)){res.writeHead(404);res.end();return;}
   let path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/')){res.writeHead(404);res.end();return;}if((await stat(path)).isDirectory())path+='/index.html';const type=mime[extname(path)];if(!type){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',type);res.end(req.method==='HEAD'?undefined:await readFile(path));
  }catch(e){if(!res.headersSent)res.writeHead(e.code==='ENOENT'?404:500);res.end();}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 return {f,tokens,base:'http://127.0.0.1:'+server.address().port,async close(){clearInterval(tick);await new Promise(done=>server.close(done));f.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const preview=await startMessagingPreview({port:Number(process.env.MESSAGING_PREVIEW_PORT||8768)});console.log('Local Academy messaging preview: '+preview.base);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await preview.close();process.exit(0);});
}
