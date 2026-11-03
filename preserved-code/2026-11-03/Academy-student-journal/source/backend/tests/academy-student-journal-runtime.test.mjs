import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {JOURNAL_MAX_BYTES} from '../src/academy/d1/student-journal.js';
import {importSQL} from '../tools/academy-split/artifact.mjs';

test('actual Workers runtime stores journals in private R2, outside split Core/Admin D1',async()=>{
 const f=await splitFixture();let runtime;
 try{
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
  const path=new URL('../src/academy-runtime.js',import.meta.url).pathname,coordinatorPath=new URL('../src/academy-split-coordinator.js',import.meta.url).pathname;
  const api=await build({stdin:{contents:`import api from ${JSON.stringify(path)};export default{fetch:(r,e,c)=>api.fetch(r,{...e,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}},c)};`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']}),coordinator=await build({entryPoints:[coordinatorPath],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
  // Match the installed local workerd binary; hosted configuration stays unchanged.
  const bindings={...Object.fromEntries(Object.entries(f.source.env).filter(([,v])=>typeof v==='string')),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'},d1Databases={ACADEMY_DB:'journal-runtime-core',ACADEMY_ADMIN_DB:'journal-runtime-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
  runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',modules:true,script:api.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],bindings,d1Databases,r2Buckets:{ACADEMY_JOURNAL_BUCKET:'journal-runtime-students'},durableObjects},{name:'coordinator',modules:true,script:coordinator.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],d1Databases,durableObjects}]}));
  for(const owner of ['core','admin']){
   const source=f.databases[owner],target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=source.prepare("SELECT type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),schema=f.prepared.schemas[owner],statements=importSQL(source,schema,{statementsOnly:true}).flatMap(sql=>sql===schema.tableSQL?objects.filter(o=>o.type==='table').map(o=>o.sql):sql===schema.afterSQL?objects.filter(o=>o.type!=='table').map(o=>o.sql):[sql]);
   for(let i=0;i<statements.length;i+=30)await target.batch(statements.slice(i,i+30).map(sql=>target.prepare(sql)));
  }
  const journal=await runtime.getR2Bucket('ACADEMY_JOURNAL_BUCKET','api');
  const send=async(path,input={},token)=>{const response=await runtime.dispatchFetch('https://academy.test/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':'LEARN',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};};
  const a=await send('account/login',{uniqueid:'separation-studentA',pin:'1234'}),b=await send('account/login',{uniqueid:'separation-studentB',pin:'1234'});assert.equal(a.status,200);assert.equal(b.status,200);
  const input={id:crypto.randomUUID(),revision:0,version:null,operationId:crypto.randomUUID(),fields:{reflection:'A real R2 journal entry'}};
  const saved=await send('academy/journal/save',input,a.body.token);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal((await send('academy/journal/save',input,a.body.token)).body.replayed,true);
  assert.equal((await send('academy/journal/sync',{},a.body.token)).body.entries.length,1);assert.deepEqual((await send('academy/journal/sync',{},b.body.token)).body.entries,[]);assert.equal((await send('academy/journal/sync',{ownerId:'sep-student-a'},b.body.token)).status,403);
  const clear=await send('academy/journal/save',{id:input.id,revision:1,version:saved.body.version,operationId:crypto.randomUUID(),fields:{reflection:'',entryDate:''}},a.body.token);assert.equal(clear.status,200,JSON.stringify(clear.body));assert.equal(clear.body.entry.reflection,'');
  for(const binding of ['ACADEMY_DB','ACADEMY_ADMIN_DB']){const target=await runtime.getD1Database(binding,'api');assert.deepEqual((await target.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'journal_%'").all()).results,[]);}
  const files=await journal.list();assert.equal(files.objects.length,1);const document=await (await journal.get(files.objects[0].key)).json();assert.equal(document.entries[0].reflection,'');const unchanged=await send('academy/journal/sync',{version:clear.body.version},a.body.token);assert.equal(unchanged.body.notModified,true);
  // Exercise near-limit JSON in workerd/R2 too; this is correctness, not a hosted CPU benchmark.
  const large={...document,entries:Array.from({length:100},()=>({...document.entries[0],id:crypto.randomUUID(),reflection:'ن'.repeat(2000)}))};
  while(new TextEncoder().encode(JSON.stringify(large)).byteLength<JOURNAL_MAX_BYTES-10000)large.entries.push({...large.entries[0],id:crypto.randomUUID()});
  assert(new TextEncoder().encode(JSON.stringify(large)).byteLength<JOURNAL_MAX_BYTES);await journal.put(files.objects[0].key,JSON.stringify(large),{customMetadata:{format:large.format}});
  const largeCopy=await send('academy/journal/sync',{},a.body.token);assert.equal(largeCopy.status,200);assert.equal(largeCopy.body.entries.length,large.entries.length);
  const tooLarge=await send('academy/journal/save',{id:large.entries[0].id,revision:large.entries[0].revision,version:largeCopy.body.version,operationId:crypto.randomUUID(),fields:{reflection:'ن'.repeat(50000)}},a.body.token);assert.equal(tooLarge.status,413);assert.equal((await send('academy/journal/sync',{version:largeCopy.body.version},a.body.token)).body.notModified,true);
 }finally{await runtime?.dispose();f.close();}
});
