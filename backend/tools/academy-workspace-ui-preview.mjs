// Offline GUI review: actual native screens over disposable synthetic records.
import {createServer} from 'node:http';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mobileFirstFixture} from './mobile-first-preview/fixture.mjs';
import {openLibraryFixture} from '../tests/fixtures/academy-d1-open-library-fixture.mjs';
import worker from '../src/academy-runtime.js';

const root=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=await mobileFirstFixture();
const libraryFixture=await openLibraryFixture();
for(const key of ['PROGRAM_TIMETABLE_COORDINATOR','ACADEMY_OPEN_LIBRARY_STORAGE_KEY','MEDIA_BUCKET'])fixture.env[key]=libraryFixture.env[key];
// Match the published synthetic lessons to the preview's teacher account.
const published=fixture.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=? ORDER BY version_no DESC LIMIT 1').get(fixture.scopes.programA);
const snapshot=JSON.parse(published.snapshot_json);
for(const rule of snapshot.rules||[]){rule.teacherId=fixture.actors.teacherA;rule.teacherIds=[fixture.actors.teacherA];rule.teacherName='Synthetic teacherA';rule.teacherNames=['Synthetic teacherA'];}
const nextPublication={...published,publication_id:'workspace-review-publication',version_no:published.version_no+1,snapshot_json:JSON.stringify(snapshot)},publicationColumns=Object.keys(nextPublication);
fixture.db.prepare('INSERT INTO timetable_publications('+publicationColumns.join(',')+') VALUES('+publicationColumns.map(()=>'?').join(',')+')').run(...Object.values(nextPublication));
fixture.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(nextPublication.publication_id,fixture.scopes.programA);
// This review concerns retained Academy programmes, not standalone Course delivery.
fixture.db.prepare("UPDATE role_assignments SET active=0 WHERE activity_key IN (SELECT activity_key FROM activities WHERE kind='COURSE') AND account_id IN (?,?)").run(fixture.actors.studentA,fixture.actors.teacherA);
await fixture.accept(fixture.scopes.programA);
const notes=await fixture.notes('TEACH','teacherA');
const {sources}=await notes.run('sessions',{activityKey:fixture.scopes.programA,date:fixture.today});
const source=sources.find(row=>row.classId==='class-1'&&row.startTime==='10:00');
if(source){
 const view=await notes.run('get',{activityKey:fixture.scopes.programA,source});
 await notes.run('post',fixture.post(view,{body:'Sample class note for reviewing the workspace. Prepare the next section before the following lesson.'}));
}
for(let i=1;i<=3;i++){
 const date=new Date(Date.now()-i*86400000).toISOString().slice(0,10),id='workspace-review-media-'+i;
 fixture.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,summary,state,teacher_ids_json,updated_at) VALUES(?,?,'class-1',?,'Shared lesson','10:00','11:00',?,'Synthetic teacherA','Sample recording entry for reviewing the existing media controls.','PUBLISHED',?,?)").run(id,fixture.scopes.programA,date,fixture.actors.teacherA,JSON.stringify([fixture.actors.teacherA]),new Date().toISOString());
}
const tokens=Object.fromEntries(await Promise.all(['studentA','teacherA','global'].map(async who=>[who,await fixture.actor(who)])));
const program=fixture.scopes.programA.slice(8);
const destinations={studentA:'/academy/#activity/PROGRAM/'+program+'/learn',teacherA:'/academy/#activity/PROGRAM/'+program+'/teach',global:'/academy/admin/#administration'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.pdf':'application/pdf'};
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
let origin='';
const originalFetch=globalThis.fetch;
globalThis.fetch=(resource,options)=>{
 const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url);
 if(url.origin!==origin)throw new Error('External requests are disabled in the offline UI review.');
 return originalFetch(resource,options);
};
const guard=`<style>.workspace-preview-note{display:flex;align-items:center;justify-content:center;gap:18px;position:relative;z-index:1000;min-height:30px;padding:5px 12px;background:#e9ddce;color:#594751;font:11px/1.4 Arial,sans-serif;text-align:center}.workspace-preview-note a{color:inherit;text-underline-offset:3px}.workspace-preview-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;max-width:90%;padding:14px 20px;border-radius:9px;background:#604b59;color:#fff;font:14px/1.5 Arial,sans-serif;box-shadow:0 6px 24px #34252c22}</style><div class="workspace-preview-note"><span>Offline workspace review · Sample records</span><a href="/">Change preview role</a></div><script>(()=>{const inform=()=>{let t=document.querySelector('.workspace-preview-toast');if(!t){t=document.createElement('div');t.className='workspace-preview-toast';t.setAttribute('role','status');document.body.append(t);}t.textContent='This link is unavailable in the offline review.';clearTimeout(t.timer);t.timer=setTimeout(()=>t.remove(),4000);};const outside=u=>{try{return new URL(u,location.href).origin!==location.origin;}catch{return true;}};for(const type of ['click','auxclick'])document.addEventListener(type,e=>{const a=e.target.closest('a[href]');if(a&&outside(a.href)){e.preventDefault();e.stopImmediatePropagation();inform();}},true);const nativeOpen=window.open;window.open=function(u,...rest){if(u&&outside(u)){inform();return null;}return nativeOpen.call(this,u,...rest);};})();</script>`;
const server=createServer(async(req,res)=>{
 try{
  const allowedHosts=['127.0.0.1:'+server.address().port,'localhost:'+server.address().port];
  if(!allowedHosts.includes(req.headers.host)||req.headers.origin&&!allowedHosts.some(host=>req.headers.origin==='http://'+host)){res.writeHead(403);res.end('Local review only.');return;}
  const url=new URL(req.url,origin);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',csp);res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname==='/'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Academy workspace review</title><link rel="stylesheet" href="/academy/course-websites/assets/fonts.css"><style>*{box-sizing:border-box}body{margin:0;background:#faf7f2;color:#493943;font:15px/1.65 'DM Sans',sans-serif}main{max-width:1020px;margin:9vh auto;padding:30px}small{color:#8c6a78;letter-spacing:.14em;text-transform:uppercase}h1{font:400 clamp(40px,6vw,68px)/1.1 'Libre Caslon Display',Georgia,serif;max-width:650px;margin:22px 0}p{color:#7c7075;max-width:590px}.roles{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:45px}.roles a{display:block;padding:30px 25px;border:1px solid #dfd4cc;border-radius:12px;background:#fffcf7;color:inherit;text-decoration:none}.roles a:nth-child(2){background:#e9edde}.roles a:nth-child(3){background:#eadfd9}.roles strong{display:block;font:400 31px 'Libre Caslon Display',Georgia,serif}.roles span{display:block;font-size:13px;margin-top:12px;color:#75676d}footer{margin-top:35px;color:#8a7a82;font-size:12px}@media(max-width:650px){main{margin:3vh auto;padding:22px}.roles{grid-template-columns:1fr;gap:12px;margin-top:25px}.roles a{padding:20px}}</style><main><small>Umm Abbad Academy · Offline review</small><h1>A clear space for the work that matters.</h1><p>Review the existing Academy screens in their new style. These are sample accounts and records; changes stay in this local review.</p><div class="roles"><a href="/__signin/studentA"><strong>Learn</strong><span>Programme, timetable, notes and resources →</span></a><a href="/__signin/teacherA"><strong>Teach</strong><span>Classes, attendance, planning and assessments →</span></a><a href="/__signin/global"><strong>Admin</strong><span>People, programmes and Academy management →</span></a></div><footer>Desktop programme workspaces · Mobile layouts · Existing functions preserved</footer></main></html>`);return;
  }
  if(url.pathname==='/js/m4l-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.M4L_CONFIG={API_BASE:location.origin,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true,LEARNING_OPERATIONS:3,IS_DEVELOPMENT:true};');return;}
  if(url.pathname.startsWith('/__signin/')){
   const who=url.pathname.split('/').at(-1);if(!tokens[who]){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<script>localStorage.clear();sessionStorage.clear();localStorage.setItem("m4l_account_token",'+JSON.stringify(tokens[who])+');location.replace('+JSON.stringify(destinations[who])+');</script>');return;
  }
  if(url.pathname==='/api/academy/header-date'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,gregorian:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hijri:null,hijriUnavailable:true}));return;}
  if(url.pathname.startsWith('/api/')){
   if(/\/(?:join|program-join|course-join)(?:\/|$)/.test(url.pathname)){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:'Live joining is unavailable in this offline review.',code:'OFFLINE_REVIEW'}));return;}
   const chunks=[];for await(const part of req)chunks.push(part);
   const response=await worker.fetch(new Request(origin+url.pathname+url.search,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),fixture.env);
   for(const [name,value] of response.headers)if(!['content-security-policy','cache-control','x-robots-tag'].includes(name))res.setHeader(name,value);
   res.statusCode=response.status;res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!/^\/(?:academy|programs|users|css|js|assets|images|img)\//.test(url.pathname)&&!['/version.json','/ummabbadacademy.png','/admin-favicon-32x32.png'].includes(url.pathname)){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))file=path.join(file,'index.html');file=realpathSync(file);
  if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]){res.writeHead(404);res.end();return;}
  let body=readFileSync(file);res.setHeader('Content-Type',mime[path.extname(file)]);
  if(file.endsWith('.html'))body=Buffer.from(body.toString().replace(/<body([^>]*)>/i,'<body$1>'+guard));
  res.end(body);
 }catch(error){res.statusCode=error.code==='ENOENT'?404:500;res.end('The local review could not open this item.');console.error(error.message);}
});
await new Promise(done=>server.listen(Number(process.env.WORKSPACE_UI_PORT||9031),'127.0.0.1',done));
origin='http://127.0.0.1:'+server.address().port;fixture.env.ALLOWED_ORIGINS=origin;
console.log(JSON.stringify({preview:origin,learn:origin+'/__signin/studentA',teach:origin+'/__signin/teacherA',admin:origin+'/__signin/global',syntheticOnly:true,externalRequestsBlocked:true}));
await new Promise(done=>{process.once('SIGTERM',done);process.once('SIGINT',done);});
await new Promise(done=>server.close(done));fixture.close();libraryFixture.db.close();libraryFixture.metadata.close();globalThis.fetch=originalFetch;
