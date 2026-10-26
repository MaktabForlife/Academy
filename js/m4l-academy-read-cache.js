(() => {
 'use strict';
 const prefix='m4l_read_v1:',memory=new Map(),pending=new Map(),maxAge=30*60*1000,freshFor=60000;
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 let account=token(),epoch=0,privateEpoch=0,publicationPending=null,publicationAt=0;
 const context=()=>JSON.stringify([window.M4L_ACADEMY_WORKSPACE?.current()||'LEARN',window.M4L_ACADEMY_WORKSPACE?.classView()||null]);
 const head=()=>window.M4L_ACADEMY_WORKSPACE?.head()||null;
 const store=()=>{try{return window.sessionStorage;}catch{return null;}};
 function entries(){const all=new Map(memory);try{const s=store();for(let i=0;i<(s?.length||0);i++){const k=s.key(i);if(k?.startsWith(prefix))all.set(k,s.getItem(k));}}catch{}return all;}
 function remove(key){memory.delete(key);try{store()?.removeItem(key);}catch{}}
 function invalidate({privateOnly=false}={}){privateEpoch++;if(!privateOnly)epoch++;for(const key of pending.keys())if(!privateOnly||JSON.parse(key.slice(prefix.length))[1]!=='PUBLIC')pending.delete(key);publicationAt=0;publicationPending=null;for(const [key,value]of entries())try{if(!privateOnly||!JSON.parse(value).public)remove(key);}catch{remove(key);}}
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
  if(!force&&Date.now()-publicationAt<freshFor)return window.M4L_ACADEMY_WORKSPACE.readyPublication();
  publicationPending??=Promise.resolve(window.M4L_ACADEMY_WORKSPACE.readyPublication(true)).then(value=>{publicationAt=Date.now();return value;}).finally(()=>{publicationPending=null;});
  return publicationPending;
 }
 function authoritative(error){return [401,403,404].includes(error.status);}
 async function load({key:query,public:publicData=false,force=false,revalidate=false,fetcher,onUpdate,onError,fallback=null}){
  changed();const session=token(),realm=context(),ticket=publicData?epoch:privateEpoch,identity=publicData?'PUBLIC':await owner(session);
  const active=()=>ticket===(publicData?epoch:privateEpoch)&&(publicData||session===token()&&realm===context());
  if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');
  if(!publicData&&!identity){await publication(force);const data=await fetcher('');if(!active())throw new DOMException('The Academy account or workspace changed.','AbortError');return data;}
  const key=prefix+JSON.stringify([window.M4L_CONFIG?.API_BASE||location.origin,identity,publicData?'PUBLIC':realm,query]);
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
    if(data.timetableComplete!==false&&!data.warnings?.some(warning=>/timetable.*unavailable/i.test(String(warning))))write(key,{public:publicData,at:Date.now(),checkedAt:Date.now(),day:day(data.timezone),head:publicData?null:head(),data});
    return data;
   })().finally(()=>{if(pending.get(key)===update)pending.delete(key);});
   pending.set(key,update);
  }
  if(cached&&!force){
   void update.then(data=>{if(active())onUpdate?.(data);},error=>{if(!active())return;if(authoritative(error)){if(publicData)remove(key);else invalidate({privateOnly:true});onError?.(error,false);}else if(error.name!=='AbortError')onError?.(error,true);});
   return {...cached,_cacheChecking:true};
  }
  try{return await update;}catch(error){if(authoritative(error)){if(publicData)remove(key);else invalidate({privateOnly:true});}if(cached&&active()&&!authoritative(error)&&error.name!=='AbortError')return {...cached,_cacheMessage:'Showing saved information. Couldn’t check for updates.'};throw error;}
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
  const scope=JSON.stringify([session,realm]),publication=result.head||(result.setupPublication?head():null),publicationKey=publication&&kinds.includes('public-timetable')?JSON.stringify([scope,publication]):null;
  // The setup dialog and its originating Publish action share one rebuild.
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
 window.addEventListener('m4l-academy-session',()=>{if(account!==token()){changed();return;}privateEpoch++;for(const key of pending.keys())if(JSON.parse(key.slice(prefix.length))[1]!=='PUBLIC')pending.delete(key);publicationAt=0;publicationPending=null;});
 window.addEventListener('m4l-academy-session-ended',()=>invalidate({privateOnly:true}));
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)changed();});
})();
