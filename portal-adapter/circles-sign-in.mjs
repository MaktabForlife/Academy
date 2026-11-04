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
