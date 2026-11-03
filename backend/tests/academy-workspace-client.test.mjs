import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../js/m4l-academy-workspace.js',import.meta.url),'utf8');
function fixture(fetcher=async()=>Response.json({audience:'LEARN'}),sessionFetcher=async()=>Response.json({success:true,contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]})){
 const location={pathname:'/academy/',hash:'#timetable/learn',search:'',origin:'https://academy.invalid',href:'https://academy.invalid/academy/#timetable/learn',replace(value){this.destination=value;}},calls=[],authCalls=[],handlers=new Map();let token='actor-one';
 const window={M4L_CIRCLES_NATIVE:{home:({workspace})=>'https://maktab4life.org/?workspace='+workspace+'&dashboard=1',recovery:message=>{location.recovery=message;}},fetch:async(url,options)=>{if(String(url).endsWith('/api/account/session')){authCalls.push({url,options});return sessionFetcher(url,options);}calls.push({url,options});return fetcher(url,options);},M4L_CONFIG:{API_BASE:'https://api.invalid'},addEventListener(type,fn){handlers.set(type,fn);},dispatchEvent(event){handlers.get(event.type)?.(event);}};
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
test('the public Foundations reader remains a guest Learn page and does not require Admin verification',async()=>{
 const f=fixture(()=>Response.json({success:true,document:{name:'Foundations'}}));f.token('');f.location.pathname='/academy/course-websites/public/';f.location.hash='';f.window.M4L_ACADEMY_WORKSPACE.commit();
 assert.equal(f.window.M4L_ACADEMY_WORKSPACE.current(),'LEARN');assert.equal(f.window.M4L_ACADEMY_WORKSPACE.adminRealm(),false);
 const result=await f.window.fetch('https://api.invalid/api/academy/public-surah-websites/read',{method:'POST',body:'{}'});assert.equal((await result.json()).document.name,'Foundations');assert.equal(f.authCalls.length,0);assert.equal(f.location.destination,undefined);
});
test('public announcements load independently of account, workspace and publication startup',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,announcements:[]}));}));
 f.window.M4L_CONFIG.ACCEPTED_SETUP=true;
 f.location.pathname='/academy/admin/';f.window.M4L_ACADEMY_WORKSPACE.commit();
 const pending=f.window.fetch('https://api.invalid/api/academy/announcements',{cache:'no-store',credentials:'omit',headers:{'X-Academy-Workspace':'ADMIN','X-Academy-Class':'old-class','X-Academy-Setup':'old-head'}});
 assert.equal(f.authCalls.length,0);assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.invalid/api/academy/announcements');
 for(const name of ['X-Academy-Workspace','X-Academy-Class','X-Academy-Setup'])assert.equal(f.calls[0].options.headers.get(name),null);
 f.token('another-actor');f.window.dispatchEvent(new Event('m4l-academy-session'));
 f.location.pathname='/academy/';f.window.M4L_ACADEMY_WORKSPACE.commit();
 release();const response=await pending;assert.deepEqual(await response.json(),{success:true,announcements:[]});
});
test('authenticated announcement reads and other announcement routes retain workspace response guards',async()=>{
 for(const [resource,options] of [
  ['https://api.invalid/api/academy/announcements',{headers:{Authorization:'Bearer fixture'}}],
  [new Request('https://api.invalid/api/academy/announcements',{headers:{Authorization:'Bearer fixture'}}),undefined],
  ['https://api.invalid/api/academy/announcements',{method:'POST'}],
  ['https://api.invalid/api/academy/announcements/image?id=fixture',undefined],
  ['https://api.invalid/api/admin/platform/announcements/list',{method:'POST'}]
 ]){
  const f=fixture(),response=await f.window.fetch(resource,options);
  assert.equal(f.calls[0].options.headers.get('X-Academy-Workspace'),'LEARN');
  f.token('another-actor');await assert.rejects(response.json(),{name:'AbortError'});
 }
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
 assert.match(f.location.recovery,/outside your current Admin access/);assert.equal(w.adminAccess(),false);assert.equal(f.calls.length,0);assert.equal(f.authCalls[0].options.headers['X-Academy-Workspace'],'LEARN');
});
test('no role grants or an ordinary Teacher cannot activate Admin; signed-out entry stays unverified',async()=>{
 for(const contexts of [[],[{scope:'COURSE',role:'TEACHER',courseId:'scope'}]]){
  const f=fixture(undefined,async()=>Response.json({success:true,contexts})),w=f.window.M4L_ACADEMY_WORKSPACE;f.location.pathname='/academy/admin/';w.commit();await assert.rejects(w.readyAccess(),{name:'AbortError'});assert.equal(w.adminAccess(),false);assert.match(f.location.recovery,/outside your current Admin access/);assert.equal(f.calls.length,0);
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
 await assert.rejects(f.window.fetch('https://api.invalid/api/academy/entrance'),{name:'AbortError'});assert.equal(w.adminAccess(),false);assert.match(f.location.recovery,/outside your current Admin access/);
});

test('Class Note changes and submitting a plan invalidate protected read snapshots',async()=>{
 const f=fixture();let invalidated=0;f.window.M4L_ACADEMY_READ_CACHE={invalidate(){invalidated++;}};
 for(const path of ['class-notes/post','class-notes/revise','class-notes/relink','planning/submit'])await f.window.fetch('https://api.invalid/api/academy/'+path,{method:'POST',body:'{}'});
 assert.equal(invalidated,4);
});


test('Home preserves the selected programme audience and native authority realm',()=>{
 const f=fixture(),w=f.window.M4L_ACADEMY_WORKSPACE;
 for(const audience of ['learn','teach']){f.location.hash='#activity/PROGRAM/scope/'+audience;w.commit();assert.equal(w.homeUrl(),'https://maktab4life.org/?workspace='+audience+'&dashboard=1');}
 f.location.pathname='/academy/admin/';
 for(const hash of ['#activity/PROGRAM/scope/learn','#activity/PROGRAM/scope/teach','#administration/settings']){f.location.hash=hash;w.commit();assert.equal(w.homeUrl(),hash.startsWith('#administration')?'https://maktab4life.org/?workspace=admin&dashboard=1':'https://maktab4life.org/?workspace='+hash.split('/')[3]+'&dashboard=1');}
});
test('a verified teacher summary uses the hub address without creating a second home',async()=>{
 const f=fixture(),w=f.window.M4L_ACADEMY_WORKSPACE;
 w.preferHubAudience('TEACH');f.location.hash='#dashboard';w.commit();
 assert.equal(w.current(),'TEACH');assert.equal(w.homeUrl(),'https://maktab4life.org/?workspace=teach&dashboard=1');
 await f.window.fetch('https://api.invalid/api/academy/entrance');assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'TEACH');
 f.token('next-actor');f.window.dispatchEvent(new Event('m4l-academy-session'));w.commit();
 assert.equal(w.current(),'LEARN','Another account cannot inherit the previous summary audience');
});

test('explicit same-programme editor requests use checked Admin authority without promoting normal Learn navigation',async()=>{
 const f=fixture(()=>Response.json({success:true})),w=f.window.M4L_ACADEMY_WORKSPACE,scope={activityKey:'PROGRAM:exact'};
 const response=await w.adminFetch('https://api.invalid/api/academy/media-playlists/options',{method:'POST',body:JSON.stringify(scope)},scope);assert.equal((await response.json()).success,true);assert.equal(f.calls[0].options.headers.get('X-Academy-Workspace'),'ADMIN');assert.equal(w.current(),'LEARN');assert.equal(f.authCalls.length,1);
 await f.window.fetch('https://api.invalid/api/academy/lesson-media/feed',{method:'POST',body:JSON.stringify(scope)});assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'LEARN');
 await assert.rejects(w.adminFetch('https://api.invalid/api/academy/participants/save',{method:'POST',body:JSON.stringify(scope)},scope),e=>e.status===403);await assert.rejects(w.adminFetch('https://api.invalid/api/academy/media-playlists/save',{method:'POST',body:'{"activityKey":"PROGRAM:other"}'},scope),e=>e.status===403);
});
test('same-screen editor denies a non-Admin and rejects delayed replies after account changes',async()=>{
 const denied=fixture(undefined,async()=>Response.json({success:true,contexts:[{scope:'COURSE',role:'TEACHER'}]})),scope={activityKey:'PROGRAM:exact'};await assert.rejects(denied.window.M4L_ACADEMY_WORKSPACE.adminFetch('https://api.invalid/api/academy/media-playlists/options',{method:'POST',body:JSON.stringify(scope)},scope),e=>e.status===403);assert.equal(denied.calls.length,0);assert.equal(denied.location.destination,undefined);
 let resolve;const f=fixture(()=>new Promise(yes=>resolve=yes)),pending=f.window.M4L_ACADEMY_WORKSPACE.adminFetch('https://api.invalid/api/academy/media-playlists/options',{method:'POST',body:JSON.stringify(scope)},scope);for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));f.token('next-actor');resolve(Response.json({success:true}));await assert.rejects(pending,{name:'AbortError'});assert.equal(f.window.M4L_ACADEMY_WORKSPACE.current(),'LEARN');
});

test('Course Media signed Studio routes accept exact Course scope and reuse the current read proof',async()=>{
 const f=fixture(()=>Response.json({success:true})),w=f.window.M4L_ACADEMY_WORKSPACE,scope={activityKey:'COURSE:COURSE-synthetic-123'};
 for(const action of ['media-location','course-user-search','course-playlists','course-playlist-detail','course-playlist-options','course-playlist-candidates','course-playlist-recording','mou-playlist-card-options','mou-playlist-cover-preview']){
  const response=await w.adminFetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',headers:{Authorization:'Bearer actor-one'},body:JSON.stringify({...scope,command:{action}})},scope);assert.equal((await response.json()).success,true);assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'ADMIN');
 }
 assert.equal(f.authCalls.length,1,'Read-only Course commands must not discard the reusable account proof');assert.equal(w.current(),'LEARN','Editor transport must not promote ordinary Learn navigation');
 const response=await w.adminFetch('https://api.invalid/api/admin/platform/studio-access/playlist-cover',{method:'POST',body:JSON.stringify({...scope,command:{action:'mou-playlist-cover-upload'}})},scope);assert.equal((await response.json()).success,true);assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Workspace'),'ADMIN');
});

test('Course bridge exceptions remain limited to the exact native Studio route, scope and POST body',async()=>{
 const f=fixture(()=>Response.json({success:true})),w=f.window.M4L_ACADEMY_WORKSPACE,scope={activityKey:'COURSE:exact'};
 for(const [url,options,context] of [
  ['https://elsewhere.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify(scope)},scope],
  ['https://api.invalid/api/academy/media-playlists/save',{method:'POST',body:JSON.stringify(scope)},scope],
  ['https://api.invalid/api/admin/platform/studio-access/anything',{method:'POST',body:JSON.stringify(scope)},scope],
  ['https://api.invalid/api/admin/platform/studio-access',{method:'GET',body:JSON.stringify(scope)},scope],
  ['https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({activityKey:'COURSE:other'})},scope],
  ['https://api.invalid/api/admin/platform/studio-access?metadata='+encodeURIComponent(JSON.stringify(scope)),{method:'POST',body:JSON.stringify({activityKey:'COURSE:other'})},scope],
  ['https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify(scope)},{activityKey:'GLOBAL:all'}]
 ])await assert.rejects(w.adminFetch(url,options,context),e=>e.status===403);
 assert.equal(f.calls.length,0);assert.equal(f.authCalls.length,0);
 const p={activityKey:'PROGRAM:exact'};assert.equal((await (await w.adminFetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify(p)},p)).json()).success,true);
});

test('Course Media bridge rejects non-Admin authority and delayed account changes',async()=>{
 const scope={activityKey:'COURSE:exact'},url='https://api.invalid/api/admin/platform/studio-access',options={method:'POST',body:JSON.stringify({...scope,command:{action:'media-location'}})};
 const denied=fixture(undefined,async()=>Response.json({success:true,contexts:[{scope:'COURSE',role:'TEACHER'}]}));await assert.rejects(denied.window.M4L_ACADEMY_WORKSPACE.adminFetch(url,options,scope),e=>e.status===403);assert.equal(denied.calls.length,0);
 let release;const f=fixture(()=>new Promise(resolve=>release=resolve)),pending=f.window.M4L_ACADEMY_WORKSPACE.adminFetch(url,options,scope);for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));assert.equal(typeof release,'function');f.token('new-account');release(Response.json({success:true}));await assert.rejects(pending,{name:'AbortError'});
});

test('the real Course Media controller opens through the shared Admin wrapper and uses the dedicated cover route',async()=>{
 const activityKey='COURSE:COURSE-native-regression',sent=[];
 const f=fixture((url,options)=>{const input=JSON.parse(options.body);sent.push({url,input,workspace:options.headers.get('X-Academy-Workspace')});return Response.json({success:true,...(input.command.action==='media-location'?{managed:true,kind:'COURSE',ownership:'STUDIO',destination:'https://studio.invalid/studio/?manage=1&offering=native-course'}:{playlists:[]})});});
 const host={isConnected:true,innerHTML:'',replaceChildren(){this.innerHTML='';},append(){}};let mounted;
 const document={getElementById:key=>key==='course-media'?host:null,querySelector:()=>null,head:{append(){}},createElement:()=>({setAttribute(){},textContent:''})};
 const code=readFileSync(new URL('../../js/m4l-course-media.js',import.meta.url),'utf8').replace("const modules=Promise.all([import('./m4l-course-media-view.mjs'),import('./m4l-playlist-card.mjs')]);",'const modules=Promise.resolve(__modules);');
 vm.runInNewContext(code,{window:f.window,document,localStorage:{getItem:()=> 'actor-one'},URL,DOMException,Blob,Uint8Array,btoa,atob,crypto,__modules:[{mountCourseMedia:(host,options)=>{mounted=options;const dispose=()=>{};dispose.canLeave=()=>true;return dispose;}},{}]});
 await f.window.M4L_COURSE_MEDIA.open({hostId:'course-media',activityKey,courseName:'Native Course'});assert(mounted,'The actual Course controller must reach its playlist renderer');await mounted.request('course-playlists');
 assert.equal(sent.length,2);assert(sent.every(r=>r.workspace==='ADMIN'&&r.input.activityKey===activityKey));assert.equal(sent[0].input.command.action,'media-location');assert.equal(sent[1].input.command.action,'course-playlists');assert.equal(f.authCalls.length,1);
 await mounted.request('mou-playlist-cover-upload',{playlistId:'exact-playlist',revision:3,file:{type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer},image:{sha256:'a'.repeat(64)}});
 assert.equal(new URL(sent[2].url).pathname,'/api/admin/platform/studio-access/playlist-cover');assert.equal(sent[2].input.command.action,'mou-playlist-cover-upload');assert.equal(sent[2].input.command.data,'AQID');assert.equal(sent[2].input.activityKey,activityKey);
});

test('Course Participants keeps its normal Admin transport and sensitive writes invalidate read metadata',async()=>{
 const f=fixture(()=>Response.json({success:true})),w=f.window.M4L_ACADEMY_WORKSPACE,scope={activityKey:'COURSE:exact'};
 f.location.pathname='/academy/courses/manage/';f.location.hash='';w.commit();
 for(const action of ['read','course-user-search'])await f.window.fetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({...scope,command:{action}})});
 assert.equal(f.calls[0].options.headers.get('X-Academy-Workspace'),'ADMIN');assert.equal(f.calls[1].options.headers.get('X-Academy-Workspace'),'ADMIN');
 const before=f.authCalls.length;
 await w.adminFetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({...scope,command:{action:'course-playlist-save'}})},scope);
 await w.adminFetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({...scope,command:{action:'course-playlists'}})},scope);
 assert(f.authCalls.length>before,'Sensitive writes retain metadata invalidation; server authority is never cached by this client exception');
});

test('Course bridge rejects replies after a workspace change while preserving the existing Program editor boundary',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>release=resolve)),w=f.window.M4L_ACADEMY_WORKSPACE,scope={activityKey:'COURSE:exact'};
 const request=w.adminFetch('https://api.invalid/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({...scope,command:{action:'course-playlists'}})},scope);for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));f.location.hash='#timetable/teach';w.commit();release(Response.json({success:true}));await assert.rejects(request,{name:'AbortError'});
});
