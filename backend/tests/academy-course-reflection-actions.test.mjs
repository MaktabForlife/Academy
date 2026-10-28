import test from 'node:test';
import assert from 'node:assert/strict';
import {reflectionText,reflectionAction} from '../../academy/course-websites/reflection-actions.mjs';
import {parseHTML} from 'linkedom';
import {renderCourse} from '../../academy/course-websites/student.mjs';
import {newCourse} from '../../academy/course-websites/model.mjs';
import {createJournalControls} from '../../academy/course-websites/journal-controls.mjs';
const course={name:'Foundations of Tafseer',lessons:[{title:'Begin with intention',sections:[{blocks:[{id:'first',type:'reflection',text:'What is my intention?'},{id:'second',type:'reflection',text:'A separate question'}]}]}]};
test('copy/share contains only the chosen reflection and its answer',async()=>{
 let payload;const answers={first:' My answer ',second:'Private, unrelated answer'};
 assert.equal(await reflectionAction({course,id:'first',answers,action:'copy-reflection',copy:async text=>payload=text}),'Copied');
 assert.equal(payload,'Foundations of Tafseer\n\nBegin with intention\n\nPause & reflect\n\nWhat is my intention?\n\nMy reflection\n\nMy answer');
 assert.ok(!payload.includes('unrelated'));assert.throws(()=>reflectionText(course,'missing',answers),/unavailable/);
 assert.equal(reflectionText(course,'first',{}).includes('My reflection'),false);
});
test('native share is explicit; cancellation does not copy or leak another answer',async()=>{
 let copied=false,shared;const args={course,id:'first',answers:{first:'My answer'},action:'share-reflection',copy:async()=>{copied=true;}};
 assert.equal(await reflectionAction({...args,share:async payload=>shared=payload}),'Shared');assert.equal(shared.title,course.name);assert.equal(copied,false);
 assert.equal(await reflectionAction({...args,share:async()=>{throw new DOMException('Cancelled','AbortError');}}),'');assert.equal(copied,false);
 assert.equal(await reflectionAction(args),'Copied · paste into the app you want to share with');assert.equal(copied,true);
});

test('reflection toolbar follows the answer; guests and author previews have no personal journal controls',()=>{
 const data=newCourse(),ui={portal:true,route:'lesson',lessonId:data.lessons[0].id,readingSize:18,completed:[],reflections:{}};
 const render=extra=>parseHTML('<main>'+renderCourse(data,{...ui,...extra},new Map())+'</main>').document;
 for(const extra of [{},{journalEligible:false},{isPreview:true,journalEligible:true,journalEnabled:true}]){
  const doc=render(extra),box=doc.querySelector('.sp-reflection');
  assert(box);assert.equal(box.querySelector('[data-sp="journal-save"]'),null);assert.equal(box.querySelector('[data-sp="journal-open"]'),null);
  assert.equal(box.querySelector('textarea').nextElementSibling.className,'sp-reflection-actions');
  assert.equal(box.querySelector('[data-sp="share-reflection"]').querySelectorAll('circle').length,3);
 }
 const registered=render({journalEligible:true,journalEnabled:true});
 assert.equal(registered.querySelectorAll('.sp-reflection-actions button').length,4);
 assert.equal(registered.querySelector('[data-sp="journal-save"]').disabled,false);
 const waiting=render({journalEligible:true,journalEnabled:false});assert(waiting.querySelector('[data-sp="journal-save"]').disabled);
 const article=registered.querySelector('article.sp-lesson-article');assert(article.contains(registered.querySelector('h1')));assert(article.querySelector('.sp-reading-body'));assert.equal(article.querySelector('.sp-pagination'),null);
});

test('journal integration saves only on explicit Save, opens entry by ID without sending private text in a URL',async()=>{
 const calls=[],ui={reflections:{}},journal={async sync(){calls.push('read');ui.journalEnabled=true;ui.journalEntryIds={first:'saved-entry'};},change(...args){calls.push(['device-draft',...args]);},async save(id){calls.push(['save',id]);},canLeave:()=>true,stop:options=>calls.push(['stop',options])};
 const controls=createJournalControls({eligible:true,available:true,ui,load:async()=>({reflectionJournal:()=>journal}),launch:url=>calls.push(['open',url])});
 await controls.sync(course);controls.change('first','Private answer');assert.deepEqual(calls,['read',['device-draft','first','Private answer']]);
 controls.open('first');assert.equal(calls.at(-1)[1],'/academy/journal/?workspace=LEARN&entry=saved-entry');assert.equal(calls.some(row=>row[0]==='save'),false);
 await controls.save('first');assert.deepEqual(calls.at(-1),['save','first']);
 controls.stop({clearDevice:true});assert.equal(controls.open('first'),false);await assert.rejects(controls.save('first'),/not available/);
});

test('guest, unavailable journal and stale account never load or save private journal content',async()=>{
 for(const args of [{eligible:false,available:true},{eligible:true,available:false}]){
  let loaded=false;const ui={},controls=createJournalControls({...args,ui,load:async()=>{loaded=true;}});await controls.sync(course);assert.equal(loaded,false);assert.equal(controls.open('first'),false);
 }
 let active=true,resolve,constructed=false;
 const ui={},controls=createJournalControls({eligible:true,available:true,ui,active:()=>active,load:()=>new Promise(done=>resolve=done)}),pending=controls.sync(course);
 active=false;resolve({reflectionJournal:()=>{constructed=true;}});await pending;assert.equal(constructed,false);assert.equal(ui.journalEnabled,false);
});
