import test from 'node:test';
import assert from 'node:assert/strict';
import {hosting,exactOrigin} from '../src/academy/hosting.mjs';
import {nativePortal,portalStudioSummary,portalDashboardLinks} from '../src/academy/d1/portal.mjs';
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
test('V111 public Academy aliases use the canonical service URL without browser credentials',async()=>{
 const origin=hosting().academyPortalOrigin;
 const routes=[
  ['/api/public/academy-announcements','/api/academy/announcements/published'],
  ['/api/public/academy-announcements/image?asset=fixture','/api/academy/announcements/image?asset=fixture'],
  ['/api/public/academy-announcements/pdf?asset=fixture','/api/academy/announcements/pdf?asset=fixture']
 ];
 const fetcher=()=>assert.fail('V111 Academy public aliases must use the service binding');
 for(const [source,target] of routes){
  const request=new Request(origin+source,{method:source.includes('/pdf?')?'HEAD':'GET',headers:{Cookie:'test=synthetic',Authorization:'Bearer synthetic',Range:'bytes=0-15','If-None-Match':'fixture'}});
  const env={UAA_V2_ENABLED:'1',ACADEMY_V2_SERVICE:{async fetch(upstream){
   assert.equal(upstream.url,origin+target);
   assert.equal(upstream.method,request.method);
   assert.equal(upstream.redirect,'manual');
   assert.equal(upstream.headers.get('Range'),'bytes=0-15');
   assert.equal(upstream.headers.get('If-None-Match'),'fixture');
   assert.equal(upstream.headers.has('Cookie'),false);
   assert.equal(upstream.headers.has('Authorization'),false);
   return new Response('fixture',{headers:{'Content-Type':'text/plain'}});
  }}};
  const actual=await servePortal(request,env,{fetcher});
  assert.equal(actual.status,200);
  assert.equal(await actual.text(),request.method==='HEAD'?'':'fixture');
 }
 const failClosed=await servePortal(new Request(origin+routes[0][0]),{UAA_V2_ENABLED:'1'},{fetcher});
 assert.equal(failClosed.status,503);
 assert.equal((await failClosed.json()).code,'ACADEMY_V2_SERVICE_REQUIRED');
 await servePortal(new Request(origin+routes[0][0]),{}, {fetcher:async upstream=>{
  assert.equal(upstream.url,hosting().academyApiOrigin+routes[0][1]);
  return new Response();
 }});
 const date=await servePortal(new Request(origin+'/api/public/header-date?day=2026-11-21'),{UAA_V2_ENABLED:'1'}, {fetcher:async upstream=>{
  assert.equal(upstream.url,hosting().academyApiOrigin+'/api/academy/header-date?day=2026-11-21');
  return new Response();
 }});
 assert.equal(date.status,200);
});

test('homepage and Studio entry are served from Academy source without database access',async()=>{
 const paths=[],env={ASSETS:{fetch:async r=>{paths.push(new URL(r.url).pathname);return new Response('synthetic page',{headers:{'Content-Type':'text/html'}});}}};
 const home=await servePortal(new Request('https://new.example/'),env);assert.equal(home.status,200);assert.equal(home.headers.get('Cache-Control'),'no-store');
 await servePortal(new Request('https://new.example/studio/?website=test'),env);
 assert.deepEqual(paths,['/index.html','/studio-enter.html']);
});

test('Global Admin display proof uses native authority rather than Learn projection',async()=>{
 const env={ACADEMY_TO_WEBSITE_SECRET:'synthetic-test-only-connection-key-0000000000000000',WEBSITE_PLATFORM_SERVER_ORIGIN:'https://backend.example.org'};
 const native={account_id:'admin',credential_epoch:2,global_admin:true};
 const auth={sid:'native-admin-session',state:{account:{...native,global_admin:false}},authority:{account:native}};
 await portalStudioSummary(env,auth,{action:'navigation'},async(_url,init)=>{assert.equal(JSON.parse(init.body).globalAdmin,true);return Response.json({navigation:{}});});
});

test('Studio-owned Learn links use exact offering mapping and checked published rights',()=>{
 const data={mode:'learn',activities:[{accessOwner:'STUDIO',websiteKind:'COURSE',websiteOfferingId:'exact-offer',name:'Same title'},{accessOwner:'ACADEMY',activityKey:'PROGRAM:other',destinationHref:'/academy/#activity/other'}]};
 const summary={websites:[{offeringId:'other',websiteId:'wrong',kind:'COURSE'},{offeringId:'exact-offer',websiteId:'right',kind:'COURSE'}],rights:{websites:[{websiteId:'right',canOpen:true,needsRefresh:false}]}};
 assert.equal(portalDashboardLinks(data,summary).activities[0].destinationHref,'/studio/?website=right');
 assert.equal(data.activities[0].destinationHref,undefined);
 summary.rights.websites[0].needsRefresh=true;assert.equal(portalDashboardLinks(data,summary).activities[0].destinationHref,undefined);
 assert.equal(portalDashboardLinks({...data,mode:'teach'},summary).activities[1].destinationHref,'/academy/#activity/other');
});

test('private display validator is scoped to current session and never caches a partial bootstrap',async()=>{
 const {portalReadReply}=await import('../src/academy/d1/portal.mjs');
 const auth={sid:'a',state:{account:{account_id:'person',credential_epoch:1,global_admin:false},roles:[],subscriptions:[],monthlyMedia:[]}};
 const first=await portalReadReply(new Request('https://api.example/api/academy/hub/read'),{account:{accountId:'person'},checkedAt:1,serverTime:1},auth),tag=first.headers.get('ETag');
 const request=new Request('https://api.example/api/academy/hub/read',{headers:{'If-None-Match':tag}});
 assert.equal((await portalReadReply(request,{account:{accountId:'person'},checkedAt:2,serverTime:2},auth)).status,304);
 assert.equal((await portalReadReply(request,{account:{accountId:'person'},checkedAt:2,serverTime:2},{...auth,sid:'b'})).status,200);
 assert.equal((await portalReadReply(request,{account:{accountId:'person'},errors:{dashboard:{status:503}}},auth)).headers.has('ETag'),false);
});
