import {esc,clone} from './model.mjs';
const $=id=>document.getElementById(id),token=()=>localStorage.getItem('m4l_account_token')||'',owner=token(),controller=new AbortController();
let ended=false,record=null,websites=[],studio=null,pending=new Map(),identity='',opening=false;
const base='/api/admin/platform/course-websites/',query=new URLSearchParams(location.search),surahId=query.get('surah'),programId=query.get('program');
const surahScope=surahId&&programId?{activityKey:'PROGRAM:'+programId,surahId}:null;
const active=()=>!ended&&owner&&token()===owner;
function end(message='Your Academy account changed. Reopen Website builder from Admin.'){
 ended=true;controller.abort();studio?.clearRemote();record=null;websites=[];pending.clear();$('website-editor').hidden=true;$('website-list').replaceChildren();$('website-list-panel').hidden=false;$('website-list-status').textContent=message;
}
async function api(path,input={},blob=false,bytes){
 if(!active())throw new DOMException('Your Academy account changed.','AbortError');
 if(surahScope)input={...input,...surahScope};
 const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path+(bytes?'?metadata='+encodeURIComponent(JSON.stringify(input)):''),{method:'POST',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+owner,...(bytes?{}:{'Content-Type':'application/json'})},body:bytes||JSON.stringify(input)});
 if(!active())throw new DOMException('Your Academy account changed.','AbortError');
 if(blob&&response.ok)return response.blob();
 const data=await response.json();if(!active())throw new DOMException('Your Academy account changed.','AbortError');
 if(!response.ok||!data.success){if(response.status===401)end('Your Academy session ended. Sign in again.');throw Object.assign(Error(data.error||'The website could not be saved.'),{status:response.status});}
 return data;
}
async function mutate(action,input){
 const key=action+JSON.stringify(input);if(!pending.has(key))pending.set(key,{...input,operationId:crypto.randomUUID()});
 const result=await api(base+action,pending.get(key));pending.delete(key);return result;
}
function renderList(){const search=$('website-search').value.trim().toLowerCase(),rows=websites.filter(r=>r.name.toLowerCase().includes(search));$('website-list').innerHTML=rows.map(row=>`<article class="website-list-card"><span class="overline">${row.hasDraft?'SAVED WEBSITE':row.existing?'EXISTING COURSE WEBSITE':'COURSE TEMPLATE'}</span><h2>${esc(row.name)}</h2><p>${row.enabled?row.hasDraft?'Draft available to edit':row.existing?'Open the current Al Kahf lessons in the editor.':'Start with the Al Kahf course layout.':'Website withdrawn · draft retained'}</p><button class="primary" data-open-website="${esc(row.activityKey)}">${row.hasDraft||row.existing?'Open website to edit':'Create course website'} →</button></article>`).join('')||'<p>No courses match this view.</p>';}
async function list(){
 if(surahScope){if(studio&&!studio.canLeave())return;location.href='/programs/?program='+encodeURIComponent(programId)+'&tab=media';return;}
 if(studio&&!studio.canLeave())return;studio?.clearRemote();record=null;$('website-editor').hidden=true;$('website-list-panel').hidden=false;$('website-list-status').textContent='Loading your course websites…';
 try{const result=await api(base+'list');websites=result.websites;renderList();$('website-list-status').textContent=result.truncated?'Showing the first 500 courses.':websites.length+' courses available';}catch(error){if(active())$('website-list-status').textContent=error.message;}
}
async function open(activityKey){
 if(opening||studio&&!studio.canLeave())return;opening=true;$('website-editor').inert=true;$('website-list-status').textContent='Opening the course editor…';
 try{const next=await api(base+'get',{activityKey});if(!active())return;record=next;$('selected-course-name').textContent=next.name;$('website-list-panel').hidden=true;$('website-editor').hidden=false;if(studio)await studio.openRemote();else studio=await import('./studio.mjs?v=107.106');}
 catch(error){if(active()){$('website-editor').hidden=true;$('website-list-panel').hidden=false;$('website-list-status').textContent=error.message;}}
 finally{opening=false;if(active())$('website-editor').inert=false;}
}
window.M4L_COURSE_WEBSITES={canLeave:()=>!studio||studio.canLeave()};
window.COURSE_WEBSITE_ADMIN={surahId:surahScope?.surahId||null,list,revision:()=>record?.revision||0,ownerKey:()=>identity,
 drafts:async()=>record?[clone(record.document)]:[],
 async save(document){const selected=record;if(!selected)throw Error('Choose a course website.');const result=await mutate('save',{activityKey:selected.activityKey,revision:selected.revision,document});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.document=clone(document);},
 async assets(){const selected=record,result=[];if(!selected)return result;for(const asset of selected.assets){const blob=asset.type.startsWith('image/')?await api(base+'asset',{activityKey:selected.activityKey,assetId:asset.id},true):null;if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');result.push({...asset,courseId:selected.document.id,blob});}return result;},
 async assetBlob(id){if(!record)throw Error('Choose a Course.');return api(base+'asset',{activityKey:record.activityKey,assetId:id},true);},
 async download(id){const asset=record.assets.find(a=>a.id===id);if(!asset)return;const blob=await this.assetBlob(id),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=asset.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);},
 async upload(asset){const selected=record;if(!selected)throw Error('Choose a course website.');const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await asset.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');const input={activityKey:selected.activityKey,assetId:asset.id,filename:asset.name,type:asset.type,size:asset.size,sha256,operationId:crypto.randomUUID()};const result=await api(base+'upload',input,false,asset.blob);if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.assets.push(result.asset);},
 async publish(){const selected=record,result=await mutate('publish',{activityKey:selected.activityKey,revision:selected.revision});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.enabled=true;},
 async withdraw(){if(!confirm('Withdraw this website from students? Its saved draft and existing course records will be kept.'))return;const selected=record,result=await mutate('withdraw',{activityKey:selected.activityKey,revision:selected.revision});if(record!==selected||!active())throw new DOMException('The selected Course changed.','AbortError');selected.revision=result.revision;selected.enabled=false;return true;}
};
$('website-search').addEventListener('input',renderList);
document.addEventListener('click',event=>{const button=event.target.closest('[data-open-website]');if(button)void open(button.dataset.openWebsite);});
window.addEventListener('m4l-academy-session-ended',()=>end());window.addEventListener('m4l-academy-session',()=>end());window.addEventListener('storage',event=>{if((event.key==='m4l_account_token'||event.key===null)&&!active())end();});
window.addEventListener('pageshow',event=>{if(event.persisted){end('Reopening Website builder securely…');location.reload();}});
const refreshButton=document.createElement('button');refreshButton.dataset.pageContentRefresh='';refreshButton.style.display='none';refreshButton.textContent='Refresh websites';$('workspace').prepend(refreshButton);refreshButton.addEventListener('click',()=>{if(studio&&!studio.canLeave())return;location.reload();});
try{if(!owner)throw Error('Sign in through the Academy Admin dashboard.');const session=await window.M4L_ACADEMY_NAVIGATION.session(owner);identity=String(session.account.accountid||session.account.uniqueid||'');await window.M4L_ACADEMY_WORKSPACE.readyAccess();if(surahScope){document.title='Tafseer surah website · Academy';document.querySelector('.design-note p').textContent='Save and publish this surah website. Access follows the completion date entered in Tafseer → Lesson media.';await open(surahScope.activityKey);}else await list();}catch(error){end(error.message);}
