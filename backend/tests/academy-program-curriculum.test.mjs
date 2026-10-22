import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import worker from '../src/academy-runtime.js';
const id=PROGRAM_IDS[0],activity='PROGRAM:'+id;
async function fixture(run){const f=await mediaFixture();try{for(const migration of ['0022_academic_calendar.sql','0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};await run(f);}finally{f.db.close();}}
const call=async(f,action,input,token)=>{const r=await worker.fetch(new WorkspaceRequest('http://localhost/api/admin/platform/program-timetable/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({id,...input})}),f.env);return {status:r.status,body:await r.json()};};
async function add(f,token){const view=(await call(f,'manage-get',{},token)).body,key='PS-'+crypto.randomUUID();const added=await call(f,'manage-save',{kind:'subjects',record:{ProgramSubjectID:key,SubjectID:'ASSESSMENT-Qasas',Active:true},creating:true,baseRowRevision:view.emptyRowRevision,operationId:crypto.randomUUID()},token);assert.equal(added.status,200,JSON.stringify(added));return {key,revision:added.body.rowRevision};}

test('unused Program links can be removed with scope, row-version and idempotent safeguards; Academy catalogue stays active',()=>fixture(async f=>{
 const admin=await f.login('0001'),scoped=await f.login('0004'),student=await f.login('0002'),{key,revision}=await add(f,admin);
 const input={kind:'subjects',recordId:key,baseRowRevision:revision,operationId:crypto.randomUUID()};
 assert.equal((await call(f,'manage-remove',input,student)).status,403);
 assert.equal((await call(f,'manage-remove',{...input,id:PROGRAM_IDS[1]},scoped)).status,403);
 assert.equal((await call(f,'manage-remove',{...input,baseRowRevision:'stale'},admin)).status,409);
 const removed=await call(f,'manage-remove',input,scoped);assert.equal(removed.status,200,JSON.stringify(removed));assert.equal(removed.body.removed,true);
 assert.equal((await call(f,'manage-remove',input,scoped)).body.replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM program_subjects WHERE activity_key=? AND program_subject_id=?').get(activity,key).n,0);
 assert.equal(f.db.prepare("SELECT active FROM subject_catalog WHERE subject_key='ACADEMY:ASSESSMENT-Qasas'").get().active,1);
}));

test('draft lessons protect a subject and its module from removal and deactivation, including direct API requests',()=>fixture(async f=>{
 const token=await f.login('0001'),subject=f.db.prepare('SELECT program_subject_id FROM program_subjects WHERE activity_key=? LIMIT 1').get(activity).program_subject_id,module=f.db.prepare('SELECT module_id FROM modules WHERE activity_key=? AND program_subject_id=? LIMIT 1').get(activity,subject).module_id;
 f.db.prepare('UPDATE timetable_drafts SET draft_json=? WHERE activity_key=?').run(JSON.stringify({format:'105.3.2.2-weekly',timezone:'Africa/Johannesburg',rules:[{id:'RULE-protected',moduleId:module,classIds:['class-1'],teacherId:'account-0003',weekdays:[1],startTime:'10:00',endTime:'11:00'}]}),activity);
 const data=(await call(f,'get',{},token)).body;assert.equal(data.catalog.subjects.find(row=>row.id===subject).lessonUsed,true);assert.equal(data.catalog.modules.find(row=>row.id===module).lessonUsed,true);
 for(const [kind,key,field] of [['subjects',subject,'ProgramSubjectID'],['modules',module,'ProgramModuleID']]){
  const view=(await call(f,'manage-get',{},token)).body,row=view.rows[kind].find(row=>row[field]===key),revision=view.rowRevisions[kind][key];
  const removed=await call(f,'manage-remove',{kind,recordId:key,baseRowRevision:revision,operationId:crypto.randomUUID()},token);assert.equal(removed.status,409,JSON.stringify(removed));assert.equal(removed.body.code,'CURRICULUM_IN_USE');
  const inactive=await call(f,'manage-save',{kind,record:{...row,Active:false},creating:false,baseRowRevision:revision,operationId:crypto.randomUUID()},token);assert.equal(inactive.status,409,JSON.stringify(inactive));assert.equal(inactive.body.code,'CURRICULUM_IN_USE');
 }
 assert.equal(f.db.prepare('SELECT active FROM program_subjects WHERE activity_key=? AND program_subject_id=?').get(activity,subject).active,1);assert.equal(f.db.prepare('SELECT active FROM modules WHERE activity_key=? AND module_id=?').get(activity,module).active,1);
}));

test('published history protects Program curriculum even after its current draft no longer uses the entry',()=>fixture(async f=>{
 const token=await f.login('0001'),{key,revision}=await add(f,token),publication=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=? LIMIT 1').get(activity),snapshot=JSON.parse(publication.snapshot_json);
 snapshot.rules.push({id:'historic-reference',programSubjectId:key});const next={...publication,publication_id:'historic-curriculum-reference',version_no:publication.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(next);
 f.db.prepare(`INSERT INTO timetable_publications(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>next[key]));
 const removed=await call(f,'manage-remove',{kind:'subjects',recordId:key,baseRowRevision:revision,operationId:crypto.randomUUID()},token);assert.equal(removed.status,409);assert.equal(removed.body.code,'CURRICULUM_IN_USE');
 const view=(await call(f,'manage-get',{},token)).body,row=view.rows.subjects.find(row=>row.ProgramSubjectID===key);
 assert.equal((await call(f,'manage-save',{kind:'subjects',record:{...row,Active:false},baseRowRevision:view.rowRevisions.subjects[key],operationId:crypto.randomUUID()},token)).status,409);
 assert.equal(f.db.prepare("SELECT active FROM subject_catalog WHERE subject_key='ACADEMY:ASSESSMENT-Qasas'").get().active,1);
}));
