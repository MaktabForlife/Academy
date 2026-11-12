import {esc,clone} from '/shared/model.mjs';
import {state,request,ready,end as closeSession} from './session.mjs';
const $=id=>document.getElementById(id);
let ended=false,record=null,websites=[],studio=null,pending=new Map(),identity='',opening=false;
const base='/api/admin/platform/course-websites/',query=new URLSearchParams(location.search);let selection=query.get('activityKey')?{activityKey:query.get('activityKey'),...(query.get('surahId')?{surahId:query.get('surahId')}:{})}:null;
const active=()=>!ended&&state.active;
function end(message='Your Academy account changed. Reopen Website builder from Admin.'){
 ended=true;closeSession(message);studio?.clearRemote();record=null;websites=[];pending.clear();$('website-editor').hidden=true;$('website-list').replaceChildren();$('website-list-panel').hidden=false;$('website-list-status').textContent=message;
}
async function api(path,input={},blob=false,bytes){return request(path.slice(base.length),{...(selection||{}),...input},blob,bytes);}
async function mutate(action,input){
 const key=action+JSON.stringify(input);if(!pending.has(key))pending.set(key,{...input,operationId:crypto.randomUUID()});
 const result=await api(base+action,pending.get(key));pending.delete(key);return result;
}
function renderList(){const search=$('website-search').value.trim().toLowerCase(),rows=websites.filter(r=>r.name.toLowerCase().includes(search));$('website-list').innerHTML=rows.map(row=>`<article class="website-list-card"><span class="overline">${row.hasDraft?'SAVED WEBSITE':row.existing?'EXISTING COURSE WEBSITE':'COURSE TEMPLATE'}</span><h2>${esc(row.name)}</h2><p>${row.enabled?row.hasDraft?'Draft available to edit':row.existing?'Open the current Al Kahf lessons in the editor.':'Start with the Al Kahf course layout.':'Website withdrawn · draft retained'}</p><button class="primary" data-open-website="${esc(encodeURIComponent(JSON.stringify({activityKey:row.activityKey,...(row.surahId?{surahId:row.surahId}:{})})))}">${row.hasDraft||row.existing?'Open website to edit':'Create course website'} →</button></article>`).join('')||'<p>No courses match this view.</p>';}
async function list(){
 if(studio&&!studio.canLeave())return;studio?.clearRemote();record=null;$('website-editor').hidden=true;$('website-list-panel').hidden=false;$('website-list-status').textContent='Loading your course websites…';
 try{const result=await api(base+'list');websites=result.websites;renderList();$('website-list-status').textContent=result.truncated?'Showing the first 500 courses.':websites.length+' courses available';}catch(error){if(active())$('website-list-status').textContent=error.message;}
}
async function open(scope){
 const activityKey=scope.activityKey;selection=scope;
 if(opening||studio&&!studio.canLeave())return;opening=true;$('website-editor').inert=true;$('website-list-status').textContent='Opening the course editor…';
 try{const next=await api(base+'get',{activityKey});if(!active())return;record=next;$('website-import-prepared').hidden=!next.preparedCopyAvailable;$('selected-course-name').textContent=next.name;$('website-list-panel').hidden=true;$('website-editor').hidden=false;if(studio)await studio.openRemote();else studio=await import('/shared/studio.mjs');}
 catch(error){if(active()){$('website-editor').hidden=true;$('website-list-panel').hidden=false;$('website-list-status').textContent=error.message;}}
 finally{opening=false;if(active())$('website-editor').inert=false;}
}
window.M4L_COURSE_WEBSITES={canLeave:()=>!studio||studio.canLeave()};
window.COURSE_WEBSITE_ADMIN={nativeMedia:true,attachMedia:()=>document.getElementById('attach-academy-material').click(),async attachReference(reference){const saved=await mutate('attach',{...reference,assetId:crypto.randomUUID()});record.assets.push(saved.asset);return saved.asset;},get surahId(){return selection?.surahId||null;},list,revision:()=>record?.revision||0,ownerKey:()=>identity,
 drafts:async()=>record?[clone(record.document)]:[],
 async save(document){const selected=record;if(!selected)throw Error('Choose a course website.');const result=await mutate('save',{activityKey:selected.activityKey,revision:selected.revision,document});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.document=clone(document);},
 async assets(){const selected=record,result=[];if(!selected)return result;for(const asset of selected.assets){const blob=asset.type.startsWith('image/')?await api(base+'asset',{activityKey:selected.activityKey,assetId:asset.id},true):null;if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');result.push({...asset,courseId:selected.document.id,blob});}return result;},
 async assetBlob(id){if(!record)throw Error('Choose a Course.');return api(base+'asset',{activityKey:record.activityKey,assetId:id},true);},
 async download(id){const asset=record.assets.find(a=>a.id===id);if(!asset)return;const blob=await this.assetBlob(id),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=asset.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);},
 async upload(asset){const selected=record;if(!selected)throw Error('Choose a course website.');const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await asset.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');const input={activityKey:selected.activityKey,assetId:asset.id,filename:asset.name,type:asset.type,size:asset.size,sha256,operationId:crypto.randomUUID()};const result=await api(base+'upload',input,false,asset.blob);if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.assets.push(result.asset);},
 async publish(){const selected=record,result=await mutate('publish',{activityKey:selected.activityKey,revision:selected.revision});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.enabled=true;},
 async withdraw(){if(!confirm('Withdraw this website from students? Its saved draft and existing course records will be kept.'))return;const selected=record,result=await mutate('withdraw',{activityKey:selected.activityKey,revision:selected.revision});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.enabled=false;return true;}
};
$('website-import-prepared').addEventListener('click',async()=>{
 const button=$('website-import-prepared'),selected=record;if(!selected||!active()||opening)return;
 if(studio&&!studio.canLeave())return;
 button.disabled=true;$('save-status').textContent='Importing prepared lessons and course files…';
 try{const copy=await api(base+'prepared-copy',{activityKey:selected.activityKey},true);if(record!==selected||!active())return;await studio.importCopy(copy);}
 catch(error){if(active())$('save-status').textContent=error.message;}
 finally{if(active())button.disabled=false;}
});
$('website-search').addEventListener('input',renderList);
document.addEventListener('click',event=>{const button=event.target.closest('[data-open-website]');if(button)void open(JSON.parse(decodeURIComponent(button.dataset.openWebsite)));});
document.addEventListener('studio-account-ended',()=>{ended=true;studio?.clearRemote();record=null;pending.clear();});
const refreshButton=document.createElement('button');refreshButton.dataset.pageContentRefresh='';refreshButton.style.display='none';refreshButton.textContent='Refresh websites';$('workspace').prepend(refreshButton);refreshButton.addEventListener('click',()=>{if(studio&&!studio.canLeave())return;location.reload();});
try{const session=await ready();identity=session.accountId;document.querySelector('.pb-brand').href=session.academyOrigin+'/academy/admin/';if(selection)await open(selection);else await list();}catch(error){if(error.name!=='AbortError')end(error.message);}

const attach=document.createElement('button');attach.className='quiet';attach.textContent='Attach Academy material';attach.id='attach-academy-material';document.querySelector('.heading-actions').append(attach);
attach.addEventListener('click',async()=>{
 if(!record||!active()||studio&&!studio.canLeave())return;attach.disabled=true;
 const selected=record,scope={...selection},seen=new Set(),entries=[],target=$('studio-dialog');let before=null;
 const current=()=>active()&&record===selected;
 const addPage=native=>{before=native.before;for(const lesson of [native.courseFiles?.media,...(native.lessons||[]),...(native.sessions||[]).map(s=>s.media)].filter(Boolean))for(const asset of lesson.assets||[])if(!seen.has(asset.id)){seen.add(asset.id);entries.push({lesson,asset});}};
 const draw=()=>{
  $('dialog-title').textContent='Attach Academy material';$('dialog-body').innerHTML=(entries.map(({lesson,asset},i)=>`<article class="website-list-card"><h3>${esc(asset.name||asset.filename||lesson.title)}</h3><p>${esc(lesson.title)} · ${esc(asset.kind)}</p><button type="button" data-attach-index="${i}">Attach</button></article>`).join('')||'<p>No published materials are available for this website. Upload and publish them in Academy Lesson media first.</p>')+(before?'<button type="button" data-earlier-media>Load earlier materials</button>':'');
  const link=document.createElement('a');link.textContent='Open Academy Lesson media';link.target='_blank';link.rel='noopener';link.href=state.account.academyOrigin+(scope.surahId?'/programs/?program='+encodeURIComponent(selected.activityKey.slice(8))+'&tab=media':'/academy/media/?course='+encodeURIComponent(selected.activityKey.slice(7))+'&workspace=ADMIN');$('dialog-body').append(link);
 };
 try{
  const native=await api(base+'media',scope);if(!current())return;addPage(native);draw();
  $('dialog-body').onclick=async e=>{
   const button=e.target.closest('[data-attach-index],[data-earlier-media]');if(!button||button.disabled||!current())return;button.disabled=true;
   try{
    if(button.hasAttribute('data-earlier-media')){const next=await api(base+'media',{...scope,before});if(!current())return;addPage(next);draw();return;}
    const {lesson,asset}=entries[Number(button.dataset.attachIndex)],saved=await mutate('attach',{...scope,assetId:crypto.randomUUID(),lessonId:lesson.id,nativeAssetId:asset.id});if(!current())return;selected.assets.push(saved.asset);studio.attachAcademyMaterial(saved.asset);target.close();
   }catch(error){if(current()){button.textContent=error.message;button.disabled=false;}}
  };target.showModal();
 }catch(error){if(current())$('save-status').textContent=error.message;}finally{attach.disabled=false;}
});
