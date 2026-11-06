import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createAcademyWorkerdFixture} from './jwt-v110-workerd-fixture.mjs';
test('Actual local Static Assets router keeps public assets separate from exact native API routes',async()=>{
 const evidence=process.env.JWT_V110_EVIDENCE,build=JSON.parse(readFileSync(join(evidence,'public-build.json'),'utf8'));
 const f=await createAcademyWorkerdFixture({assetsDirectory:build.directory}),origin='https://feature_worker.maktab4life.workers.dev',records=[];
 try{
  for(const path of ['/','/academy/','/auth/v110/browser-config.js','/auth/v110/browser-entry.mjs','/auth/v110/academy-cookie-loader.js']){
   const r=await f.runtime.dispatchFetch(origin+path);assert.equal(r.status,200,path);assert(!r.headers.has('x-feature-local-budget'),'Existing public assets must bypass the custom API Worker');
   assert.equal(r.headers.getSetCookie().length,0);assert(r.headers.get('Content-Type'));const body=await r.text();assert(body.length>0);
   const head=await f.runtime.dispatchFetch(origin+path,{method:'HEAD'});assert.equal(head.status,200,path);assert.equal(await head.text(),'');
   records.push({path,get:200,head:200,customWorkerInvoked:false,contentType:r.headers.get('Content-Type'),cacheControl:r.headers.get('Cache-Control')});
  }
  for(const path of ['/backend/src/auth/v110/academy-master-issuer.mjs','/.git/config','/auth/v110/context/private','/no-such-jwt-asset']){
   const r=await f.runtime.dispatchFetch(origin+path);assert.equal(r.status,404,path);await r.body?.cancel();records.push({path,status:404});
  }
  const context=await f.runtime.dispatchFetch(origin+'/auth/v110/context',{headers:{'Sec-Fetch-Site':'same-origin'}});assert.equal(context.status,401);assert(context.headers.has('x-feature-local-budget'));assert.match(context.headers.get('Cache-Control'),/no-store/);await context.body?.cancel();
  const marker=await f.runtime.dispatchFetch(origin+'/__jwt_feature_release');assert.equal(marker.status,200);assert.equal((await marker.json()).featureOnly,true);
  const metrics=JSON.parse(marker.headers.get('x-feature-local-budget'));assert(Object.values(metrics.d1).every(v=>v.statements===0));assert.equal(metrics.coordinatorCalls,0);assert.equal(metrics.remoteCalls,0);
  const mutation=await f.runtime.dispatchFetch(origin+'/auth/v110/browser-entry.mjs',{method:'POST'});assert.equal(mutation.status,405);await mutation.body?.cancel();
  mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'static-assets-routing.json'),JSON.stringify({schema:1,commit:process.env.GITHUB_SHA,actualLocalAssetsRouter:true,actualASSETSBinding:true,records,anonymousContextStatus:401,markerZeroD1:true,fixtureDirectOldSentinelQueries:2,staticMutationStatus:405,hostedRequests:0,limits:'Local Miniflare routing proof; no hosted TLS/DNS/cache or billing claim.'},null,2)+'\n');
 }finally{await f.close();}
});
