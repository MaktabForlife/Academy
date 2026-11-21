import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINS,ACADEMY_SHARED_COOKIE} from '../tokens.mjs';
import {serveAcademySite} from '../../../backend/tools/academy-site.mjs';
import {createAcademyV2Handler} from '../../../backend/src/academy/v111/native-http.mjs';
import {createStudioV2Handler} from '../../../../AcademyStudio/src/v111-worker.mjs';
import {routeWebsite} from '../../../../AcademyStudio/routing/worker.mjs';
import {createHifzV2Handler} from '../../../../Hifz/worker/src/hifz-v2.js';

const marker='isolated-cookie-forwarding-marker';
const shared=ACADEMY_SHARED_COOKIE+'='+marker;
const academyPair=shared+'; __Host-uaa_r='+marker;
const fixtureSetCookie='fixture-upstream='+marker+'; Secure; Path=/; HttpOnly';
function request(app,path,{cookie=shared,method='GET',headers={}}={}){
 return new Request(ORIGINS[app]+path,{method,headers:{Cookie:cookie,...headers},
  ...(method==='POST'?{body:'{}'}:{})});
}
function outcome(response,status,{cookie=false}={}){
 assert.equal(response.status,status);
 assert.equal(response.headers.has('Set-Cookie'),cookie);
}
const studioEnv={
 UAA_V2_ENABLED:'1',UAA_V111_CUTOVER:'active',
 WEBSITE_ORIGIN:ORIGINS.studio,ACADEMY_ORIGIN:ORIGINS.academy,ACADEMY_PORTAL_ORIGIN:ORIGINS.academy,
 STUDIO_BACKEND_ORIGIN:'https://fixture-studio.workers.dev',WEBSITE_ALIAS_ORIGINS:'[]'
};
const publicResponse=(status=200)=>new Response('Public fixture',{status,headers:{'Content-Type':'text/plain','Set-Cookie':fixtureSetCookie}});

test('Academy retains its pair for auth and protected API and strips cookies from public service and assets',async()=>{
 const calls=[],env={
  UAA_V2_ENABLED:'1',UAA_V111_CUTOVER:'active',
  ASSETS:{async fetch(r){calls.push(['asset',new URL(r.url).pathname,r.headers.get('Cookie')]);return publicResponse();}},
  ACADEMY_V2_SERVICE:{async fetch(r){
   const path=new URL(r.url).pathname;
   calls.push(['service',path,r.headers.get('Cookie')]);
   if(r.method==='POST')assert.equal(await r.text(),'{}');
   return publicResponse(path.endsWith('/published')?200:202);
  }}
 };
 outcome(await serveAcademySite(request('academy','/',{cookie:academyPair}),env),200);
 outcome(await serveAcademySite(request('academy','/api/public/academy-announcements',{cookie:academyPair}),env),200);
 for(const path of ['/auth/v2/bootstrap','/api/academy/hub/read']){
  outcome(await serveAcademySite(request('academy',path,{cookie:academyPair,method:'POST'}),env),202,{cookie:true});
 }
 outcome(await serveAcademySite(request('academy','/internal/auth/v2/reconcile',{cookie:academyPair,method:'POST'}),env),401);
 assert.deepEqual(calls,[
  ['asset','/index.html',null],['service','/api/academy/announcements/published',null],
  ['service','/auth/v2/bootstrap',academyPair],['service','/api/academy/hub/read',academyPair]
 ]);
});

test('Academy native public reads drop cookies on both sides of the business handler',async()=>{
 let publicCalls=0;
 const handler=createAcademyV2Handler({
  getRuntime:async()=>({handle:async()=>null}),
  business:async r=>{publicCalls++;assert(!r.headers.has('Cookie'));return publicResponse();}
 });
 outcome(await handler(request('academy','/api/academy/announcements/published',{cookie:academyPair}),studioEnv),200);
 assert.equal(publicCalls,1);
});

test('Studio keeps the shared cookie only for the exact child entry POST',async()=>{
 const received=[],local='__Host-studio_r='+marker;
 const runtime={async handle(r){
  received.push([new URL(r.url).pathname,r.headers.get('Cookie')]);
  if(r.method==='POST')assert.equal(await r.text(),'{}');
  return new Response('Owning auth fixture',{headers:{'Set-Cookie':fixtureSetCookie}});
 }};
 const studio=createStudioV2Handler({getRuntime:async()=>runtime,business:async r=>{
  assert(!r.headers.has('Cookie'));return publicResponse(new URL(r.url).pathname.includes('/public/')?503:200);
 }});
 const cookie=local+'; '+shared;
 outcome(await studio(request('studio','/studio/',{cookie}),studioEnv),200);
 outcome(await studio(request('studio','/api/public/circles',{cookie}),studioEnv),503);
 const entryPaths=['/auth/v2/shared-entry/start','/auth/v2/shared-entry','/auth/v2/shared-entry/continue'];
 for(const path of entryPaths)outcome(await studio(request('studio',path,{cookie,method:'POST'}),studioEnv),200,{cookie:true});
 outcome(await studio(request('studio','/auth/v2/shared-entry',{cookie}),studioEnv),200,{cookie:true});
 outcome(await studio(request('studio','/auth/v2/refresh',{cookie,method:'POST'}),studioEnv),200,{cookie:true});
 outcome(await studio(request('studio','/internal/auth/v2/events',{cookie,method:'POST'}),studioEnv),401);
 assert.deepEqual(received,[...entryPaths.map(path=>[path,cookie]),['/auth/v2/shared-entry',null],['/auth/v2/refresh',local]]);
});

test('the legacy Studio router strips the Academy domain cookie without changing its redirect destination',async()=>{
 const cookie='legacy-studio=fixture; '+shared+'; '+shared;
 const response=await routeWebsite(request('studio','/legacy-redirect',{cookie}),async forwarded=>{
  assert.equal(new URL(forwarded.url).origin,studioEnv.STUDIO_BACKEND_ORIGIN);
  assert.equal(forwarded.headers.get('Cookie'),'legacy-studio=fixture');
  return new Response(null,{status:302,headers:{Location:studioEnv.STUDIO_BACKEND_ORIGIN+'/legacy-result'}});
 },studioEnv);
 assert.equal(response.status,302);
 assert.equal(response.headers.get('Location'),ORIGINS.studio+'/legacy-result');
});

test('Hifz keeps local cookies for authentication and provides only a checked actor to journal code',async()=>{
 const local='__Host-hifz_r='+marker,cookie=shared+'; '+local,checked=[],dispatched=[];
 const cap={binding:{sub:'fixture-academy-subject'},rights:{nativeStudentId:'fixture-student',role:'student'},deadline:1234};
 const runtime={
  settings:{raw:{sharedChildEntry:{}}},
  async handle(r){
   checked.push([new URL(r.url).pathname,r.headers.get('Cookie')]);
   return new Response('Owning auth fixture',{headers:{'Set-Cookie':fixtureSetCookie}});
  },
  async authorise(r){assert.equal(r.headers.get('Cookie'),local);return cap;},
  assertCapability(value){assert.equal(value,cap);},
  decorate:r=>r
 };
 const hifz=createHifzV2Handler({
  runtimeFactory:async()=>runtime,
  dispatchNative:async(r,_env,_ctx,actor)=>{
   assert(!r.headers.has('Cookie'));
   dispatched.push([new URL(r.url).pathname,actor?.id]);
   return publicResponse();
  }
 });
 const unexpectedSQL=()=>{throw Error('The forwarding fixture does not dispatch SQL');};
 const env={
  DB:{prepare:unexpectedSQL,batch:unexpectedSQL},
  ASSETS:{async fetch(r){assert(!r.headers.has('Cookie'));return publicResponse();}}
 };
 outcome(await hifz(request('hifz','/api/health',{cookie}),env),200);
 outcome(await hifz(request('hifz','/api/reflections',{cookie}),env),200);
 outcome(await hifz(request('hifz','/',{cookie}),env),200);
 outcome(await hifz(request('hifz','/auth/v2/shared-entry/start',{cookie,method:'POST'}),env),200,{cookie:true});
 outcome(await hifz(request('hifz','/auth/v2/shared-entry/callback',{cookie,method:'POST'}),env),200,{cookie:true});
 outcome(await hifz(request('hifz','/auth/v2/shared-entry/status',{cookie,method:'POST'}),env),200,{cookie:true});
 outcome(await hifz(request('hifz','/auth/v2/refresh',{cookie,method:'POST'}),env),200,{cookie:true});
 assert.deepEqual(dispatched,[['/api/health',undefined],['/reflections','fixture-student']]);
 assert.deepEqual(checked,[
  ['/auth/v2/shared-entry/start',cookie],['/auth/v2/shared-entry/callback',null],
  ['/auth/v2/shared-entry/status',local],['/auth/v2/refresh',local]
 ]);
});
