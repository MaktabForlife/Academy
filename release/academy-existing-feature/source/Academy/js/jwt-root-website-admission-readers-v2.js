// SOURCE ONLY default-off native reader successor; Admin branch preserved.
// SOURCE ONLY v3: neutral-only COOP topology, INIT before child credentials,
// checked DONE/RELEASE ownership transfer. Existing/private headers unchanged.
// SOURCE ONLY new reviewed website handoff candidate. No old draft is selected.
// Gesture reserves a neutral tab; native servers alone admit/authorize content.
(()=>{
 'use strict';
 const root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app',c=window.M4L_V110_CONFIG;
 if(c?.enabled!==true||c.nativeCookie!==true||c.app!=='academy'||c.localProfile!=='msi-local-triple-v1'||c.localRoutePolicy!=='NATIVE_WEBSITE_HIFZ_V1'||c.websiteAdmission!=='ROOT_GESTURE_V3'||location.origin!==root||window.top!==window||c.origins?.studio!==studio)throw Error('WEBSITE_ACTION_CONFIG');
 if(Object.hasOwn(window,'M4L_V110_WEBSITE_ACTION'))throw Error('WEBSITE_ACTION_DUPLICATE');
 const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
 const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
 const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v),stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
 const random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const parentKeys=['parentId','browserId','browserGeneration','originalSignedAtMs','originalExpiresAtMs'];
 function parentOf(s,accountId){
  if(s?.app!=='academy'||s.accountId!==accountId||s.sessionId!==s.parentId||!stable(s.parentId)||!stable(s.browserId)||!['browserGeneration','originalSignedAtMs','originalExpiresAtMs'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0))throw Error('WEBSITE_PARENT_UNCONFIRMED');
  return Object.freeze(Object.fromEntries(parentKeys.map(k=>[k,s[k]])));
 }
 const sameParent=(a,b)=>exact(a,parentKeys)&&exact(b,parentKeys)&&parentKeys.every(k=>a[k]===b[k]);
 function target(value){
  let u;try{u=new URL(value);}catch{return null;}
  if(u.href.length>2048||u.origin!==studio||u.username||u.password||u.hash||!['/studio/','/builder/'].includes(u.pathname)||u.searchParams.getAll('website').length!==1||!stable(u.searchParams.get('website'))||u.searchParams.getAll('lesson').length>1||[...u.searchParams].some(([k,v])=>!['website','lesson'].includes(k)||!stable(v)))return null;
  return u.href;
 }
 let pending=null;
 const cancel=()=>pending?.cancel();
 window.addEventListener('pagehide',cancel);
 window.addEventListener('uaa-v110-private-cleared',cancel);
 Object.defineProperty(window,'M4L_V110_WEBSITE_ACTION',{value:Object.freeze({
  destination:target,cancel,
  openReader(event,selection,context){
   return window.M4L_V110_WEBSITE_ACTION.reserve(event,{selection,workspace:context?.workspace,current:context?.current}).finish();
  },
  reserve(event,reader=null){
   if(reader!==null){
    const input=reader.selection,boundary=window.M4L_ACADEMY_WORKSPACE;
    if(c.readerAdmission!=='NATIVE_RESOURCE_V1'||!plain(input)||!stable(input.activityKey)||Object.keys(input).some(k=>!['activityKey','surahId'].includes(k))||input.surahId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.surahId)||!['LEARN','TEACH'].includes(reader.workspace)||boundary?.current?.()!==reader.workspace||boundary.adminRealm?.()!==false||boundary.classView?.()||typeof reader.current!=='function'||reader.current()!==true)throw Error('Open this reading website from its current Learn or Teach action.');
    if(input.activityKey.startsWith('COURSE:')?input.surahId!==undefined:!input.activityKey.startsWith('PROGRAM:')||!input.surahId)throw Error('Choose a native Course or Surah reading action.');
    reader=Object.freeze({selection:Object.freeze({...input}),workspace:reader.workspace,current:reader.current});
   }
   const api=window.M4L_V110;
   if(!(event instanceof Event)||event.isTrusted!==true||!['click','submit','keydown','pointerup'].includes(event.type)||!navigator.userActivation?.isActive||document.visibilityState!=='visible'||window.M4L_CIRCLES_NATIVE?.canLeave?.()===false||typeof api?.capture!=='function'||typeof api.current!=='function')throw Error('Select the website action again when you are ready.');
   cancel();
   // No private markup or selector is written into this owned placeholder.
   const popup=window.open('about:blank','_blank');
   if(!popup)throw Error('Allow the website tab, then select the action again.');
   try{
    popup.document.open();popup.document.write('<!doctype html><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Opening website</title><p>Checking the selected website…</p>');popup.document.close();
    // This is a focus request, not a hidden-page privacy exception. If the
    // browser cannot retain the current visible parent, owned() must fail.
    popup.blur();window.focus();
   }catch{try{popup.close();}catch{}throw Error('The website tab could not be prepared.');}
   const request=random(),abort=new AbortController();let stampPromise;
   try{stampPromise=Promise.resolve(api.capture());stampPromise.catch(()=>{});}catch{popup.close();throw Error('Your Academy sign-in could not be checked.');}
   let finished=false,started=false,busy=false,phase='RESERVED',childState='',childChallenge='',parent=null,destination='',csrf='',timer,resolve,reject;
   const result=new Promise((yes,no)=>{resolve=yes;reject=no;});result.catch(()=>{});
   function live(){
    if(finished||abort.signal.aborted||popup.closed||document.visibilityState!=='visible'||window.M4L_CIRCLES_NATIVE?.canLeave?.()===false)throw Error('WEBSITE_ACTION_STALE');
    if(phase==='RESERVED'&&popup.location.href!=='about:blank')throw Error('WEBSITE_PLACEHOLDER_CHANGED');
    if(reader){
     const boundary=window.M4L_ACADEMY_WORKSPACE;
     if(c.readerAdmission!=='NATIVE_RESOURCE_V1'||boundary?.current?.()!==reader.workspace||boundary.adminRealm?.()!==false||boundary.classView?.()||reader.current()!==true)throw Error('WEBSITE_READER_CONTEXT_CHANGED');
    }
   }
   // Owning current() is VOID on success and THROWS on stale. No boolean test.
   async function owned(){
    live();const stamp=await stampPromise;live();
    await api.current(stamp);live();return true;
   }
   function remove(){clearTimeout(timer);window.removeEventListener('message',receive);if(pending===item)pending=null;abort.abort();csrf='';}
   function stop(){if(finished)return;finished=true;remove();try{popup.close();}catch{}reject(Error('The website connection was cancelled or could not be confirmed. Check Studio before trying again.'));}
   async function json(path,options={}){
    await owned();
    const response=await window.fetch(path,{...options,signal:abort.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
    await owned();
    if(response.status!==200)throw Error('WEBSITE_NATIVE_CHECK_FAILED');
    const value=await response.json();await owned();
    if(!plain(value))throw Error('WEBSITE_NATIVE_CHECK_FAILED');return value;
   }
   const send=value=>{live();popup.postMessage(value,studio);};
   const receive=async event=>{
    const v=event.data;
    if(finished||busy||event.origin!==studio||event.source!==popup||!plain(v)||v.request!==request)return;
    busy=true;
    try{
     await owned();
     if(v.type==='UAA_WEBSITE3_HELLO'&&phase==='WAIT_HELLO'){
      if(!exact(v,['type','request','state','challenge'])||!opaque(v.state)||!opaque(v.challenge))throw Error('WEBSITE_PROTOCOL');
      childState=v.state;childChallenge=v.challenge;
      await owned();
      phase='WAIT_READY';send({type:'UAA_WEBSITE3_INIT',request,state:childState,parent});return;
     }
     if(v.type==='UAA_WEBSITE3_READY'&&phase==='WAIT_READY'){
      if(!exact(v,['type','request','state','challenge','phase','parent'])||!opaque(v.state)||!opaque(v.challenge)||!['REQUIRED','EXISTING'].includes(v.phase))throw Error('WEBSITE_PROTOCOL');
      if(v.state!==childState||v.challenge!==childChallenge)throw Error('WEBSITE_INIT_CHANGED');
      if(reader){
       if(v.phase==='EXISTING'?!sameParent(v.parent,parent):v.parent!==null)throw Error('WEBSITE_DIFFERENT_PARENT');
       if(v.phase==='EXISTING'){
        phase='RESOLVING_READER';
        // Routing metadata only. No ticket/audit/family/clock write, no native
        // entitlement assertion. The existing child keeps its native family.
        const value=await json('/api/academy/website-studio/reader-selection',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf,'X-Academy-Workspace':reader.workspace},body:JSON.stringify(reader.selection)});
        await owned();if(!exact(value,['destination']))throw Error('WEBSITE_READER_SELECTION');
        const checked=target(value.destination),u=checked&&new URL(checked);
        if(!u||u.pathname!=='/studio/'||[...u.searchParams].length!==1||u.searchParams.getAll('website').length!==1)throw Error('WEBSITE_READER_TARGET');
        destination=checked;phase='WAIT_DONE';
        send({type:'UAA_WEBSITE3_GO',request,state:childState,target:destination,parent});return;
       }
       phase='DELIVERING';
       // FIRST admission retains actual native websiteAccess and the original
       // genuine one-use consume. Raw code stays RAM-only and is never a URL.
       const value=await json('/api/academy/website-studio/reader-handoff',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf,'X-Academy-Workspace':reader.workspace},body:JSON.stringify({...reader.selection,codeChallenge:v.challenge,state:childState})});
       await owned();
       if(!exact(value,['success','code','state','expiresAtS','destination'])||value.success!==true||!opaque(value.code)||value.state!==childState||!Number.isSafeInteger(value.expiresAtS)||value.expiresAtS<=0||value.expiresAtS*1000>parent.originalExpiresAtMs)throw Error('WEBSITE_READER_ADMISSION');
       const checked=target(value.destination),u=checked&&new URL(checked);
       if(!u||u.pathname!=='/studio/'||[...u.searchParams].length!==1||u.searchParams.getAll('website').length!==1)throw Error('WEBSITE_READER_TARGET');
       destination=checked;const code=value.code;value.code='';phase='WAIT_CONFIRM';
       send({type:'UAA_WEBSITE3_CODE',request,state:childState,code});return;
      }
      if(v.phase==='EXISTING'){
       if(!sameParent(v.parent,parent))throw Error('WEBSITE_DIFFERENT_PARENT');
       phase='WAIT_DONE';send({type:'UAA_WEBSITE3_GO',request,state:childState,target:destination,parent});return;
      }
      if(v.parent!==null)throw Error('WEBSITE_PROTOCOL');
      phase='DELIVERING';
      const value=await json('/api/academy/website-studio/handoff',{method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({codeChallenge:v.challenge,state:childState})});
      await owned();if(value.success!==true||value.expiresIn!==60||typeof value.url!=='string')throw Error('WEBSITE_NATIVE_ADMISSION');
      const u=new URL(value.url),p=new URLSearchParams(u.hash.slice(1));
      if(u.origin!==studio||u.pathname!=='/connect'||u.search||u.username||u.password||[...p].length!==2||p.getAll('code').length!==1||p.getAll('state').length!==1||p.get('state')!==childState||!opaque(p.get('code')))throw Error('WEBSITE_NATIVE_ADMISSION');
      // The native returned code remains RAM-only; never navigate its URL.
      phase='WAIT_CONFIRM';send({type:'UAA_WEBSITE3_CODE',request,state:childState,code:p.get('code')});return;
     }
     if(v.type==='UAA_WEBSITE3_CONFIRMED'&&phase==='WAIT_CONFIRM'){
      if(!exact(v,['type','request','state','parent'])||v.state!==childState||!sameParent(v.parent,parent))throw Error('WEBSITE_PARENT_CHANGED');
      phase='WAIT_DONE';send({type:'UAA_WEBSITE3_GO',request,state:childState,target:destination,parent});return;
     }
     if(v.type==='UAA_WEBSITE3_DONE'&&phase==='WAIT_DONE'){
      if(!exact(v,['type','request','state','parent'])||v.state!==childState||!sameParent(v.parent,parent))throw Error('WEBSITE_PROTOCOL');
      // Native Root context and the actual void/throw current() API both remain
      // mandatory immediately before transferring pending-placeholder ownership.
      const checked=await json('/auth/v110/context'),stamp=await stampPromise;
      await owned();
      if(!sameParent(parentOf(checked.session,stamp.accountId),parent))throw Error('WEBSITE_PARENT_CHANGED');
      const release={type:'UAA_WEBSITE3_RELEASE',request,state:childState,parent};
      // Remove pending cancellation ownership BEFORE child focus/navigation.
      // RELEASE acknowledges only the handshake, never final private-page load.
      finished=true;phase='RELEASED';remove();
      try{popup.postMessage(release,studio);resolve({released:true});}
      catch{try{popup.close();}catch{}reject(Error('The website handoff could not be released.'));}
      return;
     }
     if(v.type==='UAA_WEBSITE3_FAILED'&&exact(v,['type','request']))throw Error('WEBSITE_CHILD_CHECK_REQUIRED');
     throw Error('WEBSITE_PROTOCOL_PHASE');
    }catch{stop();}finally{busy=false;}
   };
   const item={cancel:stop};pending=item;
   window.addEventListener('message',receive);timer=setTimeout(stop,60000);
   return Object.freeze({
    async finish(value){
     if(started||finished)throw Error('The website action is no longer current.');started=true;destination=reader?'':target(value);
     if(!reader&&!destination){stop();return result;}
     try{
      await owned();
      const checked=await json('/auth/v110/context'),stamp=await stampPromise;await owned();
      parent=parentOf(checked.session,stamp.accountId);
      const proof=await json('/auth/v110/csrf');await owned();if(!opaque(proof.csrf))throw Error('WEBSITE_CSRF');csrf=proof.csrf;
      phase='WAIT_HELLO';
      popup.location.replace(studio+'/account/website-admission/#'+new URLSearchParams({request}));
     }catch{stop();}
     return result;
    },cancel:stop
   });
  }
 }),writable:false,configurable:false});
})();
