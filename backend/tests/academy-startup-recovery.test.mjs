import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const script=readFileSync(new URL('../../js/m4l-academy-startup.js',import.meta.url),'utf8');
function page({connector=false,admin=false,hash}={}){
 const file=connector?'academy/website-platform/connect/index.html':admin?'academy/admin/index.html':'academy/index.html';
 const {window,document}=parseHTML(readFileSync(new URL('../../'+file,import.meta.url),'utf8'));
 const timers=new Map();let sequence=0,token='synthetic-current-session',reloads=0,focuses=0,closes=0;
 const location={origin:'https://academy.test',pathname:connector?'/academy/website-platform/connect/':'/academy/'+(admin?'admin/':''),hash:hash??(connector?'':'#activity/PROGRAM/synthetic/learn'),reload(){reloads++;}};
 window.opener={closed:false,focus(){focuses++;}};window.close=()=>closes++;
 vm.runInNewContext(script,{window,document,location,localStorage:{getItem:()=>token},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 return {window,document,location,timers,token:value=>token=value,get reloads(){return reloads;},get focuses(){return focuses;},get closes(){return closes;}};
}
test('a stalled programme load ends with a visible manual retry and keeps private views guarded',()=>{
 for(const admin of [false,true]){
  const p=page({admin}),timer=[...p.timers.values()][0];assert(timer,'Startup must have a bounded wait');assert.equal(timer.ms,30000);timer.fn();
  assert(p.document.documentElement.classList.contains('academy-opening-failed'));
  assert(p.document.documentElement.classList.contains('academy-opening'),'Unverified content must remain hidden');
  assert.match(p.document.getElementById('academy-startup-error').textContent,/taking longer/i);
  p.document.getElementById('academy-startup-retry').click();assert.equal(p.reloads,1);
 }
});
test('a known 503 is shown inside the loading panel without another request or an automatic retry',()=>{
 const p=page();p.window.M4L_ACADEMY_STARTUP.fail('The timetable service is temporarily unavailable.');
 assert.equal(p.document.getElementById('academy-startup-error').textContent,'The timetable service is temporarily unavailable.');
 assert.equal(p.document.getElementById('academy-startup-retry').textContent,'Try again');assert.equal(p.reloads,0);assert.equal(p.timers.size,0);
 p.window.M4L_ACADEMY_STARTUP.begin();assert(p.document.documentElement.classList.contains('academy-opening-failed'),'Unrelated same-route work must not hide the failure');
});
test('Admin access and other management deep links also have a bounded guarded startup',()=>{
 for(const hash of ['#administration/access','#administration/users','#assessment-admin','#progress-admin']){
  const p=page({admin:true,hash});assert(p.window.M4L_ACADEMY_STARTUP.entry());assert.equal(p.timers.size,1);[...p.timers.values()][0].fn();assert(p.document.documentElement.classList.contains('academy-opening-failed'));assert(p.document.getElementById('academy-startup-retry'));
 }
});
test('completed and superseded account/navigation loads cannot be failed by an old timeout',()=>{
 const p=page(),old=[...p.timers.values()][0].fn;p.window.M4L_ACADEMY_STARTUP.complete();old();assert(!p.document.documentElement.classList.contains('academy-opening'));
 p.window.M4L_ACADEMY_STARTUP.begin();const other=[...p.timers.values()][0].fn;p.token('synthetic-other-session');p.window.M4L_ACADEMY_STARTUP.begin();other();assert(!p.document.documentElement.classList.contains('academy-opening-failed'));
 p.window.M4L_ACADEMY_STARTUP.fail();p.window.M4L_ACADEMY_STARTUP.begin({force:true});assert(!p.document.documentElement.classList.contains('academy-opening-failed'));
});
test('connector recovery returns to the existing dashboard without replaying its one-use handoff',()=>{
 const p=page({connector:true});p.window.M4L_ACADEMY_STARTUP.fail('Academy is temporarily unavailable.');
 assert.equal(p.document.getElementById('academy-startup-retry').textContent,'Return to dashboard');p.document.getElementById('academy-startup-retry').click();
 assert.equal(p.focuses,1);assert.equal(p.closes,1);assert.equal(p.reloads,0);
});
test('the real connector reports an initial configuration 503 as a recoverable failure',async()=>{
 const p=page({connector:true}),calls=[];
 const connect=readFileSync(new URL('../../academy/website-platform/connect/connect.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'');
 await vm.runInNewContext('(async()=>{'+connect+'})()',{window:p.window,document:p.document,location:p.location,fetch:async url=>{calls.push(url);return {ok:false,json:async()=>({error:'Academy service is temporarily unavailable.'})};}});
 assert.equal(calls.length,1);assert(p.document.documentElement.classList.contains('academy-opening-failed'));assert.equal(p.document.getElementById('academy-startup-error').textContent,'Academy service is temporarily unavailable.');
});
test('an actual account-service 503 preserves the sign-in and displays recovery inside the guarded panel',async()=>{
 const p=page({admin:true,hash:'#administration/access'}),calls=[],stored=new Map([['m4l_account_token','synthetic-current-session']]);
 p.window.M4L_CONFIG={API_BASE:'https://api.test'};p.window.location=p.location;
 const login=readFileSync(new URL('../../js/m4l-academy-login.js',import.meta.url),'utf8');
 vm.runInNewContext(login,{window:p.window,document:p.document,Event,localStorage:{getItem:key=>stored.get(key)||null},sessionStorage:{getItem:()=>null},fetch:async url=>{calls.push(url);return {ok:false,status:503,json:async()=>({success:false,error:'Synthetic outage'})};}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1);assert.equal(stored.get('m4l_account_token'),'synthetic-current-session');
 assert.equal(p.window.M4L_ACADEMY_LOGIN.currentId(),'');assert(p.document.documentElement.classList.contains('academy-opening-failed'));
 assert.match(p.document.getElementById('academy-startup-error').textContent,/temporarily unavailable.*sign-in is saved/i);assert(p.document.getElementById('academy-startup-retry'));
});
