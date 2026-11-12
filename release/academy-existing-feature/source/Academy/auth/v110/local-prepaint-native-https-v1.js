// Only the NEW isolated logical Root profile. Before any native script/DOM.
(()=>{
 const root=document.documentElement;root.hidden=true;root.classList.add('uaa-v110-masked');root.dataset.uaaV110State='masked';
 const c=window.M4L_V110_CONFIG;
 const mask=document.createElement('style');
 mask.textContent='html.uaa-v110-masked body>*{visibility:hidden!important}';
 document.head.append(mask);
 try{
  if(c?.localProfile!=='native-https-local-v1'||c.enabled!==true||c.nativeCookie!==true||c.nativeChild===true||c.app!=='academy'||location.origin!=='https://maktabhelper.app'||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin||Object.keys(c.origins||{}).sort().join(',')!=='academy,hifz,studio'||c.origins.academy!==location.origin||c.origins.studio!=='https://studio.maktabhelper.app'||c.origins.hifz!=='https://hifz.maktabhelper.app')throw Error('LOCAL_PREPAINT_CONFIGURATION_REJECTED');
  // Dedicated NEW profile must be uncontrolled; service-worker retirement is a
  // separately reviewed launcher/browser action, never silently performed here.
  if(navigator.serviceWorker?.controller)throw Error('LOCAL_CONTROLLED_DOCUMENT_REJECTED');
  const token=localStorage.getItem('m4l_account_token')||'';
  if(!/^uaa-(?:session|context):/.test(token)){
   // Exact owning native sign-out selector/cache contract, only this new origin.
   for(const key of ['m4l_account_token','m4l_account_context','m4l_account_contexts','m4l_account_workspace','maktab_token','maktab_user_type'])localStorage.removeItem(key);
   for(let i=localStorage.length-1;i>=0;i--){
    const key=localStorage.key(i);
    if(key&&(['m4l_app_cache_','maktab_timetable_cache_','m4l_academy_timetable_'].some(prefix=>key.startsWith(prefix))||key.startsWith('m4l_library_v1:')&&key.includes(':personal:')))localStorage.removeItem(key);
   }
   for(const key of ['m4l_account_view_v1','m4l_academy_signed_in'])sessionStorage.removeItem(key);
   for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key&&(key.startsWith('m4l_admin_progress_dashboard_')||key.startsWith('m4l_academy_daily_timetable_')))sessionStorage.removeItem(key);}
  }
  // Keep root.hidden until synchronous owning bootstrap installs its mask.
  // Final HTML CSP/browser proof must admit the exact owning inline style.
  Object.defineProperty(window,'M4L_V110_LOCAL_PREPAINT_READY',{value:true,writable:false,configurable:false});
 }catch{
  root.dataset.uaaV110State='unverifiable';
  window.fetch=()=>Promise.reject(Error('LOCAL_PREPAINT_UNAVAILABLE'));
  throw Error('LOCAL_PREPAINT_UNAVAILABLE');
 }
})();
