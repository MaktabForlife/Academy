// Loopback-only, disposable accounts and data. No hosted database or media.
import {createServer} from 'node:http';
import {createReadStream,readFileSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {classNotesFixture} from '../tests/fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {newCourse,newBlock} from '../../academy/course-websites/model.mjs';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),port=4326,origin='http://127.0.0.1:'+port;
const f=await classNotesFixture(source=>{source.db.exec(readFileSync(new URL('../migrations/academy/0041_program_monthly_subscriptions.sql',import.meta.url),'utf8'));source.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',source.scopes.programA);});
Object.assign(f.env,{ALLOWED_ORIGINS:origin,ACADEMY_MONTHLY_SUBSCRIPTIONS:'1'});
const admin=await f.actor('global'),student=await f.actor('studentA'),activityKey=f.scopes.programA,surahId=crypto.randomUUID(),op=()=>crypto.randomUUID();
async function call(path,input){const response=await worker.fetch(new Request(origin+'/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+admin,'X-Academy-Workspace':'ADMIN','Content-Type':'application/json'},body:JSON.stringify(input)}),f.env),body=await response.json();if(!response.ok)throw Error(body.error);if(body.acceptedChange)await call('academy/changes/accept',body.acceptedChange);return body;}
await call('admin/platform/program-monthly-subscriptions/configure',{activityKey,mode:'prepare',policyRevision:0,operationId:op()});
await call('admin/platform/program-monthly-subscriptions/surah-save',{activityKey,policyRevision:f.db.prepare('SELECT revision FROM program_monthly_media_policies WHERE activity_key=?').get(activityKey).revision,entries:[{id:surahId,name:'Foundations of Tafseer',cardKey:'foundations',completionDate:'2026-10-01',active:true,revision:0}],operationId:op()});
const document=newCourse();document.name='Foundations of Tafseer';document.tag='TAFSEER & TADABBUR';document.home.headline='Understanding the Qur’an. Reflecting on its guidance.';document.home.subtitle='A local sample for reviewing on-page text editing.';document.home.description='Read with understanding. Return with reflection.';document.home.themes=[];document.lessons[0].title='Begin with intention';document.lessons[0].group='Introduction & Ulumul Qur’an';document.lessons[0].sections[0].title='What are we seeking?';document.lessons[0].sections[0].blocks[0].text='This is a sample passage for checking the website editor. Click Edit text to change this paragraph directly on the page.';
const ayah=newBlock('ayah');Object.assign(ayah,{arabic:'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',reference:'1:1',translation:'In the name of Allah, the Most Compassionate, the Most Merciful.'});document.lessons[0].sections[0].blocks.push(ayah);
const saved=await call('admin/platform/course-websites/save',{activityKey,surahId,document,revision:0,operationId:op()});await call('admin/platform/course-websites/publish',{activityKey,surahId,revision:saved.revision,operationId:op()});
const reader='/academy/course-websites/public/?'+new URLSearchParams({program:activityKey.slice(8),surah:surahId});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
 const url=new URL(req.url,origin);
 if(['/sample/admin','/sample/student','/sample/guest'].includes(url.pathname)){const token=url.pathname.endsWith('/admin')?admin:url.pathname.endsWith('/student')?student:'';res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store'});res.end('<!doctype html><title>Local sample</title><script>localStorage.setItem("m4l_account_token",'+JSON.stringify(token)+');location.replace('+JSON.stringify(reader)+')</script>');return;}
 if(url.pathname==='/'){res.writeHead(200,{'Content-Type':mime['.html']});res.end('<!doctype html><title>Local text editor preview</title><h1>On-page text editing · local sample</h1><p><a href="/sample/admin">Admin preview</a></p><p><a href="/sample/student">Student preview</a></p><p><a href="/sample/guest">Public preview</a></p>');return;}
 if(url.pathname==='/js/m4l-config.js'){res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});res.end('window.M4L_CONFIG={API_BASE:"",ACCEPTED_SETUP:true,MEDIA_SEPARATION:false};');return;}
 if(url.pathname.startsWith('/api/')){const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})}),f.env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();return;}
 let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)||pathname.includes('/.')||pathname.startsWith('/backend/')||pathname.startsWith('/docs/')||!mime[extname(file)]||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});await pipeline(createReadStream(file),res);
}catch{if(!res.headersSent)res.writeHead(500);res.end('The local sample could not finish this request.');}});
server.listen(port,'127.0.0.1',()=>console.log('Local text editor sample: '+origin));
const stop=()=>server.close(()=>{f.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
