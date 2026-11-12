// First own-child admission, installed before privacy startup. PKCE/state stay RAM.
// Existing families use the separate genuine-PIN flow; no idle/admission bypass.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'},root='https://ummabbadacademy.app';
 if(window.M4L_V110_LOCAL_CHILD_PREPAINT_READY!==true||c?.enabled!==true||c.nativeChild!==true||c.localProfile!=='msi-local-triple-v1'||!Object.hasOwn(origins,c.app)||location.origin!==origins[c.app]||c.origins?.academy!==root||c.origins?.[c.app]!==location.origin||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin)throw Error('LOCAL_CHILD_ADMISSION_CONFIG_REJECTED');
 if(Object.hasOwn(window,'M4L_V110_CHILD_ADMISSION'))throw Error('LOCAL_CHILD_ADMISSION_ALREADY_SELECTED');
 const nativeFetch=window.fetch.bind(window),opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v),encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));let pending=null,generation=0;
 const mask=()=>{document.documentElement.classList.add('uaa-v110-masked');document.documentElement.dataset.uaaV110State='masked';};
 async function json(path,options,signal){
  const response=await nativeFetch(path,{...options,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  let value;try{value=await response.json();}catch{throw Error('CHILD_ADMISSION_NOT_CONFIRMED');}
  if(!response.ok)throw Error(response.status===503?'CHILD_ADMISSION_OUTCOME_UNCONFIRMED':'CHILD_ADMISSION_REJECTED');
  return value;
 }
 function cancel(){
  generation++;const item=pending;pending=null;
  if(item){item.abort.abort();item.cleanup();try{item.popup.close();}catch{}item.reject(Error('CHILD_ADMISSION_CANCELLED'));}
 }
 window.addEventListener('pagehide',cancel);
 Object.defineProperty(window,'M4L_V110_CHILD_ADMISSION',{value:Object.freeze({
  begin(event){
   if(!(event instanceof Event)||event.isTrusted!==true||!['click','submit','keydown','pointerup'].includes(event.type)||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||pending)return Promise.reject(Error('CHILD_ADMISSION_USER_ACTION_REQUIRED'));
   const popup=window.open('about:blank','_blank');if(!popup)return Promise.reject(Error('CHILD_ADMISSION_WINDOW_REQUIRED'));
   mask();const mine=++generation,verifier=random(),state=random(),abort=new AbortController();
   return new Promise((resolve,reject)=>{
    const item={popup,mine,verifier,state,abort,reject,consuming:false,timer:null};pending=item;
    const remove=()=>{clearTimeout(item.timer);window.removeEventListener('message',receive);if(pending===item)pending=null;};
    item.cleanup=remove;
    const fail=code=>{if(pending!==item)return;remove();abort.abort();try{popup.close();}catch{}mask();reject(Error(code||'CHILD_ADMISSION_NOT_COMPLETED'));};
    const current=()=>pending===item&&generation===mine&&!abort.signal.aborted;
    const receive=async event=>{
     const v=event.data;
     if(!current()||event.origin!==root||event.source!==popup||!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!=='app,code,replyDeadlineMs,state,type'||v.type!=='UAA_CHILD_ADMISSION_RESULT'||v.app!==c.app||v.state!==state||!opaque(v.code)||!Number.isSafeInteger(v.replyDeadlineMs)||v.replyDeadlineMs<=Date.now()||v.replyDeadlineMs>Date.now()+61000||item.consuming)return;
     item.consuming=true;
     try{
      const result=await json('/api/auth/v110/admission/consume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:v.code,verifier,state})},abort.signal);
      if(!current()||result.admitted!==true||result.app!==c.app||result.session?.app!==c.app)throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
      // A successful cookie response never unmasks an old document. Native
      // application startup must re-enter current-cookie privacy on a new load.
      try{Promise.resolve(window.M4L_V110?.clear('lock')).catch(()=>{});}catch{}remove();abort.abort();try{popup.close();}catch{}resolve({admitted:true});location.reload();
     }catch(error){fail(error.message==='CHILD_ADMISSION_OUTCOME_UNCONFIRMED'?error.message:'CHILD_ADMISSION_NOT_CONFIRMED');}
    };
    window.addEventListener('message',receive);item.timer=setTimeout(()=>fail('CHILD_ADMISSION_EXPIRED'),120000);
    (async()=>{
     const status=await json('/api/auth/v110/admission/status',{method:'GET'},abort.signal);
     if(!current())return;
     if(status.state==='EXISTING')throw Error('CHILD_ADMISSION_USE_OWN_PIN');
     if(Object.keys(status).join(',')!=='state'||status.state!=='REQUIRED')throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
     const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
     if(!current())return;
     popup.location.href=root+'/account/child-admission/#'+new URLSearchParams({app:c.app,challenge,state});
    })().catch(error=>fail(error.message==='CHILD_ADMISSION_USE_OWN_PIN'?error.message:'CHILD_ADMISSION_NOT_CONFIRMED'));
   });
  },cancel
 }),writable:false,configurable:false});
})();
