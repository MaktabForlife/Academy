import {WorkspaceRequest} from './workspace-request.mjs';
import {readFileSync} from 'node:fs';
import {assessmentFixture} from './academy-assessment-fixture.mjs';
import {MOU_MEDIA_PROGRAM} from '../../src/academy/d1/lesson-media.js';
import worker from '../../src/academy-runtime.js';
import {createHash} from 'node:crypto';
export async function mediaFixture({upgrade=true}={}){
 const f=await assessmentFixture(),scope=MOU_MEDIA_PROGRAM;
 f.db.exec(readFileSync(new URL('../../migrations/academy/0017_lesson_media.sql',import.meta.url),'utf8'));
 f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'PROGRAM','Mothers of the Ummah',1,'ACTIVE',1)").run(scope,scope.slice(8));
 f.db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run(scope);
 f.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run(scope);
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'mou-class','Term 4: 2026',1)").run(scope);
 for(const [account,role] of [['0002','STUDENT'],['0008','STUDENT'],['0003','TEACHER'],['0004','PROGRAM_ADMIN'],['0006','TEACHER']])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,?,1,'CONFIRMED')").run('media-role-'+account,'account-'+account,scope,role);
 for(const [day,title] of [[6,'Tarteel & Tadabbur'],[7,'Duas & Akhlaaq'],[8,'Tazkiyah & Tarikh']]){
  const id='MOU-2026100'+day;
  f.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,source_lessons_json,updated_at) VALUES(?,?,'mou-class',?,?,'09:30','10:30','account-0003','Ml Shakirah','PUBLISHED',?,'2026-10-10T00:00:00Z')").run(id,scope,'2026-10-0'+day,title,JSON.stringify([{module:title,startTime:'09:30',endTime:'10:30'}]));
  f.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,youtube_id,created_at) VALUES(?,?,'YOUTUBE',?,'2026-10-10T00:00:00Z')").run('video-'+day,scope,['9IuTDcSs6vQ','ujm0T_jZd0U','CZPSPSG85NQ'][day-6]);
  f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(id,'video-'+day);
 }
 if(upgrade){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../../migrations/academy/0030_session_lesson_media.sql',import.meta.url),'utf8'));f.db.exec(readFileSync(new URL('../../migrations/academy/0031_media_names_and_course_pdfs.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');}
 f.env.LESSON_MEDIA_BUCKET=f.env.ASSESSMENT_BUCKET;
 f.media=async(action,input={},token='')=>{const response=await worker.fetch(new WorkspaceRequest('http://localhost/api/academy/lesson-media/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...(!input.lessonId?{activityKey:scope}:{}),...input})}),f.env);return {status:response.status,body:response.headers.get('content-type')==='application/pdf'?await response.text():await response.json(),headers:response.headers};};
 f.mediaUpload=async(input,token,bytes=Buffer.from('%PDF-1.4\n% demo notes\n%%EOF'))=>{
  const metadata={lessonId:'MOU-20261006',revision:1,size:bytes.length,filename:'notes.pdf',sha256:createHash('sha256').update(bytes).digest('hex'),operationId:crypto.randomUUID(),...input};
  const response=await worker.fetch(new WorkspaceRequest('http://localhost/api/academy/lesson-media/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+token},body:bytes}),f.env);return {status:response.status,body:await response.json(),metadata};
 };
 return f;
}
