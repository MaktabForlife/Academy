import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const startup=readFileSync(new URL('../../js/m4l-academy-startup.js',import.meta.url),'utf8'),entrance=readFileSync(new URL('../../js/m4l-academy-entrance.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
async function fixture({path='/academy/',mode='learn',cacheFailure=false}={}){
 const html=readFileSync(new URL('../../academy/'+(path.includes('/admin/')?'admin/':'')+'index.html',import.meta.url),'utf8'),{window,document}=parseHTML(html),home=deferred(),activity=deferred(),nextHome=deferred(),storage=new Map([['m4l_account_token','synthetic-current']]),calls=[];
 for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{value:select.value||'',writable:true,configurable:true});
 const location={pathname:path,hash:'#activity/PROGRAM/programme-one/'+mode,search:'',origin:'https://academy.test',replace(value){this.replaced=value;},assign(value){this.assigned=value;}};
 const workspace=path.includes('/admin/')?'ADMIN_'+mode.toUpperCase():mode.toUpperCase();
 window.M4L_CONFIG={API_BASE:'https://academy.test'};window.M4L_ACADEMY_WORKSPACE={current:()=>workspace,audience:()=>mode.toUpperCase(),adminRealm:()=>path.includes('/admin/'),adminAccess:()=>true,commit:()=>false,canonical:()=>'',classView:()=>null,head:()=>null,homeUrl:()=>path+'#dashboard'};
 window.M4L_ACADEMY_LOGIN={currentId:()=>storage.has('m4l_account_token')?'student':''};window.requestAnimationFrame=()=>0;
 window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.scrollTo=function(){};window.HTMLElement.prototype.scrollBy=function(){};window.HTMLElement.prototype.close=function(){this.open=false;};
 const row={id:'programme-one',kind:'PROGRAM',name:'Aalimiyah',active:true,lifecycle:'ACTIVE',roles:['STUDENT'],classes:[],curriculum:[],timetable:[],tools:{}};
 const data={success:true,signedIn:true,globalAdmin:false,workspaceAccess:{learn:true,teach:mode==='teach'},profile:{name:'Synthetic learner'},startDate:'2026-11-01',endDate:'2026-11-07',timezone:'Africa/Johannesburg',activities:[row],personalActivities:[row],activityPages:[],personalTimetable:[],timetable:[],calendarEvents:[],warnings:[]};
 const request=async(_url,options={})=>{const body=JSON.parse(options.body||'{}');calls.push(body);if(_url.endsWith('/api/academy/entrance/public-snapshot'))return {ok:true,status:200,json:async()=>({...data,signedIn:false,personalActivities:[]})};const value=await (options.headers?.Authorization==='Bearer another-synthetic-account'?nextHome.promise:body.id?activity.promise:home.promise);return {ok:true,status:200,json:async()=>value};};
 if(cacheFailure)window.M4L_ACADEMY_READ_CACHE={owner:async()=> 'synthetic-owner',headers:()=>({}),publicUrl:value=>value,invalidate(){},async load(options){try{return await options.fetcher();}catch(error){options.onError?.(error,null);throw error;}}};
 const context=vm.createContext({window,document,location,history:{replaceState(_a,_b,hash){location.hash=hash;}},localStorage:{getItem:key=>storage.get(key)||null},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},fetch:request,Event:window.Event,URL,URLSearchParams,Headers,Date,Intl,JSON,Map,Set,WeakMap,TextEncoder,crypto,console,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true})});
 vm.runInContext(startup,context);vm.runInContext(entrance,context);window.dispatchEvent(new window.Event('m4l-academy-session'));await settle();
 return {document,window,location,storage,calls,data,row,home,activity,context};
}
test('programme route is guarded in the head before the initially active legacy overview can paint',()=>{
 for(const file of ['academy/index.html','academy/admin/index.html']){
  const html=readFileSync(new URL('../../'+file,import.meta.url),'utf8');assert(html.indexOf('m4l-academy-startup.js')<html.indexOf('<body'));assert.match(html,/<section id="overview" class="view active"/);
 }
 const css=readFileSync(new URL('../../css/m4l-academy-home.css',import.meta.url),'utf8');assert.match(css,/\.academy-opening \.container>\.view\{display:none!important\}/);assert.match(css,/academy-opening-programme:not\(\.academy-opening-failed\) #academy-startup\{position:fixed;inset:0/);
});
test('personal and inherited Admin Learn/Teach programme entry stays neutral until the requested activity finishes',async()=>{
 for(const path of ['/academy/','/academy/admin/'])for(const mode of ['learn','teach']){
  const f=await fixture({path,mode});assert(f.document.documentElement.classList.contains('academy-opening'));assert(f.document.documentElement.classList.contains('academy-opening-programme'));
  f.home.resolve(f.data);await settle();assert(f.document.documentElement.classList.contains('academy-opening'),'A home snapshot must not reveal a different page');
  f.activity.resolve({...f.data,activity:f.row});await settle();assert.equal(f.document.documentElement.classList.contains('academy-opening'),false);assert.equal(f.document.getElementById('activity-title').textContent,'Aalimiyah');assert(f.document.getElementById('activity').classList.contains('active'));assert(!f.document.getElementById('overview').classList.contains('active'));assert.equal(f.location.hash,'#activity/PROGRAM/programme-one/'+mode);
 }
});
test('an unavailable programme displays its own error, and a cache failure offers retry without exposing the old home',async()=>{
 for(const cacheFailure of [false,true]){
  const f=await fixture({cacheFailure});f.home.resolve(f.data);await settle();f.activity.reject(Error('Synthetic programme unavailable'));await settle();
  assert(!f.document.getElementById('overview').classList.contains('active'));
  if(cacheFailure){assert(f.document.documentElement.classList.contains('academy-opening-failed'));assert.equal(f.document.getElementById('entrance-retry').hidden,false);assert.match(f.document.getElementById('entrance-message').textContent,/unavailable/);}
  else {assert(!f.document.documentElement.classList.contains('academy-opening'));assert.equal(f.document.getElementById('activity-title').textContent,'Activity unavailable');}
 }
});
test('a delayed earlier programme cannot uncover the page after the account changes',async()=>{
 const f=await fixture();f.home.resolve(f.data);await settle();f.storage.set('m4l_account_token','another-synthetic-account');f.window.dispatchEvent(new f.window.Event('m4l-academy-session'));f.activity.resolve({...f.data,activity:f.row});await settle();assert.notEqual(f.document.getElementById('activity-title').textContent,'Aalimiyah');assert(f.document.documentElement.classList.contains('academy-opening'));
});
test('the checked connector uses the same neutral learning presentation without replacing its one-use exchange',()=>{
 const html=readFileSync(new URL('../../academy/website-platform/connect/index.html',import.meta.url),'utf8');assert.match(html,/academy-opening academy-opening-programme/);assert.match(html,/Opening your learning/);assert.match(html,/id="status" role="status"/);assert.match(html,/src="connect.mjs\?v=/);
});
