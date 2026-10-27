import test from 'node:test';
import assert from 'node:assert/strict';
import {newCourse,newLesson,newSection,newBlock,duplicateLesson,exampleBlock,validateCourse,move,setPath,checkFile,referencedAssets,BLOCKS} from './model.mjs';
import {renderCourse,renderBlock,imageURL} from './student.mjs';
const state=()=>({route:'home',lessonId:'',readingSize:18,completed:[],reflections:{},sessionState:'upcoming'});
test('the template includes every reusable lesson component and keeps duplicated identities independent',()=>{
 const course=newCourse();course.lessons[0].sections.push(newSection());course.lessons[0].sections[0].blocks=Object.keys(BLOCKS).map(exampleBlock);
 assert.deepEqual(validateCourse(course),[]);const copy=duplicateLesson(course.lessons[0]);course.lessons.push(copy);assert.deepEqual(validateCourse(course),[]);
 assert.notEqual(copy.id,course.lessons[0].id);for(let i=0;i<copy.sections.length;i++)assert.notEqual(copy.sections[i].id,course.lessons[0].sections[i].id);
 assert.equal(course.pages.sessions,true);assert.equal(course.pages.materials,true);assert.equal(course.pages.assessments,true);assert.equal(course.home.themes.length,4);
});
test('reordering preserves complete blocks and rejects moving outside a list',()=>{const blocks=[newBlock('text'),newBlock('arabic'),newBlock('reflection')],first=blocks[0],arabic=blocks[1];assert.equal(move(blocks,1,-1),true);assert.equal(blocks[0],arabic);assert.equal(blocks[1],first);assert.equal(move(blocks,0,-1),false);assert.equal(move(blocks,2,1),false);});
test('direct entry accepts Arabic and rejects unknown paths and prototype pollution',()=>{const course=newCourse();setPath(course,'lessons.0.sections.0.blocks.0.text','العلم نور');assert.equal(course.lessons[0].sections[0].blocks[0].text,'العلم نور');assert.throws(()=>setPath(course,'__proto__.polluted','yes'),/Invalid/);assert.throws(()=>setPath(course,'home.missing','x'),/Unknown/);assert.equal({}.polluted,undefined);});
test('course copies enforce structured content limits, identifiers, references and saved dates',()=>{
 const course=newCourse();course.lessons[0].sections[0].blocks.push({...newBlock(),type:'html',text:'<script>bad()</script>'});assert.throws(()=>validateCourse(course),/unsupported/);course.lessons[0].sections[0].blocks.pop();course.home.themes[0].lessonId='no-such-lesson';assert.throws(()=>validateCourse(course),/no longer present/);course.home.themes[0].lessonId='';course.updatedAt='broken';assert.throws(()=>validateCourse(course),/saved date/);
 const duplicate=newCourse();duplicate.lessons[0].sections[0].blocks[0].id=duplicate.id;assert.throws(()=>validateCourse(duplicate),/repeated/);
});
test('student pages escape typed text and asset labels instead of executing HTML',()=>{
 const course=newCourse(),ui=state();course.name='<script>alert(1)</script>';course.home.headline='<img src=x onerror=alert(1)>';course.lessons[0].sections[0].blocks[0].text='<script>steal()</script>';let html=renderCourse(course,ui,new Map());assert.doesNotMatch(html,/<script|<img src=x/);assert.match(html,/&lt;script&gt;/);ui.route='lesson';ui.lessonId=course.lessons[0].id;html=renderCourse(course,ui,new Map());assert.match(html,/&lt;script&gt;steal\(\)&lt;\/script&gt;/);
 assert.equal(imageURL(new Map([['bad',{url:'javascript:alert(1)'}]]),'bad'),'assets/lilac-600.webp');
});
test('all component variants render native Arabic, reflections, sources and images',()=>{const ui=state(),assets=new Map([['image',{url:'blob:test-image'}]]);for(const type of Object.keys(BLOCKS)){const b=exampleBlock(type);b.assetId=type==='image'?'image':'';const html=renderBlock(b,ui,assets);assert.ok(html.length>20,type);if(['arabic','ayah','words'].includes(type))assert.match(html,/lang="ar"/);if(type==='reflection')assert.match(html,/data-sp-note/);}const image=exampleBlock('image');image.assetId='image';image.alt='An example image';assert.match(renderBlock(image,ui,assets),/alt="An example image"/);});
test('the live-only header and two-column session cards retain their timing presentation',()=>{
 const course=newCourse(),ui=state();ui.route='sessions';let html=renderCourse(course,ui,new Map());assert.doesNotMatch(html,/Join now/);assert.equal((html.match(/<article class="sp-session">/g)||[]).length,4);assert.match(html,/Sun, 18 Oct/);assert.doesNotMatch(html,/>[^<]*2026/);const cards=html.split('<article class="sp-session">');assert.doesNotMatch(cards[1],/19:00–20:00/);ui.sessionState='live';html=renderCourse(course,ui,new Map());assert.match(html,/Join now/);assert.match(html,/Join session/);ui.sessionState='finished';html=renderCourse(course,ui,new Map());assert.doesNotMatch(html,/Join now|19:00–20:00/);
});
test('downloads stay on the materials page and image/PDF references survive model editing',()=>{
 const course=newCourse(),ui=state(),id='pdf-file';course.materials.files=[{id:crypto.randomUUID(),assetId:id,title:'Course booklet',description:'Complete reading'}];const assets=new Map([[id,{url:'blob:pdf',type:'application/pdf',name:'Course.pdf'}]]);assert.deepEqual(referencedAssets(course),[id]);assert.doesNotMatch(renderCourse(course,ui,assets),/download="Course.pdf"/);ui.route='materials';const html=renderCourse(course,ui,assets);assert.match(html,/download="Course.pdf"/);assert.doesNotMatch(html,/Print|window\.print/);
});
test('file checking uses signatures and limits, rejecting renamed HTML and oversized inputs',async()=>{
 const pdf=new File(['%PDF-1.7\nexample'],'reading.pdf',{type:'text/plain'});assert.equal(await checkFile(pdf),'application/pdf');const image=new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0])],'cover.png');assert.equal(await checkFile(image),'image/png');await assert.rejects(checkFile(new File(['<html>bad</html>'],'cover.png',{type:'image/png'})),/Choose a PDF/);const huge={size:17*1024*1024,slice:()=>new Blob(['%PDF-1.7'])};await assert.rejects(checkFile(huge),/16 MB/);
});
