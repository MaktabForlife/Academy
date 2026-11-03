import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const read=path=>fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(path='/academy/',hash='#activity/PROGRAM/example/learn',{signed=false,html}={}){
 const {window,document}=parseHTML(html||read(path.includes('/admin/')?'academy/admin/index.html':'academy/index.html'));
 delete window.M4L_CIRCLES_NATIVE;delete window.M4L_CIRCLES_RETURN;
 const data=new Map(signed?[['m4l_account_token','synthetic-current']]:[]),sessionData=new Map(),calls=[],navigation=[];
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),get length(){return map.size;},key:index=>[...map.keys()][index]});
 const localStorage=storage(data),sessionStorage=storage(sessionData);
 const location={pathname:path,hash,search:'',hostname:'academy.test',origin:'https://academy.test',get href(){return this.origin+this.pathname+this.search+this.hash;},assign:url=>navigation.push(url),replace:url=>navigation.push(url),reload:()=>navigation.push('reload')};
 window.location=location;window.localStorage=localStorage;window.sessionStorage=sessionStorage;
 const history={replaceState(_a,_b,value){if(value!=null){const url=new URL(String(value),location.href);location.hash=url.hash;location.search=url.search;location.pathname=url.pathname;}},pushState(...args){this.replaceState(...args);}};
 for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{value:select.value||'',writable:true,configurable:true});
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};window.HTMLElement.prototype.focus=function(){};
 const mode=hash.includes('/teach')?'TEACH':path.includes('/admin/')?'ADMIN':'LEARN';
 window.M4L_ACADEMY_WORKSPACE={current:()=>mode,audience:()=>mode==='ADMIN'?'LEARN':mode,adminRealm:()=>mode==='ADMIN',preferHubAudience(){},commit(){}};
 window.M4L_CONFIG={API_BASE:'https://api.test'};
 let respond=async(url,options)=>({success:true,token:'synthetic-new',sessionStore:'D1',account:{uniqueid:'TEST',displayName:'Test account',pinsetup:true},contexts:[{scope:'COURSE',role:'STUDENT',courseId:'example'}]});
 const context=vm.createContext({window,document,location,history,localStorage,sessionStorage,DOMParser:window.DOMParser,Event:window.Event,DOMException,URL,URLSearchParams,Headers,Response,TextEncoder,crypto,btoa,atob,Date,Intl,JSON,Map,Set,WeakMap,console,setTimeout,clearTimeout,fetch:async(url,options={})=>{calls.push({url,options});const result=await respond(url,options);return {ok:result.success!==false,status:result.status||200,json:async()=>result,text:async()=>result.body||JSON.stringify(result)};}});
 vm.runInContext(read('js/m4l-circles-native.js'),context);
 return {window,document,location,history,context,data,sessionData,calls,navigation,setResponder:fn=>respond=fn};
}

test('old public and dashboard bookmarks enter only canonical Circles; route helper makes zero requests',()=>{
 for(const [hash,expected]of [['#overview','https://maktab4life.org/?workspace=learn&dashboard=1'],['#dashboard','https://maktab4life.org/?workspace=learn&dashboard=1'],['#about','https://maktab4life.org/?public=1#academy-story'],['#contact','https://maktab4life.org/?public=1#contact'],['#prospectus','https://maktab4life.org/prospectus-2027.html'],['#workshops','https://maktab4life.org/studio/?view=collections&collection=courses']]){
  const f=fixture('/academy/',hash);assert.equal(f.window.M4L_CIRCLES_NATIVE.routeEntry(),true);assert.equal(f.navigation.at(-1),expected);assert.equal(f.calls.length,0);
 }
});
test('unknown and hostile hashes show Circles recovery without loading an old screen or external return',()=>{
 for(const hash of ['#unknown','#activity/PROGRAM/x/admin','#administration/../../https://evil.test','#https://evil.test']){
  const f=fixture('/academy/',hash);assert.equal(f.window.M4L_CIRCLES_NATIVE.routeEntry(),true);assert.match(f.document.getElementById('circles-native-recovery').textContent,/no longer available/);assert.equal(f.navigation.length,0);assert.equal(f.calls.length,0);
 }
});
test('current tool bookmarks retain exact workspace, case-sensitive identity and subtool',()=>{
 for(const hash of ['#activity/COURSE/Course-AbC/learn/assessment','#activity/PROGRAM/Programme-AbC/teach/planning','#administration/access','#administration/media/PROGRAM/Programme-AbC','#progress','#assessment-admin/PROGRAM/Programme-AbC','#timetable/teach']){
  const f=fixture('/academy/',hash);assert.equal(f.window.M4L_CIRCLES_NATIVE.routeEntry(),false);assert.equal(f.location.hash,hash);assert.equal(f.navigation.length,0);
 }
});
test('actual trimmed Learn/Teach/Admin HTML supports checked sign-in without losing the requested tool',async()=>{
 for(const [path,hash]of [['/academy/','#activity/PROGRAM/example/learn'],['/academy/','#activity/PROGRAM/example/teach/planning'],['/academy/admin/','#administration/announcements'],['/academy/admin/','#activity/PROGRAM/example/teach/attendance']]){
  const f=fixture(path,hash);assert(f.document.getElementById('academy-home-card'));assert(!f.document.getElementById('dashboard'));f.window.M4L_CIRCLES_NATIVE.routeEntry();
  vm.runInContext(read('js/m4l-academy-login.js'),f.context);f.document.getElementById('demo-username').value='TEST';f.document.getElementById('demo-pin').value='1234';
  f.document.getElementById('login-preview').dispatchEvent(new f.window.Event('submit',{cancelable:true}));await settle();
  assert.equal(f.location.hash,hash);assert.equal(f.document.getElementById('demo-pin').value,'');assert.equal(f.document.getElementById('academy-header-name').textContent,'Test account');assert.equal(f.data.get('m4l_account_token'),'synthetic-new');assert.equal(f.navigation.length,0);assert.equal(f.calls.length,1);
 }
});
test('temporary restore failures retain the bookmarked tool and session with a visible manual retry',async()=>{
 const f=fixture('/academy/admin/','#administration/announcements',{signed:true});f.window.M4L_CIRCLES_NATIVE.routeEntry();
 f.setResponder(async()=>({success:false,status:503,error:'Temporarily unavailable'}));vm.runInContext(read('js/m4l-academy-login.js'),f.context);await settle();
 assert.equal(f.location.hash,'#administration/announcements');assert.equal(f.data.get('m4l_account_token'),'synthetic-current');assert.equal(f.document.getElementById('academy-session-retry').hidden,false);assert.equal(f.navigation.length,0);
});
test('expiry clears the signed-in presentation while preserving the direct bookmark for sign-in',async()=>{
 const f=fixture('/academy/','#activity/COURSE/example/learn',{signed:true});f.window.M4L_CIRCLES_NATIVE.routeEntry();
 vm.runInContext(read('js/m4l-academy-login.js'),f.context);await settle();f.window.dispatchEvent(new f.window.Event('m4l-academy-session-ended'));await settle();
 assert.equal(f.location.hash,'#activity/COURSE/example/learn');assert.equal(f.data.get('m4l_account_token'),undefined);assert.equal(f.document.getElementById('demo-pin').value,'');assert.equal(f.document.getElementById('academy-header-name').hidden,true);assert.equal(f.document.getElementById('circles-native-recovery').hidden,false);assert.equal(f.navigation.length,0);
});
test('all three extracted components retain every native tool ID and no executable full page',()=>{
 const contracts=JSON.parse(read('backend/tests/fixtures/program-component-contract.json'));
 for(const {fragment,root,requiredIds}of contracts){
  const markup=read('programs/fragments/'+fragment+'.fragment'),{document:component}=parseHTML(markup);
  assert.doesNotMatch(markup,/<(?:!doctype|html|head|body|script)\b/i);
  const actual=new Set([...component.querySelectorAll('[id]')].map(node=>node.id));
  for(const id of requiredIds)assert(actual.has(id),'missing '+id);
  assert(component.getElementById(root));assert(component.querySelector('link[rel=stylesheet]'));
 }
 const controller=read('js/m4l-program-admin.js');assert.doesNotMatch(controller,/page:'\/programs\/(?:timetable|manage|lesson-media)\.html'/);assert.match(controller,/version!==generation\|\|account!==localStorage/);
});
test('public Library opens real public rows without personal catalogue, metadata or account requests',async()=>{
 const html=read('academy/library/index.html'),f=fixture('/academy/library/','',{html});f.location.search='?view=public';let publicReads=0;
 f.window.M4L_LIBRARY_CACHE={clearPersonal(){},read:()=>null,publicList:async()=>{publicReads++;return {data:{books:[{id:'EXTERNAL:INTERNET_ARCHIVE:public-book-exact',title:'Public book',pdfUrl:'https://archive.org/download/public-book-exact/book.pdf',resourceType:'EBOOK',volumes:[]}],records:[]}};}};
 vm.runInContext(read('js/m4l-academy-library.js'),f.context);await settle();
 assert.equal(publicReads,1);assert.equal(f.calls.length,0);assert.equal(f.document.getElementById('al-content').hidden,false);assert.match(f.document.getElementById('al-results').textContent,/Public book/);assert.equal(f.document.getElementById('library-public-tab').getAttribute('aria-current'),'page');assert.equal(f.document.getElementById('al-manage-books').hidden,true);
});

test('Program tabs mount the real fragments once, keep all native controls, and preserve selected programme context',async()=>{
 const f=fixture('/programs/','',{signed:true,html:read('programs/index.html')});
 Object.defineProperty(f.document,'scripts',{get:()=>f.document.querySelectorAll('script')});
 f.window.M4L_ENROLMENT_WORKSPACE={canLeave:()=>true};f.window.M4L_STUDIO_ACCESS={canLeave:()=>true,ensure:async()=> 'ACADEMY'};
 const selected=[];f.window.M4L_PROGRAM_LESSON_MEDIA={select:id=>selected.push(id)};
 const original=f.document.body.append.bind(f.document.body);f.document.body.append=(...nodes)=>{original(...nodes);for(const node of nodes)if(node.tagName==='SCRIPT')Promise.resolve().then(()=>node.onload?.());};
 f.context.DOMParser=class{parseFromString(text){return parseHTML('<html><body>'+text+'</body></html>').document;}};
 f.setResponder(async url=>({success:true,body:read(url.replace(/^\//,''))}));
 vm.runInContext(read('js/m4l-program-admin.js'),f.context);
 f.window.M4L_PROGRAM_MANAGEMENT_NAV.setSelection({ready:true,program:{id:'Program-Exact',name:'Selected programme',status:'ACTIVE',revision:1},available:true});
 for(const tab of ['timetable','participants','media','timetable']){await f.window.M4L_PROGRAM_ADMIN.openTab(tab);assert(f.document.getElementById('pg-tool-message').hidden,f.document.getElementById('pg-tool-message').textContent);}
 assert.deepEqual(f.calls.map(call=>call.url),['/programs/fragments/timetable.fragment','/programs/fragments/participants.fragment','/programs/fragments/lesson-media.fragment']);
 for(const id of ['tt-board','tt-save-lesson','pm-workspace','program-lesson-media'])assert(f.document.getElementById(id),id);
 assert.deepEqual(selected,['Program-Exact']);assert.equal(new URL(f.location.href).searchParams.get('program'),'Program-Exact');
});
test('a delayed Program fragment cannot mount or load controllers after the account changes',async()=>{
 const f=fixture('/programs/','',{signed:true,html:read('programs/index.html')});let release;
 f.window.M4L_ENROLMENT_WORKSPACE={canLeave:()=>true};f.setResponder(()=>new Promise(resolve=>{release=()=>resolve({success:true,body:read('programs/fragments/timetable.fragment')});}));
 vm.runInContext(read('js/m4l-program-admin.js'),f.context);f.window.M4L_PROGRAM_MANAGEMENT_NAV.setSelection({ready:true,program:{id:'Program-Exact',name:'Selected',status:'ACTIVE',revision:1},available:true});
 const pending=f.window.M4L_PROGRAM_ADMIN.openTab('timetable');await settle();f.data.set('m4l_account_token','another-account');f.window.dispatchEvent(new f.window.Event('m4l-academy-session'));release();await pending;
 assert.equal(f.document.getElementById('tt-board'),null);assert(f.document.getElementById('program-workspace').hidden);assert.deepEqual(f.navigation,['reload']);
});
test('historical editor opens only a real saved revision and never replaces a missing course with a starter',async()=>{
 for(const revision of [0,4]){
  const f=fixture('/academy/course-websites/','',{signed:true,html:read('academy/course-websites/index.html')});
  f.window.M4L_ACADEMY_NAVIGATION={session:async()=>({account:{accountid:'exact-account'}})};f.window.M4L_ACADEMY_WORKSPACE.readyAccess=async()=>true;
  const document={id:'saved-document-exact',name:'Selected course',lessons:[],pages:{}};
  f.setResponder(async url=>url.endsWith('/list')?{success:true,websites:[{name:'Selected course',activityKey:'COURSE:Exact-Course',hasDraft:revision>0,existing:true,enabled:true}]}:{success:true,activityKey:'COURSE:Exact-Course',courseId:'Exact-Course',name:'Selected course',revision,document,assets:[]});
  f.context.esc=value=>String(value);f.context.clone=value=>structuredClone(value);f.context.AbortController=AbortController;f.context.editorModule={canLeave:()=>true,openRemote:async()=>{}};
  const code=read('academy/course-websites/admin.mjs').replace(/^import .*;$/gm,'').replace(/await import\('\.\/studio\.mjs\?v=[^']+'\)/g,'await Promise.resolve(editorModule)');
  await vm.runInContext('(async()=>{'+code+';window.testOpenHistorical=open;})()',f.context);await settle();
  if(revision)assert(f.document.querySelector('[data-open-website]'));else assert.equal(f.document.querySelector('[data-open-website]'),null);
  await f.window.testOpenHistorical('COURSE:Exact-Course');await settle();
  assert.equal(f.document.getElementById('website-editor').hidden,revision===0);
  assert.equal(f.window.COURSE_WEBSITE_ADMIN.revision(),revision);
  const drafts=await f.window.COURSE_WEBSITE_ADMIN.drafts();assert.equal(drafts.length,revision?1:0);if(revision)assert.equal(drafts[0].id,'saved-document-exact');
  assert(!f.calls.some(call=>/\/(?:save|publish|withdraw|prepared-copy)$/.test(call.url)));
 }
});
