(() => {
 'use strict';
 // Session metadata only. Protected files, player URLs and editor drafts never enter this store.
 const prefix='m4l_media_rail_v1:',ttl=30*60*1000,maxEntries=20,maxBytes=2*1024*1024,memory=new Map();
 const currentToken=()=>localStorage.getItem('m4l_account_token')||'';
 let account=currentToken(),epoch=0;
 const storage=()=>{try{return window.sessionStorage;}catch{return null;}};
 function entries(){const values=new Map(memory),store=storage();try{for(let i=0;i<(store?.length||0);i++){const key=store.key(i);if(key?.startsWith(prefix))values.set(key,store.getItem(key));}}catch{}return values;}
 function remove(key){memory.delete(key);try{storage()?.removeItem(key);}catch{}}
 function clear(){epoch++;for(const key of entries().keys())remove(key);}
 function changed(){const next=currentToken();if(next!==account){clear();account=next;}}
 async function owner(value){if(!value)return '';try{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}catch{return '';}}
 function key(scope){return prefix+JSON.stringify([window.M4L_CONFIG?.API_BASE||location.origin,scope.owner,scope.workspace,scope.classView,scope.activityKey,scope.runId,scope.learnerView]);}
 function read(scope,head){changed();const name=key(scope);let raw=memory.get(name);try{raw=storage()?.getItem(name)||raw;}catch{}try{const entry=JSON.parse(raw);if(entry.version!==1||Date.now()-entry.savedAt>ttl||entry.savedAt>Date.now()||head&&entry.head!==head||!entry.data?.cacheRevision)throw Error();return entry;}catch{remove(name);return null;}}
 function write(scope,data,head,ticket=epoch){changed();if(!scope.owner||ticket!==epoch||!data?.cacheRevision)return;
  // Defence in depth: the feed contains IDs and display metadata, never URLs or credentials.
  const raw=JSON.stringify({version:1,savedAt:Date.now(),head:head||null,scope,data},(field,value)=>/^(url|embedUrl|object_key|objectKey|youtube_id|token|authorization)$/i.test(field)?undefined:value);
  if(raw.length>400*1024)return;const name=key(scope);memory.set(name,raw);try{storage()?.setItem(name,raw);}catch{}
  const all=[...entries()].map(([key,value])=>{try{return {key,bytes:value.length*2,time:JSON.parse(value).savedAt};}catch{return {key,bytes:(value?.length||0)*2,time:0};}}).sort((a,b)=>b.time-a.time);let total=0;
  all.forEach((entry,index)=>{total+=entry.bytes;if(index>=maxEntries||total>maxBytes||Date.now()-entry.time>ttl)remove(entry.key);});
 }
 function invalidate(scope){epoch++;for(const [key,raw] of entries())try{const saved=JSON.parse(raw).scope;if(saved.owner===scope.owner&&saved.activityKey===scope.activityKey)remove(key);}catch{remove(key);}}
 window.M4L_LESSON_MEDIA_CACHE={owner,read,write,invalidate,clear,ticket:()=>epoch};
 window.addEventListener('m4l-academy-session',changed);
 window.addEventListener('m4l-academy-session-ended',()=>{clear();account=currentToken();});
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)changed();});
})();
