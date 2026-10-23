import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {importSQL} from '../tools/academy-split/artifact.mjs';
test('the actual Workers runtime coordinates both D1 bindings through private Durable Object RPC',async()=>{
 const f=await splitFixture();let runtime;try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 const apiPath=new URL('../src/academy-runtime.js',import.meta.url).pathname,coordinatorPath=new URL('../src/academy-split-coordinator.js',import.meta.url).pathname;
 const api=await build({stdin:{contents:`import api from ${JSON.stringify(apiPath)};export default{fetch:(r,e,c)=>api.fetch(r,{...e,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}},c)};`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']}),coordinator=await build({entryPoints:[coordinatorPath],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
 const bindings={...Object.fromEntries(Object.entries(f.source.env).filter(([,v])=>typeof v==='string')),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'},d1Databases={ACADEMY_DB:'split-runtime-core',ACADEMY_ADMIN_DB:'split-runtime-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
 runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',modules:true,script:api.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],bindings,d1Databases,durableObjects},{name:'coordinator',modules:true,script:coordinator.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],d1Databases,durableObjects}]}));
 for(const owner of ['core','admin']){
  const db=f.databases[owner],target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=db.prepare("SELECT type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),schema=f.prepared.schemas[owner],list=importSQL(db,schema,{statementsOnly:true}).flatMap(sql=>sql===schema.tableSQL?objects.filter(o=>o.type==='table').map(o=>o.sql):sql===schema.afterSQL?objects.filter(o=>o.type!=='table').map(o=>o.sql):[sql]);
  for(let i=0;i<list.length;i+=30)await target.batch(list.slice(i,i+30).map(sql=>target.prepare(sql)));
 }
 const request=async(path,input,token)=>{const r=await runtime.dispatchFetch('https://academy.test'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':'ADMIN',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const login=await request('/api/account/login',{uniqueid:'separation-global',pin:'1234'}),token=login.token,scope=f.scopes.courseA;
 const media=await request('/api/academy/lesson-media/course-files-create',{activityKey:scope,operationId:crypto.randomUUID()},token);assert(media.lessonId);
 const selection={scopes:[scope]},review=await request('/api/admin/platform/setup/review',selection,token),frozen=await request('/api/admin/platform/setup/freeze',{...selection,digest:review.digest},token),accepted=await request('/api/admin/platform/setup/publish',{batchId:frozen.batchId,digest:frozen.digest},token);assert(accepted.head);
 const admin=await runtime.getD1Database('ACADEMY_ADMIN_DB','api'),core=await runtime.getD1Database('ACADEMY_DB','api');assert.equal((await admin.prepare('SELECT count(*) n FROM split_command_parts').first()).n,0);assert.equal((await core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);
 }finally{await runtime?.dispose();f.close();}
});
