import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {serveAcademySite} from '../tools/academy-site.mjs';
test('The actual Feature Pages build receipt passes its exact site route while neighbouring root JSON stays private',async()=>{
 const body=readFileSync(new URL('../../.academy-pages/feature-build.json',import.meta.url),'utf8'),marker=JSON.parse(body);assert.equal(marker.commit,process.env.GITHUB_SHA);assert.equal(marker.branch,'feature-preview');
 const calls=[],env={ASSETS:{async fetch(request){calls.push(request);assert.equal(new URL(request.url).pathname,'/feature-build.json');return new Response(body,{headers:{'Content-Type':'application/json'}});}}};
 for(const method of ['GET','HEAD']){
  const before=calls.length,r=await serveAcademySite(new Request('https://feature-preview.academy-maktab4life.pages.dev/feature-build.json?ignored=1',{method,headers:{Authorization:'Bearer private-fixture',Cookie:'private=fixture'}}),env,{pages:true,branch:'feature-preview'});
  assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(await r.text(),method==='HEAD'?'':body);
  assert.equal(calls.length,before+1);assert.equal(calls.at(-1).method,'GET');assert.equal(new URL(calls.at(-1).url).search,'');assert.equal(calls.at(-1).headers.get('Cookie'),null);assert.equal(calls.at(-1).headers.get('Authorization'),null);
 }
 for(const [path,options]of [['/feature-build-secret.json',{pages:true,branch:'feature-preview'}],['/feature-build.json',{pages:true,branch:'development'}],['/feature-build.json',{pages:false,branch:'feature-preview'}]]){
  const before=calls.length,r=await serveAcademySite(new Request('https://feature-preview.academy-maktab4life.pages.dev'+path),env,options);assert.equal(r.status,404);assert.equal(calls.length,before);
 }
 const before=calls.length,r=await serveAcademySite(new Request('https://feature-preview.academy-maktab4life.pages.dev/feature-build.json',{method:'POST'}),env,{pages:true,branch:'feature-preview'});assert.equal(r.status,405);assert.equal(calls.length,before);
});
