import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createAcademyClient} from '../../../js/m4l-v111-session.mjs';
import {createBrowserSession} from '../browser-session.mjs';
import {world} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
const origin='https://ummabbadacademy.app';
class Target extends EventTarget{CustomEvent=CustomEvent;}
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;},values};};
const forbiddenStorage={getItem(){throw Error('Private native UI touched legacy plaintext storage');},setItem(){throw Error('Private native UI persisted plaintext');},removeItem(){throw Error('Private native UI changed legacy storage');},get length(){throw Error('Private native UI enumerated legacy storage');}};
async function fixture({beforeNative=null}={}){
 const f=await world(),win=new Target(),doc=new Target(),classes=new Set(),calls=[];doc.visibilityState='visible';doc.documentElement={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);},contains:name=>classes.has(name),add:name=>classes.add(name),remove:(...names)=>names.forEach(n=>classes.delete(n))}};doc.querySelector=selector=>selector==='meta[name="uaa-auth-version"]'?{content:'2'}:selector==='meta[name="uaa-app"]'?{content:'academy'}:null;
 const location={origin,href:origin+'/academy/#timetable/learn',pathname:'/academy/',hash:'#timetable/learn',search:'',hostname:'ummabbadacademy.app',assign(){},replace(){}};
 win.location=location;win.document=doc;win.fetch=async()=>{throw Error('V2 used unwrapped global fetch');};win.sessionStorage=forbiddenStorage;win.M4L_CONFIG={API_BASE:origin};
 const transport=async(url,init={})=>{const headers=new Headers(init.headers);headers.set('Origin',origin);headers.set('Sec-Fetch-Site','same-origin');const cookies=f.jar.header(origin);if(cookies)headers.set('Cookie',cookies);const request=new Request(url,{...init,headers});calls.push({path:new URL(url).pathname,method:request.method,bearer:headers.has('Authorization')});const injected=new URL(url).pathname.startsWith('/api/')&&beforeNative?await beforeNative({f,win,request}):null,response=injected||(new URL(url).pathname.startsWith('/api/')?await f.nativeHandle(request):await f.dispatch(request));f.jar.absorb(origin,response);return response;};
 const client=await createAcademyClient({factory:createBrowserSession,origin,win,doc,sessionOptions:{crypto,sessionStorage:storage(),localStorage:storage(),fetch:transport,clock:()=>f.now()*1000,monotonicClock:()=>f.now()*1000,locks:{request:async(name,options,fn)=>fn()},BroadcastChannel:null,indexedDB:null}});
 win.M4L_ACADEMY_AUTH={...client,selected:true,ready:Promise.resolve(client)};
 const context=vm.createContext({window:win,document:doc,location,localStorage:forbiddenStorage,sessionStorage:forbiddenStorage,URL,URLSearchParams,Request,Response,Headers,Event,CustomEvent,DOMException,crypto,TextEncoder,Uint8Array,Intl,Date,setTimeout,clearTimeout,console});
 const load=name=>vm.runInContext(readFileSync(new URL('../../../js/'+name,import.meta.url),'utf8'),context,{importModuleDynamically:async()=>({})});
 await client.submitPin({loginId:f.loginId,pin:'1234'});return {...f,win,doc,client,load,calls,classes,close(){client.dispose();f.close();}};
}
test('actual SDK/native account JSON uses cookie transport, leaves global fetch intact and shares checked memory reads',async()=>{
 const f=await fixture();try{const original=f.win.fetch;f.load('m4l-academy-workspace.js');f.load('m4l-academy-read-cache.js');assert.equal(f.win.fetch,original);
 const read=()=>f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());
 const data=await f.win.M4L_ACADEMY_READ_CACHE.load({key:['native-account'],fetcher:read});assert.equal(data.success,true);assert.equal(data.account.uniqueid,f.loginId);assert(f.client.isCurrentResult(data));const before=f.calls.length;
 assert.equal(await f.win.M4L_ACADEMY_READ_CACHE.load({key:['native-account'],fetcher:read}),data);assert.equal(f.calls.length,before);assert(f.calls.every(c=>!c.bearer));
 await assert.rejects(f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{Authorization:'Bearer forbidden'},body:'{}'}),{code:'V2_BEARER_FORBIDDEN'});
 }finally{f.close();}
});
test('untagged fallback and mismatched/expired native data cannot populate V2 private caches',async()=>{
 const f=await fixture();try{f.load('m4l-academy-workspace.js');f.load('m4l-academy-read-cache.js');f.load('m4l-lesson-media-cache.js');f.load('m4l-library-cache.js');
 await assert.rejects(f.win.M4L_ACADEMY_READ_CACHE.load({key:['forged'],fallback:{success:true,private:'old persisted data'},fetcher:async()=>({success:true,private:'unverified'})}),{name:'AbortError'});
 const response=await f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await response.json();
 assert.equal(f.win.M4L_LIBRARY_CACHE.write('personal:'+f.sub,data).data,data);assert.equal(f.win.M4L_LIBRARY_CACHE.read('personal:'+f.sub).data,data);
 const scope={owner:f.client.ownerKey(),workspace:'LEARN',activityKey:'PROGRAM:synthetic'};
 f.win.M4L_LESSON_MEDIA_CACHE.write(scope,{cacheRevision:'unverified'},null);assert.equal(f.win.M4L_LESSON_MEDIA_CACHE.read(scope,null),null);
 f.advance(901);assert.equal(f.client.isCurrentResult(data),false);assert.equal(f.win.M4L_LIBRARY_CACHE.read('personal:'+f.sub),null);
 }finally{f.close();}
});
test('pagehide masks and clears private memory; checked reveal does not invalidate newly checked data',async()=>{
 const f=await fixture();try{f.load('m4l-academy-workspace.js');f.load('m4l-academy-read-cache.js');f.load('m4l-library-cache.js');
 const read=()=>f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());const data=await read();f.win.M4L_LIBRARY_CACHE.write('personal',data);f.client.revealResult(data);assert.equal(f.win.M4L_LIBRARY_CACHE.read('personal').data,data);
 f.win.dispatchEvent(new Event('pagehide'));assert(f.classes.has('uaa-v2-private-masked'));assert.equal(f.win.M4L_LIBRARY_CACHE.read('personal'),null);
 }finally{f.close();}
});
test('media editor writes fail before network and never replay an unknown mutation',async()=>{
 const f=await fixture();try{f.load('m4l-academy-workspace.js');const before=f.calls.length;
 await assert.rejects(f.win.M4L_ACADEMY_WORKSPACE.adminFetch('/api/academy/media-playlists/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activityKey:'PROGRAM:synthetic'})},{activityKey:'PROGRAM:synthetic'}),{code:'V2_EDITOR_RECOVERY_UNAVAILABLE'});assert.equal(f.calls.length,before);
 }finally{f.close();}
});

test('an already received native response cannot be parsed into a restored or changed authority view',async()=>{
 const f=await fixture();try{f.load('m4l-academy-workspace.js');const response=await f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});f.win.dispatchEvent(new Event('pagehide'));await assert.rejects(response.json(),{name:'AbortError'});}finally{f.close();}
});

test('same-owner checked-login events and identical purpose-bootstrap do not cancel the first native accepted-head entrance request',async()=>{const f=await fixture();try{f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';f.win.M4L_CONFIG.ACCEPTED_SETUP=true;f.load('m4l-academy-workspace.js');const pending=f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/academy/entrance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'LEARN'})});f.win.dispatchEvent(new Event('m4l-academy-session'));await f.client.bootstrap({purpose:'business'});const response=await pending,data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert(f.client.isCurrentResult(data));assert(f.calls.some(call=>call.path==='/api/academy/entrance'));}finally{f.close();}});

for(const changedWorkspace of [false,true])test('workspace accepts only verified SDK read renewal without intervening navigation: '+(changedWorkspace?'navigation refused':'same workspace accepted'),async()=>{let injected=false;const f=await fixture({beforeNative:async({f,win,request})=>{if(injected)return null;injected=true;const runtime=f.runtimes.academy,cap=await runtime.authorise(request,{action:'read'});f.databases.academy.prepare('UPDATE jwt_v2_families SET authority_ready=0,cr=cr+1 WHERE sid=?').run(cap.binding.sid);if(changedWorkspace){win.location.hash='#timetable/teach';win.M4L_ACADEMY_WORKSPACE.commit();win.location.hash='#timetable/learn';win.M4L_ACADEMY_WORKSPACE.commit();}return runtime.decorate(Response.json({success:false,code:'LOCAL_TEST_READINESS_REQUIRED'},{status:409}),cap);}});try{f.load('m4l-academy-workspace.js');const old=f.client.getContext(),pending=f.win.M4L_ACADEMY_WORKSPACE.fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());if(changedWorkspace)await assert.rejects(pending,{name:'AbortError'});else{const value=await pending;assert.equal(value.success,true);assert(f.client.isCurrentResult(value));assert(f.client.getContext().sv>old.sv);assert.equal(f.client.getContext().sid,old.sid);}assert.equal(f.calls.filter(c=>c.path==='/api/account/session').length,2);assert(f.calls.every(c=>!c.bearer));}finally{f.close();}});
