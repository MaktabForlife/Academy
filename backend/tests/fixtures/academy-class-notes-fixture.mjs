import {readFileSync} from 'node:fs';
import {separationFixture} from './academy-separation-fixture.mjs';
import {setupPublication,initialiseAcceptedSetup} from '../../src/academy/d1/setup-publication.js';
import {acceptedRepository} from '../../src/academy/d1/setup-reader.js';
import {academyD1Repository} from '../../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../../src/academy/d1/session.js';
import {classNotes} from '../../src/academy/d1/class-notes.js';
import {academyDate} from '../../src/academy/d1/academy-clock.js';
export async function classNotesFixture(seed){
 const f=await separationFixture();try{
  for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql','0036_class_notes.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
  if(seed)await seed(f);
  let head=(await initialiseAcceptedSetup(f.env.ACADEMY_DB)).head;
  f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';
  f.today=academyDate(new Date(),'Africa/Johannesburg');
  f.notes=async(workspace='ADMIN',who='global')=>{
   const token=who.startsWith('original-')?await f.login(who==='original-student'?'0002':'0003'):await f.actor(who),repository=academyD1Repository(f.env);await repository.ready();
   const auth=await authenticatedD1Account(new Request('http://localhost/api/academy/class-notes/get',{headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace}}),f.env,repository);
   return classNotes(acceptedRepository(repository,head),auth);
  };
  f.accept=async activityKey=>{const repository=academyD1Repository(f.env);await repository.ready();const auth=await authenticatedD1Account(new Request('http://localhost/api/admin/platform/setup/review',{headers:{Authorization:'Bearer '+await f.actor('global'),'X-Academy-Workspace':'ADMIN'}}),f.env,repository),service=setupPublication(repository,auth),selection={scopes:[activityKey]},review=await service.run('review',selection),frozen=await service.run('freeze',{...selection,digest:review.digest});head=(await service.run('publish',{batchId:frozen.batchId,digest:frozen.digest})).head;};
  f.post=(view,extra={})=>({activityKey:view.source.activityKey,source:{date:view.source.date,sessionKey:view.source.sessionKey,classId:view.source.classId},sourceToken:view.source.token,body:'Prepare paragraphs 1–3. حفظ الدرس',due:{mode:'NEXT',token:view.nextDue?.token},operationId:crypto.randomUUID(),...extra});
  return f;
 }catch(e){f.close();throw e;}
}

export function seedClassNotes(f){
 const row=f.db.prepare('SELECT * FROM timetable_publications WHERE activity_key=? LIMIT 1').get(f.scopes.programA),snapshot=JSON.parse(row.snapshot_json),module=f.db.prepare('SELECT module_id,program_subject_id FROM modules WHERE activity_key=? LIMIT 1').get(f.scopes.programA);
 snapshot.rules[0].moduleId=module.module_id;snapshot.rules[0].programSubjectId=module.program_subject_id;
 // The later lesson is a different subject: NEXT must skip it.
 snapshot.rules[1].programSubjectId='other-subject';
 const updated={...row,publication_id:'class-notes-publication',version_no:row.version_no+1,snapshot_json:JSON.stringify(snapshot)},columns=Object.keys(updated);
 f.db.prepare('INSERT INTO timetable_publications('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(updated));
 f.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(updated.publication_id,f.scopes.programA);
}
