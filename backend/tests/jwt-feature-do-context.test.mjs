import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
test('actual local old/new class alarms retain separate native/new D1 context; paused API denies',async()=>{
 const bundle=await build({entryPoints:[new URL('./jwt-feature-do-probe.mjs',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],
  bindings:{ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',ACADEMY_D1_RUN_ID:'0'.repeat(64),JWT_V110_NATIVE_RUN_ID:'a'.repeat(64),JWT_V110_OBJECT_NAMESPACE:'jwt-feature-v110/20261106a/'},
  d1Databases:{ACADEMY_DB:'old-core',ACADEMY_ADMIN_DB:'old-admin',JWT_V110_CORE_DB:'new-core',JWT_V110_ADMIN_DB:'new-admin'},
  durableObjects:{LEGACY:{className:'LegacyProbe',useSQLite:true},FRESH:{className:'FreshProbe',useSQLite:true}}
 }));
 try{
  const old=await mf.getD1Database('ACADEMY_DB'),fresh=await mf.getD1Database('JWT_V110_CORE_DB');
  for(const db of [old,fresh])await db.prepare('CREATE TABLE probe(origin TEXT)').run();
  const armed=await mf.dispatchFetch('https://feature_worker.maktab4life.workers.dev/arm');assert.equal(armed.status,200);
  let a=[],b=[];for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,250));a=(await old.prepare('SELECT origin FROM probe').all()).results;b=(await fresh.prepare('SELECT origin FROM probe').all()).results;if(a.length&&b.length)break;}
  assert.deepEqual(a,[{origin:'legacy'}]);assert.deepEqual(b,[{origin:'fresh'}]);
  const denied=await mf.dispatchFetch('https://feature_worker.maktab4life.workers.dev/paused');assert.equal(denied.status,503);assert.equal((await denied.json()).code,'ACADEMY_STORAGE_PAUSED');
  console.log('Scoped proof: real local DO alarm dispatch and production constructor context selection; business recover() is a probe, not full native recovery-transaction proof.');
 }finally{await mf.dispose();}
});
