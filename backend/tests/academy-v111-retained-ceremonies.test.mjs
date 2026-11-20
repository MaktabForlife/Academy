import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {createAcademyV2Handler} from '../src/academy/v111/native-http.mjs';
const root=new URL('../../',import.meta.url),origin='https://ummabbadacademy.app';
test('selected V111 rejects retained old login/check/website/Hifz ceremonies before native business or V1 auth can run',async()=>{
 let business=0,authorise=0;const handle=createAcademyV2Handler({getRuntime:async()=>({handle:async()=>null,authorise:async()=>{authorise++;throw Error('Unexpected authorise');}}),business:async()=>{business++;return Response.json({success:true});}});
 for(const path of ['/api/account/check','/api/account/login','/api/academy/website-studio/config','/api/academy/website-studio/handoff','/api/academy/hifz/sign-in','/api/academy/hub/studio-start','/api/website-platform/exchange']){const response=await handle(new Request(origin+path,{method:'POST',headers:{Authorization:'Bearer synthetic-retired-only'}}),{UAA_V2_ENABLED:'1'});assert.equal(response.status,410,path);assert.equal((await response.json()).code,'V1_AUTH_RETIRED');}
 assert.equal(business,0);assert.equal(authorise,0);assert.equal((await handle(new Request(origin+'/api/account/check'),{UAA_V2_ENABLED:'0'})).status,200);assert.equal(business,1);
});
test('retained handoff script selected branch offers native Hifz navigation without reading legacy storage or sending a handoff',async()=>{
 const calls={storage:0,fetch:0,message:0},links=[],status={textContent:'',after:x=>links.push(x)},document={querySelector:()=>({content:'2'}),getElementById:()=>status,createElement:()=>({})},storage={getItem(){calls.storage++;throw Error('Legacy storage must not be read');}};
 const context=vm.createContext({window:{M4L_ACADEMY_AUTH:{navigate:async()=>{}}},document,localStorage:storage,globalThis:null});context.globalThis=context;context.fetch=()=>{calls.fetch++;};context.parent={postMessage(){calls.message++;}};context.console=console;
 vm.runInContext(readFileSync(new URL('js/m4l-hifz-handoff.js',root),'utf8'),context);await new Promise(r=>setImmediate(r));assert.equal(links[0].href,'https://mahadarwa-hifz.ummabbadacademy.app/');assert.deepEqual(calls,{storage:0,fetch:0,message:0});
});
test('selected retained ESM ceremonies and account-hash listeners perform no legacy storage/network/postMessage work',async()=>{
 const saved=new Map(),listeners=new Map(),calls={storage:0,fetch:0,post:0,oldRedirect:0},navigations=[],button={hidden:true},status={textContent:''},storage={getItem(){calls.storage++;throw Error('Legacy storage unavailable');},setItem(){calls.storage++;},removeItem(){calls.storage++;}};
 const globals={document:{querySelector:s=>s.includes('meta')?{content:'2'}:s==='button'?button:status,getElementById:()=>status},window:{M4L_ACADEMY_AUTH:{navigate:async url=>navigations.push(url)}},location:{href:origin+'/studio/lesson',origin,pathname:'/studio/lesson',search:'',replace(){calls.oldRedirect++;}},localStorage:storage,sessionStorage:storage,fetch:async()=>{calls.fetch++;throw Error('Legacy network unavailable');},parent:{postMessage(){calls.post++;}},addEventListener:(type,fn)=>{const old=listeners.get(type)||[];old.push(fn);listeners.set(type,old);}};
 try{for(const[k,v]of Object.entries(globals)){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
 const files=['js/m4l-website-studio.mjs','academy/website-studio/session/session.mjs','academy/website-studio/connect/connect.mjs','academy/website-platform/connect/connect.mjs','portal/studio-authorize.mjs','portal-adapter/studio-authorize.mjs','portal/studio-enter.mjs','portal-adapter/studio-enter.mjs'];
 for(const rel of files)await import(new URL(rel,root).href+'?retained-v111-regression='+encodeURIComponent(rel));
 for(const[type,fns]of listeners)for(const fn of fns)fn({key:'m4l_account_token',origin:'https://example.org',source:{},data:{type:'academy-studio-account-check',nonce:'synthetic'}});
 assert.deepEqual(calls,{storage:0,fetch:0,post:0,oldRedirect:0});assert(navigations.every(u=>new URL(u).origin==='https://worshipuponbaseera.ummabbadacademy.app'));assert.equal(navigations.length,2);
 }finally{for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
});
