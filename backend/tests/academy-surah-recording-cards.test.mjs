import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
import {surahRecordingTerms} from '../src/academy/d1/surah-recording-titles.js';
import {renderBlock,renderCourse} from '../../academy/course-websites/student.mjs';
import {lessonFileEntries,renderLessonMaterials} from '../../academy/course-websites/lesson-materials.mjs';
import worker from '../src/academy-runtime.js';
const op=()=>crypto.randomUUID(),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('published surah cards use matching parent lessons and retain each lesson month gate',async()=>{
 const f=await monthlyFixture();try{
  const admin=await f.login('0001'),student=await f.login('0002'),scoped=await f.login('0004');
  ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
  const id=op();ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id,name:'Surah As-Saffat',cardKey:'saffat',completionDate:'2025-02-28',active:true,revision:0}]},admin));
  ok(await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[{accountId:'account-0002',month:'2025-02',subscribed:true,revision:0,classIds:['mou-class']}]},admin));
  ok(await f.monthly('configure',{mode:'activate',policyRevision:3,reviewed:true,operationId:op()},admin));
  const rows=[['2025-01-04','Surah As-Saffat · 4 January'],['2025-02-01','Surah As-Saffat · 1 February'],['2025-02-08','Surah Yaseen · 8 February'],['2025-02-15','Tafseer · 15 February'],['2025-02-22','Surah As-Saffat · Private draft']];
  const ids=[];
  for(const [date,title] of rows){
   const created=ok(await f.media('historical-create',{activityKey:scope,date,title,classIds:['mou-class'],operationId:op()},admin));ids.push(created.lessonId);
   ok(await f.media('save',{lessonId:created.lessonId,revision:1,title,summary:'Lesson notes',state:title.endsWith('draft')?'DRAFT':'PUBLISHED',commentsClosed:true,videos:[{name:'Watch recording',url:'https://youtu.be/9IuTDcSs6vQ'}],operationId:op()},admin));
  }
  const site=(action,input={})=>f.call('/api/admin/platform/course-websites/'+action,{activityKey:scope,surahId:id,...input},admin);
  const view=ok(await site('get'));const saved=ok(await site('save',{document:view.document,revision:0,operationId:op()}));ok(await site('publish',{revision:saved.revision,operationId:op()}));
  const read=token=>f.call('/api/academy/course-websites/read',{activityKey:scope,surahId:id},token);
  const mine=ok(await read(student));assert.deepEqual(mine.native.lessons.map(l=>l.id),[ids[1]]);assert.equal(mine.document.pages.sessions,true);assert.equal(mine.native.sessions[0].media.assets[0].kind,'YOUTUBE');
  for(const token of [admin,scoped]){
   const result=ok(await read(token));assert.deepEqual(result.native.lessons.map(l=>l.id),[ids[1],ids[0]]);
   for(const workspace of ['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH']){
    const call=async(path,input)=>{const response=await worker.fetch(new Request('http://localhost/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':'application/json'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
    const page=ok(await call('academy/course-websites/read',{activityKey:scope,surahId:id}));assert.deepEqual(page.native.lessons.map(l=>l.id),[ids[1],ids[0]]);
    const assetId=page.native.lessons.find(l=>l.id===ids[0]).assets[0].id;
    assert.equal((await call('academy/lesson-media/watch',{lessonId:ids[0],assetId})).status,200);
    if(workspace==='LEARN')assert.equal((await call('academy/lesson-media/save',{lessonId:ids[0],revision:2,title:'Unwanted change',summary:'',state:'PUBLISHED',commentsClosed:true,videos:[],operationId:op()})).status,403,'Read access never grants editing in personal Learn');
   }
  }
  const jan=f.db.prepare('SELECT asset_id FROM lesson_media_links WHERE lesson_id=?').get(ids[0]).asset_id;
  assert.equal((await f.media('watch',{lessonId:ids[0],assetId:jan},student)).status,403);
  assert.equal((await f.media('watch',{lessonId:ids[1],assetId:mine.native.lessons[0].assets[0].id},student)).status,200);
 }finally{f.db.close();}
});
test('unrecognised lesson titles cannot be inferred from dates or generic Tafseer labels',()=>{
 assert(surahRecordingTerms({name:'Surah As-Saffat',card_key:'saffat'}).includes('surah saffat'));
 assert.deepEqual(surahRecordingTerms({name:'Surah Maryam',card_key:'saffat'}),['surah maryam']);
});
test('source edition displays supplied wording first and keeps a summary collapsed separately',()=>{
 const aside=renderBlock({id:'a',type:'note',aside:true,attribution:'Summary',text:'An optional summary'}, {reflections:{}},new Map());
 assert(aside.startsWith('<details'));assert(!aside.includes('<details open'));assert(aside.includes('<summary>Summary</summary>'));
 const arabic=renderBlock({id:'q',type:'quote',text:'The supplied translation.',arabic:'النص العربي',attribution:''},{reflections:{}},new Map());assert(arabic.includes('dir="rtl">النص العربي'));
 const base={name:'Source lesson',theme:'plum',tag:'TAFSEER',pages:{},menu:{home:'Surah',lessons:'Read'},home:{},lessons:[{id:'l',title:'Heading',group:'Study',summary:'Card summary',sourceEdition:true,sections:[{id:'s',label:'',title:'Main teaching',blocks:[{id:'b',type:'text',text:'The original teaching wording.'}]}]}]};
 const html=renderCourse(base,{route:'lesson',lessonId:'l',readingSize:18,completed:[],reflections:{}},new Map());assert(html.includes('The original teaching wording.'));assert(!html.includes('Card summary'));
});
test('Course materials use the same parent lesson assets, deduplicate links and keep guest media private',()=>{
 const pdf={id:'shared-pdf',kind:'PDF',name:'Course handout',filename:'course.pdf'},lesson={id:'parent-lesson',assets:[pdf,{id:'video',kind:'YOUTUBE'}]};
 const native={lessonMediaMaterials:true,lessons:[lesson],sessions:[{media:lesson}]};
 assert.deepEqual(lessonFileEntries(native),[{lessonId:'parent-lesson',asset:pdf}]);
 const html=renderLessonMaterials(native);assert.equal((html.match(/Download PDF/g)||[]).length,1);assert(html.includes('data-native-lesson="parent-lesson"'));assert(!html.includes('data-sp="download-file"'));
 const guest=renderLessonMaterials({lessonMediaMaterials:true,lessons:[],sessions:[]},true);assert(guest.includes('Sign in'));assert(!guest.includes('data-native-download'));
});
