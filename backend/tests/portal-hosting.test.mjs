import test from 'node:test';
import assert from 'node:assert/strict';
import {hosting,exactOrigin} from '../src/academy/hosting.mjs';
import {nativePortal,portalStudioSummary} from '../src/academy/d1/portal.mjs';
import {servePortal} from '../tools/portal-site.mjs';
import {verify,envelopePurpose} from '../src/academy/d1/web-platform/protocol.mjs';
test('hosting changes are reviewed configuration, never request-header trust',()=>{
 const next={schema:1,academyPortalOrigin:'https://academy.example.net',academyLegacyOrigins:[],academyApiOrigin:'https://api.example.net',studioOrigin:'https://studio.example.org',studioBackendOrigin:'https://backend.example.org',hifzOrigin:'https://hifz.example.org'};
 assert.equal(hosting(next).academyPortalOrigin,next.academyPortalOrigin);
 for(const value of ['http://bad.example','https://user@bad.example','https://bad.example/path','https://bad.example?x','https://bad.example#x','https://*.example.org','https://bad.example/'])assert.throws(()=>exactOrigin(value),value);
});
test('native portal rejects a forged Origin before authentication or any read',async()=>{
 let reads=0;
 await assert.rejects(nativePortal(new Request('https://api.example/api/academy/hub/read',{method:'POST',headers:{Origin:'https://attacker.invalid'},body:'{"kind":"bootstrap"}'}),{},{repository:{},authenticate:()=>{reads++;},read:()=>{reads++;}}),e=>e.status===403);
 assert.equal(reads,0);
});
test('private portal cannot expose cached data without current native authentication',async()=>{
 let dataReads=0;
 await assert.rejects(nativePortal(new Request('https://api.example/api/academy/hub/read',{method:'POST',headers:{Origin:hosting().academyPortalOrigin},body:'{"kind":"bootstrap"}'}),{},{repository:{},authenticate:()=>{throw Object.assign(Error('ended'),{status:401});},read:()=>{dataReads++;}}),e=>e.status===401);
 assert.equal(dataReads,0);
});
test('Studio summary is one signed, bounded request, with native and lesson session IDs distinct',async()=>{
 const secret='synthetic-test-only-connection-key-0000000000000000',env={ACADEMY_TO_WEBSITE_SECRET:secret,WEBSITE_PLATFORM_SERVER_ORIGIN:'https://backend.example.org'},auth={sid:'native-session',state:{account:{account_id:'person',credential_epoch:7,global_admin:false}}};let calls=0;
 const fetcher=async(url,init)=>{calls++;const payload=JSON.parse(init.body);assert.equal(payload.sessionId,'native-session');assert.equal(payload.lessonSessionId,'lesson-session');assert.equal(payload.epoch,7);assert.equal(new URL(url).pathname,'/internal/studio/hub-join');assert.equal(init.redirect,'manual');assert(await verify(secret,envelopePurpose('POST','/internal/studio/hub-join'),init.body,init.headers['X-Maktab-Signature']));return Response.json({destination:'https://example.zoom.us/j/123'});};
 const result=await portalStudioSummary(env,auth,{action:'join',offeringId:'offer',sessionId:'lesson-session'},fetcher);assert.equal(calls,1);assert.equal(result.destination,'https://example.zoom.us/j/123');
});
test('public snapshot relay strips account credentials and cannot choose another upstream',async()=>{
 let calls=0;
 const request=new Request('https://new.example/api/public/home?url=https://attacker.invalid',{headers:{Authorization:'Bearer synthetic',Cookie:'private=synthetic',Origin:'https://attacker.invalid','X-Maktab-Signature':'synthetic'}});
 const response=await servePortal(request,{}, {fetcher:async upstream=>{calls++;assert.equal(new URL(upstream.url).origin,hosting().studioBackendOrigin);for(const key of ['Authorization','Cookie','Origin','X-Maktab-Signature'])assert.equal(upstream.headers.has(key),false);return Response.json({cards:[],sessions:[]});}});
 assert.equal(response.status,200);assert.equal(calls,1);
 assert.equal(await servePortal(new Request('https://new.example/api/private/user'),{}, {fetcher:()=>{throw Error('unreachable');}}),null);
});
test('homepage and Studio entry are served from Academy source without database access',async()=>{
 const paths=[],env={ASSETS:{fetch:async r=>{paths.push(new URL(r.url).pathname);return new Response('synthetic page',{headers:{'Content-Type':'text/html'}});}}};
 const home=await servePortal(new Request('https://new.example/'),env);assert.equal(home.status,200);assert.equal(home.headers.get('Cache-Control'),'no-store');
 await servePortal(new Request('https://new.example/studio/?website=test'),env);
 assert.deepEqual(paths,['/index.html','/studio-enter.html']);
});
