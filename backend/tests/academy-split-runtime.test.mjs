import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {importSQL} from '../tools/academy-split/artifact.mjs';
import {createHash} from 'node:crypto';
import {seedReadHistory} from './fixtures/academy-read-history-fixture.mjs';
test('the actual Workers runtime coordinates both D1 bindings through private Durable Object RPC',async()=>{
 const f=await splitFixture();let runtime;try{
 seedReadHistory(f,2);
 const historyBatch=f.databases.core.prepare('SELECT batch_id FROM setup_batches LIMIT 1').get().batch_id;
 const largeHistory=JSON.stringify([{document_json:'Synthetic archived course wording. '.repeat(36000)}]);
 for(let i=0;i<14;i++)f.databases.core.prepare('INSERT INTO setup_components VALUES(?,?,?,?,?,?,?)').run('large-course-history-'+i,historyBatch,'program_surah_website_documents','PROGRAM:synthetic-history-'+i,largeHistory,1,'a'.repeat(64));
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
 const planInput={activityKey:f.scopes.programA,period:'WEEKLY',weekStart:'2026-10-19'};
 const weeklyPlan=await request('/api/academy/planning/get',planInput,token);assert(weeklyPlan.choices.classes.length>0,'Admin published projections cross real private RPC with their component scope');
 assert.deepEqual(await request('/api/academy/planning/get',planInput,token),weeklyPlan);
 const firstDashboard=await request('/api/academy/assessments/list',{view:'admin',dashboard:true},token),secondDashboard=await request('/api/academy/assessments/list',{view:'admin',dashboard:true},token);assert.deepEqual(secondDashboard,firstDashboard);assert.equal((await storage.list({prefix:'academy-private-snapshots/'})).objects.length,1);
 const media=await request('/api/academy/lesson-media/course-files-create',{activityKey:scope,operationId:crypto.randomUUID()},token);assert(media.lessonId);
 const mediaSaved=await request('/api/academy/lesson-media/save',{activityKey:scope,lessonId:media.lessonId,revision:1,operationId:crypto.randomUUID(),title:'Runtime Course PDFs',summary:'',recordingUrls:[],state:'PUBLISHED',commentsClosed:true},token);
 const accepted=await request('/api/academy/changes/accept',mediaSaved.acceptedChange,token);assert(accepted.head);
 const admin=await runtime.getD1Database('ACADEMY_ADMIN_DB','api'),core=await runtime.getD1Database('ACADEMY_DB','api');assert.equal((await admin.prepare('SELECT count(*) n FROM split_command_parts').first()).n,0);assert.equal((await core.prepare('SELECT count(*) n FROM split_write_fence').first()).n,0);
 const program=(await request('/api/admin/platform/programs/list',{},token)).programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA);
 const publicSaved=await request('/api/admin/platform/programs/save',{id:program.id,name:'Automatically refreshed runtime Program',status:program.status,revision:program.revision,durationYears:program.durationYears,timezone:program.timezone,operationId:crypto.randomUUID()},token);assert(publicSaved.acceptedChange);assert(!publicSaved._acceptedChange);
 const publicAccepted=await request('/api/academy/changes/accept',publicSaved.acceptedChange,token);
 assert.deepEqual(publicAccepted.cacheRefreshPending,['public-timetable']);
 assert.deepEqual((await request('/api/academy/cache/refresh',{},token)).completed,['public-timetable']);
 const publicStorage=await runtime.getR2Bucket('MEDIA_BUCKET','api'),publicObjects=await publicStorage.list({prefix:'academy-public-timetable/'}),publicObject=publicObjects.objects.find(o=>o.key.endsWith('.accepted-'+publicAccepted.head));assert(publicObject,'The unchanged coordinator handles the public refresh marker and accepted projection');
 assert((await (await publicStorage.get(publicObject.key)).json()).timetable.some(r=>r.activityName==='Automatically refreshed runtime Program'));
 const marker=JSON.parse((await core.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='AcademyRefresh:public-timetable'").first()).setting_value);assert.equal(marker.published,marker.requested);
 // Course websites cross the same real private RPC boundary. A draft is never a reader definition.
 const website=(await request('/api/admin/platform/course-websites/get',{activityKey:scope},token)),fileBytes=Buffer.from('%PDF-1.7\n% course website runtime\n%%EOF'),assetId=crypto.randomUUID(),uploadInput={activityKey:scope,assetId,filename:'website-reading.pdf',type:'application/pdf',size:fileBytes.length,sha256:createHash('sha256').update(fileBytes).digest('hex'),operationId:crypto.randomUUID()};
 const uploaded=await runtime.dispatchFetch('https://academy.test/api/admin/platform/course-websites/upload?metadata='+encodeURIComponent(JSON.stringify(uploadInput)),{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'},body:fileBytes});assert.equal(uploaded.status,200,await uploaded.text());
 website.document.name='Runtime course website';website.document.materials.files.push({id:crypto.randomUUID(),assetId,title:'A private course reading',description:'Uploaded in the real Workers runtime.'});
 const websiteSaved=await request('/api/admin/platform/course-websites/save',{activityKey:scope,document:website.document,revision:0,operationId:crypto.randomUUID()},token);assert(!websiteSaved.acceptedChange);assert.equal((await core.prepare('SELECT document_json FROM course_website_documents WHERE activity_key=?').bind(scope).first()).document_json,null);
 const websitePublished=await request('/api/admin/platform/course-websites/publish',{activityKey:scope,revision:websiteSaved.revision,operationId:crypto.randomUUID()},token),websiteHead=await request('/api/academy/changes/accept',websitePublished.acceptedChange,token);
 const websiteStudent=await request('/api/account/login',{uniqueid:'separation-studentA',pin:'1234'},undefined,'LEARN'),websiteRead=await request('/api/academy/course-websites/read',{activityKey:scope},websiteStudent.token,'LEARN');assert.equal(websiteRead.document.name,'Runtime course website');assert.equal(websiteRead.assets[0].id,assetId);assert(!JSON.stringify(websiteRead).includes('object_key'));
 const downloaded=await runtime.dispatchFetch('https://academy.test/api/academy/course-websites/asset',{method:'POST',headers:{Authorization:'Bearer '+websiteStudent.token,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,assetId})});assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),fileBytes);
 await request('/api/admin/platform/course-websites/withdraw',{activityKey:scope,revision:websitePublished.revision,operationId:crypto.randomUUID()},token);
 const withdrawn=await runtime.dispatchFetch('https://academy.test/api/academy/course-websites/read',{method:'POST',headers:{Authorization:'Bearer '+websiteStudent.token,'X-Academy-Workspace':'LEARN','X-Academy-Setup':websiteHead.head,'Content-Type':'application/json'},body:JSON.stringify({activityKey:scope})});assert.equal(withdrawn.status,404);

 const operation=()=>({operationId:crypto.randomUUID()}),path='/api/academy/assessments/',activityKey=f.scopes.programA;
 const register=await request(path+'register-create',{...operation(),name:'Runtime snapshot',activityKeys:[activityKey],classMode:'ALL',status:'REGISTERED'},token);
 const saved=await request(path+'schedule-batch',{...operation(),registerId:register.registerId,revision:1,rows:[{activityKey,classId:'class-1',title:'Runtime published paper',subject:'Qasas',examDate:'2099-11-09',durationMinutes:60,maximumMark:100}]},token);
 const schedulePublished=await request(path+'register-release',{...operation(),registerId:register.registerId,revision:saved.revision},token);
 const assessmentAccepted=await request('/api/academy/changes/accept',schedulePublished.acceptedChange,token);
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
