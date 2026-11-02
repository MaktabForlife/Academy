import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const source=readFileSync(new URL('../../js/m4l-academy-page-actions.js',import.meta.url),'utf8');
test('Admin heading placement settles instead of starving account/network callbacks with its own mutations',async()=>{
 const {window,document}=parseHTML('<html><head></head><body><section id="academy-home-card"><div class="academy-account-row"></div></section><button id="academy-sign-out">Sign out</button><main><section class="view active"><div class="page-heading"><h1>Admin sign-in</h1></div></section></main></body></html>');
 window.HTMLElement.prototype.getClientRects=function(){return [{}];};
 window.M4L_ACADEMY_WORKSPACE={adminRealm:()=>true,audience:()=>'ADMIN'};
 let deliveries=0,runaway=false;const observers=[];
 class BoundedObserver{
  constructor(callback){this.inner=new window.MutationObserver(records=>{if(++deliveries>20){runaway=true;this.inner.disconnect();return;}callback(records);});observers.push(this.inner);}
  observe(...args){this.inner.observe(...args);}
 }
 try{
  vm.runInNewContext(source,{window,document,location:{pathname:'/academy/admin/',hash:'#administration/access'},URLSearchParams,MutationObserver:BoundedObserver,sessionStorage:{getItem:()=>null}}, {importModuleDynamically:()=>Promise.reject(Error('No network in this fixture'))});
  document.querySelector('main').classList.add('new-view');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(runaway,false,'Repeated class writes in the heading observer freeze the browser before fetch callbacks can settle');
  assert(deliveries<=3,'Stable placement must become idle');
  assert.equal(document.querySelectorAll('.academy-management-close').length,1);
  const heading=document.querySelector('.page-heading');assert(heading.classList.contains('academy-heading-with-close'));
  document.querySelector('main').classList.add('next-update');await new Promise(resolve=>setImmediate(resolve));assert.equal(runaway,false);assert.equal(document.querySelectorAll('.academy-management-close').length,1);
  const next=document.createElement('div');next.className='page-heading';heading.replaceWith(next);await new Promise(resolve=>setImmediate(resolve));assert.equal(runaway,false);assert.equal(next.querySelectorAll('.academy-management-close').length,1,'Newly rendered management headings retain the Close control');
 }finally{observers.forEach(observer=>observer.disconnect());}
});
