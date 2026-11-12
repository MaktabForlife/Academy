// Fixed fresh local child profile only, before native scripts/private DOM.
(()=>{
 const root=document.documentElement;root.hidden=true;root.classList.add('uaa-v110-masked');root.dataset.uaaV110State='masked';
 try{
  const c=window.M4L_V110_CONFIG,origins={studio:'https://studio.maktabhelper.app',hifz:'https://hifz.maktabhelper.app'};
  if(c?.enabled!==true||c.nativeChild!==true||c.localProfile!=='native-https-local-v1'||!Object.hasOwn(origins,c.app)||location.origin!==origins[c.app]||c.origins?.[c.app]!==location.origin||c.origins?.academy!=='https://maktabhelper.app'||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin||navigator.serviceWorker?.controller)throw Error('CHILD_PREPAINT_CONFIG_REJECTED');
  // Native identity selectors/pending handoff only. Preserve journal/device
  // annotations, timers, completion preferences and all backend/native stores.
  if(c.app==='hifz')for(const key of ['hh_token','hh_switch_accounts','hh_academy_handoff'])sessionStorage.removeItem(key);
  if(c.app==='studio')for(const key of ['m4l_account_token','m4l_account_context','m4l_account_contexts','m4l_account_workspace','maktab_token','maktab_user_type'])localStorage.removeItem(key);
  Object.defineProperty(window,'M4L_V110_LOCAL_CHILD_PREPAINT_READY',{value:true,writable:false,configurable:false});
 }catch{
  root.dataset.uaaV110State='unverifiable';window.fetch=()=>Promise.reject(Error('CHILD_PREPAINT_UNAVAILABLE'));throw Error('CHILD_PREPAINT_UNAVAILABLE');
 }
})();
