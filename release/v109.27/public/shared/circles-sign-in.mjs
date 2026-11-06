// The Circles UI uses the existing Academy credential and one-use website flow.
// Native Academy keeps its existing storage/session contract; credentials never enter links.
const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const accessArea=value=>['academy','tafseer','courses','mothers','hifz','studio','arabic-adventures'].includes(value)?value:'general';
export const learningDestination=area=>['tafseer','courses'].includes(accessArea(area))?'/studio/?view=collections&collection='+accessArea(area):accessArea(area)==='studio'?'/studio/?manage=1':null;
export async function signInFromCircles(request,credentials,{current=()=>true,onExchange=()=>{},bootstrap=false}={}){
 await request('/auth/native-login',{body:credentials});
 onExchange();if(!current())throw new DOMException('Sign-in was closed.','AbortError');
 return request(bootstrap?'/api/circles/bootstrap':'/api/me');
}
export function openAcademyFromCircles({request,navigation,dashboard,window=globalThis.window,onError=()=>{},onReturn}){
 if(navigation==='hifz')return openLegacyAcademyFromCircles({academyOrigin:globalThis.AcademyHosting.academyLegacyOrigins[0],request,navigation,window,onError});
 const initialToken=window.localStorage.getItem('m4l_account_token'),requestedMode=dashboard?.mode||'learn',child=window;
 let closed=false;
 request('/auth/native-open',{body:{...(navigation?{navigation}:{}),...(dashboard?{dashboard}:{})}}).then(async result=>{
  if(closed||child.closed)return;
  if(!result||typeof result.token!=='string'||!result.token||typeof result.destination!=='string')throw Error('Invalid Academy handoff.');
  const destination=new URL(result.destination,window.location.origin);
  if(destination.origin!==window.location.origin||!/^\/(?:academy|account|programs|users|recorder|activities)(?:\/|$)/.test(destination.pathname))throw Error('Invalid Academy destination.');
  const owner=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(result.token))),x=>x.toString(16).padStart(2,'0')).join('');
  if(closed||child.closed||window.localStorage.getItem('m4l_account_token')!==initialToken)throw new DOMException('Your account changed.','AbortError');
  if(!['learn','teach','admin'].includes(requestedMode)||result.circles?.mode!==requestedMode||new URL(result.circles.returnUrl).href!==new URL('/?workspace='+requestedMode,window.location.origin).href)throw Error('Your dashboard return address could not be checked.');
  const context={...result.circles,websiteOrigin:window.location.origin,owner,expiresAt:Date.now()+12*3600_000,sameTab:true};
  // Install only non-authorising return hints before replacing the credential.
  // A previous website Library opener context must not override this Home.
  child.sessionStorage.setItem('m4l_circles_return',JSON.stringify(context));
  child.sessionStorage.removeItem('m4l_website_library_return');
  window.localStorage.setItem('m4l_account_token',result.token);
  child.location.replace(destination.href);
 }).catch(error=>onError(error.message));
 return {child,close(){closed=true;}};
}
function openLegacyAcademyFromCircles({academyOrigin,request,navigation,dashboard,window=globalThis.window,onError=()=>{},onReturn}){
 const origin=new URL(academyOrigin);if(origin.origin!==academyOrigin||!['https:','http:'].includes(origin.protocol))throw Error('Academy sign-in is unavailable.');
 const child=window.open(origin.origin+'/academy/website-platform/connect/?entry=portal','_blank');
 if(!child){onError('Allow the Academy window to open, then try again.');return null;}
 let used=false,closed=false,returning=null;
 const stopReturn=()=>{if(returning)window.removeEventListener('message',returning);returning=null;};
 const finish=()=>{if(closed)return;closed=true;window.removeEventListener('message',receive);window.clearTimeout(timer);window.clearInterval(watch);};
 const receive=async event=>{
  if(closed||used||event.source!==child||event.origin!==origin.origin||event.data?.type!=='ACADEMY_WEBSITE_CHALLENGE')return;
  const {state,challenge}=event.data;if(![state,challenge].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43,120}$/.test(v)))return;
  used=true;
  try{const result=await request('/auth/academy',{body:{state,challenge,...(navigation?{navigation}:{}),...(dashboard?{dashboard}:{})}});if(!closed&&!child.closed){
   if(typeof onReturn==='function'&&dashboard?.mode){returning=event=>{
    const value=event.data;if(event.source!==child||event.origin!==origin.origin||value?.type!=='ACADEMY_CIRCLES_RETURN'||value.mode!==dashboard.mode||typeof value.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(value.requestId))return;
    if(onReturn(value.mode)!==true)return;
    child.postMessage({type:'CIRCLES_DASHBOARD_RETURNED',requestId:value.requestId,mode:value.mode},origin.origin);stopReturn();
   };window.addEventListener('message',returning);}
   child.postMessage({type:'WEBSITE_ACADEMY_CODE',state,code:result.code},origin.origin);
  }}catch(error){stopReturn();onError(error.message);}finally{finish();}
 };
 window.addEventListener('message',receive);const timer=window.setTimeout(()=>{finish();onError('Reopen Academy to continue.');},60_000),watch=window.setInterval(()=>{if(child.closed)finish();},1000);
 return {child,close(){finish();stopReturn();}};
}
