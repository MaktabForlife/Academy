// Private, account-partitioned IndexedDB records. Never use shared Course caches.
let database;
export const journalDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export const journalBase=base=>String(base||'').replace(/\/$/,'');
export async function clearJournalSession({base='',token='',device=journalDevice()}={}){
 if(!token)return;
 await device.clearSession(await journalDigest(journalBase(base)+'|'+token));
}
function open(){
 if(database)return database;
 database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('m4l-private-student-journals-v2',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('records');
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
  request.onerror=()=>{database=null;reject(request.error||Error('Device storage is unavailable.'));};
 });return database;
}
export function journalDevice(){
 async function transaction(mode,work){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),store=tx.objectStore('records');let value;try{work(store,result=>{value=result;});}catch(error){reject(error);return;}tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('Device storage is unavailable.'));tx.onabort=()=>reject(tx.error||Error('Device storage is unavailable.'));});}
 return {
  get:key=>transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result??null);}),
  list:prefix=>transaction('readonly',(store,done)=>{const request=store.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));request.onsuccess=()=>done(request.result);}),
  put:(rows,{sessionKey}={})=>transaction('readwrite',store=>{
   const put=()=>{for(const [key,value] of rows)store.put(value,key);};
   if(!sessionKey){put();return;}
   // A logout transaction blocks late responses from recreating private records.
   const request=store.get('blocked:'+sessionKey);request.onsuccess=()=>{if(request.result)store.transaction.abort();else put();};
  }),
  clearSession:sessionKey=>transaction('readwrite',store=>{
   const block=key=>store.put({endedAt:Date.now()},'blocked:'+key);
   block(sessionKey);
   const request=store.get('session:'+sessionKey);request.onsuccess=()=>{
    const owner=request.result?.ownerKey;store.delete('session:'+sessionKey);if(!owner)return;
    store.delete('copy:'+owner);
    const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;
     if(String(row.key).startsWith('draft:'+owner+':'))row.delete();
     if(String(row.key).startsWith('session:')&&row.value?.ownerKey===owner){block(String(row.key).slice(8));row.delete();}
     row.continue();
    };
   };
  }),
  remove:keys=>transaction('readwrite',store=>{for(const key of keys)store.delete(key);}),
  removePrefix:prefix=>transaction('readwrite',store=>{const request=store.openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));request.onsuccess=()=>{const cursor=request.result;if(cursor){store.delete(cursor.key);cursor.continue();}};})
 };
}
