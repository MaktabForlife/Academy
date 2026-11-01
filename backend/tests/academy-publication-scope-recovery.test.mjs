import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const workspace=readFileSync(new URL('../../js/m4l-academy-workspace.js',import.meta.url),'utf8'),cacheCode=readFileSync(new URL('../../js/m4l-academy-read-cache.js',import.meta.url),'utf8');
const settle=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(r=>setImmediate(r));}assert(predicate(),'Expected local read to start');};
function fixture(){
 const events=new Map(),storage=new Map(),heads=[],calls=[];let token='synthetic-account';
 const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size;}};
 const window={M4L_CONFIG:{ACCEPTED_SETUP:true,API_BASE:'https://api.test'},sessionStorage:store,addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);},fetch:async(url,options)=>{
  if(String(url).endsWith('/setup/head'))return new Promise(resolve=>heads.push(()=>resolve(Response.json({head:'native-current-head'}))));
  if(String(url).endsWith('/api/account/session'))return Response.json({success:true,contexts:[{scope:'PLATFORM',role:'GLOBAL_ADMIN'}]});
  calls.push(options.headers);return Response.json({success:true,timezone:'Africa/Johannesburg',selected:JSON.parse(decodeURIComponent(options.headers.get('X-Academy-Class')))});
 }};
 const location={origin:'https://academy.test',pathname:'/academy/admin/',hash:'#activity/PROGRAM/programme-one/learn',search:'',href:'https://academy.test/academy/admin/#activity/PROGRAM/programme-one/learn'};
 const context=vm.createContext({window,document:{addEventListener(){}},location,localStorage:{getItem:()=>token},crypto,TextEncoder,Uint8Array,Date,Intl,URL,URLSearchParams,Headers,Request,Response,DOMException,Event,console});
 vm.runInContext(workspace,context);vm.runInContext(cacheCode,context);
 const w=window.M4L_ACADEMY_WORKSPACE,cache=window.M4L_ACADEMY_READ_CACHE;
 return {window,w,heads,calls,read:()=>cache.load({key:['activity','programme-one'],fetcher:async()=>{const response=await window.fetch('https://api.test/api/academy/entrance',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'});return response.json();}})};
}
test('a new Admin Learn class read does not reuse a superseded publication promise',async()=>{
 const f=fixture(),old=f.read();const oldSettled=old.then(value=>({value}),error=>({error}));await settle(()=>f.heads.length===1);
 f.w.studentClass({activityKey:'PROGRAM:programme-one',classId:'class-one'});const current=f.read();await settle(()=>f.heads.length===2);f.heads[0]();assert.equal((await oldSettled).error.name,'AbortError');
 f.heads[1]();const value=await current;assert.equal(value.selected.classId,'class-one');assert.equal(f.calls.length,1);assert.equal(f.calls[0].get('X-Academy-Workspace'),'ADMIN_LEARN');
});
test('an older publication settlement cannot clear the current class job or cause duplicate reads',async()=>{
 const f=fixture(),old=f.read().catch(error=>error);await settle(()=>f.heads.length===1);f.w.studentClass({activityKey:'PROGRAM:programme-one',classId:'class-two'});const current=f.read();await settle(()=>f.heads.length===2);f.heads[0]();await old;
 const same=f.read();await new Promise(r=>setImmediate(r));assert.equal(f.heads.length,2,'Same class reads coalesce while old job is settling');f.heads[1]();assert.equal((await current).selected.classId,'class-two');assert.equal((await same).selected.classId,'class-two');assert.equal(f.calls.length,1);
});
