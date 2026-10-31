// Local review tools only. Text is kept as text; no HTML or production writes.
import {applyHomepageReview} from './homepage-review.js';
const storageKey='academy-workspace-homepage-v1';
const selectors={circle:'.hub-academy-centre',hifz:'[data-home-area="hifz"]',tafseer:'[data-home-area="tafseer"]',academy:'[data-home-area="academy"]',mothers:'[data-home-area="mothers"]','arabic-adventures':'[data-home-area="arabic-adventures"]'};
const empty=()=>({version:1,text:{},positions:{full:{},compact:{}}});
let draft=empty(),mode='',drag=null,suppressClick=null,refreshQueued=false;
const originals=new Map();
try{
 const stored=JSON.parse(localStorage.getItem(storageKey));
 if(stored?.version===1){
  for(const [key,value] of Object.entries(stored.text||{}))if(typeof value==='string'&&value.length<20000)draft.text[key]=value;
  for(const profile of ['full','compact'])for(const [key,p] of Object.entries(stored.positions?.[profile]||{}))if(Object.hasOwn(selectors,key)&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=2&&Math.abs(p.y)<=2)draft.positions[profile][key]={x:p.x,y:p.y};
 }
}catch{}

const toolbar=document.createElement('aside');
toolbar.className='preview-home-editor';toolbar.setAttribute('aria-label','Homepage editing tools');
toolbar.innerHTML='<strong>Homepage editor</strong><div class="preview-editor-actions"><button type="button" data-editor="text" aria-pressed="false">Edit text</button><button type="button" data-editor="move" aria-pressed="false">Move blocks</button><button type="button" data-editor="save">Save locally</button><button type="button" data-editor="export">Export edits</button><button type="button" data-editor="reset">Reset edits</button><button type="button" data-editor="done" hidden>Done</button></div><p role="status" aria-live="polite">Changes stay in this browser. The live website is unchanged.</p>';
document.body.append(toolbar);
const status=message=>{toolbar.querySelector('[role="status"]').textContent=message;};
function save(){
 try{localStorage.setItem(storageKey,JSON.stringify(draft));status('Saved in this browser. Export edits to share them.');return true;}
 catch{status('This browser could not save. Use Export edits to keep your changes.');return false;}
}
function profile(){return window.AcademyHomepageLayout?.profile==='compact'?'compact':'full';}
function nodeKey(node,root){
 const scope=node.parentElement.closest('[data-preview-text-scope]');
 if(scope)root=scope;
 const path=[];
 for(let current=node;current&&current!==root;current=current.parentNode)path.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes,current));
 return (scope?'review:'+scope.dataset.previewTextScope+':':'')+path.join('.');
}
function refresh(){
 refreshQueued=false;
 const root=document.querySelector('#experience');if(!root)return;
 const homepage=Boolean(root.querySelector('.single-circle-home #animated-hub'));
 toolbar.hidden=!homepage;
 if(!homepage){mode='';document.documentElement.dataset.previewEditMode='';return;}
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){
  const parent=node.parentElement;
  if(!node.textContent.trim()||parent.closest('[data-preview-copy],button,script,style,svg,dialog,#free-course-reel,#memorisation-reel'))continue;
  if(!parent.closest('h1,h2,h3,h4,p,[lang="ar"],.eyebrow,.meta,.brand-name,.brand-byline'))continue;
  const key=nodeKey(node,root),span=document.createElement('span');
  originals.set(key,node.textContent);span.dataset.previewCopy=key;
  span.textContent=Object.hasOwn(draft.text,key)?draft.text[key]:node.textContent;
  node.replaceWith(span);
 }
 // Apply prior browser edits before moving their existing nodes. This keeps
 // the original draft keys stable when the header is rearranged.
 applyHomepageReview(root);
 window.AcademyHomepageLayout?.refresh();
 for(const element of root.querySelectorAll('[data-preview-copy]')){
  element.contentEditable=mode==='text'?'plaintext-only':'false';
  if(mode==='text')element.setAttribute('aria-label','Edit text: '+element.textContent.trim());else element.removeAttribute('aria-label');
 }
 const hub=root.querySelector('#animated-hub');
 if(hub)for(const [key,selector]of Object.entries(selectors)){
  const block=hub.querySelector(selector);if(!block)continue;
  block.dataset.previewBlock=key;
  const position=draft.positions[profile()][key]||{x:0,y:0};
  block.style.setProperty('--preview-move-x',position.x*hub.offsetWidth+'px');
  block.style.setProperty('--preview-move-y',position.y*hub.offsetHeight+'px');
  // Anchors and images otherwise start the browser's native HTML drag,
  // which cancels the pointer stream before our layout drag can begin.
  for(const item of [block,...block.querySelectorAll('a,img')]){
   if(mode==='move'){
    if(!item.hasAttribute('data-preview-draggable'))item.dataset.previewDraggable=item.getAttribute('draggable')??'missing';
    item.setAttribute('draggable','false');
   }else if(item.hasAttribute('data-preview-draggable')){
    if(item.dataset.previewDraggable==='missing')item.removeAttribute('draggable');else item.setAttribute('draggable',item.dataset.previewDraggable);
    delete item.dataset.previewDraggable;
   }
  }
  if(mode==='move'){
   if(!block.hasAttribute('data-preview-tabindex'))block.dataset.previewTabindex=block.getAttribute('tabindex')??'missing';
   block.tabIndex=0;block.setAttribute('aria-description','Drag to move, or use arrow keys. Hold Shift for larger steps.');
  }else if(block.hasAttribute('data-preview-tabindex')){
   if(block.dataset.previewTabindex==='missing')block.removeAttribute('tabindex');else block.setAttribute('tabindex',block.dataset.previewTabindex);
   delete block.dataset.previewTabindex;block.removeAttribute('aria-description');
  }
 }
}
function scheduleRefresh(){if(!refreshQueued){refreshQueued=true;requestAnimationFrame(refresh);}}
function setMode(value){
 if(value==='move'&&!matchMedia('(min-width:821px)').matches){status('Use a wider desktop window to arrange the circle blocks.');return;}
 mode=value;document.documentElement.dataset.previewEditMode=mode;
 for(const button of toolbar.querySelectorAll('[aria-pressed]'))button.setAttribute('aria-pressed',String(button.dataset.editor===mode));
 toolbar.querySelector('[data-editor="done"]').hidden=!mode;
 status(mode==='text'?'Click any outlined text to edit. Changes save automatically.':mode==='move'?'Drag the circle or a block. Arrow keys also move a focused block. Changes save automatically.':'Changes stay in this browser. The live website is unchanged.');
 refresh();
}
toolbar.addEventListener('click',event=>{
 const action=event.target.closest('[data-editor]')?.dataset.editor;if(!action)return;
 if(['text','move'].includes(action)){setMode(mode===action?'':action);return;}
 if(action==='done'){setMode('');save();return;}
 if(action==='save'){save();return;}
 if(action==='reset'){
  draft=empty();for(const node of document.querySelectorAll('[data-preview-copy]'))if(originals.has(node.dataset.previewCopy))node.textContent=originals.get(node.dataset.previewCopy);
  refresh();save();status('Restored the original homepage text and positions.');return;
 }
 if(action==='export'){
  save();
  const text=Object.entries(draft.text).map(([key,value])=>({key,original:originals.get(key)||'',text:value}));
  const payload={kind:'umm-abbad-homepage-ui-draft',...draft,textEdits:text,baseLayoutId:window.AcademyHomepageLayout?.id,exportedAt:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight}};
  const href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=href;link.download='umm-abbad-homepage-edits.json';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
  status('Exported your text and layout edits.');
 }
});
document.addEventListener('input',event=>{
 const element=event.target.closest('[data-preview-copy]');if(!element||mode!=='text')return;
 const key=element.dataset.previewCopy,value=element.innerText;
 if(value===originals.get(key))delete draft.text[key];else draft.text[key]=value;
 save();
});
// Only an actual edit/drag consumes a click. Menus and navigation stay usable.
document.addEventListener('click',event=>{
 const target=event.target;
 if((mode==='text'&&target.closest('[data-preview-copy]'))||(suppressClick&&target.closest('[data-preview-block]')===suppressClick)){
  event.preventDefault();event.stopImmediatePropagation();suppressClick=null;return;
 }
 if(mode&&target.closest('#experience a,#experience button,[data-action]')){setMode('');save();}
},true);
document.addEventListener('pointerdown',event=>{
 const block=event.target.closest('[data-preview-block]');
 if(mode!=='move'||!block||event.button!==0)return;
 const hub=block.closest('#animated-hub'),scale=hub.getBoundingClientRect().width/hub.offsetWidth;
 drag={block,hub,scale,x:event.clientX,y:event.clientY,start:{...(draft.positions[profile()][block.dataset.previewBlock]||{x:0,y:0})},profile:profile(),moved:false};
});
document.addEventListener('dragstart',event=>{
 if(mode==='move'&&event.target.closest('[data-preview-block]'))event.preventDefault();
},true);
document.addEventListener('pointermove',event=>{
 if(!drag)return;
 const {block,hub,scale,start,x,y}=drag;
 if(!drag.moved){
  if(Math.hypot(event.clientX-x,event.clientY-y)<5)return;
  drag.moved=true;block.focus({preventScroll:true});block.setPointerCapture(event.pointerId);block.classList.add('preview-block-dragging');
 }
 event.preventDefault();
 draft.positions[drag.profile][block.dataset.previewBlock]={x:Math.max(-2,Math.min(2,start.x+(event.clientX-x)/scale/hub.offsetWidth)),y:Math.max(-2,Math.min(2,start.y+(event.clientY-y)/scale/hub.offsetHeight))};
 refresh();
});
function endDrag(){if(!drag)return;const moved=drag.moved;drag.block.classList.remove('preview-block-dragging');suppressClick=moved?drag.block:null;drag=null;if(moved){save();setTimeout(()=>{suppressClick=null;},0);}}
document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&mode){setMode('');save();return;}
 const block=event.target.closest('[data-preview-block]');
 if(mode!=='move'||!block||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
 event.preventDefault();
 const hub=block.closest('#animated-hub'),positions=draft.positions[profile()],p=positions[block.dataset.previewBlock]||{x:0,y:0},step=event.shiftKey?10:1;
 const next={x:p.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)/hub.offsetWidth,y:p.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)/hub.offsetHeight};
 positions[block.dataset.previewBlock]={x:Math.max(-2,Math.min(2,next.x)),y:Math.max(-2,Math.min(2,next.y))};refresh();save();
});
new MutationObserver(scheduleRefresh).observe(document.querySelector('#experience'),{childList:true,subtree:true});
window.addEventListener('resize',scheduleRefresh);
refresh();
