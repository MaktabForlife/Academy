import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {acceptedRepository} from '../src/academy/d1/setup-reader.js';
import {publishedAssessmentRows} from '../src/academy/d1/published-assessments.js';
import {selectWorkspace} from '../src/academy/d1/workspace-access.js';
import {d1Assessments} from '../src/academy/d1/assessments.js';
import {federationContext} from '../src/academy/separation/federation.js';

const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()});
const snapshotPrefix='academy-published-assessments/';
function bucket(){const objects=new Map();return {objects,puts:[],async get(key){const value=objects.get(key);return value===undefined?null:{size:new TextEncoder().encode(value).length,json:async()=>JSON.parse(value)};},async put(key,value){objects.set(key,value);this.puts.push(key);}};}
async function use(fn){const f=await splitFixture();try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");f.bucket=bucket();
 Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1',LESSON_MEDIA_BUCKET:f.bucket});
 f.request=async(action,input={},who='global',workspace='ADMIN',headers={})=>{const token=await f.source.actor(who),r=await worker.fetch(new Request('http://localhost/api/academy/assessments/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':workspace,...headers},body:JSON.stringify(input)}),f.source.env);return {status:r.status,body:await r.json()};};
 f.accept=async(scopes=[f.scopes.programA])=>(await acceptFixtureSetup(f.source.env,await f.source.actor('global'),scopes)).head;
 f.seed=async(overrides={})=>{const key=f.scopes.programA;
  for(const who of ['studentA','studentB']){
   f.databases.core.prepare("INSERT OR IGNORE INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,'STUDENT',1,'CONFIRMED')").run('snapshot-role-'+who,f.actors[who],key);
   f.databases.core.prepare("INSERT INTO class_memberships VALUES(?,?,'class-1',?,NULL,NULL,1)").run(key,'snapshot-member-'+who,f.actors[who]);
  }
  const registerId=ok(await f.request('register-create',{...op(),name:'Published snapshot',activityKeys:[key],classMode:'ALL',status:'REGISTERED'})).registerId;
  const saved=ok(await f.request('schedule-batch',{...op(),registerId,revision:1,rows:[{activityKey:key,classId:'class-1',title:'Snapshot assignment',subject:'Qasas',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',availableFrom:new Date(Date.now()-3600000).toISOString(),dueDate:new Date(Date.now()+86400000*7).toISOString().slice(0,10),maximumMark:100,...overrides}]}));
  ok(await f.request('register-release',{...op(),registerId,revision:saved.revision}));return {id:saved.assessmentIds[0],registerId,head:await f.accept()};
 };
 await fn(f);for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{f.close();}}
const normalize=body=>{const value=structuredClone(body);if(value.assessment)delete value.assessment.serverNow;return value;};

test('publication warms one shared definition snapshot; learners retain exactly the database response',()=>use(async f=>{
 const {id,head}=await f.seed(),keys=[...f.bucket.objects.keys()].filter(k=>k.startsWith(snapshotPrefix));assert.equal(keys.length,1,'The publication prepares a learner snapshot');
 const stored=JSON.parse(f.bucket.objects.get(keys[0]));assert.equal(stored.head,head);assert.equal(stored.rows[0].assessment_id,id);
 for(const key of ['account_id','accountId','mark','feedback','paper_file_id','paper_state','paper_released_at','schedule_published','examiner_id','revision'])assert(!Object.hasOwn(stored.rows[0],key),key+' is never shared');
 const puts=f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length;
 for(const who of ['studentA','studentB'])for(const action of ['list','get']){
  const input=action==='list'?{activityKey:f.scopes.programA}:{assessmentId:id};
  const cached=ok(await f.request(action,input,who,'LEARN'));
  f.source.env.LESSON_MEDIA_BUCKET=null;const direct=ok(await f.request(action,input,who,'LEARN'));f.source.env.LESSON_MEDIA_BUCKET=f.bucket;
  assert.deepEqual(normalize(cached),normalize(direct),who+' '+action);
 }
 assert.equal(f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length,puts,'A second learner reuses the publication');
 const preview=ok(await f.request('list',{activityKey:f.scopes.programB},'studentA','LEARN'));assert.deepEqual(preview.assessments,[]);
 const list=ok(await f.request('list',{activityKey:f.scopes.programA},'studentA','LEARN'));assert.equal(list.assessments[0].registerStatus,'SCHEDULED');
}));

test('saved/released marks and collection changes stay live and individual while definitions are reused',()=>use(async f=>{
 const {id,registerId}=await f.seed(),before=f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length;
 assert.equal((await f.request('marks-list',{assessmentId:id})).status,200);
 const table=ok(await f.request('list',{view:'admin'})),row=table.assessments.find(a=>a.id===id),register=table.registers.find(r=>r.id===registerId);
 ok(await f.request('table-save',{...op(),registerId,revision:register.revision,rows:[{assessmentId:id,revision:row.revision,changes:{marksModerated:true}}]}));
 const list=ok(await f.request('marks-list',{assessmentId:id})),c=list.classes[0],r=c.students.find(s=>s.accountId===f.actors.studentA);
 ok(await f.request('marks-save',{...op(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:0}]}));
 assert(!Object.hasOwn(ok(await f.request('list',{},'studentA','LEARN')).assessments[0],'releasedMark'));
 let detail=ok(await f.request('get',{assessmentId:id}));
 assert.equal((await f.request('release',{...op(),assessmentId:id,revision:detail.assessment.revision,category:'marks',selection:'CLASS'})).body.code,'IMTIHAAN_RELEASE_REQUIRED');
 // The full release pipeline is tested separately; simulate its released pointer
 // to isolate current learner projection from immutable definition caching.
 f.databases.core.prepare('UPDATE assessment_recipients SET released_mark_id=latest_mark_id WHERE assessment_id=? AND account_id=?').run(id,f.actors.studentA);
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].releasedMark,0);
 assert(!Object.hasOwn(ok(await f.request('list',{},'studentB','LEARN')).assessments[0],'releasedMark'));
 detail=ok(await f.request('get',{assessmentId:id}));ok(await f.request('collection-save',{...op(),assessmentId:id,revision:detail.assessment.revision,collectionRevision:detail.assessment.collectionRevision,closed:true}));
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].collectionClosed,true);
 assert.equal(f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length,before,'Operational changes never rebuild immutable definitions');
 f.databases.core.prepare('UPDATE assessments SET schedule_published=0 WHERE assessment_id=?').run(id);
 assert.deepEqual(ok(await f.request('list',{},'studentA','LEARN')).assessments,[]);
 assert.equal((await f.request('get',{assessmentId:id},'studentA','LEARN')).status,403);
}));

test('snapshots keep accepted heads pinned and fall back safely during storage outages',()=>use(async f=>{
 const {id,head,registerId}=await f.seed();const register=ok(await f.request('list',{view:'admin'})).registers.find(r=>r.id===registerId);
 // A saved Admin rename remains private until the next accepted publication.
 ok(await f.request('register-save',{...op(),registerId,revision:register.revision,name:'Published replacement name',activityKeys:[f.scopes.programA],classMode:'ALL',status:'SCHEDULED'}));
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].phaseName,'Published snapshot');
 const newer=await f.accept([f.scopes.programA,'GLOBAL']);assert.notEqual(newer,head);
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].phaseName,'Published replacement name');
 assert.equal(ok(await f.request('list',{},'studentA','LEARN',{'X-Academy-Setup':head})).assessments[0].phaseName,'Published snapshot');
 assert.equal([...f.bucket.objects.keys()].filter(k=>k.startsWith(snapshotPrefix)).length,1,'Historical readers cannot grow one object per head');
 f.bucket.get=async()=>{throw Error('Synthetic storage outage');};f.bucket.put=async()=>{throw Error('Synthetic storage outage');};
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].phaseName,'Published replacement name');
}));

for(const storage of ['get','put'])test('revocation while a learner waits for shared snapshot '+storage+' rejects access',()=>use(async f=>{
 const {id}=await f.seed();await f.request('get',{assessmentId:id},'studentA','LEARN');
 if(storage==='put')f.bucket.objects.clear();
 const original=f.bucket[storage].bind(f.bucket);f.bucket[storage]=async(key,...args)=>{const result=await original(key,...args);if(key.startsWith(snapshotPrefix))f.databases.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(new Date().toISOString(),f.actors.studentA);return result;};
 assert.equal((await f.request('get',{assessmentId:id},'studentA','LEARN')).status,401);
}));

test('a published definition never caches the paper opening decision or its current release',()=>use(async f=>{
 const opens=Date.now()+3600000,{id}=await f.seed({availableFrom:new Date(opens).toISOString()});
 const detail=()=>f.request('get',{assessmentId:id}).then(ok),paper=Buffer.from('%PDF-1.4\n% local snapshot fixture\n%%EOF'),metadata={...op(),assessmentId:id,revision:(await detail()).assessment.revision,kind:'PAPER',filename:'snapshot.pdf',mimeType:'application/pdf',size:paper.length,sha256:createHash('sha256').update(paper).digest('hex')};
 const uploaded=await worker.fetch(new Request('http://localhost/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+await f.source.actor('global'),'X-Academy-Workspace':'ADMIN'},body:paper}),f.source.env),file=ok({status:uploaded.status,body:await uploaded.json()});
 ok(await f.request('review-paper',{...op(),assessmentId:id,revision:(await detail()).assessment.revision,decision:'APPROVE',paperReview:{fileId:file.fileId,sha256:file.sha256}}));await f.accept();
 ok(await f.request('release-papers',{...op(),papers:[{id,revision:(await detail()).assessment.revision}]}));
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].paperAvailable,false);
 const puts=f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length,clock=Date.now;
 try{Date.now=()=>opens+1000;assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].paperAvailable,true);}finally{Date.now=clock;}
 assert.equal(f.bucket.puts.filter(k=>k.startsWith(snapshotPrefix)).length,puts,'The clock changes no immutable snapshot');
 f.databases.core.prepare('UPDATE assessments SET paper_released_at=NULL WHERE assessment_id=?').run(id);
 assert.equal(ok(await f.request('list',{},'studentA','LEARN')).assessments[0].paperAvailable,false);
}));

test('warm learner definitions skip the published joins and still reject a changed role',()=>use(async f=>{
 const {id}=await f.seed({classes:[{activityKey:f.scopes.programA,classId:'class-1'},{activityKey:f.scopes.programA,classId:'class-shared'}]}),repository=academyD1Repository(f.source.env);await repository.ready();
 const state=await repository.byId(f.actors.studentA),session=await repository.createSession(state,state.contexts[0]),auth=selectWorkspace(new Request('http://localhost',{headers:{'X-Academy-Workspace':'LEARN'}}),{state,sid:session.sid,user:{accountid:state.account.account_id,role:state.contexts[0].role}});repository.bindActor(auth);const reader=acceptedRepository(repository,await f.core.prepare('SELECT head_id FROM setup_head_state WHERE singleton=1').first('head_id'));
 let joins=0;const liveIds=[],prepare=f.databases.core.prepare.bind(f.databases.core);f.databases.core.prepare=sql=>{if(sql.includes('LIMIT 10001'))joins++;const statement=prepare(sql);if(sql.includes('FROM json_each(?) selected JOIN main.assessments live')){const all=statement.all.bind(statement);statement.all=(...args)=>{liveIds.push(JSON.parse(args[0]).map(r=>r.id));return all(...args);};}return statement;};
 await publishedAssessmentRows(reader,auth,{ids:[id]});await publishedAssessmentRows(reader,auth,{ids:[id]});assert.equal(joins,0,'A warm shared snapshot does not reconstruct assessment/class/phase definitions');
 const direct=await d1Assessments(reader,auth).run('list',{});assert.equal(direct.assessments.length,1);assert.equal(direct.assessments[0].paperAvailable,false);assert.deepEqual(liveIds.at(-1),[id],'A normal learner reads current facts only for their own assessment');
 f.databases.core.prepare('UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?').run(f.actors.studentA,f.scopes.programA);
 await assert.rejects(publishedAssessmentRows(reader,auth,{ids:[id]}),{code:'SESSION_ENDED'});
}));

test('Core federation captures only Admin counters while preserving summed write revisions',()=>use(async f=>{
 const stamp=new Date().toISOString();f.databases.core.prepare('INSERT INTO academy_settings VALUES(?,?,?,NULL)').run('AcademyWrite:small','4',stamp);
 f.databases.admin.prepare('INSERT INTO academy_settings VALUES(?,?,?,NULL)').run('AcademyWrite:small','7',stamp);
 f.databases.admin.prepare('INSERT INTO academy_settings VALUES(?,?,?,NULL)').run('PrivateUnpublishedSetting','never share',stamp);
 const context=federationContext({core:f.core,admin:f.admin,owner:'core'}),snapshot=await context.snapshot(['SELECT * FROM academy_settings']);
 assert.equal(snapshot.academy_settings.find(r=>r.setting_key==='AcademyWrite:small').setting_value,'11');
 assert(!snapshot.academy_settings.some(r=>r.setting_key==='PrivateUnpublishedSetting'));
 assert(snapshot.__splitSources.admin.academy_settings.every(r=>r.setting_key.startsWith('AcademyWrite:')));
}));
