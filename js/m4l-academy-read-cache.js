(() => {
 'use strict';
 if(window.M4L_ACADEMY_AUTH?.selected){
  const auth=window.M4L_ACADEMY_AUTH,values=new Map(),jobs=new Map();let generation=0;
  const abort=()=>new DOMException('The Academy account, authority or workspace changed.','AbortError');
  const realm=()=>JSON.stringify([auth.ownerKey(),window.M4L_ACADEMY_WORKSPACE?.current()||'LEARN',window.M4L_ACADEMY_WORKSPACE?.classView()||null]);
  const invalidate=()=>{generation++;values.clear();jobs.clear();};
  const headers=revision=>({'X-Academy-Read-Cache':'1',...(revision?{'X-Academy-Read-Revision':revision}:{})});
  const publicUrl=(url,revision)=>url+(url.includes('?')?'&':'?')+'readCache=1'+(revision?'&readRevision='+encodeURIComponent(revision):'');
  async function load({key,public:publicData=false,force=false,revalidate=false,fetcher,onUpdate,onError}){
   if(!publicData){const client=await auth.ready;await client.ensureFresh();if(!auth.hasSession())throw abort();}
   const context=publicData?'PUBLIC':realm(),ticket=generation,name=JSON.stringify([context,key]),current=()=>ticket===generation&&(publicData||context===realm()&&auth.hasSession());
   const previous=values.get(name);if(previous&&(!publicData&&!auth.isCurrentResult(previous.data)||Date.now()-previous.at>60000)){values.delete(name);}
   const entry=values.get(name);if(entry&&!force&&!revalidate)return entry.data;
   let task=jobs.get(name);if(!task){task=(async()=>{
    const result=await fetcher(entry?.data?.readRevision||'',entry?.data);if(!current()||!publicData&&!auth.isCurrentResult(result))throw abort();
    const data=result.notModified?entry?.data:result;if(!data||data.success===false||!publicData&&!auth.isCurrentResult(data))throw Object.assign(Error('This Academy view could not be checked.'),{status:503});
    const size=new TextEncoder().encode(JSON.stringify(data)).length;if(size<=2*1024*1024)values.set(name,{at:Date.now(),data,size});let total=[...values.values()].reduce((n,e)=>n+e.size,0);while(values.size>24||total>8*1024*1024){const first=values.keys().next().value;total-=values.get(first).size;values.delete(first);}return data;
   })().finally(()=>{if(jobs.get(name)===task)jobs.delete(name);});jobs.set(name,task);}
   try{const result=await task;if(!current())throw abort();onUpdate?.(result);return result;}catch(error){if(current())onError?.(error,false);throw error;}
  }
  window.M4L_ACADEMY_READ_CACHE={load,headers,publicUrl,invalidate,owner:async()=>auth.ownerKey()};
  const refreshed=new WeakMap();window.M4L_REFRESH_AFTER_SAVE=result=>{
   if(!auth.isCurrentResult(result)||result.success!==true||!Array.isArray(result.cacheRefreshPending)||!result.cacheRefreshPending.length)return Promise.resolve({completed:[],pending:false});
   if(refreshed.has(result))return refreshed.get(result);const task=auth.request('/api/academy/cache/refresh',{}).then(value=>{if(!auth.isCurrentResult(value))throw abort();invalidate();return value;}).catch(()=>({completed:[],pending:true}));refreshed.set(result,task);return task;
  };
  // Same-context purpose bootstraps emit state without changing authority or
  // the restored view; they must not cancel independently checked current reads.
  const stateStamp=()=>{const state=auth.getState?.();return JSON.stringify([state?.state,state?.context,state?.viewVersion,state?.suspended,state?.validationRequired,state?.authorityReady,state?.replacementRequired]);};let lastStateStamp=stateStamp();
  for(const name of ['academy-v2-context','academy-v2-mask','academy-v2-revalidate','m4l-academy-session-ended','m4l-academy-permissions-changed'])window.addEventListener(name,event=>{if(name==='academy-v2-mask'&&event.detail?.masked===false)return;const next=stateStamp();if(name==='academy-v2-context'&&next===lastStateStamp)return;lastStateStamp=next;invalidate();});
  window.addEventListener('pagehide',invalidate);return;
 }

 const prefix='m4l_read_v1:',memory=new Map(),pending=new Map(),maxAge=30*60*1000,freshFor=60000;
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 let account=token(),epoch=0,privateEpoch=0,viewEpoch=0,lastDenial=null,publicationPending=null,publicationAt=0,publicationScope='';
 const confirmed=new Map();
 const context=()=>JSON.stringify([window.M4L_ACADEMY_WORKSPACE?.current()||'LEARN',window.M4L_ACADEMY_WORKSPACE?.classView()||null]);
 const head=()=>window.M4L_ACADEMY_WORKSPACE?.head()||null;
 const store=()=>{try{return window.sessionStorage;}catch{return null;}};
 function entries(){const all=new Map(memory);try{const s=store();for(let i=0;i<(s?.length||0);i++){const k=s.key(i);if(k?.startsWith(prefix))all.set(k,s.getItem(k));}}catch{}return all;}
 function remove(key){memory.delete(key);try{store()?.removeItem(key);}catch{}}
 function invalidate({privateOnly=false}={},denial=null){privateEpoch++;if(denial)lastDenial={epoch:privateEpoch,error:denial};else{viewEpoch++;lastDenial=null;confirmed.clear();}if(!privateOnly)epoch++;for(const key of pending.keys())if(!privateOnly||JSON.parse(key.slice(prefix.length))[1]!=='PUBLIC')pending.delete(key);publicationAt=0;publicationPending=null;for(const [key,value]of entries())try{if(!privateOnly||!JSON.parse(value).public)remove(key);}catch{remove(key);}}
 function changed(){if(account!==token()){account=token();invalidate({privateOnly:true});}}
 async function owner(value){try{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}catch{return '';}}
 function day(timezone){return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:timezone||'Africa/Johannesburg'}).format(new Date());}
 function write(key,entry){
  const raw=JSON.stringify(entry,(field,value)=>/^(token|authorization|joinUrl|zoomLink|object_key|objectKey|accessToken|signedUrl)$/i.test(field)?undefined:value);
  if(raw.length>2*1024*1024){remove(key);return;}memory.set(key,raw);try{store()?.setItem(key,raw);}catch{}
  let size=0;[...entries()].map(([key,value])=>{try{return {key,value,at:JSON.parse(value).at};}catch{return {key,value,at:0};}}).sort((a,b)=>b.at-a.at).forEach((row,index)=>{size+=row.value.length*2;if(index>=24||size>8*1024*1024||Date.now()-row.at>maxAge)remove(row.key);});
 }
 async function publication(force){
  if(!window.M4L_ACADEMY_WORKSPACE)return;
  const session=token(),realm=context();
  if(publicationPending?.session===session&&publicationPending.realm===realm)return publicationPending.promise;
  if(!force&&publicationScope===realm&&Date.now()-publicationAt<freshFor)return window.M4L_ACADEMY_WORKSPACE.readyPublication();
  // Selecting an Admin learner class supersedes the previous publication read.
  // The new scope must not inherit that read's abort or clear a newer job.
  const job={session,realm};publicationPending=job;
  job.promise=Promise.resolve(window.M4L_ACADEMY_WORKSPACE.readyPublication(true)).then(value=>{
   if(publicationPending===job&&session===token()&&realm===context()){publicationAt=Date.now();publicationScope=realm;}return value;
  }).finally(()=>{if(publicationPending===job)publicationPending=null;});
  return job.promise;
 }
 function authoritative(error){return [401,403,404].includes(error.status);}
 async function load({key:query,public:publicData=false,force=false,revalidate=false,fetcher,onUpdate,onError,fallback=null}){
  changed();const session=token(),realm=context(),ticket=publicData?epoch:privateEpoch,viewTicket=viewEpoch,identity=publicData?'PUBLIC':await owner(session);
  const active=()=>ticket===(publicData?epoch:privateEpoch)&&(publicData||session===token()&&realm===context());
  const currentView=()=>publicData?ticket===epoch:viewTicket===viewEpoch&&session===token()&&realm===context();
  if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');
  if(!publicData&&!identity){await publication(force);const data=await fetcher('');if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');return data;}
  const key=prefix+JSON.stringify([window.M4L_CONFIG?.API_BASE||location.origin,identity,publicData?'PUBLIC':realm,query]);
  // A denial must clear every waiting view, including a warm view whose shared
  // update was superseded by that denial. Account/workspace/save changes still
  // cancel old callbacks, and a newer confirmed read wins over an old failure.
  function visibleError(error){
   if(!currentView())return null;
   if(!publicData&&!active())return confirmed.get(key)>ticket?null:lastDenial?.epoch===privateEpoch?lastDenial.error:null;
   if(authoritative(error)){if(publicData)remove(key);else invalidate({privateOnly:true},error);}
   return error;
  }
  let entry,raw=memory.get(key);try{raw=store()?.getItem(key)||raw;}catch{}try{entry=JSON.parse(raw||'null');}catch{}
  if(entry&&(!entry.data||!Number.isFinite(entry.at)||!Number.isFinite(entry.checkedAt))){remove(key);entry=null;}
  if(entry&&(Date.now()-entry.at>maxAge||entry.at>Date.now()||!publicData&&head()&&head()!==entry.head||entry.day!==day(entry.data?.timezone))){remove(key);entry=null;}
  const cached=entry?.data||fallback;
  if(!force&&!revalidate&&entry&&Date.now()-entry.checkedAt<freshFor)return {...cached};
  let update=pending.get(key);
  if(!update){
   update=(async()=>{
    if(!publicData)await publication(force);
    if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');
    const result=await fetcher(entry?.data?.readRevision||'',entry?.data);
    if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');
    if(result.notModified&&!entry)throw Error('Refresh this Academy view.');
    const data=result.notModified?entry.data:result;
    if(data.success===false)throw Error(data.error||'Academy information is temporarily unavailable.');
    if(!publicData){confirmed.delete(key);confirmed.set(key,ticket);while(confirmed.size>64)confirmed.delete(confirmed.keys().next().value);}
    if(data.timetableComplete!==false&&!data.warnings?.some(warning=>/timetable.*unavailable/i.test(String(warning))))write(key,{public:publicData,at:Date.now(),checkedAt:Date.now(),day:day(data.timezone),head:publicData?null:head(),data});
    return data;
   })().finally(()=>{if(pending.get(key)===update)pending.delete(key);});
   pending.set(key,update);
  }
  if(cached&&!force){
   void update.then(data=>{if(active())onUpdate?.(data);},error=>{const visible=visibleError(error);if(!visible)return;if(authoritative(visible))onError?.(visible,false);else if(visible.name!=='AbortError')onError?.(visible,true);});
   return {...cached,_cacheChecking:true};
  }
  try{return await update;}catch(error){const visible=visibleError(error)||error;if(cached&&active()&&!authoritative(visible)&&visible.name!=='AbortError')return {...cached,_cacheMessage:'Showing saved information. Couldn’t check for updates.'};throw visible;}
 }
 const headers=revision=>({'X-Academy-Read-Cache':'1',...(revision?{'X-Academy-Read-Revision':revision}:{})});
 const publicUrl=(url,revision)=>url+(url.includes('?')?'&':'?')+'readCache=1'+(revision?'&readRevision='+encodeURIComponent(revision):'');
 window.M4L_ACADEMY_READ_CACHE={load,headers,publicUrl,invalidate,owner};
 // Process only refresh work confirmed by a successful save/publication. No
 // navigation polling or browser retry loop: durable recovery owns failures.
 const refreshJobs=new Map(),refreshHeads=new Map();let refreshResults=new WeakMap(),refreshEpoch=0;
 const pendingRefresh=()=>({completed:[],pending:true});
 function refreshAfterSave(result,session=token()){
  const kinds=Array.isArray(result?.cacheRefreshPending)?result.cacheRefreshPending.filter(kind=>['public-timetable','profile-labels'].includes(kind)):[];
  if(result?.success!==true||!kinds.length)return Promise.resolve({completed:[],pending:false});
  const realm=context(),ticket=refreshEpoch;
  const active=()=>session&&session===token()&&realm===context()&&ticket===refreshEpoch;
  if(!active()||window.M4L_ACADEMY_WORKSPACE?.current()!=='ADMIN')return Promise.resolve(pendingRefresh());
  if(refreshResults.has(result))return refreshResults.get(result);
  const scope=JSON.stringify([session,realm]),publication=result.head||null,publicationKey=publication&&kinds.includes('public-timetable')?JSON.stringify([scope,publication]):null;
  // The completed change and its originating Publish action share one rebuild.
  if(publicationKey&&refreshHeads.has(publicationKey))return refreshHeads.get(publicationKey);
  let job=refreshJobs.get(scope);
  if(job)job.again=true;
  else{
   job={again:false};refreshJobs.set(scope,job);
   job.promise=(async()=>{
    let state=pendingRefresh();
    // One extra pass covers a new confirmed save during a rebuild. Further
    // concurrent changes remain durable work for the existing recovery job.
    for(let pass=0;pass<2;pass++){
     job.again=false;if(!active())return pendingRefresh();
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
     try{
      const response=await window.fetch((window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')+'/api/academy/cache/refresh',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:'{}',signal:controller.signal});
      const data=await response.json();if(!active())return pendingRefresh();
      if(!response.ok||data.success!==true)return pendingRefresh();
      state={completed:Array.isArray(data.completed)?data.completed.filter(kind=>['public-timetable','profile-labels'].includes(kind)):[],pending:data.pending!==false};
      if(state.completed.includes('public-timetable')){invalidate();window.dispatchEvent(new Event('m4l-academy-public-timetable-updated'));}
     }catch{return pendingRefresh();}finally{clearTimeout(timer);}
     if(!job.again)break;
    }
    return job.again?{...state,pending:true}:state;
   })().finally(()=>{if(refreshJobs.get(scope)===job)refreshJobs.delete(scope);});
  }
  refreshResults.set(result,job.promise);
  if(publicationKey){
   refreshHeads.set(publicationKey,job.promise);
   void job.promise.then(state=>{if(state.pending&&refreshHeads.get(publicationKey)===job.promise)refreshHeads.delete(publicationKey);});
   while(refreshHeads.size>16)refreshHeads.delete(refreshHeads.keys().next().value);
  }
  return job.promise;
 }
 window.M4L_REFRESH_AFTER_SAVE=refreshAfterSave;
 function clearRefresh(){refreshEpoch++;refreshJobs.clear();refreshHeads.clear();refreshResults=new WeakMap();}
 window.addEventListener('m4l-academy-session',clearRefresh);
 window.addEventListener('m4l-academy-session-ended',clearRefresh);
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)clearRefresh();});
 window.addEventListener('m4l-academy-session',()=>{if(account!==token()){changed();return;}privateEpoch++;viewEpoch++;lastDenial=null;confirmed.clear();for(const key of pending.keys())if(JSON.parse(key.slice(prefix.length))[1]!=='PUBLIC')pending.delete(key);publicationAt=0;publicationPending=null;});
 window.addEventListener('m4l-academy-session-ended',()=>invalidate({privateOnly:true}));
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)changed();});
})();
