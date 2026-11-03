import {journalAPI,journalDraft,journalFields,entryFields,today} from './client.mjs?v=journal-r2-local';
const $=id=>document.getElementById(id),form=$('journal-form'),owner=localStorage.getItem('m4l_account_token')||'';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let stopped=false,draft=null,entries=new Map(),cursor=null,query='',listTurn=0,opening=false,refreshJob=null;
const api=journalAPI({token:owner,onEnded:message=>end(message)}),active=()=>!stopped&&api.active();
function end(message='Your account changed. Reopen your journal from your dashboard.',clearDevice=true){
 if(stopped)return;stopped=true;draft?.stop();draft=null;void api.stop({clearDevice}).catch(()=>{});entries.clear();form.reset();$('journal-list').replaceChildren();$('journal-workspace').hidden=true;$('journal-new').disabled=true;$('journal-message').textContent=message;
}
function message(){if(!active())return;$('journal-message').textContent=api.lastError?'Showing the device copy. Your journal could not connect; device drafts are kept.':api.deviceError?'Your device copy could not be stored. Keep this page open until your draft is saved.':'';}
function changed(state,error){
 if(!active())return;
 const labels={unsaved:'Device draft · select Save',saving:'Saving to your journal…',saved:'Saved to your journal',error:'Not saved to your journal',conflict:'Device draft kept', 'device-error':'Device draft could not be stored'};
 $('journal-save-status').textContent=labels[state]||'';$('journal-save').disabled=state==='saving';$('journal-save-error').hidden=!error;$('journal-save-error').textContent=error?.message||'';
 $('journal-copy').hidden=state!=='conflict';$('journal-reopen').hidden=!draft?.dirty;
 if(draft){const record=draft.entry;entries.set(record.id,{...record,...draft.fields,_draft:draft.dirty,updatedAt:record.updatedAt||new Date().toISOString()});renderList();if(state==='saved'){for(const key of journalFields)form.elements.namedItem(key).value=draft.fields[key]??'';$('journal-saved-date').textContent='Last saved '+new Date(record.updatedAt).toLocaleString();message();}}
}
async function install(entry=null,initial=null,restore=null){
 draft?.stop();const content=restore?.fields||initial||entryFields(entry);if(!entry&&!initial&&!restore)content.entryDate=today();for(const key of journalFields)form.elements.namedItem(key).value=content[key]??'';
 draft=journalDraft({entry,fields:content,restore,documentVersion:api.version,save:body=>api.request('save',body),prepareVersion:record=>api.versionFor(record),persist:record=>api.saveDraft(record),clear:id=>api.clearDraft(id),onState:changed});
 form.hidden=false;$('journal-empty-editor').hidden=true;$('journal-save-status').textContent=restore?'Device draft · select Save':entry?'Saved to your journal':'New entry · select Save';$('journal-save-error').hidden=true;$('journal-save-error').textContent='';$('journal-save').disabled=false;$('journal-copy').hidden=true;$('journal-reopen').hidden=!restore;$('journal-saved-date').textContent=entry?.updatedAt?'Last saved '+new Date(entry.updatedAt).toLocaleString():'';renderList();
}
function renderList(){
 const rows=[...entries.values()].filter(entry=>!query||journalFields.some(key=>(entry[key]||'').toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')||b.id.localeCompare(a.id));
 $('journal-list').innerHTML=rows.length?rows.map(entry=>`<button type="button" class="journal-entry" data-entry="${esc(entry.id)}" aria-current="${draft?.entry.id===entry.id}"><strong>${esc(entry.surah||entry.course||'A reflection')}</strong><small>${entry._draft?'Device draft · ':''}${esc([entry.entryDate||'Undated entry',entry.surah?entry.course:entry.lesson].filter(Boolean).join(' · '))}</small><p dir="auto">${esc((entry.reflection||entry.question||'A blank page to return to.').slice(0,140))}</p></button>`).join(''):`<p class="journal-empty">${query?'No entries match your search.':'Your journal is ready. Start a new entry or reflect inside a lesson.'}</p>`;
}
async function list(more=false){
 const turn=++listTurn;$('journal-more').disabled=true;
 try{const result=await api.request('list',{query,...(more&&cursor?{cursor}:{})});if(!active()||turn!==listTurn)return;if(!more)entries.clear();for(const entry of result.entries)entries.set(entry.id,entry);for(const local of result.drafts)entries.set(local.entry.id,{...local.entry,...local.fields,_draft:true,updatedAt:local.deviceUpdatedAt||local.entry.updatedAt||''});cursor=result.nextCursor;$('journal-more').hidden=!cursor;renderList();message();}
 finally{if(active()&&turn===listTurn)$('journal-more').disabled=false;}
}
async function deviceBeforeLeaving(){if(draft?.saving)return false;try{await draft?.flushDevice();return active();}catch(error){report(error);return false;}}
async function openEntry(id){
 if(opening||!active())return;opening=true;
 try{if(!await deviceBeforeLeaving())return;const local=await api.draft(id),entry=local?.entry||(await api.request('get',{id})).entry;if(active()){await install(entry,null,local);if(matchMedia('(max-width:767px)').matches)$('journal-editor-title').scrollIntoView({block:'start',behavior:'smooth'});}}
 finally{opening=false;}
}
function report(error){if(active()&&error.name!=='AbortError')$('journal-message').textContent=error.message;}
async function refresh(){
 if(refreshJob)return refreshJob;
 refreshJob=(async()=>{if(!await deviceBeforeLeaving())return;await api.refresh();if(!active())return;await list();if(draft?.entry.revision&&!draft.dirty)await openEntry(draft.entry.id);message();})().catch(report).finally(()=>{refreshJob=null;});return refreshJob;
}
form.addEventListener('input',event=>{if(active()&&draft&&journalFields.includes(event.target.name))draft.set({[event.target.name]:event.target.value});});
form.addEventListener('submit',event=>{event.preventDefault();if(active()&&draft)void draft.save().catch(report);});
$('journal-new').addEventListener('click',async()=>{if(!active()||opening)return;opening=true;try{if(await deviceBeforeLeaving()){await install();form.elements.namedItem('reflection').focus();}}finally{opening=false;}});
$('journal-list').addEventListener('click',event=>{const button=event.target.closest('[data-entry]');if(button)void openEntry(button.dataset.entry).catch(report);});
$('journal-search').addEventListener('submit',event=>{event.preventDefault();query=$('journal-query').value.trim();void list().catch(report);});
$('journal-more').addEventListener('click',()=>void list(true).catch(report));$('journal-refresh').addEventListener('click',()=>void refresh());
$('journal-copy').addEventListener('click',async()=>{if(!draft||!active()||draft.saving)return;const original=draft.entry.id,content=draft.fields;await api.refresh();if(!active())return;await install(null,content);try{await draft.save();if(!draft.dirty)await api.clearDraft(original);}catch(error){report(error);}});
$('journal-reopen').addEventListener('click',async()=>{
 if(!draft||!active()||!confirm('Discard this device draft and open the saved entry?'))return;
 const id=draft.entry.id;try{await draft.flushDevice();await api.clearDraft(id);await api.refresh();if(!active())return;const entry=(await api.request('get',{id})).entry;await install(entry);await list();}catch(error){if(error.status===404){draft.stop();draft=null;form.reset();form.hidden=true;$('journal-empty-editor').hidden=false;await list();}else report(error);}
});
$('journal-export').addEventListener('click',async()=>{
 const button=$('journal-export');if(button.disabled||!await deviceBeforeLeaving())return;button.disabled=true;
 try{const all=[];let next=null;do{const result=await api.request('list',{limit:100,...(next?{cursor:next}:{})});all.push(...result.entries);next=result.nextCursor;}while(next&&active());if(!active())return;
  const labels={entryDate:'Date',course:'Course',surah:'Surah',lesson:'Lesson',ayah:'Ayahs',question:'Reflection question',reflection:'My reflection'},text='My saved journal\n\n'+all.map(entry=>Object.entries(labels).filter(([key])=>entry[key]).map(([key,label])=>label+': '+entry[key]).join('\n\n')||'Blank entry').join('\n\n────────────────────\n\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='my-tafseer-journal.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){report(error);}finally{if(active())button.disabled=false;}
});
const canLeave=()=>!draft?.busy&&draft?.error?.code!=='DEVICE_DRAFT_FAILED';
const canSwitch=()=>!(draft?.dirty||api.hasDrafts)||confirm('Switch accounts and discard your unsaved device drafts? Select Cancel to save them first.');
window.M4L_STUDENT_JOURNAL={canLeave,canSwitch};
window.addEventListener('beforeunload',event=>{if(active()&&!canLeave()){event.preventDefault();event.returnValue='';}});
document.addEventListener('click',event=>{const signout=event.target.closest('#ac-signout,#academy-sign-out,#logout-button');if(signout&&active()&&draft?.dirty&&!canSwitch()){event.preventDefault();event.stopImmediatePropagation();return;}const link=event.target.closest('a[href]');if(!link||!active()||!draft?.busy||link.target==='_blank'||event.metaKey||event.ctrlKey)return;event.preventDefault();void deviceBeforeLeaving().then(ok=>{if(ok)location.href=link.href;});},true);
window.addEventListener('m4l-academy-session-ended',()=>end());window.addEventListener('m4l-academy-session',()=>{if(!api.active())end();});window.addEventListener('storage',event=>{if((event.key==='m4l_account_token'||event.key===null)&&!api.active())end();});window.addEventListener('pagehide',()=>end('Reopening your journal…',false));window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&active())void refresh();});
if(!owner)end('Sign in through the Academy to open your journal.');else try{await list();if(active()){$('journal-workspace').hidden=false;$('journal-new').disabled=false;const id=new URLSearchParams(location.search).get('entry');if(id)await openEntry(id);}}catch(error){report(error);}
