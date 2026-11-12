(()=>{'use strict';
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,input,authenticated=false){
  const owner=token();if(authenticated&&!owner)throw Object.assign(Error('Sign in to the Academy to open this page.'),{status:401});
  const r=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:input===undefined?'GET':'POST',headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),...(authenticated?{Authorization:'Bearer '+owner}:{})},...(input===undefined?{}:{body:JSON.stringify(input)}),cache:'no-store'});
  let data;try{data=await r.json();}catch{throw Error('The response could not be confirmed. Please try again.');}
  if(authenticated&&owner!==token())throw Object.assign(Error('Your Academy session changed. Please refresh.'),{status:401});
  if(!r.ok||!data.success)throw Object.assign(Error(data.error||'Could not complete this request.'),{status:r.status,code:data.code});return data;
 }
 function whatsapp(number,message=''){const digits=String(number||'').replace(/\D/g,'').replace(/^0/,'27');return /^[1-9][0-9]{6,14}$/.test(digits)?'https://wa.me/'+digits+(message?'?text='+encodeURIComponent(message):''):'';}
 const ownerKey=async()=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token()||'visitor'));return 'm4l-enrolment-pending:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');};
 window.M4L_ENROLMENT={token,esc,api,whatsapp,ownerKey};
})();
