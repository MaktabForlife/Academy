import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,readdirSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../../js/m4l-academy-read-cache.js',import.meta.url),'utf8');
const hint=(extra={})=>({success:true,cacheRefreshPending:['public-timetable'],...extra});
function fixture(fetcher=async()=>Response.json({success:true,completed:['public-timetable'],pending:false})){
 let token='current-account',realm='ADMIN',head='accepted-one';const events=[],calls=[],timers=new Map(),handlers=new Map();let timerId=0;
 const window={M4L_CONFIG:{API_BASE:'https://api.invalid'},M4L_ACADEMY_WORKSPACE:{current:()=>realm,classView:()=>null,head:()=>head,readyPublication:async()=>head},
  addEventListener:(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},dispatchEvent:event=>{events.push(event.type);for(const fn of handlers.get(event.type)||[])fn(event);},
  fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}};
 vm.runInNewContext(source,{window,localStorage:{getItem:()=>token},location:{origin:'https://site.invalid'},crypto:webcrypto,TextEncoder,Uint8Array,Intl,DOMException,Promise,Event,AbortController,
  setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 return {window,calls,events,timers,refresh:window.M4L_REFRESH_AFTER_SAVE,cache:window.M4L_ACADEMY_READ_CACHE,token:value=>{token=value;},realm:value=>{realm=value;},head:value=>{head=value;},emit:name=>window.dispatchEvent(new Event(name))};
}
test('only confirmed pending work in the current Admin session makes a refresh request',async()=>{
 const f=fixture();assert.equal(f.calls.length,0,'Loading the helper adds no request');
 for(const result of [{success:true},{success:false,cacheRefreshPending:['public-timetable']},{success:true,cacheRefreshPending:['unknown']}])await f.refresh(result,'current-account');
 for(const realm of ['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH']){f.realm(realm);assert.equal((await f.refresh(hint(),'current-account')).pending,true);}
 f.realm('ADMIN');await f.refresh(hint(),'previous-account');f.token('');await f.refresh(hint());assert.equal(f.calls.length,0);
});
test('a successful refresh clears saved public metadata and announces the public snapshot update',async()=>{
 const f=fixture();let reads=0;const input={key:['public-home'],public:true,fetcher:async()=>({success:true,timezone:'Africa/Johannesburg',revision:++reads})};
 await f.cache.load(input);await f.cache.load(input);assert.equal(reads,1);
 const result=await f.refresh(hint(),'current-account');assert.equal(result.pending,false);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'https://api.invalid/api/academy/cache/refresh');assert.equal(f.calls[0].options.method,'POST');assert.equal(f.calls[0].options.headers.Authorization,'Bearer current-account');assert.equal(f.calls[0].options.body,'{}');
 assert.deepEqual(f.events,['m4l-academy-public-timetable-updated']);await f.cache.load(input);assert.equal(reads,2);assert.equal(f.timers.size,0);
});
test('the accepted publication and originating Publish response share one rebuild, including later duplicate callbacks',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,completed:['public-timetable'],pending:false}));}));
 const accepted=hint({head:'accepted-one'}),origin=hint({acceptedChange:{scope:'PROGRAM:A'},head:'accepted-one'}),first=f.refresh(accepted,'current-account');
 assert.equal(f.refresh(accepted,'current-account'),first);assert.equal(f.refresh(origin,'current-account'),first);assert.equal(f.calls.length,1);release();await first;
 await f.refresh(hint({head:'accepted-one'}),'current-account');assert.equal(f.calls.length,1,'A completed publication is not rebuilt twice');
});
test('a new save during a refresh gets one bounded follow-up; further changes stay pending without polling',async()=>{
 const releases=[];const f=fixture(()=>new Promise(resolve=>releases.push(()=>resolve(Response.json({success:true,completed:['public-timetable'],pending:false})))));
 const first=f.refresh(hint(),'current-account');const second=f.refresh(hint(),'current-account');assert.equal(first,second);assert.equal(f.calls.length,1);
 releases.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,2);
 f.refresh(hint(),'current-account');releases.shift()();assert.equal((await first).pending,true);assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
});
test('network, HTTP, unreadable and denied refreshes remain pending without turning a successful publication into a failure',async()=>{
 for(const fetcher of [async()=>{throw Error('Offline');},async()=>Response.json({success:false},{status:503}),async()=>Response.json({success:false},{status:403}),async()=>new Response('bad JSON')]){
  const f=fixture(fetcher),result=hint({head:'accepted-one'});assert.equal((await f.refresh(result,'current-account')).pending,true);assert.equal(result.success,true);assert.deepEqual(f.events,[]);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
 }
});
test('a stalled refresh times out and leaves durable recovery in charge',async()=>{
 const f=fixture((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')))));
 const pending=f.refresh(hint(),'current-account');for(const fn of [...f.timers.values()])fn();assert.equal((await pending).pending,true);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
test('sign-out, session replacement and workspace changes discard delayed refresh responses and follow-ups',async()=>{
 for(const change of [f=>{f.token('');f.emit('m4l-academy-session-ended');},f=>{f.token('replacement');f.emit('m4l-academy-session');},f=>f.realm('ADMIN_LEARN')]){
  let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,completed:['public-timetable'],pending:false}));}));
  const pending=f.refresh(hint(),'current-account');f.refresh(hint(),'current-account');change(f);release();assert.equal((await pending).pending,true);assert.equal(f.calls.length,1);assert(!f.events.includes('m4l-academy-public-timetable-updated'));
 }
});
test('a later explicit response can retry a failed publication refresh',async()=>{
 let fail=true;const f=fixture(async()=>fail?Response.json({success:false},{status:503}):Response.json({success:true,completed:['public-timetable'],pending:false}));
 assert.equal((await f.refresh(hint({head:'accepted-one'}),'current-account')).pending,true);fail=false;
 assert.equal((await f.refresh(hint({head:'accepted-one'}),'current-account')).pending,false);assert.equal(f.calls.length,2);
});

test('every Academy workspace page loads the shared refresh helper once before feature scripts',()=>{
 const root=new URL('../../',import.meta.url);let pages=0;
 for(const entry of readdirSync(root,{recursive:true,withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.html')||/node_modules|\.academy-pages|\.git/.test(entry.parentPath))continue;
  const html=readFileSync(entry.parentPath+'/'+entry.name,'utf8');if(!html.includes('m4l-academy-workspace.js'))continue;
  assert.equal((html.match(/<script src="\/js\/m4l-academy-read-cache\.js\?v=/g)||[]).length,1,entry.parentPath+'/'+entry.name);pages++;
 }
 assert(pages>=27);
});
