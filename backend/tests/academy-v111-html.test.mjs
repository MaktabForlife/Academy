import test from 'node:test';import assert from 'node:assert/strict';
import {academyV2HTML} from '../src/academy/v111/html.mjs';import {serveAcademySite} from '../tools/academy-site.mjs';
const origin='https://ummabbadacademy.app',html='<!doctype html><html lang="en"><head><title>Synthetic shell</title><script src="/js/native.js"></script></head><body><main id="workspace"></main></body></html>',response=()=>new Response(html,{headers:{'Content-Type':'text/html','ETag':'old-shell','Content-Length':String(html.length)}});
test('selected canonical HTML gets early Academy mode/bridge before old scripts and startup privacy class',async()=>{const out=await academyV2HTML(new Request(origin+'/academy/'),{UAA_V2_ENABLED:'1'},response()),text=await out.text();assert(text.indexOf('m4l-v111-session.js')<text.indexOf('/js/native.js'));assert(text.includes('name="uaa-app" content="academy"'));assert(text.includes('class="uaa-v2-private-masked"'));assert.equal(out.headers.get('ETag'),null);assert.equal(out.headers.get('Cache-Control'),'no-store');});
test('legacy selection, noncanonical origins and non-HTML bodies are unchanged',async()=>{for(const [url,env]of [[origin,{UAA_V2_ENABLED:'0'}],['https://provider.invalid',{UAA_V2_ENABLED:'1'}]])assert.equal(await(await academyV2HTML(new Request(url),env,response())).text(),html);const out=await academyV2HTML(new Request(origin),{UAA_V2_ENABLED:'1'},Response.json({success:true}));assert.deepEqual(await out.json(),{success:true});});
test('owning Pages entry injects root portal HTML and bypasses stale conditional asset responses',async()=>{let seen;const env={UAA_V2_ENABLED:'1',UAA_V111_CUTOVER:'active',ASSETS:{fetch:async r=>{seen=r;return response();}}},out=await serveAcademySite(new Request(origin+'/',{headers:{'If-None-Match':'old-shell'}}),env);assert((await out.text()).includes('m4l-v111-session.js'));assert.equal(seen.headers.get('If-None-Match'),null);});
test('selected Pages auth proxy forwards exact same-origin POST body through explicit service binding only',async()=>{let seen;const body={purpose:'refresh',expectedContext:null},env={UAA_V2_ENABLED:'1',UAA_V111_CUTOVER:'active',ACADEMY_V2_SERVICE:{fetch:async r=>{seen=r;return Response.json({contractVersion:2});}}};const out=await serveAcademySite(new Request(origin+'/auth/v2/bootstrap',{method:'POST',body:JSON.stringify(body)}),env);assert.equal(out.status,200);assert.equal(seen.url,origin+'/auth/v2/bootstrap');assert.deepEqual(await seen.json(),body);const held=await serveAcademySite(new Request(origin+'/auth/v2/bootstrap',{method:'POST',body:'{}'}),{UAA_V2_ENABLED:'1',UAA_V111_CUTOVER:'active'});assert.equal(held.status,503);assert.equal((await held.json()).code,'ACADEMY_V2_SERVICE_REQUIRED');});

test('held Academy Pages sends the private reconciliation route only to its signature verifier',async()=>{
 const origin='https://ummabbadacademy.app',path='/internal/auth/v2/reconcile',seen=[];
 const env={UAA_V111_CUTOVER:'held',UAA_V2_ENABLED:'1',ACADEMY_V2_SERVICE:{fetch:async request=>{
  seen.push(request);
  return Response.json({code:'FIXTURE_SIGNATURE_DENIAL'},{status:403});
 }}};
 const headers={'X-UAA-Service-Key':'fixture-header-only'};
 for(const request of [new Request(origin+'/'),new Request(origin+path,{method:'POST'}),
  new Request(origin+path,{method:'POST',headers:{...headers,Origin:origin}}),
  new Request(origin+'/internal/auth/v2/redeem',{method:'POST',headers})]){
  assert.equal((await serveAcademySite(request,env,{pages:true})).status,503);
 }
 const wanted=new Request(origin+path,{method:'POST',headers,body:'fixture'});
 const response=await serveAcademySite(wanted,env,{pages:true});
 assert.equal(response.status,403);
 assert.equal(seen.length,1);
 assert.equal(seen[0],wanted);
});
