import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8');
const workspace=read('m4l-academy-workspace.js'),announcements=read('m4l-academy-announcements.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const handlers=new Map(),calls=[],attributes=new Map(),button={};let token='actor-one';
 const box={innerHTML:'',setAttribute:(name,value)=>attributes.set(name,value),querySelector:()=>button,querySelectorAll:()=>[]};
 const location={pathname:'/academy/',hash:'#overview',search:'',origin:'https://academy.invalid',href:'https://academy.invalid/academy/#overview'};
 const window={M4L_CONFIG:{API_BASE:'https://api.invalid',ACCEPTED_SETUP:true},M4L_ANNOUNCEMENT_LINKS:{render:s=>s},
  addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);},
  dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);},
  fetch:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}))};
 const context={window,location,fetch:(...args)=>window.fetch(...args),localStorage:{getItem:()=>token},document:{readyState:'complete',addEventListener(){},getElementById:()=>box},crypto,URL,URLSearchParams,Request,Response,Headers,DOMException,Event};
 vm.runInNewContext(workspace,context);vm.runInNewContext(announcements,context);
 return {window,location,box,button,attributes,calls,token:value=>{token=value;}};
}
test('a slow first announcement load survives session restoration and keeps loading visible',async()=>{
 const f=fixture();assert.match(f.box.innerHTML,/Loading announcements…/);assert.equal(f.attributes.get('aria-busy'),'true');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.invalid/api/academy/announcements');
 assert.equal(f.calls[0].options.credentials,'omit');
 f.token('restored-actor');f.window.dispatchEvent(new Event('m4l-academy-session'));
 f.calls[0].resolve(Response.json({success:true,announcements:[{title:'Academy update'}]}));await tick();
 assert.match(f.box.innerHTML,/Open announcement: Academy update/);assert.doesNotMatch(f.box.innerHTML,/could not be loaded|Loading announcements/);assert.equal(f.attributes.get('aria-busy'),'false');
});
test('a failed request offers retry, which replaces the error with loading until the response arrives',async()=>{
 const f=fixture();f.calls[0].reject(new TypeError('Network unavailable'));await tick();
 assert.match(f.box.innerHTML,/Announcements could not be loaded/);assert.match(f.box.innerHTML,/Try again/);assert.equal(f.attributes.get('aria-busy'),'false');
 const pending=f.button.onclick();assert.match(f.box.innerHTML,/Loading announcements…/);assert.doesNotMatch(f.box.innerHTML,/could not be loaded|Try again/);assert.equal(f.attributes.get('aria-busy'),'true');
 f.calls[1].resolve(Response.json({success:true,announcements:[]}));await pending;
 assert.match(f.box.innerHTML,/No announcements at the moment/);assert.equal(f.attributes.get('aria-busy'),'false');
});
test('an older failed response cannot overwrite a newer successful announcement refresh',async()=>{
 const f=fixture(),pending=f.window.M4L_ANNOUNCEMENTS.refreshPublic();
 f.calls[1].resolve(Response.json({success:true,announcements:[{title:'Latest update'}]}));await pending;
 f.calls[0].reject(new TypeError('Old request failed'));await tick();
 assert.match(f.box.innerHTML,/Open announcement: Latest update/);assert.doesNotMatch(f.box.innerHTML,/could not be loaded/);assert.equal(f.attributes.get('aria-busy'),'false');
});
test('invalid announcement data becomes a retryable error rather than a false empty state',async()=>{
 const f=fixture();f.calls[0].resolve(Response.json({success:true}));await tick();
 assert.match(f.box.innerHTML,/Announcements could not be loaded/);assert.match(f.box.innerHTML,/Try again/);assert.equal(f.attributes.get('aria-busy'),'false');
});
