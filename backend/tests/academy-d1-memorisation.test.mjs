import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memorisationFixture} from './fixtures/academy-memorisation-fixture.mjs';
import {attendanceProgramId} from './fixtures/academy-attendance-fixture.mjs';
import worker from '../src/worker.js';
const path='/api/academy/progress/',scope='PROGRAM:'+attendanceProgramId;
const post=async(env,action,input={},token='')=>{const r=await worker.fetch(new Request('http://localhost'+(action.startsWith('/')?action:path+action),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,suffix)=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+suffix,pin:'1234'})).token;
async function use(fn){const f=await memorisationFixture(),previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected external call');};try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();globalThis.fetch=previous;}}
const update=(task,revision=0,complete=true)=>({taskId:task,revision,complete});
test('workbook tasks seed independent sets without invented learner progress',()=>use(async({env,db,queries})=>{
  const student=await login(env,'0002'),before=queries.length,data=ok(await post(env,'get',{},student));
  assert.equal(data.modules.length,12);assert.equal(data.modules.flatMap(m=>m.tasks).length,120);assert.equal(data.records.length,0);assert.equal(data.student,true);
  assert.ok(queries.length-before<25,'Progress uses bounded, scoped reads');
  const source=JSON.parse(readFileSync(new URL('../data/academy-memorisation-modules.json',import.meta.url)));
  for(const m of source.modules)assert.deepEqual(data.modules.find(c=>c.name===m.name).tasks.map(t=>t.name),m.tasks);
  assert.equal(db.prepare('SELECT count(*) n FROM memorisation_sets m JOIN academy_module_catalogue c ON c.module_id=m.set_id').get().n,0);
  assert.equal((await post(env,'get')).status,401);
}));
test('learner and teacher confirmations are independent in either order, with exact retries and scoped authority',()=>use(async({env,db})=>{
  const student=await login(env,'0002'),teacher=await login(env,'0003'),other=await login(env,'0005');
  const data=ok(await post(env,'get',{},student)),task=data.modules[0].tasks[0].id;
  const mark=(revision,complete,extra={})=>({catalogueRevision:data.revision,updates:[{...update(task,revision,complete),...extra}],operationId:crypto.randomUUID()});
  const confirm=(revision,confirmed,extra={})=>({catalogueRevision:data.revision,activityKey:scope,classId:'class-1',updates:[{taskId:task,accountId:'account-0002',revision,confirmed,...extra}],operationId:crypto.randomUUID()});
  assert.equal((await post(env,'mark',mark(0,true,{accountId:'account-0008'}),student)).status,403);
  const first=confirm(0,true);
  assert.equal((await post(env,'confirm',first,student)).status,403);assert.equal((await post(env,'confirm',first,other)).status,403);
  assert.equal((await post(env,'grid',{activityKey:'PROGRAM:unassigned',classId:'class-shared',moduleId:data.modules[0].id},teacher)).status,403);
  let saved=ok(await post(env,'confirm',first,teacher));assert.equal(saved.records[0].complete,false);assert.equal(saved.records[0].confirmed,true);assert.equal(saved.records[0].completedAt,null);
  const confirmedAt=saved.records[0].confirmedAt;assert.ok(confirmedAt);assert.equal(ok(await post(env,'confirm',first,teacher)).replayed,true);
  const input=mark(1,true,{confirmed:false});saved=ok(await post(env,'mark',input,student));assert.equal(saved.records[0].complete,true);assert.equal(saved.records[0].confirmed,true);assert.equal(saved.records[0].confirmedAt,confirmedAt);const completedAt=saved.records[0].completedAt;
  assert.equal(ok(await post(env,'mark',input,student)).replayed,true);assert.equal((await post(env,'mark',{...input,updates:[update(task,1,false)]},student)).body.code,'OPERATION_ID_REUSED');
  saved=ok(await post(env,'confirm',confirm(2,false,{complete:false}),teacher));assert.equal(saved.records[0].complete,true);assert.equal(saved.records[0].confirmed,false);assert.equal(saved.records[0].completedAt,completedAt);assert.equal(saved.records[0].confirmedAt,null);
  saved=ok(await post(env,'confirm',confirm(3,true),teacher));assert.equal(saved.records[0].complete,true);assert.equal(saved.records[0].confirmed,true);
  const grid=ok(await post(env,'grid',{activityKey:scope,classId:'class-1',moduleId:data.modules[0].id},teacher));assert.deepEqual(grid.learners.map(a=>a.id),['account-0002']);assert.equal(grid.records[0].complete,true);assert.equal(grid.records[0].confirmed,true);
  assert.equal((await post(env,'mark',mark(2,false),student)).body.code,'ROW_CHANGED');
  saved=ok(await post(env,'mark',mark(4,false),student));assert.equal(saved.records[0].complete,false);assert.equal(saved.records[0].confirmed,true);assert.equal(saved.records[0].completedAt,null);
  let row=db.prepare('SELECT * FROM learner_task_progress WHERE account_id=? AND task_id=?').get('account-0002',task);assert.equal(row.confirmed_by,'account-0003');assert.ok(row.confirmed_at);
  saved=ok(await post(env,'confirm',confirm(5,false),teacher));assert.equal(saved.records[0].complete,false);assert.equal(saved.records[0].confirmed,false);
  row=db.prepare('SELECT * FROM learner_task_progress WHERE account_id=? AND task_id=?').get('account-0002',task);assert.equal(row.completed_at,null);assert.equal(row.confirmed_by,null);assert.equal(row.confirmed_at,null);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE record_kind='MEMORISATION'").get().n,6);
}));
test('independent-confirmation migration preserves every existing progress field and index',async()=>{
  const before=[];
  const f=await memorisationFixture({beforeMigration:({db},file)=>{
    if(!file.startsWith('0015_'))return;
    for(const [i,complete,confirmed] of [[1,0,0],[2,1,0],[3,1,1]])db.prepare('INSERT INTO learner_task_progress VALUES(?,?,?,?,?,?,?,?,?)').run('account-0002','MEM-SURAHS-1-0'+i,complete,confirmed,i+4,complete?'2026-10-01T12:00:00Z':null,confirmed?'2026-10-02T12:00:00Z':null,confirmed?'account-0003':null,'2026-10-03T12:00:00Z');
    before.push(...db.prepare('SELECT * FROM learner_task_progress ORDER BY task_id').all());
  }});
  try{
    assert.deepEqual(f.db.prepare('SELECT * FROM learner_task_progress ORDER BY task_id').all(),before);
    f.db.prepare('INSERT INTO learner_task_progress VALUES(?,?,?,?,?,?,?,?,?)').run('account-0002','MEM-SURAHS-1-04',0,1,1,null,'2026-10-04T12:00:00Z','account-0003','2026-10-04T12:00:00Z');
    assert.ok(f.db.prepare("PRAGMA index_list('learner_task_progress')").all().some(r=>r.name==='learner_task_progress_task'));
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{f.db.close();}
});
test('simultaneous learner and teacher changes require review and teacher-only batch failures roll back',()=>use(async({env,db})=>{
  const student=await login(env,'0002'),teacher=await login(env,'0003'),cat=ok(await post(env,'get',{},student)),tasks=cat.modules[0].tasks;
  const mark={catalogueRevision:cat.revision,updates:[update(tasks[0].id)],operationId:crypto.randomUUID()};
  const confirm={catalogueRevision:cat.revision,activityKey:scope,classId:'class-1',updates:[{taskId:tasks[0].id,accountId:'account-0002',revision:0,confirmed:true}],operationId:crypto.randomUUID()};
  const result=await Promise.all([post(env,'mark',mark,student),post(env,'confirm',confirm,teacher)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
  const retry=result[0].status===409?mark:confirm;retry.operationId=crypto.randomUUID();retry.updates[0].revision=1;
  ok(await post(env,result[0].status===409?'mark':'confirm',retry,result[0].status===409?student:teacher));
  const before=db.prepare('SELECT * FROM learner_task_progress').all();assert.equal(before[0].complete,1);assert.equal(before[0].confirmed,1);
  db.exec(`CREATE TRIGGER synthetic_confirmation_failure BEFORE INSERT ON learner_task_progress WHEN NEW.task_id='${tasks[2].id}' BEGIN SELECT RAISE(ABORT,'synthetic confirmation failure'); END;`);
  const receipts=db.prepare('SELECT count(*) n FROM operation_receipts').get().n,audits=db.prepare('SELECT count(*) n FROM audit_events').get().n;
  assert.equal((await post(env,'confirm',{...confirm,updates:tasks.slice(1,3).map(t=>({taskId:t.id,accountId:'account-0002',revision:0,confirmed:true})),operationId:crypto.randomUUID()},teacher)).status,503);
  assert.deepEqual(db.prepare('SELECT * FROM learner_task_progress').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,audits);
}));
test('confirmation scope honours admins, active dated rosters and Program classes only',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),scoped=await login(env,'0004'),student=await login(env,'0002');
  const data=ok(await post(env,'get',{view:'teach',activityKey:scope},admin));assert.ok(data.classes.some(c=>c.id==='class-shared'));assert.ok(data.classes.every(c=>c.activityKey===scope));assert.equal(ok(await post(env,'get',{view:'admin',activityKey:scope},admin)).canImport,true);
  const own=ok(await post(env,'get',{view:'teach',activityKey:scope},scoped));assert.equal(own.canImport,false);assert.ok(own.classes.some(c=>c.id==='class-shared'));assert.ok(own.classes.every(c=>c.activityKey===scope));
  const input={activityKey:scope,classId:'class-1',moduleId:data.modules[0].id};
  db.prepare("UPDATE class_memberships SET start_date='2999-01-01' WHERE account_id='account-0002'").run();assert.equal(ok(await post(env,'grid',input,scoped)).total,0);
  assert.equal((await post(env,'grid',input,student)).status,403);
  db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,revision) SELECT 'course-teacher','account-0003',activity_key,'TEACHER',1,'CONFIRMED',1 FROM activities WHERE kind='COURSE' LIMIT 1").run();
  const teacher=await login(env,'0003');assert.ok(ok(await post(env,'get',{view:'teach'},teacher)).classes.every(c=>c.activityKey.startsWith('PROGRAM:')));const course=db.prepare("SELECT activity_key FROM activities WHERE kind='COURSE' LIMIT 1").get();assert.equal((await post(env,'grid',{activityKey:course.activity_key,classId:'COURSE',moduleId:data.modules[0].id},admin)).status,403);
}));
test('concurrent forms conflict and failed multi-task saves roll back marks, receipts and audit',()=>use(async({env,db})=>{
  const token=await login(env,'0002'),data=ok(await post(env,'get',{},token)),tasks=data.modules[0].tasks;
  const make=()=>({catalogueRevision:data.revision,updates:[update(tasks[0].id)],operationId:crypto.randomUUID()});
  const result=await Promise.all([post(env,'mark',make(),token),post(env,'mark',make(),token)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
  db.exec(`CREATE TRIGGER synthetic_failure BEFORE INSERT ON learner_task_progress WHEN NEW.task_id='${tasks[2].id}' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;`);
  const count=db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
  assert.equal((await post(env,'mark',{catalogueRevision:data.revision,updates:[update(tasks[1].id),update(tasks[2].id)],operationId:crypto.randomUUID()},token)).status,503);
  assert.equal(db.prepare('SELECT count(*) n FROM learner_task_progress').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,count);
}));
test('Global Admin imports classify modules, exact retries and matching replacement reset only that module',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),teacher=await login(env,'0003'),student=await login(env,'0002'),data=ok(await post(env,'get',{},admin));
  const input={catalogueRevision:data.revision,mode:'ADD',modules:[{name:'New duas',subject:'DUAS',level:'Foundation',tasks:['First dua','Second dua']}],operationId:crypto.randomUUID()};
  assert.equal((await post(env,'import',input,teacher)).status,403);
  assert.equal((await post(env,'import',{...input,modules:[{...input.modules[0],subject:'OTHER'}]},admin)).status,400);
  assert.equal((await post(env,'import',{...input,modules:[{...input.modules[0],tasks:['Repeat','repeat']}]},admin)).status,400);
  assert.equal(db.prepare('SELECT count(*) n FROM memorisation_sets').get().n,12);
  ok(await post(env,'import',input,admin));assert.equal(ok(await post(env,'import',input,admin)).replayed,true);
  const next=ok(await post(env,'get',{},student)),m=next.modules.find(m=>m.name==='New duas'),other=next.modules.find(m=>m.name==='Surahs 1');
  ok(await post(env,'mark',{catalogueRevision:next.revision,updates:[update(m.tasks[0].id),update(other.tasks[0].id)],operationId:crypto.randomUUID()},student));
  assert.equal((await post(env,'import',{...input,operationId:crypto.randomUUID()},admin)).body.code,'CATALOGUE_CHANGED');
  assert.equal((await post(env,'import',{...input,catalogueRevision:next.revision,operationId:crypto.randomUUID()},admin)).body.code,'MODULE_EXISTS');
  ok(await post(env,'import',{...input,catalogueRevision:next.revision,mode:'REPLACE',modules:[{...input.modules[0],tasks:['Replacement']}],operationId:crypto.randomUUID()},admin));
  const last=ok(await post(env,'get',{},student));assert.equal(last.records.length,1);assert.equal(last.records[0].taskId,other.tasks[0].id);assert.equal(last.modules.find(m=>m.name==='New duas').tasks[0].name,'Replacement');
}));
test('large imports and 100-task learner/teacher saves stay within the Free D1 invocation budget',()=>use(async({env,queries})=>{
  const admin=await login(env,'0001'),student=await login(env,'0002'),teacher=await login(env,'0003'),data=ok(await post(env,'get',{},admin));
  let before=queries.length;
  ok(await post(env,'import',{catalogueRevision:data.revision,mode:'ADD',modules:Array.from({length:5},(_,i)=>({name:'Large module '+i,subject:'DUAS',level:'Extension',tasks:Array.from({length:100},(_,n)=>'Task '+n)})),operationId:crypto.randomUUID()},admin));
  assert.ok(queries.length-before<=50,`500-task upload used ${queries.length-before} D1 queries`);
  const cat=ok(await post(env,'get',{},student)),tasks=cat.modules.flatMap(m=>m.tasks).slice(0,100);before=queries.length;
  ok(await post(env,'mark',{catalogueRevision:cat.revision,updates:tasks.map(t=>update(t.id)),operationId:crypto.randomUUID()},student));
  assert.ok(queries.length-before<=50,`100-task marking used ${queries.length-before} D1 queries`);before=queries.length;
  ok(await post(env,'confirm',{catalogueRevision:cat.revision,activityKey:scope,classId:'class-1',updates:tasks.map(t=>({taskId:t.id,accountId:'account-0002',revision:1,confirmed:true})),operationId:crypto.randomUUID()},teacher));
  assert.ok(queries.length-before<=50,`100-task confirmation used ${queries.length-before} D1 queries`);
}));
test('personal pages expose only own progress and administrators can keep a personal record',()=>use(async({env})=>{
  for(const suffix of ['0001','0004']){
    const token=await login(env,suffix),data=ok(await post(env,'get',{},token));
    assert.equal(data.student,true);assert.deepEqual(data.classes,[]);assert.equal(data.canImport,false);
    ok(await post(env,'mark',{catalogueRevision:data.revision,updates:[update(data.modules[0].tasks[0].id)],operationId:crypto.randomUUID()},token));
    assert.equal(ok(await post(env,'get',{},token)).records.length,1);
  }
  const student=await login(env,'0002');assert.equal((await post(env,'get',{view:'admin',activityKey:scope},student)).status,403);
}));
test('module edits preserve identity and progress, move items, and remove only reviewed items',()=>use(async({env,db,queries})=>{
  const admin=await login(env,'0001'),teacher=await login(env,'0003'),student=await login(env,'0002'),data=ok(await post(env,'get',{},student));
  const m=data.modules.find(m=>m.name==='Surahs 1'),target=data.modules.find(m=>m.name==='Duas 1');
  ok(await post(env,'mark',{catalogueRevision:data.revision,updates:m.tasks.slice(0,3).map(t=>update(t.id)),operationId:crypto.randomUUID()},student));
  const tasks=m.tasks.filter((_,i)=>i!==2).map((t,i)=>({...t,name:i===0?'Renamed surah':t.name,...(i===1?{moduleId:target.id}:{})}));tasks.push({name:'New item'});
  const input={catalogueRevision:data.revision,moduleId:m.id,name:'Foundations',subject:'DUAS',level:'Foundation',tasks,operationId:crypto.randomUUID()};
  assert.equal((await post(env,'module-save',input,teacher)).status,403);assert.equal((await post(env,'module-save',input,admin)).status,400);
  const before=queries.length;ok(await post(env,'module-save',{...input,confirmRemoval:true},admin));assert.ok(queries.length-before<=50);
  assert.equal(ok(await post(env,'module-save',{...input,confirmRemoval:true},admin)).replayed,true);
  const after=ok(await post(env,'get',{},student)),edited=after.modules.find(c=>c.id===m.id);
  assert.equal(edited.name,'Foundations');assert.equal(edited.subject,'DUAS');assert.equal(edited.level,'Foundation');
  assert.equal(edited.tasks[0].id,m.tasks[0].id);assert.equal(edited.tasks[0].name,'Renamed surah');assert.equal(after.records.length,2);
  assert.ok(after.modules.find(c=>c.id===target.id).tasks.some(t=>t.id===m.tasks[1].id));assert.equal(db.prepare('SELECT count(*) n FROM memorisation_tasks WHERE task_id=?').get(m.tasks[2].id).n,0);
  assert.equal((await post(env,'module-save',{...input,confirmRemoval:true,operationId:crypto.randomUUID()},admin)).body.code,'CATALOGUE_CHANGED');
}));
test('module creation and failed edit rollback are atomic and reject duplicate destinations',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),data=ok(await post(env,'get',{},admin)),m=data.modules[0];
  const created=ok(await post(env,'module-save',{catalogueRevision:data.revision,name:'Typed module',subject:'DUAS',level:'Extension',tasks:[{name:'Typed item'}],operationId:crypto.randomUUID()},admin));
  const cat=ok(await post(env,'get',{},admin));assert.equal(cat.modules.find(m=>m.id===created.moduleId).tasks[0].name,'Typed item');
  db.exec("CREATE TRIGGER fail_module_edit BEFORE INSERT ON memorisation_tasks WHEN NEW.name='Fail this save' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  const input={catalogueRevision:cat.revision,moduleId:m.id,name:'Must roll back',subject:m.subject,level:m.level,tasks:[...m.tasks,{name:'Fail this save'}],operationId:crypto.randomUUID()};
  assert.equal((await post(env,'module-save',input,admin)).status,503);
  const after=ok(await post(env,'get',{},admin));assert.equal(after.revision,cat.revision);assert.equal(after.modules.find(c=>c.id===m.id).name,m.name);assert.deepEqual(after.modules.find(c=>c.id===m.id).tasks,m.tasks);
}));
test('inactive personal cards keep progress and teaching access; settings require global authority and revisions',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),teacher=await login(env,'0003'),data=ok(await post(env,'get',{},admin)),task=data.modules[0].tasks[0].id;
  ok(await post(env,'mark',{catalogueRevision:data.revision,updates:[update(task)],operationId:crypto.randomUUID()},admin));
  const settings={accountId:'account-0001',active:false,revision:0,operationId:crypto.randomUUID()};
  assert.equal((await post(env,'cards',{},teacher)).status,403);assert.equal((await post(env,'card-active',settings,teacher)).status,403);
  const users=ok(await post(env,'cards',{query:'login-0001'},admin));assert.equal(users.total,1);assert.equal(users.users[0].active,true);
  ok(await post(env,'card-active',settings,admin));assert.equal(ok(await post(env,'card-active',settings,admin)).replayed,true);
  const self=ok(await post(env,'get',{},admin));assert.equal(self.personalActive,false);assert.equal(self.student,false);
  assert.ok(ok(await post(env,'get',{view:'teach',activityKey:scope},admin)).classes.length);
  assert.equal((await post(env,'mark',{catalogueRevision:data.revision,updates:[update(task,1,false)],operationId:crypto.randomUUID()},admin)).status,403);
  assert.equal(db.prepare('SELECT count(*) n FROM learner_task_progress WHERE account_id=?').get('account-0001').n,1);
  assert.equal((await post(env,'card-active',{...settings,active:true,operationId:crypto.randomUUID()},admin)).body.code,'ROW_CHANGED');
  ok(await post(env,'card-active',{...settings,active:true,revision:1,operationId:crypto.randomUUID()},admin));assert.equal(ok(await post(env,'get',{},admin)).records.length,1);
  const entrance=ok(await post(env,'/api/academy/entrance',{},admin));assert.equal(entrance.memorisationActive,true);
}));
test('unregistered visitors receive public tasks only and cannot save; restrictions apply to personal, class and write APIs',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),student=await login(env,'0002'),teacher=await login(env,'0003'),other=await login(env,'0007');
  const preview=async()=>{const r=await worker.fetch(new Request('http://localhost'+path+'preview'),env);assert.equal(r.status,200);return r.json();};
  const initial=await preview();assert.equal(initial.visitor,true);assert.equal(initial.modules.length,12);assert.deepEqual(initial.records,[]);assert.equal(initial.revision,undefined);assert.equal(initial.activities,undefined);
  const cat=ok(await post(env,'get',{},student)),m=cat.modules[0],task=m.tasks[0].id;
  ok(await post(env,'mark',{catalogueRevision:cat.revision,updates:[update(task)],operationId:crypto.randomUUID()},student));
  const edit={catalogueRevision:cat.revision,moduleId:m.id,name:m.name,subject:m.subject,level:m.level,tasks:m.tasks,activityKeys:[scope],operationId:crypto.randomUUID()};
  ok(await post(env,'module-save',edit,admin));assert.equal(ok(await post(env,'module-save',edit,admin)).replayed,true);
  assert.ok(!(await preview()).modules.some(c=>c.id===m.id));assert.ok((await preview()).modules.every(c=>c.activityKeys===undefined));
  assert.ok(ok(await post(env,'get',{},student)).modules.some(c=>c.id===m.id));assert.ok(!ok(await post(env,'get',{},other)).modules.some(c=>c.id===m.id));
  let current=ok(await post(env,'get',{view:'admin'},admin));
  assert.equal((await post(env,'mark',{catalogueRevision:current.revision,updates:[update(task)],operationId:crypto.randomUUID()},other)).status,403);
  assert.equal((await post(env,'mark',{catalogueRevision:current.revision,updates:[update(task)],operationId:crypto.randomUUID()})).status,401);
  const course='COURSE:subject-1';ok(await post(env,'module-save',{...edit,catalogueRevision:current.revision,activityKeys:[course],operationId:crypto.randomUUID()},admin));
  assert.ok(!ok(await post(env,'get',{},student)).modules.some(c=>c.id===m.id));assert.deepEqual(ok(await post(env,'get',{},student)).records,[]);
  assert.equal((await post(env,'grid',{activityKey:scope,classId:'class-1',moduleId:m.id},teacher)).status,404);
  current=ok(await post(env,'get',{view:'admin'},admin));assert.equal((await post(env,'confirm',{catalogueRevision:current.revision,activityKey:scope,classId:'class-1',updates:[{taskId:task,accountId:'account-0002',revision:1,confirmed:true}],operationId:crypto.randomUUID()},teacher)).status,403);
  db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,revision) VALUES('restricted-course-student','account-0002',?,'STUDENT',1,'CONFIRMED',1)").run(course);
  assert.ok(ok(await post(env,'get',{},student)).modules.some(c=>c.id===m.id));assert.equal(ok(await post(env,'get',{},student)).records.length,1);
  assert.equal((await post(env,'module-save',{...edit,catalogueRevision:current.revision,activityKeys:['PROGRAM:unknown'],operationId:crypto.randomUUID()},admin)).status,400);
  ok(await post(env,'module-save',{...edit,catalogueRevision:current.revision,activityKeys:[],operationId:crypto.randomUUID()},admin));
  assert.equal((await preview()).modules.length,12);assert.equal(db.prepare('SELECT count(*) n FROM learner_task_progress').get().n,1);
}));
test('admin exclusions remove class grids and configurable card limits paginate without losing progress',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),teacher=await login(env,'0003'),student=await login(env,'0002');
  const cat=ok(await post(env,'get',{},student)),m=cat.modules[0];ok(await post(env,'mark',{catalogueRevision:cat.revision,updates:[update(m.tasks[0].id)],operationId:crypto.randomUUID()},student));
  for(let n=7;n<=12;n++){const id='account-'+String(n).padStart(4,'0');db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,revision) VALUES(?,?,?,'STUDENT',1,'CONFIRMED',1) ON CONFLICT DO NOTHING").run('large-role-'+n,id,scope);db.prepare("INSERT INTO class_memberships(enrollment_id,activity_key,class_id,account_id,active) VALUES(?,?,'class-1',?,1)").run('large-member-'+n,scope,id);}
  const setting={activityKey:scope,active:true,learnersPerCard:5,revision:0,operationId:crypto.randomUUID()};
  assert.equal((await post(env,'activity-active',setting,teacher)).status,403);assert.equal((await post(env,'activity-active',{...setting,learnersPerCard:51},admin)).status,400);
  ok(await post(env,'activity-active',setting,admin));assert.equal(ok(await post(env,'activity-active',setting,admin)).replayed,true);
  const input={activityKey:scope,classId:'class-1',moduleId:m.id},first=ok(await post(env,'grid',input,teacher)),second=ok(await post(env,'grid',{...input,offset:5},teacher));
  assert.equal(first.pageSize,5);assert.equal(first.learners.length,5);assert.equal(first.total,7);assert.equal(second.learners.length,2);assert.equal(new Set([...first.learners,...second.learners].map(a=>a.id)).size,7);
  assert.equal((await post(env,'activity-active',{...setting,active:false,operationId:crypto.randomUUID()},admin)).body.code,'ROW_CHANGED');
  ok(await post(env,'activity-active',{...setting,active:false,revision:1,operationId:crypto.randomUUID()},admin));
  assert.deepEqual(ok(await post(env,'get',{view:'teach',activityKey:scope},admin)).classes,[]);assert.deepEqual(ok(await post(env,'get',{view:'teach',activityKey:scope},teacher)).classes,[]);
  assert.equal((await post(env,'grid',input,admin)).status,403);assert.equal((await post(env,'confirm',{catalogueRevision:cat.revision,activityKey:scope,classId:'class-1',updates:[{taskId:m.tasks[0].id,accountId:'account-0002',revision:1,confirmed:true}],operationId:crypto.randomUUID()},admin)).status,403);
  assert.equal(ok(await post(env,'get',{},student)).records.length,1);
  ok(await post(env,'activity-active',{...setting,active:true,learnersPerCard:10,revision:2,operationId:crypto.randomUUID()},admin));assert.equal(ok(await post(env,'grid',input,teacher)).pageSize,10);
}));

test('set separation preserves every item, progress field, restriction and personal/class setting',async()=>{
  const f=await memorisationFixture({separateSets:false}),{db,env}=f;
  try{
    const time='2026-10-01T09:00:00Z';
    for(const [n,complete,confirmed] of [[1,1,1],[2,0,1],[3,1,0]])db.prepare('INSERT INTO learner_task_progress VALUES(?,?,?,?,?,?,?,?,?)').run('account-0002','MEM-SURAHS-1-0'+n,complete,confirmed,7+n,complete?time:null,confirmed?time:null,confirmed?'account-0003':null,time);
    db.prepare('INSERT INTO memorisation_module_activities VALUES(?,?)').run('MEM-SURAHS-1',scope);
    db.prepare('INSERT INTO memorisation_account_settings VALUES(?,0,4,?,?)').run('account-0001',time,'account-0001');
    db.prepare('INSERT INTO memorisation_activity_settings VALUES(?,5,1,3,?,?)').run(scope,time,'account-0001');
    // A genuine curriculum use must survive, even when the original tracker reused it.
    db.prepare("UPDATE academy_module_usage SET academy_module_id='MEM-DUAS-1' WHERE rowid IN(SELECT rowid FROM academy_module_usage LIMIT 1)").run();
    assert.equal(db.prepare("SELECT count(*) n FROM academy_module_usage WHERE academy_module_id='MEM-DUAS-1'").get().n,1);
    db.prepare("UPDATE academy_module_catalogue SET active=0 WHERE module_id='MEM-SURAHS-2'").run();
    const progress=db.prepare('SELECT * FROM learner_task_progress ORDER BY task_id').all(),tasks=db.prepare('SELECT * FROM memorisation_tasks ORDER BY task_id').all(),cards=db.prepare('SELECT * FROM memorisation_account_settings').all(),areas=db.prepare('SELECT * FROM memorisation_activity_settings').all(),revision=db.prepare('SELECT revision FROM memorisation_catalogue_state').get().revision;
    db.exec('BEGIN');db.exec(readFileSync(new URL('../migrations/academy/0019_memorisation_sets.sql',import.meta.url),'utf8'));db.exec('COMMIT');
    assert.deepEqual(db.prepare('SELECT * FROM learner_task_progress ORDER BY task_id').all(),progress);
    assert.deepEqual(db.prepare('SELECT * FROM memorisation_tasks ORDER BY task_id').all(),tasks);
    assert.deepEqual(db.prepare('SELECT * FROM memorisation_account_settings').all(),cards);
    assert.deepEqual(db.prepare('SELECT * FROM memorisation_activity_settings').all(),areas);
    assert.equal(db.prepare('SELECT count(*) n FROM memorisation_sets').get().n,12);
    assert.equal(db.prepare("SELECT active FROM memorisation_sets WHERE set_id='MEM-SURAHS-2'").get().active,0);
    assert.deepEqual({...db.prepare('SELECT * FROM memorisation_set_activities').get()},{set_id:'MEM-SURAHS-1',activity_key:scope});
    assert.equal(db.prepare('SELECT revision FROM memorisation_catalogue_state').get().revision,revision+1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(db.prepare('SELECT count(*) n FROM academy_module_catalogue WHERE module_id IN(SELECT set_id FROM memorisation_sets)').get().n,1);
    const admin=await login(env,'0001'),cat=ok(await post(env,'get',{view:'admin'},admin)),m=cat.sets.find(s=>s.id==='MEM-DUAS-1');
    const input={catalogueRevision:cat.revision,moduleId:m.id,name:'Renamed dua set',subject:m.subject,level:m.level,tasks:m.tasks,operationId:crypto.randomUUID()};
    ok(await post(env,'set-save',input,admin));
    assert.equal(db.prepare("SELECT name FROM academy_module_catalogue WHERE module_id='MEM-DUAS-1'").get().name,'Duas 1');
    assert.equal(db.prepare("SELECT name FROM memorisation_sets WHERE set_id='MEM-DUAS-1'").get().name,'Renamed dua set');
    assert.deepEqual(db.prepare('SELECT * FROM learner_task_progress ORDER BY task_id').all(),progress);
  }finally{db.close();}
});
test('separation failure rolls the entire catalogue and saved progress back',async()=>{
  const {db}=await memorisationFixture({separateSets:false});
  try{
    db.prepare("INSERT INTO learner_task_progress VALUES('account-0002','MEM-SURAHS-1-01',1,1,3,'2026-10-01','2026-10-01','account-0003','2026-10-01')").run();
    const old=db.prepare('SELECT * FROM learner_task_progress').all();
    db.exec("CREATE TRIGGER fail_separation BEFORE DELETE ON academy_module_catalogue BEGIN SELECT RAISE(ABORT,'synthetic migration failure'); END;");
    db.exec('BEGIN');assert.throws(()=>db.exec(readFileSync(new URL('../migrations/academy/0019_memorisation_sets.sql',import.meta.url),'utf8')),/synthetic migration failure/);db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT count(*) n FROM memorisation_modules').get().n,12);
    assert.deepEqual(db.prepare('SELECT * FROM learner_task_progress').all(),old);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='memorisation_sets'").get().n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('set edits and new SetName uploads never write curriculum modules or subjects',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),before=db.prepare('SELECT * FROM academy_module_catalogue ORDER BY module_id').all(),subjects=db.prepare('SELECT * FROM subject_catalog ORDER BY subject_key').all();
  let cat=ok(await post(env,'get',{view:'admin'},admin));assert.deepEqual(cat.sets,cat.modules);
  const existing=cat.sets[0],input={catalogueRevision:cat.revision,moduleId:existing.id,name:'My surah set',subject:'SURAHS',level:'Foundation',tasks:existing.tasks,operationId:crypto.randomUUID()};
  const saved=ok(await post(env,'set-save',input,admin));assert.equal(saved.setId,existing.id);
  assert.equal(ok(await post(env,'module-save',input,admin)).replayed,true,'Previous endpoint aliases keep exact retries');
  cat=ok(await post(env,'get',{view:'admin'},admin));
  ok(await post(env,'import',{catalogueRevision:cat.revision,sets:[{name:'My dua set',subject:'DUAS',level:'1',tasks:['A new dua']}],mode:'ADD',operationId:crypto.randomUUID()},admin));
  assert.deepEqual(db.prepare('SELECT * FROM academy_module_catalogue ORDER BY module_id').all(),before);
  assert.deepEqual(db.prepare('SELECT * FROM subject_catalog ORDER BY subject_key').all(),subjects);
  const preview=await (await worker.fetch(new Request('http://localhost'+path+'preview'),env)).json();assert.deepEqual(preview.sets,preview.modules);assert.equal(preview.legacy,undefined);
}));
test('rolling upgrade keeps existing cards readable and defers set administration until migration',async()=>{
  const f=await memorisationFixture({separateSets:false});
  try{
    const admin=await login(f.env,'0001'),cat=ok(await post(f.env,'get',{},admin));assert.equal(cat.sets.length,12);
    const m=cat.sets[0];assert.equal((await post(f.env,'set-save',{catalogueRevision:cat.revision,moduleId:m.id,name:m.name,subject:m.subject,level:m.level,tasks:m.tasks,operationId:crypto.randomUUID()},admin)).body.code,'MEMORISATION_SCHEMA_REQUIRED');
  }finally{f.db.close();}
});
