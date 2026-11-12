// SOURCE ONLY. Real native Library view, not a fixture/preview route.
const config=window.M4L_V110_CONFIG,api=window.M4L_V110,boundary=window.M4L_ACADEMY_WORKSPACE;
const root='https://ummabbadacademy.app',path='/api/academy/website-studio/reader-library';
if(config?.enabled!==true||config.nativeCookie!==true||config.app!=='academy'||config.localProfile!=='msi-local-triple-v1'||config.readerAdmission!=='NATIVE_RESOURCE_V1'||location.origin!==root||window.top!==window||new URLSearchParams(location.search).get('view')!=='studio'||typeof api?.capture!=='function'||typeof api.current!=='function')throw Error('NATIVE_LIBRARY_CONFIG');
const $=id=>document.getElementById(id),plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,k)=>plain(v)&&Object.keys(v).sort().join()===k.slice().sort().join();
const stable=v=>typeof v==='string'&&/^COURSE:[-A-Za-z0-9_:]{1,173}$/.test(v);
const status=$('al-status'),content=$('al-content'),host=$('al-results'),refresh=$('al-refresh');
if(!status||!content||!host||!refresh)throw Error('NATIVE_LIBRARY_HOST');
let generation=0,abort=null,busy=false,next=null,owner=null;
const more=document.createElement('button');more.type='button';more.textContent='Show more courses';more.hidden=true;content.append(more);
for(const node of document.querySelectorAll('.al-filters,#al-categories'))node.hidden=true;
for(const node of document.querySelectorAll('.al-tabs [aria-current]'))node.removeAttribute('aria-current');
document.querySelector('[data-studio-library-tab]')?.setAttribute('aria-current','page');
const workspace=()=>{const mode=boundary?.current?.();if(!['LEARN','TEACH'].includes(mode)||boundary.adminRealm?.()!==false||boundary.classView?.())throw Error('Choose your personal Learn or Teach workspace.');return mode;};
function clear(){
 generation++;abort?.abort();abort=null;busy=false;next=null;owner=null;host.replaceChildren();content.hidden=true;more.hidden=true;refresh.disabled=false;
 window.M4L_V110_WEBSITE_ACTION?.cancel?.();
}
function invalidated(){clear();status.textContent='Your library is locked. Confirm your Academy sign-in, then refresh.';}
for(const name of ['uaa-v110-private-cleared','m4l-academy-session','pagehide'])window.addEventListener(name,invalidated);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')invalidated();});
window.addEventListener('storage',event=>{if(event.key===null||['m4l_account_token','m4l_account_context','m4l_account_workspace'].includes(event.key))invalidated();});
async function load(append=false){
 if(busy||document.visibilityState!=='visible')return;
 if(!append)clear();
 const gen=generation,mode=workspace(),page=append?next:0;if(append&&page===null)return;
 busy=true;refresh.disabled=true;more.disabled=true;abort=new AbortController();const signal=abort.signal;status.textContent='Checking your Studio courses…';
 let stamp;
 const live=()=>{if(gen!==generation||signal.aborted||document.visibilityState!=='visible'||workspace()!==mode)throw Error('Your Academy workspace changed.');};
 const current=async()=>{live();await api.current(stamp);live();};
 async function json(url,options={}){
  await current();const r=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal});await current();
  if(r.status!==200){if(r.status===401)invalidated();throw Error('Your library could not be checked.');}
  const value=await r.json();await current();if(!plain(value))throw Error('Your library could not be checked.');return value;
 }
 try{
  stamp=await api.capture();await current();
  const proof=await json('/auth/v110/csrf');if(!exact(proof,['csrf'])||typeof proof.csrf!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(proof.csrf))throw Error('Your sign-in needs confirmation.');
  const value=await json(path,{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':proof.csrf,'X-Academy-Workspace':mode},body:JSON.stringify({page})});
  if(!exact(value,['items','next'])||!Array.isArray(value.items)||value.items.length>4||value.next!==null&&(!Number.isSafeInteger(value.next)||value.next<1||value.next>12))throw Error('The library result could not be confirmed.');
  const seen=new Set(),items=value.items.map(item=>{
   if(!exact(item,['selection','label'])||!exact(item.selection,['activityKey'])||!stable(item.selection.activityKey)||typeof item.label!=='string'||!item.label||item.label.length>160||seen.has(item.selection.activityKey))throw Error('The library result could not be confirmed.');
   seen.add(item.selection.activityKey);return Object.freeze({selection:Object.freeze({...item.selection}),label:item.label});
  });
  await current();if(append&&owner!==stamp.accountId)throw Error('Your Academy account changed.');owner=stamp.accountId;
  for(const item of items){
   const button=document.createElement('button');button.type='button';button.className='button al-resource';button.textContent=item.label;
   button.addEventListener('click',event=>{
    const stillCurrent=()=>gen===generation&&owner===stamp.accountId&&button.isConnected&&document.visibilityState==='visible'&&boundary.current()===mode&&boundary.adminRealm()===false&&!boundary.classView?.();
    try{
     if(!stillCurrent()||typeof window.M4L_V110_WEBSITE_ACTION?.openReader!=='function')throw Error('Reopen the current library.');
     const opened=window.M4L_V110_WEBSITE_ACTION.openReader(event,item.selection,{workspace:mode,current:stillCurrent});
     button.disabled=true;Promise.resolve(opened).catch(()=>{if(gen===generation)status.textContent='The website connection could not be confirmed. Check Studio before trying again.';}).finally(()=>{if(button.isConnected)button.disabled=false;});
    }catch{status.textContent='The website could not be opened. Refresh your current library.';}
   });
   host.append(button);
  }
  next=value.next;more.hidden=next===null;content.hidden=false;status.textContent=host.children.length?'Open a course to read its published website.':next?'No courses on this page. Select Show more to continue.':'No published Studio courses are available in this view.';
 }catch(error){if(gen===generation){clear();status.textContent=error?.name==='AbortError'?'The library check was cancelled.':'Your library could not be checked. Confirm your Academy sign-in and select Refresh.';}}
 finally{if(gen===generation){busy=false;refresh.disabled=false;more.disabled=false;}}
}
refresh.addEventListener('click',()=>{try{void load(false).catch(invalidated);}catch{invalidated();}});
more.addEventListener('click',()=>{try{void load(true).catch(invalidated);}catch{invalidated();}});
status.textContent='Select Refresh to check your Studio courses.';content.hidden=true;
