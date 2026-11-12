// Neutral Root first-admission confirmation. No PIN/identity display or storage.
// Only challenge/state enter the fragment; the verifier stays in the child RAM.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG,root='https://ummabbadacademy.app',origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'},paths={studio:'/api/academy/website-studio/handoff',hifz:'/api/academy/hifz/sign-in'};
 const form=document.getElementById('child-admission-form'),button=document.getElementById('child-admission-submit'),message=document.getElementById('child-admission-message');
 const nativeFetch=window.fetch.bind(window),opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
 let app,challenge,state,csrf='',busy=false,finished=false,generation=0;const abort=new AbortController();
 const stop=text=>{button.disabled=true;message.textContent=text;};
 window.addEventListener('pagehide',()=>{generation++;abort.abort();finished=true;});
 document.getElementById('child-admission-close').addEventListener('click',()=>window.close());
 async function json(path,options={}){
  const response=await nativeFetch(path,{...options,signal:abort.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  let value;try{value=await response.json();}catch{throw Error('UNCONFIRMED');}
  if(!response.ok)throw Error(value?.code==='LOCAL_AUTH_DELIVERY_PENDING'?'PENDING':response.status===503?'UNCONFIRMED':'REJECTED');
  return value;
 }
 try{
  if(c?.enabled!==true||c.nativeCookie!==true||c.app!=='academy'||c.localProfile!=='msi-local-triple-v1'||location.origin!==root||!['/account/child-admission/','/account/child-admission/index.html'].includes(location.pathname)||location.search||!window.opener)throw Error('INVALID');
  const f=new URLSearchParams(location.hash.slice(1));
  if([...f].length!==3||['app','challenge','state'].some(k=>f.getAll(k).length!==1))throw Error('INVALID');
  app=f.get('app');challenge=f.get('challenge');state=f.get('state');
  if(!Object.hasOwn(origins,app)||c.origins?.[app]!==origins[app]||!opaque(challenge)||!opaque(state))throw Error('INVALID');
  history.replaceState(null,'',location.pathname);const mine=generation;
  json('/auth/v110/csrf').then(value=>{
   if(generation!==mine||finished)return;
   if(!opaque(value.csrf))throw Error('INVALID');
   csrf=value.csrf;message.textContent='Connect '+(app==='studio'?'Studio':'Hifz')+' using your current Academy sign-in.';button.disabled=false;
  }).catch(()=>stop('Open Academy and confirm your sign-in, then start the connection again from the requested app.'));
 }catch{stop('Open this connection from Studio or Hifz.');return;}
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!event.isTrusted||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||!csrf||busy||finished)return;
  busy=true;button.disabled=true;const mine=generation;
  try{
   // Refresh only within the current native Master/90-minute proof. This does
   // not sign in, unlock, extend the original seven days or advance Root FG.
   const refreshed=await json('/auth/v110/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf},body:JSON.stringify({foreground:false})});
   if(generation!==mine||finished||refreshed.refreshed!==true)throw Error('UNCONFIRMED');
   const value=await json(paths[app],{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({codeChallenge:challenge,state})});
   if(generation!==mine||finished||value.success!==true||value.expiresIn!==60)throw Error('UNCONFIRMED');
   let code=value.code;
   if(app==='studio'){
    const u=new URL(value.url);if(u.origin!==origins.studio||u.pathname!=='/connect'||u.search||u.username||u.password)throw Error('UNCONFIRMED');
    const p=new URLSearchParams(u.hash.slice(1));if([...p].length!==2||p.getAll('code').length!==1||p.getAll('state').length!==1||p.get('state')!==state)throw Error('UNCONFIRMED');code=p.get('code');
   }else if(value.state!==state)throw Error('UNCONFIRMED');
   if(!opaque(code))throw Error('UNCONFIRMED');
   finished=true;window.opener.postMessage({type:'UAA_CHILD_ADMISSION_RESULT',app,code,state,replyDeadlineMs:Date.now()+60000},origins[app]);
   stop('Connection confirmed. Return to the requested app.');
  }catch(error){
   finished=true;stop(error.message==='PENDING'?'Academy saved the change, but the connection is still pending. Close this window and check the app before starting again.':error.message==='UNCONFIRMED'?'The result could not be confirmed. Close this window and check the app before starting again.':'Confirm your sign-in in Academy, then start a new connection from the requested app.');
  }finally{busy=false;}
 });
})();
