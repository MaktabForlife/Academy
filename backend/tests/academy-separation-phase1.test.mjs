import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {separationFixture,separationScopes as scopes,separationActors as actors} from './fixtures/academy-separation-fixture.mjs';
const op=()=>({operationId:crypto.randomUUID()});
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){const f=await separationFixture();
 f.request=async(path,input,who='global',workspace='LEARN',bytes)=>{
  const token=await f.actor(who),headers={Authorization:'Bearer '+token,...(workspace===null?{}:{'X-Academy-Workspace':workspace}),...(bytes?{}:{'Content-Type':'application/json'})};
  const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:bytes||JSON.stringify(input||{})}),f.env);
  return {status:response.status,headers:response.headers,body:response.headers.get('Content-Type')==='application/pdf'?await response.text():await response.json()};
 };
 try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.close();}
}
async function exam(f){
 const scope=scopes.programA;
 for(const who of ['studentA','dual'])f.db.prepare('INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,?,?,?,1)').run(scope,'sep-'+who,'class-1',actors[who]);
 for(const who of ['teacherA','dual'])f.db.prepare("INSERT INTO class_teacher_assignments VALUES(?,?,?,'ADDITIONAL')").run(scope,'class-1',actors[who]);
 const input={...op(),activityKey:scope,classId:'class-1',examinerId:actors.teacherA,title:'Boundary paper',subject:'Qasas',examDate:'2026-01-01',durationMinutes:60,maximumMark:100};
 const id=ok(await f.request('/api/academy/assessments/create',input,'global','ADMIN')).assessmentId;
 const detail=()=>f.request('/api/academy/assessments/get',{assessmentId:id},'global','ADMIN').then(ok);
 ok(await f.request('/api/academy/assessments/publish',{...op(),assessmentId:id,revision:(await detail()).assessment.revision},'global','ADMIN'));
 const file=ok(await f.upload({kind:'PAPER',assessmentId:id,revision:(await detail()).assessment.revision},await f.actor('teacherA')));
 ok(await f.request('/api/academy/assessments/review-paper',{...op(),assessmentId:id,revision:(await detail()).assessment.revision,decision:'APPROVE'},'global','ADMIN'));
 ok(await f.request('/api/academy/assessments/release-papers',{...op(),papers:[{id,revision:(await detail()).assessment.revision}]},'global','ADMIN'));
 return {id,input,paperId:file.fileId};
}
test('one real identity has separate Learn, Teach and Admin projections; headerless reads are Learn',()=>use(async f=>{
 for(const mode of ['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH']){
  const home=ok(await f.request('/api/academy/entrance',{},'global',mode));
  assert.equal(home.workspace,mode);assert.equal(home.workspaceAccess.admin,true);
  assert.equal(home.globalAdmin,mode==='ADMIN');
  if(mode!=='ADMIN'){
   if(mode.startsWith('ADMIN_'))assert(home.personalActivities.length>0);else assert(!home.personalActivities.some(a=>a.kind+':'+a.id===scopes.programA||a.kind+':'+a.id===scopes.courseA));assert(home.personalActivities.every(a=>a.roles.every(r=>r===(mode.endsWith('TEACH')?'TEACHER':'STUDENT'))));
   if(mode==='ADMIN_TEACH')assert(home.personalTimetable.some(r=>r.joinKey&&r.involvement==='teacher'));else assert(home.personalTimetable.every(r=>!r.joinKey&&!r.joinUrl));
   assert(!home.activityPages.some(a=>a.tools?.manage||a.tools?.users||a.tools?.resources));
  }
 }
 const implicit=ok(await f.request('/api/academy/entrance',{},'global',null));assert.equal(implicit.workspace,'LEARN');assert.equal(implicit.globalAdmin,false);
 const session=ok(await f.request('/api/account/session',{},'global','LEARN'));assert(session.contexts.some(c=>c.role==='GLOBAL_ADMIN'),'sign-in authority remains real');
 assert.equal((await f.request('/api/academy/entrance',{},'global','UNKNOWN')).status,400);
}));
test('Admin commands and old aliases reject reader workspaces, including successful retry identifiers',()=>use(async f=>{
 const x=await exam(f);
 for(const mode of ['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH']){
  const retry=await f.request('/api/academy/assessments/create',x.input,'global',mode);assert.equal(retry.status,403);
  for(const path of ['/api/admin/platform/programs/list','/api/admin/platform/user-profiles/get','/api/admin/platform/courses/list','/api/admin/platform/pdf-tools/get','/api/admin/platform/settings/get','/api/academy/assessments/report-data','/api/academy/assessments/release'])assert.equal((await f.request(path,{},'global',mode)).status,403,path);
 }
 assert.equal((await f.request('/api/admin/platform/programs/list',{},'studentA','ADMIN')).status,403);
}));
test('Learn assessment JSON omits staff configuration and inline marks, including nested details',()=>use(async f=>{
 const x=await exam(f);
 for(const who of ['global','adminA','studentA','dual']){
  const list=ok(await f.request('/api/academy/assessments/list',{activityKey:scopes.programA},who,['global','adminA'].includes(who)?'ADMIN_LEARN':'LEARN'));
  assert.equal(list.canAdmin,false);assert.deepEqual(list.classes,[]);assert.deepEqual(list.registers,[]);assert(list.assessments.some(a=>a.id===x.id));
  const detail=ok(await f.request('/api/academy/assessments/get',{assessmentId:x.id,view:'teacher'},who,['global','adminA'].includes(who)?'ADMIN_LEARN':'LEARN'));
  const json=JSON.stringify(detail);for(const field of ['durationMinutes','maximumMark','"mark":','details_json'])assert(!json.includes(field),field);
  assert.equal(detail.assessment.canTeach,false);assert.equal(detail.assessment.canAdmin,false);
  assert(detail.learners.every(r=>r.accountId===actors[who]));
 }
 assert.equal((await f.request('/api/academy/assessments/get',{assessmentId:x.id},'adminB','LEARN')).status,403);
}));
test('previewing and downloading a paper starts no participant event; genuine own access still does',()=>use(async f=>{
 const x=await exam(f),before=f.db.prepare('SELECT count(*) n FROM assessment_events').get().n;
 for(const who of ['global','adminA']){
  assert.equal((await f.request('/api/academy/assessments/download',{fileId:x.paperId,...op()},who,['global','adminA'].includes(who)?'ADMIN_LEARN':'LEARN')).status,200);
  const upload={kind:'ANSWER',assessmentId:x.id,recipientRevision:0,size:9,filename:'x.pdf',mimeType:'application/pdf',sha256:'0'.repeat(64),...op()};
  assert.equal((await f.request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(upload)),{},who,['global','adminA'].includes(who)?'ADMIN_LEARN':'LEARN',Buffer.from('%PDF-test'))).status,403);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_events').get().n,before);
 const uploaded=ok(await f.upload({kind:'ANSWER',assessmentId:x.id,recipientRevision:0},await f.actor('studentA'))),received=f.db.prepare('SELECT count(*) n FROM assessment_events').get().n;
 assert.equal((await f.request('/api/academy/assessments/download',{fileId:uploaded.fileId,...op()},'global','ADMIN_TEACH')).status,200);
 assert(f.db.prepare('SELECT count(*) n FROM assessment_events').get().n>received,'Inherited Teacher viewing records the actual answer check');
 assert.equal((await f.request('/api/academy/assessments/download',{fileId:x.paperId,...op()},'studentA','LEARN')).status,200);
 assert(f.db.prepare('SELECT first_accessed_at FROM assessment_recipients WHERE assessment_id=? AND account_id=?').get(x.id,actors.studentA).first_accessed_at);
}));
test('inherited teaching has ordinary Teacher fields while named-examiner and Admin boundaries remain',()=>use(async f=>{
 const x=await exam(f);
 const preview=ok(await f.request('/api/academy/assessments/get',{assessmentId:x.id},'global','ADMIN_TEACH'));
 assert.equal(preview.assessment.canAdmin,false);assert.equal(preview.assessment.readOnly,false);assert.equal(preview.assessment.canReplacePaper,false);assert.equal(preview.assessment.isExaminer,false);
 const before=f.db.prepare('SELECT count(*) n FROM assessment_events').get().n;
 assert.equal((await f.request('/api/academy/assessments/marks-list',{assessmentId:x.id},'global','ADMIN_TEACH')).status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assessment_events').get().n,before);
 const teacher=ok(await f.request('/api/academy/assessments/get',{assessmentId:x.id},'teacherA','TEACH'));assert.equal(teacher.assessment.isExaminer,true);assert.equal(teacher.assessment.readOnly,false);
 const dual=ok(await f.request('/api/academy/assessments/get',{assessmentId:x.id},'dual','TEACH'));assert.equal(dual.assessment.canAdmin,false);assert.equal(dual.assessment.readOnly,true);assert.equal(dual.assessment.canOpenPaper,false);assert.equal(dual.assessment.canEnterMarks,false);
 assert.equal((await f.request('/api/academy/assessments/get',{assessmentId:x.id},'teacherB','TEACH')).status,403);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('global-real-teacher',?,?,'TEACHER',1,'CONFIRMED')").run(actors.global,scopes.programA);
 const unassigned=ok(await f.request('/api/academy/assessments/list',{activityKey:scopes.programA},'global','TEACH')).assessments.find(a=>a.id===x.id);assert.equal(unassigned,undefined,'Personal Teach needs this class assignment');
 assert.equal((await f.request('/api/academy/assessments/ready-assessment',{assessmentId:x.id,revision:preview.assessment.revision,...op()},'global','ADMIN_TEACH')).status,409,'Teacher Ready respects outstanding submissions');
}));
test('published media metadata and bytes agree in all reader contexts; preview cannot edit or upload',()=>use(async f=>{
 const {lessonId,assetId}=await f.seedCoursePdf();
 for(const mode of ['ADMIN_LEARN','ADMIN_TEACH'])for(const who of ['global','adminA']){
  const download=await f.request('/api/academy/lesson-media/download',{lessonId,assetId},who,mode);assert.equal(download.status,200);assert(download.body.startsWith('%PDF-'));
  const view=ok(await f.request('/api/academy/lesson-media/calendar',{activityKey:scopes.courseA,startDate:'2026-10-01',endDate:'2026-10-07'},who,mode));
  assert.equal(view.courseFiles.canManage,false);assert.equal(view.courseFiles.media.canManage,false);assert.deepEqual(view.courseFiles.media.lessons,[]);
  assert.equal((await f.request('/api/academy/lesson-media/get',{lessonId},who,mode)).status,403);
  assert.equal((await f.request('/api/academy/lesson-media/save',{lessonId,revision:3,...op()},who,mode)).status,403);
  const metadata={lessonId,revision:3,size:9,filename:'preview.pdf',sha256:'0'.repeat(64),...op()};
  assert.equal((await f.request('/api/academy/lesson-media/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,mode,Buffer.from('%PDF-test'))).status,403);
 }
 assert.equal((await f.request('/api/academy/lesson-media/download',{lessonId,assetId},'adminB','LEARN')).status,403);
 f.db.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").run(lessonId);
 assert.equal((await f.request('/api/academy/lesson-media/download',{lessonId,assetId},'global','ADMIN_LEARN')).status,403);
 assert.equal((await f.request('/api/academy/lesson-media/download',{lessonId,assetId},'global','ADMIN')).status,200);
}));
test('a scoped Admin cannot teach outside their Program; Learn and management boundaries remain',()=>use(async f=>{
 const before=f.db.prepare('SELECT version FROM academy_write_state').get().version;
 for(const [path,input] of [['/api/program-attendance/submit',{id:scopes.programA.slice(8)}],['/api/academy/planning/save',{activityKey:scopes.programA}],['/api/academy/progress/confirm',{activityKey:scopes.programA,classId:'class-1',updates:[]}]])assert.equal((await f.request(path,{...input,...op()},'adminB','TEACH')).status,403,path);
 assert.equal(f.db.prepare('SELECT version FROM academy_write_state').get().version,before);
 assert.equal((await f.request('/api/academy/teacher-availability/get',{accountId:actors.teacherA},'global','ADMIN_TEACH')).status,403);
 assert.equal((await f.request('/api/academy/teacher-availability/save',op(),'global','ADMIN_TEACH')).status,403);
 assert.equal((await f.request('/api/academy/progress/grid',{activityKey:scopes.programA,classId:'class-1'},'global','ADMIN_LEARN')).status,403);
 assert.equal((await f.request('/api/academy/teacher-availability/save',op(),'teacherA','ADMIN')).status,403,'selecting Admin does not give a Teacher administration rights');
}));
test('time zone is Global Admin only, uses the existing app setting, and preserves area/history data',()=>use(async f=>{
 const path='/api/admin/platform/settings/',old=ok(await f.request(path+'get',{},'global','ADMIN'));
 assert.equal((await f.request(path+'get',{},'adminA','ADMIN')).status,403);
 const settings=f.db.prepare('SELECT * FROM program_settings').all(),history=f.db.prepare('SELECT * FROM timetable_publications').all();
 const body={timezone:'Asia/Riyadh',revision:old.revision,...op()};
 ok(await f.request(path+'save',body,'global','ADMIN'));assert.equal(ok(await f.request(path+'save',body,'global','ADMIN')).replayed,true);
 assert.equal(f.db.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='PlatformTimezone'").get().setting_value,'Asia/Riyadh');
 assert.deepEqual(f.db.prepare('SELECT * FROM program_settings').all(),settings);assert.deepEqual(f.db.prepare('SELECT * FROM timetable_publications').all(),history);
}));
test('current revocation and account disable invalidate a previously usable preview and file reference',()=>use(async f=>{
 const {lessonId,assetId}=await f.seedCoursePdf();
 assert.equal((await f.request('/api/academy/lesson-media/download',{lessonId,assetId},'adminA','ADMIN_LEARN')).status,200);
 f.db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=?').run(actors.adminA);
 assert([401,403].includes((await f.request('/api/academy/lesson-media/download',{lessonId,assetId},'adminA','ADMIN_LEARN')).status));
 f.db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(actors.global);
 assert.equal((await f.request('/api/academy/entrance',{},'global','ADMIN')).status,401);
}));
