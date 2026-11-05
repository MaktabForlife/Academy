import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {assertFeatureTargets,checkFeatureTargets} from '../tools/feature-target-guard.mjs';
import {hosting,academyManagementOriginAllowed} from '../src/academy/hosting.mjs';
import {academyClientConfiguration} from '../tools/hosting-client.mjs';
import {servePortal} from '../tools/portal-site.mjs';
const root=new URL('../../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const inputs=()=>[read('backend/wrangler.feature.jsonc'),read('backend/wrangler.feature-coordinator.jsonc'),read('config/hosting.feature.json')];
test('Feature target guard rejects live, indirect, scheduled, inherited and unreviewed resources',()=>{
 assert.equal(checkFeatureTargets(root.pathname).productionBindings,0);
 const changes=[
  a=>a[0].d1_databases[0].database_id='1c8aece3-dc1d-40d1-8a82-01ab4f63336f',
  a=>a[1].d1_databases[1].database_id='fe85dac1-b1f0-4079-9127-2e36089aa385',
  a=>a[0].r2_buckets[2].bucket_name='maktab4lifemedia',
  a=>a[0].durable_objects.bindings[0].script_name='devrebootworker',
  a=>a[0].durable_objects.bindings[1].script_name='academy_split_coordinator',
  a=>a[0].services=[{binding:'UNREVIEWED',service:'devrebootworker'}],
  a=>a[1].triggers.crons=['* * * * *'],
  a=>a[0].keep_vars=true,
  a=>a[0].vars.HIFZ_PROFILE_SYNC_URL='https://hifz.maktab4life.org/internal',
  a=>a[0].vars.ACADEMY_D1_MODE='ACTIVE',
  a=>a[0].vars.ACADEMY_WEB_PLATFORM='1',
  a=>a[0].unsafe={bindings:[{type:'d1',id:'unreviewed'}]},
  a=>a[0].env={development:{name:'devrebootworker'}},
  a=>a[2].academyApiOrigin='https://devrebootworker.maktab4life.workers.dev',
  a=>a[2].studioBackendOrigin='https://academy-studio-parallel.naidu-hajira.workers.dev'
 ];
 for(const change of changes){const a=inputs();change(a);assert.throws(()=>assertFeatureTargets(...a));}
});
test('Feature browser configuration uses only the exact preview host and Feature API',()=>{
 assert.equal(hosting().environment,'feature','Run after the explicit Feature overlay');
 for(const origin of ['https://feature-preview.academy-maktab4life.pages.dev','https://untrusted.invalid']){
  const location=new URL(origin),window={location};vm.runInNewContext(academyClientConfiguration(),{window,location});
  const c=window.M4L_CONFIG;
  assert.equal(c.ENV_NAME,origin===hosting().academyPortalOrigin?'feature':'unavailable');
  assert.equal(c.API_BASE,origin===hosting().academyPortalOrigin?hosting().academyApiOrigin:'');
  assert.equal(c.RELEASE_VERSION,read('js/version.json').version);
  assert.equal(c.HIFZ_DEVELOPMENT_URL,'');assert.equal(c.IS_PRODUCTION,false);
 }
});
test('Feature native management origin trust does not admit live or hostile frontends',()=>{
 assert(academyManagementOriginAllowed(hosting().academyPortalOrigin));
 for(const origin of ['https://ummabbadacademy.app','https://academy-maktab4life.pages.dev','https://feature-preview.academy-maktab4life.pages.dev.evil.invalid',null])assert.equal(academyManagementOriginAllowed(origin),false);
});
test('Feature Studio and Hifz integration configuration cannot reach live services',async()=>{
 let requests=0;const fetcher=async()=>{requests++;throw Error('Unexpected upstream');};
 for(const path of ['/studio/','/academy/studio-authorize/','/api/public/home','/api/public/circles','/api/public/circles/covers/'+'a'.repeat(64),'/circles/prospectus-2027.html']){
  const response=await servePortal(new Request(hosting().academyPortalOrigin+path),{}, {fetcher});
  assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 assert.equal(requests,0);
 assert.equal(new URL(hosting().hifzOrigin).hostname,'hifz-unavailable.invalid');
});
test('Feature public Academy relay sends no session or authorization to the configured API',async()=>{
 let captured;
 const response=await servePortal(new Request(hosting().academyPortalOrigin+'/api/public/header-date',{headers:{Authorization:'Bearer private',Cookie:'session=private'}}),{}, {fetcher:async request=>{captured=request;return Response.json({synthetic:true});}});
 assert.equal(response.status,200);assert.equal(new URL(captured.url).origin,hosting().academyApiOrigin);
 assert.equal(captured.headers.get('Authorization'),null);assert.equal(captured.headers.get('Cookie'),null);
});
