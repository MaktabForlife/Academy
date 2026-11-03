import {journalAPI,journalDraft,today} from './client.mjs?v=journal-r2-local';

export function reflectionJournal({enabled,ui,activityKey,surahId,read,write,onEnded}){
 const api=journalAPI({onEnded:message=>{void api.stop({clearDevice:true}).catch(()=>{});onEnded(message);}}),drafts=new Map();let course=null,refs=new Map(),loaded=false,stopped=false,saved={};
 ui.journalEnabled=enabled;ui.journalStatus={};ui.journalImport={};ui.journalEntryIds={};
 const notify=(id,message)=>{ui.journalStatus[id]=message;for(const node of document.querySelectorAll('[data-journal-status]'))if(node.dataset.journalStatus===id)node.textContent=message;for(const node of document.querySelectorAll('[data-journal-save]'))if(node.dataset.journalSave===id)node.disabled=message==='Saving to your journal…';};
 function create(id,entry,restore){
  const ref=refs.get(id);if(!ref)return null;
  const draft=journalDraft({entry,restore,sourceKey:ref.key,documentVersion:api.version,fields:entry?{reflection:entry.reflection}:{course:surahId?'Tafseer':course.name,surah:surahId?course.name:'',lesson:ref.lesson.title.slice(0,400),question:(ref.block.text||'').slice(0,8000),reflection:'',entryDate:today()},save:body=>api.request('save',body),prepareVersion:record=>api.versionFor(record),persist:value=>api.saveDraft(value),clear:id=>api.clearDraft(id),onState:(state,error)=>{
   if(stopped)return;
   if(state==='saved'){ui.reflections[id]=draft.fields.reflection;saved[id]=draft.fields.reflection;write('reflections-v2',JSON.stringify(ui.reflections));write('journal-saved-v1',JSON.stringify(saved));ui.journalEntryIds[id]=draft.entry.id;}
   notify(id,({unsaved:'Device draft only. Select Save reflection to update your journal.',saving:'Saving to your journal…',saved:'Saved to your journal.',error:'Device draft kept. '+(error?.message||'Select Save to try again.'),conflict:'Device draft kept. Refresh and review your saved journal before saving again.','device-error':'Your draft could not be stored on this device. Keep this page open.'})[state]);
  }});drafts.set(id,draft);if(entry?.revision)ui.journalEntryIds[id]=entry.id;return draft;
 }
 return {async sync(document){
  if(!enabled||stopped)return;course=document;try{saved=JSON.parse(read('journal-saved-v1')||'{}');}catch{saved={};}
  refs=new Map(course.lessons.flatMap(lesson=>lesson.sections.flatMap(section=>section.blocks.filter(block=>block.type==='reflection').map(block=>[block.id,{lesson,block,key:'reflection:v1:'+JSON.stringify([activityKey,surahId||'',lesson.id,block.id])}]))));
  try{
   await api.refresh();const state=await api.request('list',{limit:100}),keys=[...refs.values()].map(ref=>ref.key),all=[];for(let index=0;index<keys.length;index+=80)all.push(...(await api.request('sources',{keys:keys.slice(index,index+80)})).entries);
   if(stopped)return;loaded=true;const entries=new Map(all.map(entry=>[entry.sourceKey,entry]));
   for(const [id,ref] of refs){if(drafts.get(id)?.dirty)continue;drafts.get(id)?.stop();const entry=entries.get(ref.key),restore=state.drafts.find(draft=>draft.entry.sourceKey===ref.key),local=ui.reflections[id]||'',legacy=Boolean(local&&(!entry||local!==saved[id]));
    const draft=create(id,entry,restore);
    if(restore){ui.reflections[id]=restore.fields.reflection??'';notify(id,'Device draft only. Select Save reflection to update your journal.');}
    else if(legacy){draft.set({reflection:local});notify(id,'Browser draft kept on this device. Select Save reflection to update your journal.');}
    else if(entry){ui.reflections[id]=entry.reflection;saved[id]=entry.reflection;notify(id,api.lastError?'Showing the device copy. Reconnect before saving.':'Saved to your journal.');}
    else notify(id,'Typing keeps a device draft. Select Save reflection to update your journal.');
   }
   write('reflections-v2',JSON.stringify(ui.reflections));write('journal-saved-v1',JSON.stringify(saved));
  }catch(error){if(stopped)return;loaded=false;for(const id of refs.keys())notify(id,'Browser draft kept. Your journal could not connect.');}
 },change(id,value){if(!enabled||stopped)return;if(!loaded){notify(id,'Saved in this browser only. Refresh to reconnect your journal.');return;}drafts.get(id)?.set({reflection:value});},
 async save(id){if(!loaded){await this.sync(course);if(!loaded)return;}await drafts.get(id)?.save();},
 canLeave(){return [...drafts.values()].every(draft=>!draft.busy&&draft.error?.code!=='DEVICE_DRAFT_FAILED');},
 async stop({clearDevice=false}={}){stopped=true;const pending=[...drafts.values()];if(!clearDevice)await Promise.allSettled(pending.map(draft=>draft.flushDevice()));for(const draft of pending)draft.stop();drafts.clear();saved={};await api.stop({clearDevice});}};
}
