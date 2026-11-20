import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../js/m4l-academy-read-cache.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const window=new EventTarget(),proofs=new WeakMap();
 let state={state:'UNLOCKED',context:{app:'academy',sub:'synthetic-account',sid:'session',psid:'parent',bsid:'browser',bv:1,ce:1,ae:0,le:0,sv:1,ue:0},viewVersion:1,suspended:false,validationRequired:false,authorityReady:true,replacementRequired:false},workspace='LEARN';
 const stamp=()=>JSON.stringify([state.context,state.viewVersion,state.state,state.suspended,state.validationRequired,state.authorityReady,state.replacementRequired]);
 const client={ensureFresh:async()=>state};
 window.M4L_ACADEMY_AUTH={selected:true,ready:Promise.resolve(client),getState:()=>structuredClone(state),ownerKey:()=>JSON.stringify([state.context.sub,state.context.sid]),hasSession:()=>state.state==='UNLOCKED',isCurrentResult:value=>proofs.get(value)===stamp()};
 window.M4L_ACADEMY_WORKSPACE={current:()=>workspace,classView:()=>null};
 vm.runInNewContext(source,{window,TextEncoder,DOMException,Date,Map,WeakMap,JSON,location:{origin:'https://ummabbadacademy.app'}});
 return {cache:window.M4L_ACADEMY_READ_CACHE,tag(value){proofs.set(value,stamp());return value;},emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}));},change(update){state={...state,...update,context:{...state.context,...update.context}};},workspace(value){workspace=value;}};
}
test('unchanged full context and view purpose-bootstrap notifications do not cancel a current selected read',async()=>{
 const f=setup();let release;const pending=f.cache.load({key:['home'],fetcher:()=>new Promise(resolve=>release=()=>resolve(f.tag({success:true,items:['checked']})))});await flush();f.emit('academy-v2-context');f.emit('academy-v2-context');release();assert.deepEqual((await pending).items,['checked']);
 let requests=0;const cached=await f.cache.load({key:['home'],fetcher:()=>{requests++;return f.tag({success:true});}});assert.equal(requests,0);assert.deepEqual(cached.items,['checked']);
});
for(const [label,update,event]of[
 ['access generation',{context:{sv:2}},'academy-v2-context'],['unlock generation',{context:{ue:1}},'academy-v2-context'],['account',{context:{sub:'other-account'}},'academy-v2-context'],['same-context restored view',{viewVersion:3},'academy-v2-context'],['unavailable authority',{authorityReady:false},'academy-v2-context'],['suspension',{suspended:true},'academy-v2-context'],['mask',{},'academy-v2-mask'],['revalidation',{},'academy-v2-revalidate'],['pagehide',{},'pagehide']
])test('selected cache cancels delayed old read on '+label,async()=>{
 const f=setup();let release;const pending=f.cache.load({key:['home'],fetcher:()=>new Promise(resolve=>release=()=>resolve(f.tag({success:true})))});await flush();f.change(update);f.emit(event,{masked:true});release();await assert.rejects(pending,{name:'AbortError'});
});
test('a changed workspace cancels a delayed read without any authority event',async()=>{const f=setup();let release;const pending=f.cache.load({key:['home'],fetcher:()=>new Promise(resolve=>release=()=>resolve(f.tag({success:true})))});await flush();f.workspace('TEACH');release();await assert.rejects(pending,{name:'AbortError'});});
