export const state={active:true,account:null,controller:new AbortController()};
const random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function request(action,input={},blob=false,bytes){
 if(!state.active)throw new DOMException('Your Academy account changed.','AbortError');
 const response=await fetch('/api/'+action+(bytes?'?metadata='+encodeURIComponent(JSON.stringify(input)):''),{method:'POST',credentials:'same-origin',cache:'no-store',signal:state.controller.signal,headers:{...(bytes?{}:{'Content-Type':'application/json'}),...(state.account?.sourceTokenHash?{'X-Studio-Account':state.account.sourceTokenHash}:{})},body:bytes||JSON.stringify(input)});
 if(!state.active)throw new DOMException('Your Academy account changed.','AbortError');if(blob&&response.ok)return response.blob();const result=await response.json();if(response.status===401)end('Your Studio session changed. Reopen Website Studio from Academy.');if(!response.ok||result.success===false)throw Object.assign(Error(result.error||'Website Studio is temporarily unavailable.'),{status:response.status,code:result.code});return result;
}
export function end(message='Your Academy account changed. Reopen Website Studio from Academy.'){
 if(!state.active)return;state.active=false;state.controller.abort();document.dispatchEvent(new CustomEvent('studio-account-ended'));document.getElementById('website-editor')?.setAttribute('hidden','');document.getElementById('course-reader')?.replaceChildren();document.getElementById('website-list')?.replaceChildren();document.querySelectorAll('dialog[open]').forEach(d=>d.close());const status=document.getElementById('website-list-status')||document.getElementById('website-status');if(status){status.hidden=false;status.textContent=message;}
 void fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json',...(state.account?.sourceTokenHash?{'X-Studio-Account':state.account.sourceTokenHash}:{})},body:'{}',credentials:'same-origin'}).catch(()=>{});
}
export async function ready(){
 const session=await request('session');state.account=session;addEventListener('storage',event=>{if(event.key==='website-studio-account'&&event.newValue!==session.sourceTokenHash)end();});
 const nonce=random(),opener=window.opener;let expected;
 if(opener&&!opener.closed)expected=opener;
 else{const iframe=document.createElement('iframe');iframe.hidden=true;iframe.title='Academy account continuity';iframe.src=session.academyOrigin+'/academy/website-studio/session/?nonce='+nonce;document.body.append(iframe);expected=iframe.contentWindow;}
 await new Promise((resolve,reject)=>{
  let initial=true,lastReply=Date.now(),stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;clearInterval(interval);removeEventListener('message',receive);document.removeEventListener('visibilitychange',visible);};
  const rejectSession=message=>{stop();end(message);if(initial){initial=false;reject(Error(message));}};
  const receive=e=>{
   if(e.origin!==session.academyOrigin||e.source!==expected||e.data?.type!=='academy-studio-account'||e.data.nonce!==nonce)return;
   if(e.data.hash!==session.sourceTokenHash){rejectSession('Your Academy account changed. Reopen Website Studio from Academy.');return;}
   lastReply=Date.now();if(initial){initial=false;resolve();}
  };
  const check=()=>{
   if(!state.active){stop();return;}if(document.visibilityState==='hidden')return;
   if(expected.closed||Date.now()-lastReply>10000){rejectSession('Reopen Website Studio in a new tab from Academy to check your account.');return;}
   expected.postMessage({type:'academy-studio-account-check',nonce},session.academyOrigin);
  };
  const visible=()=>{if(document.visibilityState==='visible'){lastReply=Date.now();check();}};
  addEventListener('message',receive);document.addEventListener('visibilitychange',visible);
  // Browser messages only: no API, database or session polling.
  const interval=setInterval(check,2000);check();
 });
 return session;
}
