// This file precedes the unchanged shared API client in the Academy portal build.
// Selected V2 uses only the host cookies through the shared browser coordinator.
// The original native transport remains for non-V2 releases.
const academyV2Mode=()=>location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name="uaa-auth-version"]')?.content==='2'&&document.querySelector('meta[name="uaa-app"]')?.content==='academy';
const academyV2=async()=>{if(!globalThis.M4L_ACADEMY_AUTH?.selected)throw Object.assign(Error('The Academy session connection is unavailable.'),{status:503,code:'V2_CLIENT_UNAVAILABLE'});return globalThis.M4L_ACADEMY_AUTH.ready;};
const hosting=Object.freeze(globalThis.AcademyHosting);
const nativeToken=()=>academyV2Mode()?'':localStorage.getItem('m4l_account_token')||'';
const jsonResponse=(value,status=200)=>Response.json(value,{status});
async function nativeFetch(path,body,token=nativeToken(),conditions={}){
 if(academyV2Mode()){const auth=await academyV2(),url=new URL(path,location.origin),read=path==='/api/academy/hub/read';if(read)url.searchParams.set('request',JSON.stringify(body));return auth.protectedFetch(url.pathname+url.search,{method:read?'GET':'POST',cache:'no-store',headers:read?{}:{'Content-Type':'application/json'},...(read?{}:{body:JSON.stringify(body)})});}
 const url=new URL(path,hosting.academyApiOrigin);
 if(url.origin!==hosting.academyApiOrigin||!url.pathname.startsWith('/api/'))throw Error('Invalid Academy connection.');
 const read=path==='/api/academy/hub/read';if(read)url.searchParams.set('request',JSON.stringify(body));
 return fetch(url.href,{method:read?'GET':'POST',credentials:'omit',cache:'no-store',headers:{...(read?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...(conditions['If-None-Match']?{'If-None-Match':conditions['If-None-Match']}:{})},...(read?{}:{body:JSON.stringify(body)})});
}
async function portalFetch(path,init){
 if(path==='/api/config')return jsonResponse({...academyV2Mode()?{authVersion:2,app:'academy'}:{},academyOrigin:location.origin,studioOrigin:hosting.studioOrigin,hifzOrigin:hosting.hifzOrigin,nativePortal:true,authorityMode:'ACADEMY'});
 if(path.startsWith('/api/public/'))return fetch(path,{...init,credentials:'omit'});
 if(academyV2Mode()&&path.startsWith('/auth/')){const auth=await academyV2(),input=init.body?JSON.parse(init.body):{};if(path==='/auth/native-login'){await auth.submitPin(input);return jsonResponse({signedIn:true});}if(path==='/auth/logout')return jsonResponse(await auth.logout());if(path==='/auth/access'||path==='/auth/refresh')return jsonResponse(await auth.refresh({activeWork:document.visibilityState!=='hidden'}));if(path==='/auth/academy')throw Object.assign(Error('Open the current application sign-in journey.'),{status:409,code:'V1_CONNECTOR_RETIRED'});}
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
 if(!token&&!academyV2Mode()){clearPrivateReads();return jsonResponse({error:'Sign in to Academy to continue.',code:'SIGN_IN_REQUIRED'},401);}
 const response=await nativeFetch(endpoint,payload,token,init.headers);
 if(!academyV2Mode()&&nativeToken()!==token)throw new DOMException('Your account changed.','AbortError');
 if(!project||!response.ok)return response;
 return jsonResponse(project(await response.json()));
}
window.addEventListener('storage',event=>{
 if(!academyV2Mode()&&(event.key==='m4l_account_token'||event.key===null)){changed(null);window.dispatchEvent(new CustomEvent('website-session-ended',{detail:{externalAccountChange:true}}));}
});

window.addEventListener('website-account-changed',event=>{
 if(academyV2Mode()||!event.detail?.accountId)return;
 const wanted=new URL(location.href).searchParams.get('studioResume');if(!wanted)return;
 let pending;try{pending=JSON.parse(sessionStorage.getItem('academy-studio-resume-v1'));}catch{return;}
 sessionStorage.removeItem('academy-studio-resume-v1');
 if(pending?.state!==wanted||Date.now()<pending.createdAt||Date.now()-pending.createdAt>60000)return;
 const url=new URL('/academy/studio-authorize/',location.origin);url.search=new URLSearchParams({state:pending.state,challenge:pending.challenge});location.replace(url);
});

// V2 bypasses the legacy display persistence and automatic replay paths entirely.
async function v2PortalAPI(path,options={}){
 const auth=await academyV2(),isMe=path==='/api/me',target=isMe?'/api/circles/bootstrap':path;
 const {body,method=body===undefined?'GET':'POST',headers={},blob=false}=options;
 const response=await portalFetch(target,{method,cache:'no-store',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(response.status===304)throw Object.assign(Error('Reload this view to obtain a current checked response.'),{status:409,code:'UNCHECKED_DISPLAY_REUSE'});
 const value=blob&&response.ok?await response.blob():await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'This action is unavailable.'),{status:response.status,code:value.code});
 if((path.startsWith('/api/')&&!path.startsWith('/api/public/')&&path!=='/api/config')||path==='/auth/native-open')auth.trackResult(value,response);
 return isMe?value.account:value;
}
