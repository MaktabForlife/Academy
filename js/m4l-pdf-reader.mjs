import {PDF_TOOL_DEFAULTS,normalizePdfTools} from './m4l-pdf-tools-model.mjs?v=106.49';
import {publicPdfFile} from './m4l-pdf-bookmarks-model.mjs?v=106.80';
import {academyBookmarks} from './m4l-pdf-bookmarks.mjs?v=106.80';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),mobile=matchMedia('(max-width:750px)');
const panes=[0,1].map(index=>({index,element:$('pr-pane-'+index),choices:{},frame:null,loaded:false,file:'',title:'',page:0,mode:'books',drawerGeneration:0}));
let defaults={...PDF_TOOL_DEFAULTS},split=false,active=0,ratio=50,catalogue=null,cataloguePromise=null,ready=false;
const status=text=>{$('pr-status').textContent=text;},part=(pane,selector)=>pane.element.querySelector(selector);
function proxy(url){const file=publicPdfFile('/pdf-file/'+btoa(String.fromCharCode(...new TextEncoder().encode(url))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''));if(!file)throw Error('This PDF source is unavailable.');return file;}
function updateBookmarkButtons(pane){for(const button of pane.element.querySelectorAll('[data-save-book],[data-save-page]'))button.disabled=!pane.loaded||!pane.file;part(pane,'[data-save-page]').textContent=pane.page?'Bookmark page '+(pane.pageLabel||pane.page):'Bookmark page';}
window.M4L_PDF_READER={
 settings:index=>({...defaults,...panes[Number(index)]?.choices}),
 remember:(index,changes)=>{const pane=panes[Number(index)];if(pane)try{pane.choices=normalizePdfTools({...defaults,...pane.choices,...changes},{session:true});}catch{}},
 location:(index,source,position)=>{const pane=panes[Number(index)];if(!pane||source!==pane.frame?.contentWindow||!pane.file||publicPdfFile(position.file)!==pane.file)return;pane.loaded=true;pane.page=position.page;pane.pageLabel=position.pageLabel||'';updateBookmarkButtons(pane);}
};
document.addEventListener('webviewerloaded',event=>{const source=event.detail?.source,pane=panes.find(item=>item.frame?.contentWindow===source);if(pane){const settings=window.M4L_PDF_READER.settings(pane.index);source.PDFViewerApplicationOptions.set('highlightEditorColors',`Academy=${settings.highlightColor},yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F`);}});
function changed(pane){try{return Boolean(pane.frame.contentWindow.PDFViewerApplication?._annotationStorageModified);}catch{return false;}}
function libraryReturn(){
 if(query.get('library')==='public')return '/academy/open-library/';
 if(query.get('library')==='personal')return '/academy/library/';
 try{const referrer=new URL(document.referrer);if(referrer.origin===location.origin&&['/academy/open-library/','/academy/library/'].includes(referrer.pathname))return referrer.pathname;}catch{}
 return academyBookmarks.signedIn()?'/academy/library/':'/academy/open-library/';
}
$('pr-close-reader').href=libraryReturn();
function canReplace(pane){return !changed(pane)||confirm('This PDF has unsaved annotations. Download a copy before replacing it. Continue?');}
function setActive(index){active=index;for(const pane of panes){pane.element.classList.toggle('is-active',pane.index===index);$('pr-tab-'+pane.index).setAttribute('aria-selected',String(pane.index===index));$('pr-tab-'+pane.index).tabIndex=pane.index===index?0:-1;}}
function focusLabels(){const focused=$('pr-workspace').classList.contains('is-focused');for(const pane of panes)part(pane,'[data-focus]').textContent=focused?'Restore split':'Focus';}
function closeDrawer(pane){pane.drawerGeneration++;part(pane,'[data-drawer]').hidden=true;part(pane,'[data-library]').focus();}
function layout(){const work=$('pr-workspace');work.classList.toggle('is-split',split);$('pr-divider').hidden=!split;$('pr-tabs').hidden=!split;$('pr-pane-1').hidden=!split;$('pr-both').hidden=!split||!mobile.matches;$('pr-split').setAttribute('aria-pressed',String(split));$('pr-divider').setAttribute('aria-orientation',mobile.matches?'horizontal':'vertical');focusLabels();if(!mobile.matches)work.classList.remove('show-both');$('pr-both').setAttribute('aria-pressed',String(work.classList.contains('show-both')));}
function setRatio(value){ratio=Math.max(20,Math.min(80,value));document.documentElement.style.setProperty('--pr-ratio',ratio+'%');$('pr-divider').setAttribute('aria-valuenow',String(Math.round(ratio)));}
function volumeSelector(pane){
 const row=(catalogue||[]).find(row=>row.file===pane.file),select=part(pane,'[data-volume]');select.replaceChildren();
 const volumes=row?catalogue.filter(item=>item.bookId===row.bookId):[];part(pane,'[data-volume-wrap]').hidden=volumes.length<2;
 for(const volume of volumes){const option=document.createElement('option');option.value=volume.file;option.textContent=volume.volumeLabel;select.append(option);}select.value=pane.file;
 if(row){pane.title=row.title;part(pane,'[data-title]').textContent=row.title;}
}
function updateAddress(pane,page){if(pane.index!==0||!pane.file)return;const params=new URLSearchParams({file:pane.file,title:pane.title});if(['public','personal'].includes(query.get('library')))params.set('library',query.get('library'));if(page)params.set('page',String(page));history.replaceState(null,'','/academy/pdf-reader/?'+params);}
function openFile(pane,file,title,check=true,page=0){
 if(!ready||check&&!canReplace(pane))return false;
 pane.file=publicPdfFile(file);pane.title=title||'PDF '+(pane.index+1);pane.loaded=false;pane.page=0;pane.pageLabel='';
 part(pane,'[data-title]').textContent=pane.title;part(pane,'[data-empty]').hidden=Boolean(pane.file);volumeSelector(pane);updateBookmarkButtons(pane);
 pane.frame.src='/pdf-viewer/web/viewer.html?academy=1&pane='+pane.index+'&v=106.80&file='+encodeURIComponent(pane.file)+(page?'#page='+page:'');
 part(pane,'[data-drawer]').hidden=true;pane.drawerGeneration++;setActive(pane.index);updateAddress(pane,page);return true;
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
for(const pane of panes){
 pane.element.innerHTML=`<header class="pr-pane-header"><div class="pr-heading"><h1 class="pr-pane-title" data-title>PDF ${pane.index+1}</h1><label class="pr-volume" data-volume-wrap hidden>Volume <select data-volume aria-label="Choose volume for PDF ${pane.index+1}"></select></label></div><div class="pr-pane-tools"><button type="button" data-library>Library</button><button type="button" data-device>Open file</button><button type="button" data-focus>Focus</button></div><input type="file" accept="application/pdf,.pdf" data-file hidden></header><div class="pr-bookmark-bar"><button type="button" data-save-book disabled>Save book</button><button type="button" data-save-page disabled>Bookmark page</button></div><iframe title="PDF ${pane.index+1} reader" data-frame></iframe><p class="pr-empty" data-empty>Choose Library or Open file to read a PDF.</p><aside class="pr-drawer" data-drawer aria-label="Library and bookmarks for PDF ${pane.index+1}" hidden><div class="pr-drawer-head"><h2>Academy Library</h2><button type="button" data-close aria-label="Close Library drawer">Close</button></div><nav class="pr-drawer-tabs" aria-label="Books and bookmarks"><button type="button" data-drawer-mode="books" aria-pressed="true">Books &amp; volumes</button><button type="button" data-drawer-mode="bookmarks" aria-pressed="false">My bookmarks</button></nav><label>Search<input type="search" data-search placeholder="Title, volume or page" autocomplete="off"></label><button type="button" data-refresh>↻ Refresh</button><p class="pr-drawer-note" data-note></p><a href="/academy/" target="_blank" rel="noopener" class="pr-sign-in" data-sign-in>Academy home / Sign in ↗</a><div class="pr-book-list" data-books></div></aside>`;
 pane.frame=part(pane,'[data-frame]');part(pane,'[data-library]').onclick=()=>void drawer(pane);
 part(pane,'[data-refresh]').onclick=()=>void drawer(pane,pane.mode,true);part(pane,'[data-search]').oninput=()=>pane.mode==='books'?renderBooks(pane):renderBookmarks(pane);
 for(const button of pane.element.querySelectorAll('[data-drawer-mode]'))button.onclick=()=>void drawer(pane,button.dataset.drawerMode);
 part(pane,'[data-close]').onclick=()=>closeDrawer(pane);part(pane,'[data-drawer]').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeDrawer(pane);}};
 part(pane,'[data-save-book]').onclick=event=>void saveBookmark(pane,false,event.currentTarget);part(pane,'[data-save-page]').onclick=event=>void saveBookmark(pane,true,event.currentTarget);
 part(pane,'[data-volume]').onchange=event=>{const row=catalogue?.find(row=>row.file===event.target.value);if(!row||!openFile(pane,row.file,row.title))event.target.value=pane.file;};
 part(pane,'[data-focus]').onclick=()=>{setActive(pane.index);if(split)$('pr-workspace').classList.toggle('is-focused');focusLabels();};
 part(pane,'[data-device]').onclick=()=>part(pane,'[data-file]').click();
 part(pane,'[data-file]').onchange=async event=>{
  const file=event.target.files[0];if(!file||!canReplace(pane)){event.target.value='';return;}
  try{pane.file='';pane.loaded=false;volumeSelector(pane);updateBookmarkButtons(pane);const app=pane.frame.contentWindow.PDFViewerApplication;await app.initializedPromise;await app.open({data:new Uint8Array(await file.arrayBuffer()),originalUrl:file.name});pane.file='';pane.loaded=true;pane.title=file.name;part(pane,'[data-empty]').hidden=true;part(pane,'[data-title]').textContent=file.name;part(pane,'[data-drawer]').hidden=true;volumeSelector(pane);updateBookmarkButtons(pane);setActive(pane.index);status('Device PDFs can be annotated and downloaded. Academy bookmarks are for public Library PDFs.');}
  catch{status('This PDF could not be opened. Choose another file.');}finally{event.target.value='';}
 };
}
$('pr-volume-cancel').onclick=()=>$('pr-volume-dialog').close();
$('pr-bookmarks').onclick=()=>void drawer(panes[active],'bookmarks');
window.addEventListener('m4l-pdf-bookmarks-change',()=>{for(const pane of panes)if(pane.mode==='bookmarks'&&!part(pane,'[data-drawer]').hidden){pane.drawerGeneration++;renderBookmarks(pane);}});
$('pr-split').onclick=()=>{split=!split;$('pr-workspace').classList.remove('is-focused');if(!split)setActive(0);layout();};
$('pr-both').onclick=()=>{$('pr-workspace').classList.toggle('show-both');$('pr-workspace').classList.remove('is-focused');layout();};
for(const pane of panes){const tab=$('pr-tab-'+pane.index);tab.onclick=()=>setActive(pane.index);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setActive(event.key==='Home'?0:event.key==='End'?1:1-active);$('pr-tab-'+active).focus();}};}
const divider=$('pr-divider');divider.onpointerdown=event=>{event.preventDefault();divider.setPointerCapture(event.pointerId);document.body.classList.add('is-dragging');};divider.onpointermove=event=>{if(!divider.hasPointerCapture(event.pointerId))return;const rect=$('pr-workspace').getBoundingClientRect();setRatio(100*(mobile.matches?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width));};const stop=()=>document.body.classList.remove('is-dragging');divider.onpointerup=stop;divider.onpointercancel=stop;divider.onlostpointercapture=stop;divider.ondblclick=()=>setRatio(50);divider.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){event.preventDefault();setRatio(event.key==='Home'?50:ratio+(['ArrowRight','ArrowDown'].includes(event.key)?5:-5));}};
mobile.addEventListener('change',layout);window.addEventListener('beforeunload',event=>{if(panes.some(changed)){event.preventDefault();event.returnValue='';}});
try{const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/pdf-tools/defaults`,{cache:'no-store'}),result=await response.json();if(!response.ok||!result.success)throw Error();defaults=normalizePdfTools(result.settings);status('');}catch{status('Academy defaults could not load. Standard PDF tools are available.');}
ready=true;const page=Number(query.get('page')),startPage=Number.isInteger(page)&&page>0&&page<=100000?page:0;
for(const pane of panes)openFile(pane,pane.index===0?publicPdfFile(query.get('file')):'',pane.index===0?query.get('title')||'PDF 1':'PDF 2',false,pane.index===0?startPage:0);
setActive(0);layout();
try{await books();const group=query.get('book')&&catalogue.filter(row=>row.bookId===query.get('book'));if(group?.length&&!query.get('file'))chooseBook(panes[0],group);else if(query.get('book')&&!query.get('file'))status('This book could not be found. Open Library to choose a PDF.');}catch{if(query.get('book'))status('The volume list could not load. Open Library and choose Refresh to try again.');}
if(query.get('bookmarks')==='1')await drawer(panes[0],'bookmarks');
