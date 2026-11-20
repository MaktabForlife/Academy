(()=>{'use strict';
 const v2=()=>location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name="uaa-auth-version"]')?.content==='2'&&document.querySelector('meta[name="uaa-app"]')?.content==='academy';
 const auth=()=>window.M4L_ACADEMY_AUTH;
 const token=()=>v2()?(auth()?.hasSession()?auth().ownerKey():''):localStorage.getItem('m4l_account_token')||'';
 async function ready(){if(!v2())return null;const bridge=auth();if(!bridge?.ready)throw Object.assign(Error('Academy is checking your sign-in.'),{code:'NATIVE_AUTH_REQUIRED'});const client=await bridge.ready;if(!client.getState()?.context)await client.bootstrap({purpose:'business'});return client;}
 async function prepare({sensitive=false}={}){const client=await ready();if(client)await (sensitive?client.prepareSensitive({activeWork:true}):client.prepareBusiness({activeWork:true}));return client;}
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,input,authenticated=false){
  if(v2()){
   const client=await ready();
   if(authenticated){
    if(input===undefined){const response=await client.protectedFetch(path,{method:'GET'}),value=await response.json();return client.trackResult(value,response);}
    return client.request(path,input,{headers:{'X-Academy-Workspace':path.startsWith('/api/admin/')?'ADMIN':'LEARN'}});
   }
   if(path!=='/api/academy/enrolment/catalogue'||input!==undefined)throw Object.assign(Error('Use the current Academy enrolment page.'),{code:'NATIVE_PUBLIC_ROUTE_REQUIRED'});
   const response=await fetch(path,{method:'GET',credentials:'same-origin',cache:'no-store'}),value=await response.json();
   if(!response.ok||value.success!==true)throw Object.assign(Error(value.error||'The enrolment catalogue is unavailable.'),{status:response.status,code:value.code});return value;
  }
  const owner=token();if(authenticated&&!owner)throw Object.assign(Error('Sign in to the Academy to open this page.'),{status:401});
  const r=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:input===undefined?'GET':'POST',headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),...(authenticated?{Authorization:'Bearer '+owner}:{})},...(input===undefined?{}:{body:JSON.stringify(input)}),cache:'no-store'});
  let data;try{data=await r.json();}catch{throw Error('The response could not be confirmed. Please try again.');}
  if(authenticated&&owner!==token())throw Object.assign(Error('Your Academy session changed. Please refresh.'),{status:401});
  if(!r.ok||!data.success)throw Object.assign(Error(data.error||'Could not complete this request.'),{status:r.status,code:data.code});return data;
 }
 function whatsapp(number,message=''){const digits=String(number||'').replace(/\D/g,'').replace(/^0/,'27');return /^[1-9][0-9]{6,14}$/.test(digits)?'https://wa.me/'+digits+(message?'?text='+encodeURIComponent(message):''):'';}
 const ownerKey=async()=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token()||'visitor'));return (v2()?'uaa-enrolment-pending-v2:':'m4l-enrolment-pending:')+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');};
 window.M4L_ENROLMENT={token,esc,api,whatsapp,ownerKey,v2,auth,ready,prepare};
})();
