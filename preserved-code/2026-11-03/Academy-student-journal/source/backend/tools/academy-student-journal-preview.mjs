// Loopback-only sample. Core accounts are disposable fixtures; journal content
// is stored in one private local JSON file per sample student.
import {createServer} from 'node:http';
import {createReadStream,mkdirSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {studentJournalFixture} from '../tests/fixtures/academy-student-journal-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {newBlock} from '../../academy/course-websites/model.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json'};
export async function createJournalPreview({port=0,journalDirectory=null,twoReflections=false,fullAuth=false,scenario=null}={}){
 const fixture=scenario?.fixture||await studentJournalFixture({journalDirectory,websites:true});
 const tokens=scenario?.tokens||{a:await fixture.actor('studentA'),b:await fixture.actor('studentB'),admin:await fixture.actor('global')};
 const call=async(path,input)=>{
  const response=await worker.fetch(new Request('http://localhost/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.admin,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),fixture.env),result=await response.json();
  if(!response.ok)throw Error(JSON.stringify(result));return result;
 };
 let courseUrl=scenario?.courseUrl;
 if(!scenario){
 const activityKey=fixture.scopes.courseA,view=await call('admin/platform/course-websites/get',{activityKey});
 view.document.name='Tafseer · Surah Al-Kahf';view.document.home.headline='Pause, reflect, and return.';
 view.document.lessons=[{id:'intention',group:'Foundations',title:'Beginning with intention',summary:'A local sample lesson for your journal.',sections:[{id:'intention-section',label:'YOUR REFLECTION',title:'Pause & reflect',blocks:[{...newBlock('reflection'),id:'intention-reflection',text:'What would I like to change in my intention for studying the Qur’an?'}]}]}];
 if(twoReflections)view.document.lessons[0].sections[0].blocks.push({...newBlock('reflection'),id:'practice-reflection',text:'What will I put into practice?'});
 const saved=await call('admin/platform/course-websites/save',{activityKey,revision:view.revision,document:view.document,operationId:crypto.randomUUID()});
 const published=await call('admin/platform/course-websites/publish',{activityKey,revision:saved.revision,operationId:crypto.randomUUID()});await call('academy/changes/accept',published.acceptedChange);
 courseUrl='/academy/course-websites/view/?course='+encodeURIComponent(activityKey.slice(7))+'#lesson/intention';
 }
 let origin;
 const server=createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Local sample only');return;}
   const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
   if(url.pathname==='/'){
    res.writeHead(200,{'Content-Type':types['.html']});res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Student journal · local sample</title><main style="font:18px/1.7 system-ui;max-width:680px;margin:3rem auto;padding:1rem"><h1>Student journal</h1><p>A private journal for each student, in one private JSON file per student. These are sample accounts only.</p><p><a href="/sample/a">Open student A’s journal</a></p><p><a href="/sample/b">Open student B’s journal</a></p><p><a href="/sample/a?course=1">Open a lesson reflection as student A</a></p><p><a href="/sample/admin">Open Admin’s own journal</a></p><p>Sample journal entries stay in private files on this device. Nothing connects to the hosted Academy.</p></main>');return;
   }
   if(url.pathname.startsWith('/sample/')){
    const who=url.pathname.split('/').at(-1);if(!Object.hasOwn(tokens,who)){res.writeHead(404);res.end();return;}
    const destination=url.searchParams.has('course')?courseUrl:'/academy/journal/?workspace=LEARN';res.writeHead(200,{'Content-Type':types['.html']});res.end('<!doctype html><title>Local sample account</title><script>localStorage.clear();sessionStorage.clear();localStorage.setItem("m4l_account_token",'+JSON.stringify(tokens[who])+');location.replace('+JSON.stringify(destination)+');</script>');return;
   }
   if(url.pathname==='/js/m4l-config.js'){
    res.writeHead(200,{'Content-Type':types['.js']});res.end('window.M4L_CONFIG='+JSON.stringify({API_BASE:fullAuth?origin:'',LOCAL_JOURNAL_SAMPLE:true})+';');return;
   }
   if(url.pathname==='/api/academy/header-date'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true,hijri:'Local sample',gregorian:'2026-10-28'}));return;
   }
   if(url.pathname.startsWith('/api/')){
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})}),response=await worker.fetch(request,fixture.env);
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   let path=decodeURIComponent(url.pathname);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path),type=types[extname(file)];
   if(!file.startsWith(resolve(root)+sep)||path.includes('/.')||!/^\/(?:academy|js|css|icons|images)\//.test(path)&&!['/ummabbadacademy.png','/academy.png','/logo.png','/version.json'].includes(path)||!type){res.writeHead(404);res.end();return;}
   if(!(await stat(file)).isFile())throw Object.assign(Error('Not found'),{code:'ENOENT'});res.writeHead(200,{'Content-Type':type});if(req.method==='HEAD')res.end();else await pipeline(createReadStream(file),res);
  }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end('Local preview could not open this resource.');}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});origin='http://127.0.0.1:'+server.address().port;fixture.env.ALLOWED_ORIGINS=origin;
 return {origin,fixture,courseUrl,async close(){await new Promise(done=>server.close(done));fixture.close();}};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const folder=resolve(root,'backend/.student-journal-local');mkdirSync(folder,{recursive:true});
 const port=Number(process.env.JOURNAL_PREVIEW_PORT||4319);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a local preview port between 1024 and 65535.');
 const preview=await createJournalPreview({port,journalDirectory:resolve(folder,'r2-journals')});console.log('Local student journal: '+preview.origin);
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void preview.close().then(()=>process.exit()));
}
