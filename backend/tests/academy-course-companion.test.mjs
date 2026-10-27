import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {courseCompanion,isSurahKahfCourse} from '../src/academy/course-books/course-companion.js';
const activity={kind:'COURSE',name:'Surah Al Kahf'},scope='COURSE:kahf-reader-test',collection='KAHF-COURSE-PDFS';
const published={media:{id:collection,state:'PUBLISHED',assets:[{id:'kahf-pdf',kind:'PDF',filename:'Surah Kahf.pdf'}]}};
test('the reading edition is selected only for the intended course and a published collection',()=>{
 for(const name of ['Surah Al Kahf','Surah Kahf','Surat al-Kahf','سُورَة الكَهْف'])assert.equal(isSurahKahfCourse({...activity,name}),true);
 for(const wrong of [{kind:'PROGRAM',name:activity.name},{...activity,name:'Surah Yasin'},{kind:'COURSE'}])assert.equal(courseCompanion(wrong,published),null);
 for(const files of [null,{media:null},{media:{...published.media,state:'DRAFT'}},{media:{...published.media,state:'HIDDEN'}},{media:{...published.media,assets:[]}}])assert.equal(courseCompanion(activity,files),null);
 const edition=courseCompanion(activity,published);assert.equal(edition.lessons.length,11);
 assert.equal(new Set(edition.lessons.map(l=>l.id)).size,11);
 assert.equal(edition.lessons.flatMap(l=>l.sections).flatMap(s=>s.body.match(/data-note-key=/g)||[]).length,6);
 const body=JSON.stringify(edition.lessons);
 assert.doesNotMatch(body,/booklet|view the original|#page=|\bPDF\b|"pages":|undefined/iu);
 assert.match(body,/18:110/);assert.match(body,/24:39/);assert.match(body,/[\u0600-\u06ff]/u);
});
async function fixture(){
 const f=await mediaFixture();
 f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'COURSE','Surah Al Kahf',1,'ACTIVE',1)").run(scope,'kahf-reader-test');
 f.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run(scope);
 for(const id of ['0002','0008'])f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,'STUDENT',1,'CONFIRMED')").run('kahf-'+id,'account-'+id,scope);
 f.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,lesson_date,title,start_time,end_time,teacher_name,state,comments_closed,updated_at,media_scope) VALUES(?,?,'','Course PDFs','','','','PUBLISHED',1,'2026-10-27T00:00:00Z','COURSE')").run(collection,scope);
 f.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES('kahf-pdf',?,'PDF','test.pdf','Surah Kahf.pdf',25,'2026-10-27T00:00:00Z')").run(scope);
 f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(collection,'kahf-pdf');
 return f;
}
const use=fn=>async()=>{const f=await fixture();try{await fn(f);}finally{f.db.close();}};
const input={activityKey:scope,view:'learner',includeCourseCompanion:true};
test('only a current authorised Academy session receives the full lesson text',use(async f=>{
 const student=await f.login('0002'),peer=await f.login('0008'),other=await f.login('0005');
 const result=await f.media('feed',input,student);assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.courseCompanion.lessons.length,11);assert.ok(result.body.courseCompanion.readerKey);
 const second=await f.media('feed',input,peer);assert.equal(second.status,200);assert.notEqual(second.body.courseCompanion.readerKey,result.body.courseCompanion.readerKey);
 const again=await f.media('feed',input,student);assert.equal(again.body.courseCompanion.readerKey,result.body.courseCompanion.readerKey);
 const normal=await f.media('feed',{activityKey:scope,view:'learner'},student);assert.equal(normal.status,200);assert.equal('courseCompanion' in normal.body,false);assert.notEqual(normal.body.cacheRevision,result.body.cacheRevision);
 for(const session of ['',other]){const denied=await f.media('feed',input,session);assert.ok([401,403].includes(denied.status));assert.equal(denied.body.courseCompanion,undefined);}
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);
 const revoked=await f.media('feed',input,student);assert.ok([401,403].includes(revoked.status));assert.equal(revoked.body.courseCompanion,undefined);
}));
test('hiding the published collection or revoking the account closes the reading edition',use(async f=>{
 const student=await f.login('0002');
 f.db.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").run(collection);
 const hidden=await f.media('feed',input,student);assert.equal(hidden.status,200,JSON.stringify(hidden.body));assert.equal(hidden.body.courseCompanion,null);
 f.db.prepare("UPDATE lesson_media_lessons SET state='PUBLISHED' WHERE lesson_id=?").run(collection);
 f.db.prepare("UPDATE account_sessions SET revoked_at='2026-10-27T00:00:00Z' WHERE account_id='account-0002'").run();
 const ended=await f.media('feed',input,student);assert.equal(ended.status,401);assert.equal(ended.body.courseCompanion,undefined);
}));
