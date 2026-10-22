import * as pdfjs from '../pdf-viewer/build/pdf.mjs';
import {clamp,shapeMark,markBounds,moveMark,hitMark,textLayout,paintMark,overlayPlacement} from './m4l-pdf-compare-model.mjs?v=107.20';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf-viewer/build/pdf.worker.mjs';
const $=id=>document.getElementById(id),frame=$('native-reader'),canvas=$('marks-canvas'),context=canvas.getContext('2d'),stage=$('page-stage');
const sampleUrl='/academy/pdf-compare/sample.pdf';
const state={pdf:null,bytes:null,name:'',page:1,viewport:null,marks:[],undo:[],redo:[],selected:null,tool:'hand',colour:'#292336',width:2.5,size:20,fill:false,busy:true,rendering:false,exporting:false,generation:0,saved:'[]',gesture:null,text:null};
let native=null,loading=null,pendingReplace=null,currentView='both',viewSync=false;
function nativePageChanged(event){if(!viewSync&&currentView!=='academy'&&$('link-pages').checked&&!state.busy&&event.pageNumber!==state.page)void showPage(event.pageNumber,false);}
const serial=()=>JSON.stringify(state.marks),copy=value=>structuredClone(value),notice=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const nativeReady=new Promise((resolve,reject)=>{
 frame.addEventListener('load',async()=>{try{native=frame.contentWindow.PDFViewerApplication;await native.initializedPromise;
  native.eventBus.on('pagechanging',nativePageChanged);resolve(native);
 }catch(error){reject(error);}},{once:true});
 // Cached iframe loads can finish before this module starts.
 if(frame.contentDocument?.readyState==='complete'&&frame.contentWindow.PDFViewerApplication){native=frame.contentWindow.PDFViewerApplication;native.initializedPromise.then(()=>{native.eventBus.on('pagechanging',nativePageChanged);resolve(native);}).catch(reject);}
});
nativeReady.catch(()=>notice('PDF.js could not start. Reload this comparison page.',true));
const names={pen:'Pen stroke',highlight:'Highlight',rectangle:'Box',ellipse:'Circle / oval',line:'Line',arrow:'Arrow',text:'Text'};
const hints={hand:'Scroll to read. Choose Pen or a shape, then drag on the page.',select:'Click a mark to select it. Drag to move it; drag its square corner to resize a box, oval or text.',pen:'Drag to draw. Choose a colour and pen width above.',text:'Click anywhere on the page to add English or Arabic text.',highlight:'Drag over the part you want to highlight. Your chosen colour stays transparent.',rectangle:'Drag from one corner to the other to draw a box.',ellipse:'Drag across the area to draw a circle or oval.',line:'Drag from the start to the end of your straight line.',arrow:'Drag towards the place you want your arrow to point.',eraser:'Click a mark to remove the whole mark. Undo can restore it.'};
function selected(){return state.marks.find(mark=>mark.id===state.selected);}
function controls(){
 const locked=state.busy||state.exporting||state.rendering;
 $('download').disabled=locked||!state.pdf;$('open-file').disabled=state.busy||state.exporting;$('sample').disabled=state.busy||state.exporting;
 $('previous').disabled=locked||!state.pdf||state.page<=1;$('next').disabled=locked||!state.pdf||state.page>=state.pdf.numPages;$('page-number').disabled=locked||!state.pdf;
 $('undo').disabled=locked||!state.undo.length;$('redo').disabled=locked||!state.redo.length;$('delete').disabled=locked||!selected();$('edit-text').disabled=locked||selected()?.type!=='text';
 $('quick-undo').disabled=$('undo').disabled;$('quick-tool').disabled=locked||!state.pdf;
 $('toolbox').inert=state.busy||state.exporting;
 $('selection-note').textContent=selected()?names[selected().type]+' selected':state.marks.length?'Select a mark to move or edit it.':'Choose a tool to begin.';
}
function commit(before){if(before===serial())return;state.undo.push(before);if(state.undo.length>50)state.undo.shift();state.redo=[];update();}
function update(){
 const list=$('marks-list');list.replaceChildren();$('marks-summary').textContent=`My marks (${state.marks.length})`;
 for(const mark of state.marks){const row=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=`Page ${mark.page} · ${names[mark.type]}${mark.type==='text'?' · '+mark.text.slice(0,55):''}`;button.setAttribute('aria-pressed',String(mark.id===state.selected));button.onclick=()=>{state.selected=mark.id;chooseTool('select');void showPage(mark.page);};row.append(button);list.append(row);}
 redraw();controls();
}
function redraw(){
 if(!state.viewport)return;const {width,height}=state.viewport,scale=canvas.width/width;
 context.setTransform(scale,0,0,scale,0,0);context.clearRect(0,0,width,height);
 for(const mark of state.marks)if(mark.page===state.page)paintMark(context,mark);
 if(state.gesture?.draft)paintMark(context,state.gesture.draft);
 const mark=selected();if(mark&&mark.page===state.page){const b=markBounds(mark);context.save();context.strokeStyle='#70477c';context.lineWidth=1;context.setLineDash([4,3]);context.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);context.setLineDash([]);if(!mark.points){context.fillStyle='#70477c';context.fillRect(b.x+b.w-4,b.y+b.h-4,8,8);}context.restore();}
}
function fitStage(){
 if(!state.viewport)return;const available=$('page-scroll').clientWidth-(matchMedia('(max-width:900px)').matches?20:36),zoom=$('zoom').value;
 const width=zoom==='fit'?Math.max(150,Math.min(available,1000)):state.viewport.width*Number(zoom);
 stage.style.width=width+'px';stage.style.height=width/state.viewport.width*state.viewport.height+'px';
}
new ResizeObserver(fitStage).observe($('page-scroll'));
async function showPage(number,link=true){
 if(!state.pdf||state.busy)return;number=clamp(Math.trunc(Number(number)||1),1,state.pdf.numPages);
 if(state.gesture)cancelGesture();state.page=number;const generation=++state.generation;state.rendering=true;canvas.style.visibility='hidden';controls();
 try{
  const page=await state.pdf.getPage(number),viewport=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(12000000/(viewport.width*viewport.height)));
  const rendered=document.createElement('canvas'),view=page.getViewport({scale});rendered.width=Math.ceil(view.width);rendered.height=Math.ceil(view.height);
  await page.render({canvasContext:rendered.getContext('2d'),viewport:view}).promise;if(generation!==state.generation)return;
  const base=$('pdf-canvas');base.width=rendered.width;base.height=rendered.height;base.getContext('2d').drawImage(rendered,0,0);canvas.width=rendered.width;canvas.height=rendered.height;state.viewport=viewport;
  $('page-number').value=number;$('page-number').max=state.pdf.numPages;$('page-count').textContent='/ '+state.pdf.numPages;fitStage();redraw();
  if(link&&$('link-pages').checked&&native?.pdfDocument&&native.page!==number)native.page=number;
 }catch{if(generation===state.generation)notice('This page could not be displayed. Try another page.',true);}
 finally{if(generation===state.generation){state.rendering=false;canvas.style.visibility='';controls();}}
}
function baselineDirty(){return Boolean(native?._annotationStorageModified);}
function dirty(){return serial()!==state.saved||baselineDirty();}
function requestOpen(action){if(!dirty()){void action();return;}pendingReplace=action;$('replace-dialog').showModal();}
$('replace-cancel').onclick=()=>{pendingReplace=null;$('replace-dialog').close();};
$('replace-confirm').onclick=()=>{const action=pendingReplace;pendingReplace=null;$('replace-dialog').close();if(action)void action();};
$('replace-dialog').addEventListener('cancel',()=>{pendingReplace=null;});
async function loadPdf(bytes,name){
 state.busy=true;controls();notice('Opening '+name+'…');let prepared=null;
 try{
  const original=new Uint8Array(bytes);loading=pdfjs.getDocument({data:original.slice(),cMapUrl:'/pdf-viewer/web/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-viewer/web/standard_fonts/',wasmUrl:'/pdf-viewer/web/wasm/',isEvalSupported:false});
  loading.onPassword=()=>{void loading.destroy();notice('Choose an unlocked PDF for this comparison.',true);};prepared=await loading.promise;
  await nativeReady;await native.open({data:original.slice(),originalUrl:name});
  const old=state.pdf;state.pdf=prepared;prepared=null;state.bytes=original;state.name=name;state.page=1;state.viewport=null;state.marks=[];state.undo=[];state.redo=[];state.selected=null;state.saved='[]';state.busy=false;
  $('file-name').textContent=name;await showPage(1);update();if(old)void old.loadingTask.destroy().catch(()=>{});notice('Ready. Each view keeps its own marks. Try the same task in both.');
 }catch(error){if(prepared)void prepared.loadingTask.destroy().catch(()=>{});console.warn('PDF comparison load failed',error);notice('Could not open this PDF. Choose an unlocked, valid PDF (up to 30 MB).',true);}
 finally{state.busy=false;controls();loading=null;}
}
async function loadSample(){try{state.busy=true;controls();const response=await fetch(sampleUrl);if(!response.ok)throw Error();await loadPdf(await response.arrayBuffer(),'Sample worksheet.pdf');}catch{state.busy=false;controls();notice('Sample unavailable. You can still open a PDF from your device.',true);}}
$('sample').onclick=()=>requestOpen(loadSample);
$('open-file').onclick=()=>$('pdf-file').click();
$('pdf-file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>30*1024*1024){notice('Choose a PDF smaller than 30 MB.',true);return;}requestOpen(async()=>{try{await loadPdf(await file.arrayBuffer(),file.name);}catch{notice('This file could not be read. Choose another PDF.',true);}});};
function chooseTool(tool){
 if(tool!=='select')state.selected=null;
 state.tool=tool;canvas.dataset.tool=tool;$('quick-tool').value=tool;$('tool-hint').textContent=hints[tool];for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));update();
}
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>chooseTool(button.dataset.tool);
function styleSelection(changes){const mark=selected();if(!mark)return;const before=serial(),updated={...mark,...changes};if(updated.type==='text'){updated.h=textLayout(context,updated).height;if(updated.h>state.viewport.height){notice('That text size would not fit on this page. Choose a smaller size.',true);return;}updated.y=clamp(updated.y,0,state.viewport.height-updated.h);}Object.assign(mark,updated);commit(before);}
function setColour(value){state.colour=value;$('colour').value=value;for(const button of document.querySelectorAll('[data-colour]'))button.setAttribute('aria-pressed',String(button.dataset.colour===value));styleSelection({colour:value});}
for(const button of document.querySelectorAll('[data-colour]'))button.onclick=()=>setColour(button.dataset.colour);
$('colour').oninput=event=>setColour(event.target.value);$('width').onchange=event=>{state.width=Number(event.target.value);styleSelection({width:state.width});};
$('font-size').onchange=event=>{state.size=Number(event.target.value);if(selected()?.type==='text')styleSelection({size:state.size});};
$('fill').onchange=event=>{state.fill=event.target.checked;if(['rectangle','ellipse'].includes(selected()?.type))styleSelection({fill:state.fill});};
function point(event){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left)*state.viewport.width/rect.width,0,state.viewport.width),y:clamp((event.clientY-rect.top)*state.viewport.height/rect.height,0,state.viewport.height)};}
function findMark(p){return [...state.marks].reverse().find(mark=>mark.page===state.page&&hitMark(mark,p,8*state.viewport.width/canvas.getBoundingClientRect().width));}
function deleteSelected(){if(!selected())return;const before=serial();state.marks=state.marks.filter(mark=>mark.id!==state.selected);state.selected=null;commit(before);}
function openText(p,mark=null){
 state.text={point:p,id:mark?.id};$('text-title').textContent=mark?'Edit text':'Add text';$('text-value').value=mark?.text||'';$('text-direction').value=mark?.direction||'auto';
 const width=mark?.w||280;$('text-width').value=width<=200?'160':width<=340?'280':'420';if(mark){state.size=mark.size;$('font-size').value=mark.size;setColour(mark.colour);}
 $('text-dialog').showModal();$('text-value').focus();
}
$('text-cancel').onclick=()=>$('text-dialog').close();
$('text-form').onsubmit=event=>{
 event.preventDefault();const text=$('text-value').value.trim();if(!text||!state.viewport)return;
 const before=serial(),existing=state.marks.find(mark=>mark.id===state.text?.id),p=existing||state.text.point;
 const mark={id:existing?.id||crypto.randomUUID(),page:state.page,type:'text',x:p.x,y:p.y,w:Math.min(Number($('text-width').value),state.viewport.width-16),text,direction:$('text-direction').value,size:state.size,colour:state.colour};
 mark.h=textLayout(context,mark).height;if(mark.h>state.viewport.height-16){notice('This text is too tall for the page. Shorten it or choose a smaller text size.',true);return;}
 mark.x=clamp(mark.x,0,state.viewport.width-mark.w);mark.y=clamp(mark.y,0,state.viewport.height-mark.h);
 if(existing)state.marks[state.marks.indexOf(existing)]=mark;else state.marks.push(mark);state.selected=mark.id;$('text-dialog').close();chooseTool('select');commit(before);notice('Text added. Select it to move, resize or edit it.');
};
$('edit-text').onclick=()=>{const mark=selected();if(mark?.type==='text')openText(mark,mark);};$('delete').onclick=deleteSelected;
canvas.addEventListener('pointerdown',event=>{
 if(!state.viewport||state.busy||state.rendering||state.exporting||event.button!==0||state.gesture)return;
 const p=point(event);canvas.focus({preventScroll:true});event.preventDefault();
 if(state.tool==='text'){openText(p);return;}
 if(state.tool==='eraser'){state.selected=findMark(p)?.id||null;deleteSelected();return;}
 const before=serial();
 if(state.tool==='select'){
  const old=selected(),b=old&&markBounds(old),tolerance=10*state.viewport.width/canvas.getBoundingClientRect().width;
  const resize=old&&!old.points&&old.page===state.page&&Math.hypot(p.x-b.x-b.w,p.y-b.y-b.h)<tolerance;
  const mark=resize?old:findMark(p);state.selected=mark?.id||null;update();if(!mark)return;
  state.gesture={pointer:event.pointerId,start:p,before,original:copy(mark),resize};
 }else if(state.tool!=='hand'){
  const style={id:crypto.randomUUID(),page:state.page,colour:state.colour,width:state.width,fill:state.fill};
  const draft=['pen','highlight'].includes(state.tool)?{...style,type:state.tool,points:[p]}:shapeMark(state.tool,p,p,style);
  state.selected=null;state.gesture={pointer:event.pointerId,start:p,before,draft};
 }
 if(state.gesture)canvas.setPointerCapture(event.pointerId);redraw();
});
canvas.addEventListener('pointermove',event=>{
 const g=state.gesture;if(!g||g.pointer!==event.pointerId)return;const p=point(event);
 if(g.draft){if(['pen','highlight'].includes(g.draft.type)){const last=g.draft.points.at(-1);if(Math.hypot(last.x-p.x,last.y-p.y)>.7)g.draft.points.push(p);}else g.draft=shapeMark(g.draft.type,g.start,p,g.draft);}
 else{
  let mark;if(g.resize){const original=g.original;mark={...original,w:clamp(p.x-original.x,24,state.viewport.width-original.x),h:clamp(p.y-original.y,12,state.viewport.height-original.y)};if(mark.type==='text'){mark.h=textLayout(context,mark).height;if(mark.h>state.viewport.height)mark=copy(original);else mark.y=clamp(mark.y,0,state.viewport.height-mark.h);}}
  else mark=moveMark(g.original,p.x-g.start.x,p.y-g.start.y,state.viewport.width,state.viewport.height);
  state.marks=state.marks.map(item=>item.id===g.original.id?mark:item);
 }
 redraw();
});
canvas.addEventListener('pointerup',event=>{
 const g=state.gesture;if(!g||g.pointer!==event.pointerId)return;
 if(g.draft){const b=markBounds(g.draft);if(g.draft.type==='pen'||g.draft.type==='highlight'||b.w>2||b.h>2)state.marks.push(g.draft);}
 state.gesture=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);commit(g.before);redraw();controls();
});
function cancelGesture(){const g=state.gesture;if(!g)return;state.marks=JSON.parse(g.before);state.gesture=null;if(canvas.hasPointerCapture(g.pointer))canvas.releasePointerCapture(g.pointer);update();}
canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',()=>{if(state.gesture)cancelGesture();});
function history(direction){cancelGesture();const from=direction==='undo'?state.undo:state.redo,to=direction==='undo'?state.redo:state.undo;if(!from.length)return;to.push(serial());state.marks=JSON.parse(from.pop());state.selected=null;update();}
$('undo').onclick=()=>history('undo');$('redo').onclick=()=>history('redo');
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,dialog')||state.busy||state.rendering||state.exporting)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}
 if(event.key==='Delete'||event.key==='Backspace'){if(selected()){event.preventDefault();deleteSelected();}}
 if(event.key==='Escape'){cancelGesture();state.selected=null;chooseTool('hand');update();}
});
$('previous').onclick=()=>void showPage(state.page-1);$('next').onclick=()=>void showPage(state.page+1);$('page-number').onchange=event=>void showPage(event.target.value);$('zoom').onchange=fitStage;
$('link-pages').onchange=()=>{if($('link-pages').checked&&native?.pdfDocument)native.page=state.page;};
function setView(view){const page=state.page;viewSync=true;currentView=view;$('comparison').dataset.view=view;document.body.dataset.view=view;for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));requestAnimationFrame(()=>{fitStage();if($('link-pages').checked&&native?.pdfDocument)native.page=page;requestAnimationFrame(()=>{viewSync=false;});});}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>setView(button.dataset.view);
const compact=matchMedia('(max-width:900px)');compact.addEventListener('change',()=>{if(compact.matches&&currentView==='both')setView('academy');});if(compact.matches)setView('academy');
new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-height',entries[0].contentRect.height+'px')).observe(document.querySelector('.compare-header'));
$('quick-tool').onchange=event=>{chooseTool(event.target.value);$('page-scroll').scrollIntoView({block:'start'});};$('show-tools').onclick=()=>$('toolbox').scrollIntoView({block:'start'});$('quick-undo').onclick=()=>history('undo');
$('download').onclick=async()=>{
 if(!state.pdf||state.exporting||state.busy)return;cancelGesture();state.exporting=true;controls();notice('Preparing your annotated PDF copy…');
 try{
  const {PDFDocument,degrees}=window.PDFLib,doc=await PDFDocument.load(state.bytes.slice(),{updateMetadata:false}),snapshot=serial();
  for(const pageNumber of [...new Set(state.marks.map(mark=>mark.page))]){
   const page=await state.pdf.getPage(pageNumber),viewport=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(12000000/(viewport.width*viewport.height))),overlay=document.createElement('canvas');overlay.width=Math.ceil(viewport.width*scale);overlay.height=Math.ceil(viewport.height*scale);
   const ctx=overlay.getContext('2d');ctx.scale(overlay.width/viewport.width,overlay.height/viewport.height);for(const mark of state.marks)if(mark.page===pageNumber)paintMark(ctx,mark);
   const image=await doc.embedPng(overlay.toDataURL('image/png')),placement=overlayPlacement(viewport);doc.getPage(pageNumber-1).drawImage(image,{...placement,rotate:degrees(placement.rotation)});
  }
  const bytes=await doc.save(),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download=state.name.replace(/\.pdf$/i,'')+'-academy.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);state.saved=snapshot;
  notice('Copy downloaded. Academy marks are permanent in that copy. Your editable marks remain in this tab.');
 }catch{notice('This PDF could not be exported. Your marks are still here; try again or use the sample worksheet.',true);}
 finally{state.exporting=false;controls();}
};
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
chooseTool('hand');void loadSample();
