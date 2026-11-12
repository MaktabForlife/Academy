// Install BEFORE the selected child's privacy bootstrap, from pinned local JS.
// No PIN input, ordinary access, token storage or cross-app clock mutation.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'},root='https://ummabbadacademy.app';
 if(window.M4L_V110_LOCAL_CHILD_PREPAINT_READY!==true||c?.enabled!==true||c.nativeChild!==true||c.localProfile!=='msi-local-triple-v1'||!Object.hasOwn(origins,c.app)||location.origin!==origins[c.app]||c.origins?.academy!==root||c.origins?.[c.app]!==location.origin||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin)throw Error('LOCAL_CHILD_PIN_CONFIG_REJECTED');
 if(Object.hasOwn(window,'M4L_V110_CHILD_PIN'))throw Error('LOCAL_CHILD_PIN_ALREADY_SELECTED');
 const nativeFetch=window.fetch.bind(window),opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v),encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));let pending=null,generation=0;
 async function json(path,options={}){
  const response=await nativeFetch(path,{...options,credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('CHILD_PIN_REQUEST_REJECTED');return response.json();
 }
 function discard(){generation++;const old=pending;pending=null;old?.cleanup?.();old?.reject(Error('CHILD_PIN_CANCELLED'));}
 window.addEventListener('pagehide',discard);
 Object.defineProperty(window,'M4L_V110_CHILD_PIN',{value:Object.freeze({
  begin(event){
   if(!(event instanceof Event)||event.isTrusted!==true||!['click','submit','keydown','pointerup'].includes(event.type)||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||pending)return Promise.reject(Error('CHILD_PIN_USER_ACTION_REQUIRED'));
   // Open synchronously while actual user activation is live. No credential,
   // identity, PIN or private intent is ever placed in the popup URL.
   const popup=window.open('about:blank','_blank');if(!popup)return Promise.reject(Error('CHILD_PIN_WINDOW_REQUIRED'));
   const mine=++generation,verifier=random(),state=random();
   return new Promise((resolve,reject)=>{
    const item={mine,popup,verifier,state,resolve,reject,intentId:'',csrf:'',consuming:false,timer:null};
    pending=item;
    const remove=()=>{clearTimeout(item.timer);window.removeEventListener('message',receive);if(pending===item)pending=null;};
    item.cleanup=remove;
    const fail=()=>{remove();reject(Error('CHILD_PIN_NOT_COMPLETED'));};
    const receive=async event=>{
     const value=event.data;
     if(pending!==item||generation!==mine||event.origin!==root||event.source!==popup||!value||value.type!=='UAA_CHILD_PIN_RESULT'||value.app!==c.app||value.intentId!==item.intentId||value.state!==state||!opaque(value.code)||!Number.isSafeInteger(value.expiresAtS)||value.expiresAtS*1000<=Date.now()||item.consuming)return;
     item.consuming=true;
     try{
      const result=await json('/api/auth/v110/pin/consume',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':item.csrf},body:JSON.stringify({code:value.code,verifier,state})});
      if(pending!==item||generation!==mine||result.unlocked!==true||result.session?.app!==c.app)throw Error('CHILD_PIN_CONTEXT_REJECTED');
      // Never reveal the old DOM under a new unlock generation. The new
      // document must pass its actual current-cookie/native bootstrap again.
      window.M4L_V110?.clear('lock');remove();resolve({unlocked:true});location.reload();
     }catch{fail();}
    };
    window.addEventListener('message',receive);
    item.timer=setTimeout(fail,60000);
    (async()=>{
     const csrf=await json('/api/auth/v110/csrf');if(!opaque(csrf.csrf)||pending!==item||generation!==mine)throw Error('CHILD_PIN_CSRF_REJECTED');item.csrf=csrf.csrf;
     const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
     const intent=await json('/api/auth/v110/pin/prepare',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':item.csrf},body:JSON.stringify({challenge,state})});
     if(!opaque(intent.intentId)||!Number.isSafeInteger(intent.expiresAtS)||intent.expiresAtS*1000<=Date.now()||pending!==item||generation!==mine)throw Error('CHILD_PIN_INTENT_REJECTED');
     item.intentId=intent.intentId;
     popup.location.href=root+'/account/child-pin/#'+new URLSearchParams({app:c.app,intent:item.intentId});
    })().catch(fail);
   });
  },
  cancel:discard
 }),writable:false,configurable:false});
})();
