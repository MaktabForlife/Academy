import {journalDevice,journalDigest as digest,journalBase,clearJournalSession} from './device.mjs';
export const journalFields=['course','surah','lesson','ayah','question','reflection','entryDate'];
export const entryFields=entry=>Object.fromEntries(journalFields.map(key=>[key,entry?.[key]??'']));
export const today=()=>{const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};

export function journalAPI({token=localStorage.getItem('m4l_account_token')||'',onEnded=()=>{},device=journalDevice(),fetcher=(...args)=>fetch(...args)}={}){
 const controller=new AbortController(),base=journalBase(window.M4L_CONFIG?.API_BASE);
 let stopped=false,copy=null,ownerKey='',sessionKey='',deviceReady=null,ready=false,syncing=null,deviceError=null,lastError=null,deviceTask=Promise.resolve(),drafts=new Map();
 const active=()=>!stopped&&Boolean(token)&&token===(localStorage.getItem('m4l_account_token')||'');
 const check=()=>{if(!active())throw new DOMException('Your Academy account changed.','AbortError');};
 const disk=fn=>{const next=deviceTask.catch(()=>{}).then(fn);deviceTask=next;return next;};
 async function loadDevice(){
  if(deviceReady)return deviceReady;
  deviceReady=(async()=>{sessionKey=await digest(base+'|'+token);try{if(await device.get('blocked:'+sessionKey))throw new DOMException('This device session has ended. Sign in again.','AbortError');const binding=await device.get('session:'+sessionKey);check();if(binding?.ownerKey){ownerKey=binding.ownerKey;copy=await device.get('copy:'+ownerKey);check();drafts=new Map((await device.list('draft:'+ownerKey+':')).map(draft=>[draft.entry.id,draft]));}}catch(error){if(error.name==='AbortError')throw error;deviceError=error;}})();return deviceReady;
 }
 async function network(action,input){
  check();const response=await fetcher(base+'/api/academy/journal/'+action,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':'LEARN'},body:JSON.stringify(input)});
  const result=await response.json();check();if(!response.ok||!result.success){if(response.status===401)onEnded(result.error);throw Object.assign(Error(result.error||'Your journal could not connect. Your device draft is kept.'),{status:response.status,code:result.code});}return result;
 }
 async function accept(result){
  check();if(!/^[a-f0-9]{64}$/.test(result.ownerKey||''))throw Error('The private journal owner could not be verified.');
  const partitionKey=await digest(base+'|'+result.ownerKey);check();
  if(ownerKey&&ownerKey!==partitionKey){copy=null;drafts.clear();}
  if(ownerKey!==partitionKey){ownerKey=partitionKey;try{drafts=new Map((await device.list('draft:'+ownerKey+':')).map(draft=>[draft.entry.id,draft]));}catch(error){deviceError=error;}check();}
  if(!result.notModified){if(!Array.isArray(result.entries))throw Error('The journal copy could not be read.');copy={ownerKey,version:result.version,revision:result.revision,entries:result.entries,updatedAt:result.updatedAt};}
  if(!copy)throw Error('The device copy is unavailable. Refresh your journal.');
  try{await disk(()=>device.put([['copy:'+ownerKey,copy],['session:'+sessionKey,{ownerKey}]],{sessionKey}));deviceError=null;}catch(error){deviceError=error;}
  check();ready=true;lastError=null;return copy;
 }
 async function refresh(){
  if(syncing)return syncing;
  syncing=(async()=>{await loadDevice();try{let result=await network('sync',{version:copy?.version??null});if(result.notModified&&!copy)result=await network('sync',{version:null});return await accept(result);}catch(error){lastError=error;if(!active()||error.status===401||error.status===403||!copy)throw error;ready=true;return copy;}})().finally(()=>{syncing=null;});return syncing;
 }
 const ensure=async()=>{if(!ready)await refresh();check();};
 const decorate=entry=>({...entry,documentVersion:copy?.version??null});
 return {active,refresh,get version(){return copy?.version??null;},get deviceError(){return deviceError;},get lastError(){return lastError;},get hasDrafts(){return drafts.size>0;},
  versionFor(record){
   // Other entries may have been saved since this editor opened. Rebase only
   // an untouched target; pending uncertain retries retain their exact request.
   if(!copy||record.documentVersion===copy.version)return record.documentVersion??null;
   const current=copy.entries.find(entry=>entry.id===record.id);
   const unchanged=record.revision===0?!current&&!copy.entries.some(entry=>record.sourceKey&&entry.sourceKey===record.sourceKey):current&&['revision','sourceKey','createdAt','updatedAt',...journalFields].every(key=>(current[key]??'')===(record[key]??''));
   return unchanged?copy.version:record.documentVersion??null;
  },
  async draft(id){await ensure();return drafts.get(id)||null;},
  async saveDraft(draft){if(stopped)return;if(!ownerKey)throw Error('Open your journal before writing a device draft.');const key=ownerKey;drafts.set(draft.entry.id,draft);try{await disk(()=>device.put([['draft:'+key+':'+draft.entry.id,draft]],{sessionKey}));deviceError=null;}catch(error){deviceError=error;throw Error('Your draft could not be stored on this device. Keep this page open and try again.');}},
  async clearDraft(id){const key=ownerKey;drafts.delete(id);if(key)try{await disk(()=>device.remove(['draft:'+key+':'+id]));}catch(error){deviceError=error;}},
  async flushDevice(){await deviceTask;},
  stop({clearDevice=false}={}){stopped=true;controller.abort();copy=null;drafts.clear();const cleanup=clearDevice?disk(()=>clearJournalSession({base,token,device})):deviceTask;void cleanup.catch(()=>{});return cleanup;},
  async request(action,input={}){
   await ensure();
   if(action==='save'){const result=await network('save',input);await accept(result);return {...result,entry:decorate(result.entry)};}
   const all=copy.entries.map(decorate);
   if(action==='get'){const entry=all.find(entry=>entry.id===input.id);if(!entry)throw Object.assign(Error('This saved entry is unavailable.'),{status:404});return {entry};}
   if(action==='sources')return {entries:all.filter(entry=>input.keys.includes(entry.sourceKey))};
   if(action==='list'){
    // Search/list/export use only the current confirmed device copy.
    const query=(input.query||'').toLocaleLowerCase(),rows=all.filter(entry=>(!input.course||entry.course===input.course)&&(!input.surah||entry.surah===input.surah)&&(!query||journalFields.some(key=>entry[key].toLocaleLowerCase().includes(query)))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
    const offset=Number(input.cursor?.offset)||0,limit=input.limit||30;
    return {entries:rows.slice(offset,offset+limit),nextCursor:rows.length>offset+limit?{offset:offset+limit}:null,drafts:[...drafts.values()]};
   }
   throw Error('Unknown journal action.');
  }
 };
}

// Manual Save only: persistence below writes the device draft, never the server.
export function journalDraft({entry=null,fields={},sourceKey=null,documentVersion=null,restore=null,save,prepareVersion=record=>record.documentVersion??null,persist=async()=>{},clear=async()=>{},onState=()=>{}}){
 let record=restore?.entry||entry||{id:crypto.randomUUID(),revision:0,sourceKey,documentVersion},content=restore?.fields||{...fields},version=restore?.version??(restore?1:0),savedVersion=restore?.savedVersion??0,pending=restore?.pending||null,running=null,writing=Promise.resolve(),writingCount=0,stopped=false,error=null;
 const dirty=()=>version!==savedVersion||Boolean(pending),emit=state=>{if(!stopped)onState(state,error);};
 function keep(){const snapshot=structuredClone({entry:record,fields:content,pending,version,savedVersion,deviceUpdatedAt:new Date().toISOString()});writingCount++;writing=writing.catch(()=>{}).then(()=>stopped?undefined:persist(snapshot)).catch(cause=>{error=Object.assign(cause,{code:'DEVICE_DRAFT_FAILED'});emit('device-error');throw cause;}).finally(()=>{writingCount--;});void writing.catch(()=>{});}
 return {get entry(){return record;},get fields(){return {...content};},get error(){return error;},get dirty(){return dirty();},get busy(){return Boolean(running)||writingCount>0;},get saving(){return Boolean(running);},
  set(patch){if(stopped)return;Object.assign(content,patch);version++;emit(error?.status===409?'conflict':'unsaved');keep();},
  async save(){
   if(stopped)return;if(running)return running;if(error?.status===409)throw error;
   if(record.revision===0&&!dirty())version++;
   if(!dirty())return;
   if(!pending){record={...record,documentVersion:prepareVersion(record)};pending={version,body:{id:record.id,revision:record.revision,version:record.documentVersion??null,operationId:crypto.randomUUID(),fields:{...content},...(record.revision===0&&record.sourceKey?{sourceKey:record.sourceKey}:{})}};}
   const attempt=pending;keep();
   running=(async()=>{try{await writing.catch(()=>{});if(stopped)return;emit('saving');const result=await save(attempt.body);if(stopped)return;record=result.entry;savedVersion=attempt.version;pending=null;error=null;if(dirty()){keep();emit('unsaved');}else{content=Object.fromEntries(Object.keys(content).map(key=>[key,record[key]??'']));await clear(record.id);emit('saved');}}catch(cause){if(stopped)return;error=cause;keep();emit(cause.status===409?'conflict':'error');throw cause;}})().finally(()=>{running=null;});return running;
  },
  async flushDevice(){await writing;},
  stop(){stopped=true;}
 };
}
