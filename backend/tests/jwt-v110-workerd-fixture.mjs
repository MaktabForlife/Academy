import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {generateKeyPair,exportJWK} from 'jose';
import {prepareFeatureSeed,featureSyntheticAccounts} from '../tools/feature-synthetic-seed.mjs';
import {randomRefresh} from '../src/auth/v110/store.mjs';
const runtimeRequire=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=runtimeRequire('miniflare');
const origin='https://feature_worker.maktab4life.workers.dev',secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,crypto.randomUUID()+crypto.randomUUID()]));
export async function createAcademyWorkerdFixture({assetsDirectory}={}){
 const seed=await prepareFeatureSeed({pin:'2468',secrets}),config=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));let runtime;
 try{
  seed.databases.core.exec(readFileSync(new URL('./fixtures/jwt-v110-auth-only.sql',import.meta.url),'utf8'));
  const keys=await generateKeyPair('ES256',{extractable:true}),publicJWK={...await exportJWK(keys.publicKey),kid:'local-mf-a'},privateJWK={...await exportJWK(keys.privateKey),kid:'local-mf-a'};
  const bundles=await Promise.all(['jwt-v110-academy-workerd-api.mjs','feature-local-budget-coordinator.mjs'].map(name=>build({entryPoints:[new URL(name,import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']})));
  const d1Databases={ACADEMY_DB:'held-core-sentinel',ACADEMY_ADMIN_DB:'held-admin-sentinel',JWT_V110_CORE_DB:'jwt-core',JWT_V110_ADMIN_DB:'jwt-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true},JWT_V110_SPLIT_COORDINATOR:{className:'JWTFeatureAcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
  const storageVars={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_RUN_ID:'0c7d80b7bce6dffb3891896389f05c98a57972951daf288db053ac68af378212',JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',JWT_V110_NATIVE_RUN_ID:seed.report.sourceDigest,JWT_V110_OBJECT_NAMESPACE:'jwt-feature-v110/local-ci/'};
  const compatibilityDate=config.compatibility_date,compatibilityFlags=config.compatibility_flags;
  runtime=new Miniflare(convertV4MiniflareOptions({workers:[
   {name:'api',modules:true,script:bundles[0].outputFiles[0].text,compatibilityDate,compatibilityFlags,...(assetsDirectory?{assets:{directory:assetsDirectory,binding:'ASSETS',routerConfig:{has_user_worker:true},assetConfig:{html_handling:'auto-trailing-slash',not_found_handling:'none'},run_worker_first:['/api/*','/__jwt_feature_release',...['login','setup-pin','context','csrf','refresh','logout','logout-csrf'].map(p=>'/auth/v110/'+p)]}}:{}),bindings:{...config.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',...storageVars,ALLOWED_ORIGINS:origin,JWT_V110_MASTER:'1',JWT_V110_BROWSER:'1',JWT_V110_REFRESH:'1',JWT_V110_NATIVE_COOKIE:'1',JWT_V110_COOKIE_MODE:'HOST_ONLY_PREVIEW',JWT_V110_REQUEST_ORIGIN:origin,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([publicJWK]),JWT_V110_PRIVATE_KEY_JSON:JSON.stringify(privateJWK),JWT_V110_SIGNING_KID:'local-mf-a',JWT_V110_CSRF_SECRET:randomRefresh()},ratelimits:{JWT_V110_RATE_LIMITER:{namespace_id:'100112',simple:{limit:10,period:60}}},d1Databases,durableObjects:{...durableObjects,PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true},JWT_V110_TIMETABLE_COORDINATOR:{className:'JWTFeatureProgramTimetableCoordinator',useSQLite:true}},r2Buckets:{MEDIA_BUCKET:'jwt-public',LESSON_MEDIA_BUCKET:'jwt-private',ASSESSMENT_BUCKET:'jwt-assessments'}},
   {name:'coordinator',modules:true,script:bundles[1].outputFiles[0].text,compatibilityDate,compatibilityFlags,bindings:storageVars,d1Databases,durableObjects}
  ]}));
  for(const owner of ['core','admin']){
   const target=await runtime.getD1Database(owner==='core'?'JWT_V110_CORE_DB':'JWT_V110_ADMIN_DB','api'),objects=seed.databases[owner].prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
   const statements=objects.map(o=>target.prepare(o.sql));for(let i=0;i<statements.length;i+=30)await target.batch(statements.slice(i,i+30));
   await target.batch(seed.sql[owner].trim().split('\n').map(sql=>target.prepare(sql)));
  }
 return {runtime,seed,config,async close(){try{for(const name of ['ACADEMY_DB','ACADEMY_ADMIN_DB']){const db=await runtime.getD1Database(name,'api'),row=await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN('accounts','account_sessions','jwt_v110_families','split_commands')").first();assert.equal(row.n,0,'Held local sentinels must remain empty');}}finally{await runtime.dispose();seed.close();}}};
 }catch(error){await runtime?.dispose();seed.close();throw error;}
}
