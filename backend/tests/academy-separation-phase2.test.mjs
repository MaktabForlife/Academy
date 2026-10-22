import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {WEEKLY_SCHEMA,programToday} from '../src/programs/weekly-timetable.js';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';

const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){
 const f=await separationFixture();
 try{
  f.db.exec(readFileSync(new URL('../migrations/academy/0032_accepted_setup.sql',import.meta.url),'utf8'));
  f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0034_assessment_operations.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
  f.env.ACADEMY_ACCEPTED_SETUP='1';f.initial=await initialiseAcceptedSetup(f.env.ACADEMY_DB);
  f.request=async(path,input={},who='global',workspace='ADMIN',head)=>{
   const headers={'Content-Type':'application/json','X-Academy-Workspace':workspace,...(who?{Authorization:'Bearer '+await f.actor(who)}:{}),...(head?{'X-Academy-Setup':head}:{})};
   const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:JSON.stringify(input)}),f.env);
   return {status:response.status,body:await response.json()};
  };
  f.setup=(action,input={},who)=>f.request('/api/admin/platform/setup/'+action,input,who);
  f.review=async(selection={scopes:[scopes.programA]})=>{const review=ok(await f.setup('review',selection));return ok(await f.setup('freeze',{...selection,digest:review.digest}));};
  f.publish=async(batch)=>ok(await f.setup('publish',{batchId:batch.batchId,digest:batch.digest}));
  f.read=head=>acceptedDatabase(f.env.ACADEMY_DB,head||f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id);
  await fn(f);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
}
test('setup edits stay private; accepting a complete change keeps source drafts and older pinned readers',()=>use(async f=>{
 const before=await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first();
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Reviewed Program name',scopes.programA);
 f.db.prepare('UPDATE classes SET name=? WHERE activity_key=?').run('Reviewed class name',scopes.programA);
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Unrelated private name',scopes.programB);
 const draft=f.db.prepare('SELECT * FROM timetable_drafts').all();
 assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first()).name,before.name);
 const batch=await f.review();assert(batch.manifest.components.some(c=>c.table==='activities'));assert(batch.manifest.components.some(c=>c.table==='classes'));
 const accepted=await f.publish(batch);
 assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first()).name,'Reviewed Program name');
 assert.equal((await f.read(f.initial.head).prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first()).name,before.name);
 assert.notEqual((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programB).first()).name,'Unrelated private name');
 assert.equal(f.db.prepare('SELECT name FROM activities WHERE activity_key=?').get(scopes.programB).name,'Unrelated private name');
 assert.deepEqual(f.db.prepare('SELECT * FROM timetable_drafts').all(),draft);
 assert.equal((await f.publish(batch)).head,accepted.head);
}));
test('frozen source and head checks prevent changed reviews and competing acceptances',()=>use(async f=>{
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Candidate',scopes.programA);
 const a=await f.review(),b=await f.review();await f.publish(a);
 assert.equal((await f.setup('publish',{batchId:b.batchId,digest:b.digest})).body.code,'SETUP_REVIEW_CHANGED');
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Next candidate',scopes.programA);
 const stale=await f.review(),head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;
 f.db.exec('UPDATE academy_write_state SET version=version+1');
 assert.equal((await f.setup('publish',{batchId:stale.batchId,digest:stale.digest})).status,409);
 assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);
}));
test('missing components fail closed and immutable accepted vectors cannot be edited',()=>use(async f=>{
 assert.throws(()=>f.db.prepare('UPDATE setup_components SET rows_json=?').run('[]'),/immutable/);
 assert.throws(()=>f.db.exec('DELETE FROM setup_head_components'),/immutable/);
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Incomplete',scopes.programA);
 const batch=await f.review();
 f.db.exec('DROP TRIGGER setup_component_immutable_delete');
 f.db.prepare('DELETE FROM setup_components WHERE batch_id=?').run(batch.batchId);
 assert.equal((await f.setup('publish',{batchId:batch.batchId,digest:batch.digest})).body.code,'SETUP_COMPONENT_MISSING');
 assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,f.initial.head);
}));
test('current disable and live roster permissions dominate an older accepted head',()=>use(async f=>{
 f.db.prepare('UPDATE activities SET active=0 WHERE activity_key=?').run(scopes.programA);
 assert.equal((await f.read(f.initial.head).prepare('SELECT active FROM activities WHERE activity_key=?').bind(scopes.programA).first()).active,0);
 const home=ok(await f.request('/api/academy/entrance',{},'global','LEARN',f.initial.head));
 assert(!home.personalActivities.some(a=>a.id===scopes.programA.slice(8)));
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?").run(f.actors.studentB,scopes.programB);
 const learner=await f.request('/api/academy/entrance',{},'studentB','LEARN',f.initial.head);
 assert([200,401].includes(learner.status));if(learner.status===200)assert(!learner.body.personalActivities.some(a=>a.id===scopes.programB.slice(8)));
}));
test('scope and workspace checks protect source details and frozen publication',()=>use(async f=>{
 for(const who of ['teacherA','studentA'])assert.equal((await f.setup('review',{scopes:[scopes.programA]},who)).status,403);
 assert.equal((await f.setup('review',{scopes:[scopes.programB]},'adminA')).status,403);
 assert.equal((await f.setup('review',{scopes:['GLOBAL']},'adminA')).status,403);
 assert.equal((await f.request('/api/admin/platform/setup/options',{},'global','TEACH')).status,403);
 const allowed=ok(await f.setup('options',{},'adminA')).areas;assert(allowed.some(a=>a.activity_key===scopes.programA));assert(!allowed.some(a=>a.activity_key===scopes.programB));
}));
test('accepted projections hide editor JSON and retain course lifecycle and operational settings',()=>use(async f=>{
 assert.deepEqual((await f.read().prepare('SELECT * FROM course_management_drafts').all()).results,[]);
 assert.deepEqual((await f.read().prepare('SELECT * FROM timetable_drafts').all()).results,[]);
 f.db.prepare("INSERT INTO academy_settings VALUES('SyntheticOperationalCounter','99',NULL,NULL)").run();
 assert.equal((await f.read().prepare("SELECT setting_value FROM academy_settings WHERE setting_key='SyntheticOperationalCounter'").first()).setting_value,'99');
 const home=ok(await f.request('/api/academy/entrance',{},'global','TEACH',f.initial.head));assert.equal(home.workspace,'TEACH');assert.equal(home.globalAdmin,false);
 const response=await worker.fetch(new Request('http://localhost/api/academy/setup/head'),f.env);assert.equal((await response.json()).head,f.initial.head);
}));

test('shared module publication closes over dependent labels while preserving unrelated area drafts',()=>use(async f=>{
 const usage=f.db.prepare('SELECT * FROM academy_module_usage WHERE activity_key=?').get(scopes.programA);
 f.db.prepare('UPDATE academy_module_catalogue SET name=?,name_key=? WHERE module_id=?').run('Shared revised name','shared revised name',usage.academy_module_id);
 f.db.prepare('UPDATE modules SET name=? WHERE activity_key=? AND module_id=?').run('Shared revised name',scopes.programA,usage.module_id);
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Unrelated area draft',scopes.programA);
 assert.equal((await f.setup('review',{scopes:[scopes.programA]},'adminA')).body.code,'SETUP_SCOPE_FORBIDDEN');
 const batch=await f.review({scopes:['GLOBAL']});assert(batch.manifest.scopes.includes(scopes.programA));
 await f.publish(batch);
 assert.equal((await f.read().prepare('SELECT name FROM modules WHERE activity_key=? AND module_id=?').bind(scopes.programA,usage.module_id).first()).name,'Shared revised name');
 assert.notEqual((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first()).name,'Unrelated area draft');
 assert.equal(f.db.prepare('SELECT name FROM activities WHERE activity_key=?').get(scopes.programA).name,'Unrelated area draft');
}));
test('direct source edits after freezing are detected even when an old maintenance writer omitted the counter',()=>use(async f=>{
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('First review',scopes.programA);const batch=await f.review();
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Changed after review',scopes.programA);
 assert.equal((await f.setup('publish',{batchId:batch.batchId,digest:batch.digest})).body.code,'SETUP_REVIEW_CHANGED');
 assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,f.initial.head);
}));

test('the existing Program publish stages and accepts one reviewed change within the invocation query budget',()=>use(async f=>{
 const id=scopes.programA.slice(8),path='/api/admin/platform/program-timetable/',initial=ok(await f.request(path+'get',{id}));
 const module=f.db.prepare('SELECT * FROM modules WHERE activity_key=? LIMIT 1').get(scopes.programA);
 const date=new Date(Date.parse(programToday(initial.program.timezone)+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const draft={format:WEEKLY_SCHEMA,timezone:initial.program.timezone,timetableId:initial.timetableId,rules:[{id:'RULE-accepted-source',moduleId:module.module_id,programSubjectId:module.program_subject_id,classIds:['class-1'],teacherId:'account-0003',weekdays:[0,1,2,3,4,5,6],startTime:'10:00',endTime:'11:00',zoomLink:'https://zoom.us/j/11111111111'}]};
 const input={id,revision:initial.revision,draft,effectiveFrom:date,operationId:crypto.randomUUID()};
 const before=f.queries.length,published=ok(await f.request(path+'publish',input));assert(f.queries.length-before<=50);assert(published.setupPublication);
 assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,f.initial.head);
 const selection={sourceOperation:published.setupPublication};
 const review=ok(await f.setup('review',selection)),frozen=ok(await f.setup('freeze',{...selection,digest:review.digest}));
 const start=f.queries.length,accepted=await f.publish(frozen);assert(f.queries.length-start<=50);
 assert.equal((await f.read().prepare('SELECT latest_publication_id FROM program_publication_state WHERE activity_key=?').bind(scopes.programA).first()).latest_publication_id,published.publicationId);
 const replay=ok(await f.request(path+'publish',input));assert.equal(replay.replayed,true);
 assert.equal(ok(await f.setup('resolve',{sourceOperation:replay.setupPublication})).head,accepted.head);
}));

test('new Core memorisation disables take effect without publishing their accompanying configuration draft',()=>use(async f=>{
 f.db.prepare('INSERT INTO memorisation_activity_settings VALUES(?,45,0,1,?,?)').run(scopes.programA,new Date().toISOString(),f.actors.global);
 const setting=await f.read().prepare('SELECT * FROM memorisation_activity_settings WHERE activity_key=?').bind(scopes.programA).first();assert.equal(setting.active,0);assert.equal(setting.learners_per_card,20);
 f.db.prepare("UPDATE academy_settings SET setting_value='0' WHERE setting_key='PersonalMemorisationCards'").run();
 assert.equal((await f.read().prepare("SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards'").first()).setting_value,'0');
}));

test('scoped availability publication requires administration of every current teaching area',()=>use(async f=>{
 const account=f.actors.teacherA,scope='TEACHER:'+account.toUpperCase();
 f.db.prepare('INSERT INTO teacher_availability VALUES(?,?,1,?)').run(account,'[]',new Date().toISOString());
 const selection={scopes:[scope]},review=ok(await f.setup('review',selection,'adminA')),batch=ok(await f.setup('freeze',{...selection,digest:review.digest},'adminA'));
 assert.deepEqual(batch.manifest.authorityScopes.sort(),[scopes.courseA,scopes.programA].sort());
 assert.equal((await f.setup('publish',{batchId:batch.batchId,digest:batch.digest},'adminA')).status,200);
 f.db.prepare('UPDATE teacher_availability SET ranges_json=? WHERE account_id=?').run('[{"id":"next","weekday":1,"startTime":"08:00","endTime":"10:00"}]',account);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('extra-teaching-area',?,?,'TEACHER',1,'CONFIRMED')").run(account,scopes.programB);
 assert.equal((await f.setup('review',selection,'adminA')).status,403);
}));

 test('accepted setup removes broad Teacher media management even with a forged Admin workspace',()=>use(async f=>{
  const made=ok(await f.request('/api/academy/lesson-media/course-files-create',{activityKey:scopes.courseA,operationId:crypto.randomUUID()}));
  await f.publish(await f.review({scopes:[scopes.courseA],families:['media']}));
  const listed=ok(await f.request('/api/academy/lesson-media/list',{activityKey:scopes.courseA},'teacherA','TEACH'));
  assert.equal(listed.canManage,false);
  for(const workspace of ['TEACH','ADMIN']){
   const result=await f.request('/api/academy/lesson-media/save',{activityKey:scopes.courseA,lessonId:made.lessonId,revision:1,operationId:crypto.randomUUID(),title:'Forbidden',summary:'',state:'PUBLISHED',commentsClosed:true,recordingUrls:[]},'teacherA',workspace);
   assert.equal(result.status,403,JSON.stringify(result.body));
  }
 }));
