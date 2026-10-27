import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {nextDate,academyDate} from '../src/academy/d1/academy-clock.js';
import {planningMonday} from '../src/academy/d1/lesson-planning.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const op=()=>({operationId:crypto.randomUUID()});
const today=()=>academyDate(new Date(),'Africa/Johannesburg');
async function use(fn){const f=await splitFixture(source=>{source.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)").run(source.scopes.programA,"student-view-other","Other student class");source.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,?,?,?,1)").run(source.scopes.programA,"view-other-member","student-view-other",source.actors.studentA);});try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'});
 f.request=async(path,input={},who='global',workspace='ADMIN_TEACH',classView=null,bytes=null)=>{
  const token=await f.source.actor(who),response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,...(classView?{'X-Academy-Class':encodeURIComponent(JSON.stringify(classView))}:{}),...(!bytes?{'Content-Type':'application/json'}:{})},body:bytes||JSON.stringify(input)}),f.source.env);
  return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():await response.arrayBuffer()};
 };
 await fn(f);assert(f.costs.every(c=>c.queries<=50),JSON.stringify(f.costs.filter(c=>c.queries>50)));for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}}
test('Global and scoped Admins inherit teaching dynamically without new assignments or learner memberships',()=>use(async f=>{
 const counts=()=>['role_assignments','class_teacher_assignments','class_memberships'].map(t=>f.databases.core.prepare('SELECT count(*) n FROM '+t).get().n),before=counts();
 const global=ok(await f.request('/api/academy/entrance',{})),scoped=ok(await f.request('/api/academy/entrance',{},'adminA'));
 assert(global.personalTimetable.some(r=>r.kind==='PROGRAM'&&r.involvement==='teacher'&&r.joinKey));
 assert(scoped.personalTimetable.some(r=>r.activityId===f.scopes.programA.slice(8)&&r.involvement==='teacher'&&r.joinKey));
 assert(!scoped.personalActivities.some(a=>a.kind+':'+a.id===f.scopes.programB));
 assert(global.personalActivities.every(a=>a.roles.includes('TEACHER')));assert.equal(global.globalAdmin,false);
 assert.deepEqual(counts(),before);
}));
test('split Admin-Teach keeps an Admin’s genuine learner assignments separate from inherited Teacher lessons',()=>use(async f=>{
 const scope=f.scopes.programA;
 f.databases.core.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,'rollup-dual-member','class-1',?,1)").run(scope,f.actors.dual);
 const own=ok(await f.request('/api/academy/entrance',{},'dual')),inherited=ok(await f.request('/api/academy/entrance',{},'adminA'));
 const rows=own.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===scope);assert(rows.length);
 assert(rows.every(r=>r.involvement==='teacher'&&r.assignedParticipation==='student'&&!r.summarize));
 assert(inherited.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===scope).every(r=>r.assignedParticipation===''&&r.summarize));
}));
test('inherited Teachers record all session attendance under their own identity and lose scope immediately on revocation',()=>use(async f=>{
 const path='/api/academy/attendance/',scope=f.scopes.programA;
 const view=ok(await f.request(path+'get',{activityKey:scope,date:today()},'adminA'));assert.equal(view.readOnly,false);assert(view.lessons.length&&view.lessons.every(l=>l.canSubmit));
 const input={...op(),activityKey:scope,generation:view.generation,date:view.date,scope:'day',exceptions:Object.fromEntries(view.lessons.map(r=>[r.lesson.anchor,[]])),baseRegisterIds:Object.fromEntries(view.lessons.map(r=>[r.lesson.anchor,r.registerId]))};
 ok(await f.request(path+'submit',input,'adminA'));assert(f.databases.core.prepare('SELECT submitted_by FROM attendance_register_versions').all().every(r=>r.submitted_by===f.actors.adminA));
 f.databases.core.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?").run(f.actors.adminA,scope);
 assert.equal((await f.request(path+'submit',{...input,...op()},'adminA')).status,403);
 assert.equal((await f.request(path+'get',{activityKey:scope,date:today()},'adminB')).status,403);
}));
test('inherited Teachers save their own plans and cannot edit another Teacher or use Admin controls from Teach',()=>use(async f=>{
 const scope=f.scopes.programA,path='/api/academy/planning/',key={activityKey:scope,weekStart:planningMonday(today()),period:'WEEKLY'};
 const board=ok(await f.request(path+'list',key,'adminA'));assert(board.areas.some(a=>a.key===scope&&a.plansRequired));assert.equal(board.plans.length,0);
 const initial=ok(await f.request(path+'get',key,'adminA'));assert(initial.canEdit);assert(initial.content.lessons.length);
 ok(await f.request(path+'save',{...key,...op(),revision:initial.revision,content:{...initial.content,title:'Inherited Teacher plan',overview:'Prepare lessons'}},'adminA'));
 const saved=ok(await f.request(path+'get',key,'adminA'));assert.equal(saved.content.title,'Inherited Teacher plan');assert(ok(await f.request(path+'list',key,'adminA')).plans.some(p=>p.teacherId===f.actors.adminA));
 assert.equal((await f.request(path+'get',{...key,teacherId:'account-0003'},'adminA')).status,403);
 assert.equal((await f.request(path+'policy',{...key,...op()},'adminA')).status,403);
 assert.equal((await f.request(path+'get',{...key,activityKey:f.scopes.programB},'adminA')).status,403);
}));
test('inherited Teachers contribute only their own notes while student class viewing never creates work',()=>use(async f=>{
 const scope=f.scopes.programA,path='/api/academy/lesson-media/',input={activityKey:scope,startDate:today(),endDate:today()};
 const calendar=ok(await f.request(path+'calendar',input,'adminA')),session=calendar.sessions.find(s=>s.canContribute);assert(session);assert.equal(calendar.canManage,false);
 const bytes=Buffer.from('%PDF-1.4\n% inherited teacher\n%%EOF'),metadata={...op(),...input,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),filename:'own.pdf',name:'Own note'};
 const posted=ok(await f.request(path+'note-upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},'adminA','ADMIN_TEACH',null,bytes));
 assert.equal(f.databases.core.prepare('SELECT owner_id FROM lesson_note_entries WHERE note_id=?').get(posted.noteId).owner_id,f.actors.adminA);
 assert.equal((await f.request(path+'note-upload?metadata='+encodeURIComponent(JSON.stringify({...metadata,...op(),noteId:posted.noteId,revision:1})),{},'global','ADMIN_TEACH',null,bytes)).status,403);
 const before=f.databases.core.prepare('SELECT version FROM academy_write_state').get().version,classView={activityKey:scope,classId:session.classIds[0]};
 const home=ok(await f.request('/api/academy/entrance',{},'adminA','ADMIN_LEARN',classView));assert(home.activityPages.find(a=>a.kind+':'+a.id===scope).studentPreview);
 assert(home.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===scope).every(r=>r.assignedParticipation===''&&!r.summarize),'The read-only class audience is not a learner assignment');
 assert(home.personalTimetable.filter(r=>'PROGRAM:'+r.activityId===scope).every(r=>r.classIds.includes(classView.classId)&&!r.joinKey));
 const learner=ok(await f.request(path+'calendar',input,'adminA','ADMIN_LEARN',classView));assert(learner.sessions.every(s=>!s.canContribute));assert(learner.sessions.some(s=>s.media?.assets.some(a=>a.id===posted.versionId)));
 const otherClass=home.activityPages.find(a=>a.kind+':'+a.id===scope).classes.find(c=>!session.classIds.includes(c.id));assert(otherClass);
 const otherView={activityKey:scope,classId:otherClass.id},other=ok(await f.request(path+'calendar',input,'adminA','ADMIN_LEARN',otherView));assert(!other.sessions.some(s=>s.media?.assets.some(a=>a.id===posted.versionId)));
 const media=learner.sessions.find(s=>s.media?.assets.some(a=>a.id===posted.versionId)).media;assert.equal((await f.request(path+'download',{lessonId:media.id,assetId:posted.versionId},'adminA','ADMIN_LEARN',otherView)).status,403);
 assert.equal((await f.request('/api/academy/progress/mark',{updates:[]},'adminA','ADMIN_LEARN',classView)).status,403);
 assert.equal((await f.request('/api/academy/entrance',{},'studentA','ADMIN_LEARN',classView)).status,403);
 assert.equal((await f.request('/api/academy/entrance',{},'adminB','ADMIN_LEARN',classView)).status,403);
 assert.equal(f.databases.core.prepare('SELECT version FROM academy_write_state').get().version,before);
}));
test('Learn class selection shows only published class assessments without recipient or personal history',()=>use(async f=>{
 const scope=f.scopes.programA,first='class-1',second='student-view-other',ids=[];
 for(const classId of [first,second]){
  const made=ok(await f.request('/api/academy/assessments/create',{...op(),activityKey:scope,classId,title:'Class '+classId,subject:'Qasas',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',durationMinutes:null,examDate:null,availableFrom:new Date(Date.now()-60000).toISOString(),dueDate:nextDate(today()),maximumMark:100},'global','ADMIN'));ids.push(made.assessmentId);
  const detail=ok(await f.request('/api/academy/assessments/get',{assessmentId:made.assessmentId},'global','ADMIN'));
  ok(await f.request('/api/academy/assessments/publish',{...op(),assessmentId:made.assessmentId,revision:detail.assessment.revision},'global','ADMIN'));
 }
 await acceptFixtureSetup(f.source.env,await f.source.actor('global'),[scope]);
 const classView={activityKey:scope,classId:first},list=ok(await f.request('/api/academy/assessments/list',{activityKey:scope},'adminA','ADMIN_LEARN',classView));assert.deepEqual(list.assessments.map(a=>a.id),[ids[0]]);
 const detail=ok(await f.request('/api/academy/assessments/get',{assessmentId:ids[0]},'adminA','ADMIN_LEARN',classView));assert(detail.assessment.learnerPreview);assert.equal(detail.assessment.canUpload,false);assert.deepEqual(detail.learners,[]);assert.deepEqual(detail.history,[]);
 assert.equal((await f.request('/api/academy/assessments/get',{assessmentId:ids[1]},'adminA','ADMIN_LEARN',classView)).status,403);
 assert.equal(f.databases.core.prepare('SELECT count(*) n FROM assessment_recipients WHERE account_id=?').get(f.actors.adminA).n,0);
}));


test('personal readers never inherit Admin class or teaching access and Admin readers reject non-admin accounts',()=>use(async f=>{
 const scope=f.scopes.programA;
 for(const who of ['global','adminA']){
  for(const mode of ['LEARN','TEACH']){
   const home=ok(await f.request('/api/academy/entrance',{},who,mode));assert.equal(home.workspace,mode);assert.equal(home.adminView,false);assert.equal(home.workspaceAccess.globalAdmin,who==='global');assert.equal(home.globalAdmin,false);assert(!home.personalActivities.some(a=>a.kind+':'+a.id===scope));
   assert.equal((await f.request('/api/academy/attendance/get',{activityKey:scope,date:today()},who,mode)).status,403);
  }
  assert.equal((await f.request('/api/academy/entrance',{},who,'LEARN',{activityKey:scope,classId:'class-1'})).status,403);
 }
 for(const who of ['teacherA','studentA'])for(const mode of ['ADMIN_LEARN','ADMIN_TEACH'])assert.equal((await f.request('/api/academy/entrance',{},who,mode)).status,403);
 const dual=ok(await f.request('/api/academy/entrance',{},'dual','TEACH'));assert(dual.personalActivities.some(a=>a.kind+':'+a.id===scope));assert.equal(dual.adminView,false);
}));
test('Admin scope and personal assignments remain distinct even when the same account has both',()=>use(async f=>{
 const scope=f.scopes.programB,actor=f.actors.adminA;
 for(const role of ['TEACHER','STUDENT'])f.databases.core.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('separate-'+role,actor,scope,role);
 for(const [personal,admin] of [['LEARN','ADMIN_LEARN'],['TEACH','ADMIN_TEACH']]){
  const own=ok(await f.request('/api/academy/entrance',{},'adminA',personal)),managed=ok(await f.request('/api/academy/entrance',{},'adminA',admin));assert(own.personalActivities.some(a=>a.kind+':'+a.id===scope));assert(!managed.personalActivities.some(a=>a.kind+':'+a.id===scope));
  assert.equal((await f.request('/api/academy/attendance/get',{activityKey:scope,date:today()},'adminA',admin)).status,403);
  assert.equal((await f.request('/api/academy/lesson-media/calendar',{activityKey:scope,startDate:today(),endDate:today()},'adminA',admin)).status,403);
 }
}));


test('Admin-Learn stays a read-only catalogue even when the Admin also owns a learner card and no class was selected',()=>use(async f=>{
 const before=f.databases.core.prepare('SELECT version FROM academy_write_state').get().version;
 const view=ok(await f.request('/api/academy/progress/get',{activityKey:f.scopes.programA},'dual','ADMIN_LEARN'));assert.equal(view.student,false);assert.equal(view.readOnly,true);assert.deepEqual(view.records,[]);
 assert.equal((await f.request('/api/academy/progress/mark',{updates:[],...op()},'dual','ADMIN_LEARN')).status,403);
 const personal=ok(await f.request('/api/academy/progress/get',{activityKey:f.scopes.programA},'dual','LEARN'));assert.equal(personal.student,true);assert.equal(personal.readOnly,false);
 assert.equal((await f.request('/api/academy/progress/get',{activityKey:f.scopes.programB},'adminA','ADMIN_LEARN')).status,403);
 assert.equal(f.databases.core.prepare('SELECT version FROM academy_write_state').get().version,before);
}));
