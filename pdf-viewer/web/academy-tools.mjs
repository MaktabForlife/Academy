import {createPagePicker} from '../../js/m4l-pdf-page-picker.mjs?v=107.49';
import {PDFViewerApplication as app} from './viewer.mjs?v=107.49';
if(new URLSearchParams(location.search).get('academy')==='1'){
 document.body.classList.add('academy-pdf');
 const pane=Number(new URLSearchParams(location.search).get('pane')||0);let parentReader=null;try{if(parent!==window&&parent.location.origin===location.origin)parentReader=parent.M4L_PDF_READER;}catch{}
 await app.initializedPromise;
 const byId=id=>document.getElementById(id);
 for(const id of ['editorModeButtons','editorModeSeparator','imageAltTextSettings','imageAltTextSettingsSeparator'])byId(id)?.remove();
 const toolbar=byId('toolbarContainer'),left=byId('toolbarViewerLeft'),right=byId('toolbarViewerRight');
 if(parentReader?.workspaceState){
  document.body.classList.add('academy-compact-reader');
  const picker=document.createElement('div');picker.className='page-picker';picker.innerHTML='<label for="academy-page-number">Page</label><div class="academy-page-field"><input id="academy-page-number" type="text" inputmode="numeric" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="academy-page-options" aria-expanded="false" aria-label="Page number"><button id="academy-page-toggle" type="button" aria-label="Show page list" title="Choose a page" aria-controls="academy-page-options" aria-expanded="false">⌄</button></div><div id="academy-page-options" role="listbox" aria-label="Pages" hidden></div>';
  left.append(picker);const zoomLabel=document.createElement('label');zoomLabel.textContent='Zoom';zoomLabel.htmlFor='scaleSelect';left.append(zoomLabel,byId('scaleSelectContainer'));
  const pagePicker=createPagePicker({input:byId('academy-page-number'),button:byId('academy-page-toggle'),list:byId('academy-page-options'),onSelect:page=>{app.page=page;}});
  const updatePage=()=>{pagePicker.setPages(app.pagesCount||0,app.page||1);pagePicker.setDisabled(!app.pdfDocument);};
  app.eventBus.on('pagesinit',updatePage);app.eventBus.on('pagechanging',updatePage);app.eventBus.on('pagesdestroy',()=>pagePicker.setDisabled(true));updatePage();
  const work=document.createElement('div');work.id='academy-workspace-tools';work.setAttribute('role','group');work.setAttribute('aria-label','Reader workspace tools');
  for(const action of ['split','whiteboard']){const button=document.createElement('button');button.type='button';button.id='academy-'+action;button.className='academy-workspace-button';button.onclick=()=>parentReader.workspaceAction(pane,action);work.append(button);}right.append(work);
  function refresh(){const state=parentReader.workspaceState();for(const [i,button] of [...work.children].entries()){const open=i===0?state.split:state.whiteboard;if(!button.firstElementChild)button.innerHTML=state.icons[i];button.title=i===0?(open?'Close split page':'Split Page'):'Whiteboard';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(open));button.hidden=state.mobile;button.disabled=i===0&&state.whiteboard;}}
  window.M4L_PDF_NATIVE={refresh};refresh();parentReader.toolbarReady();
  const resize=()=>{document.documentElement.style.setProperty('--academy-controls-height',toolbar.getBoundingClientRect().height+'px');};new ResizeObserver(resize).observe(toolbar);resize();
 }
 const reportLocation=()=>parentReader?.location?.(pane,window,{file:new URLSearchParams(location.search).get('file'),page:app.pdfViewer.currentPageNumber,pageLabel:app.pdfViewer.currentPageLabel||''});
 app.eventBus.on('pagesinit',reportLocation);
 app.eventBus.on('pagechanging',reportLocation);
}
