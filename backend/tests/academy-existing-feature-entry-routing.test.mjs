import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';

const origin='https://maktabhelper.app';
const control='/auth/v110/browser-control.html';
const html='<!doctype html><title>Academy control routing fixture</title>';
const source=process.env.ACADEMY_ROUTING_ENTRY_SOURCE
 ?pathToFileURL(process.env.ACADEMY_ROUTING_ENTRY_SOURCE)
 :new URL('../src/academy-existing-feature-entry-v5.mjs',import.meta.url);
const fixtureKey=Symbol.for('academy.existing-feature.routing.unit.fixtures');
const fixtures=new Map();
globalThis[fixtureKey]=fixtures;
let sequence=0;

async function workerFixture(){
 const id=String(++sequence),entry=new URL(source),stubURL='academy-routing-fixture:'+id;
 entry.searchParams.set('routing-unit',id);
 const calls={assets:[],native:[],roles:[],profile:0,origin:0,body:0};
 const fixture={
  calls,
  verify(){calls.profile++;},
  assertOrigin(request){
   calls.origin++;
   if(new URL(request.url).origin!==origin){
    throw Object.assign(Error('unit origin rejection'),{code:'PORTABLE_NATIVE_ORIGIN'});
   }
  },
  buffer(request){calls.body++;return request;},
  nativeFetch(request){
   calls.native.push(request.url);
   return new Response('native authentication fixture',{status:401});
  }
 };
 fixtures.set(id,fixture);
 const allowed=new Set([
  'cloudflare:workers',
  './academy-existing-feature-runtime-v1.mjs',
  './academy-split-coordinator-root-only-v1.mjs',
  './academy/d1/library-storage.js',
  './academy/existing-feature-env-v1.mjs',
  './auth/v110/academy-existing-feature-profile-v1.mjs',
  './academy/root-only-request-body-v1.mjs'
 ]);
 const stub=[
  "const f=globalThis[Symbol.for('academy.existing-feature.routing.unit.fixtures')].get("+JSON.stringify(id)+");",
  'export class DurableObject {}',
  'export class WorkerEntrypoint {}',
  'export class AcademyRootOnlySplitCoordinator {}',
  'export class ProgramTimetableCoordinator {}',
  'export const existingFeatureEnv=(env,role)=>{f.calls.roles.push(role);return env;};',
  'export const verifyPortableNativeProfile=async()=>f.verify();',
  'export const portableNativeHTTPRequest=request=>f.assertOrigin(request);',
  "export const portableNativeUnavailable=()=>new Response('unit unavailable',{status:503});",
  'export const bufferRootOnlyPOST=async request=>f.buffer(request);',
  'export default {fetch:request=>f.nativeFetch(request)};'
 ].join('\n');
 const hooks=registerHooks({
  resolve(specifier,context,nextResolve){
   if(context.parentURL===entry.href){
    assert(allowed.has(specifier),'Unexpected dependency: routing tests must not load native application modules');
    return {url:stubURL,shortCircuit:true};
   }
   return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
   if(url===stubURL)return {format:'module',source:stub,shortCircuit:true};
   return nextLoad(url,context);
  }
 });
 let worker;
 try{worker=(await import(entry.href)).default;}
 finally{hooks.deregister();fixtures.delete(id);}
 const env={ASSETS:{fetch:async request=>{
  calls.assets.push(request);
  return new Response(request.method==='HEAD'?null:html,{status:200,headers:{
   'Content-Type':'text/html; charset=utf-8',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'",
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff'
  }});
 }}};
 return {worker,env,calls,fetch:(path,options)=>worker.fetch(new Request(origin+path,options),env,{})};
}

test('GET serves the exact control HTML through ASSETS and strips credentials',async()=>{
 const f=await workerFixture();
 const response=await f.fetch(control,{headers:{
  Accept:'text/html',
  'If-None-Match':'unit-etag',
  Cookie:'unit-only=fixture',
  Authorization:'Bearer unit-only-fixture',
  'X-UAA-CSRF':'unit-only-fixture'
 }});
 assert.equal(response.status,200);
 assert.equal(await response.text(),html);
 assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'none'; script-src 'self'");
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.equal(f.calls.assets.length,1);
 const forwarded=f.calls.assets[0];
 assert.equal(forwarded.url,origin+control);
 assert.equal(forwarded.method,'GET');
 assert.equal(forwarded.headers.get('Accept'),'text/html');
 assert.equal(forwarded.headers.get('If-None-Match'),'unit-etag');
 for(const header of ['Cookie','Authorization','X-UAA-CSRF'])assert.equal(forwarded.headers.has(header),false);
 assert.deepEqual(f.calls.native,[]);
 assert.deepEqual(f.calls.roles,['academy']);
 assert.equal(f.calls.profile,1);
 assert.equal(f.calls.origin,1);
 assert.equal(f.calls.body,0);
});

test('HEAD serves the control asset without a response body',async()=>{
 const f=await workerFixture(),response=await f.fetch(control,{method:'HEAD'});
 assert.equal(response.status,200);
 assert.equal(await response.text(),'');
 assert.equal(f.calls.assets.length,1);
 assert.equal(f.calls.assets[0].method,'HEAD');
 assert.deepEqual(f.calls.native,[]);
});

test('other auth HTML, path suffixes and control-page queries remain blocked',async()=>{
 const f=await workerFixture();
 for(const path of [
  '/auth/v110/other.html',
  control+'/private',
  control+'/',
  control+'.bak',
  '/auth/v110//browser-control.html',
  control+'?unexpected=1',
  '/auth/v110/context/private'
 ]){
  const response=await f.fetch(path);
  assert.equal(response.status,404,path);
  await response.body?.cancel();
 }
 assert.deepEqual(f.calls.assets,[]);
 assert.deepEqual(f.calls.native,[]);
});

test('control-page writes are rejected before ASSETS or native auth',async()=>{
 const f=await workerFixture();
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
  const response=await f.fetch(control,{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}});
  assert.equal(response.status,405,method);
  assert.equal(response.headers.get('Allow'),'GET, HEAD');
  await response.body?.cancel();
 }
 assert.deepEqual(f.calls.assets,[]);
 assert.deepEqual(f.calls.native,[]);
 assert.equal(f.calls.body,0);
});

test('the native context endpoint still goes to native authentication',async()=>{
 const f=await workerFixture(),response=await f.fetch('/auth/v110/context');
 assert.equal(response.status,401);
 assert.equal(await response.text(),'native authentication fixture');
 assert.deepEqual(f.calls.native,[origin+'/auth/v110/context']);
 assert.deepEqual(f.calls.assets,[]);
 assert.equal(f.calls.body,1);
});

test('existing JS and CSS assets still use the static binding',async()=>{
 const f=await workerFixture();
 for(const path of ['/auth/v110/browser-entry.mjs','/auth/v110/browser-config.js?v=unit','/auth/v110/browser-ui.css']){
  const response=await f.fetch(path);
  assert.equal(response.status,200,path);
  await response.body?.cancel();
 }
 assert.equal(f.calls.assets.length,3);
 assert.deepEqual(f.calls.native,[]);
});

test('the control-page exception does not bypass the existing origin gate',async()=>{
 const f=await workerFixture();
 const response=await f.worker.fetch(new Request('https://other.invalid'+control),f.env,{});
 assert.equal(response.status,403);
 assert.equal(response.headers.get('X-UAA-V110-Stage'),'origin');
 assert.deepEqual(f.calls.assets,[]);
 assert.deepEqual(f.calls.native,[]);
 assert.equal(f.calls.profile,1);
 assert.equal(f.calls.origin,1);
});
