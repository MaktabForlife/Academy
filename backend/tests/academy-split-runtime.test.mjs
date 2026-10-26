import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {importSQL} from '../tools/academy-split/artifact.mjs';
import {createHash} from 'node:crypto';
test('the actual Workers runtime coordinates both D1 bindings through private Durable Object RPC',async()=>{
 const f=await splitFixture();let runtime;try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 const apiPath=new URL('../src/academy-runtime.js',import.meta.url).pathname,coordinatorPath=new URL('../src/academy-split-coordinator.js',import.meta.url).pathname;
 const api=await build({stdin:{contents:`import api from ${JSON.stringify(apiPath)};export default{fetch:(r,e,c)=>api.fetch(r,{...e,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}},c)};`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']}),coordinator=await build({entryPoints:[coordinatorPath],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']});
 const bindings={...Object.fromEntries(Object.entries(f.source.env).filter(([,v])=>typeof v==='string')),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'},d1Databases={ACADEMY_DB:'split-runtime-core',ACADEMY_ADMIN_DB:'split-runtime-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
 runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',modules:true,script:api.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],bindings,d1Databases,durableObjects,r2Buckets:{MEDIA_BUCKET:'split-runtime-public',LESSON_MEDIA_BUCKET:'split-runtime-private',ASSESSMENT_BUCKET:'split-runtime-assessments'}},{name:'coordinator',modules:true,script:coordinator.outputFiles[0].text,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],d1Databases,durableObjects}]}));
 for(const owner of ['core','admin']){
  const db=f.databases[owner],target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=db.prepare("SELECT type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),schema=f.prepared.schemas[owner],list=importSQL(db,schema,{statementsOnly:true}).flatMap(sql=>sql===schema.tableSQL?objects.filter(o=>o.type==='table').map(o=>o.sql):sql===schema.afterSQL?objects.filter(o=>o.type!=='table').map(o=>o.sql):[sql]);
  for(let i=0;i<list.length;i+=30)await target.batch(list.slice(i,i+30).map(sql=>target.prepare(sql)));
 }
 const request=async(path,input,token,workspace='ADMIN')=>{const r=await runtime.dispatchFetch('https://academy.test'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':workspace,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const login=await request('/api/account/login',{uniqueid:'separation-global',pin:'1234'}),token=login.token,scope=f.scopes.courseA;
 const storage=await runtime.getR2Bucket('LESSON_MEDIA_BUCKET','api'),permissions=await storage.list({prefix:'academy-private-permissions/'});assert.equal(permissions.objects.length,1,'Sign-in creates the private permission snapshot');
 const cached=await (await storage.get(permissions.objects[0].key)).json();assert(!Object.hasOwn(cached.data,'account'));assert(!JSON.stringify(cached).includes('pin_hash'));
 const firstDashboard=await request('/api/academy/assessments/list',{view:'admin',dashboard:true},token),secondDashboard=await request('/api/academy/assessments/list',{view:'admin',dashboard:true},token);assert.deepEqual(secondDashboard,firstDashboard);assert.equal((await storage.list({prefix:'academy-private-snapshots/'})).objects.length,1);
 const media=await request('/api/academy/lesson-media/course-files-create',{activityKey:scope,operationId:crypto.randomUUID()},token);assert(media.lessonId);
 const selection={scopes:[scope]},review=await request('/api/admin/platform/setup/review',selection,token),frozen=await request('/api/admin/platform/setup/freeze',{...selection,digest:review.digest},token),accepted=await request('/api/admin/platform/setup/publish',{batchId:frozen.batchId,digest:frozen.digest},token);assert(accepted.head);
 const admin=await runtime.getD1Database('ACADEMY_ADMIN_DB','api'),core=await runtime.getD1Database('ACADEMY_DB','api');assert.equal((await admin.prepare('SELECT count(*) n FROM split_command_parts').first()).n,0);assert.equal((await core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);
 await admin.prepare('UPDATE activities SET name=? WHERE activity_key=?').bind('Automatically refreshed runtime Program',f.scopes.programA).run();
 const publicSelection={scopes:[f.scopes.programA]},publicReview=await request('/api/admin/platform/setup/review',publicSelection,token),publicFrozen=await request('/api/admin/platform/setup/freeze',{...publicSelection,digest:publicReview.digest},token),publicAccepted=await request('/api/admin/platform/setup/publish',{batchId:publicFrozen.batchId,digest:publicFrozen.digest},token);
 assert.deepEqual(publicAccepted.cacheRefreshPending,['public-timetable']);
 assert.deepEqual((await request('/api/academy/cache/refresh',{},token)).completed,['public-timetable']);
 const publicStorage=await runtime.getR2Bucket('MEDIA_BUCKET','api'),publicObjects=await publicStorage.list({prefix:'academy-public-timetable/'}),publicObject=publicObjects.objects.find(o=>o.key.endsWith('.accepted-'+publicAccepted.head));assert(publicObject,'The unchanged coordinator handles the public refresh marker and accepted projection');
 assert((await (await publicStorage.get(publicObject.key)).json()).timetable.some(r=>r.activityName==='Automatically refreshed runtime Program'));
 const marker=JSON.parse((await core.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='AcademyRefresh:public-timetable'").first()).setting_value);assert.equal(marker.published,marker.requested);
 const operation=()=>({operationId:crypto.randomUUID()}),path='/api/academy/assessments/',activityKey=f.scopes.programA;
 const register=await request(path+'register-create',{...operation(),name:'Runtime snapshot',activityKeys:[activityKey],classMode:'ALL',status:'REGISTERED'},token);
 const saved=await request(path+'schedule-batch',{...operation(),registerId:register.registerId,revision:1,rows:[{activityKey,classId:'class-1',title:'Runtime published paper',subject:'Qasas',examDate:'2099-11-09',durationMinutes:60,maximumMark:100}]},token);
 await request(path+'register-release',{...operation(),registerId:register.registerId,revision:saved.revision},token);
 const assessmentReview=await request('/api/admin/platform/setup/review',{scopes:[activityKey]},token),assessmentFrozen=await request('/api/admin/platform/setup/freeze',{scopes:[activityKey],digest:assessmentReview.digest},token);
 const assessmentAccepted=await request('/api/admin/platform/setup/publish',{batchId:assessmentFrozen.batchId,digest:assessmentFrozen.digest},token);
 const definitionObjects=await storage.list({prefix:'academy-published-assessments/'});assert.equal(definitionObjects.objects.length,1,'Publication warms the actual private R2 snapshot');
 const definition=await (await storage.get(definitionObjects.objects[0].key)).json();assert.equal(definition.head,assessmentAccepted.head);assert.equal(definition.rows[0].assessment_id,saved.assessmentIds[0]);assert(!Object.hasOwn(definition.rows[0],'paper_file_id'));
 const learner=await request('/api/account/login',{uniqueid:f.source.db.prepare("SELECT login_link_id FROM accounts WHERE account_id='account-0002'").get().login_link_id,pin:'1234'},undefined,'LEARN');
 const learnerList=await request(path+'list',{},learner.token,'LEARN');assert.equal(learnerList.assessments[0].id,saved.assessmentIds[0]);
 assert.deepEqual(await request(path+'list',{},learner.token,'LEARN'),learnerList);
 assert.equal((await request(path+'get',{assessmentId:saved.assessmentIds[0]},learner.token,'LEARN')).assessment.title,'Runtime published paper');
 const assessmentId=saved.assessmentIds[0],marks=await request(path+'marks-list',{assessmentId},token),c=marks.classes[0],person=c.students[0];
 await request(path+'marks-save',{...operation(),assessmentId,groupRevisions:[{id:assessmentId,revision:c.revision}],entries:[{assessmentId,accountId:person.accountId,recipientRevision:person.revision,markId:person.markId,mark:0}]},token);
 let detail=await request(path+'get',{assessmentId},token),entry=(await request(path+'list',{view:'admin'},token)).registers.find(r=>r.id===register.registerId);
 await request(path+'table-save',{...operation(),registerId:entry.id,revision:entry.revision,rows:[{assessmentId,revision:detail.assessment.revision,changes:{marksModerated:true}}]},token);
 let marking=await request(path+'register-marking-validate',{registerId:entry.id},token);assert.equal(marking.valid,true);
 const plan=await request(path+'register-reports-plan',{registerId:entry.id},token),reportRows=[];
 for(const target of plan.classes)for(const person of target.learners){
  const bytes=Buffer.from('%PDF-1.4\n% split report\n%%EOF'),sha256=createHash('sha256').update(bytes).digest('hex'),metadata={...operation(),kind:'REPORT',assessmentId,accountId:person.id,mimeType:'application/pdf',filename:'report.pdf',size:bytes.length,sha256};
  const response=await runtime.dispatchFetch('https://academy.test'+path+'upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'},body:bytes}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));reportRows.push({activityKey:target.activityKey,classId:target.classId,accountId:person.id,fileId:body.fileId,sha256});
 }
 const layout={fields:[{key:'learner',x:.1,y:.1,width:.8,height:.1,fontSize:14},{key:'results',x:.1,y:.3,width:.8,height:.4,fontSize:12},{key:'total',x:.1,y:.8,width:.8,height:.1,fontSize:14}]};
 await request(path+'register-reports-generate',{...operation(),registerId:entry.id,fingerprint:plan.fingerprint,reviewed:true,reports:reportRows,designs:plan.classes.map(c=>({activityKey:c.activityKey,classId:c.classId,layout}))},token);
 assert.equal((await request(path+'report-list',{assessmentId},learner.token,'LEARN')).reports.length,0);
 marking=await request(path+'register-marking-validate',{registerId:entry.id},token);assert.equal(marking.reportsReady,true);
 await request(path+'register-marks-release',{...operation(),...marking,confirm:true,releaseReports:true},token);
 assert.equal((await request(path+'report-list',{assessmentId},learner.token,'LEARN')).reports.length,1);
 assert.equal((await request(path+'list',{},learner.token,'LEARN')).assessments.find(a=>a.id===assessmentId).releasedMark,0);
 }finally{await runtime?.dispose();f.close();}
});
