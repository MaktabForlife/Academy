import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../js/m4l-academy-workspace.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const jwt=(name,expires=Date.now()+86400000)=>'header.'+Buffer.from(JSON.stringify({sub:name,exp:expires/1000})).toString('base64url')+'.signature';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};};
function screen({store=storage(),owner=jwt('admin'),now=Date.now(),fetcher}={}){
 let current=owner,clock=now;const calls=[],events=new EventTarget(),location={pathname:'/academy/courses/manage/',hash:'',search:'',href:'https://academy.test/academy/courses/manage/',origin:'https://academy.test',replace(v){this.destination=v;}};
 const window={M4L_CONFIG:{API_BASE:'https://api.test'},sessionStorage:store,fetch:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json({success:true,account:{displayName:JSON.parse(Buffer.from(current.split('.')[1],'base64url').toString()).sub},contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}],token:'must-not-be-stored'});},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 class Clock extends Date{static now(){return clock;}}
 vm.runInNewContext(code,{window,location,localStorage:{getItem:()=>current},document:{addEventListener(){}},crypto:webcrypto,TextEncoder,Uint8Array,atob,Date:Clock,URL,URLSearchParams,Request,Response,Headers,DOMException,Event});
 const read=()=>window.fetch('https://api.test/api/account/session',{method:'POST',headers:{Authorization:'Bearer '+current},body:'{}'});
 return {read,window,calls,store,owner,clock:v=>clock=v,switch:v=>{current=v;events.dispatchEvent(new Event('m4l-academy-session'));}};
}
test('header, Participants and Admin page share one verification and reuse it on return for twelve hours',async()=>{
 const f=screen();const [header,participants]=await Promise.all([f.read(),f.read(),f.window.M4L_ACADEMY_WORKSPACE.readyAccess()]);assert.equal(f.calls.length,1);assert.equal((await header.json()).account.displayName,(await participants.json()).account.displayName);
 await f.read();assert.equal(f.calls.length,1);const raw=f.store.getItem('m4l_account_view_v1');assert(!raw.includes(f.owner));assert(!raw.includes('must-not-be-stored'));
 const returned=screen({store:f.store,owner:f.owner,now:Date.now()+11*3600000});await returned.read();assert.equal(returned.calls.length,0,'returning page reads metadata without another account lookup');
 returned.clock(Date.now()+12*3600000+1000);await returned.read();assert.equal(returned.calls.length,1);
});
test('metadata expires at the existing signed session deadline and is discarded on account switching/sign-out',async()=>{
 const now=Date.now(),f=screen({owner:jwt('short',now+3600000),now});await f.read();f.clock(now+3600001);await f.read();assert.equal(f.calls.length,2);
 f.switch(jwt('student'));const data=await (await f.read()).json();assert.equal(data.account.displayName,'student');assert.equal(f.calls.length,3);f.switch('');assert.equal(f.store.getItem('m4l_account_view_v1'),null);
});
test('known denial and sensitive rights changes clear saved account metadata; read-only Participants does not',async()=>{
 const f=screen({fetcher:async(url,opts)=>url.endsWith('/api/account/session')?Response.json({success:true,contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]}):Response.json({success:true},{status:url.endsWith('/denied')?403:200})});await f.read();
 await f.window.fetch('https://api.test/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({command:{action:'read'}})});await f.read();assert.equal(f.calls.filter(c=>c.url.endsWith('/api/account/session')).length,1);
 await f.window.fetch('https://api.test/api/admin/platform/studio-access',{method:'POST',body:JSON.stringify({command:{action:'save'}})});assert.equal(f.store.getItem('m4l_account_view_v1'),null);await f.read();
 await f.window.fetch('https://api.test/api/denied');assert.equal(f.store.getItem('m4l_account_view_v1'),null);await f.read();assert.equal(f.calls.filter(c=>c.url.endsWith('/api/account/session')).length,3);
});
test('delayed account replies cannot populate another account or survive an explicit revocation event',async()=>{
 let release;const f=screen({fetcher:()=>new Promise(r=>{release=()=>r(Response.json({success:true,contexts:[]}));})});const old=f.read();await flush();assert(release);f.switch(jwt('other'));release();await assert.rejects(old,{name:'AbortError'});assert.equal(f.store.getItem('m4l_account_view_v1'),null);
 const g=screen();const delivered=await g.read();g.switch(jwt('later'));await assert.rejects(delivered.json(),{name:'AbortError'});await g.read();g.window.dispatchEvent(new Event('m4l-academy-session-ended'));assert.equal(g.store.getItem('m4l_account_view_v1'),null);await g.read();assert.equal(g.calls.length,3);
});
test('temporary failures are not persisted or retried in the background',async()=>{
 let status=503;const f=screen({fetcher:async()=>Response.json({success:status===200,contexts:[]},{status})});assert.equal((await f.read()).status,503);assert.equal(f.store.getItem('m4l_account_view_v1'),null);assert.equal(f.calls.length,1);status=200;assert.equal((await f.read()).status,200);await f.read();assert.equal(f.calls.length,2);
});

test('all standalone sign-out paths remove the private account metadata copy',()=>{for(const file of ['m4l-academy-navigation.js','m4l-academy-login.js','m4l-account.js'])assert.match(readFileSync(new URL('../../js/'+file,import.meta.url),'utf8'),/sessionStorage\.removeItem\(['"]m4l_account_view_v1['"]\)/);});
test('native profile, scope and subscription changes invalidate metadata while a register read reuses it',async()=>{
 const f=screen();await f.read();for(const path of ['user-profiles/save','global/access/save','program-monthly-subscriptions/grid-save','program-monthly-subscriptions/surah-grants-save','courses/publish','program-timetable/publish']){
  await f.window.fetch('https://api.test/api/admin/platform/'+path,{method:'POST',body:'{}'});assert.equal(f.store.getItem('m4l_account_view_v1'),null,path);await f.read();
 }
 const count=f.calls.length;await f.window.fetch('https://api.test/api/admin/platform/program-monthly-subscriptions/grid',{method:'POST',body:'{}'});await f.read();assert.equal(f.calls.length,count+1);
});
