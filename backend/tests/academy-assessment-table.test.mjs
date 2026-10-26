import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';
import {generateImtihaanFixture} from './fixtures/imtihaan-release-helpers.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../src/academy-runtime.js';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {academyDate,nextDate} from '../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},operation=()=>({operationId:crypto.randomUUID()}),today=()=>academyDate(new Date(),'Africa/Johannesburg');
async function use(fn){
 const f=await separationFixture();try{
  for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
  await initialiseAcceptedSetup(f.env.ACADEMY_DB);f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';
  const tokens={admin:await f.actor('global'),programAdmin:await f.actor('adminA'),teacher:await f.login('0003'),examiner:await f.actor('teacherA'),student:await f.login('0002')};
  f.request=async(action,input={},who='admin',workspace=['admin','programAdmin'].includes(who)?'ADMIN':['teacher','examiner'].includes(who)?'TEACH':'LEARN',bytes)=>{
   const path=action.startsWith('/')?action:'/api/academy/assessments/'+action,headers={Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})};
   const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:bytes||JSON.stringify(input)}),f.env);
   return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
  };
  f.accept=async()=>acceptFixtureSetup(f.env,tokens.admin,[scopes.programA]);
  f.create=async(input={})=>ok(await f.request('create',{...operation(),activityKey:scopes.programA,classId:'class-1',title:'Native assessment',subject:'Qasas',examDate:today(),durationMinutes:60,maximumMark:100,examinerId:!input.activityKey||input.activityKey===scopes.programA?'account-0003':null,...input})).assessmentId;
  f.detail=async(id,who='admin')=>ok(await f.request('get',{assessmentId:id},who));
  f.change=async(id,action,input={},who='admin')=>{const d=await f.detail(id);return f.request(action,{...operation(),assessmentId:id,revision:d.assessment.revision,...(d.group?.canManage?{groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision})),groupCollections:d.group.members.map(m=>({id:m.id,revision:m.collectionRevision}))}:{}),...input},who);};
  f.uploadNative=async(id,kind,input={},who='admin')=>{
   const detail=await f.detail(id),bytes=Buffer.from('%PDF-1.4\n% native '+(input.label||'fixture')+'\n%%EOF'),metadata={...operation(),kind,assessmentId:id,mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),filename:'answer.pdf',revision:detail.assessment.revision,...(kind==='PAPER'&&detail.group?{groupRevisions:detail.group.members.map(m=>({id:m.id,revision:m.revision}))}:{}),...input};
   return f.request('/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{},who,['admin','programAdmin'].includes(who)?'ADMIN':['teacher','examiner'].includes(who)?'TEACH':'LEARN',bytes);
  };
  f.allowMarks=async id=>{const d=await f.detail(id),registerId=d.assessment.registerId;return ok(await f.request('table-save',{...operation(),registerId,revision:f.db.prepare('SELECT revision FROM assessment_registers WHERE register_id=?').get(registerId).revision,rows:[{assessmentId:id,revision:d.assessment.revision,...(d.group?{groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision}))}:{}),changes:{marksModerated:true}}]}));};
  f.publish=async id=>{ok(await f.change(id,'publish'));await f.accept();};
  f.releasePaper=async id=>{const paper=ok(await f.uploadNative(id,'PAPER',{},'teacher'));ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:paper.fileId,sha256:f.db.prepare('SELECT sha256 FROM assessment_file_integrity WHERE file_id=?').get(paper.fileId).sha256}}));await f.accept();ok(await f.request('release-papers',{...operation(),papers:(await f.detail(id)).group?.members.map(m=>({id:m.id,revision:m.revision}))||[{id,revision:(await f.detail(id)).assessment.revision}]}));return paper;};
  await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
}

async function tableRow(f,id,changes){const d=await f.detail(id);return {assessmentId:id,revision:d.assessment.revision,...(d.group?{groupRevisions:d.group.members.map(m=>({id:m.id,revision:m.revision}))}:{}),paperReview:{fileId:d.assessment.paperFileId,sha256:d.assessment.paperSHA256||null},changes};}
async function saveTable(f,registerId,rows,extra={}){return f.request('table-save',{...operation(),registerId,revision:f.db.prepare('SELECT revision FROM assessment_registers WHERE register_id=?').get(registerId).revision,rows,...extra});}
async function reg(f){return ok(await f.request('register-create',{...operation(),name:'Table Imtihaan',activityKeys:[scopes.programA],classMode:'ALL',status:'REGISTERED'})).registerId;}

test('one table save edits published future details and saves approval, readiness and collection atomically; retry is exact',()=>use(async f=>{
 const registerId=await reg(f),id=await f.create({registerId,examDate:nextDate(today(),5)});await f.publish(id);await f.uploadNative(id,'PAPER');
 const row=await tableRow(f,id,{details:{title:'Revised paper',maximumMark:80},approve:true,ready:true,closed:true}),body={...operation(),registerId,revision:f.db.prepare('SELECT revision FROM assessment_registers WHERE register_id=?').get(registerId).revision,rows:[row]};
 const result=ok(await f.request('table-save',body));assert.equal(result.saved,1);assert.equal(ok(await f.request('table-save',body)).replayed,true);
 const stored=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);assert.equal(stored.title,'Revised paper');assert.equal(stored.maximum_mark,80);assert.equal(stored.paper_state,'APPROVED');assert(stored.ready_for_assessment_at);assert.equal(stored.paper_released_at,null);assert(f.db.prepare('SELECT closed_at FROM assessment_collection WHERE assessment_id=?').get(id).closed_at);
 assert.equal(f.db.prepare("SELECT count(*) n FROM assessment_events WHERE action='table-save'").get().n,1);
 const listed=ok(await f.request('list',{view:'admin'})).assessments.find(a=>a.id===id);assert.equal(listed.canEditDetails,true);assert(listed.paperFileId);assert(listed.paperSHA256);
}));

test('invalid files, stale revisions, scoped authority and failures cannot partially save a table batch',()=>use(async f=>{
 const registerId=await reg(f),a=await f.create({registerId}),b=await f.create({registerId});await f.uploadNative(b,'PAPER');
 const first=await tableRow(f,a,{details:{title:'Should roll back'}}),bad=await tableRow(f,b,{approve:true});bad.paperReview.fileId='wrong';
 assert.equal((await saveTable(f,registerId,[first,bad])).body.code,'PAPER_REVIEW_REQUIRED');assert.notEqual(f.db.prepare('SELECT title FROM assessments WHERE assessment_id=?').get(a).title,'Should roll back');
 assert.equal((await f.request('table-save',{...operation(),registerId,revision:1,rows:[first]},'teacher')).status,403);
 f.db.exec("CREATE TRIGGER reject_table_save BEFORE INSERT ON assessment_events WHEN NEW.action='table-save' BEGIN SELECT RAISE(ABORT,'table_write_failure'); END;");
 assert.equal((await saveTable(f,registerId,[first])).status,503);assert.notEqual(f.db.prepare('SELECT title FROM assessments WHERE assessment_id=?').get(a).title,'Should roll back');f.db.exec('DROP TRIGGER reject_table_save');
 ok(await saveTable(f,registerId,[first]));assert.equal((await saveTable(f,registerId,[first])).body.code,'ROW_CHANGED');
}));

test('Program Admin replaces released papers before and after availability with confirmation and fresh approval',()=>use(async f=>{
 const id=await f.create({examDate:nextDate(today(),5)});await f.publish(id);const old=await f.releasePaper(id);
 assert.equal((await f.uploadNative(id,'PAPER',{},'teacher')).status,403);
 const impact=ok(await f.request('paper-replacement-preview',{assessmentId:id}));const changed=ok(await f.uploadNative(id,'PAPER',{label:'replacement',confirmReplacement:true,replacementFingerprint:impact.fingerprint},'programAdmin'));assert.notEqual(changed.fileId,old.fileId);let a=f.db.prepare('SELECT * FROM assessments WHERE assessment_id=?').get(id);assert.equal(a.paper_state,'IN_REVIEW');assert.equal(a.paper_released_at,null);
 ok(await f.change(id,'review-paper',{decision:'APPROVE',paperReview:{fileId:changed.fileId,sha256:changed.sha256}}));ok(await f.request('release-papers',{...operation(),papers:[{id,revision:(await f.detail(id)).assessment.revision}]}));
 f.db.prepare('UPDATE assessments SET available_from=? WHERE assessment_id=?').run(new Date(Date.now()-1000).toISOString(),id);
 const after=ok(await f.request('paper-replacement-preview',{assessmentId:id}));ok(await f.uploadNative(id,'PAPER',{label:'available replacement',confirmReplacement:true,replacementFingerprint:after.fingerprint},'programAdmin'));assert.equal(f.db.prepare('SELECT paper_state FROM assessments WHERE assessment_id=?').get(id).paper_state,'IN_REVIEW');
}));

test('Imtihaan release follows entry, moderation and private report generation, preserving zero and pending marks',()=>use(async f=>{
 const registerId=await reg(f),ids=[await f.create({registerId,title:'Paper A'}),await f.create({registerId,title:'Paper B'})];for(const id of ids){await f.publish(id);ok(await f.request('marks-list',{assessmentId:id}));}
 for(const [i,id] of ids.entries()){const list=ok(await f.request('marks-list',{assessmentId:id})),c=list.classes[0],r=c.students[0];ok(await f.request('marks-save',{...operation(),assessmentId:id,groupRevisions:[{id,revision:c.revision}],entries:[{assessmentId:id,accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:i?70:0}]}));}
 let summary=ok(await f.request('register-marks-preview',{registerId}));assert.equal(summary.marks,2);assert.equal(summary.unmoderated.length,2);assert.equal((await f.request('register-marks-release',{...operation(),...summary,confirm:true})).body.code,'MARKING_NOT_READY');
 ok(await saveTable(f,registerId,await Promise.all(ids.map(id=>tableRow(f,id,{ready:true,marksModerated:true})))));
 summary=ok(await f.request('register-marks-preview',{registerId}));assert.equal((await f.request('register-marks-release',{...operation(),...summary,confirm:true})).body.code,'REPORTS_REQUIRED');
 await generateImtihaanFixture(f,registerId);summary=ok(await f.request('register-marks-preview',{registerId}));const body={...operation(),...summary,confirm:true};assert.equal(ok(await f.request('register-marks-release',body)).released,2);assert.equal(ok(await f.request('register-marks-release',body)).replayed,true);
 const next=ok(await f.request('marks-list',{assessmentId:ids[0]})),c=next.classes[0],r=c.students[0];ok(await f.request('marks-save',{...operation(),assessmentId:ids[0],groupRevisions:[{id:ids[0],revision:c.revision}],entries:[{assessmentId:ids[0],accountId:r.accountId,recipientRevision:r.revision,markId:r.markId,mark:25}]}));
 const listed=ok(await f.request('list',{view:'admin'}));assert.equal(listed.assessments.find(a=>a.id===ids[0]).marksModerated,false);summary=ok(await f.request('register-marks-preview',{registerId}));assert.equal(summary.unmoderated.length,1);assert.equal(summary.reportsReady,false);assert.equal(summary.marks,1);
}));

test('staff progress records actual access and submission times, requires PDF review before receipt, and rejects learners',()=>use(async f=>{
 const id=await f.create({assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',durationMinutes:null,examDate:null,availableFrom:new Date(Date.now()-3600000).toISOString(),dueDate:nextDate(today(),2)});await f.publish(id);const paper=await f.releasePaper(id);
 assert.equal((await f.request('progress-list',{assessmentId:id},'student')).status,403);
 let progress=ok(await f.request('progress-list',{assessmentId:id},'teacher'));assert(progress.classes[0].students.every(r=>!r.accessedAt&&!r.submittedAt&&r.elapsedSeconds===null));
 ok(await f.request('download',{fileId:paper.fileId,assessmentId:id,...operation()},'student'));
 f.db.prepare('UPDATE assessment_recipients SET first_accessed_at=? WHERE assessment_id=? AND account_id=?').run(new Date(Date.now()-125000).toISOString(),id,'account-0002');
 let d=await f.detail(id,'student');ok(await f.uploadNative(id,'ANSWER',{recipientRevision:d.learners[0].revision},'student'));
 progress=ok(await f.request('progress-list',{assessmentId:id},'teacher'));let r=progress.classes[0].students.find(r=>r.accountId==='account-0002');assert(r.accessedAt&&r.submittedAt);assert(r.elapsedSeconds>=125);assert.equal(r.confirmedAt,null);
 const confirm={accountId:r.accountId,recipientRevision:r.revision,submissionId:r.submissionId};assert.equal((await f.change(id,'confirm-submission',confirm,'teacher')).status,409);
 ok(await f.request('download',{fileId:r.fileId,assessmentId:id,...operation()},'teacher'));ok(await f.change(id,'confirm-submission',confirm,'teacher'));
 progress=ok(await f.request('progress-list',{assessmentId:id},'teacher'));r=progress.classes[0].students.find(r=>r.accountId==='account-0002');assert(r.confirmedAt);
}));
