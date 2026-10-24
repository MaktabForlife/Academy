import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {annotationRecord,validMark,markPaths,importEditable} from '../../js/m4l-pdf-editable.mjs';
import {resizeMark,markBounds,textDirection} from '../../js/m4l-pdf-compare-model.mjs';
import {DEFAULT_FAVOURITES,FAVOURITES_KEY,readFavouriteColours,saveFavouriteColours} from '../../js/m4l-pdf-favourites.mjs';
const viewport={height:800,width:600,rotation:0,userUnit:1,convertToPdfPoint:(x,y)=>[x,800-y]};
const editorTypes={FREETEXT:3,INK:15,HIGHLIGHT:9};
const text={id:'test-text',page:1,type:'text',x:100,y:200,w:280,h:70,size:20,colour:'#235dad',direction:'auto',text:'Editable text\nالسلام عليكم'};
test('saved text is a FreeText annotation with Unicode contents, rather than a page image',()=>{
 const record=annotationRecord(text,viewport,editorTypes);assert.equal(record.annotationType,3);assert.equal(record.value,text.text);assert.equal(record.fontSize,20);assert.deepEqual(record.rect,[100,530,380,600]);assert.deepEqual(record.color,[35,93,173]);assert(!('bitmap' in record));assert(validMark(text));
});
test('arrows retain separately editable vector paths and transformed ink can be resized',()=>{
 const arrow={id:'test-arrow',page:1,type:'arrow',points:[{x:20,y:40},{x:120,y:140}],width:3,colour:'#be273d'};
 const record=annotationRecord(arrow,viewport,editorTypes);assert.equal(record.annotationType,15);assert.equal(record.paths.points.length,2);assert.deepEqual(record.paths.points[0],[20,760,120,660]);assert.equal(markPaths(arrow).length,2);
 const ink={...arrow,type:'pen',points:undefined,paths:[[{x:20,y:40},{x:40,y:80}],[{x:30,y:60},{x:80,y:140}]]};
 assert.deepEqual(markBounds(resizeMark(ink,120,200)),{x:20,y:40,w:120,h:200});assert(validMark(ink));
});
test('malformed annotation metadata cannot produce invalid geometry or unbounded text',()=>{
 for(const mark of [{...text,x:Infinity},{...text,text:'x'.repeat(20001)},{...text,direction:'invalid'},{...text,type:'script'},{...text,paths:[[]]}])assert.equal(validMark(mark),false);
});
test('mixed Arabic and English use the same first-strong direction as the in-place field',()=>{
 assert.equal(textDirection('English\nالسلام عليكم'),'ltr');assert.equal(textDirection('123 السلام عليكم\nEnglish'),'rtl');assert.equal(textDirection('English','rtl'),'rtl');
});
test('favourite colours survive reload and corrupt or unavailable storage has a safe fallback',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 assert.deepEqual(readFavouriteColours(storage),DEFAULT_FAVOURITES);
 assert(saveFavouriteColours(storage,['#A641B2','#117733','#0055ff','#f0c030']));assert.deepEqual(readFavouriteColours(storage),['#a641b2','#117733','#0055ff','#f0c030']);
 values.set(FAVOURITES_KEY,'["javascript:bad"]');assert.deepEqual(readFavouriteColours(storage),DEFAULT_FAVOURITES);
 assert.equal(saveFavouriteColours({setItem(){throw Error('Storage disabled');}},DEFAULT_FAVOURITES),false);
});
test('annotation import removes only editable appearances and leaves original page content and links intact',async()=>{
 const lib=createRequire(import.meta.url)('../../js/vendor/pdf-lib-1.17.1.min.js'),doc=await lib.PDFDocument.load(readFileSync(new URL('../../academy/pdf-compare/sample.pdf',import.meta.url)));
 const page=doc.getPage(0),name=lib.PDFName.of,textRef=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'FreeText',Rect:[100,600,380,650],Contents:lib.PDFHexString.fromText('Editable note')})),linkRef=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[0,0,20,20]}));
 page.node.set(name('Annots'),doc.context.obj([textRef,linkRef]));const beforeContents=page.node.get(name('Contents')).toString(),bytes=await doc.save(),pagesRead=[];
 const fakePdf={numPages:2,getPage:async number=>{pagesRead.push(number);return {getViewport:()=>({...viewport,convertToViewportRectangle:rect=>[rect[0],800-rect[3],rect[2],800-rect[1]]}),getAnnotations:async()=>[{id:textRef.objectNumber+'R',subtype:'FreeText',rect:[100,600,380,650],color:[0,0,0],defaultAppearanceData:{fontSize:20,fontColor:[0,0,0]},contentsObj:{str:'Editable note'}}]};}};
 const imported=await importEditable(bytes,fakePdf,lib),clean=await lib.PDFDocument.load(imported.bytes);
 assert.deepEqual(pagesRead,[1]);assert.equal(imported.marks.length,1);assert.equal(imported.marks[0].text,'Editable note');assert.equal(clean.getPage(0).node.lookup(name('Annots'),lib.PDFArray).size(),1);assert.equal(clean.getPage(0).node.get(name('Contents')).toString(),beforeContents);
 fakePdf.getPage=async()=>({getViewport:()=>viewport,getAnnotations:async()=>[{id:textRef.objectNumber+'R',subtype:'FreeText',readOnly:true}]});
 const locked=await importEditable(bytes,fakePdf,lib);assert.equal(locked.marks.length,0);assert.equal(locked.bytes,bytes);
});
test('shape fill colours are independent from their border and metadata rejects invalid colours',()=>{
 const box={id:'fill',page:1,type:'rectangle',x:20,y:40,w:120,h:60,width:3,colour:'#be273d',fill:true,fillColour:'#235dad'};
 assert(validMark(box));assert.equal(validMark({...box,fillColour:'red<script>'}),false);
 assert.deepEqual(annotationRecord(box,viewport,editorTypes).color,[190,39,61]);
});
