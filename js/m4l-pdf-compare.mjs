import * as pdfjs from '../pdf-viewer/build/pdf.mjs';
import {createPagePicker} from './m4l-pdf-page-picker.mjs?v=107.52';
import {clamp,shapeMark,markBounds,moveMark,resizeMark,hitMark,textLayout,paintMark,defaultTextBox,tidySketch} from './m4l-pdf-compare-model.mjs?v=107.52';
import {importEditable,exportEditable} from './m4l-pdf-editable.mjs?v=107.52';
import {DEFAULT_FAVOURITES,readFavouriteColours,saveFavouriteColours,favouriteColours} from './m4l-pdf-favourites.mjs?v=107.52';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf-viewer/build/pdf.worker.mjs';
const $=id=>document.getElementById(id),frame=$('native-reader'),canvas=$('marks-canvas'),context=canvas.getContext('2d'),stage=$('page-stage');
const sampleUrl='/academy/pdf-compare/sample.pdf',params=new URLSearchParams(location.search);
let embedded=false;try{embedded=params.get('embedded')==='1'&&parent!==window&&parent.location.origin===location.origin&&Boolean(parent.M4L_PDF_READER);}catch{}const host=embedded?parent.M4L_PDF_READER:null,paneIndex=Number(params.get('pane')||0);
if(embedded)document.body.classList.add('embedded-editor');
const state={pdf:null,bytes:null,name:'',page:1,viewport:null,marks:[],undo:[],redo:[],selected:null,tool:'hand',colour:'#292336',width:2.5,size:20,fill:false,fillColour:'#235dad',busy:true,rendering:false,exporting:false,generation:0,saved:'[]',gesture:null,text:null,sourceDirty:false,sourceFile:''};
let pagePicker=null,textLayer=null,native=null,loading=null,pendingReplace=null,currentView='academy',viewSync=false,savedCopy=null;
function nativePageChanged(event){if(!viewSync&&currentView!=='academy'&&$('link-pages').checked&&!state.busy&&event.pageNumber!==state.page)void showPage(event.pageNumber,false);}
const serial=()=>JSON.stringify(state.marks),copy=value=>structuredClone(value),notice=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const nativeReady=embedded?Promise.resolve(null):new Promise((resolve,reject)=>{
 async function loaded(){
  const app=frame.contentWindow.PDFViewerApplication;if(!app)return;
  frame.removeEventListener('load',loaded);
  try{native=app;await native.initializedPromise;native.eventBus.on('pagechanging',nativePageChanged);resolve(native);}catch(error){reject(error);}
 }
 frame.addEventListener('load',loaded);
 if(frame.contentDocument?.readyState==='complete'&&frame.contentWindow.PDFViewerApplication)void loaded();
});
if(!embedded)frame.src=frame.dataset.src;
nativeReady.catch(()=>notice('PDF.js could not start. Reload this comparison page.',true));
const toolbox=$('toolbox');document.querySelector('.page-controls').after(toolbox);
const downloadButton=$('download');downloadButton.className='icon-button';downloadButton.setAttribute('aria-label','Download my copy');downloadButton.title='Download my copy';downloadButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>';document.querySelector('.markup-bar').append(downloadButton,document.querySelector('.edit-actions'));if(embedded)downloadButton.hidden=true;
const favouriteSwatches=document.createElement('div');favouriteSwatches.className='colours toolbar-favourites';favouriteSwatches.setAttribute('role','group');favouriteSwatches.setAttribute('aria-label','Favourite ink colours');for(const button of document.querySelectorAll('[data-colour]'))favouriteSwatches.append(button);$('border-menu').after(favouriteSwatches);
$('compare-edit').onclick=()=>{const open=toolbox.hidden;toolbox.hidden=!open;document.body.classList.toggle('compare-editing',open);$('compare-edit').setAttribute('aria-expanded',String(open));$('compare-edit').setAttribute('aria-pressed',String(open));if(!open)chooseTool('hand');};
const names={pen:'Freehand stroke',highlight:'Highlight',rectangle:'Box',ellipse:'Circle / oval',line:'Line',arrow:'Arrow',text:'Text'};
const hints={hand:'Read without making marks. Scroll normally, or drag with your mouse to move the page.',
 'select-text':'Drag across printed PDF text to select and copy it. This does not change the printed text.',sketch:'Draw a single stroke. Simple lines, boxes and ovals are tidied; other strokes stay freehand. Choose Freehand to keep every stroke as drawn.',select:'Click text to edit it in place. Drag a mark to move it; drag its corner to resize, or a line’s end to reshape it.',pen:'Drag to draw a freehand stroke. Your drawing stays as drawn. Use the line-width and ink-colour menus to style it.',text:'Click anywhere on the page to add English or Arabic text.',highlight:'Drag over the part you want to highlight. Your chosen colour stays transparent.',rectangle:'Drag from one corner to the other to draw a box.',ellipse:'Drag across the area to draw a circle or oval.',line:'Drag from the start to the end of your straight line.',arrow:'Drag towards the place you want your arrow to point.',eraser:'Click a mark to remove the whole mark. Undo can restore it.'};
function selected(){return state.marks.find(mark=>mark.id===state.selected);}
function controls(){
 const locked=state.busy||state.exporting||state.rendering;
 $('download').disabled=locked||!state.pdf;$('open-file').disabled=state.busy||state.exporting;$('sample').disabled=state.busy||state.exporting;$('reopen-copy').disabled=state.busy||state.exporting||!savedCopy;
 $('previous').disabled=locked||!state.pdf||state.page<=1;$('next').disabled=locked||!state.pdf||state.page>=state.pdf.numPages;$('page-number').disabled=locked||!state.pdf;
 pagePicker?.setDisabled(locked||!state.pdf);
 $('undo').disabled=locked||!state.undo.length;$('redo').disabled=locked||!state.redo.length;$('delete').disabled=locked||!selected();$('edit-text').disabled=locked||selected()?.type!=='text';
 $('quick-undo').disabled=$('undo').disabled;$('quick-tool').disabled=locked||!state.pdf;
 $('toolbox').inert=state.busy||state.exporting;host?.editorState(paneIndex);
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
 for(const mark of state.marks)if(mark.page===state.page&&mark.id!==state.text?.draft.id)paintMark(context,mark);
 if(state.gesture?.draft)paintMark(context,state.gesture.draft);
 const mark=selected();if(mark&&mark.page===state.page&&!state.text){const b=markBounds(mark);context.save();context.strokeStyle='#70477c';context.lineWidth=1;context.setLineDash([4,3]);context.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);context.setLineDash([]);context.fillStyle='#70477c';if(['line','arrow'].includes(mark.type)){for(const p of mark.points)context.fillRect(p.x-4,p.y-4,8,8);}else context.fillRect(b.x+b.w-4,b.y+b.h-4,8,8);context.restore();}
}
function fitStage(){
 if(!state.viewport)return;const available=$('page-scroll').clientWidth-(matchMedia('(max-width:900px)').matches?20:36),zoom=$('zoom').value;
 const width=zoom==='fit'?Math.max(150,Math.min(available,1000)):state.viewport.width*Number(zoom);
 stage.style.width=width+'px';stage.style.height=width/state.viewport.width*state.viewport.height+'px';
 const root=$('text-layer-root');root.style.width=state.viewport.width+'px';root.style.height=state.viewport.height+'px';root.style.transform=`scale(${width/state.viewport.width})`;
 positionText();
}
new ResizeObserver(fitStage).observe($('page-scroll'));
async function showPage(number,link=true){
 if(!state.pdf||state.busy)return;number=clamp(Math.trunc(Number(number)||1),1,state.pdf.numPages);
 if(!finishText(true))return;
 if(state.gesture)cancelGesture();state.page=number;const generation=++state.generation;state.rendering=true;canvas.style.visibility='hidden';controls();
 try{
  if(textLayer)textLayer.cancel();$('pdf-text-layer').replaceChildren();
  const page=await state.pdf.getPage(number),viewport=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(12000000/(viewport.width*viewport.height)));
  const rendered=document.createElement('canvas'),view=page.getViewport({scale});rendered.width=Math.ceil(view.width);rendered.height=Math.ceil(view.height);
  await page.render({canvasContext:rendered.getContext('2d'),viewport:view}).promise;if(generation!==state.generation)return;
  const base=$('pdf-canvas');base.width=rendered.width;base.height=rendered.height;base.getContext('2d').drawImage(rendered,0,0);canvas.width=rendered.width;canvas.height=rendered.height;state.viewport=viewport;
  textLayer=new pdfjs.TextLayer({textContentSource:page.streamTextContent(),container:$('pdf-text-layer'),viewport});
  await textLayer.render().catch(error=>{if(error.name!=='AbortException')console.warn('PDF text selection unavailable',error);});if(generation!==state.generation)return;
  host?.location(paneIndex,window,{file:state.sourceFile,page:number,pageLabel:''});$('page-number').value=number;pagePicker?.setPages(state.pdf.numPages,number);$('page-count').textContent='/ '+state.pdf.numPages;fitStage();redraw();
  if(link&&$('link-pages').checked&&native?.pdfDocument&&native.page!==number)native.page=number;
 }catch{if(generation===state.generation)notice('This page could not be displayed. Try another page.',true);}
 finally{if(generation===state.generation){state.rendering=false;canvas.style.visibility='';controls();}}
}
function baselineDirty(){return Boolean(native?._annotationStorageModified);}
function dirty(){return state.sourceDirty||serial()!==state.saved||baselineDirty()||Boolean(state.text&&$('text-value').value.trim()&&JSON.stringify(state.text.draft)!==state.text.originalDraft);}
function requestOpen(action){if(!dirty()){void action();return;}pendingReplace=action;$('replace-dialog').showModal();}
$('replace-cancel').onclick=()=>{pendingReplace=null;$('replace-dialog').close();};
$('replace-confirm').onclick=()=>{const action=pendingReplace;pendingReplace=null;$('replace-dialog').close();if(action)void action();};
$('replace-dialog').addEventListener('cancel',()=>{pendingReplace=null;});
async function loadPdf(bytes,name){
 state.busy=true;controls();notice('Opening '+name+'…');let prepared=null;
 try{
  const original=new Uint8Array(bytes);loading=pdfjs.getDocument({data:original.slice(),cMapUrl:'/pdf-viewer/web/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-viewer/web/standard_fonts/',wasmUrl:'/pdf-viewer/web/wasm/',isEvalSupported:false});
  loading.onPassword=()=>{void loading.destroy();notice('Choose an unlocked PDF for this comparison.',true);};prepared=await loading.promise;
  const editable=await importEditable(original,prepared,window.PDFLib);
  if(editable.bytes!==original){await prepared.loadingTask.destroy();loading=pdfjs.getDocument({data:editable.bytes.slice(),cMapUrl:'/pdf-viewer/web/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-viewer/web/standard_fonts/',wasmUrl:'/pdf-viewer/web/wasm/',isEvalSupported:false});prepared=await loading.promise;}
  await nativeReady;if(native)await native.open({data:original.slice(),originalUrl:name});
  const old=state.pdf;state.pdf=prepared;prepared=null;state.bytes=editable.bytes;state.name=name;state.page=1;state.viewport=null;state.marks=editable.marks;state.undo=[];state.redo=[];state.selected=null;state.saved=serial();state.busy=false;state.text=null;$('text-form').hidden=true;
  $('file-name').textContent=name;await showPage(1);update();if(old)void old.loadingTask.destroy().catch(()=>{});notice(embedded?'Ready.':'Ready. Each view keeps its own marks. Try the same task in both.');
 }catch(error){if(prepared)void prepared.loadingTask.destroy().catch(()=>{});console.warn('PDF comparison load failed',error);notice('Could not open this PDF. Choose an unlocked, valid PDF (up to 30 MB).',true);if(embedded)throw error;}
 finally{state.busy=false;controls();loading=null;}
}
async function loadSample(){try{state.busy=true;controls();const response=await fetch(sampleUrl);if(!response.ok)throw Error();await loadPdf(await response.arrayBuffer(),'Sample worksheet.pdf');}catch{state.busy=false;controls();notice('Sample unavailable. You can still open a PDF from your device.',true);}}
$('sample').onclick=()=>requestOpen(loadSample);
$('reopen-copy').onclick=()=>requestOpen(()=>loadPdf(savedCopy.bytes.slice(),savedCopy.name));
$('open-file').onclick=()=>$('pdf-file').click();
$('pdf-file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>30*1024*1024){notice('Choose a PDF smaller than 30 MB.',true);return;}requestOpen(async()=>{try{await loadPdf(await file.arrayBuffer(),file.name);}catch{notice('This file could not be read. Choose another PDF.',true);}});};
function chooseTool(tool){
 if(state.text&&!finishText(true))return;if(state.gesture)cancelGesture();
 stage.dataset.tool=tool;if(tool!=='select-text')window.getSelection()?.removeAllRanges();
 for(const menu of document.querySelectorAll('.markup-menu'))menu.open=false;
 $('shapes-menu').classList.toggle('active',['rectangle','ellipse','line','arrow','highlight'].includes(tool));
 if(tool!=='select')state.selected=null;
 state.tool=tool;canvas.dataset.tool=tool;$('quick-tool').value=tool;$('tool-hint').textContent=hints[tool];for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));update();
}
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>chooseTool(button.dataset.tool);
for(const menu of document.querySelectorAll('.markup-menu'))menu.addEventListener('toggle',()=>{if(!menu.open)return;for(const other of document.querySelectorAll('.markup-menu'))if(other!==menu)other.open=false;const panel=menu.querySelector('.menu-panel');panel.style.left='0px';panel.style.right='auto';const rect=panel.getBoundingClientRect(),pane=menu.closest('.pane').getBoundingClientRect(),left=Math.max(12,pane.left+10),right=Math.min(innerWidth-12,pane.right-10);panel.style.left=(clamp(rect.left,left,Math.max(left,right-rect.width))-rect.left)+'px';});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.markup-menu'))for(const menu of document.querySelectorAll('.markup-menu'))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of document.querySelectorAll('.markup-menu'))menu.open=false;});
function styleSelection(changes){if(state.text){Object.assign(state.text.draft,changes);positionText();return;}const mark=selected();if(!mark)return;const before=serial(),updated={...mark,...changes};if(updated.type==='text'){updated.h=textLayout(context,updated).height;if(updated.h>state.viewport.height){notice('That text size would not fit on this page. Choose a smaller size.',true);return;}updated.y=clamp(updated.y,0,state.viewport.height-updated.h);}Object.assign(mark,updated);commit(before);}
function setColour(value){state.colour=value;$('colour').value=value;$('text-colour').value=value;document.documentElement.style.setProperty('--current-ink',value);for(const button of document.querySelectorAll('[data-colour]'))button.setAttribute('aria-pressed',String(button.dataset.colour===value));styleSelection({colour:value});}
for(const button of document.querySelectorAll('[data-colour]'))button.onclick=()=>setColour(button.dataset.colour);
let favourites;try{favourites=readFavouriteColours(localStorage);}catch{favourites=[...DEFAULT_FAVOURITES];}
function renderFavourites(){[...document.querySelectorAll('[data-colour]')].forEach((button,i)=>{button.dataset.colour=favourites[i];button.style.setProperty('--swatch',favourites[i]);button.setAttribute('aria-label',`Favourite ${i+1}: ${favourites[i]}`);button.title=`Favourite ${i+1}: ${favourites[i]}`;button.setAttribute('aria-pressed',String(favourites[i]===state.colour));});}
function favouriteSettings(open){$('favourite-settings').hidden=!open;$('edit-favourites').setAttribute('aria-expanded',String(open));if(open)for(const input of document.querySelectorAll('[data-favourite-slot]')){input.value=favourites[Number(input.dataset.favouriteSlot)];document.querySelector('[data-favourite-hex="'+input.dataset.favouriteSlot+'"]').value=input.value;}}
$('edit-favourites').onclick=()=>favouriteSettings($('favourite-settings').hidden);$('cancel-favourites').onclick=()=>favouriteSettings(false);
$('reset-favourites').onclick=()=>{for(const input of document.querySelectorAll('[data-favourite-slot]')){input.value=DEFAULT_FAVOURITES[Number(input.dataset.favouriteSlot)];document.querySelector('[data-favourite-hex="'+input.dataset.favouriteSlot+'"]').value=input.value;}};
$('save-favourites').onclick=()=>{for(const input of document.querySelectorAll('[data-favourite-hex]'))if(!/^#[\da-f]{6}$/i.test(input.value)){notice('Choose a valid favourite colour using the colour button.',true);input.focus();return;}favourites=favouriteColours([...document.querySelectorAll('[data-favourite-slot]')].map(input=>input.value));let saved=false;try{saved=saveFavouriteColours(localStorage,favourites);}catch{}renderFavourites();favouriteSettings(false);notice(saved?'Favourite colours saved for this browser.':'Favourite colours changed for this tab. This browser could not remember them.');};
for(const input of document.querySelectorAll('[data-favourite-slot]'))input.oninput=()=>{document.querySelector('[data-favourite-hex="'+input.dataset.favouriteSlot+'"]').value=input.value;};
for(const input of document.querySelectorAll('[data-favourite-hex]'))input.oninput=()=>{if(/^#[\da-f]{6}$/i.test(input.value))document.querySelector('[data-favourite-slot="'+input.dataset.favouriteHex+'"]').value=input.value;};
renderFavourites();
$('colour').oninput=$('text-colour').oninput=event=>setColour(event.target.value);$('width').onchange=event=>{state.width=Number(event.target.value);styleSelection({width:state.width});};
$('font-size').onchange=event=>{state.size=Number(event.target.value);if(state.text||selected()?.type==='text')styleSelection({size:state.size});};
$('fill').onchange=event=>{state.fill=event.target.checked;if(['rectangle','ellipse'].includes(selected()?.type))styleSelection({fill:state.fill,fillColour:state.fillColour});fillPreview();};
function fillPreview(){$('fill-chip').toggleAttribute('hidden',!state.fill);$('fill-slash').toggleAttribute('hidden',state.fill);document.documentElement.style.setProperty('--current-fill',state.fillColour);}
$('fill-colour').oninput=event=>{state.fillColour=event.target.value;state.fill=true;$('fill').checked=true;fillPreview();if(['rectangle','ellipse'].includes(selected()?.type))styleSelection({fill:true,fillColour:state.fillColour});};
function point(event){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left)*state.viewport.width/rect.width,0,state.viewport.width),y:clamp((event.clientY-rect.top)*state.viewport.height/rect.height,0,state.viewport.height)};}
function findMark(p){return [...state.marks].reverse().find(mark=>mark.page===state.page&&hitMark(mark,p,8*state.viewport.width/canvas.getBoundingClientRect().width));}
function deleteSelected(){if(!selected())return;const before=serial();state.marks=state.marks.filter(mark=>mark.id!==state.selected);state.selected=null;commit(before);}
function syncSelection(mark){
 if(!mark)return;state.colour=mark.colour;$('colour').value=mark.colour;$('text-colour').value=mark.colour;document.documentElement.style.setProperty('--current-ink',mark.colour);for(const button of document.querySelectorAll('[data-colour]'))button.setAttribute('aria-pressed',String(button.dataset.colour===mark.colour));
 if(mark.type==='text'){state.size=mark.size;const input=$('font-size');if(![...input.options].some(option=>Number(option.value)===mark.size))input.add(new Option(String(mark.size),String(mark.size)));input.value=mark.size;}
 state.width=mark.width||2.5;if(![...$('width').options].some(option=>Number(option.value)===state.width))$('width').add(new Option(String(state.width),String(state.width)));$('width').value=state.width;state.fill=Boolean(mark.fill);state.fillColour=mark.fillColour||mark.colour;$('fill').checked=state.fill;$('fill-colour').value=state.fillColour;fillPreview();
}
function positionText(){
 if(!state.text||!state.viewport)return;const mark=state.text.draft,form=$('text-form'),scale=stage.getBoundingClientRect().width/state.viewport.width;
 mark.text=$('text-value').value;mark.h=textLayout(context,mark).height;
 form.style.left=mark.x/state.viewport.width*100+'%';form.style.top=mark.y/state.viewport.height*100+'%';form.style.width=`calc(${mark.w/state.viewport.width*100}% + 4px)`;form.style.height=(mark.h*scale+4)+'px';
 $('text-value').style.fontSize=mark.size*scale+'px';$('text-value').style.padding=4*scale+'px';$('text-value').style.color=mark.colour;$('text-value').dir=mark.direction;
 form.classList.toggle('align-end',mark.x+mark.w/2>state.viewport.width/2);form.classList.toggle('above',mark.y+mark.h+70/scale>state.viewport.height);redraw();
}
function openText(p,mark=null){
 if(state.text&&!finishText(true))return;
 const draft=mark?copy(mark):{id:crypto.randomUUID(),page:state.page,type:'text',...defaultTextBox(p,state.viewport.width),y:p.y,h:state.size*1.4+8,text:'',direction:'auto',size:state.size,colour:state.colour};
 syncSelection(draft);state.selected=mark?.id||null;state.text={draft,before:serial(),originalDraft:JSON.stringify(draft),existing:Boolean(mark)};
 $('text-value').value=draft.text;$('text-direction').value=draft.direction;$('text-form').hidden=false;positionText();$('text-value').focus();$('text-value').setSelectionRange(draft.text.length,draft.text.length);controls();
}
function finishText(save){
 const editing=state.text;if(!editing)return true;
 if(save){
  const mark=editing.draft;mark.text=$('text-value').value.replaceAll('\r','');mark.direction=$('text-direction').value;mark.h=textLayout(context,mark).height;
  if(mark.text.trim()&&mark.h>state.viewport.height-8){notice('This text is too tall for the page. Shorten it or choose a smaller text size.',true);return false;}
  mark.y=clamp(mark.y,0,Math.max(0,state.viewport.height-mark.h));mark.x=clamp(mark.x,0,Math.max(0,state.viewport.width-mark.w));
  const index=state.marks.findIndex(item=>item.id===mark.id);if(!mark.text.trim())state.marks=state.marks.filter(item=>item.id!==mark.id);else if(index>=0)state.marks[index]=mark;else state.marks.push(mark);state.selected=mark.text.trim()?mark.id:null;
 }
 state.text=null;$('text-form').hidden=true;if(save){state.tool='select';stage.dataset.tool='select';canvas.dataset.tool='select';$('quick-tool').value='select';for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool==='select'));$('tool-hint').textContent=hints.select;commit(editing.before);}update();return true;
}
$('text-form').onsubmit=event=>{event.preventDefault();finishText(true);};$('text-cancel').onclick=()=>finishText(false);
$('text-value').oninput=positionText;$('text-direction').onchange=()=>{if(state.text){state.text.draft.direction=$('text-direction').value;positionText();}};
$('text-value').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishText(false);}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();finishText(true);}};
function outsideText(event){if(state.text&&!event.target.closest('#text-form,#toolbox')){if(!finishText(true)){event.preventDefault();event.stopImmediatePropagation();}}}
 document.addEventListener('pointerdown',outsideText,true);document.addEventListener('focusin',outsideText,true);
$('edit-text').onclick=()=>{const mark=selected();if(mark?.type==='text')openText(mark,mark);};$('delete').onclick=deleteSelected;
canvas.addEventListener('pointerdown',event=>{
 if(!state.viewport||state.busy||state.rendering||state.exporting||event.button!==0||state.gesture)return;
 if(state.tool==='hand'){if(event.pointerType!=='mouse')return;event.preventDefault();const scroll=$('page-scroll');state.gesture={hand:true,pointer:event.pointerId,x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};canvas.setPointerCapture(event.pointerId);return;}
 const p=point(event);canvas.focus({preventScroll:true});event.preventDefault();
 if(state.tool==='text'){const mark=findMark(p);openText(mark?.type==='text'?mark:p,mark?.type==='text'?mark:null);return;}
 if(state.tool==='eraser'){state.selected=findMark(p)?.id||null;deleteSelected();return;}
 const before=serial();
 if(state.tool==='select'){
  const old=selected(),b=old&&markBounds(old),tolerance=10*state.viewport.width/canvas.getBoundingClientRect().width;
  const endpoint=old&&['line','arrow'].includes(old.type)&&old.page===state.page?old.points.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<tolerance):-1;
  const resize=old&&endpoint<0&&old.page===state.page&&Math.hypot(p.x-b.x-b.w,p.y-b.y-b.h)<tolerance;
  const mark=resize||endpoint>=0?old:findMark(p);state.selected=mark?.id||null;syncSelection(mark);update();if(!mark)return;
  state.gesture={pointer:event.pointerId,start:p,before,original:copy(mark),resize,endpoint,moved:false};
 }else if(state.tool!=='hand'){
  const style={id:crypto.randomUUID(),page:state.page,colour:state.colour,width:state.width,fill:state.fill,fillColour:state.fillColour};
  const draft=['pen','sketch','highlight'].includes(state.tool)?{...style,type:state.tool==='sketch'?'pen':state.tool,points:[p]}:shapeMark(state.tool,p,p,style);
  state.selected=null;state.gesture={pointer:event.pointerId,start:p,before,draft,sketch:state.tool==='sketch'};
 }
 if(state.gesture)canvas.setPointerCapture(event.pointerId);redraw();
});
canvas.addEventListener('pointermove',event=>{
 const g=state.gesture;if(!g||g.pointer!==event.pointerId)return;if(g.hand){$('page-scroll').scrollLeft=g.left-event.clientX+g.x;$('page-scroll').scrollTop=g.top-event.clientY+g.y;return;}const p=point(event);g.moved ||= Math.hypot(p.x-g.start.x,p.y-g.start.y)>3;
 if(g.draft){if(['pen','highlight'].includes(g.draft.type)){const last=g.draft.points.at(-1);if(Math.hypot(last.x-p.x,last.y-p.y)>.7)g.draft.points.push(p);}else g.draft=shapeMark(g.draft.type,g.start,p,g.draft);}
 else{
  let mark;if(g.endpoint>=0){mark=copy(g.original);mark.points[g.endpoint]=p;}else if(g.resize){const original=g.original,b=markBounds(original);mark=resizeMark(original,clamp(p.x-b.x,12,state.viewport.width-b.x),clamp(p.y-b.y,12,state.viewport.height-b.y));if(mark.type==='text'){mark.h=textLayout(context,mark).height;if(mark.h>state.viewport.height)mark=copy(original);else mark.y=clamp(mark.y,0,state.viewport.height-mark.h);}}
  else mark=moveMark(g.original,p.x-g.start.x,p.y-g.start.y,state.viewport.width,state.viewport.height);
  state.marks=state.marks.map(item=>item.id===g.original.id?mark:item);
 }
 redraw();
});
canvas.addEventListener('pointerup',event=>{
 const g=state.gesture;if(!g||g.pointer!==event.pointerId)return;
 if(g.hand){state.gesture=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}
 if(g.draft){if(g.sketch)g.draft=tidySketch(g.draft);const b=markBounds(g.draft);if(g.draft.type==='pen'||g.draft.type==='highlight'||b.w>2||b.h>2)state.marks.push(g.draft);}
 state.gesture=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);commit(g.before);redraw();controls();if(g.original?.type==='text'&&!g.resize&&!g.moved)openText(g.original,selected());
});
function cancelGesture(){const g=state.gesture;if(!g)return;if(!g.hand)state.marks=JSON.parse(g.before);state.gesture=null;if(canvas.hasPointerCapture(g.pointer))canvas.releasePointerCapture(g.pointer);update();}
canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',()=>{if(state.gesture)cancelGesture();});
function history(direction){cancelGesture();const from=direction==='undo'?state.undo:state.redo,to=direction==='undo'?state.redo:state.undo;if(!from.length)return;to.push(serial());state.marks=JSON.parse(from.pop());state.selected=null;update();}
$('undo').onclick=()=>history('undo');$('redo').onclick=()=>history('redo');
document.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,dialog')||state.busy||state.rendering||state.exporting)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}
 if(event.key==='Delete'||event.key==='Backspace'){if(selected()){event.preventDefault();deleteSelected();}}
 if(event.key==='Escape'){cancelGesture();state.selected=null;chooseTool('hand');update();}
});
$('previous').onclick=()=>void showPage(state.page-1);$('next').onclick=()=>void showPage(state.page+1);pagePicker=createPagePicker({input:$('page-number'),button:$('page-menu-toggle'),list:$('page-options'),onSelect:number=>showPage(number)});$('zoom').onchange=fitStage;
$('link-pages').onchange=()=>{if($('link-pages').checked&&native?.pdfDocument)native.page=state.page;};
function setView(view){const page=state.page;viewSync=true;currentView=view;$('comparison').dataset.view=view;document.body.dataset.view=view;for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));requestAnimationFrame(()=>{fitStage();if($('link-pages').checked&&native?.pdfDocument)native.page=page;requestAnimationFrame(()=>{viewSync=false;});});}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>setView(button.dataset.view);
const compact=matchMedia('(max-width:900px)');compact.addEventListener('change',()=>{if(compact.matches&&currentView==='both')setView('academy');});if(compact.matches)setView('academy');
new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-height',entries[0].contentRect.height+'px')).observe(document.querySelector('.compare-header'));
$('quick-tool').onchange=event=>{chooseTool(event.target.value);$('page-scroll').scrollIntoView({block:'start'});};$('show-tools').onclick=()=>$('toolbox').scrollIntoView({block:'start'});$('quick-undo').onclick=()=>history('undo');
$('download').onclick=async()=>{
 if(!state.pdf||state.exporting||state.busy||!finishText(true))return;cancelGesture();state.exporting=true;controls();notice('Preparing your editable PDF copy…');
 try{
  const snapshot=serial(),bytes=await exportEditable(state.bytes,state.marks,pdfjs,window.PDFLib,context),name=state.name.replace(/(-academy)*\.pdf$/i,'')+'-academy.pdf';
  savedCopy={bytes:bytes.slice(),name};const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);state.saved=snapshot;state.sourceDirty=false;
  notice('Editable copy downloaded. Choose Reopen saved copy to continue editing, and keep using Academy’s tools.');
 }catch(error){console.warn('Editable PDF export failed',error);notice('This PDF could not be exported. Your marks are still here; try again or use the sample worksheet.',true);}
 finally{state.exporting=false;controls();}
};
if(!embedded)window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
chooseTool('hand');setView('academy');
if(embedded){
 const edit=document.createElement('button');edit.type='button';edit.id='app-edit';edit.className='academy-edit-button';edit.textContent='Edit';$('zoom').closest('label').after(edit);edit.onclick=()=>host.toggleEdit(paneIndex);
 function refresh(){const state=host.editState(paneIndex);edit.disabled=state.disabled;edit.setAttribute('aria-pressed',String(state.open));edit.setAttribute('aria-expanded',String(state.open));}
 let previewCache=null;
 async function preview(){
  if(!finishText(true))throw Error('Finish editing this text before returning to reading.');cancelGesture();
  const snapshot=serial();if(previewCache?.document===state.pdf&&previewCache.snapshot===snapshot)return previewCache.bytes.slice();
  if(state.busy||state.exporting)throw Error('Please wait for the PDF to finish preparing.');state.exporting=true;controls();
  try{const bytes=await exportEditable(state.bytes,state.marks,pdfjs,window.PDFLib,context);previewCache={document:state.pdf,snapshot,bytes:bytes.slice()};return bytes;}finally{state.exporting=false;controls();}
 }
 function setEditing(open){if(!open&&!finishText(true))return false;toolbox.hidden=!open;document.body.classList.toggle('compare-editing',open);if(!open)chooseTool('hand');return true;}
 window.M4L_PDF_APP={
  load:async({bytes,name,page=1,file='',unsaved=false})=>{state.sourceFile=file;await loadPdf(bytes,name);state.sourceDirty=Boolean(unsaved);await showPage(page);notice('');},
  setEditing,hasUnsaved:dirty,refresh,preview,navigate:page=>showPage(page),download:()=>$('download').click(),
  position:()=>({document:state.pdf,page:state.page,top:$('page-scroll').scrollTop,left:$('page-scroll').scrollLeft}),
  restore:position=>{if(position.document===state.pdf){if(position.page!==state.page)void showPage(position.page);requestAnimationFrame(()=>{$('page-scroll').scrollTop=position.top;$('page-scroll').scrollLeft=position.left;});}},
  busy:()=>state.busy||state.exporting||state.rendering
 };
 window.addEventListener('pointerdown',()=>host.activate(paneIndex,window),true);window.addEventListener('focusin',()=>host.activate(paneIndex,window));
 setView('academy');setEditing(false);refresh();notice('');host.toolbarReady();
}else void loadSample();
