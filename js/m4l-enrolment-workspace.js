// Reuse the authorised inbox inside a selected Program or Course workspace.
(()=>{'use strict';
 const mounted=new WeakMap(),pending=new WeakMap();
 async function open(host,activityKey){
  if(!/^(PROGRAM|COURSE):.+$/.test(activityKey))throw Error('Select a saved Program or Course first.');
  if(mounted.has(host)){await mounted.get(host).setActivity(activityKey);return;}
  if(pending.has(host)){await pending.get(host);return open(host,activityKey);}
  const owner=localStorage.getItem('m4l_account_token')||'';
  const promise=(async()=>{
   const response=await fetch('/academy/enrolment/manage/',{cache:'no-cache'});
   if(!response.ok)throw Error('Enrolment requests could not load. Try again.');
   const doc=new DOMParser().parseFromString(await response.text(),'text/html'),source=doc.querySelector('main.enrolment-main');
   if(!source)throw Error('Enrolment requests are unavailable. Try again.');
   if(owner!==(localStorage.getItem('m4l_account_token')||''))throw Error('Your Academy account changed. Open this page again.');
   source.querySelector('header.enrolment-heading')?.remove();
   host.classList.add('enrolment-embedded');host.innerHTML=source.innerHTML;
   mounted.set(host,window.M4L_ENROLMENT_ADMIN.mount(host,{activityKey,requestsOnly:true}));
  })().finally(()=>pending.delete(host));
  pending.set(host,promise);await promise;
 }
 window.M4L_ENROLMENT_WORKSPACE={open,canLeave:host=>mounted.get(host)?.canLeave()!==false,reset:host=>mounted.get(host)?.reset()};
})();
