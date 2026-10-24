// Synthetic accounts, memory-only SQLite and Map-backed R2; no live snapshots.
import {readFileSync} from 'node:fs';
import {mediaFixture} from './academy-lesson-media-fixture.mjs';
import {attendanceProgramId} from './academy-attendance-fixture.mjs';
import {PROGRAM_IDS} from './academy-migration-fixture.mjs';

export const separationScopes=Object.freeze({programA:'PROGRAM:'+attendanceProgramId,programB:'PROGRAM:'+PROGRAM_IDS[1],courseA:'COURSE:SEPARATION-A',courseB:'COURSE:SEPARATION-B'});
export const separationActors=Object.freeze({global:'sep-global',adminA:'sep-admin-a',adminB:'sep-admin-b',teacherA:'sep-teacher-a',teacherB:'sep-teacher-b',studentA:'sep-student-a',studentB:'sep-student-b',dual:'sep-dual',disabled:'sep-disabled',none:'sep-none'});
const ok=r=>{if(r.status!==200)throw Error(JSON.stringify(r.body));return r.body;};

export async function separationFixture(){
 const f=await mediaFixture();
 try{
  for(const name of ['0022_academic_calendar.sql','0023_lesson_planning.sql','0024_announcements_and_plan_requirements.sql','0025_pdf_bookmarks.sql','0026_enrolment_requests.sql','0027_enrolment_profile_contacts.sql','0028_hifz_profile_sync.sql','0029_hifz_shared_pin.sql'])f.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));
  f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
  for(const key of Object.keys(f.env))if(key.startsWith('HIFZ_'))delete f.env[key];
  const pin=f.db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash;
  for(const [role,id] of Object.entries(separationActors)){
   f.db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,?)').run(id,'Synthetic '+role,'separation-'+role,role==='disabled'?0:1);
   f.db.prepare('INSERT INTO account_credentials(account_id,pin_hash,pin_setup,credential_epoch) VALUES(?,?,1,1)').run(id,pin);
  }
  f.db.prepare("INSERT INTO global_role_assignments(assignment_id,account_id,role,active,review_state) VALUES('sep-global-role',?,'GLOBAL_ADMIN',1,'CONFIRMED')").run(separationActors.global);
  for(const key of [separationScopes.courseA,separationScopes.courseB]){
   f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'COURSE',?,1,'ACTIVE',1)").run(key,key.slice(7),'Synthetic '+key);
   f.db.prepare("INSERT INTO course_settings(activity_key,legacy_access_model,policy_review_state) VALUES(?,'PAID','CONFIRMED')").run(key);
   f.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run(key);
  }
  const grant=(actor,scope,role)=>f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run([actor,scope,role].join('|'),actor,scope,role);
  for(const side of ['A','B'])for(const scope of [separationScopes['program'+side],separationScopes['course'+side]]){
   for(const [actor,role] of [['admin','PROGRAM_ADMIN'],['teacher','TEACHER'],['student','STUDENT']])grant(separationActors[actor+side],scope,role);
  }
  for(const scope of [separationScopes.programA,separationScopes.courseA])for(const role of ['PROGRAM_ADMIN','TEACHER','STUDENT'])grant(separationActors.dual,scope,role);
  const tokens=new Map();
  f.actor=async role=>{
   if(!Object.hasOwn(separationActors,role))throw Error('Unknown synthetic actor');
   if(!tokens.has(role))tokens.set(role,ok(await f.call('/api/account/login',{uniqueid:'separation-'+role,pin:'1234'})).token);
   return tokens.get(role);
  };
  f.scopes=separationScopes;f.actors=separationActors;
  f.seedCoursePdf=async({scope=separationScopes.courseA,name='Synthetic Course handbook',bytes}={})=>{
   const token=await f.actor('global');
   const made=ok(await f.media('course-files-create',{activityKey:scope,operationId:crypto.randomUUID()},token));
   const uploaded=ok(await f.mediaUpload({lessonId:made.lessonId,revision:1,filename:'synthetic-handbook.pdf',name},token,bytes));
   ok(await f.media('save',{lessonId:made.lessonId,revision:2,operationId:crypto.randomUUID(),title:'Course PDFs',summary:'Synthetic baseline only',state:'PUBLISHED',commentsClosed:true,recordingUrls:[]},token));
   return {lessonId:made.lessonId,assetId:uploaded.assetId};
  };
  f.close=()=>f.db.close();
  return f;
 }catch(error){f.db.close();throw error;}
}
