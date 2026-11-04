import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const nativeCode=readFileSync(new URL('../../js/m4l-circles-native.js',import.meta.url),'utf8');
const shellCode=readFileSync(new URL('../../js/m4l-academy-mobile.js',import.meta.url),'utf8'),returnCode=readFileSync(new URL('../../academy/website-platform/circles-return.mjs',import.meta.url),'utf8').replace(/export function /g,'function ');
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
function fixture({native=true,signed=true,global=true,teacher=false,verified=true,mode='ADMIN_TEACH'}={}){
 const attr=native?'data-academy-tab':'data-shell-role';
 const {window,document}=parseHTML('<html><head><title>Programme</title></head><body><div class="app"><aside class="sidebar"><a class="brand" href="/academy/">Academy</a></aside></div><section '+(native?'id="academy-home-card"':'')+'><div class="academy-role-tabs">'+['learn','teach','admin'].map(key=>'<button '+attr+'="'+key+'" hidden>OLD '+key+'</button>').join('')+'<a class="academy-dashboard-home-link">Dashboard</a></div></section></body></html>');
 let current=mode,token='sample-token',clock=Date.now(),returnValue=null;const navigations=[];
 const location={pathname:native?'/academy/admin/':'/academy/library/',hash:native?'#activity/PROGRAM/example/teach':'',origin:'https://academy.test',get href(){return navigations.at(-1)||'https://academy.test'+this.pathname+this.hash;},set href(value){navigations.push(value);},assign(value){navigations.push(value);},replace(value){navigations.push(value);}};
 window.M4L_ACADEMY_WORKSPACE={current:()=>current,audience:()=>current.replace('ADMIN_',''),adminRealm:()=>current==='ADMIN'||current.startsWith('ADMIN_'),adminAccess:()=>verified,homeUrl:()=>'/academy/#dashboard'};
 const data={signedIn:signed,globalAdmin:global,profile:{name:'Sample user'},workspaceAccess:{learn:true,teach:teacher},workspaceRoles:global?['GLOBAL_ADMIN']:teacher?['TEACHER']:['STUDENT'],personalActivities:[]};
 window.M4L_ACADEMY_SHELL_DATA=data;window.M4L_CONFIG={PORTAL_ORIGIN:'https://portal.academy.test'};
 const localStorage={getItem:()=>token},sessionStorage={getItem:()=>returnValue,removeItem(){returnValue=null;}};
 class Clock extends Date{static now(){return clock;}}
 const context=vm.createContext({window,document,location,localStorage,sessionStorage,Date:Clock,URL,URLSearchParams,MutationObserver:class{observe(){}},crypto,TextEncoder,console});
 delete window.M4L_CIRCLES_NATIVE;vm.runInContext(nativeCode,context);vm.runInContext(shellCode,context);
 return {window,document,location,navigations,data,buttons:[...document.querySelectorAll('button')],setMode(value){current=value;window.M4L_ACADEMY_SHELL.update(data);},setToken(value){token=value;},setClock(value){clock=value;},async connect(value){returnValue=JSON.stringify(value);vm.runInContext(returnCode,context);await settle();}};
}

test('native programme and standalone tool headers have one plain Learn/Teach/Admin row with current view highlighted',()=>{
 for(const native of [true,false]){
  const f=fixture({native});assert.deepEqual(f.buttons.filter(b=>!b.hidden).map(b=>b.textContent),['Learn','Teach','Admin']);assert.equal(f.buttons[1].getAttribute('aria-pressed'),'true');assert.equal(f.document.querySelector('.academy-dashboard-home-link'),null);
  f.setMode('ADMIN');assert.equal(f.buttons[2].getAttribute('aria-pressed'),'true');assert.equal(f.buttons[1].getAttribute('aria-pressed'),'false');
 }
});

test('native availability hides unauthorised selectors, including an unverified Admin address',()=>{
 const student=fixture({global:false,mode:'LEARN'});assert.deepEqual(student.buttons.filter(b=>!b.hidden).map(b=>b.textContent),['Learn']);assert.equal(student.window.M4L_ACADEMY_SHELL.openRole('admin'),false);assert.deepEqual(student.navigations,[]);
 const teacher=fixture({global:false,teacher:true,mode:'TEACH'});assert.deepEqual(teacher.buttons.filter(b=>!b.hidden).map(b=>b.textContent),['Learn','Teach']);
 for(const f of [fixture({verified:false}),fixture({signed:false})])assert.equal(f.buttons.filter(b=>!b.hidden).length,0);
});

test('mode navigation keeps unsaved work guards on both connected returns and native fallback',()=>{
 const f=fixture();f.window.M4L_CIRCLES_RETURN={modeHref:mode=>'https://circles.test/?workspace='+mode};
 for(const key of ['M4L_CIRCLES_ACCESS','M4L_STUDIO_ACCESS','M4L_LESSON_MEDIA']){f.window[key]={canLeave:()=>false};assert.equal(f.window.M4L_ACADEMY_SHELL.openRole('learn'),false);assert.equal(f.navigations.length,0);delete f.window[key];}
 assert.equal(f.window.M4L_ACADEMY_SHELL.openRole('learn'),true);assert.equal(f.navigations.at(-1),'https://circles.test/?workspace=learn');
 delete f.window.M4L_CIRCLES_RETURN;assert.equal(f.window.M4L_ACADEMY_SHELL.openRole('admin'),true);assert.equal(f.navigations.at(-1),'https://portal.academy.test/?workspace=admin&dashboard=1');
 const tool=fixture({native:false,global:false,teacher:true,mode:'TEACH'});tool.buttons[1].click();assert.equal(tool.navigations.at(-1),'https://portal.academy.test/?workspace=teach&dashboard=1');
});

test('connected selector URLs come only from the checked account-bound return and expire on account/day boundaries',async()=>{
 const f=fixture(),owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('sample-token')))].map(b=>b.toString(16).padStart(2,'0')).join(''),now=Date.now();
 await f.connect({websiteOrigin:'https://circles.test',returnUrl:'https://circles.test/?workspace=teach',mode:'teach',owner,expiresAt:now+10000});
 for(const mode of ['learn','teach','admin'])assert.equal(f.window.M4L_CIRCLES_RETURN.modeHref(mode),'https://circles.test/?workspace='+mode);
 for(const bad of ['https://evil.test','admin&return=evil','',null])assert.equal(f.window.M4L_CIRCLES_RETURN.modeHref(bad),null);
 f.setToken('another-account');assert.equal(f.window.M4L_CIRCLES_RETURN.modeHref('admin'),null);f.setToken('sample-token');f.setClock(now+11000);assert.equal(f.window.M4L_CIRCLES_RETURN.modeHref('admin'),null);
});

test('a delayed return-module check cannot flash a native dashboard or leave after an account or dirty-state change',async()=>{
 for(const change of ['none','account','dirty']){
  const f=fixture(),hash=f.location.hash;let release;
  f.window.M4L_CIRCLES_RETURN_READY=new Promise(resolve=>{release=()=>{f.window.M4L_CIRCLES_RETURN={modeHref:mode=>'https://circles.test/?workspace='+mode};resolve();};});
  assert.equal(f.window.M4L_ACADEMY_SHELL.openRole('learn'),true);assert.equal(f.location.hash,hash);assert.deepEqual(f.navigations,[]);
  if(change==='account')f.setToken('different-account');if(change==='dirty')f.window.M4L_CIRCLES_ACCESS={canLeave:()=>false};
  release();await settle();assert.deepEqual(f.navigations,change==='none'?['https://circles.test/?workspace=learn']:[]);assert.equal(f.location.hash,hash);
 }
});

test('the shared theme respects hidden selectors and uses equal visible heights',()=>{
 const css=readFileSync(new URL('../../css/m4l-workspace-theme.css',import.meta.url),'utf8');
 assert(!css.includes('[data-academy-tab]){display:none!important}'));assert.match(css,/\[hidden\]\{display:none!important\}/);assert.match(css,/\):not\(\[hidden\]\).*min-height:44px/);
});
