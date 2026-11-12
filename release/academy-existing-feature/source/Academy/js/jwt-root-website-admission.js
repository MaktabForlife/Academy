// SOURCE ONLY direct website exception. Actual gesture reserves the tab FIRST.
// No PIN/login, credential URL, storage, legacy connector or automatic mutation replay.
(()=>{
 'use strict';
 const root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app',c=window.M4L_V110_CONFIG;
 if(c?.enabled!==true||c.nativeCookie!==true||c.app!=='academy'||c.localProfile!=='msi-local-triple-v1'||location.origin!==root||c.origins?.studio!==studio)throw Error('WEBSITE_ACTION_CONFIG');
 if(Object.hasOwn(window,'M4L_V110_WEBSITE_ACTION'))throw Error('WEBSITE_ACTION_DUPLICATE');
 const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v),stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
 const random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
 const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
 let pending=null;
 function target(value){
  let u;try{u=new URL(value);}catch{return null;}
  if(u.origin!==studio||u.username||u.password||u.hash||!['/studio/','/builder/'].includes(u.pathname)||!stable(u.searchParams.get('website'))||u.searchParams.getAll('website').length!==1||[...u.searchParams].some(([k,v])=>!['website','lesson'].includes(k)||!stable(v))||u.searchParams.getAll('lesson').length>1)return null;
  return u.href;
 }
 const parentKeys=['parentId','browserId','browserGeneration','originalSignedAtMs','originalExpiresAtMs'];
 function parentOf(s){
  if(!s||!stable(s.parentId)||!stable(s.browserId)||!['browserGeneration','originalSignedAtMs','originalExpiresAtMs'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0))throw Error('WEBSITE_PARENT_UNCONFIRMED');
  return Object.fromEntries(parentKeys.map(k=>[k,s[k]]));
 }
 function sameParent(a,b){return exact(a,parentKeys)&&parentKeys.every(k=>a[k]===b[k]);}
 const cancel=()=>pending?.cancel();
 window.addEventListener('pagehide',cancel);
 Object.defineProperty(window,'M4L_V110_WEBSITE_ACTION',{value:Object.freeze({
  destination:target,
  reserve(event){
   if(!(event instanceof Event)||event.isTrusted!==true||!['click','submit','keydown','pointerup'].includes(event.type)||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||window.M4L_CIRCLES_NATIVE?.canLeave?.()===false)throw Error('Select the website action again when you are ready.');
   cancel();
   const popup=window.open('about:blank','_blank');
   if(!popup)throw Error('Allow the website tab, then select the website action again.');
   // This blank document is same-origin now. Retire referrer before the only
   // cross-origin navigation; opener remains solely for exact source checks.
   try{popup.document.open();popup.document.write('<!doctype html><meta name="referrer" content="no-referrer"><title>Connecting website</title><p>Checking the selected website…</p>');popup.document.close();}catch{popup.close();throw Error('The website tab could not be prepared.');}
   const request=random(),abort=new AbortController();let stamp;
   try{stamp=Promise.resolve(window.M4L_V110.capture());stamp.catch(()=>{});}catch{popup.close();throw Error('Your Academy sign-in could not be checked.');}
   let finished=false,started=false,busy=false,phase='RESERVED',childState='',parent=null,destination='',resolve,reject;
   const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
   // A reserved tab may close before the asynchronous native selector returns.
   // The owning callback observes result only after finish; suppress early
   // unhandled-rejection noise without turning any error into success.
   result.catch(()=>{});
   const remove=()=>{clearTimeout(timer);window.removeEventListener('message',receive);if(pending===item)pending=null;abort.abort();};
   const stop=message=>{if(finished)return;finished=true;remove();try{popup.close();}catch{}reject(Error(message||'The website connection could not be confirmed.'));};
   const current=async()=>!finished&&!abort.signal.aborted&&!popup.closed&&window.M4L_CIRCLES_NATIVE?.canLeave?.()!==false&&await window.M4L_V110.current(await stamp);
   async function json(path,options={}){
    const response=await window.fetch(path,{...options,signal:abort.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
    let value;try{value=await response.json();}catch{throw Error('The website connection could not be confirmed.');}
    if(!response.ok)throw Error(value?.code==='LOCAL_AUTH_DELIVERY_PENDING'?'Academy saved the change, but the connection is pending. Check the app before submitting again.':'Confirm your current Academy sign-in before opening this website.');
    return value;
   }
   function send(value){popup.postMessage(value,studio);}
   const receive=async event=>{
    const v=event.data;
    if(finished||busy||event.origin!==studio||event.source!==popup||!plain(v)||v.request!==request)return;
    busy=true;
    try{
     if(!await current())throw Error('Your Academy sign-in or selected page changed.');
     if(v.type==='UAA_WEBSITE_READY'&&phase==='WAIT_READY'){
      if(!exact(v,['type','request','state','challenge','phase','parent'])||!opaque(v.state)||!opaque(v.challenge)||!['REQUIRED','EXISTING'].includes(v.phase))return;
      childState=v.state;
      if(v.phase==='EXISTING'){
       if(!sameParent(v.parent,parent))throw Error('The website app is signed in to a different Academy session. Check that app first.');
       phase='WAIT_DONE';send({type:'UAA_WEBSITE_GO',request,state:childState,target:destination,parent});return;
      }
      if(v.parent!==null)throw Error('The website connection could not be confirmed.');
      phase='DELIVERING';
      const value=await json('/api/academy/website-studio/handoff',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':item.csrf,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({codeChallenge:v.challenge,state:childState})});
      if(!await current()||value.success!==true||value.expiresIn!==60)throw Error('The website connection could not be confirmed.');
      const u=new URL(value.url),p=new URLSearchParams(u.hash.slice(1));
      if(u.origin!==studio||u.pathname!=='/connect'||u.search||u.username||u.password||[...p].length!==2||p.getAll('code').length!==1||p.getAll('state').length!==1||p.get('state')!==childState||!opaque(p.get('code')))throw Error('The website connection could not be confirmed.');
      phase='WAIT_CONFIRM';send({type:'UAA_WEBSITE_CODE',request,state:childState,code:p.get('code')});return;
     }
     if(v.type==='UAA_WEBSITE_CONFIRMED'&&phase==='WAIT_CONFIRM'){
      if(!exact(v,['type','request','state','parent'])||v.state!==childState||!sameParent(v.parent,parent))throw Error('The website connection could not be confirmed.');
      phase='WAIT_DONE';send({type:'UAA_WEBSITE_GO',request,state:childState,target:destination,parent});return;
     }
     if(v.type==='UAA_WEBSITE_DONE'&&phase==='WAIT_DONE'){
      if(!exact(v,['type','request','state'])||v.state!==childState)throw Error('The website connection could not be confirmed.');
      finished=true;remove();resolve({opened:true});return;
     }
     if(v.type==='UAA_WEBSITE_FAILED'&&exact(v,['type','request']))throw Error('The website app needs its own sign-in check. Open that app before trying again.');
    }catch(error){stop(error.message);}finally{busy=false;}
   };
   const timer=setTimeout(()=>stop('The website connection expired. Select the action again.'),120000);
   const item={cancel:()=>stop('The website connection was cancelled.'),csrf:''};pending=item;window.addEventListener('message',receive);
   return Object.freeze({
    async finish(value){
     if(started||finished)throw Error('The website action is no longer current.');started=true;destination=target(value);
     if(!destination){stop('The selected website destination is unavailable.');return result;}
     try{
      if(!await current())throw Error('Your Academy sign-in or selected page changed.');
      const csrf=await json('/auth/v110/csrf');if(!opaque(csrf.csrf))throw Error('The website connection could not be confirmed.');item.csrf=csrf.csrf;
      const refreshed=await json('/auth/v110/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':item.csrf},body:JSON.stringify({foreground:false})});
      if(!await current()||refreshed.refreshed!==true||refreshed.browserContext?.app!=='academy'||refreshed.browserContext.sessionId!==refreshed.browserContext.parentId)throw Error('Your Academy sign-in changed.');
      parent=parentOf(refreshed.browserContext);phase='WAIT_READY';
      popup.location.href=studio+'/account/website-admission/#'+new URLSearchParams({request});
     }catch(error){stop(error.message);}
     return result;
    },cancel:item.cancel
   });
  },cancel
 }),writable:false,configurable:false});
})();
