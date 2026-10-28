import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {newCourse,newBlock,validateCourse,setPath,clone} from '../../academy/course-websites/model.mjs';
import {renderCourse} from '../../academy/course-websites/student.mjs';
import {decorateInlineText,changeInlineText} from '../../academy/course-websites/inline-text.mjs';

test('concept graphics retain the centre-to-item relationship and editable words without changing markers',()=>{
 const course=newCourse(),graphic=newBlock('list');Object.assign(graphic,{presentation:'concept',text:'True joy',attribution:'My Qur’an',items:['Honour & grandeur','Guidance','Nur · Light'],ordered:true});course.lessons[0].sections[0].blocks=[graphic];
 const ui={route:'lesson',portal:true,lessonId:course.lessons[0].id,readingSize:18,completed:[],reflections:{}};
 const {document}=parseHTML('<main>'+renderCourse(course,ui,new Map())+'</main>'),root=document.querySelector('main');
 assert.equal(root.querySelector('.sp-diagram-centre strong').textContent,'True joy');assert.equal(root.querySelectorAll('.sp-diagram-nodes>li').length,3);
 decorateInlineText(root,course,ui);assert.equal(root.querySelector('.sp-diagram-text').dataset.inlinePath,'lessons.0.sections.0.blocks.0.items.0');assert.equal(root.querySelector('.sp-diagram-marker').textContent,'1');assert.equal(root.querySelector('.sp-diagram-marker').getAttribute('contenteditable'),null);
 changeInlineText(course,'lessons.0.sections.0.blocks.0.text','A new heading');assert.equal(graphic.text,'A new heading');assert.throws(()=>changeInlineText(course,'lessons.0.sections.0.blocks.0.presentation','steps'),/editable text/);
});

test('legacy lists stay compatible; optional layout values are bounded and escaped',()=>{
 const course=newCourse(),list=newBlock('list');delete list.presentation;delete list.ordered;course.lessons[0].sections[0].blocks=[list];assert.deepEqual(validateCourse(course),[]);
 setPath(course,'lessons.0.sections.0.blocks.0.presentation','steps');setPath(course,'lessons.0.sections.0.blocks.0.ordered',true);list.text='<img src=x onerror=alert(1)>';list.items=['<script>danger</script>'];assert.deepEqual(validateCourse(course,{review:true}),[]);
 const ui={route:'lesson',portal:true,lessonId:course.lessons[0].id,readingSize:18,completed:[],reflections:{}};const {document}=parseHTML(renderCourse(course,ui,new Map()));assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('img[src=x]'),null);
 const bad=clone(course);bad.lessons[0].sections[0].blocks[0].presentation='arbitrary-css';assert.throws(()=>validateCourse(bad),/diagram layout/);list.ordered='true';assert.throws(()=>validateCourse(course),/numbering/);
});

test('original graphics and scripture translations retain their meaning in rendering and inline editing',()=>{
 const course=newCourse(),art=newBlock('image'),translation=newBlock('quote'),quotation=newBlock('quote');
 Object.assign(art,{assetId:'artwork',alt:'Original authored diagram',caption:'The sources of Tafseer',tint:'course',graphic:true});
 Object.assign(translation,{text:'A guidance for mankind',reference:'Al-Baqarah · 2:185',attribution:''});
 Object.assign(quotation,{text:'A scholarly quotation',attribution:'As-Sa‘di'});course.lessons[0].sections[0].blocks=[art,translation,quotation];
 assert.deepEqual(validateCourse(course,{review:true}),[]);
 const ui={route:'lesson',portal:true,lessonId:course.lessons[0].id,readingSize:18,completed:[],reflections:{}};
 const {document}=parseHTML('<main>'+renderCourse(course,ui,new Map([['artwork',{url:'data:image/png;base64,AA=='}]]))+'</main>'),root=document.querySelector('main');
 assert.equal(root.querySelectorAll('.sp-artwork-tint img').length,1);assert.equal(root.querySelector('[data-sp=view-graphic]').dataset.id,'artwork');
 assert.equal(root.querySelector('.sp-verse-translation .sp-reference').textContent,'Al-Baqarah · 2:185');assert.equal(root.querySelector('blockquote cite').textContent,'As-Sa‘di');
 decorateInlineText(root,course,ui);assert.match(root.querySelector('.sp-verse-translation figcaption').dataset.inlinePath,/blocks\.1\.text$/);assert.match(root.querySelector('.sp-verse-translation .sp-reference').dataset.inlinePath,/blocks\.1\.reference$/);
});
