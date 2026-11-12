// New local Root navigation only. Native resource URLs remain selectors,
// never authority; no sign-in/token/handoff occurs in a navigation handler.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app',hifz='https://mahadarwa-hifz.ummabbadacademy.app';
 if(c?.enabled!==true||c.nativeCookie!==true||c.localProfile!=='msi-local-triple-v1'||c.app!=='academy'||location.origin!==root||c.origins?.studio!==studio||c.origins?.hifz!==hifz)throw Error('LOCAL_CHILD_NAVIGATION_CONFIG_REJECTED');
 const reserved=/^\/(?:api|auth|internal|__|connect|academy)(?:\/|$)/;
 const credential=/^(?:code|token|state|session|verifier|challenge|pin|return|redirect|callback)$/i;
 function destination(value){
  let u;try{u=new URL(value,root);}catch{return null;}
  if(![studio,hifz].includes(u.origin)||u.username||u.password||u.href.length>2048||/(?:^|[&#?])(?:code|token|session|verifier|pin)=/i.test(u.hash)||[...u.searchParams.keys()].some(k=>credential.test(k)))return null;
  if(u.origin===studio){
   if(reserved.test(u.pathname)||!/^[A-Za-z0-9_/.%-]*$/.test(u.pathname)||/%(?:2f|5c|2e)/i.test(u.pathname))return null;
   return {app:'studio',url:u.href};
  }
  if(!/^\/(?:[A-Za-z0-9]+)?\/?$/.test(u.pathname)||u.hash||[...u.searchParams].some(([k,v])=>k!=='academy'||!/^[A-Za-z0-9_-]{1,64}$/.test(v)))return null;
  return {app:'hifz',url:u.href};
 }
 function go(event,value){
  if(!(event instanceof Event)||event.isTrusted!==true||!navigator.userActivation?.isActive||document.visibilityState!=='visible')return false;
  const d=destination(value);if(!d)return false;
  if(d.app==='studio'){
   if(window.M4L_V110_WEBSITE_ACTION?.destination(d.url))return false;
   if(window.M4L_CIRCLES_NATIVE?.canLeave?.()===false)return false;
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
  // Edit website is the owner-approved new-tab exception. Reserve FIRST.
  const ticket=window.M4L_V110_WEBSITE_ACTION.reserve(event);
  try{
   const stamp=await window.M4L_V110.capture();
   if(!await window.M4L_V110.current(stamp))throw Error('Your Academy sign-in changed.');
   const response=await window.fetch('/api/academy/website-studio/selection',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)});
   const result=await response.json();
   if(!await window.M4L_V110.current(stamp))throw Error('Your Academy sign-in changed.');
   if(!response.ok)throw Error(result?.code==='LOCAL_AUTH_DELIVERY_PENDING'?'Academy saved the change, but connected apps are still pending. Check your sign-in before submitting again.':'This website destination could not be checked. Reopen it from its current programme.');
   if(result.external===false){ticket.cancel();return false;}
   if(result.external!==true||!window.M4L_V110_WEBSITE_ACTION.destination(result.destination))throw Error('This website destination could not be checked.');
   await ticket.finish(result.destination);return true;
  }catch(error){ticket.cancel();throw error;}
 }
 Object.defineProperty(window,'M4L_V110_CHILD_NAVIGATION',{value:Object.freeze({open:go,openStudioSelection}),writable:false,configurable:false});
 document.addEventListener('click',event=>{
  note(event);
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest?.('a[href]');if(!link)return;
  let u;try{u=new URL(link.href,root);}catch{return;}
  if(![studio,hifz].includes(u.origin))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(u.origin===studio&&window.M4L_V110_WEBSITE_ACTION?.destination(link.href)){
   const report=error=>{let node=document.getElementById('uaa-website-action-message');if(!node){node=document.createElement('p');node.id='uaa-website-action-message';node.setAttribute('role','alert');document.body.appendChild(node);}node.textContent=error.message;};
   if(!['read','edit'].includes(link.dataset.uaaWebsiteAction)){report(Error('Open this website from its current programme action.'));return;}
   try{window.M4L_V110_WEBSITE_ACTION.reserve(event).finish(link.href).catch(report);}catch(error){report(error);}return;
  }
  go(event,link.href);
 },true);
})();
