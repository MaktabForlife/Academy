// First-family admission through this child's same-origin HTTPS API.
// PKCE/state remain in RAM. Existing families require their own native PIN.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,root='https://maktabhelper.app',origins={studio:'https://studio.maktabhelper.app',hifz:'https://hifz.maktabhelper.app'};
 if(window.M4L_V110_LOCAL_CHILD_PREPAINT_READY!==true||c?.enabled!==true||c.nativeChild!==true||c.localProfile!=='native-https-local-v1'||!Object.hasOwn(origins,c.app)||location.origin!==origins[c.app]||c.origins?.academy!==root||c.origins?.[c.app]!==location.origin||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin)throw Error('CHILD_ADMISSION_CONFIG_REJECTED');
 if(Object.hasOwn(window,'M4L_V110_CHILD_ADMISSION'))throw Error('CHILD_ADMISSION_ALREADY_SELECTED');
 const nativeFetch=window.fetch.bind(window),opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v),encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
 const plain=v=>Boolean(v&&Object.getPrototypeOf(v)===Object.prototype);
 const mask=()=>{document.documentElement.classList.add('uaa-v110-masked');document.documentElement.dataset.uaaV110State='masked';};
 let pending=null,generation=0;
 async function json(path,options,signal){
  const response=await nativeFetch(path,{...options,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  const reader=response.body?.getReader();if(!reader)throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
  const chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}throw Error('CHILD_ADMISSION_NOT_CONFIRMED');}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('CHILD_ADMISSION_NOT_CONFIRMED');}
  if(!response.ok){if(value?.code==='ACADEMY_RENEWAL_REQUIRED')throw Error('ACADEMY_RENEWAL_REQUIRED');throw Error(response.status===503?'CHILD_ADMISSION_OUTCOME_UNCONFIRMED':'CHILD_ADMISSION_REJECTED');}
  return value;
 }
 function cancel(){
  generation++;const item=pending;if(!item)return;pending=null;clearTimeout(item.timer);item.abort.abort();mask();item.reject(Error('CHILD_ADMISSION_CANCELLED'));
 }
 window.addEventListener('pagehide',cancel);
 Object.defineProperty(window,'M4L_V110_CHILD_ADMISSION',{value:Object.freeze({
  begin(event){
   if(!(event instanceof Event)||event.isTrusted!==true||!['click','submit','keydown','pointerup'].includes(event.type)||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||pending)return Promise.reject(Error('CHILD_ADMISSION_USER_ACTION_REQUIRED'));
   mask();const mine=++generation,verifier=random(),state=random(),abort=new AbortController();
   return new Promise((resolve,reject)=>{
    const item={mine,abort,reject,timer:null};pending=item;
    const current=()=>pending===item&&generation===mine&&!abort.signal.aborted;
    const remove=()=>{clearTimeout(item.timer);if(pending===item)pending=null;};
    const fail=code=>{if(pending!==item)return;remove();abort.abort();mask();reject(Error(code));};
    item.timer=setTimeout(()=>fail('CHILD_ADMISSION_EXPIRED'),120000);
    (async()=>{
     const status=await json('/api/auth/v110/admission/status',{method:'GET'},abort.signal);if(!current())return;
     if(plain(status)&&status.state==='EXISTING')throw Error('CHILD_ADMISSION_USE_OWN_PIN');
     if(!plain(status)||Object.keys(status).join(',')!=='state'||status.state!=='REQUIRED')throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
     const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));if(!current())return;
     const staged=await json('/api/auth/v110/admission/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,state})},abort.signal);if(!current())return;
     const now=Math.floor(Date.now()/1000);
     if(!plain(staged)||Object.keys(staged).sort().join(',')!=='code,expiresAtS,state'||!opaque(staged.code)||staged.state!==state||!Number.isSafeInteger(staged.expiresAtS)||staged.expiresAtS<=now||staged.expiresAtS>now+61)throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
     const result=await json('/api/auth/v110/admission/consume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:staged.code,verifier,state})},abort.signal);
     if(!current())return;
     if(result?.admitted!==true||result.app!==c.app||result.session?.app!==c.app)throw Error('CHILD_ADMISSION_NOT_CONFIRMED');
     // Never reveal an old document after admission. A new load checks its cookie.
     try{Promise.resolve(window.M4L_V110?.clear('lock')).catch(()=>{});}catch{}
     remove();abort.abort();resolve({admitted:true});location.reload();
    })().catch(error=>fail(['CHILD_ADMISSION_USE_OWN_PIN','ACADEMY_RENEWAL_REQUIRED','CHILD_ADMISSION_OUTCOME_UNCONFIRMED'].includes(error?.message)?error.message:'CHILD_ADMISSION_NOT_CONFIRMED'));
   });
  },cancel
 }),writable:false,configurable:false});
})();
