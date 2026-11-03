import {grantsFixture,scope,ok,op} from './academy-surah-grants-fixture.mjs';
import {journalBucket} from './academy-journal-bucket.mjs';
import {newBlock} from '../../../academy/course-websites/model.mjs';

// Disposable combined scenario: A has website-only access; B paid the lesson month.
export async function journalTafseerFixture(){
 const f=await grantsFixture();
 try{
  f.close=()=>f.db.close();f.journalBucket=journalBucket();f.env.ACADEMY_JOURNAL_BUCKET=f.journalBucket;
  const tokens={a:await f.login('0002'),b:await f.login('0008'),admin:f.admin};
  ok(await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[{accountId:'account-0008',month:'2024-01',subscribed:true,revision:0,classIds:['mou-class']}]},f.admin));
  ok(await f.monthly('configure',{mode:'activate',policyRevision:3,reviewed:true,operationId:op()},f.admin));
  const lesson=ok(await f.media('historical-create',{date:'2024-01-16',title:'Surah Maryam · shared lesson',classIds:['mou-class'],operationId:op()},f.admin));
  const pdf=ok(await f.mediaUpload({lessonId:lesson.lessonId,revision:1,name:'Shared Maryam handout'},f.admin));
  ok(await f.media('save',{lessonId:lesson.lessonId,revision:2,title:'Surah Maryam · shared lesson',summary:'Native published lesson media',state:'PUBLISHED',commentsClosed:true,videos:[{name:'Maryam recording',url:'https://youtu.be/9IuTDcSs6vQ'}],operationId:op()},f.admin));
  ok(await f.saveGrant(f.ids[0],true));
  const view=ok(await f.site('get',f.ids[0]));view.document.name='Surah Maryam';
  view.document.lessons=[{id:'intention',title:'Source teaching and reflection',group:'Study',summary:'Only a card summary',sourceEdition:true,sections:[{id:'source',title:'The teaching',label:'READ',blocks:[{...newBlock('text'),id:'source-text',text:'The complete source teaching remains the main reading.'},{...newBlock('note'),id:'summary',aside:true,attribution:'Optional summary',text:'A short optional summary.'},{...newBlock('reflection'),id:'intention-reflection',text:'What will I carry into my intention?'},{...newBlock('reflection'),id:'practice-reflection',text:'What will I put into practice?'}]}]}];
  const saved=ok(await f.site('save',f.ids[0],{document:view.document,revision:0,operationId:op()}));ok(await f.site('publish',f.ids[0],{revision:saved.revision,operationId:op()}));
  return {fixture:f,tokens,lessonId:lesson.lessonId,pdfId:pdf.assetId,courseUrl:'/academy/course-websites/view/?program='+encodeURIComponent(scope.slice(8))+'&surah='+f.ids[0]+'#lesson/intention'};
 }catch(error){f.db.close();throw error;}
}
