import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script=await readFile(new URL('../../js/m4l-academy-navigation.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<3;i++) await new Promise(resolve=>setImmediate(resolve));};
function storage(values={}) {
  const data=new Map(Object.entries(values));
  return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),key:index=>[...data.keys()][index],get length(){return data.size;}};
}
function fixture(path='/academy/open-library/',search='') {
  const nodes=new Map(), handlers=new Map(), requests=[], children=[];
  function element() {
    let markup='';
    return {hidden:false,attrs:{},handlers:new Map(),classList:{add(){}},querySelectorAll:()=>[],
      setAttribute(key,value){this.attrs[key]=value;},
      addEventListener(type,fn){this.handlers.set(type,fn);},replaceChildren(){markup='';},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;for(const match of value.matchAll(/id="([^"]+)"/g)) if(!nodes.has(match[1])) nodes.set(match[1],element());}
    };
  }
  const forYou=element();forYou.hidden=true;nodes.set('library-for-you',forYou);
  const localStorage=storage(),sessionStorage=storage(),location={pathname:path,search};
  const document={createElement:element,getElementById:id=>nodes.get(id),body:{classList:{add(){}},prepend:(...items)=>children.unshift(...items)}};
  const window={M4L_CONFIG:{API_BASE:'https://api.test'},addEventListener:(type,fn)=>handlers.set(type,fn),dispatchEvent:event=>handlers.get(event.type)?.(event)};
  let result={success:true,signedIn:true,student:true,personalActivities:[
    {id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['STUDENT']},
    {id:'Course-actual-id',name:'Barakah <course>',kind:'COURSE',roles:['TEACHER']}
  ]}, hold=false,release,ok=true,logoutFailure=false;
  const fetch=async(url,options)=>{requests.push({url,options});if(url.endsWith('/api/account/logout')){if(logoutFailure)throw Error('Synthetic connection failure');return {ok:true,json:async()=>({success:true})};}const home=structuredClone(result),snapshot={success:home.success,sessionStore:home.sessionStore,account:{displayName:'Synthetic member',uniqueid:home.profile?.uniqueid||''},contexts:[...(home.globalAdmin? [{scope:'PLATFORM',role:'GLOBAL_ADMIN',courseId:'',courseName:'Academy'}]:[]),...(home.personalActivities||[]).flatMap(row=>(row.roles||[]).map(role=>({scope:row.kind==='PROGRAM'?'COURSE':'GLOBAL',courseId:row.id,courseName:row.name,role}))) ]};if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}return{ok,json:async()=>snapshot};};
  runInNewContext(script,{document,window,location,localStorage,sessionStorage,fetch,URLSearchParams,encodeURIComponent,Event});
  return {nodes,handlers,requests,children,localStorage,sessionStorage,location,forYou,window,
    setResult:value=>{result=value;},setOk:value=>{ok=value;},setLogoutFailure:value=>{logoutFailure=value;},defer:()=>{hold=true;},release:()=>release(),
    refresh:()=>handlers.get('m4l-academy-session')()};
}
const app=fixture();
assert.doesNotMatch(app.children[0].innerHTML,/id="ac-progress"|href="\/academy\/#hifz"/);
assert.equal(app.requests.length,0,'Public Library needs no account request for a visitor');
for(const slug of ['surahs-in-my-heart','kaaba-puzzle'])assert.match(app.children[0].innerHTML,new RegExp('href="/activities/'+slug+'/"'));
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-recorder').hidden,true);
assert.match(app.children[0].innerHTML,/id="ac-recorder" data-recorder-link href="\/recorder\/\?academy=1"/);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.children[1].hidden,true);
app.localStorage.setItem('m4l_account_token','first-account');app.refresh();await flush();
assert.equal(app.requests[0].url,'https://api.test/api/account/session');
assert.equal(app.requests.some(r=>r.url.includes('/api/academy/entrance')),false,'Header never asks for a complete timetable');
assert.equal(app.requests[0].options.headers.Authorization,'Bearer first-account');
assert.equal(app.requests[0].options.body,'{}');
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-library').href,'/academy/library/');
assert.match(app.children[1].innerHTML,/\/academy\/#activity\/PROGRAM\/Pilot-actual-id/);
assert.match(app.children[1].innerHTML,/href="\/academy\/#workshops"/);
assert.equal((app.children[1].innerHTML.match(/<span>Courses<\/span>/g)||[]).length,1);
assert.doesNotMatch(app.children[1].innerHTML,/Course-actual-id|Barakah/);
assert.match(app.children[1].innerHTML,/<small>Teacher<\/small>/);
for(const [assigned,label] of [[['STUDENT','TEACHER'],'Teacher'],[['TEACHER','STUDENT','PROGRAM_ADMIN'],'Program Admin'],[['STUDENT','PROGRAM_ADMIN','GLOBAL_ADMIN'],'Global Admin']]) {
  app.setResult({success:true,signedIn:true,student:true,personalActivities:[{id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:assigned}]});app.refresh();await flush();
  assert.match(app.children[1].innerHTML,new RegExp('<small>'+label+'</small>'));assert.doesNotMatch(app.children[1].innerHTML,/<small>[^<]* · /);
}
app.setResult({success:true,signedIn:true,student:false,personalActivities:[{id:'no-access',name:'Hidden Program',kind:'PROGRAM',roles:[]},{id:'designation-only',name:'No Program assignment',kind:'PROGRAM',roles:['GLOBAL_TEACHER']}]});app.refresh();await flush();
assert.doesNotMatch(app.children[1].innerHTML,/Hidden Program|No Program assignment|Visitor|None/,'No access means no pill');
assert.doesNotMatch(app.children[0].innerHTML,/>Programs and Courses<|>Timetable</);
// Shared menus also remove the old Hifz page link, using the canonical account alias.
app.window.M4L_CONFIG.HIFZ_PROGRAM_ID='PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227';
app.window.M4L_CONFIG.HIFZHELPER_URL='https://hifz.maktab4life.org/';
for(const role of ['STUDENT','TEACHER','PROGRAM_ADMIN','GLOBAL_ADMIN']){
 app.setResult({success:true,signedIn:true,globalAdmin:role==='GLOBAL_ADMIN',profile:{uniqueid:'HifzStudent'},personalActivities:[{id:app.window.M4L_CONFIG.HIFZ_PROGRAM_ID,name:'Hifz',kind:'PROGRAM',roles:role==='GLOBAL_ADMIN'?['PROGRAM_ADMIN']:[role]}]});app.refresh();await flush();
 assert.match(app.children[1].innerHTML,/href="https:\/\/hifz\.maktab4life\.org\/HifzStudent\?academy=1" target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(app.children[1].innerHTML,/#activity\/PROGRAM\/|Bearer|first-account/,'The shared menu contains no old Hifz page link or session token');
}
app.setResult({success:true,signedIn:true,profile:{uniqueid:'bad/id'},personalActivities:[{id:app.window.M4L_CONFIG.HIFZ_PROGRAM_ID,name:'Hifz',kind:'PROGRAM',roles:['STUDENT']}]});app.refresh();await flush();assert.doesNotMatch(app.children[1].innerHTML,/HifzHelper|#activity/,'Invalid aliases cannot produce a shared Hifz destination');
// Every signed-in role can open the local recorder directly, without Student enrolment.
app.setResult({success:true,signedIn:true,student:false,personalActivities:[]});app.refresh();await flush();
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-recorder').hidden,false);
assert.equal(app.children[1].hidden,false);
assert.doesNotMatch(app.children[1].innerHTML,/<span>Courses<\/span>/);
app.setOk(false);app.refresh();await flush();
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.nodes.get('ac-signout').hidden,false,'A stored account can sign out even when navigation cannot load');
assert.equal(app.children[1].hidden,true,'Failed validation cannot restore private activity names');
app.setOk(true);app.defer();app.refresh();await flush();
app.localStorage.removeItem('m4l_account_token');app.handlers.get('storage')({key:'m4l_account_token'});app.release();await flush();
assert.equal(app.forYou.hidden,true,'A delayed account response must not survive sign-out');
assert.equal(app.children[1].innerHTML,'');
app.localStorage.setItem('m4l_account_token','next-account');app.setResult({success:true,signedIn:true,student:false,personalActivities:[{id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['ADMIN']}]});app.refresh();await flush();
app.localStorage.setItem('m4l_account_context','private');app.localStorage.setItem('m4l_app_cache_test','private');
app.sessionStorage.setItem('m4l_academy_signed_in','1');app.sessionStorage.setItem('m4l_admin_progress_dashboard_test','private');
app.nodes.get('ac-signout').handlers.get('click')();
assert.equal(app.location.href,'/academy/#overview');
assert.equal(app.localStorage.getItem('m4l_account_token'),null);
assert.equal(app.localStorage.getItem('m4l_app_cache_test'),null);
assert.equal(app.sessionStorage.length,0);
assert.equal(app.children[1].hidden,true);
assert.equal(app.requests.filter(r=>r.url.endsWith('/api/account/logout')).length,0,'Sheets sign-out must keep its existing behavior');
for(const fail of [false,true]) {
  const d1=fixture();d1.localStorage.setItem('m4l_account_token','current-d1-account');
  d1.setResult({success:true,signedIn:true,sessionStore:'D1',personalActivities:[]});d1.refresh();await flush();
  d1.setLogoutFailure(fail);d1.nodes.get('ac-signout').handlers.get('click')();await flush();
  const request=d1.requests.find(r=>r.url.endsWith('/api/account/logout'));
  assert.equal(request.options.headers.Authorization,'Bearer current-d1-account');assert.equal(request.options.keepalive,true);assert.equal(request.options.body,'{}');
  assert.equal(d1.localStorage.getItem('m4l_account_token'),null);assert.equal(d1.location.href,'/academy/#overview');
}
const replaced=fixture();replaced.localStorage.setItem('m4l_account_token','old-d1-account');replaced.setResult({success:true,signedIn:true,sessionStore:'D1'});replaced.refresh();await flush();
replaced.localStorage.setItem('m4l_account_token','replacement-account');replaced.nodes.get('ac-signout').handlers.get('click')();await flush();
assert.equal(replaced.requests.filter(r=>r.url.endsWith('/api/account/logout')).length,0,'A prior account cannot select the replacement account’s sign-out store');
const missingCalendar=fixture('/academy/courses/manage/');missingCalendar.localStorage.setItem('m4l_account_token','calendar-removed');missingCalendar.nodes.delete('ac-calendar');missingCalendar.setResult({success:true,globalAdmin:true,sessionStore:'D1'});missingCalendar.refresh();await flush();assert.equal(missingCalendar.window.M4L_ACADEMY_SHELL_DATA.globalAdmin,true,'Missing retired Calendar link cannot stop the account banner');assert.equal(missingCalendar.window.M4L_ACADEMY_SHELL_DATA.profile.name,'Synthetic member');
const shared=fixture('/academy/courses/manage/');shared.localStorage.setItem('m4l_account_token','shared-session');shared.setResult({success:true,globalAdmin:true,sessionStore:'D1'});shared.defer();const firstSession=shared.window.M4L_ACADEMY_NAVIGATION.session('shared-session');const secondSession=shared.window.M4L_ACADEMY_NAVIGATION.session('shared-session');await flush();assert.equal(shared.requests.length,1,'Course and header share their in-flight account request');shared.release();await Promise.all([firstSession,secondSession]);assert.equal(shared.window.M4L_ACADEMY_SHELL_DATA.globalAdmin,true);assert.equal(shared.window.M4L_ACADEMY_SHELL_DATA.profile.name,'Synthetic member');assert.deepEqual([...shared.window.M4L_ACADEMY_SHELL_DATA.workspaceRoles],['GLOBAL_ADMIN']);shared.localStorage.setItem('m4l_account_token','replacement');assert.equal(shared.window.M4L_ACADEMY_NAVIGATION.useSession({success:true,account:{displayName:'Old account'},contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]},'shared-session'),false,'Old account responses cannot repopulate the header');
const standalone=fixture('/recorder/');assert.equal(standalone.children.length,0,'Recorder use outside Academy keeps its existing interface');
const recorder=fixture('/recorder/','?academy=1');assert.equal(recorder.children.length,2);
const program=fixture('/programs/attendance.html','?program=Pilot-actual-id');program.localStorage.setItem('m4l_account_token','staff');program.refresh();await flush();
assert.match(program.children[1].innerHTML,/Pilot-actual-id\/learn" aria-current="page"/);
const first={dataset:{academyProgram:'Pilot-actual-id'},attrs:{'aria-current':'page'},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
const second={...first,dataset:{academyProgram:'next-program'},attrs:{}};
program.children[1].querySelectorAll=()=>[first,second];
const initialRequests=program.requests.length;program.location.search='?program=next-program';program.handlers.get('m4l-program-selection')();
assert.equal(first.attrs['aria-current'],undefined);assert.equal(second.attrs['aria-current'],'page');assert.equal(program.requests.length,initialRequests,'Program selection updates the activity strip without another account lookup');
// Discover every standalone entry point so future screens cannot omit half the shared header.
for(const root of ['academy','account','programs','users','recorder','activities']) {
  const files=await readdir(new URL('../../'+root+'/',import.meta.url),{recursive:true});
  for(const name of files.filter(name=>name.endsWith('.html'))) {
    const file=root+'/'+name,html=await readFile(new URL('../../'+file,import.meta.url),'utf8');
    // The transient authentication relay has its own Return to Academy control.
    // Loading the full account shell adds redundant API requests during sign-in.
    // Its recovery and redirect behavior is checked by the bridge UI test.
    if(file==='academy/hifz/index.html')continue;
    // The approved annotation experiment is deliberately account-free. Its own
    // navigation returns to Academy/the normal reader without session API calls.
    if(file==='academy/dashboard-design/index.html'){
      assert.match(html,/Sample data.*local preview/);assert.doesNotMatch(html,/m4l-config\.js|m4l-academy-navigation\.js/);continue;
    }
    if(file==='academy/pdf-icon-samples/index.html'){
      assert.match(html,/href="\/academy\/pdf-reader\/"/);assert.doesNotMatch(html,/m4l-config\.js|m4l-academy-navigation\.js/);continue;
    }
    if(file==='academy/pdf-compare/index.html'){
      assert.match(html,/href="\/academy\/"/);assert.match(html,/href="\/academy\/pdf-reader\/"/);
      assert.match(html,/name="robots" content="noindex,nofollow"/);
      assert.match(html,/\/js\/m4l-pdf-compare\.mjs/);assert.doesNotMatch(html,/m4l-config\.js|m4l-academy-navigation\.js/);
      continue;
    }
    // The course shares account headers while retaining its own lesson navigation.
    if(file==='academy/course-companion/surah-kahf/index.html'){
      for(const asset of ['m4l-config.js','m4l-academy-workspace.js','m4l-academy-read-cache.js'])assert.ok(html.includes('/js/'+asset),file+' must retain '+asset);
      assert.match(html,/<body class="course-loading kahf-course-portal"/);assert.match(html,/data-dashboard/);assert.match(html,/id="contents-dialog"/);assert.match(html,/portal\.js\?v=/);
      assert.match(html,/data-academy-admin-context="badge"/);assert.match(html,/data-academy-header-dates="true"/);
      for(const asset of ['m4l-academy-navigation.js','m4l-academy-mobile.js','m4l-academy-page-actions.js','m4l-academy-header-date.js'])assert.ok(html.includes('/js/'+asset),file+' must include '+asset);
      for(const asset of ['m4l-academy-navigation.css','m4l-academy-mobile.css','m4l-academy-shell.css','m4l-academy-page-actions.css'])assert.ok(html.includes('/css/'+asset),file+' must include '+asset);
      assert.ok(html.indexOf('/js/m4l-academy-read-cache.js')<html.indexOf('src="portal.js'),file+' must initialise refresh boundaries before the reader');
      assert.ok(html.indexOf('/js/m4l-academy-navigation.js')<html.indexOf('/js/m4l-academy-mobile.js')&&html.indexOf('/js/m4l-academy-mobile.js')<html.indexOf('/js/m4l-academy-page-actions.js'),file+' must initialise shared account headers in order');
      assert.match(html,/class="course-navigation-heading"/);assert.doesNotMatch(html,/<header class="topbar">/);
      continue;
    }
    for(const asset of ['m4l-academy-mobile.js','m4l-academy-mobile.css','m4l-academy-shell.css','m4l-academy-page-actions.js','m4l-academy-page-actions.css'])assert.ok(html.includes('/'+(asset.endsWith('.js')?'js/':'css/')+asset),file+' must include '+asset);
    if(!['academy/index.html','academy/admin/index.html'].includes(file)) {
      assert.match(html,/m4l-academy-navigation\.js/,file);assert.match(html,/m4l-academy-navigation\.css/,file);
      assert.ok(html.indexOf('/js/m4l-academy-navigation.js')<html.indexOf('/js/m4l-academy-mobile.js'),file+' must initialise account navigation before the shell');
    }
    assert.ok(html.indexOf('/js/m4l-academy-mobile.js')<html.indexOf('/js/m4l-academy-page-actions.js'),file+' must create the shell before account controls');
  }
}
console.log('Academy shared navigation: public/private links, actual subscribed IDs, all-role Library tabs, stale-response sign-out, tool coverage and standalone recorder isolation passed.');

// Cloudflare Pages serves canonical extensionless addresses; all page tabs must match them.
const programNav=await readFile(new URL('../../js/m4l-program-management-navigation.js',import.meta.url),'utf8');
const programId='PRG-11111111-1111-4111-8111-111111111111';
async function programHeader(path,globalAdmin=true,options={}) {
  const headers=[],classes=new Set(),handlers=new Map(),tokens=storage({m4l_account_token:'staff'}),requests=[];
  const document={querySelector:()=>({prepend:header=>headers.push(header)}),createElement:()=>({remove(){headers.splice(headers.indexOf(this),1);}}),body:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}};
  const window={M4L_CONFIG:{HIFZ_PROGRAM_ID:options.hifzProgramId},addEventListener:(type,fn)=>handlers.set(type,fn)};
  runInNewContext(programNav,{document,window,location:{pathname:path,search:'?program='+programId},localStorage:tokens,URLSearchParams,
    fetch:async()=>{requests.push('list');return {ok:true,json:async()=>({success:true,store:'D1',globalAdmin,programs:[{id:programId,name:'Synthetic <Program>',status:'ACTIVE'}],...options})};}});
  await flush();return {headers,classes,handlers,tokens,window,requests};
}
for(const [page,label] of [['timetable','Timetable'],['manage','People'],['lesson-media','Lesson media'],['media','Library'],['attendance','Attendance']]) {
  for(const ending of ['', '.html', '/']) {
    const view=await programHeader('/programs/'+page+ending);
    assert.equal(view.headers.length,1);const html=view.headers[0].innerHTML;
    const selected=[...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map(m=>m[1]);
    assert.deepEqual(selected,[label],`Correct current tab at ${page+ending}`);
    assert.equal((html.match(/<nav class="pgm-tabs"[\s\S]*?<\/nav>/)?.[0].match(/<a /g)||[]).length,4);
    assert.doesNotMatch(html,/>User profiles</);assert.match(html,/Synthetic &lt;Program&gt;/);
    if(['timetable','manage','lesson-media'].includes(page)){assert.match(html,/<h1>Manage Programs<\/h1>/);assert.match(html,/>Program List<\/a>/);assert.doesNotMatch(html,/Back to Program management|Program management<\/span>/);}else assert.match(html,new RegExp('href="/programs/\\?program='+programId+'">Back to Program management'));
  }
}
const hifzAttendance=await programHeader('/programs/attendance',true,{hifzProgramId:programId});
assert.match(hifzAttendance.headers[0].innerHTML,new RegExp('href="/programs/attendance.html\\?program='+programId+'"'));assert.doesNotMatch(hifzAttendance.headers[0].innerHTML,/#activity/,'Hifz attendance management does not recreate the deleted workspace link');
const rootView=await programHeader('/programs/');
assert.equal(rootView.requests.length,0,'The Program list uses the builder’s authorised selection without an extra request');
rootView.window.M4L_PROGRAM_MANAGEMENT_NAV.setSelection({ready:true,program:{id:programId,name:'Selected Program'},available:false});
assert.match(rootView.headers[0].innerHTML,/aria-disabled="true"/);assert.doesNotMatch(rootView.headers[0].innerHTML,/href="\/programs\/timetable/);
rootView.window.M4L_PROGRAM_MANAGEMENT_NAV.setSelection({ready:true,program:{id:programId,name:'Selected Program'},available:true});
assert.match(rootView.headers[0].innerHTML,new RegExp('href="/programs/timetable.html\\?program='+programId));
const profilesHeader=await programHeader('/users/');
assert.equal(profilesHeader.headers.length,0,'Manage Users keeps its own tab workspace');
const scopedHeader=await programHeader('/programs/manage',false);
assert.match(scopedHeader.headers[0].innerHTML,/aria-current="page">People/);
const inaccessible=await programHeader('/programs/manage',false,{programs:[]});
assert.equal(inaccessible.headers.length,0,'No Program identity or management header is inferred without access');
const nextId='PRG-22222222-2222-4222-8222-222222222222';
const switched=await programHeader('/programs/attendance',true,{programs:[{id:programId,name:'First Program',status:'ACTIVE'},{id:nextId,name:'Second Program',status:'ACTIVE'}]});
switched.window.M4L_PROGRAM_MANAGEMENT_NAV.select(nextId);await flush();
assert.equal(switched.headers.length,1);assert.match(switched.headers[0].innerHTML,/Second Program/);assert.doesNotMatch(switched.headers[0].innerHTML,new RegExp(programId));
assert.match(switched.headers[0].innerHTML,new RegExp('href="/programs/\\?program='+nextId+'">Back to Program management'));
assert.equal(switched.requests.length,1,'Switching between already authorised Programs reuses the current session’s navigation lookup');
switched.window.M4L_PROGRAM_MANAGEMENT_NAV.select('outside-access');await flush();assert.equal(switched.headers.length,0);
console.log('Program navigation: canonical and .html current tabs, unified list/timetable/people tabs, legacy tool return and scoped identity passed.');
for(const page of ['media']) {
 const html=await readFile(new URL('../../programs/'+page+'.html',import.meta.url),'utf8');
 assert.match(html,/<section class="pgm-media-card"[^>]*><p>Coming soon<\/p><\/section>/);
 assert.doesNotMatch(html,/m4l-program-attendance\.js|Submit attendance|Open public Library|My Library|Private media attachments/);
}
const timetablePage=await readFile(new URL('../../programs/timetable.html',import.meta.url),'utf8');
assert.doesNotMatch(timetablePage,/pw-name|pw-save-name|pw-program-zoom|pw-save-zoom|pw-access-model/,'Program settings live on the Program list, outside the timetable editor');
assert.match(timetablePage,/id="pw-card-editor"/,'Public card editing belongs in Timetable');
const attendancePage=await readFile(new URL('../../programs/attendance.html',import.meta.url),'utf8');
assert.match(attendancePage,new RegExp('m4l-program-attendance\\.js\\?v='+JSON.parse(await readFile(new URL('../../version.json',import.meta.url),'utf8')).version.replaceAll('.','\\.')));
assert.match(attendancePage,/id="pa-classes"/);assert.doesNotMatch(attendancePage,/Coming soon/);
console.log('Program Library stays Coming soon; Attendance loads its real editor; timetable owns the public card and omits duplicated Program settings.');

for(const file of ['programs/library.html','programs/library-view.html']){const html=await readFile(new URL('../../'+file,import.meta.url),'utf8');assert.match(html,/Private Library media is not available yet/);assert.match(html,/href="\/academy\/"/);}
