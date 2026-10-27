import {acceptFixtureSetup} from './academy-accepted-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../../src/academy-runtime.js';
import {separationFixture,separationScopes as scopes} from './academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../../src/academy/d1/setup-publication.js';
import {academyDate,nextDate} from '../../src/academy/d1/academy-clock.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},operation=()=>({operationId:crypto.randomUUID()}),today=()=>academyDate(new Date(),'Africa/Johannesburg');
export async function nativeImtihaan(fn){
 const f=await separationFixture();try{
  for(const name of ['0039_course_websites.sql','0041_program_surah_websites.sql','0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
  await initialiseAcceptedSetup(f.env.ACADEMY_DB);f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';
  const tokens={admin:await f.actor('global'),programAdmin:await f.actor('adminA'),teacher:await f.login('0003'),examiner:await f.actor('teacherA'),student:await f.login('0002')};
  f.request=async(action,input={},who='admin',workspace=['admin','programAdmin'].includes(who)?'ADMIN':['teacher','examiner'].includes(who)?'TEACH':'LEARN',bytes)=>{
   const path=action.startsWith('/')?action:'/api/academy/assessments/'+action,headers={Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})};
   const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers,body:bytes||JSON.stringify(input)}),f.env);
   return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
  };
  f.accept=async()=>acceptFixtureSetup(f.env,tokens.admin,[scopes.programA]);
  f.create=async(input={})=>{const created=ok(await f.request('create',{...operation(),activityKey:scopes.programA,classId:'class-1',title:'Native assessment',subject:'Qasas',examDate:today(),durationMinutes:60,maximumMark:100,examinerId:!input.activityKey||input.activityKey===scopes.programA?'account-0003':null,...input}));const id=created.assessmentId;/* Access tests use an already-open synthetic exam; opening-time policy is tested separately. */if(!input.examDate&&input.assessmentKind!=='ASSIGNMENT')f.db.prepare('UPDATE assessments SET available_from=? WHERE assessment_id IN(SELECT value FROM json_each(?))').run(new Date(Date.now()-4*3600000).toISOString(),JSON.stringify(created.assessmentIds||[id]));return id;};
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

export {ok,operation,today};
