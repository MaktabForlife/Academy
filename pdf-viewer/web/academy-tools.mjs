import {createPagePicker} from '../../js/m4l-pdf-page-picker.mjs?v=107.52';
import {PDFViewerApplication as app} from './viewer.mjs?v=107.52';
if(new URLSearchParams(location.search).get('academy')==='1'){
 document.body.classList.add('academy-pdf');
 const pane=Number(new URLSearchParams(location.search).get('pane')||0);let parentReader=null;try{if(parent!==window&&parent.location.origin===location.origin)parentReader=parent.M4L_PDF_READER;}catch{}
 await app.initializedPromise;
 if(new URLSearchParams(location.search).get('assessment')==='1'){document.body.classList.add('academy-assessment');window.M4L_ASSESSMENT_PRINT=()=>{if(app.pdfDocument)app.triggerPrinting();};}
 const byId=id=>document.getElementById(id);
 for(const id of ['editorModeButtons','editorModeSeparator','imageAltTextSettings','imageAltTextSettingsSeparator'])byId(id)?.remove();
 const toolbar=byId('toolbarContainer'),left=byId('toolbarViewerLeft'),right=byId('toolbarViewerRight');
 if(parentReader?.workspaceState){
  document.body.classList.add('academy-compact-reader');
  const picker=document.createElement('div');picker.className='page-picker';picker.innerHTML='<label for="academy-page-number">Page</label><div class="academy-page-field"><input id="academy-page-number" type="text" inputmode="numeric" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="academy-page-options" aria-expanded="false" aria-label="Page number"><button id="academy-page-toggle" type="button" aria-label="Show page list" title="Choose a page" aria-controls="academy-page-options" aria-expanded="false">⌄</button></div><div id="academy-page-options" role="listbox" aria-label="Pages" hidden></div>';
  left.append(picker);const zoomLabel=document.createElement('label');zoomLabel.textContent='Zoom';zoomLabel.htmlFor='scaleSelect';left.append(zoomLabel,byId('scaleSelectContainer'));
  const compactZoom=[['pageAutoOption','AUTO','Automatic zoom'],['pageActualOption','ACTUAL','Actual size']];
  const labelZoom=()=>{for(const [id,label,title] of compactZoom){const option=byId(id);option.removeAttribute('data-l10n-id');if(option.label!==label)option.label=label;if(option.textContent!==label)option.textContent=label;if(option.title!==title)option.title=title;}};
  // PDF.js starts translation before initializedPromise resolves; its pending
  // translation can otherwise restore the long labels after this toolbar loads.
  const zoomLabels=new MutationObserver(labelZoom);
  for(const [id] of compactZoom)zoomLabels.observe(byId(id),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['label','title','data-l10n-id']});
  labelZoom();
  const pagePicker=createPagePicker({input:byId('academy-page-number'),button:byId('academy-page-toggle'),list:byId('academy-page-options'),onSelect:page=>{app.page=page;}});
  const updatePage=()=>{pagePicker.setPages(app.pagesCount||0,app.page||1);pagePicker.setDisabled(!app.pdfDocument);};
  app.eventBus.on('pagesinit',updatePage);app.eventBus.on('pagechanging',updatePage);app.eventBus.on('pagesdestroy',()=>pagePicker.setDisabled(true));updatePage();
  const edit=document.createElement('button');edit.type='button';edit.id='academy-edit';edit.className='academy-edit-button';edit.textContent='Edit';left.append(edit);edit.onclick=()=>parentReader.toggleEdit(pane);
  function refresh(){const state=parentReader.editState(pane);edit.disabled=state.disabled;edit.setAttribute('aria-pressed',String(state.open));edit.setAttribute('aria-expanded',String(state.open));}
  window.M4L_PDF_NATIVE={refresh};refresh();document.documentElement.classList.add('academy-reader-ready');parentReader.toolbarReady();
  const resize=()=>{document.documentElement.style.setProperty('--academy-controls-height',toolbar.getBoundingClientRect().height+'px');};new ResizeObserver(resize).observe(toolbar);resize();
 }
 const reportLocation=()=>parentReader?.location?.(pane,window,{file:new URLSearchParams(location.search).get('file'),page:app.pdfViewer.currentPageNumber,pageLabel:app.pdfViewer.currentPageLabel||''});
 app.eventBus.on('pagesinit',reportLocation);
 app.eventBus.on('pagechanging',reportLocation);
}
