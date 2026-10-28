import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {newCourse,newBlock,newLesson,clone} from '../../academy/course-websites/model.mjs';
import {renderCourse} from '../../academy/course-websites/student.mjs';
import {changeInlineText,inlineFields,inlineSession,decorateInlineText} from '../../academy/course-websites/inline-text.mjs';

test('inline changes update only whitelisted teaching fields and preserve IDs, assets and source content',()=>{
 const course=newCourse(),before=clone(course);const p='lessons.0.sections.0.blocks.0.text';
 changeInlineText(course,p,'أَهْلًا\nCorrected source wording.');assert.equal(course.lessons[0].sections[0].blocks[0].text,'أَهْلًا\nCorrected source wording.');
 for(const path of ['id','home.imageId','pages.sessions','lessons.0.id','lessons.0.sections.0.blocks.0.type','__proto__.polluted'])assert.throws(()=>changeInlineText(course,path,'injected'),/editable text/);
 assert.equal(course.id,before.id);assert.equal(course.home.imageId,before.home.imageId);assert.equal(course.lessons[0].id,before.lessons[0].id);assert.equal(course.lessons[0].sections[0].blocks[1].text,before.lessons[0].sections[0].blocks[1].text);
});

test('on-page fields bind Arabic, translations, lists and reflections without HTML execution or generated counters',()=>{
 const course=newCourse(),section=course.lessons[0].sections[0];
 for(const type of ['arabic','ayah','quote','list','words','note','callout']){const b=newBlock(type);b.text='<img src=x onerror=alert(1)>';b.arabic='نَصٌّ';b.translation='A translation';b.reference='18:1';b.attribution='Source';b.aside=true;b.items=['First','Second'];section.blocks.push(b);}
 const ui={portal:true,route:'lesson',lessonId:course.lessons[0].id,readingSize:18,completed:[],reflections:{}}, {document}=parseHTML('<html><body><div id="root">'+renderCourse(course,ui,new Map())+'</div></body></html>'),root=document.getElementById('root');
 decorateInlineText(root,course,ui);const fields=inlineFields(course);
 for(const field of root.querySelectorAll('[data-inline-path]')){assert(fields.has(field.dataset.inlinePath));assert.equal(field.getAttribute('contenteditable'),'plaintext-only');}
 assert.equal(root.querySelector('img[src="x"]'),null);assert(root.querySelector('[data-inline-path$=".translation"]'));assert.equal(root.querySelector('[data-inline-path$=".items.1"]').textContent,'Second');assert(root.querySelector('.sp-reflection textarea').disabled);
});

test('grouped lesson cards retain their real lesson IDs when editing',()=>{
 const course=newCourse();course.lessons=[newLesson('First','A'),newLesson('Second','B'),newLesson('Third','A')];course.home.themes=[];
 const ui={portal:true,route:'lessons',completed:[],reflections:{}},{document}=parseHTML('<html><body><main>'+renderCourse(course,ui,new Map())+'</main></body></html>'),root=document.querySelector('main');decorateInlineText(root,course,ui);
 assert.deepEqual([...root.querySelectorAll('.sp-lesson-card h3')].map(el=>[el.textContent,el.dataset.inlinePath]),[['First','lessons.0.title'],['Third','lessons.2.title'],['Second','lessons.1.title']]);
});

test('save and publish retain the existing revision and exact retry identifiers, keeping failed edits in memory',async()=>{
 const document=newCourse(),calls=[];let rejectSave=true;
 const session=inlineSession({request:async(action,input)=>{calls.push({action,input:clone(input)});if(action==='get')return {document,revision:4,assets:[]};if(action==='save'&&rejectSave){rejectSave=false;throw Error('Temporary failure');}return {revision:action==='save'?5:6};}});
 await session.open();session.change('name','My edited website');await assert.rejects(session.save(),/Temporary failure/);assert(session.dirty);assert.equal(session.record.document.name,'My edited website');await session.save();assert(!session.dirty);
 const saves=calls.filter(c=>c.action==='save');assert.deepEqual(saves[0].input,saves[1].input);assert.equal(saves[1].input.revision,4);
 await session.publish();assert.equal(calls.at(-1).input.revision,5);assert.equal(session.record.revision,6);
});

test('publication retries preserve its saved draft and cannot overlap or cross an account change',async()=>{
 let active=true,finish,failPublication=true;const calls=[],session=inlineSession({active:()=>active,request:async(action,input)=>{calls.push({action,input:clone(input)});if(action==='get')return {document:newCourse(),revision:1,assets:[]};if(action==='publish'&&failPublication){failPublication=false;throw Error('Acceptance unavailable');}return {revision:2};}});
 await session.open();await assert.rejects(session.publish(),/Acceptance unavailable/);await session.publish();const publishes=calls.filter(c=>c.action==='publish');assert.deepEqual(publishes[0].input,publishes[1].input);
 const delayed=inlineSession({active:()=>active,request:()=>new Promise(resolve=>{finish=resolve;})}),opening=delayed.open();await assert.rejects(delayed.open(),/wait/);active=false;delayed.clear();finish({document:newCourse(),revision:1,assets:[]});await assert.rejects(opening,{name:'AbortError'});assert.equal(delayed.record,null);
});
