// This file precedes the unchanged shared API client in the Academy portal build.
// Credentials stay in the existing native Academy storage; never in links.
const hosting=Object.freeze(globalThis.AcademyHosting);
const nativeToken=()=>localStorage.getItem('m4l_account_token')||'';
const jsonResponse=(value,status=200)=>Response.json(value,{status});
async function nativeFetch(path,body,token=nativeToken(),conditions={}){
 const url=new URL(path,hosting.academyApiOrigin);
 if(url.origin!==hosting.academyApiOrigin||!url.pathname.startsWith('/api/'))throw Error('Invalid Academy connection.');
 const read=path==='/api/academy/hub/read';if(read)url.searchParams.set('request',JSON.stringify(body));
 return fetch(url.href,{method:read?'GET':'POST',credentials:'omit',cache:'no-store',headers:{...(read?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...(conditions['If-None-Match']?{'If-None-Match':conditions['If-None-Match']}:{})},...(read?{}:{body:JSON.stringify(body)})});
}
async function portalFetch(path,init){
 if(path==='/api/config')return jsonResponse({academyOrigin:location.origin,studioOrigin:hosting.studioOrigin,hifzOrigin:hosting.hifzOrigin,nativePortal:true,authorityMode:'ACADEMY'});
 if(path.startsWith('/api/public/'))return fetch(path,{...init,credentials:'omit'});
 let body=init.body?JSON.parse(init.body):{},endpoint='/api/academy/hub/read',payload,project=null;
 const url=new URL(path,location.origin),query=Object.fromEntries(url.searchParams),token=nativeToken();
 if(path==='/auth/native-login'){
  const response=await nativeFetch('/api/academy/hub/login',body,token);
  if(!response.ok)return response;
  const result=await response.json();
  if(!result.token||nativeToken()!==token){if(result.token)await nativeFetch('/api/account/logout',{},result.token).catch(()=>{});throw new DOMException('Your account changed.','AbortError');}
  // Revoke the previous account only after the replacement is fully checked.
  if(token&&token!==result.token)await nativeFetch('/api/account/logout',{},token).catch(()=>{});
  if(nativeToken()!==token){await nativeFetch('/api/account/logout',{},result.token).catch(()=>{});throw new DOMException('Your account changed.','AbortError');}
  sessionStorage.removeItem('academy-studio-link-v1');
  localStorage.setItem('m4l_account_token',result.token);
  sessionStorage.setItem('m4l_academy_signed_in',result.account.uniqueid);
  return jsonResponse({signedIn:true});
 }
 if(path==='/auth/logout'){
  const response=await nativeFetch('/api/account/logout',{},token);
  if(response.ok&&nativeToken()===token){localStorage.removeItem('m4l_account_token');for(const key of ['m4l_account_context','m4l_account_contexts','m4l_account_workspace','maktab_token','maktab_user_type'])localStorage.removeItem(key);sessionStorage.removeItem('m4l_academy_signed_in');sessionStorage.removeItem('academy-studio-link-v1');}
  return response;
 }
 if(path==='/auth/access'||path==='/auth/refresh'){endpoint='/api/academy/hub/refresh';payload={};}
 else if(path==='/auth/academy'){endpoint='/api/academy/hub/legacy-open';payload=body;}
 else if(path==='/auth/native-open'){endpoint='/api/academy/hub/open';payload=body;}
 else if(path==='/api/circles/lesson-join'){endpoint='/api/academy/hub/join';payload=body;}
 else if(/^\/api\/offerings\/[-A-Za-z0-9_:]+\/join$/.test(url.pathname)){endpoint='/api/academy/hub/studio-join';payload={offeringId:decodeURIComponent(url.pathname.split('/')[3]),sessionId:body.sessionId};}
 else if(url.pathname==='/api/circles/bootstrap')payload={kind:'bootstrap',input:query};
 else if(url.pathname==='/api/me'){payload={kind:'bootstrap',input:{}};project=value=>value.account;}
 else if(url.pathname==='/api/circles/dashboard')payload={kind:'dashboard',input:{...query,...body,...(query.refresh?{refresh:query.refresh==='1'}:{})}};
 else if(url.pathname==='/api/circles/navigation')payload={kind:'navigation',input:{}};
 else if(url.pathname==='/api/circles/access')payload={kind:'access',input:{websiteIds:url.searchParams.getAll('website')}};
 else throw Error('This action belongs in Studio. Open its current workspace.');
 if(!token){clearPrivateReads();return jsonResponse({error:'Sign in to Academy to continue.',code:'SIGN_IN_REQUIRED'},401);}
 const response=await nativeFetch(endpoint,payload,token,init.headers);
 if(nativeToken()!==token)throw new DOMException('Your account changed.','AbortError');
 if(!project||!response.ok)return response;
 return jsonResponse(project(await response.json()));
}
window.addEventListener('storage',event=>{
 if(event.key==='m4l_account_token'||event.key===null){changed(null);window.dispatchEvent(new CustomEvent('website-session-ended',{detail:{externalAccountChange:true}}));}
});

window.addEventListener('website-account-changed',event=>{
 if(!event.detail?.accountId)return;
 const wanted=new URL(location.href).searchParams.get('studioResume');if(!wanted)return;
 let pending;try{pending=JSON.parse(sessionStorage.getItem('academy-studio-resume-v1'));}catch{return;}
 sessionStorage.removeItem('academy-studio-resume-v1');
 if(pending?.state!==wanted||Date.now()<pending.createdAt||Date.now()-pending.createdAt>60000)return;
 const url=new URL('/academy/studio-authorize/',location.origin);url.search=new URLSearchParams({state:pending.state,challenge:pending.challenge});location.replace(url);
});
