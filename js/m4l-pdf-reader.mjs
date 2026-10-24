import {PDF_TOOL_DEFAULTS,normalizePdfTools} from './m4l-pdf-tools-model.mjs?v=106.49';
import {publicPdfFile} from './m4l-pdf-bookmarks-model.mjs?v=106.82';
import {academyBookmarks} from './m4l-pdf-bookmarks.mjs?v=106.82';
import {publicPdfSource} from './m4l-pdf-source.mjs?v=107.40';
import './m4l-pdf-whiteboard.js?v=107.44';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),mobile=matchMedia('(max-width:767px), (pointer:coarse) and (max-height:500px)');
const panes=[0,1].map(index=>({index,element:$('pr-pane-'+index),choices:{},frame:null,loaded:false,file:'',title:'',page:0,mode:'books',drawerGeneration:0,loadGeneration:0}));
let readingPositions=new Map(),readingRestore=0,readingLayoutPending=false;
let defaults={...PDF_TOOL_DEFAULTS},split=false,active=0,ratio=50,catalogue=null,cataloguePromise=null,ready=false;
const status=text=>{$('pr-status').textContent=text;},part=(pane,selector)=>pane.element.querySelector(selector)||pane.header?.querySelector(selector);
function proxy(url){const file=publicPdfFile('/pdf-file/'+btoa(String.fromCharCode(...new TextEncoder().encode(url))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''));if(!file)throw Error('This PDF source is unavailable.');return file;}
function updateBookmarkButtons(pane){part(pane,'[data-edit]').disabled=!pane.loaded||Boolean(pane.appOpening);for(const button of pane.header.querySelectorAll('[data-save-book],[data-save-page]'))button.disabled=!pane.loaded||!pane.file;const label=pane.page?'Bookmark page '+(pane.pageLabel||pane.page):'Bookmark page';part(pane,'[data-save-page]').setAttribute('aria-label',label);part(pane,'[data-save-page]').title=label;}
window.M4L_PDF_READER={
 activate:(index,source)=>{const pane=panes[index];if(pane&&(source===pane.frame?.contentWindow||source===pane.appFrame?.contentWindow))setActive(index);},
 canLeave:()=>panes.every(pane=>canReplace(pane)),
 settings:index=>({...defaults,...panes[Number(index)]?.choices}),
 workspaceState:()=>({mobile:mobile.matches,split:split&&!mobile.matches,whiteboard:window.M4L_PDF_WHITEBOARD.isOpen(),icons:['pr-split','m4l-teaching-panel-toggle'].map(id=>$(id).innerHTML)}),
 workspaceAction:(index,action)=>{if(mobile.matches)return;setActive(index);$(action==='split'?'pr-split':'m4l-teaching-panel-toggle').click();},
 toolbarReady:()=>document.body.classList.add('pr-toolbar-ready'),
 remember:(index,changes)=>{const pane=panes[Number(index)];if(pane)try{pane.choices=normalizePdfTools({...defaults,...pane.choices,...changes},{session:true});}catch{}},
 location:(index,source,position)=>{const pane=panes[Number(index)];if(!pane||source!==(pane.appActive?pane.appFrame?.contentWindow:pane.frame?.contentWindow)||publicPdfFile(position.file)!==pane.file)return;pane.loaded=true;pane.page=position.page;pane.pageLabel=position.pageLabel||'';updateBookmarkButtons(pane);}
};
document.addEventListener('webviewerloaded',event=>{const source=event.detail?.source,pane=panes.find(item=>item.frame?.contentWindow===source);if(pane){source.addEventListener('keydown',readerKeydown);source.addEventListener('pointerdown',()=>setActive(pane.index),true);source.addEventListener('focusin',()=>setActive(pane.index));source.PDFViewerApplicationOptions.set('annotationEditorMode',-1);}});
function changed(pane){try{return pane.appActive?Boolean(pane.appFrame.contentWindow.M4L_PDF_APP?.hasUnsaved()):Boolean(pane.frame.contentWindow.PDFViewerApplication?._annotationStorageModified);}catch{return false;}}
function libraryReturn(){
 if(query.get('library')==='public')return '/academy/open-library/';
 if(query.get('library')==='personal')return '/academy/library/';
 try{const referrer=new URL(document.referrer);if(referrer.origin===location.origin&&['/academy/open-library/','/academy/library/'].includes(referrer.pathname))return referrer.pathname;}catch{}
 return academyBookmarks.signedIn()?'/academy/library/':'/academy/open-library/';
}
const readerLabel=document.querySelector('.pr-brand small'),baseReaderLabel=readerLabel.textContent;
function readerContext(){const workspace=window.M4L_ACADEMY_WORKSPACE;readerLabel.textContent=baseReaderLabel+(workspace.adminRealm()&&workspace.adminAccess()?' · '+workspace.current().replace('_','-'):'');$('pr-close-reader').href=workspace.readerUrl(libraryReturn());}
window.addEventListener('m4l-academy-access',readerContext);readerContext();
function canReplace(pane){return !changed(pane)||confirm('This PDF has unsaved annotations. Download a copy before replacing it. Continue?');}
function setActive(index){const preserve=window.M4L_PDF_WHITEBOARD.isOpen()&&index!==active;if(preserve)rememberReadingPositions();active=index;for(const pane of panes){pane.element.classList.toggle('is-active',pane.index===index);$('pr-tab-'+pane.index).setAttribute('aria-selected',String(pane.index===index));$('pr-tab-'+pane.index).tabIndex=pane.index===index?0:-1;}focusLabels();if(preserve)restoreReadingPositions();}
function syncWorkspaceTools(){for(const pane of panes)try{pane.frame?.contentWindow.M4L_PDF_NATIVE?.refresh();pane.appFrame?.contentWindow.M4L_PDF_APP?.refresh();}catch{}}
function focusLabels(){
 const focused=$('pr-workspace').classList.contains('is-focused');
 for(const pane of panes){
  const button=part(pane,'[data-focus]');if(!button)continue;
  button.hidden=!split||mobile.matches;button.textContent=focused&&pane.index===active?'Restore split':'Focus';
  button.disabled=window.M4L_PDF_WHITEBOARD.isOpen();button.setAttribute('aria-pressed',String(focused&&pane.index===active));
  button.setAttribute('aria-label',focused&&pane.index===active?'Restore split page':'Focus PDF '+(pane.index+1));
 }
 $('m4l-teaching-panel-toggle').title='Whiteboard beside PDF '+(active+1);syncWorkspaceTools();
}
// Keep PDF frames mounted so reading position and annotations survive layout changes.
function rememberReadingPositions(){
 if(readingLayoutPending)return;readingLayoutPending=true;
 for(const pane of panes){
  if(window.M4L_PDF_WHITEBOARD.isOpen()&&pane.index!==active)continue;
  try{if(pane.appActive){readingPositions.set(pane.index,{academy:true,...pane.appFrame.contentWindow.M4L_PDF_APP.position()});continue;}const app=pane.frame?.contentWindow.PDFViewerApplication;if(!app?.pdfDocument){readingPositions.delete(pane.index);continue;}const location=app.pdfViewer._location;readingPositions.set(pane.index,{document:app.pdfDocument,page:app.page,destination:location?.pageNumber===app.page?[null,{name:'XYZ'},location.left,location.top,null]:null});}catch{}
 }
}
function restoreReadingPositions(){
 const generation=++readingRestore;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(generation!==readingRestore)return;
  for(const pane of panes){const saved=readingPositions.get(pane.index);if(!saved||!pane.element.getClientRects().length)continue;try{if(saved.academy){pane.appFrame?.contentWindow.M4L_PDF_APP?.restore(saved);continue;}const app=pane.frame.contentWindow.PDFViewerApplication;if(app.pdfDocument===saved.document)app.pdfViewer.scrollPageIntoView({pageNumber:saved.page,destArray:saved.destination,allowNegativeOffset:true});}catch{}}
  readingLayoutPending=false;if(!window.M4L_PDF_WHITEBOARD.isOpen())readingPositions.clear();
 }));
}
window.addEventListener('m4l-whiteboard-layout-start',rememberReadingPositions);
window.addEventListener('m4l-whiteboard-layout-end',restoreReadingPositions);
window.addEventListener('m4l-whiteboard-change',()=>{const open=window.M4L_PDF_WHITEBOARD.isOpen();$('pr-split').disabled=open;$('pr-both').disabled=open;focusLabels();restoreReadingPositions();});
function fullScreen(enabled){
 document.body.classList.toggle('pr-fullscreen',enabled);
 const button=$('pr-fullscreen');button.setAttribute('aria-pressed',String(enabled));
 button.title=enabled?'Exit full screen':'Full screen';positionReaderActions();
 button.setAttribute('aria-label',enabled?'Exit full screen: show Academy headers':'Full screen: hide Academy headers');
}
function positionReaderActions(){
 const normal=document.querySelector('.academy-banners .academy-page-actions'),fallback=document.querySelector('.pr-header nav');
 const host=document.body.classList.contains('pr-fullscreen')?fallback:normal||fallback;
 host.append($('pr-fullscreen'),$('pr-close-reader'));
}
function compactReaderIdentity(){
 const identity=document.querySelector('.academy-brand-details'),brand=identity?.querySelector('.academy-connected-brand'),profile=document.querySelector('.academy-account-bar .academy-profile');
 if(identity&&brand&&profile){const stack=document.createElement('div');stack.className='pr-identity-stack';identity.prepend(stack);stack.append(brand,profile);}
 positionReaderActions();
}
compactReaderIdentity();
function readerKeydown(event){
 if(event.key==='Escape'&&!event.defaultPrevented&&document.body.classList.contains('pr-fullscreen')&&!document.querySelector('dialog[open]')){event.preventDefault();fullScreen(false);$('pr-fullscreen').focus();}
}
function closeDrawer(pane){pane.drawerGeneration++;part(pane,'[data-drawer]').hidden=true;part(pane,'[data-library]').focus();}
function layout(){
 const work=$('pr-workspace'),showSplit=split&&!mobile.matches;
 work.classList.toggle('is-split',showSplit);work.classList.remove('show-both');
 $('pr-divider').hidden=!showSplit;$('pr-tabs').hidden=!showSplit;$('pr-both').hidden=true;
 for(const pane of panes)pane.element.hidden=mobile.matches?pane.index!==active:pane.index===1&&!split;
 $('pr-split').hidden=mobile.matches;$('m4l-teaching-panel-toggle').hidden=mobile.matches;
 $('pr-split').setAttribute('aria-pressed',String(showSplit));$('pr-divider').setAttribute('aria-orientation','vertical');
 focusLabels();
}
function setRatio(value){ratio=Math.max(20,Math.min(80,value));document.documentElement.style.setProperty('--pr-ratio',ratio+'%');$('pr-divider').setAttribute('aria-valuenow',String(Math.round(ratio)));}
function volumeSelector(pane){
 const row=(catalogue||[]).find(row=>row.file===pane.file),select=part(pane,'[data-volume]');select.replaceChildren();
 const volumes=row?catalogue.filter(item=>item.bookId===row.bookId):[];part(pane,'[data-volume-wrap]').hidden=volumes.length<2;
 for(const volume of volumes){const option=document.createElement('option');option.value=volume.file;option.textContent=volume.volumeLabel;select.append(option);}select.value=pane.file;
 if(row){pane.title=row.title;part(pane,'[data-title]').textContent=row.title;}part(pane,'[data-title]').title=pane.title;
}
function updateAddress(pane,page){if(pane.index!==0||!pane.file)return;const params=new URLSearchParams({file:pane.file,title:pane.title});if(['public','personal'].includes(query.get('library')))params.set('library',query.get('library'));for(const key of ['workspace','studentProgram','studentClass','setup'])if(query.has(key))params.set(key,query.get(key));if(page)params.set('page',String(page));history.replaceState(null,'','/academy/pdf-reader/?'+params);}
function openFile(pane,file,title,check=true,page=0){
 if(!ready||check&&!canReplace(pane))return false;
 discardAppEditor(pane);pane.loadGeneration++;
 pane.file=publicPdfFile(file);pane.title=title||'PDF '+(pane.index+1);pane.loaded=false;pane.page=0;pane.pageLabel='';
 part(pane,'[data-title]').textContent=pane.title;part(pane,'[data-empty]').hidden=Boolean(pane.file);volumeSelector(pane);updateBookmarkButtons(pane);
 pane.frame.src='/pdf-viewer/web/viewer.html?academy=1&pane='+pane.index+'&v=107.48&file='+encodeURIComponent(pane.file)+(page?'#page='+page:'');
 part(pane,'[data-drawer]').hidden=true;pane.drawerGeneration++;setActive(pane.index);updateAddress(pane,page);return true;
}
async function viewerApplication(pane){
 const frame=pane.frame;
 if(frame.contentWindow.PDFViewerApplication){await frame.contentWindow.PDFViewerApplication.initializedPromise;return frame.contentWindow.PDFViewerApplication;}
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{frame.removeEventListener('load',loaded);reject(Error('The PDF viewer could not start.'));},15000);
  function loaded(){clearTimeout(timer);frame.contentWindow.PDFViewerApplication?resolve():reject(Error('The PDF viewer could not start.'));}
  frame.addEventListener('load',loaded,{once:true});
 });
 const app=frame.contentWindow.PDFViewerApplication;await app.initializedPromise;return app;
}
async function openBinary(pane,file,generation=++pane.loadGeneration){
 if(generation!==pane.loadGeneration)return false;
 discardAppEditor(pane);pane.file='';pane.loaded=false;volumeSelector(pane);updateBookmarkButtons(pane);
 const app=await viewerApplication(pane),data=new Uint8Array(await file.arrayBuffer());if(generation!==pane.loadGeneration)return false;await app.open({data,originalUrl:file.name});if(generation!==pane.loadGeneration)return false;
 pane.loaded=true;pane.title=file.name;part(pane,'[data-empty]').hidden=true;part(pane,'[data-title]').textContent=file.name;part(pane,'[data-drawer]').hidden=true;volumeSelector(pane);updateBookmarkButtons(pane);setActive(pane.index);
 return true;
}
async function openPublicPdf(source){
 const generation=++panes[0].loadGeneration;
 status('Loading PDF…');
 try{
  const response=await fetch((source.api?window.M4L_CONFIG?.API_BASE||'':'')+source.path,{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('This PDF could not be loaded.');
  const name=(query.get('title')||'Academy PDF').slice(0,240),file=new File([await response.blob()],/\.pdf$/i.test(name)?name:name+'.pdf',{type:'application/pdf'});
  if(await openBinary(panes[0],file,generation))status('');
 }catch(error){
  if(generation!==panes[0].loadGeneration)return;
  status(error.message||'This PDF could not be opened.');const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';retry.onclick=()=>void openPublicPdf(source);$('pr-status').append(' ',retry);
 }
}
async function books(force=false){
 if(catalogue&&!force)return catalogue;if(cataloguePromise)return cataloguePromise;
 cataloguePromise=(async()=>{
  const snapshot=await window.M4L_LIBRARY_CACHE.publicList(force),metadata=new Map(snapshot.data.records.map(row=>[row.id,row]));
  catalogue=snapshot.data.books.filter(book=>!book.resourceType||['EBOOK','PRINTABLE'].includes(book.resourceType)).flatMap(book=>{
   const row=metadata.get(book.id),bookTitle=row?.title||book.title,subject=row?.subject||book.subject||'';
   return (book.volumes?.length?book.volumes:[book]).filter(volume=>volume.pdfUrl).flatMap(volume=>{try{const volumeLabel=book.volumes?.length?volume.label||'Volume '+volume.number:'';return [{bookId:book.id,bookTitle,title:bookTitle+(volumeLabel?' · '+volumeLabel:''),volumeLabel,subject,file:proxy(volume.pdfUrl)}];}catch{return [];}});
  }).sort((a,b)=>a.bookTitle.localeCompare(b.bookTitle));
  for(const pane of panes)volumeSelector(pane);if(snapshot.stale)status(snapshot.message||'Showing saved Library books.');return catalogue;
 })();try{return await cataloguePromise;}finally{cataloguePromise=null;}
}
function chooseBook(pane,rows){
 if(rows.length===1){openFile(pane,rows[0].file,rows[0].title);return;}
 const dialog=$('pr-volume-dialog'),list=$('pr-volume-options');$('pr-volume-book').textContent=rows[0].bookTitle;list.replaceChildren();
 for(const row of rows){const button=document.createElement('button');button.type='button';button.textContent=row.volumeLabel;button.onclick=()=>{if(openFile(pane,row.file,row.title))dialog.close();};list.append(button);}dialog.showModal();
}
function renderBooks(pane){
 const list=part(pane,'[data-books]'),search=part(pane,'[data-search]').value.trim().toLowerCase(),groups=new Map();list.replaceChildren();
 for(const row of catalogue||[])if((row.title+' '+row.subject).toLowerCase().includes(search)){if(!groups.has(row.bookId))groups.set(row.bookId,[]);groups.get(row.bookId).push(row);}
 for(const rows of groups.values()){
  const button=document.createElement('button'),small=document.createElement('small');button.type='button';button.textContent=rows[0].bookTitle;
  const all=catalogue.filter(row=>row.bookId===rows[0].bookId);small.textContent=[all.length>1?all.length+' volumes':'',rows[0].subject].filter(Boolean).join(' · ');button.append(small);button.onclick=()=>chooseBook(pane,all);list.append(button);
 }
 if(!groups.size)list.textContent=search?'No matching PDFs.':'No PDF books are available.';
}
function renderBookmarks(pane){
 if(pane.mode!=='bookmarks')return;part(pane,'[data-sign-in]').hidden=academyBookmarks.signedIn();
 const list=part(pane,'[data-books]'),search=part(pane,'[data-search]').value.trim().toLowerCase();list.replaceChildren();
 if(!academyBookmarks.signedIn()){part(pane,'[data-note]').textContent='Sign in on Academy home to save and view your bookmarks.';return;}
 for(const entry of academyBookmarks.current().filter(entry=>(entry.title+' '+entry.pageLabel+' '+entry.page).toLowerCase().includes(search))){
  const row=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button'),small=document.createElement('small');row.className='pr-bookmark-row';
  open.type='button';open.textContent=entry.title;small.textContent=entry.page?'Page '+(entry.pageLabel||entry.page):'Saved book / volume';open.append(small);
  open.onclick=()=>openFile(pane,entry.file,entry.title,true,entry.page);remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+entry.title+(entry.page?' page '+entry.page:''));
  remove.onclick=async()=>{remove.disabled=true;try{await academyBookmarks.remove(entry.key);status('Bookmark removed.');}catch(error){status(error.message);remove.disabled=false;}};row.append(open,remove);list.append(row);
 }
 if(!list.children.length)list.textContent=search?'No matching bookmarks.':'No bookmarks yet. Open a Library PDF and choose Save book or Bookmark page.';
}
async function drawer(pane,mode='books',force=false){
 setActive(pane.index);pane.mode=mode;part(pane,'[data-sign-in]').hidden=academyBookmarks.signedIn();part(pane,'[data-drawer]').hidden=false;const generation=++pane.drawerGeneration,note=part(pane,'[data-note]');
 for(const button of pane.element.querySelectorAll('[data-drawer-mode]'))button.setAttribute('aria-pressed',String(button.dataset.drawerMode===mode));
 part(pane,'[data-books]').replaceChildren();note.textContent=mode==='books'?'Loading Library…':'Loading your bookmarks…';
 try{
  if(mode==='books')await books(force);else await academyBookmarks.list();if(generation!==pane.drawerGeneration)return;
  note.textContent=mode==='books'?'Choose a book, then a volume where available.':'Saved to your Academy account · available across devices.';
  if(mode==='books')renderBooks(pane);else renderBookmarks(pane);part(pane,'[data-search]').focus();
 }catch(error){if(generation===pane.drawerGeneration)note.textContent=mode==='books'?'Library could not load. Choose Refresh to try again.':error.message;}
}
async function saveBookmark(pane,page,button){
 if(!pane.file||!pane.loaded)return;button.disabled=true;
 const entry={file:pane.file,title:pane.title,page:page?pane.page:0,pageLabel:page?pane.pageLabel:''};
 try{await academyBookmarks.save(entry);status((page?'Page '+(entry.pageLabel||entry.page):'Book / volume')+' bookmarked in your Academy account.');}
 catch(error){status(error.message);}finally{updateBookmarkButtons(pane);}
}
function discardAppEditor(pane){pane.appActive=false;pane.appOpening=false;pane.appFrame?.remove();pane.appFrame=null;pane.appPromise=null;pane.frame.hidden=false;}
async function toggleAppEditor(pane){
 const button=part(pane,'[data-edit]'),open=button.getAttribute('aria-expanded')!=='true';
 if(pane.appActive){const editor=pane.appFrame.contentWindow.M4L_PDF_APP;if(editor.setEditing(open)){button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-pressed',String(open));}return;}
 if(button.disabled)return;const generation=pane.loadGeneration;pane.appOpening=true;button.disabled=true;status('Opening Academy editing tools…');
 try{
  const app=await viewerApplication(pane);if(!app.pdfDocument)throw Error('Choose a PDF before opening the editing tools.');
  const unsaved=Boolean(app._annotationStorageModified),bytes=unsaved?await app.pdfDocument.saveDocument():await app.pdfDocument.getData(),page=app.page;
  if(generation!==pane.loadGeneration)return;
  const frame=document.createElement('iframe');frame.title='Academy PDF '+(pane.index+1)+' editing tools';frame.dataset.appEditor='';frame.hidden=true;pane.appFrame=frame;
  const loaded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Academy editing tools could not start. Please try again.')),20000);frame.addEventListener('load',()=>{clearTimeout(timer);const editor=frame.contentWindow.M4L_PDF_APP;editor?resolve(editor):reject(Error('Academy editing tools could not start. Please try again.'));},{once:true});});
  frame.src='/academy/pdf-compare/?embedded=1&pane='+pane.index+'&v=107.48';pane.frame.after(frame);
  const editor=await loaded;if(generation!==pane.loadGeneration)return;
  frame.contentWindow.addEventListener('keydown',readerKeydown);
  await editor.load({bytes:bytes.slice(),name:/\.pdf$/i.test(pane.title)?pane.title:pane.title+'.pdf',file:pane.file,page,unsaved});
  if(generation!==pane.loadGeneration)return;
  pane.appActive=true;pane.frame.hidden=true;frame.hidden=false;editor.setEditing(true);button.setAttribute('aria-expanded','true');button.setAttribute('aria-pressed','true');pane.page=page;updateBookmarkButtons(pane);status('');
 }catch(error){if(generation===pane.loadGeneration){discardAppEditor(pane);status(error.message||'Academy editing tools could not open. Your PDF is still available.');}}
 finally{if(generation===pane.loadGeneration){pane.appOpening=false;updateBookmarkButtons(pane);}}
}
const readerIcons={
 edit:'<path d="m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4"/>',
 library:'<path d="M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2m0-15c3-3 7-3 10-2v15c-3-1-7-1-10 2V6"/>',
 device:'<path d="M3 7V4h7l2 3h9v14H3V7Zm9 11v-7m-3 3 3-3 3 3"/>',
 bookmarks:'<path d="M5 3h14v19l-7-5-7 5V3Zm4 4h6m-6 4h6"/>',
 'save-book':'<path d="M3 4h13v17H3V4Zm4 0v17M19 3v8m-4-4h8"/>',
 'save-page':'<path d="M4 3h12v19l-6-4-6 4V3Zm15 5V0m-4 4h8"/>'
};
const readerIcon=(kind,label,extra='')=>`<button type="button" class="pr-icon-button" data-${kind} aria-label="${label}" title="${label}" ${extra}><svg viewBox="0 0 24 24" aria-hidden="true">${readerIcons[kind]}</svg></button>`;
for(const pane of panes){
 pane.element.innerHTML=`<header class="pr-pane-header" aria-label="PDF ${pane.index+1} controls"><div class="pr-heading"><div class="pr-title-row"><span class="pr-pane-label">PDF ${pane.index+1}</span><h1 class="pr-pane-title" data-title>PDF ${pane.index+1}</h1><label class="pr-volume" data-volume-wrap hidden><select data-volume aria-label="Choose volume for PDF ${pane.index+1}"></select></label></div></div><div class="pr-document-actions"><div class="pr-pane-tools">${readerIcon('edit','Edit annotations','aria-expanded="false"')}${readerIcon('library','Library')}${readerIcon('device','Open file')}${readerIcon('bookmarks','My bookmarks')}</div><div class="pr-bookmark-tools">${readerIcon('save-book','Save book','disabled')}${readerIcon('save-page','Bookmark page','disabled')}<button type="button" data-focus aria-pressed="false" aria-controls="pr-workspace" hidden>Focus</button></div></div><input type="file" accept="application/pdf,.pdf" data-file hidden></header><iframe title="PDF ${pane.index+1} reader" data-frame></iframe><p class="pr-empty" data-empty>Choose Library or Open file to read a PDF.</p><aside class="pr-drawer" data-drawer aria-label="Library and bookmarks for PDF ${pane.index+1}" hidden><div class="pr-drawer-head"><h2>Academy Library</h2><button type="button" data-close aria-label="Close Library drawer">Close</button></div><nav class="pr-drawer-tabs" aria-label="Books and bookmarks"><button type="button" data-drawer-mode="books" aria-pressed="true">Books &amp; volumes</button><button type="button" data-drawer-mode="bookmarks" aria-pressed="false">My bookmarks</button></nav><label>Search<input type="search" data-search placeholder="Title, volume or page" autocomplete="off"></label><button type="button" data-refresh>↻ Refresh</button><p class="pr-drawer-note" data-note></p><a href="/academy/" target="_blank" rel="noopener" class="pr-sign-in" data-sign-in>Academy home / Sign in ↗</a><div class="pr-book-list" data-books></div></aside>`;
 pane.header=part(pane,'.pr-pane-header');pane.header.id='pr-controls-'+pane.index;pane.header.addEventListener('pointerdown',()=>setActive(pane.index));
 new ResizeObserver(()=>{const height=pane.header.getBoundingClientRect().height;if(height)pane.element.style.setProperty('--pr-controls-height',height+'px');}).observe(pane.header);
 pane.frame=part(pane,'[data-frame]');part(pane,'[data-edit]').onclick=()=>void toggleAppEditor(pane);pane.frame.addEventListener('load',()=>{part(pane,'[data-edit]').setAttribute('aria-expanded','false');part(pane,'[data-edit]').setAttribute('aria-pressed','false');});part(pane,'[data-library]').onclick=()=>void drawer(pane);
 part(pane,'[data-bookmarks]').onclick=()=>void drawer(pane,'bookmarks');
 part(pane,'[data-focus]').onclick=()=>{if(!split||window.M4L_PDF_WHITEBOARD.isOpen())return;rememberReadingPositions();setActive(pane.index);$('pr-workspace').classList.toggle('is-focused');focusLabels();restoreReadingPositions();};
 part(pane,'[data-refresh]').onclick=()=>void drawer(pane,pane.mode,true);part(pane,'[data-search]').oninput=()=>pane.mode==='books'?renderBooks(pane):renderBookmarks(pane);
 for(const button of pane.element.querySelectorAll('[data-drawer-mode]'))button.onclick=()=>void drawer(pane,button.dataset.drawerMode);
 part(pane,'[data-close]').onclick=()=>closeDrawer(pane);part(pane,'[data-drawer]').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeDrawer(pane);}};
 part(pane,'[data-save-book]').onclick=event=>void saveBookmark(pane,false,event.currentTarget);part(pane,'[data-save-page]').onclick=event=>void saveBookmark(pane,true,event.currentTarget);
 part(pane,'[data-volume]').onchange=event=>{const row=catalogue?.find(row=>row.file===event.target.value);if(!row||!openFile(pane,row.file,row.title))event.target.value=pane.file;};
 pane.element.addEventListener('pointerdown',()=>setActive(pane.index));
 part(pane,'[data-device]').onclick=()=>part(pane,'[data-file]').click();
 part(pane,'[data-file]').onchange=async event=>{
  const file=event.target.files[0];if(!file||!canReplace(pane)){event.target.value='';return;}
  try{await openBinary(pane,file);status('Device PDFs can be annotated and downloaded. Academy bookmarks are for public Library PDFs.');}
  catch{status('This PDF could not be opened. Choose another file.');}finally{event.target.value='';}
 };
}

$('pr-fullscreen').onclick=()=>fullScreen(!document.body.classList.contains('pr-fullscreen'));
window.addEventListener('keydown',readerKeydown);
$('pr-volume-cancel').onclick=()=>$('pr-volume-dialog').close();
window.addEventListener('m4l-pdf-bookmarks-change',()=>{for(const pane of panes)if(pane.mode==='bookmarks'&&!part(pane,'[data-drawer]').hidden){pane.drawerGeneration++;renderBookmarks(pane);}});
window.addEventListener('blur',()=>{const pane=panes.find(pane=>pane.frame===document.activeElement||pane.appFrame===document.activeElement);if(pane)setActive(pane.index);});
$('pr-split').onclick=()=>{if(mobile.matches)return;split=!split;$('pr-workspace').classList.remove('is-focused');if(!split)setActive(0);layout();};
$('pr-both').onclick=()=>{$('pr-workspace').classList.toggle('show-both');$('pr-workspace').classList.remove('is-focused');layout();};
for(const pane of panes){const tab=$('pr-tab-'+pane.index);tab.onclick=()=>setActive(pane.index);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setActive(event.key==='Home'?0:event.key==='End'?1:1-active);$('pr-tab-'+active).focus();}};}
const divider=$('pr-divider');divider.onpointerdown=event=>{event.preventDefault();divider.setPointerCapture(event.pointerId);document.body.classList.add('is-dragging');};divider.onpointermove=event=>{if(!divider.hasPointerCapture(event.pointerId))return;const rect=$('pr-workspace').getBoundingClientRect();setRatio(100*(mobile.matches?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width));};const stop=()=>document.body.classList.remove('is-dragging');divider.onpointerup=stop;divider.onpointercancel=stop;divider.onlostpointercapture=stop;divider.ondblclick=()=>setRatio(50);divider.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){event.preventDefault();setRatio(event.key==='Home'?50:ratio+(['ArrowRight','ArrowDown'].includes(event.key)?5:-5));}};
mobile.addEventListener('change',()=>{rememberReadingPositions();layout();restoreReadingPositions();});window.addEventListener('beforeunload',event=>{if(panes.some(changed)||window.M4L_PDF_WHITEBOARD.hasUnsaved()){event.preventDefault();event.returnValue='';}});
try{const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/pdf-tools/defaults`,{cache:'no-store'}),result=await response.json();if(!response.ok||!result.success)throw Error();defaults=normalizePdfTools(result.settings);status('');}catch{status('Academy defaults could not load. Standard PDF tools are available.');}
ready=true;const page=Number(query.get('page')),startPage=Number.isInteger(page)&&page>0&&page<=100000?page:0;
for(const pane of panes)openFile(pane,pane.index===0?publicPdfFile(query.get('file')):'',pane.index===0?query.get('title')||'PDF 1':'PDF 2',false,pane.index===0?startPage:0);
setActive(0);layout();
try{const source=publicPdfSource(query);if(source)await openPublicPdf(source);}catch(error){status(error.message);}
if(!query.has('announcement')&&!query.has('document')){try{await books();const group=query.get('book')&&catalogue.filter(row=>row.bookId===query.get('book'));if(group?.length&&!query.get('file'))chooseBook(panes[0],group);else if(query.get('book')&&!query.get('file'))status('This book could not be found. Open Library to choose a PDF.');}catch{if(query.get('book'))status('The volume list could not load. Open Library and choose Refresh to try again.');}}
if(query.get('bookmarks')==='1')await drawer(panes[0],'bookmarks');
