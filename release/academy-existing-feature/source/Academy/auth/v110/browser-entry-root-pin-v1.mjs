import {createChildCookieTransport} from './child-cookie-transport.mjs';
import {installAppPrivacy} from './browser-app-privacy.mjs';
import {browserOrigins,createBrowserControl,installBrowserRelay} from './browser-control-relay.mjs';
// Only a reviewed, explicit feature config can install this native transport
// boundary. URL queries and request headers never select trusted origins.
export function installNativePrivacy({win,doc,config,nativeFetch}){
 if(config?.enabled!==true)return null;
 const origins=browserOrigins(config.origins),app=config.app;
 if(!['academy','studio','hifz'].includes(app)||win.location.origin!==origins[app]||typeof nativeFetch!=='function')throw Error('INVALID_NATIVE_PRIVACY_CONFIG');
 const apiOrigins=new Set(config.apiOrigins||[origins[app]]);
 if([...apiOrigins].some(origin=>{try{return new URL(origin).origin!==origin;}catch{return true;}}))throw Error('INVALID_NATIVE_API_ORIGIN');
 const childTransport=createChildCookieTransport({win,config,nativeFetch});
 const ownFetch=(...args)=>childTransport?childTransport.fetch(...args):nativeFetch(...args);
 const contextURL=origins[app]+'/auth/v110/context';
 const publicPaths={
  academy:new Set(['/api/account/check','/api/account/login','/api/account/setup-pin','/api/account/logout','/api/academy/hub/login','/api/academy/setup/head']),
  studio:new Set(['/auth/login','/auth/exchange','/auth/logout','/api/config']),
  hifz:new Set(['/auth/academy','/auth/lookup','/auth/policy'])
 }[app];
 const publicAcademyRead=(url,method)=>app==='academy'&&['GET','HEAD'].includes(method)&&['/api/public/header-date','/api/public/academy-announcements','/api/public/academy-announcements/image','/api/public/academy-announcements/pdf','/api/academy/header-date'].includes(url.pathname);
 const privateURL=(url,method)=>!publicAcademyRead(url,method)&&apiOrigins.has(url.origin)&&url.href!==contextURL&&!publicPaths.has(url.pathname)&&
  (app==='hifz'?!url.pathname.startsWith('/auth/'):url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'));
 const runtime=installAppPrivacy({win,doc,app,origins,verifySession:async({signal})=>{
  const response=await ownFetch(contextURL,{credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw Error('CURRENT_V110_CONTEXT_REQUIRED');
  return response.json();
 },channelFactory:name=>new BroadcastChannel(name),onClear:reason=>{
  if(['logout','switch','known-cancellation','lock','hidden','permission-change'].includes(reason))childTransport?.clear();
  const gate=doc.querySelector('[data-uaa-public-gate]');gate?.setAttribute('data-reason',reason);
  const message=gate?.querySelector('[data-uaa-gate-message]');if(message)message.textContent=['logout','switch','known-cancellation','lock'].includes(reason)?'Your private display is locked. Return to Academy, or check your sign-in again.':'Checking the current sign-in before showing private information.';
 }});
 // Safe pre-effect PIN409 notification only. No response-body peek, PIN capture,
 // mutation replay or authority conveyed through this public UI.
 let pinPrompt=null;
 const retirePINPrompt=()=>{pinPrompt?.remove();pinPrompt=null;};
 win.addEventListener('uaa-v110-private-cleared',retirePINPrompt);
 win.addEventListener('pagehide',retirePINPrompt);
 function notifyRootPIN(){
  if(app!=='academy'||!doc.body||doc.visibilityState!=='visible'||pinPrompt)return;
  const panel=doc.createElement('section'),message=doc.createElement('p');
  panel.className='uaa-root-pin-required';panel.setAttribute('role','alert');panel.setAttribute('data-uaa-root-pin-required','');
  message.textContent='Confirm your current PIN, then reopen the item before saving again.';
  const confirm=doc.createElement('button');confirm.type='button';confirm.className='button';confirm.textContent='Confirm PIN';
  const close=doc.createElement('button');close.type='button';close.className='button secondary';close.textContent='Close';
  close.addEventListener('click',retirePINPrompt);
  confirm.addEventListener('click',async event=>{
   if(confirm.disabled)return;confirm.disabled=true;
   try{
    if(doc.visibilityState!=='visible')return;
    const native=win.M4L_ACADEMY_LOGIN;
    if(typeof native?.confirmCurrentPIN==='function'){
     // Native method validates the actual trusted event and current UI account.
     if(await native.confirmCurrentPIN(event))retirePINPrompt();
    }else{
     const stamp=await runtime.capture();await runtime.current(stamp);
     if(win.M4L_CIRCLES_NATIVE?.canLeave?.()===false)return;
     await runtime.current(stamp);
     // Fixed public native sign-in document only; no saved private target,
     // request, ID, selector, PIN or command crosses this navigation.
     win.location.assign(origins.academy+'/academy/?signin=1#login');
    }
   }catch{message.textContent='Return to Academy and check your current sign-in before saving again.';}
   finally{confirm.disabled=false;}
  });
  panel.append(message,confirm,close);doc.body.append(panel);pinPrompt=panel;
 }
 function wrappedResponse(response,stamp,done){
  return new Proxy(response,{get(target,key){
   if(['json','text','blob','arrayBuffer','formData'].includes(key))return async(...args)=>{try{const value=await target[key](...args);await runtime.current(stamp);return value;}finally{done();}};
   if(key==='clone')return ()=>wrappedResponse(target.clone(),stamp,()=>{});
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 }
 async function fetchGuard(input,options={}){
  if(childTransport){
   // Normalize and reject credentials BEFORE public, alias or off-origin paths.
   // This isolated child build permits no off-origin fetch API or asset origin.
   const request=new Request(typeof input==='string'||input instanceof URL?new URL(String(input),win.location.href):input,options);
   if(request.headers.has('Authorization'))throw Object.assign(Error('LEGACY_AUTH_NOT_ALLOWED'),{code:'LEGACY_AUTH_NOT_ALLOWED'});
   const selected=new URL(request.url);
   if(selected.origin!==origins[app])throw Object.assign(Error('CHILD_ORIGIN_NOT_ALLOWED'),{code:'CHILD_ORIGIN_NOT_ALLOWED'});
   if(selected.pathname.startsWith('/auth/')&&!['/auth/logout','/auth/v110/context'].includes(selected.pathname))throw Object.assign(Error('ACADEMY_SIGNIN_REQUIRED'),{code:'ACADEMY_SIGNIN_REQUIRED'});
   const genuinePublic=['GET','HEAD'].includes(request.method)&&(app==='studio'?(selected.pathname==='/api/config'||selected.pathname.startsWith('/api/public/')):['/api/header-date','/api/health'].includes(selected.pathname));
   if(genuinePublic){
    const publicHeaders=new Headers(request.headers);publicHeaders.delete('Cookie');publicHeaders.delete('X-UAA-CSRF');
    return nativeFetch(new Request(request,{headers:publicHeaders,credentials:'omit',cache:'no-store',redirect:'error'}),{credentials:'omit',cache:'no-store',redirect:'error'});
   }
   input=request;options={};
  }
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,win.location.href);
  if(app!=='academy'&&apiOrigins.has(url.origin)&&['/auth/login','/auth/register'].includes(url.pathname))throw Error('ACADEMY_SIGNIN_REQUIRED');
  if(url.href===contextURL)throw Error('CONTEXT_ROUTE_IS_PRIVATE_TO_ADAPTER');
  if(childTransport&&url.origin===origins[app]&&url.pathname==='/auth/logout'){runtime.clear('logout');return ownFetch(input,options);}
  if(!privateURL(url,String(options.method||input?.method||'GET').toUpperCase()))return nativeFetch(input,options);
  if(!await runtime.ready())throw new DOMException('Current Academy sign-in is required.','AbortError');
  const stamp=await runtime.capture(),controller=new AbortController(),upstream=options.signal||input?.signal;
  const abort=()=>controller.abort();if(upstream?.aborted)controller.abort();else upstream?.addEventListener?.('abort',abort,{once:true});
  const untrack=runtime.trackController(controller),done=()=>{untrack();upstream?.removeEventListener?.('abort',abort);};
  try{
   const response=await ownFetch(input,{...options,signal:controller.signal,cache:'no-store',credentials:'same-origin'});
   if(response.status===401){runtime.clear('known-cancellation');throw new DOMException('This app session needs verification.','AbortError');}
   await runtime.current(stamp);
   if(app==='academy'&&response.status===409&&response.headers.get('X-UAA-Root-PIN-Required')==='1')notifyRootPIN();
   return wrappedResponse(response,stamp,done);
  }catch(error){done();throw error;}
 }
 return Object.freeze({runtime,fetch:fetchGuard,origins,app});
}
// The relay document is a public static protocol endpoint, not an auth service.
// Exact app origins must come from the same reviewed build configuration.
export function startRelayDocument({win,origins}){
 const storage=win.localStorage,locks=win.navigator.locks;
 if(!locks?.request)throw Error('BROWSER_CONTROL_UNAVAILABLE');
 const control=createBrowserControl({storage,exclusive:fn=>locks.request('uaa-v110-ui-control',fn)});
 return installBrowserRelay({win,origins,control,channelFactory:name=>new BroadcastChannel(name)});
}
