import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {recordingGroupIdentity} from '../src/academy/d1/recording-groups.js';
import {permittedRecordingGroups,recordingCollectionHTML,academicCompanionHTML,presentRecordingPlayback} from '../../js/m4l-recording-collections.mjs';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {mp4} from './fixtures/academy-session-video-fixture.mjs';
import {cleanupExpiredAcademicCompanions} from '../src/academy/d1/recording-companions.js';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
const base={lesson_id:'one',activity_key:'PROGRAM:alimiyah',class_id:'year4-cohort2026',teacher_id:'teacher-1',teacher_ids_json:'["teacher-1"]',source_lessons_json:JSON.stringify([{moduleId:'mishkaat',classIds:['year4-cohort2026']}])};
const dto=(row=base)=>({id:row.lesson_id,activityKey:row.activity_key,title:'Mishkaat',teacher:'Same displayed name',className:'Year 4',date:'2026-10-27',state:'PUBLISHED',canView:true,recordingGroup:recordingGroupIdentity(row),assets:[{id:'asset-'+row.lesson_id,kind:'MP4'}]});
test('groups require the stable programme, module, class/cohort AND historical teacher, never display names',()=>{
 const rows=[dto(),dto({...base,lesson_id:'two'}),dto({...base,lesson_id:'teacher-change',teacher_id:'teacher-2',teacher_ids_json:'["teacher-2"]'}),dto({...base,lesson_id:'other-class',class_id:'year4-cohort2025'}),dto({...base,lesson_id:'other-programme',activity_key:'PROGRAM:reboot'}),dto({...base,lesson_id:'module2',source_lessons_json:'[{"moduleId":"usul","classIds":["year4-cohort2026"]}]'})];
 const groups=permittedRecordingGroups(rows);assert.equal(groups.length,5);assert.equal(groups[0].lessons.length,2);
 const legacy={...base,source_lessons_json:'[]'};assert.notEqual(recordingGroupIdentity(legacy).key,recordingGroupIdentity({...legacy,lesson_id:'other'}).key);
 const hidden={...dto({...base,lesson_id:'denied'}),title:'PRIVATE TITLE',canView:false};assert.doesNotMatch(recordingCollectionHTML([hidden]),/PRIVATE TITLE|1 lesson/);assert.equal(permittedRecordingGroups([hidden]).length,0);
 assert.equal(permittedRecordingGroups([{...dto(),assets:[{id:'a',kind:'MP4'},{id:'b',kind:'YOUTUBE'}]}])[0].lessons.length,2);
 const before=structuredClone(rows);recordingCollectionHTML(rows,{group:groups[0].key});assert.deepEqual(rows,before);
});
test('academic companion uses native authority/retry guards, excludes private review, and holds unmatched sessions',async()=>{
 const f=await mediaFixture();try{
  f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/0037_session_mp4.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
  f.db.exec(readFileSync(new URL('../migrations/academy/0045_recording_companions.sql',import.meta.url),'utf8'));
  const admin=await f.login('0001'),student=await f.login('0002'),lessonId='MOU-20261006',assetId='local-native-mp4',at=new Date().toISOString();
  f.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) SELECT ? ,activity_key,'MP4','local-source.mp4','source.mp4',20,? FROM lesson_media_lessons WHERE lesson_id=?").run(assetId,at,lessonId);f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(lessonId,assetId);
  const input={lessonId,assetId,operationId:crypto.randomUUID(),revision:1,companionRevision:0,sourceRevision:'a'.repeat(64),durationSeconds:600,companion:{summary:'- Preserved factual point.',application:'',topics:[{time:'00:05:13',title:'Course reference'}],transcript:'05:13 Teaching transcript.',reviewFlags:['PRIVATE REVIEW'],academicOutput:{evidence:'PRIVATE'},quoteCandidates:['PRIVATE']}};
  assert.equal((await f.media('companion-save',input,student)).status,403);assert.equal((await f.media('companion-save',input,admin)).status,409);
  f.db.prepare("UPDATE lesson_media_lessons SET session_key='native-confirmed-session',source_lessons_json=? WHERE lesson_id=?").run(base.source_lessons_json,lessonId);
  const huge={...input,operationId:crypto.randomUUID(),companion:{...input.companion,references:Array.from({length:70},()=>({verification:'matched',arabic:'ع'.repeat(3500),meaning:'Meaning',time:'00:12'}))}};assert.equal((await f.media('companion-save',huge,admin)).status,413,'The academic save limit uses UTF-8 bytes');
  const saved=await f.media('companion-save',input,admin);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal((await f.media('companion-save',input,admin)).body.replayed,true);
  assert.equal((await f.media('companion',{lessonId,assetId},student)).body.companion,null);
  const published=await f.media('companion-publish',{...input,operationId:crypto.randomUUID(),revision:2,companionRevision:1,draftKey:saved.body.draftKey},admin);assert.equal(published.status,200,JSON.stringify(published.body));
  const read=await f.media('companion',{lessonId,assetId},student);assert.equal(read.status,200);assert.equal(read.body.companion.summary,input.companion.summary);assert.doesNotMatch(JSON.stringify(read.body),/PRIVATE|reviewFlags|academicOutput|quoteCandidates/);assert.equal(read.body.companion.topics[0].start,313);
  const old=new Date();old.setUTCMonth(old.getUTCMonth()-2);f.db.prepare('UPDATE lesson_recording_companions SET uploaded_at=?').run(old.toISOString());assert.equal((await f.media('companion',{lessonId,assetId},student)).body.companionExpired,true);
 }finally{f.db.close();}
});

test('split-store companion publication and bounded cleanup retain exact parent gates and original expiry',async t=>{
 const f=await splitVideoFixture();try{
  f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/0020_recording_companions.sql',import.meta.url),'utf8'));
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},admin=await f.source.actor('adminA'),global=await f.source.actor('global'),student=await f.source.login('0002'),scope=f.scopes.programA,period={startDate:'2026-10-01',endDate:'2026-10-31'};
  const session=ok(await f.request('sessions',{activityKey:scope,...period},admin)).sessions.find(s=>s.classIds.includes('class-1'));
  const lessonId=ok(await f.request('create',{activityKey:scope,...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId;
  const start=ok(await f.request('video-start',{lessonId,revision:1,operationId:crypto.randomUUID(),filename:'recording.mp4',size:mp4.length},admin));
  const part=ok(await f.request('video-part?metadata='+encodeURIComponent(JSON.stringify({lessonId,uploadToken:start.uploadToken,partNumber:1})),{},admin,'ADMIN',mp4));
  const asset=ok(await f.request('video-complete',{lessonId,uploadToken:start.uploadToken,parts:[{partNumber:part.partNumber,etag:part.etag}]},admin));
  ok(await f.request('save',{lessonId,revision:2,operationId:crypto.randomUUID(),title:'Mishkaat',summary:'',state:'PUBLISHED',commentsClosed:true,videos:[]},admin));await f.accept(global,scope);
  const input={lessonId,assetId:asset.assetId,operationId:crypto.randomUUID(),revision:3,companionRevision:0,sourceRevision:'b'.repeat(64),durationSeconds:2057,companion:{summary:'- Exact factual summary.',topics:[{time:'01:57',title:'Lesson reference'}],transcript:'01:57 Original teaching.',reviewFlags:['PRIVATE']}};
  const saved=ok(await f.request('companion-save',input,admin));ok(await f.request('companion-publish',{...input,operationId:crypto.randomUUID(),revision:4,companionRevision:1,draftKey:saved.draftKey},admin));
  const read=ok(await f.request('companion',{lessonId,assetId:asset.assetId},student,'LEARN'));assert.equal(read.companion.summary,input.companion.summary);assert.doesNotMatch(JSON.stringify(read),/PRIVATE|source_revision|draft_key/);
  assert.equal(ok(await f.request('feed',{activityKey:scope},student,'LEARN')).lessons.find(r=>r.id===lessonId).recordingCompanions[0].durationSeconds,2057);
  const bucket=f.source.env.LESSON_MEDIA_BUCKET,old=new Date();old.setUTCMonth(old.getUTCMonth()-2);f.databases.core.prepare('UPDATE lesson_recording_companions SET uploaded_at=?').run(old.toISOString());
  bucket.list=async({prefix,limit})=>{const all=[...bucket.objects.keys()].filter(k=>k.startsWith(prefix));return {objects:all.slice(0,limit).map(key=>({key})),truncated:all.length>limit};};const originalDelete=bucket.delete;bucket.delete=async keys=>{for(const key of Array.isArray(keys)?keys:[keys])await originalDelete(key);};
  const cleaned=await cleanupExpiredAcademicCompanions(f.source.env);assert.equal(cleaned.checked,1);assert.equal(cleaned.deleted,1);assert.equal(f.databases.core.prepare('SELECT count(*) n FROM lesson_recording_companions').get().n,0);assert(bucket.objects.size>=1,'Original MP4 lifecycle is independent from companion cleanup');
  t.diagnostic(JSON.stringify({splitCoordinatorOperations:f.costs.length,cleanup:cleaned,hostedCalls:0}));
 }finally{f.close();}
});

test('academic learner references render only Arabic/meaning and accurate seek cues, with no empty quote area',()=>{
 const html=academicCompanionHTML({references:[{arabic:'نص <عربي>',meaning:'Meaning & qualification',time:'01:02:03',url:'PRIVATE SOURCE URL',note:'PRIVATE REVIEW'}],quotations:[],transcript:'Teaching transcript.'},{lessonId:'native-lesson',assetId:'original-asset'});
 assert.match(html,/lang="ar" dir="rtl"/);assert.match(html,/نص &lt;عربي&gt;/);assert.match(html,/Meaning &amp; qualification/);assert.match(html,/data-start="3723"/);assert.doesNotMatch(html,/PRIVATE|lm-verified-quotes/);assert.match(html,/Read full transcript/);
});
test('playback failures report on the current page and settle without unhandled rejections after account/route changes',async()=>{
 const reports=[];assert.equal(await presentRecordingPlayback(()=>Promise.reject(Error('Recording expired')),{report:m=>reports.push(m)}),false);assert.deepEqual(reports,['Recording expired']);
 assert.equal(await presentRecordingPlayback(()=>Promise.reject(Error('Old account failure')),{isCurrent:()=>false,report:m=>reports.push(m)}),false);assert.deepEqual(reports,['Recording expired']);assert.equal(await presentRecordingPlayback(async()=>{}),true);
});
