// The Circles UI uses the existing Academy credential and one-use website flow.
// No credentials or master Academy tokens are persisted by this client.
const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const accessArea=value=>['academy','tafseer','courses','mothers','hifz','studio','arabic-adventures'].includes(value)?value:'general';
export const learningDestination=area=>['tafseer','courses'].includes(accessArea(area))?'/studio/?view=collections&collection='+accessArea(area):accessArea(area)==='studio'?'/studio/?manage=1':null;
export async function signInFromCircles(request,credentials,{current=()=>true,onExchange=()=>{},bootstrap=false}={}){
 await request('/auth/native-login',{body:credentials});
 onExchange();if(!current())throw new DOMException('Sign-in was closed.','AbortError');
 return request(bootstrap?'/api/circles/bootstrap':'/api/me');
}
export function openAcademyFromCircles({request,navigation,dashboard,window=globalThis.window,onError=()=>{}}){
 if(navigation==='hifz')return openLegacyAcademyFromCircles({academyOrigin:globalThis.AcademyHosting.academyLegacyOrigins[0],request,navigation,window,onError});
 const child=window.open('about:blank','_blank');if(!child){onError('Allow the Academy window to open, then try again.');return null;}
 let closed=false;
 request('/auth/native-open',{body:{...(navigation?{navigation}:{}),...(dashboard?{dashboard}:{})}}).then(result=>{
  if(closed||child.closed)return;
  const destination=new URL(result.destination,window.location.origin);
  if(destination.origin!==window.location.origin||!/^\/(?:academy|account|programs|users|recorder|activities)(?:\/|$)/.test(destination.pathname))throw Error('Invalid Academy destination.');
  // Native issuance rechecks the exact target context on the same live session.
  localStorage.setItem('m4l_account_token',result.token);
  child.location.replace(destination.href);
 }).catch(error=>{try{child.close();}catch{}onError(error.message);});
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
