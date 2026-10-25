// Loopback-only preview: synthetic accounts and databases, local R2, and an
// explicit allowlist of public assets. It never reads credentials or snapshots.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import * as simulator from 'miniflare';
import {splitVideoFixture} from '../tests/fixtures/academy-session-video-split-fixture.mjs';
import worker from '../src/academy-runtime.js';

const f=await splitVideoFixture();
const storageOptions={host:'127.0.0.1',workers:[{name:'video-preview',modules:true,script:'export default {fetch(){return new Response("Local recording preview")}}',compatibilityDate:'2026-09-28',r2Buckets:['RECORDINGS']}]};
const storage=new simulator.Miniflare(simulator.convertV4MiniflareOptions?.(storageOptions)||storageOptions);
f.source.env.LESSON_MEDIA_BUCKET=await storage.getR2Bucket('RECORDINGS');
const tokens={admin:await f.source.actor('global'),learner:await f.source.login('0002'),teacher:await f.source.login('0003')};
const scope=f.scopes.programA,period={startDate:'2026-10-01',endDate:'2026-10-31'};
const ok=r=>{if(r.status!==200)throw Error(JSON.stringify(r.body));return r.body;};
const sessions=ok(await f.request('sessions',{activityKey:scope,...period},tokens.admin)).sessions.filter(s=>s.classIds.includes('class-1')),session=sessions[0];
const lessonId=ok(await f.request('create',{activityKey:scope,...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},tokens.admin)).lessonId;
ok(await f.request('save',{lessonId,revision:1,operationId:crypto.randomUUID(),title:'Session recording',summary:'Video recordings and lesson notes.',state:'DRAFT',commentsClosed:true,videos:[{name:'YouTube lesson',url:'https://youtu.be/9IuTDcSs6vQ'}]},tokens.admin));

// Optional generated sample, useful for reviewing playback and expired cards
// without selecting a real lesson recording. Never supplied in production.
if(process.env.VIDEO_PREVIEW_SAMPLE){
 const bytes=await readFile(process.env.VIDEO_PREVIEW_SAMPLE);
 async function attach(id,revision,name){
  const start=ok(await f.request('video-start',{lessonId:id,revision,operationId:crypto.randomUUID(),filename:'sample-recording.mp4',name,size:bytes.length},tokens.admin)),parts=[];
  for(let offset=0;offset<bytes.length;offset+=start.partSize){const metadata={lessonId:id,uploadToken:start.uploadToken,partNumber:parts.length+1};parts.push(ok(await f.request('video-part?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},tokens.admin,'ADMIN',bytes.subarray(offset,offset+start.partSize))));}
  return ok(await f.request('video-complete',{lessonId:id,uploadToken:start.uploadToken,parts},tokens.admin));
 }
 const active=await attach(lessonId,2,'Zoom session recording');
 const expired=await attach(lessonId,3,'Earlier recording');
 const second=ok(await f.request('create',{activityKey:scope,...period,sessionKey:sessions[1].sessionKey,sessionVersion:sessions[1].sessionVersion,operationId:crypto.randomUUID()},tokens.admin)).lessonId;
 const onlyExpired=await attach(second,1,'Earlier recording only');
 for(const id of [expired.assetId,onlyExpired.assetId])f.databases.admin.prepare('UPDATE lesson_media_assets SET created_at=? WHERE asset_id=?').run(new Date(Date.now()-15*86400000).toISOString(),id);
 for(const [id,revision,title,videos] of [[lessonId,4,'Session recording',[{name:'YouTube lesson',url:'https://youtu.be/9IuTDcSs6vQ'}]],[second,2,'Expired recording only',[]]])ok(await f.request('save',{lessonId:id,revision,operationId:crypto.randomUUID(),title,summary:'Local test recording',state:'PUBLISHED',commentsClosed:true,videos},tokens.admin));
 await f.accept(tokens.admin,scope);
 if(active.expired)throw Error('The generated sample should be active.');
}

const assets=new Map();
for(const name of ['css/m4l-program-builder.css','css/m4l-lesson-media.css','js/m4l-academy-workspace.js','js/m4l-academy-setup.js','js/m4l-lesson-media-cache.js','js/m4l-lesson-media.js'])assets.set('/'+name,await readFile(new URL('../../'+name,import.meta.url)));
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Session video · local preview</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/m4l-program-builder.css"><link rel="stylesheet" href="/css/m4l-lesson-media.css"><style>body{margin:0;background:#f5f2f7;color:#241d2b;font-family:system-ui,sans-serif}main{max-width:1120px;margin:24px auto;padding:16px}nav{display:flex;gap:16px;flex-wrap:wrap}.preview-note{padding:12px;background:#ede6f2;border-radius:10px}.button{font:inherit;border:1px solid #71517b;background:#71517b;color:#fff;padding:9px 14px;border-radius:8px;cursor:pointer}.button.secondary{background:white;color:#5e3f69}button:disabled{opacity:.55;cursor:default}input,select,textarea{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}dialog::backdrop{background:#21142f88}</style><script>window.M4L_CONFIG={API_BASE:location.origin,MEDIA_SEPARATION:true,ACCEPTED_SETUP:true};</script><script src="/js/m4l-academy-workspace.js"></script><script src="/js/m4l-academy-setup.js"></script></head><body><main><p class="preview-note">Local preview · synthetic accounts · recordings stay on this computer</p><h1>Session videos</h1><nav aria-label="Preview account"><a href="/?role=admin&workspace=ADMIN">Admin</a><a href="/?role=learner&workspace=LEARN">Learner</a><a href="/?role=teacher&workspace=TEACH">Teacher</a></nav><p id="preview-status" role="status"></p><section id="preview-media" aria-label="Lesson media"></section></main><script src="/js/m4l-lesson-media-cache.js"></script><script src="/js/m4l-lesson-media.js"></script><script src="/preview.js"></script></body></html>`;
const preview=`(async()=>{const role=new URLSearchParams(location.search).get('role')||'admin',response=await fetch('/preview/bootstrap?role='+encodeURIComponent(role)),data=await response.json();localStorage.setItem('m4l_account_token',data.token);document.getElementById('preview-status').textContent='Viewing as '+role;window.M4L_LESSON_MEDIA.open({hostId:'preview-media',activityKey:data.scope,learnerView:role!=='admin'});})().catch(e=>document.getElementById('preview-status').textContent=e.message);`;

const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(url.pathname==='/preview/bootstrap'&&req.method==='GET'){
   const role=url.searchParams.get('role');if(!Object.hasOwn(tokens,role)){res.writeHead(400);res.end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({token:tokens[role],scope}));return;
  }
  if(url.pathname.startsWith('/api/')){
   const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024+16384){res.writeHead(413);res.end();return;}parts.push(chunk);}
   const headers=new Headers(req.headers);headers.delete('origin');
   const request=new Request('http://localhost'+url.pathname+url.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
   const response=await worker.fetch(request,f.source.env);res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(url.pathname==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(preview);return;}
  if(assets.has(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(url.pathname));return;}
  res.writeHead(404);res.end();
 }catch(error){console.error(error.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.VIDEO_PREVIEW_PORT||8767),'127.0.0.1',resolve);});
console.log('Local session video preview: http://127.0.0.1:'+server.address().port+'/?role=admin&workspace=ADMIN');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{server.close();await storage.dispose();f.close();process.exit(0);});
