// Neutral child-only actual PIN form. No Master sign-in, native selector,
// private display context, clock, access token or persistent browser storage.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,form=document.getElementById('child-pin-form'),input=document.getElementById('child-pin'),button=document.getElementById('child-pin-submit'),message=document.getElementById('pin-message');
 document.getElementById('child-pin-close').addEventListener('click',()=>window.close());
 const origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'},opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
 let app,intentId,csrf='',busy=false,finished=false;
 const nativeFetch=window.fetch.bind(window);
 const stop=text=>{input.disabled=true;button.disabled=true;input.value='';message.textContent=text;};
 async function send(path,body){
  const response=await nativeFetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',...(csrf?{'X-UAA-CHILD-PIN-CSRF':csrf}:{})},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value?.code==='CHILD_PIN_METADATA_RATE_LIMITED'?'Please wait before trying again.':'PIN confirmation could not be completed.');
  return value;
 }
 try{
  if(c?.enabled!==true||c.nativeCookie!==true||c.app!=='academy'||c.localProfile!=='msi-local-triple-v1'||location.origin!=='https://ummabbadacademy.app'||location.pathname!=='/account/child-pin/'&&location.pathname!=='/account/child-pin/index.html'||location.search||!window.opener)throw Error('Invalid PIN form.');
  const fields=new URLSearchParams(location.hash.slice(1));
  if([...fields].length!==2||fields.getAll('app').length!==1||fields.getAll('intent').length!==1)throw Error('Invalid PIN request.');
  app=fields.get('app');intentId=fields.get('intent');
  if(!Object.hasOwn(origins,app)||!opaque(intentId)||c.origins?.[app]!==origins[app])throw Error('Invalid PIN request.');
  // Retire opaque request selector from visible history after capture, not a
  // credential or identity. Nothing private is copied to browser persistence.
  history.replaceState(null,'',location.pathname);
  send('/auth/v110/child-pin/prepare',{app,intentId}).then(value=>{
   if(value.app!==app||value.intentId!==intentId||!opaque(value.csrf)||!Number.isSafeInteger(value.expiresAtS)||value.expiresAtS*1000<=Date.now())throw Error('Expired PIN request.');
   csrf=value.csrf;message.textContent='Enter your Academy PIN to unlock '+(app==='studio'?'Studio':'Hifz')+'.';input.disabled=false;button.disabled=false;input.focus();
  }).catch(()=>stop('Return to the requested app and start PIN confirmation again.'));
 }catch{stop('Open PIN confirmation from Studio or Hifz.');return;}
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!event.isTrusted||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||busy||finished||!csrf||!/^\d{4}$/.test(input.value))return;
  busy=true;button.disabled=true;let pin=input.value;input.value='';
  try{
   const value=await send('/auth/v110/child-pin/verify',{app,intentId,pin});pin='';
   if(value.app!==app||value.intentId!==intentId||!opaque(value.code)||!opaque(value.state)||!Number.isSafeInteger(value.expiresAtS)||value.expiresAtS*1000<=Date.now())throw Error('Invalid PIN response.');
   finished=true;window.opener.postMessage({type:'UAA_CHILD_PIN_RESULT',app,intentId,code:value.code,state:value.state,expiresAtS:value.expiresAtS},origins[app]);
   stop('PIN confirmed. Return to the requested app.');
  }catch{pin='';stop('PIN confirmation failed. Return to the requested app to try again.');}
  finally{busy=false;}
 });
})();
