import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {messagingFixture} from './fixtures/academy-messaging-fixture.mjs';
import {importSQL} from '../tools/academy-split/artifact.mjs';
test('the actual Workers runtime sends 200 unique recipients through the physical Core/Admin boundary',async()=>{
 const f=await messagingFixture({split:true});let runtime;try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 const apiPath=new URL('../src/academy-runtime.js',import.meta.url).pathname,coordinatorPath=new URL('../src/academy-split-coordinator.js',import.meta.url).pathname;
 const api=await build({stdin:{contents:`import api from ${JSON.stringify(apiPath)};export default{fetch:(r,e,c)=>api.fetch(r,{...e,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}},c)};`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']}),coordinator=await build({entryPoints:[coordinatorPath],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
 const bindings={...Object.fromEntries(Object.entries(f.source.env).filter(([,v])=>typeof v==='string')),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'},d1Databases={ACADEMY_DB:'split-runtime-core',ACADEMY_ADMIN_DB:'split-runtime-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
 runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',modules:true,script:api.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],bindings,d1Databases,durableObjects,r2Buckets:{LESSON_MEDIA_BUCKET:'split-runtime-private'}},{name:'coordinator',modules:true,script:coordinator.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],d1Databases,durableObjects}]}));
 for(const owner of ['core','admin']){
  const db=f.databases[owner],target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=db.prepare("SELECT type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),schema=f.prepared.schemas[owner],list=importSQL(db,schema,{statementsOnly:true}).flatMap(sql=>sql===schema.tableSQL?objects.filter(o=>o.type==='table').map(o=>o.sql):sql===schema.afterSQL?objects.filter(o=>o.type!=='table').map(o=>o.sql):[sql]);
  for(let i=0;i<list.length;i+=30)await target.batch(list.slice(i,i+30).map(sql=>target.prepare(sql)));
 }
 const request=async(path,input,token,workspace='LEARN')=>{const r=await runtime.dispatchFetch('https://academy.test'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':workspace,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const login=await request('/api/account/login',{uniqueid:f.source.db.prepare("SELECT login_link_id FROM accounts WHERE account_id='account-0002'").get().login_link_id,pin:'1234'}),token=login.token;
 const path='/api/academy/messaging/',saved=await request(path+'save',{subject:'Worker runtime test',body:'One real local Worker send. حفظ الدرس',targets:{scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'messaging-200'}]},operationId:crypto.randomUUID()},token);
 const review=await request(path+'review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},token);assert.equal(review.recipientCount,200);
 const input={reviewId:review.reviewId,operationId:crypto.randomUUID()},sent=await request(path+'confirm',input,token);assert.equal(sent.state,'SENT');assert((await request(path+'confirm',input,token)).replayed);
 const summary=await request(path+'summary',{},token);assert.equal(summary.counts.unread,1);
 await request(path+'get',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},token);
 const core=await runtime.getD1Database('ACADEMY_DB','api'),admin=await runtime.getD1Database('ACADEMY_ADMIN_DB','api');
 assert.equal((await core.prepare('SELECT count(*) n FROM messaging_recipients').first()).n,200);
 assert.equal((await admin.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'messaging_%'").first()).n,0);
 }finally{await runtime?.dispose();f.close();}
});
