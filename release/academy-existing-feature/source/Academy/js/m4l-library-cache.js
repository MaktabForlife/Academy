(() => {
  'use strict';
  const WEEK = 7 * 86400000, prefix = 'm4l_library_v1:', scope = window.M4L_CONFIG?.API_BASE || location.origin;
  let pendingPublic = null;
  const key = name => prefix + scope + ':' + name;
  function repairVolumeLabels(data) {
    if (!Array.isArray(data?.books)) return data;
    return {...data,books:data.books.map(book=>!book.volumes?book:{...book,volumes:book.volumes.map(volume=>({...volume,
      label:typeof volume.label==='string'?volume.label.replace(/^((?:Part|Volume)\s+(\d+))\s+and\s+(\d+)$/i,
        (label,prefix,first,last)=>Number(first)===Number(last)?prefix:label):volume.label
    }))})};
  }
  function read(name) {
    try {
      const saved = JSON.parse(localStorage.getItem(key(name)) || 'null');
      if (!saved || saved.version !== 1 || !Number.isFinite(saved.savedAt) || saved.savedAt > Date.now()) return null;
      return {...saved, data:name==='public'?repairVolumeLabels(saved.data):saved.data, stale: Date.now() - saved.savedAt >= WEEK};
    } catch { return null; }
  }
  function write(name, data) {
    const saved = {version:1,savedAt:Date.now(),data:name==='public'?repairVolumeLabels(data):data};
    try { localStorage.setItem(key(name),JSON.stringify(saved)); } catch { /* Storage may be disabled or full. */ }
    return {...saved,stale:false};
  }
  function clearPersonal() {
    try {
      for (let i=localStorage.length-1;i>=0;i--) { const name=localStorage.key(i); if (name?.startsWith(prefix) && name.includes(':personal:')) localStorage.removeItem(name); }
    } catch {}
  }
  async function owner(session) {
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
        const [a,m]=await Promise.all([fetch('/academy/open-library/catalogue',{cache:force?'reload':'default'}),fetch(window.M4L_ACADEMY_READ_CACHE.publicUrl(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/open-library/metadata/public`,revision),{cache:'no-cache'})]);
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
        fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/public`,{cache:force?'reload':'default'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.records))throw Error();return data.records;})
      ]);
      if (archive.status==='fulfilled' && metadata.status==='fulfilled') return write('public',{books:archive.value,records:metadata.value});
      return {data:{books:archive.status==='fulfilled'?archive.value:cached?.data.books||[],records:metadata.status==='fulfilled'?metadata.value:cached?.data.records||[]},savedAt:cached?.savedAt||0,stale:true,message:'Library update unavailable. Showing saved resources where available; refresh to try again.'};
    })();
    try { return await pendingPublic; } finally { pendingPublic=null; }
  }
  window.M4L_LIBRARY_CACHE = {read,write,owner,clearPersonal,publicList};
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)clearPersonal();});
  window.addEventListener('m4l-academy-session',()=>{if(!localStorage.getItem('m4l_account_token'))clearPersonal();});
})();
