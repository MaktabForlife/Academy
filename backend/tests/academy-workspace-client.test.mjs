import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../js/m4l-academy-workspace.js',import.meta.url),'utf8');
function fixture(fetcher=async()=>Response.json({audience:'LEARN'}),sessionFetcher=async()=>Response.json({success:true,contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]})){
 const location={pathname:'/academy/',hash:'#timetable/learn',search:'',origin:'https://academy.invalid',href:'https://academy.invalid/academy/#timetable/learn',replace(value){this.destination=value;}},calls=[],authCalls=[],handlers=new Map();let token='actor-one';
 const window={fetch:async(url,options)=>{if(String(url).endsWith('/api/account/session')){authCalls.push({url,options});return sessionFetcher(url,options);}calls.push({url,options});return fetcher(url,options);},M4L_CONFIG:{API_BASE:'https://api.invalid'},addEventListener(type,fn){handlers.set(type,fn);},dispatchEvent(event){handlers.get(event.type)?.(event);}};
 vm.runInNewContext(source,{window,location,localStorage:{getItem:()=>token},document:{addEventListener(){}},URL,URLSearchParams,Request,Response,Headers,DOMException,Event});
 return {window,location,calls,authCalls,handlers,token:value=>{token=value;}};
}
test('every API helper carries the selected audience and cannot override it with a higher role',async()=>{
 const f=fixture();await f.window.fetch('https://api.invalid/api/academy/assessments/list',{headers:{'X-Academy-Workspace':'ADMIN',Authorization:'Bearer fixture'}});
 assert.equal(f.calls[0].options.headers.get('X-Academy-Workspace'),'LEARN');assert.equal(f.calls[0].options.headers.get('Authorization'),'Bearer fixture');
 f.location.hash='#timetable/teach';assert.equal(f.window.M4L_ACADEMY_WORKSPACE.commit(),true);
 await f.window.fetch('https://api.invalid/api/academy/lesson-media/upload?metadata=x');assert.equal(f.calls[1].options.headers.get('X-Academy-Workspace'),'TEACH');
 const options={headers:{}};await f.window.fetch('https://external.invalid/api/public',options);assert.equal(f.calls[2].options,options);
});
test('delayed JSON, errors and file blobs are discarded after a workspace or account change',async()=>{
 for(const method of ['json','text','blob','arrayBuffer']){
  const f=fixture(),response=await f.window.fetch('https://api.invalid/api/academy/assessments/download');
  f.location.hash='#timetable/teach';f.window.M4L_ACADEMY_WORKSPACE.commit();await assert.rejects(response[method](),{name:'AbortError'});
 }
 const f=fixture(),response=await f.window.fetch('https://api.invalid/api/academy/entrance');f.token('actor-two');await assert.rejects(response.json(),{name:'AbortError'});
});
test('raw file bodies stay streamed and Admin compatibility hashes preserve the destination',async()=>{
 const original=new Response(new Blob(['%PDF-synthetic']).stream(),{headers:{'Content-Type':'application/pdf'}}),f=fixture(async()=>original);
 const response=await f.window.fetch('https://api.invalid/api/academy/lesson-media/download');assert.equal(response.body,original.body);assert.equal(await response.text(),'%PDF-synthetic');
 f.location.hash='#assessment-admin/PROGRAM/case-sensitive';assert.equal(f.window.M4L_ACADEMY_WORKSPACE.canonical(),'/academy/admin/#assessment-admin/PROGRAM/case-sensitive');
});

test('related reader calls share one accepted head and refresh invalidates delayed parsed results',async()=>{
 let revision='head-one-0001';const f=fixture(async url=>Response.json(String(url).endsWith('/setup/head')?{head:revision}:{success:true}));f.window.M4L_CONFIG.ACCEPTED_SETUP=true;
 const [a,b]=await Promise.all([f.window.fetch('https://api.invalid/api/academy/entrance'),f.window.fetch('https://api.invalid/api/academy/calendar/get')]);
 assert.equal(f.calls.filter(c=>String(c.url).endsWith('/setup/head')).length,1);for(const call of f.calls.filter(c=>!String(c.url).endsWith('/setup/head')))assert.equal(call.options.headers.get('X-Academy-Setup'),'head-one-0001');
 revision='head-two-0002';await f.window.M4L_ACADEMY_WORKSPACE.readyPublication(true);await assert.rejects(a.json(),{name:'AbortError'});await assert.rejects(b.json(),{name:'AbortError'});
 const response=await f.window.fetch('https://api.invalid/api/academy/lesson-media/download');assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Setup'),revision);assert.equal((await response.json()).success,true);
});
test('an account change while resolving the publication cannot send the delayed action',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json({head:'head-one-0001'}));}));f.window.M4L_CONFIG.ACCEPTED_SETUP=true;
 const pending=f.window.fetch('https://api.invalid/api/academy/progress/mark',{method:'POST',body:'{}'});f.token('another-actor');release();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,1);
});

test('class selection travels only with Admin-Learn and rejects a response captured for another class',async()=>{
 const f=fixture(),workspace=f.window.M4L_ACADEMY_WORKSPACE,first={activityKey:'PROGRAM:scope',classId:'one'},second={...first,classId:'two'};
 assert.equal(workspace.studentClass(first),false);f.location.pathname='/academy/admin/';workspace.commit();assert.equal(workspace.current(),'ADMIN_LEARN');
 assert.equal(workspace.studentClass(first),true);
 const response=await f.window.fetch('https://api.invalid/api/academy/entrance');
 assert.deepEqual(JSON.parse(decodeURIComponent(f.calls[0].options.headers.get('X-Academy-Class'))),first);
 workspace.studentClass(second);await assert.rejects(response.json(),{name:'AbortError'});
 f.location.hash='#timetable/teach';workspace.commit();await f.window.fetch('https://api.invalid/api/academy/attendance/get');
 assert.equal(f.calls[1].options.headers.get('X-Academy-Class'),null);
});


test('Admin reader URLs never redirect to personal pages and changing realms discards captured replies',async()=>{
 const f=fixture(),w=f.window.M4L_ACADEMY_WORKSPACE;
 const personal=await f.window.fetch('https://api.invalid/api/academy/entrance');
 f.location.pathname='/academy/admin/';assert.equal(w.commit(),true);assert.equal(w.current(),'ADMIN_LEARN');assert.equal(w.audience(),'LEARN');assert.equal(w.canonical(),'');assert.equal(w.adminRealm(),true);
 await assert.rejects(personal.json(),{name:'AbortError'});
 const view={activityKey:'PROGRAM:scope',classId:'one'};w.studentClass(view);
 await w.readyAccess();const reader=new URL(w.readerUrl('/academy/pdf-reader/?file=fixture'));assert.equal(reader.searchParams.get('workspace'),'ADMIN_LEARN');assert.equal(reader.searchParams.get('studentClass'),'one');
 f.location.hash='#activity/PROGRAM/scope/teach/assessment';w.commit();assert.equal(w.current(),'ADMIN_TEACH');assert.equal(w.classView(),null);
 const teaching=await f.window.fetch('https://api.invalid/api/academy/assessments/list');assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'ADMIN_TEACH');
 f.location.pathname='/academy/';w.commit();assert.equal(w.current(),'TEACH');assert.equal(w.adminRealm(),false);await assert.rejects(teaching.json(),{name:'AbortError'});
 await f.window.fetch('https://api.invalid/api/academy/entrance',{headers:{'X-Academy-Class':'forged','X-Academy-Workspace':'ADMIN_TEACH'}});assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Class'),null);assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'TEACH');
});


test('a student at an Admin address is returned to personal home before any Admin data request',async()=>{
 let release;const f=fixture(undefined,()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,contexts:[{scope:'COURSE',role:'STUDENT',courseId:'scope'}]}));})),w=f.window.M4L_ACADEMY_WORKSPACE;
 f.location.pathname='/academy/admin/';w.commit();assert.equal(w.adminAccess(),false);
 const pending=f.window.fetch('https://api.invalid/api/academy/entrance');assert.equal(f.calls.length,0);assert.equal(w.adminAccess(),false);release();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(f.location.destination,'/academy/#overview');assert.equal(w.adminAccess(),false);assert.equal(f.calls.length,0);assert.equal(f.authCalls[0].options.headers['X-Academy-Workspace'],'LEARN');
});
test('no role grants or an ordinary Teacher cannot activate Admin; signed-out entry stays unverified',async()=>{
 for(const contexts of [[],[{scope:'COURSE',role:'TEACHER',courseId:'scope'}]]){
  const f=fixture(undefined,async()=>Response.json({success:true,contexts})),w=f.window.M4L_ACADEMY_WORKSPACE;f.location.pathname='/academy/admin/';w.commit();await assert.rejects(w.readyAccess(),{name:'AbortError'});assert.equal(w.adminAccess(),false);assert.equal(f.location.destination,'/academy/#overview');assert.equal(f.calls.length,0);
 }
 const f=fixture(),w=f.window.M4L_ACADEMY_WORKSPACE;f.token('');f.location.pathname='/academy/admin/';w.commit();assert.equal(await w.readyAccess(),false);assert.equal(w.adminAccess(),false);assert.equal(f.authCalls.length,0);assert(!new URL(w.readerUrl('/academy/library/')).searchParams.get('workspace').startsWith('ADMIN'));
});
test('Global and scoped Admin authority is verified once per account; session changes immediately clear it',async()=>{
 for(const contexts of [[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}],[{scope:'COURSE',role:'PROGRAM_ADMIN',courseId:'scope'}]]){
  const f=fixture(undefined,async()=>Response.json({success:true,contexts})),w=f.window.M4L_ACADEMY_WORKSPACE;f.location.pathname='/academy/admin/';w.commit();await Promise.all([w.readyAccess(),w.readyAccess()]);assert.equal(w.adminAccess(),true);assert.equal(f.authCalls.length,1);
  f.window.dispatchEvent(new Event('m4l-academy-session'));assert.equal(w.adminAccess(),false);
 }
});
test('an old Admin verification cannot restore the banner after switching to a Student account',async()=>{
 let release;const f=fixture(undefined,()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]}));})),w=f.window.M4L_ACADEMY_WORKSPACE;
 f.location.pathname='/academy/admin/';w.commit();const pending=w.readyAccess();f.token('student-account');f.window.dispatchEvent(new Event('m4l-academy-session'));release();await assert.rejects(pending,{name:'AbortError'});assert.equal(w.adminAccess(),false);assert.equal(f.calls.length,0);
});
test('account controls use personal verification even from an Admin reader and revoked Admin responses leave the Admin view',async()=>{
 const f=fixture(async()=>Response.json({success:false,code:'ADMIN_VIEW_FORBIDDEN'},{status:403})),w=f.window.M4L_ACADEMY_WORKSPACE;f.location.pathname='/academy/admin/';w.commit();
 await f.window.fetch('https://api.invalid/api/account/session');assert.equal(f.authCalls[0].options.headers.get('X-Academy-Workspace'),'LEARN');assert.equal(f.authCalls[0].options.headers.get('X-Academy-Class'),null);
 await assert.rejects(f.window.fetch('https://api.invalid/api/academy/entrance'),{name:'AbortError'});assert.equal(w.adminAccess(),false);assert.equal(f.location.destination,'/academy/#overview');
});
