(() => {
  'use strict';
  const WEEK = 7 * 86400000, prefix = 'm4l_library_v1:', scope = window.M4L_ACADEMY_AUTH?.selected===true?location.origin:window.M4L_CONFIG?.API_BASE||location.origin;
  let pendingPublic = null;
  const v2=()=>window.M4L_ACADEMY_AUTH?.selected===true,privateMemory=new Map();
  const checked=entry=>entry&&window.M4L_ACADEMY_AUTH.hasSession()&&window.M4L_ACADEMY_AUTH.isCurrentResult(entry.data);
  const clearPrivateMemory=()=>privateMemory.clear();
  for(const event of ['academy-v2-context','academy-v2-mask','academy-v2-revalidate','m4l-academy-session-ended','pagehide'])window.addEventListener(event,value=>{if(event!=='academy-v2-mask'||value.detail?.masked!==false)clearPrivateMemory();});
  const key = name => prefix + scope + ':' + name;
  function repairVolumeLabels(data) {
    if (!Array.isArray(data?.books)) return data;
    return {...data,books:data.books.map(book=>!book.volumes?book:{...book,volumes:book.volumes.map(volume=>({...volume,
      label:typeof volume.label==='string'?volume.label.replace(/^((?:Part|Volume)\s+(\d+))\s+and\s+(\d+)$/i,
        (label,prefix,first,last)=>Number(first)===Number(last)?prefix:label):volume.label
    }))})};
  }
  function read(name) {
    if(v2()&&name!=='public'){const entry=privateMemory.get(name);if(!checked(entry)){privateMemory.delete(name);return null;}return entry;}
    try {
      const saved = JSON.parse(localStorage.getItem(key(name)) || 'null');
      if (!saved || saved.version !== 1 || !Number.isFinite(saved.savedAt) || saved.savedAt > Date.now()) return null;
      return {...saved, data:name==='public'?repairVolumeLabels(saved.data):saved.data, stale: Date.now() - saved.savedAt >= WEEK};
    } catch { return null; }
  }
  function write(name, data) {
    if(v2()&&name!=='public'){if(!window.M4L_ACADEMY_AUTH.isCurrentResult(data))return null;const entry={version:2,savedAt:Date.now(),data,stale:false};privateMemory.set(name,entry);while(privateMemory.size>16)privateMemory.delete(privateMemory.keys().next().value);return entry;}
    const saved = {version:1,savedAt:Date.now(),data:name==='public'?repairVolumeLabels(data):data};
    try { localStorage.setItem(key(name),JSON.stringify(saved)); } catch { /* Storage may be disabled or full. */ }
    return {...saved,stale:false};
  }
  function clearPersonal() {
    if(v2()){clearPrivateMemory();return;}
    try {
      for (let i=localStorage.length-1;i>=0;i--) { const name=localStorage.key(i); if (name?.startsWith(prefix) && name.includes(':personal:')) localStorage.removeItem(name); }
    } catch {}
  }
  async function owner(session) {
    if(v2())return window.M4L_ACADEMY_AUTH.ownerKey();
    if (!session) return '';
    try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
    catch { return ''; }
  }
  async function publicList(force = false) {
    if(window.M4L_ACADEMY_READ_CACHE){
      const cached=read('public');
      const snapshot=data=>({...write('public',data),...(data._cacheChecking?{message:'Checking for updates…'}:{}),...(data._cacheMessage?{message:'Library update unavailable. Showing saved resources; refresh to try again.'}:{} )});
      const updated=data=>window.dispatchEvent(new CustomEvent('m4l-library-public-updated',{detail:snapshot(data)}));
      try{const data=await window.M4L_ACADEMY_READ_CACHE.load({key:['library-public'],public:true,force,fallback:cached?.data,onUpdate:updated,
       onError:()=>window.dispatchEvent(new CustomEvent('m4l-library-public-updated',{detail:{data:read('public')?.data||cached?.data||{books:[],records:[]},message:'Library update unavailable. Showing saved resources; refresh to try again.'}})),
       fetcher:async(revision,previous)=>{
        if(v2()){
         const base=previous||cached?.data||{},get=async(path,kind)=>{const response=await fetch(path,{cache:force?'reload':'no-cache'});if(!response.ok)throw Error('Library update unavailable.');const value=await response.json();if(kind==='archive'?!Array.isArray(value.books):value.success===false||!value.notModified&&!Array.isArray(value.records))throw Error('Library update unavailable.');return value;};
         const [archive,native]=await Promise.allSettled([get('/academy/open-library/catalogue','archive'),get(window.M4L_ACADEMY_READ_CACHE.publicUrl('/api/academy/open-library/metadata/public',revision),'native')]);
         if(archive.status==='rejected'&&native.status==='rejected')throw Error('Library update unavailable.');
         const books=archive.status==='fulfilled'?archive.value.books:base.books||[],metadata=native.status==='fulfilled'?native.value:null,records=metadata&&!metadata.notModified?metadata.records:base.records||[];
         return {books,records,...(metadata?.readRevision||base.readRevision?{readRevision:metadata?.readRevision||base.readRevision}:{}),...(archive.status==='rejected'||native.status==='rejected'?{_cacheMessage:'One Library source is unavailable. Available public resources are shown.'}:{})};
        }
        const [a,m]=await Promise.all([fetch('/academy/open-library/catalogue',{cache:force?'reload':'default'}),fetch(window.M4L_ACADEMY_READ_CACHE.publicUrl(`${v2()?'':window.M4L_CONFIG?.API_BASE||''}/api/academy/open-library/metadata/public`,revision),{cache:'no-cache'})]);
        if(!a.ok||!m.ok)throw Error('Library update unavailable.');const archive=await a.json(),metadata=await m.json();
        if(!Array.isArray(archive.books)||metadata.success===false||!metadata.notModified&&!Array.isArray(metadata.records))throw Error('Library update unavailable.');
        if(metadata.notModified&&JSON.stringify(archive.books)===JSON.stringify(previous?.books))return metadata;
        return {books:archive.books,records:metadata.notModified?previous.records:metadata.records,readRevision:metadata.readRevision};
       }});return snapshot(data);
      }catch{return {data:cached?.data||{books:[],records:[]},stale:true,message:'Library update unavailable. Showing saved resources where available; refresh to try again.'};}
    }
    const cached = read('public');
    if (!force && cached && !cached.stale) return cached;
    if (pendingPublic) return pendingPublic;
    pendingPublic = (async () => {
      const [archive,metadata] = await Promise.allSettled([
        fetch('/academy/open-library/catalogue',{cache:force?'reload':'default'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.books))throw Error();return data.books;}),
        fetch(`${v2()?'':window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/public`,{cache:force?'reload':'default'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.records))throw Error();return data.records;})
      ]);
      if (archive.status==='fulfilled' && metadata.status==='fulfilled') return write('public',{books:archive.value,records:metadata.value});
      return {data:{books:archive.status==='fulfilled'?archive.value:cached?.data.books||[],records:metadata.status==='fulfilled'?metadata.value:cached?.data.records||[]},savedAt:cached?.savedAt||0,stale:true,message:'Library update unavailable. Showing saved resources where available; refresh to try again.'};
    })();
    try { return await pendingPublic; } finally { pendingPublic=null; }
  }
  window.M4L_LIBRARY_CACHE = {read,write,owner,clearPersonal,publicList};
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)clearPersonal();});
  window.addEventListener('m4l-academy-session',()=>{if(v2()){clearPrivateMemory();return;}if(!localStorage.getItem('m4l_account_token'))clearPersonal();});
})();
