// SOURCE ONLY checked native website new-tab successor; selected pilot unchanged.
// Plain resource links stay unavailable; native programme actions use checked selection.
// New local Root navigation only. Native resource URLs remain selectors,
// never authority; no sign-in/token/handoff occurs in a navigation handler.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app',hifz='https://mahadarwa-hifz.ummabbadacademy.app';
 if(c?.enabled!==true||c.nativeCookie!==true||c.localProfile!=='msi-local-triple-v1'||c.app!=='academy'||c.localRoutePolicy!=='NATIVE_WEBSITE_HIFZ_V1'||c.websiteAdmission!=='ROOT_GESTURE_V2'||location.origin!==root||c.origins?.studio!==studio||c.origins?.hifz!==hifz)throw Error('LOCAL_CHILD_NAVIGATION_CONFIG_REJECTED');
 const reserved=/^\/(?:api|auth|internal|__|connect|academy)(?:\/|$)/;
 const credential=/^(?:code|token|state|session|verifier|challenge|pin|return|redirect|callback)$/i;
 function destination(value){
  let u;try{u=new URL(value,root);}catch{return null;}
  if(![studio,hifz].includes(u.origin)||u.username||u.password||u.href.length>2048||/(?:^|[&#?])(?:code|token|session|verifier|pin)=/i.test(u.hash)||[...u.searchParams.keys()].some(k=>credential.test(k)))return null;
  if(u.origin===studio){
   if(reserved.test(u.pathname)||!/^[A-Za-z0-9_/.%-]*$/.test(u.pathname)||/%(?:2f|5c|2e)/i.test(u.pathname))return null;
   return {app:'studio',url:u.href,disabled:u.pathname.replace(/\/$/,'')==='/builder'||u.pathname.replace(/\/$/,'')==='/studio'&&u.searchParams.has('website')};
  }
  if(!/^\/(?:[A-Za-z0-9]+)?\/?$/.test(u.pathname)||u.hash||[...u.searchParams].some(([k,v])=>k!=='academy'||!/^[A-Za-z0-9_-]{1,64}$/.test(v)))return null;
  return {app:'hifz',url:u.href};
 }
 function unavailable(){
  let panel=document.querySelector('[data-uaa-local-disabled-website]');
  if(panel)return;
  panel=document.createElement('section');panel.className='uaa-root-pin-required';
  panel.setAttribute('data-uaa-local-disabled-website','');panel.setAttribute('role','alert');
  const text=document.createElement('p');text.textContent='Website Read/Edit is disabled in this local test. Use Academy or the Studio workspace.';
  const close=document.createElement('button');close.type='button';close.className='button secondary';close.textContent='Close';
  close.addEventListener('click',()=>panel.remove());panel.append(text,close);document.body.append(panel);
 }
 function go(event,value){
  if(!(event instanceof Event)||event.isTrusted!==true||!navigator.userActivation?.isActive||document.visibilityState!=='visible')return false;
  const d=destination(value);if(!d)return false;
  if(d.disabled){unavailable();return false;}
  if(window.M4L_CIRCLES_NATIVE?.canLeave?.()===false)return false;
  if(d.app==='studio'){
   window.M4L_ACADEMY_HISTORY?.prepare?.(d.url);location.assign(d.url);
  }else window.open(d.url,'_blank','noopener,noreferrer');
  return true;
 }
 let lastEvent=null,lastEventAt=0;
 const note=event=>{if(event instanceof Event&&event.isTrusted===true&&navigator.userActivation?.isActive&&document.visibilityState==='visible'){lastEvent=event;lastEventAt=performance.now();}};
 for(const type of ['submit','keydown','pointerup'])document.addEventListener(type,note,true);
 async function openStudioSelection(selection){
  const event=lastEvent;if(!event||performance.now()-lastEventAt>5000||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||window.M4L_CIRCLES_NATIVE?.canLeave?.()===false)throw Error('Select the website action again when you are ready.');
  if(!selection||Object.getPrototypeOf(selection)!==Object.prototype||Object.keys(selection).length>4||Object.keys(selection).some(k=>!['activityKey','surahId','edit','lesson'].includes(k)))throw Error('Choose an existing website.');
  const input=Object.fromEntries(Object.entries(selection).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
  if(!/^[-A-Za-z0-9_:]{1,180}$/.test(input.activityKey||''))throw Error('Choose an existing website.');
   // Reserve only a neutral owned tab during this trusted gesture.
   const action=window.M4L_V110_WEBSITE_ACTION;
   if(typeof action?.reserve!=='function'||typeof action.destination!=='function')throw Error('The website connection is unavailable.');
   const ticket=action.reserve(event);
   try{
    const stamp=await window.M4L_V110.capture();
    await window.M4L_V110.current(stamp);
    const response=await window.fetch('/api/academy/website-studio/selection',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)});
    await window.M4L_V110.current(stamp);
    const result=await response.json();
    await window.M4L_V110.current(stamp);
    if(!response.ok)throw Error('This website destination could not be checked. Reopen it from its current programme.');
    if(result.external===false){ticket.cancel();return false;}
    if(result.external!==true||!action.destination(result.destination))throw Error('This website destination could not be checked.');
    await window.M4L_V110.current(stamp);
    await ticket.finish(result.destination);
    // The owned helper checks current context through its final DONE boundary;
    // the child now owns native navigation and private-page verification.
    return true;
   }catch(error){ticket.cancel();throw error;}
 }
 Object.defineProperty(window,'M4L_V110_CHILD_NAVIGATION',{value:Object.freeze({open:go,openStudioSelection}),writable:false,configurable:false});
 document.addEventListener('click',event=>{
  note(event);
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest?.('a[href]');if(!link)return;
  let u;try{u=new URL(link.href,root);}catch{return;}
  if(![studio,hifz].includes(u.origin))return;
  event.preventDefault();event.stopImmediatePropagation();go(event,link.href);
 },true);
})();
