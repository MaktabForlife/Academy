import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import worker from '../src/academy-runtime.js';import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()}),today=()=>academyDate(new Date(),'Africa/Johannesburg');
async function use(fn){const f=await separationFixture();try{
 for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
 await initialiseAcceptedSetup(f.env.ACADEMY_DB);Object.assign(f.env,{ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'});
 const tokens={admin:await f.actor('global'),teacher:await f.login('0003'),otherTeacher:await f.login('0006'),student:await f.login('0002'),courseStudent:await f.actor('studentA')};
 f.tokens=tokens;
 f.request=async(action,input={},who='teacher',workspace=who==='admin'?'ADMIN':who==='student'?'LEARN':'TEACH',bytes)=>{const path=action.startsWith('/')?action:'/api/academy/lesson-media/'+action,response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})},body:bytes||JSON.stringify(input)}),f.env);return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};};
 f.calendar=async(who='teacher')=>ok(await f.request('calendar',{activityKey:scopes.programA,startDate:today(),endDate:today()},who));
 f.post=async(session,input={},who='teacher',workspace)=>{const bytes=Buffer.from('%PDF-1.4\n% own note '+(input.label||'fixture')+'\n%%EOF'),metadata={...op(),activityKey:scopes.programA,startDate:session.date,endDate:session.date,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,filename:'original-notes.pdf',name:'Own note',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...input};const result=await f.request('note-upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,workspace|| (who==='admin'?'ADMIN':'TEACH'),bytes);return {...result,metadata};};
 f.accept=async(key=scopes.programA)=>{const input={scopes:[key],families:['media']},review=ok(await f.request('/api/admin/platform/setup/review',input,'admin')),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...input,digest:review.digest},'admin'));ok(await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest},'admin'));};
 await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}}
test('a verified Teacher posts a private-bucket own PDF without general curation or inferred legacy authorship',()=>use(async f=>{
 const calendar=await f.calendar(),session=calendar.sessions.find(s=>s.canContribute);assert(session);assert.equal(calendar.canManage,false);const posted=ok(await f.post(session));
 const source=f.db.prepare('SELECT n.*,v.uploaded_by FROM lesson_note_entries n JOIN lesson_note_versions v ON v.version_id=n.current_version_id').get();assert.equal(source.owner_id,'account-0003');assert.equal(source.uploaded_by,'account-0003');
 const learner=await f.calendar('student'),row=learner.sessions.find(s=>s.sessionKey===session.sessionKey);assert(row.media.assets.some(a=>a.id===posted.versionId));assert.equal(row.canContribute,false);ok(await f.request('download',{lessonId:row.media.id,assetId:posted.versionId},'student'));
 assert.equal((await f.post(session,{},'otherTeacher')).status,403);assert.equal((await f.post(session,{},'teacher','ADMIN')).status,403);const inherited=ok(await f.post(session,{},'admin','TEACH'));assert.equal(f.db.prepare('SELECT owner_id FROM lesson_note_entries WHERE note_id=?').get(inherited.noteId).owner_id,'sep-global');
 for(const action of ['comments','comment-save','comment-moderate'])assert.equal((await f.request(action,{lessonId:row.media.id},'student')).status,410);
}));
test('replacement uses the same slot at the ten-PDF cap and withdrawal preserves immutable history',()=>use(async f=>{
 const session=(await f.calendar()).sessions.find(s=>s.canContribute),made=[];for(let i=0;i<10;i++)made.push(ok(await f.post(session,{label:String(i)})));assert.equal((await f.post(session)).body.code,'MEDIA_PDF_LIMIT');
 const replaced=ok(await f.post(session,{noteId:made[0].noteId,revision:1,label:'replacement'}));assert.equal(replaced.noteId,made[0].noteId);assert.notEqual(replaced.versionId,made[0].versionId);assert.equal(f.db.prepare("SELECT count(*) n FROM lesson_note_entries WHERE state='ACTIVE'").get().n,10);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,11);
 const input={...op(),activityKey:scopes.programA,startDate:today(),endDate:today(),sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,noteId:replaced.noteId,revision:2};ok(await f.request('note-withdraw',input));assert.equal(ok(await f.request('note-withdraw',input)).replayed,true);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,11);
 assert(!(await f.calendar('student')).sessions.flatMap(s=>s.media?.assets||[]).some(a=>a.noteId===replaced.noteId));assert.throws(()=>f.db.exec("UPDATE lesson_note_entries SET owner_id='account-0002'"),/immutable/);
}));
test('older own-note-only media can be found from an empty week and keeps the official single-class audience rule',()=>use(async f=>{
 const date=nextDate(today(),-7),calendar=ok(await f.request('calendar',{activityKey:scopes.programA,startDate:date,endDate:date})),session=calendar.sessions.find(s=>s.canContribute);assert(session);const posted=ok(await f.post(session));
 const empty=nextDate(today(),45),initial=ok(await f.request('calendar',{activityKey:scopes.programA,startDate:empty,endDate:empty,initial:true},'student'));assert.equal(initial.sessions.length,0);assert.equal(initial.suggestedDate,date);
 f.db.prepare("DELETE FROM class_memberships WHERE account_id='account-0002' AND activity_key=?").run(scopes.programA);
 const request={activityKey:scopes.programA,startDate:date,endDate:date};assert.equal(ok(await f.request('calendar',request,'student')).sessions.length,0);
 f.db.prepare('UPDATE classes SET active=0 WHERE activity_key=? AND class_id<>?').run(scopes.programA,session.classIds[0]);
 const view=ok(await f.request('calendar',request,'student')),row=view.sessions.find(s=>s.sessionKey===session.sessionKey);assert(row.media.assets.some(a=>a.id===posted.versionId));ok(await f.request('download',{lessonId:row.media.id,assetId:posted.versionId},'student'));
}));
test('hidden media stays suppressed through a draft save and becomes readable only after reviewed publication',()=>use(async f=>{
 const session=(await f.calendar()).sessions.find(s=>s.canContribute);ok(await f.post(session));
 const made=ok(await f.request('create',{...op(),activityKey:scopes.programA,startDate:today(),endDate:today(),sessionKey:session.sessionKey,sessionVersion:session.sessionVersion},'admin'));
 const save=async(state,revision)=>ok(await f.request('save',{...op(),activityKey:scopes.programA,lessonId:made.lessonId,revision,title:'Curated session',summary:'',state,commentsClosed:true,videos:[]},'admin'));
 await save('HIDDEN',1);assert.equal((await f.calendar('student')).sessions.flatMap(s=>s.media?.assets||[]).length,0);
 await save('DRAFT',2);assert.equal((await f.calendar('student')).sessions.flatMap(s=>s.media?.assets||[]).length,0);
 await save('PUBLISHED',3);assert.equal((await f.calendar('student')).sessions.flatMap(s=>s.media?.assets||[]).length,0);await f.accept();assert.equal((await f.calendar('student')).sessions.flatMap(s=>s.media?.assets||[]).length,1);
}));
test('a retained own-note session stays readable after its class leaves the current timetable',()=>use(async f=>{
 const session=(await f.calendar()).sessions.find(s=>s.canContribute),posted=ok(await f.post(session));
 f.db.prepare('UPDATE classes SET active=0 WHERE activity_key=?').run(scopes.programA);
 const view=await f.calendar('student'),row=view.sessions.find(s=>s.sessionKey===session.sessionKey);assert(row);assert.equal(row.savedMedia,true);assert.equal(row.canContribute,false);assert(row.media.assets.some(a=>a.id===posted.versionId));ok(await f.request('download',{lessonId:row.media.id,assetId:posted.versionId},'student'));
 assert.equal((await f.post(session)).status,409);
}));
test('whole-change publication cannot exceed the shared PDF cap when Teacher work arrived after a private draft',()=>use(async f=>{
 const session=(await f.calendar()).sessions.find(s=>s.canContribute),made=ok(await f.request('create',{...op(),activityKey:scopes.programA,startDate:today(),endDate:today(),sessionKey:session.sessionKey,sessionVersion:session.sessionVersion},'admin'));
 const admin=await f.actor('global');for(let i=0;i<9;i++)ok(await f.mediaUpload({lessonId:made.lessonId,revision:i+1,name:'Draft PDF '+i},admin));
 ok(await f.post(session,{label:'first'}));ok(await f.post(session,{label:'second'}));
 ok(await f.request('save',{...op(),lessonId:made.lessonId,revision:10,title:'Staged PDFs',summary:'',state:'PUBLISHED',commentsClosed:true,videos:[]},'admin'));
 const head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,input={scopes:[scopes.programA],families:['media']},review=ok(await f.request('/api/admin/platform/setup/review',input,'admin')),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...input,digest:review.digest},'admin'));
 const result=await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest},'admin');assert.equal(result.status,409);assert.equal(result.body.code,'SETUP_MEDIA_LIMIT');assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,head);assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_note_versions').get().n,2);
}));
test('Course PDFs retain current paid entitlement through an archived delivery; attendance membership grants no bytes',()=>use(async f=>{
 const file=await f.seedCoursePdf({scope:scopes.courseA});await f.accept(scopes.courseA);
 f.db.prepare("INSERT INTO course_runs(activity_key,run_id,name,timezone,active) VALUES(?,'media-history-run','Recorded Course','Africa/Johannesburg',0)").run(scopes.courseA);
 const original=f.db.prepare("SELECT * FROM timetable_publications WHERE activity_key='COURSE:subject-1'").get(),row={...original,activity_key:scopes.courseA,publication_id:'media-history-publication',scope_key:'media-history-run',version_no:1},snapshot=JSON.parse(row.snapshot_json);snapshot.publication.SubjectID=scopes.courseA.slice(7);snapshot.publication.RunID='media-history-run';snapshot.publication.PublicationID=row.publication_id;snapshot.sessions=[];row.snapshot_json=JSON.stringify(snapshot);const columns=Object.keys(row);f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));
 f.db.prepare("INSERT INTO course_run_state(activity_key,run_id,stage,current_publication_id) VALUES(?,'media-history-run','ARCHIVED','media-history-publication')").run(scopes.courseA);
 const selection={scopes:[scopes.courseA]},review=ok(await f.request('/api/admin/platform/setup/review',selection,'admin')),batch=ok(await f.request('/api/admin/platform/setup/freeze',{...selection,digest:review.digest},'admin'));ok(await f.request('/api/admin/platform/setup/publish',{batchId:batch.batchId,digest:batch.digest},'admin'));
 const view=ok(await f.request('calendar',{activityKey:scopes.courseA,startDate:today(),endDate:today(),runId:'media-history-run'},'courseStudent','LEARN'));assert(view.courseFiles.media.assets.some(a=>a.id===file.assetId));ok(await f.request('download',file,'courseStudent','LEARN'));
 const catalogue=ok(await f.request('/api/academy/courses/catalogue',{},'courseStudent','LEARN'));assert(catalogue.courses.some(c=>c.id===scopes.courseA.slice(7)&&c.mediaAvailable&&!c.canOpenActivity));
 const day=ok(await f.request('/api/academy/attendance/get',{activityKey:scopes.programA,date:today()},'admin')),grant=ok(await f.request('/api/academy/attendance/substitute-save',{...op(),activityKey:scopes.programA,generation:day.generation,date:today(),stableKey:day.lessons[0].lesson.stableKey,accountId:f.actors.none},'admin'));assert(grant.assignmentId);f.tokens.none=await f.actor('none');
 const roster=ok(await f.request('/api/academy/attendance/roster-get',{activityKey:scopes.courseA,runId:'media-history-run'},'admin'));ok(await f.request('/api/academy/attendance/roster-save',{...op(),activityKey:scopes.courseA,runId:'media-history-run',generation:roster.generation,revision:roster.revision,prefillRevision:roster.prefillRevision,intervals:[{accountId:f.actors.none,joinDate:today(),leaveDate:'',state:'VALID'}]},'admin'));
 assert.equal((await f.request('download',file,'none','LEARN')).status,403);assert.equal(f.db.prepare('SELECT count(*) n FROM role_assignments WHERE account_id=?').get(f.actors.none).n,0);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?").run(f.actors.studentA,scopes.courseA);assert([401,403].includes((await f.request('download',file,'courseStudent','LEARN')).status));
}));
